import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Typed helpers for common queries
export type Room = {
  id: string;
  code: string;
  mentor_id: string;
  participant_limit: number;
  status: string;
  game_state: string;
  current_quiz_id: string | null;
  current_question_id: string | null;
  question_start_time: string | null;
  marks_per_question: number;
  negative_marking: boolean;
  negative_marking_penalty: number;
  fastest_bonus: boolean;
  streak_bonus: boolean;
  timer_override: number | null;
  locked_participant_id: string | null;
  current_buzzer_index: number;
  join_count: number;
  created_at: string;
};

export type Participant = {
  id: string;
  room_id: string;
  name: string;
  player_number: number;
  join_order: number;
  session_id: string;
  score: number;
  streak_count: number;
  accuracy: number;
  joined_at: string;
};

export type Question = {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'mcq' | 'fill_blank' | 'descriptive';
  options: string[];
  correct_answer: string;
  time_limit: number;
  order_index: number;
  metadata: Record<string, unknown>;
};

export type Buzz = {
  id: string;
  room_id: string;
  question_id: string;
  participant_id: string;
  buzz_time: string;
  participants?: Participant;
};

export type Response = {
  id: string;
  participant_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  points_awarded: number;
  response_time_ms: number;
  answered_at: string;
};