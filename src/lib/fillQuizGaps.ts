import { fingerprintQuestion } from '@/lib/questionParser';
import { generateFallbackQuestions } from '@/lib/mockQuestions';
import {
  filterValidQuestions,
  type QuizQuestion,
} from '@/lib/questionValidator';
import type { Difficulty, QuizFormat } from '@/lib/gemini';

const MIN_TEXT_LEN = 120;

/** Fill missing questions from PDF/text — no Gemini API. */
export function fillQuizGapsFromText(
  valid: QuizQuestion[],
  sourceText: string,
  questionCount: number,
  format: QuizFormat,
  difficulty: Difficulty,
  timerDefault: number
): { questions: QuizQuestion[]; filled: number } {
  if (valid.length >= questionCount) {
    return { questions: valid.slice(0, questionCount), filled: 0 };
  }

  if (sourceText.trim().length < MIN_TEXT_LEN) {
    return { questions: valid.slice(0, questionCount), filled: 0 };
  }

  const seen = new Set(valid.map((q) => fingerprintQuestion(q.question_text)));
  const fallback = generateFallbackQuestions(
    sourceText,
    questionCount + 12,
    format,
    difficulty,
    timerDefault
  );

  const uniqueFallback = fallback.filter((q) => {
    const fp = fingerprintQuestion(q.question_text);
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });

  const merged = filterValidQuestions([...valid, ...uniqueFallback], questionCount, sourceText);
  return {
    questions: merged,
    filled: Math.max(0, merged.length - valid.length),
  };
}
