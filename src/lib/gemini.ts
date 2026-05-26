import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { fingerprintQuestion } from '@/lib/questionParser';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizFormat = 'mcq' | 'mixed' | 'fill_blank' | 'descriptive';

export type GenerateQuizOptions = {
  chunkText?: string;
  questionCount: number;
  format: QuizFormat;
  difficulty: Difficulty;
  category?: string;
  creativity: number;
  chunkIndex?: number;
  totalChunks?: number;
  title?: string;
  educationalLevel?: string;
  conceptHints?: string[];
  evidenceHints?: string[];
  excludeStems?: string[];
};

const MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const FORMAT_SCHEMA: Record<QuizFormat, string> = {
  mcq: `{"question_type":"mcq","question_text":"Specific question ending with ?","options":["A plausible option","The verified answer","Another plausible option","A final plausible option"],"correct_index":1,"correct_answer":"The verified answer","source_evidence":"Exact source sentence that proves the answer","learning_objective":"Short concept tested","time_limit":30}`,
  mixed: `{"question_type":"mcq | fill_blank | descriptive","question_text":"Specific question ending with ?","options":["Only for mcq: exactly 4 options"],"correct_index":0,"correct_answer":"Verified answer from source","source_evidence":"Exact source sentence that proves the answer","learning_objective":"Short concept tested","time_limit":30}`,
  fill_blank: `{"question_type":"fill_blank","question_text":"Source-based sentence with ______ blank?","options":[],"correct_answer":"Verified missing term","source_evidence":"Exact source sentence containing the answer","learning_objective":"Short concept tested","time_limit":25}`,
  descriptive: `{"question_type":"descriptive","question_text":"Open question?","options":[],"correct_answer":"Concise model answer supported by source","source_evidence":"Exact source sentence or paragraph supporting the answer","learning_objective":"Short concept tested","time_limit":60}`,
};

const BATCH_SIZE = 6;
let geminiQuotaExhausted = false;

function getClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function resetGeminiQuotaFlag(): void {
  geminiQuotaExhausted = false;
}

export function isGeminiQuotaExhausted(): boolean {
  return geminiQuotaExhausted;
}

export function isGeminiQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('quota') ||
    msg.includes('RESOURCE_EXHAUSTED')
  );
}

export function geminiQuotaUserMessage(): string {
  return (
    'Gemini API quota exceeded. Wait a minute, reduce the question count, or update GEMINI_API_KEY in .env.local and restart the dev server.'
  );
}

export function getGeminiModel(creativity = 0.2): GenerativeModel | null {
  const client = getClient();
  if (!client) return null;
  return client.getGenerativeModel({
    model: MODEL_CANDIDATES[0],
    generationConfig: {
      temperature: factualTemperature(creativity),
      topP: 0.82,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });
}

export function parseJsonArray(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const candidates = [
    trimmed,
    withoutFence,
    repairJson(withoutFence),
    extractJsonObject(withoutFence),
    extractJsonArray(withoutFence),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.questions)) return obj.questions as Record<string, unknown>[];
        if (Array.isArray(obj.quiz)) return obj.quiz as Record<string, unknown>[];
      }
    } catch {
      // Try the next recovery candidate.
    }
  }

  return [];
}

export async function generateQuestionsFromChunk(
  opts: GenerateQuizOptions,
  maxRetries = 2
): Promise<Record<string, unknown>[]> {
  if (!opts.chunkText || !getClient() || geminiQuotaExhausted) return [];

  let collected: Record<string, unknown>[] = [];
  let attempt = 0;
  const target = opts.questionCount;

  while (collected.length < target && attempt <= maxRetries && !geminiQuotaExhausted) {
    const needed = Math.min(BATCH_SIZE, target - collected.length);
    const batchOpts: GenerateQuizOptions = {
      ...opts,
      questionCount: needed,
      excludeStems: [
        ...(opts.excludeStems || []),
        ...collected.map((q) => String(q.question_text || q.question || '')),
      ],
    };

    const result = await tryModelsForPrompt(buildPrompt(batchOpts), batchOpts.creativity);
    collected = dedupeQuestions([...collected, ...result]);
    attempt += 1;

    if (result.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 250));
    }
  }

  return collected.slice(0, target);
}

