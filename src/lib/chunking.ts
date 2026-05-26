import { isJunkParagraph, scoreTextQuality } from '@/lib/pdfCleaner';
import { extractEducationalSentences } from '@/lib/concepts';

export type ContentChunk = {
  id: string;
  text: string;
  score: number;
  index: number;
  topic: string;
  chars: number;
};

type ChunkOptions = {
  maxChars?: number;
  minChars?: number;
  overlapParagraphs?: number;
  topicFocus?: string;
};

const DEFAULT_MAX_CHARS = 8500;
const DEFAULT_MIN_CHARS = 700;
const SENTENCE_RE = /(?<=[.!?])\s+(?=[A-Z0-9])/g;

export function semanticChunkText(text: string, options: ChunkOptions = {}): ContentChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const overlapParagraphs = options.overlapParagraphs ?? 1;
  const paragraphs = splitIntoParagraphs(text);
  const chunks: ContentChunk[] = [];
  let current: string[] = [];
  let currentTopic = options.topicFocus?.trim() || detectTopic(paragraphs[0] || '');

  const flush = () => {
    const body = current.join('\n\n').trim();
    if (!body || body.length < Math.min(300, minChars)) return;
    const topic = currentTopic || detectTopic(body);
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      text: body,
      score: scoreChunk(body, topic, options.topicFocus),
      index: chunks.length,
      topic,
      chars: body.length,
    });
  };

  for (const paragraph of paragraphs) {
    const topicCandidate = detectTopic(paragraph);
    const paragraphTopicChanged =
      topicCandidate &&
      current.length > 0 &&
      current.join('\n\n').length >= minChars &&
      topicCandidate !== currentTopic;

    if (
      current.length > 0 &&
      (current.join('\n\n').length + paragraph.length > maxChars || paragraphTopicChanged)
    ) {
      flush();
      current = current.slice(Math.max(0, current.length - overlapParagraphs));
      currentTopic = topicCandidate || currentTopic;
    }

    if (paragraph.length > maxChars) {
      const sentenceGroups = splitLongParagraph(paragraph, maxChars, minChars);
      for (const group of sentenceGroups) {
        if (current.join('\n\n').length + group.length > maxChars && current.length > 0) {
          flush();
          current = current.slice(Math.max(0, current.length - overlapParagraphs));
        }
        current.push(group);
      }
      continue;
    }

    current.push(paragraph);
    if (topicCandidate) currentTopic = topicCandidate;
  }

  flush();

  const sorted = chunks
    .filter((chunk) => chunk.text.split(/\s+/).length >= 45)
    .sort((a, b) => b.score - a.score);

  return sorted.map((chunk, index) => ({ ...chunk, index }));
}

export function allocateQuestionsAcrossChunks(
  chunks: ContentChunk[],
  totalQuestions: number
): Array<ContentChunk & { questionCount: number }> {
  if (chunks.length === 0 || totalQuestions <= 0) return [];

  const totalScore = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.score), 0);
  let remaining = totalQuestions;

  const allocated = chunks.map((chunk) => {
    const weighted = Math.max(1, Math.round((Math.max(1, chunk.score) / totalScore) * totalQuestions));
    const questionCount = Math.min(remaining, weighted);
    remaining -= questionCount;
    return { ...chunk, questionCount };
  });

  let i = 0;
  while (remaining > 0 && allocated.length > 0) {
    allocated[i % allocated.length].questionCount += 1;
    remaining -= 1;
    i += 1;
  }

  // Cap any single chunk at 40% of total to avoid over-reliance
  const cap = Math.ceil(totalQuestions * 0.4);
  for (const chunk of allocated) {
    if (chunk.questionCount > cap) chunk.questionCount = cap;
  }

  return allocated.filter((chunk) => chunk.questionCount > 0);
}

function splitIntoParagraphs(text: string): string[] {
  const rawParagraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  for (const raw of rawParagraphs) {
    if (isJunkParagraph(raw)) continue;
    if (raw.length <= DEFAULT_MAX_CHARS) {
      paragraphs.push(raw);
      continue;
    }
    paragraphs.push(...splitLongParagraph(raw, DEFAULT_MAX_CHARS, DEFAULT_MIN_CHARS));
  }

  return paragraphs;
}

function splitLongParagraph(paragraph: string, maxChars: number, minChars: number): string[] {
  const sentences = paragraph.split(SENTENCE_RE).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return [paragraph.slice(0, maxChars)];

  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > maxChars && current.length >= minChars) {
      out.push(current.trim());
      current = sentence;
    } else {
      current = `${current ? `${current} ` : ''}${sentence}`;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function detectTopic(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (firstLine.length >= 4 && firstLine.length <= 90 && !/[.!?]$/.test(firstLine)) {
    return firstLine.replace(/^\d+(?:\.\d+)*\s*/, '').trim();
  }

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word));
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';
}

function scoreChunk(text: string, topic: string, topicFocus?: string): number {
  let score = scoreTextQuality(text);
  const lower = text.toLowerCase();
  if (topicFocus && lower.includes(topicFocus.toLowerCase())) score += 40;
  if (topic && lower.includes(topic.toLowerCase())) score += 8;
  if (/definition|example|because|therefore|process|function|cause|effect|result|purpose|difference|advantage|disadvantage|describes|explains|refers|consists|includes|requires|produces|enables|prevents/i.test(text)) {
    score += 30;
  }
  score += Math.min(50, extractEducationalSentences(text, 8).length * 6);
  return score;
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'because',
  'before',
  'between',
  'could',
  'every',
  'first',
  'from',
  'have',
  'their',
  'there',
  'these',
  'those',
  'through',
  'using',
  'which',
  'while',
  'would',
]);
