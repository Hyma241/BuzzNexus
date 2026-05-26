-- ================================================================
-- BuzzNexus Arena v2 Migration FIX
-- Drops old conflicting functions before recreating them
-- Safe to run on existing database
-- ================================================================

-- 1. Drop old functions that conflict (return type changed)
DROP FUNCTION IF EXISTS public.handle_buzz(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.advance_buzzer(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.grade_answer(uuid, uuid, uuid, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.increment_score(uuid, integer, integer);

-- 2. Add missing columns (safe - uses IF NOT EXISTS)
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS negative_marking_penalty integer DEFAULT 0 NOT NULL;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS join_count integer DEFAULT 0 NOT NULL;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS join_order integer;

-- Backfill join_order from player_number
UPDATE public.participants SET join_order = player_number WHERE join_order IS NULL;

-- 3. Enable realtime on additional tables
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.questions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. ATOMIC BUZZER LOCK RPC
CREATE OR REPLACE FUNCTION public.handle_buzz(
  p_room_id uuid,
  p_question_id uuid,
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_state text;
  v_locked_id uuid;
  v_buzz_count integer;
  v_is_first boolean := false;
  v_lock_key bigint;
BEGIN
  v_lock_key := ('x' || substr(p_room_id::text, 1, 8))::bit(32)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT game_state, locked_participant_id
  INTO v_current_state, v_locked_id
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_current_state != 'question_active' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'question_not_active');
  END IF;

  INSERT INTO public.buzzes (room_id, question_id, participant_id, buzz_time)
  VALUES (p_room_id, p_question_id, p_participant_id, NOW())
  ON CONFLICT (room_id, question_id, participant_id) DO NOTHING;

  SELECT COUNT(*) INTO v_buzz_count
  FROM public.buzzes
  WHERE room_id = p_room_id AND question_id = p_question_id;

  IF v_locked_id IS NULL AND v_buzz_count >= 1 THEN
    v_is_first := true;
    UPDATE public.rooms
    SET locked_participant_id = p_participant_id,
        game_state = 'buzz_locked',
        current_buzzer_index = 0
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_first', v_is_first,
    'buzz_count', v_buzz_count
  );
END;
$$;

-- 5. ADVANCE BUZZER RPC
CREATE OR REPLACE FUNCTION public.advance_buzzer(
  p_room_id uuid,
  p_question_id uuid,
  p_current_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_participant uuid;
  v_next_index integer;
  v_buzz_count integer;
BEGIN
  v_next_index := p_current_index + 1;

  SELECT COUNT(*) INTO v_buzz_count
  FROM public.buzzes
  WHERE room_id = p_room_id AND question_id = p_question_id;

  IF v_next_index < v_buzz_count THEN
    SELECT participant_id INTO v_next_participant
    FROM public.buzzes
    WHERE room_id = p_room_id AND question_id = p_question_id
    ORDER BY buzz_time ASC
    LIMIT 1 OFFSET v_next_index;

    IF v_next_participant IS NOT NULL THEN
      UPDATE public.rooms
      SET locked_participant_id = v_next_participant,
          current_buzzer_index = v_next_index
      WHERE id = p_room_id;
      RETURN jsonb_build_object('success', true, 'has_next', true, 'next_index', v_next_index);
    END IF;
  END IF;

  UPDATE public.rooms
  SET game_state = 'question_results',
      locked_participant_id = NULL
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'has_next', false);
END;
$$;

-- 6. GRADE ANSWER RPC
CREATE OR REPLACE FUNCTION public.grade_answer(
  p_room_id uuid,
  p_question_id uuid,
  p_participant_id uuid,
  p_is_correct boolean,
  p_points integer,
  p_current_buzzer_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_streak integer;
  v_current_streak integer;
BEGIN
  SELECT streak_count INTO v_current_streak
  FROM public.participants WHERE id = p_participant_id;

  v_new_streak := CASE WHEN p_is_correct THEN COALESCE(v_current_streak, 0) + 1 ELSE 0 END;

  UPDATE public.participants
  SET score = score + p_points,
      streak_count = v_new_streak
  WHERE id = p_participant_id;

  UPDATE public.responses
  SET is_correct = p_is_correct,
      points_awarded = p_points
  WHERE question_id = p_question_id AND participant_id = p_participant_id;

  IF p_is_correct THEN
    UPDATE public.rooms
    SET game_state = 'question_results', locked_participant_id = NULL
    WHERE id = p_room_id;
    RETURN jsonb_build_object('success', true, 'action', 'question_results');
  ELSE
    RETURN public.advance_buzzer(p_room_id, p_question_id, p_current_buzzer_index);
  END IF;
END;
$$;

-- 7. INCREMENT SCORE RPC
CREATE OR REPLACE FUNCTION public.increment_score(
  p_id uuid,
  points_to_add integer,
  new_streak integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.participants
  SET score = score + points_to_add,
      streak_count = new_streak
  WHERE id = p_id;
$$;

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_mentor ON public.rooms(mentor_id);
CREATE INDEX IF NOT EXISTS idx_participants_room ON public.participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_session ON public.participants(session_id);
CREATE INDEX IF NOT EXISTS idx_buzzes_room_question ON public.buzzes(room_id, question_id);
CREATE INDEX IF NOT EXISTS idx_buzzes_question_time ON public.buzzes(question_id, buzz_time ASC);
CREATE INDEX IF NOT EXISTS idx_responses_question ON public.responses(question_id);
CREATE INDEX IF NOT EXISTS idx_responses_participant ON public.responses(participant_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON public.questions(quiz_id);

-- 9. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_buzz TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_buzzer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_answer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_score TO anon, authenticated;

