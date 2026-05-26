import { cleanExtractedText } from '@/lib/pdfCleaner';
export { semanticChunkText, type ContentChunk } from '@/lib/chunking';

export type ParsedMcqBlock = {
  question: string;
  options: string[];
  correct?: string;
};

const MCQ_OPTION_RE = /^(?:\(?([A-Da-d])\)?[.)]\s*|\[([A-Da-d])\]\s*)(.+)$/;
const ANSWER_RE = /^(?:answer|correct answer|ans)\s*[:=-]\s*(.+)$/i;

export function parseDocumentText(raw: string): string {
  return cleanExtractedText(raw);
}

/** Detect embedded MCQ blocks in source text without trusting their answer keys. */
export function extractMcqBlocks(text: string): ParsedMcqBlock[] {
  const blocks: ParsedMcqBlock[] = [];
  const sections = text.split(/\n{2,}/);

  for (const section of sections) {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    const optionsByLetter = new Map<string, string>();
    let question = '';
    let correct: string | undefined;

    for (const line of lines) {
      const optionMatch = line.match(MCQ_OPTION_RE);
      if (optionMatch) {
        const letter = (optionMatch[1] || optionMatch[2] || '').toUpperCase();
        const body = (optionMatch[3] || '')
          .replace(/\[\s*correct\s*\]|\(\s*correct\s*\)/gi, '')
          .trim();
        if (body) optionsByLetter.set(letter, body);
        if (/\[\s*correct\s*\]|\(\s*correct\s*\)/i.test(line)) correct = body;
        continue;
      }

      const answerMatch = line.match(ANSWER_RE);
      if (answerMatch) {
        const answer = answerMatch[1].trim();
        const letter = answer.charAt(0).toUpperCase();
        correct = optionsByLetter.get(letter) || answer.replace(/^[A-Da-d][.)]\s*/, '');
        continue;
      }

      if (!question && line.length > 15) {
        question = line.endsWith('?') ? line : `${line.replace(/[.:]+$/, '')}?`;
      }
    }

    const options = [...optionsByLetter.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);

    if (question && options.length >= 2) {
      blocks.push({ question, options, correct });
    }
  }

  return blocks;
}

export function fingerprintQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\s*correct\s*\]|\(\s*correct\s*\)/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 16)
    .join(' ');
}