export function buildQuizGenerationPrompt(opts: GenerateQuizOptions): string {
  return buildPrompt(opts);
}

export type McqToVerify = {
  question_text: string;
  options: string[];
  correct_answer: string;
};

/** Optional model-based regrade. Local source validation remains mandatory in questionValidator. */
export async function verifyMcqAnswers(
  questions: McqToVerify[],
  ctx: { sourceText?: string }
): Promise<McqToVerify[]> {
  if (!getClient() || questions.length === 0 || !ctx.sourceText || ctx.sourceText.length < 120) {
    return questions;
  }

  const prompt = `You are verifying quiz answer keys against source text.

Rules:
- Use ONLY the source text.
- If exactly one option is explicitly supported, return that option index with confidence "high".
- If source support is weak or ambiguous, keep current_index and confidence "low".
- JSON only: {"answers":[{"i":0,"correct_index":2,"confidence":"high","evidence":"exact supporting source sentence"}]}

SOURCE TEXT:
---
${ctx.sourceText.substring(0, 30000)}
---

QUESTIONS:
${JSON.stringify(
  questions.map((q, i) => ({
    i,
    question: q.question_text,
    options: q.options,
    current_index: q.options.indexOf(q.correct_answer),
  })),
  null,
  2
)}`;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = getClient()!.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0,
          topP: 0.75,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent([{ text: prompt }]);
      const parsed = JSON.parse(repairJson(result.response.text())) as {
        answers?: Array<{ i?: number; correct_index?: number; confidence?: string }>;
      };
      const out = [...questions];
      for (const answer of parsed.answers || []) {
        const i = answer.i ?? -1;
        const correctIndex = answer.correct_index ?? -1;
        if (
          answer.confidence?.toLowerCase() === 'high' &&
          i >= 0 &&
          i < out.length &&
          correctIndex >= 0 &&
          correctIndex <= 3 &&
          out[i].options[correctIndex]
        ) {
          out[i] = { ...out[i], correct_answer: out[i].options[correctIndex] };
        }
      }
      return out;
    } catch (err) {
      if (isGeminiQuotaError(err)) {
        geminiQuotaExhausted = true;
        return questions;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('not found')) {
        console.warn(`[Gemini verify] ${modelName}: ${msg}`);
      }
    }
  }

  return questions;
}

export function shouldVerifyMcqAnswers(): boolean {
  return process.env.GEMINI_VERIFY_MCQ === 'true';
}

