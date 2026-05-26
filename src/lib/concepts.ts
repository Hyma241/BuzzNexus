export type EducationalConcept = {
  term: string;
  score: number;
  evidence: string;
};

export type EducationalSentence = {
  sentence: string;
  score: number;
};

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'does',
  'during',
  'every',
  'first',
  'from',
  'have',
  'into',
  'more',
  'most',
  'only',
  'other',
  'such',
  'than',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'through',
  'used',
  'using',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

export function extractEducationalSentences(text: string, limit = 18): EducationalSentence[] {
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 260)
    .filter((sentence) => sentence.split(/\s+/).length >= 8)
    .filter((sentence) => !isMalformedSentence(sentence));

  return sentences
    .map((sentence) => ({ sentence, score: scoreEducationalSentence(sentence) }))
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function extractEducationalConcepts(text: string, limit = 16): EducationalConcept[] {
  const sentences = extractEducationalSentences(text, 40);
  const scores = new Map<string, EducationalConcept>();

  for (const { sentence, score: sentenceScore } of sentences) {
    const terms = extractCandidateTerms(sentence);
    for (const term of terms) {
      const key = term.toLowerCase();
      const existing = scores.get(key);
      const score = sentenceScore + term.length / 2 + (/\s/.test(term) ? 8 : 0);
      if (!existing || score > existing.score) {
        scores.set(key, { term, score, evidence: sentence });
      }
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function sentenceSimilarity(a: string, b: string): number {
  const aTokens = importantTokens(a);
  const bTokens = importantTokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const intersection = [...aSet].filter((token) => bSet.has(token)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export function isMalformedSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/\[\s*correct\s*\]|\(\s*correct\s*\)/i.test(trimmed)) return true;
  if (/(\b\d+\b\s*){7,}/.test(trimmed)) return true;
  if (/(?:[A-Da-d][.)]\s*){3,}/.test(trimmed)) return true;
  if (/[^\p{L}\p{N}\s.,;:?!'"()\-/%]/u.test(trimmed) && trimmed.length < 80) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;
  const alphaWords = words.filter((word) => /\p{L}/u.test(word));
  if (alphaWords.length / words.length < 0.7) return true;
  const shortRatio = words.filter((word) => word.length <= 2).length / words.length;
  return shortRatio > 0.45;
}

export function importantTokens(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function extractCandidateTerms(sentence: string): string[] {
  const words = sentence
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const terms: string[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = cleanTerm(words[i]);
    if (isStrongTerm(word)) terms.push(word);

    const next = cleanTerm(words[i + 1] || '');
    if (isStrongTerm(word) && isStrongTerm(next)) {
      terms.push(`${word} ${next}`);
    }

    const third = cleanTerm(words[i + 2] || '');
    if (isStrongTerm(word) && isStrongTerm(next) && isStrongTerm(third)) {
      terms.push(`${word} ${next} ${third}`);
    }
  }

  return [...new Set(terms)].filter((term) => term.length <= 70);
}

function cleanTerm(term: string): string {
  return term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
}

function isStrongTerm(term: string): boolean {
  if (term.length < 4) return false;
  if (STOP_WORDS.has(term.toLowerCase())) return false;
  if (/^\d+$/.test(term)) return false;
  return /\p{L}/u.test(term);
}

function scoreEducationalSentence(sentence: string): number {
  let score = 0;
  if (/\b(?:is|are|means|refers to|defined as|called)\b/i.test(sentence)) score += 12;
  if (/\b(?:because|therefore|as a result|leads to|causes|prevents|allows|helps)\b/i.test(sentence)) {
    score += 10;
  }
  if (/\b(?:process|function|feature|example|advantage|difference|relationship|purpose)\b/i.test(sentence)) {
    score += 8;
  }
  if (/[A-Z][a-z]{3,}/.test(sentence)) score += 4;
  score += Math.min(12, importantTokens(sentence).length);
  return score;
}

