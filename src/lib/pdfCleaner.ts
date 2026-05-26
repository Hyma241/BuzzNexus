/**
 * Document text normalization for quiz generation.
 *
 * The cleaner is intentionally conservative: it removes OCR and answer-key noise
 * while preserving paragraphs, lists, and embedded MCQ option structures.
 */

const CORRECT_MARKER_RE = /\[\s*correct\s*\]|\(\s*correct\s*\)|\{\s*correct\s*\}/gi;

const PAGE_NOISE_PATTERNS: RegExp[] = [
  /^\s*(?:page|pg\.?)\s*\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i,
  /^\s*\d+\s*(?:\/\s*\d+)?\s*$/,
  /^\s*[-_=*#~]{3,}\s*$/,
  /^\s*(?:confidential|draft|copyright\s+\d{4})\s*$/i,
];

const JUNK_LINE_PATTERNS: RegExp[] = [
  /^[A-Da-d][.)]\s*$/,
  /^[^\p{L}\p{N}]{3,}$/u,
  /(?:\b[A-Z]\b\s*){8,}/,
  /(?:\d+\s*){12,}/,
  /(?:[|¦©®™]\s*){2,}/i,
];

const BANNED_FRAGMENTS = [
  'based on the document',
  'according to the text',
  'according to the passage',
  'key concept in this context',
  'historical artifact only',
  'what role does [correct]',
];

export type TextQualityReport = {
  characters: number;
  words: number;
  sentences: number;
  uniqueWords: number;
  letterRatio: number;
  garbageRatio: number;
  qualityScore: number;
  isLowText: boolean;
  isScannedLike: boolean;
  warnings: string[];
};

export function normalizeDocumentText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\f/g, '\n\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[•●▪◦]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ');
}

export function cleanExtractedText(raw: string): string {
  const normalized = normalizeDocumentText(raw)
    .replace(CORRECT_MARKER_RE, '')
    .replace(/\bcorrect\s+answer\s*[:=-]\s*/gi, 'Answer: ')
    .replace(/\banswer\s+key\s*[:=-]\s*/gi, 'Answer: ')
    .replace(/([^\S\n]){2,}/g, ' ');

  const pages = normalized.split(/\n{2,}|\f/g);
  const lineCounts = new Map<string, number>();
  for (const page of pages) {
    for (const line of page.split('\n')) {
      const key = normalizeLineKey(line);
      if (key.length >= 6 && key.length <= 80) {
        lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
      }
    }
  }

  const repeatedLineKeys = new Set(
    [...lineCounts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([key]) => key)
  );

  const keptLines = normalized
    .split('\n')
    .map(cleanLine)
    .filter((line) => line.length > 0 || line === '')
    .filter((line) => {
      if (!line) return true;
      if (PAGE_NOISE_PATTERNS.some((re) => re.test(line))) return false;
      if (JUNK_LINE_PATTERNS.some((re) => re.test(line))) return false;
      if (repeatedLineKeys.has(normalizeLineKey(line))) return false;
      if (isIsolatedFragment(line)) return false;
      return true;
    });

  const paragraphText = mergeBrokenLines(keptLines.join('\n'));
  const paragraphs = paragraphText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 20 && !isJunkParagraph(p));

  return paragraphs
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeLineKey(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#').replace(/\W+/g, ' ').trim();
}