function buildPrompt(opts: GenerateQuizOptions): string {
  const bloomsGuide = {
    easy: 'Remember + Understand: recall facts, define terms, identify examples, list steps directly stated in source.',
    medium: 'Apply + Analyze: compare concepts, explain cause-effect, classify, distinguish between related ideas from source.',
    hard: 'Evaluate + Synthesize: assess claims, predict outcomes, critique statements — all provable from explicit source evidence.',
  }[opts.difficulty];

  const excludeBlock =
    opts.excludeStems && opts.excludeStems.length > 0
      ? `\nDo not repeat or rephrase these existing questions:\n${opts.excludeStems
          .slice(0, 20)
          .map((stem) => `- ${stem}`)
          .join('\n')}\n`
      : '';

  const formatRules =
    opts.format === 'mixed'
      ? 'Use a useful mix, but at least 70% should be MCQ for live play. MCQs must have exactly 4 options.'
      : `Generate only ${opts.format} questions.`;
  const concepts =
    opts.conceptHints && opts.conceptHints.length > 0
      ? `\nKey concepts detected from this chunk:\n${opts.conceptHints
          .slice(0, 14)
          .map((concept) => `- ${concept}`)
          .join('\n')}`
      : '';
  const evidence =
    opts.evidenceHints && opts.evidenceHints.length > 0
      ? `\nHigh-quality source statements to prioritize:\n${opts.evidenceHints
          .slice(0, 10)
          .map((sentence) => `- ${sentence}`)
          .join('\n')}`
      : '';

  return `You are a senior classroom assessment designer creating questions for a realtime esports quiz arena.

Create exactly ${opts.questionCount} high-quality questions from the provided source chunk.

Document title: ${opts.title || 'Untitled'}
Chunk: ${opts.chunkIndex ?? 1} of ${opts.totalChunks ?? 1}
Difficulty: ${opts.difficulty} — Bloom's level: ${bloomsGuide}
${opts.category ? `Topic focus: ${opts.category}` : ''}
${opts.educationalLevel ? `Educational level: ${opts.educationalLevel}` : ''}
Creativity: ${Math.round(opts.creativity * 100)}% (stay factual)
${formatRules}
${concepts}
${evidence}
${excludeBlock}
=== QUESTION STYLE EXAMPLES (follow this style exactly) ===
Example 1 (definition): "What is the primary function of mitochondria?" → "Produce ATP through cellular respiration"
Example 2 (cause-effect): "What happens to blood pressure when arteries narrow?" → "It increases due to reduced vessel diameter"
Example 3 (comparison): "Which best distinguishes arteries from veins?" → "Arteries carry blood away from the heart under high pressure"
Example 4 (application): "A solution has a pH of 3. What does this indicate?" → "It is strongly acidic"
Example 5 (sequence): "Which step occurs FIRST during DNA replication?" → "Helicase unwinds the double helix"
Example 6 (identification): "Which of the following is NOT a product of photosynthesis?" → "Carbon dioxide"
=== END EXAMPLES ===

=== DISTRACTOR QUALITY RULES ===
- Distractors must be the same type/category as the correct answer (if answer is a process, distractors are processes; if a number, distractors are numbers)
- Distractors must represent plausible misconceptions or related-but-wrong concepts a student might believe
- Distractors must NEVER be trivially wrong, silly, or completely unrelated to the subject
- NEVER use: "None of the above", "All of the above", "Not stated in the text", "Cannot be determined"
- Each distractor should look credible to someone who hasn't fully learned the material
=== END DISTRACTOR RULES ===

Hard requirements:
1. NEVER invent facts. If the source chunk does not explicitly support a fact, do not use it.
2. Use ONLY the source chunk. Absolutely no outside knowledge.
3. Never mention PDF, document, passage, source chunk, OCR, or "according to".
4. Do not create questions from fragments, page numbers, answer keys, or broken OCR text.
5. Every item must include source_evidence copied exactly from the source chunk.
6. correct_answer must be directly proved by source_evidence.
7. MCQ items: exactly 4 unique plausible options, one correct answer.
8. correct_index must match correct_answer character-for-character.
9. No duplicated stems or duplicated answer concepts across the batch.
10. If the source cannot support a question, return fewer — never fabricate.
11. Preferred styles: definition, function/purpose, cause-effect, comparison, sequence, application, identification.
12. Avoid vague stems: "What is important about X?", "What role does X play?", "What can be said about X?"

Return ONLY valid JSON in this exact shape:
{"questions":[${FORMAT_SCHEMA[opts.format]}, ...]}

SOURCE CHUNK:
---
${(opts.chunkText || '').substring(0, 14000)}
---`;
}

function factualTemperature(creativity: number): number {
  if (creativity < 0.1) return 0.02; // near-zero for maximum factual grounding
  const capped = Math.min(Math.max(creativity, 0), 0.35);
  return 0.05 + capped * 0.14;
}

async function tryModelsForPrompt(
  prompt: string,
  creativity: number
): Promise<Record<string, unknown>[]> {
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const questions = await generateWithModel(modelName, prompt, creativity);
      if (questions.length > 0) return questions;
    } catch (err) {
      if (isGeminiQuotaError(err)) {
        geminiQuotaExhausted = true;
        console.warn('[Gemini] quota exhausted; stopping generation for this request');
        return [];
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('404') && !msg.includes('not found')) {
        console.warn(`[Gemini] ${modelName}: ${msg}`);
      }
    }
  }
  return [];
}

async function generateWithModel(
  modelName: string,
  prompt: string,
  creativity: number
): Promise<Record<string, unknown>[]> {
  const client = getClient();
  if (!client) return [];
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: factualTemperature(creativity),
      topP: 0.82,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent([{ text: prompt }]);
  return parseJsonArray(result.response.text());
}

function dedupeQuestions(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const item of items) {
    const stem = String(item.question_text || item.question || '').trim();
    if (!stem) continue;
    const fp = fingerprintQuestion(stem);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}

function repairJson(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u001F]+/g, ' ');
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return repairJson(text.slice(start, end + 1));
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return repairJson(text.slice(start, end + 1));
}
