import type { Question } from '@/lib/supabase';
import { shouldRevealAnswers } from '@/lib/gameState';

/** Strip answer key from question payload for students / projector during live play */
export function sanitizeQuestionForDisplay(
  question: Question,
  gameState: string
): Question {
  if (shouldRevealAnswers(gameState)) {
    return question;
  }
  return {
    ...question,
    correct_answer: '',
    metadata: {},
  };
}
