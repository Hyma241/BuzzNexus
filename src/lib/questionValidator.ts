import { isOcrFragment } from '@/lib/pdfCleaner';
import { parseQuestionOptions } from '@/lib/parseQuestionOptions';
import { fingerprintQuestion } from '@/lib/questionParser';
import { isMalformedSentence, sentenceSimilarity } from '@/lib/concepts';
import type { QuizFormat } from '@/lib/gemini';

export type QuizQuestionType = 'mcq' | 'fill_blank' | 'descriptive';

export type QuizQuestion = {
  question_type: QuizQuestionType;
  question_text: string;
  options: string[];
  correct_answer: string;
  time_limit?: number;
  metadata?: Record<string, unknown>;
};

export type AnswerSupport = {
  supported: boolean;
  confidence: number;
  evidence?: string;
  reason?: string;
};

type ValidationContext = {
  sourceText?: string;
  seenFingerprints: Set<string>;
  seenQuestions?: string[];
  requireSourceSupport?: boolean;
};

const BANNED_PATTERNS: RegExp[] = [
  /based on (the )?(document|pdf|passage|text)/i,
  /according to (the )?(passage|text|document|pdf)/i,
  /what role does .* play in:/i,
  /\[\s*correct\s*\]/i,
  /\(\s*correct\s*\)/i,
  /key concept in this context/i,
  /historical artifact only/i,
  /^what role does\s+[^?]{1,24}\s+play\??$/i,
  /what is important about/i,
  /which of the following is true about/i,
  /what can be said about/i,
];

const PLACEHOLDER_OPTION_RE = /^(?:option\s+[a-d]|none of the above|all of the above|this is not stated|the opposite idea)$/i;
const OPTION_PREFIX_RE = /^[A-Da-d][\.\)\:\-]\s*/;

export function normalizeQuestion(
  raw: Record<string, unknown>,
  requestedFormat: QuizFormat,
  defaultTimeLimit: number
): QuizQuestion | null {
  const questionText = cleanQuestionText(String(raw.question_text || raw.question || ''));
  if (!questionText) return null;

  const inferredType = normalizeQuestionType(raw.question_type, requestedFormat);
  let options = parseQuestionOptions(raw.options);

  if (options.length === 0 && Array.isArray(raw.choices)) {
    options = parseQuestionOptions(raw.choices);
  }

  if (options.length === 0 && raw.option_a) {
    options = ['option_a', 'option_b', 'option_c', 'option_d']
      .map((key) => String(raw[key] ?? '').trim())
      .filter(Boolean);
  }

  options = dedupeOptions(options.map(cleanOptionText).filter(Boolean));

  let correctAnswer = cleanOptionText(
    String(raw.correct_answer || raw.answer || raw.correct || '')
  );
  const correctIndex = parseCorrectIndex(raw.correct_index);
  if (correctIndex !== null && options[correctIndex]) {
    correctAnswer = options[correctIndex];
  }

  const metadata = {
    ...((raw.metadata as Record<string, unknown>) || {}),
    ...(typeof raw.source_evidence === 'string'
      ? { source_evidence: raw.source_evidence.trim() }
      : {}),
    ...(typeof raw.learning_objective === 'string'
      ? { learning_objective: raw.learning_objective.trim() }
      : {}),
    ...(correctIndex !== null ? { correct_index: correctIndex } : {}),
  };

  return {
    question_type: inferredType,
    question_text: questionText,
    options,
    correct_answer: correctAnswer,
    time_limit:
      typeof raw.time_limit === 'number'
        ? Math.max(10, Math.min(180, Math.floor(raw.time_limit)))
        : defaultTimeLimit,
    metadata,
  };
}

