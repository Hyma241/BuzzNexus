import { semanticChunkText } from '@/lib/chunking';
import type { QuizQuestion } from '@/lib/questionValidator';
import type { Difficulty, QuizFormat } from '@/lib/gemini';

const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'because',
  'before',
  'between',
  'could',
  'does',
  'from',
  'have',
  'into',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'through',
  'what',
  'which',
  'with',
]);

function sentencePool(text: string): string[] {
  const chunks = semanticChunkText(text, { maxChars: 5000, minChars: 500 });
  const pool = chunks.flatMap((chunk) =>
    chunk.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => {
        const words = sentence.split(/\s+/).filter(Boolean);
        return sentence.length >= 45 && sentence.length <= 240 && words.length >= 7;
      })
  );

  const seen = new Set<string>();
  return pool.filter((sentence) => {
    const key = sentence.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 90);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractTerms(sentence: string): string[] {
  const candidates = sentence
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word.toLowerCase()))
    .filter((word) => !/^\d+$/.test(word));

  const phrases: string[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    phrases.push(candidates[i]);
    if (candidates[i + 1]) phrases.push(`${candidates[i]} ${candidates[i + 1]}`);
  }

  return [...new Set(phrases)].sort((a, b) => b.length - a.length);
}

function buildCloze(sentence: string, term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cloze = sentence.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '______');
  return `What completes this statement: "${cloze}"?`;
}

function chooseDistractors(allTerms: string[], correct: string, count: number): string[] {
  const correctKey = correct.toLowerCase();
  const out: string[] = [];
  for (const term of allTerms) {
    const key = term.toLowerCase();
    if (key === correctKey || key.includes(correctKey) || correctKey.includes(key)) continue;
    if (out.some((existing) => existing.toLowerCase() === key)) continue;
    out.push(term);
    if (out.length >= count) break;
  }
  return out;
}

function rotateOptions(options: string[], seed: number): string[] {
  const offset = seed % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}

/** Source-only fallback for low quota or partial extraction. It never invents answers. */
export function generateFallbackQuestions(
  text: string,
  count: number,
  format: QuizFormat,
  difficulty: Difficulty,
  timeLimit: number
): QuizQuestion[] {
  const sentences = sentencePool(text);
  const allTerms = [...new Set(sentences.flatMap(extractTerms))];
  const questions: QuizQuestion[] = [];
  const usedAnswers = new Set<string>();

  for (let i = 0; i < sentences.length && questions.length < count; i += 1) {
    const sentence = sentences[i];
    const term = extractTerms(sentence).find((candidate) => !usedAnswers.has(candidate.toLowerCase()));
    if (!term) continue;
    usedAnswers.add(term.toLowerCase());

    const effectiveFormat: QuizFormat = format === 'mixed' ? (i % 4 === 0 ? 'fill_blank' : 'mcq') : format;

    if (effectiveFormat === 'fill_blank') {
      questions.push({
        question_type: 'fill_blank',
        question_text: buildCloze(sentence, term),
        options: [],
        correct_answer: term,
        time_limit: timeLimit,
        metadata: {
          source: 'source_fallback',
          source_evidence: sentence,
          answer_confidence: 0.72,
          difficulty,
        },
      });
      continue;
    }

    if (effectiveFormat === 'descriptive') {
      questions.push({
        question_type: 'descriptive',
        question_text:
          difficulty === 'hard'
            ? `How does this idea connect to the lesson concept: "${sentence}"?`
            : `What is the key idea in this statement: "${sentence}"?`,
        options: [],
        correct_answer: sentence,
        time_limit: Math.max(timeLimit, 45),
        metadata: {
          source: 'source_fallback',
          source_evidence: sentence,
          answer_confidence: 0.78,
          difficulty,
        },
      });
      continue;
    }

    const distractors = chooseDistractors(allTerms, term, 3);
    if (distractors.length < 3) continue;
    const options = rotateOptions([term, ...distractors], i);

    questions.push({
      question_type: 'mcq',
      question_text: buildCloze(sentence, term),
      options,
      correct_answer: term,
      time_limit: timeLimit,
      metadata: {
        source: 'source_fallback',
        correct_index: options.indexOf(term),
        source_evidence: sentence,
        answer_confidence: 0.74,
        difficulty,
      },
    });
  }

  return questions;
}