function cleanLine(line: string): string {
  return line
    .replace(CORRECT_MARKER_RE, '')
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    .replace(/([=_*#~])\1{2,}/g, '$1$1')
    .replace(/(.)\1{7,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOptionLine(line: string): boolean {
  return /^(?:\(?[A-Da-d]\)?[.)]|[A-Da-d]\s*[-:])\s+\S+/.test(line);
}

function isLikelyHeading(line: string): boolean {
  if (line.length > 90) return false;
  if (/[:?!.]$/.test(line)) return false;
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4) return false;
  const uppercase = letters.replace(/[^\p{Lu}]/gu, '').length;
  return uppercase / letters.length > 0.65 || /^\d+(?:\.\d+)*\s+\S+/.test(line);
}

function shouldJoin(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  if (isOptionLine(previous) || isOptionLine(next)) return false;
  if (isLikelyHeading(previous) || isLikelyHeading(next)) return false;
  if (/[.!?;:]$/.test(previous)) return false;
  if (/^(?:chapter|section|unit|lesson|figure|table)\b/i.test(next)) return false;
  if (/^[A-Z][A-Z\s]{6,}$/.test(next)) return false;
  return previous.length < 140 && /^[a-z0-9,(]/.test(next);
}

function mergeBrokenLines(text: string): string {
  const lines = text.split('\n');
  const merged: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (merged[merged.length - 1] !== '') merged.push('');
      continue;
    }

    const previous = merged[merged.length - 1];
    if (previous && shouldJoin(previous, line)) {
      merged[merged.length - 1] = `${previous} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return merged.join('\n');
}

function isIsolatedFragment(line: string): boolean {
  if (isOptionLine(line)) return false;
  const letters = line.match(/\p{L}/gu)?.length || 0;
  const words = line.split(/\s+/).filter(Boolean);
  if (line.length < 4) return true;
  if (words.length === 1 && line.length < 18 && !/[.!?]$/.test(line)) return true;
  return letters > 0 && letters / Math.max(line.length, 1) < 0.35;
}

export function isOcrFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (CORRECT_MARKER_RE.test(trimmed)) return true;
  // Never flag valid acronyms (DNA, ATP, RNA, NASA, etc.)
  if (/^[A-Z]{1,8}(\s[A-Z0-9]{1,8})*$/.test(trimmed) && trimmed.length <= 30) return false;
  // Never flag valid numeric measurements (50 mg, 37°C, 15%, etc.)
  if (/^\d{1,6}(\.\d+)?\s*(%|km|mg|ml|kg|°C|°F|m|cm|s|g|L|kPa|Hz|mol)?$/.test(trimmed)) return false;
  if (/(?:\b\d{2,}\b\s*){4,}/.test(trimmed)) return true;
  if (/[^\p{L}\p{N}\s.,;:?!'"()\-/%]/u.test(trimmed) && trimmed.length < 40) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const badWords = words.filter((w) => {
    if (/^[A-Da-d][.)]$/.test(w)) return true;
    if (/^\W+$/.test(w)) return true;
    if (w.length > 16 && !/[aeiou]/i.test(w)) return true;
    return false;
  });
  return words.length > 0 && badWords.length / words.length > 0.45;
}

export function isJunkParagraph(p: string): boolean {
  const lower = p.toLowerCase();
  if (p.length < 20) return true;
  if (BANNED_FRAGMENTS.some((fragment) => lower.includes(fragment))) return true;
  if (/^[\d\sA-Da-d.)-]+$/.test(p)) return true;
  if (isOcrFragment(p)) return true;

  const chars = p.length;
  const letters = p.match(/\p{L}/gu)?.length || 0;
  const words = p.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));

  if (letters / chars < 0.45) return true;
  if (words.length >= 12 && uniqueWords.size / words.length < 0.25) return true;
  return false;
}

export function scoreTextQuality(text: string): number {
  const report = getTextQualityReport(text);
  return report.qualityScore;
}

export function getTextQualityReport(text: string): TextQualityReport {
  const cleaned = text.trim();
  const characters = cleaned.length;
  const words = cleaned.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().split(/\s+/).length >= 5);
  const uniqueWords = new Set(
    words
      .map((w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter((w) => w.length > 3)
  );
  const letters = cleaned.match(/\p{L}/gu)?.length || 0;
  const suspicious = cleaned.match(/[^\p{L}\p{N}\s.,;:?!'"()\-/%]/gu)?.length || 0;
  const letterRatio = characters === 0 ? 0 : letters / characters;
  const garbageRatio = characters === 0 ? 1 : suspicious / characters;
  const qualityScore =
    sentences.length * 8 +
    uniqueWords.size * 1.8 +
    Math.min(characters / 120, 60) +
    letterRatio * 30 -
    garbageRatio * 180;

  const warnings: string[] = [];
  const isLowText = characters < 450 || words.length < 70 || sentences.length < 3;
  const shortWordRatio =
    words.length === 0
      ? 1
      : words.filter((word) => word.length <= 2).length / words.length;
  const isScannedLike =
    characters < 180 ||
    words.length < 35 ||
    letterRatio < 0.45 ||
    garbageRatio > 0.08 ||
    shortWordRatio > 0.42;

  if (isLowText) {
    warnings.push('This file contains limited readable educational text.');
  }
  if (isScannedLike) {
    warnings.push('This PDF appears scanned or contains insufficient readable text.');
  }
  if (garbageRatio > 0.05) {
    warnings.push('OCR noise was detected and filtered before quiz generation.');
  }

  return {
    characters,
    words: words.length,
    sentences: sentences.length,
    uniqueWords: uniqueWords.size,
    letterRatio,
    garbageRatio,
    qualityScore: Math.max(0, Math.round(qualityScore)),
    isLowText,
    isScannedLike,
    warnings,
  };
}

export function isScannedPdfText(text: string): boolean {
  return getTextQualityReport(text).isScannedLike;
}