export function validateQuestion(
  q: QuizQuestion,
  seenOrContext: Set<string> | ValidationContext,
  sourceText?: string
): string[] {
  const context =
    seenOrContext instanceof Set
      ? { seenFingerprints: seenOrContext, sourceText }
      : seenOrContext;
  const issues: string[] = [];
  const text = q.question_text.trim();

  if (text.length < 18) issues.push('too_short');
  if (text.length > 280) issues.push('too_long');
  if (!text.endsWith('?')) issues.push('not_question');
  if (BANNED_PATTERNS.some((re) => re.test(text))) issues.push('banned_pattern');
  if (isOcrFragment(text)) issues.push('ocr_garbage');
  if (isMalformedSentence(text.replace(/\?$/, '.'))) issues.push('malformed_sentence');
  if (!hasReadableGrammar(text)) issues.push('broken_grammar');

  const fingerprint = fingerprintQuestion(text);
  if (fingerprint.length < 8) issues.push('weak_question');
  if (context.seenFingerprints.has(fingerprint)) issues.push('duplicate_question');
  else context.seenFingerprints.add(fingerprint);
  if ((context.seenQuestions || []).some((seen) => sentenceSimilarity(seen, text) >= 0.72)) {
    issues.push('semantic_duplicate');
  } else {
    context.seenQuestions?.push(text);
  }

  if (!q.correct_answer?.trim()) issues.push('missing_correct');
  if (q.correct_answer && isOcrFragment(q.correct_answer)) issues.push('ocr_answer');

  if (q.question_type === 'mcq') {
    issues.push(...validateMcq(q));
  } else if (q.options.length > 0) {
    issues.push('unexpected_options');
  }

  if (context.sourceText && (context.requireSourceSupport ?? true)) {
    const support = verifyAnswerSupport(q, context.sourceText);
    q.metadata = {
      ...(q.metadata || {}),
      answer_confidence: support.confidence,
      source_evidence: support.evidence || q.metadata?.source_evidence,
    };
    if (!support.supported) issues.push(`unsupported_answer:${support.reason || 'low_confidence'}`);
  }

  return issues;
}

export function filterValidQuestions(
  questions: QuizQuestion[],
  maxCount: number,
  sourceText?: string
): QuizQuestion[] {
  const seenFingerprints = new Set<string>();
  const seenQuestions: string[] = [];
  const valid: QuizQuestion[] = [];

  for (const question of questions) {
    const issues = validateQuestion(question, {
      seenFingerprints,
      seenQuestions,
      sourceText,
      requireSourceSupport: Boolean(sourceText),
    });
    if (issues.length === 0) {
      valid.push(question);
      if (valid.length >= maxCount) break;
    }
  }

  return valid;
}

export function verifyAnswerSupport(q: QuizQuestion, sourceText: string): AnswerSupport {
  const source = normalizeForSearch(sourceText);
  const answer = normalizeForSearch(q.correct_answer);
  const evidenceRaw =
    typeof q.metadata?.source_evidence === 'string'
      ? q.metadata.source_evidence.trim()
      : '';
  const evidence = normalizeForSearch(evidenceRaw);

  if (source.length < 80) {
    return { supported: false, confidence: 0, reason: 'source_too_short' };
  }

  // Acronyms and measurements are always considered valid answers
  const rawAnswer = q.correct_answer?.trim() || '';
  const isAcronym = /^[A-Z]{1,6}(\s[A-Z0-9]{1,6})*$/.test(rawAnswer);
  const isMeasurement = /^\d{1,4}(,\d{3})*(\.\d+)?(\s?(%|km|mg|ml|kg|°C|°F|m|cm|s|g|L))?$/.test(rawAnswer);
  if ((isAcronym || isMeasurement) && source.includes(rawAnswer.toLowerCase())) {
    return { supported: true, confidence: 0.8, evidence: evidenceRaw || rawAnswer };
  }

  const answerTokens = importantTokens(answer);
  if (answerTokens.length === 0) {
    return { supported: false, confidence: 0, reason: 'weak_answer' };
  }

  const answerExact = answer.length >= 4 && source.includes(answer);
  const evidenceExact = evidence.length >= 24 && source.includes(evidence);
  const evidenceTokenOverlap =
    evidence.length > 0 ? tokenOverlap(importantTokens(evidence), importantTokens(source)) : 0;
  const answerTokenOverlap = tokenOverlap(answerTokens, importantTokens(source));
  const evidenceSupportsAnswer =
    evidence.length > 0 && tokenOverlap(answerTokens, importantTokens(evidence)) >= 0.5;

  let confidence = 0;
  if (answerExact) confidence += 0.42;
  if (evidenceExact) confidence += 0.4;
  else if (evidenceTokenOverlap >= 0.65) confidence += 0.24;
  if (evidenceSupportsAnswer) confidence += 0.18;
  if (answerTokenOverlap >= 0.8) confidence += 0.14;

  confidence = Math.min(1, Number(confidence.toFixed(2)));

  // Tuned threshold: 0.42 gives better recall on paraphrase-heavy academic text
  // while still rejecting truly unsupported answers
  if (confidence >= 0.42) {
    return {
      supported: true,
      confidence,
      evidence: evidenceRaw || findEvidenceSentence(sourceText, q.correct_answer, q.question_text),
    };
  }

  return {
    supported: false,
    confidence,
    evidence: evidenceRaw,
    reason: answerExact ? 'evidence_missing' : 'answer_not_in_source',
  };
}

