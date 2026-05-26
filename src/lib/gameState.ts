/** Canonical arena game states — keep in sync with migration_v3.sql */
export const GAME_STATES = {
  WAITING: 'waiting',
  LOBBY: 'lobby',
  QUESTION_ACTIVE: 'question_active',
  BUZZ_LOCKED: 'buzz_locked',
  ANSWERING: 'answering',
  EVALUATION: 'evaluation',
  QUESTION_RESULTS: 'question_results',
  LEADERBOARD: 'leaderboard',
  FINISHED: 'finished',
} as const;

export type GameState = (typeof GAME_STATES)[keyof typeof GAME_STATES];

/** States where students may still join the arena */
export const JOINABLE_STATES: GameState[] = [
  GAME_STATES.WAITING,
  GAME_STATES.LOBBY,
  GAME_STATES.QUESTION_ACTIVE,
  GAME_STATES.BUZZ_LOCKED,
  GAME_STATES.ANSWERING,
];

/** Reveal correct answers on projector / student only in these states */
export const REVEAL_ANSWER_STATES: GameState[] = [
  GAME_STATES.QUESTION_RESULTS,
  GAME_STATES.LEADERBOARD,
  GAME_STATES.FINISHED,
];

export function shouldRevealAnswers(gameState: string | null | undefined): boolean {
  if (!gameState) return false;
  return REVEAL_ANSWER_STATES.includes(gameState as GameState);
}

export function isBuzzPhase(gameState: string | null | undefined): boolean {
  return gameState === GAME_STATES.QUESTION_ACTIVE;
}

export function isLockedAnsweringPhase(gameState: string | null | undefined): boolean {
  return (
    gameState === GAME_STATES.BUZZ_LOCKED ||
    gameState === GAME_STATES.ANSWERING
  );
}

export function isEvaluationPhase(gameState: string | null | undefined): boolean {
  return gameState === GAME_STATES.EVALUATION;
}
