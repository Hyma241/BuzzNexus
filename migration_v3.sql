-- ================================================================
-- BuzzNexus Arena v3 — Production realtime & gameplay migration
-- Run after schema.sql and migration_v2.sql
-- Safe to re-run (idempotent where possible)
-- ================================================================

-- ── 1. Game state column comment / validation helper ─────────────
COMMENT ON COLUMN public.rooms.game_state IS
  'waiting|lobby|question_active|buzz_locked|answering|evaluation|question_results|leaderboard|finished';

-- ── 2. Responses: align answer column ─────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'answer_given'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'selected_answer'
  ) THEN
    ALTER TABLE public.responses RENAME COLUMN answer_given TO selected_answer;
  END IF;
END $$;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS selected_answer text;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS response_time_ms integer DEFAULT 0 NOT NULL;

UPDATE public.responses
SET selected_answer = COALESCE(selected_answer, '')
WHERE selected_answer IS NULL;

-- ── 3. Realtime: full row payloads for UPDATE diffs ───────────────
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.buzzes REPLICA IDENTITY FULL;
ALTER TABLE public.responses REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.buzzes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Join count + lobby transition ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_room_join_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_state text;
BEGIN
  SELECT COUNT(*)::integer INTO v_count
  FROM public.participants WHERE room_id = COALESCE(NEW.room_id, OLD.room_id);

  SELECT game_state INTO v_state
  FROM public.rooms WHERE id = COALESCE(NEW.room_id, OLD.room_id);

  UPDATE public.rooms
  SET join_count = v_count,
      game_state = CASE
        WHEN v_state = 'waiting' AND v_count > 0 THEN 'lobby'
        WHEN v_state = 'lobby' AND v_count = 0 THEN 'waiting'
        ELSE game_state
      END
  WHERE id = COALESCE(NEW.room_id, OLD.room_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_room_join_count ON public.participants;
CREATE TRIGGER trg_sync_room_join_count
  AFTER INSERT OR DELETE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.sync_room_join_count();

-- ── 5. Drop old RPC signatures ───────────────────────────────────
DROP FUNCTION IF EXISTS public.handle_buzz(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.advance_buzzer(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.grade_answer(uuid, uuid, uuid, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.submit_answer(uuid, uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS public.start_question(uuid, uuid, uuid, integer, integer, integer);
DROP FUNCTION IF EXISTS public.advance_to_next_question(uuid, uuid);
DROP FUNCTION IF EXISTS public.force_question_results(uuid);

-- ── 6. ATOMIC BUZZ (first by buzz_time) ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_buzz(
  p_room_id uuid,
  p_question_id uuid,
  p_participant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_state text;
  v_locked_id uuid;
  v_first_participant uuid;
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtext(p_room_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT game_state, locked_participant_id
  INTO v_current_state, v_locked_id
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_current_state NOT IN ('question_active') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'question_not_active');
  END IF;

  INSERT INTO public.buzzes (room_id, question_id, participant_id, buzz_time)
  VALUES (p_room_id, p_question_id, p_participant_id, clock_timestamp())
  ON CONFLICT (room_id, question_id, participant_id) DO NOTHING;

  IF v_locked_id IS NULL THEN
    SELECT participant_id INTO v_first_participant
    FROM public.buzzes
    WHERE room_id = p_room_id AND question_id = p_question_id
    ORDER BY buzz_time ASC, id ASC
    LIMIT 1;

    IF v_first_participant IS NOT NULL THEN
      UPDATE public.rooms
      SET locked_participant_id = v_first_participant,
          game_state = 'buzz_locked',
          current_buzzer_index = 0
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'success', true,
        'is_first', v_first_participant = p_participant_id,
        'locked_participant_id', v_first_participant
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_first', false,
    'locked_participant_id', v_locked_id
  );
END;
$$;

-- ── 7. SUBMIT ANSWER → evaluation ────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_room_id uuid,
  p_question_id uuid,
  p_participant_id uuid,
  p_answer text,
  p_response_time_ms integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_locked uuid;
  v_use_selected boolean;
  v_rows integer;
BEGIN
  SELECT game_state, locked_participant_id
  INTO v_state, v_locked
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF v_locked IS DISTINCT FROM p_participant_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_locked_player');
  END IF;

  IF v_state NOT IN ('buzz_locked', 'answering', 'evaluation') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_answering_phase', 'state', v_state);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'selected_answer'
  ) INTO v_use_selected;

  IF v_use_selected THEN
    UPDATE public.responses
    SET
      selected_answer = trim(p_answer),
      response_time_ms = COALESCE(p_response_time_ms, 0),
      is_correct = false,
      points_awarded = 0
    WHERE participant_id = p_participant_id AND question_id = p_question_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      INSERT INTO public.responses (
        participant_id, question_id, selected_answer,
        is_correct, points_awarded, response_time_ms
      )
      VALUES (
        p_participant_id, p_question_id, trim(p_answer),
        false, 0, COALESCE(p_response_time_ms, 0)
      );
    END IF;
  ELSE
    UPDATE public.responses
    SET
      answer_given = trim(p_answer),
      response_time_ms = COALESCE(p_response_time_ms, 0),
      is_correct = false,
      points_awarded = 0
    WHERE participant_id = p_participant_id AND question_id = p_question_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
      INSERT INTO public.responses (
        participant_id, question_id, answer_given,
        is_correct, points_awarded, response_time_ms
      )
      VALUES (
        p_participant_id, p_question_id, trim(p_answer),
        false, 0, COALESCE(p_response_time_ms, 0)
      );
    END IF;
  END IF;

  UPDATE public.rooms
  SET game_state = 'evaluation'
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 8. ADVANCE BUZZER (second chance) ────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_buzzer(
  p_room_id uuid,
  p_question_id uuid,
  p_current_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    ORDER BY buzz_time ASC, id ASC
    LIMIT 1 OFFSET v_next_index;

    IF v_next_participant IS NOT NULL THEN
      UPDATE public.rooms
      SET locked_participant_id = v_next_participant,
          current_buzzer_index = v_next_index,
          game_state = 'buzz_locked'
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'success', true,
        'has_next', true,
        'next_index', v_next_index,
        'locked_participant_id', v_next_participant
      );
    END IF;
  END IF;

  UPDATE public.rooms
  SET game_state = 'question_results',
      locked_participant_id = NULL
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'has_next', false);
END;
$$;

-- ── 9. GRADE ANSWER ──────────────────────────────────────────────
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
SET search_path = public
AS $$
DECLARE
  v_new_streak integer;
  v_current_streak integer;
BEGIN
  SELECT streak_count INTO v_current_streak
  FROM public.participants WHERE id = p_participant_id;

  v_new_streak := CASE WHEN p_is_correct THEN COALESCE(v_current_streak, 0) + 1 ELSE 0 END;

  UPDATE public.participants
  SET score = GREATEST(0, score + p_points),
      streak_count = v_new_streak
  WHERE id = p_participant_id;

  UPDATE public.responses
  SET is_correct = p_is_correct,
      points_awarded = p_points
  WHERE question_id = p_question_id AND participant_id = p_participant_id;

  IF p_is_correct THEN
    UPDATE public.rooms
    SET game_state = 'question_results',
        locked_participant_id = NULL
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'action', 'question_results');
  END IF;

  RETURN public.advance_buzzer(p_room_id, p_question_id, p_current_buzzer_index);
END;
$$;

-- ── 10. START / ADVANCE QUESTION (mentor) ────────────────────────
CREATE OR REPLACE FUNCTION public.start_question(
  p_room_id uuid,
  p_quiz_id uuid,
  p_question_id uuid,
  p_marks integer DEFAULT NULL,
  p_timer_override integer DEFAULT NULL,
  p_negative_penalty integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT mentor_id FROM public.rooms WHERE id = p_room_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  UPDATE public.rooms
  SET
    game_state = 'question_active',
    current_quiz_id = p_quiz_id,
    current_question_id = p_question_id,
    question_start_time = clock_timestamp(),
    locked_participant_id = NULL,
    current_buzzer_index = 0,
    marks_per_question = COALESCE(p_marks, marks_per_question),
    timer_override = p_timer_override,
    negative_marking_penalty = COALESCE(p_negative_penalty, negative_marking_penalty)
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_to_next_question(
  p_room_id uuid,
  p_next_question_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT mentor_id FROM public.rooms WHERE id = p_room_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  IF p_next_question_id IS NULL THEN
    UPDATE public.rooms
    SET game_state = 'leaderboard',
        locked_participant_id = NULL,
        current_buzzer_index = 0
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'action', 'leaderboard');
  END IF;

  UPDATE public.rooms
  SET
    game_state = 'question_active',
    current_question_id = p_next_question_id,
    question_start_time = clock_timestamp(),
    locked_participant_id = NULL,
    current_buzzer_index = 0
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'action', 'question_active');
END;
$$;

CREATE OR REPLACE FUNCTION public.force_question_results(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT mentor_id FROM public.rooms WHERE id = p_room_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  UPDATE public.rooms
  SET game_state = 'question_results',
      locked_participant_id = NULL
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 11. Mentor may update rooms (authenticated) ───────────────────
DROP POLICY IF EXISTS "Mentors can update rooms" ON public.rooms;
CREATE POLICY "Mentors can update rooms" ON public.rooms
  FOR UPDATE USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Service role game updates" ON public.rooms;
-- Responses: allow update for grading RPC (security definer handles it)

DROP POLICY IF EXISTS "Anyone can update responses for grading" ON public.responses;
DROP POLICY IF EXISTS "Responses updatable for arena" ON public.responses;
CREATE POLICY "Responses updatable for arena" ON public.responses
  FOR UPDATE USING (true);

-- ── 12. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_game_state ON public.rooms(game_state);
CREATE INDEX IF NOT EXISTS idx_responses_question_participant ON public.responses(question_id, participant_id);

-- One answer per participant per question (required for upserts / submit_answer)
DELETE FROM public.responses r1
USING public.responses r2
WHERE r1.id > r2.id
  AND r1.participant_id = r2.participant_id
  AND r1.question_id = r2.question_id;

CREATE UNIQUE INDEX IF NOT EXISTS responses_participant_question_uidx
  ON public.responses (participant_id, question_id);

-- ── 13. Grants ────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.handle_buzz TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_answer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_buzzer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_answer TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_question TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_to_next_question TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_question_results TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_score TO anon, authenticated;