function validateMcq(q: QuizQuestion): string[] {
  const issues: string[] = [];
  const options = q.options.map(cleanOptionText).filter(Boolean);
  const unique = new Set(options.map(normalizeOption));
  const correctMatches = options.filter(
    (option) => normalizeOption(option) === normalizeOption(q.correct_answer)
  );

  if (options.length !== 4) issues.push('invalid_mcq_option_count');
  if (unique.size !== options.length) issues.push('duplicate_options');
  if (correctMatches.length !== 1) issues.push('missing_or_ambiguous_correct');

  for (const option of options) {
    if (option.length < 2 || option.length > 180) issues.push('bad_option_length');
    if (PLACEHOLDER_OPTION_RE.test(option)) issues.push('placeholder_option');
    if (isOcrFragment(option)) issues.push('ocr_option');
  }

  // Distractor quality check — only 'trivial_distractors' causes rejection
  const distractorIssues = verifyDistractorQuality(options, q.correct_answer);
  if (distractorIssues.includes('trivial_distractors')) issues.push('placeholder_option');

  return [...new Set(issues)];
}

function normalizeQuestionType(type: unknown, requestedFormat: QuizFormat): QuizQuestionType {
  const raw = String(type || '').toLowerCase();
  if (raw === 'fill_blank' || raw === 'descriptive' || raw === 'mcq') return raw;
  if (requestedFormat === 'fill_blank' || requestedFormat === 'descriptive') return requestedFormat;
  return 'mcq';
}

function cleanQuestionText(text: string): string {
  const cleaned = text
    .replace(/\[\s*correct\s*\]|\(\s*correct\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.endsWith('?') ? cleaned : `${cleaned.replace(/[.:;]+$/, '')}?`;
}

function cleanOptionText(text: string): string {
  return text
    .replace(/\[\s*correct\s*\]|\(\s*correct\s*\)/gi, '')
    .replace(OPTION_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of options) {
    const key = normalizeOption(option);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

function parseCorrectIndex(value: unknown): number | null {
  if (typeof value === 'number' && value >= 0 && value <= 3) return Math.floor(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (/^[0-3]$/.test(trimmed)) return Number(trimmed);
  if (/^[1-4]$/.test(trimmed)) return Number(trimmed) - 1;
  if (/^[A-D]$/.test(trimmed)) return trimmed.charCodeAt(0) - 65;
  return null;
}



function verifyDistractorQuality(options: string[], correct: string): string[] {
  const issues: string[] = [];
  const normalizedCorrect = normalizeOption(correct);
  const correctLen = normalizedCorrect.replace(/\s+/g, '').length;

  for (const opt of options) {
    const normalized = normalizeOption(opt);
    const distractorLen = normalized.replace(/\s+/g, '').length;
    if (Math.abs(correctLen - distractorLen) / Math.max(correctLen, distractorLen) > 0.6) {
      issues.push('trivial_distractors');
    }
  }
  return issues;
}

function normalizeOption(text: string): string {
  return normalizeForSearch(cleanOptionText(text));
}

function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function importantTokens(text: string): string[] {
  return normalizeForSearch(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  return a.filter((token) => bSet.has(token)).length / a.length;
}

function hasReadableGrammar(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const alphaWords = words.filter((word) => /\p{L}/u.test(word));
  if (alphaWords.length / words.length < 0.65) return false;
  if (/\b(?:does|is|are|was|were|can|did)\s+\?$/i.test(text)) return false;
  return true;
}

function findEvidenceSentence(sourceText: string, answer: string, question: string): string {
  const normalizedAnswer = normalizeForSearch(answer);
  const questionTokens = importantTokens(question);
  const sentences = sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 25 && sentence.length <= 400);

  const scored = sentences.map((sentence) => {
    const normalized = normalizeForSearch(sentence);
    const score =
      (normalizedAnswer && normalized.includes(normalizedAnswer) ? 3 : 0) +
      tokenOverlap(questionTokens, importantTokens(sentence));
    return { sentence, score };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.sentence || '';
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'does',
  'from',
  'have',
  'into',
  'only',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'through',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);
