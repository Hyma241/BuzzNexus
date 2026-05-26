-- Hotfix: answer submit — unique constraint + upsert without ON CONFLICT
-- Run in Supabase SQL editor (safe to re-run)

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS selected_answer text;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS response_time_ms integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'answer_given'
  ) THEN
    UPDATE public.responses
    SET selected_answer = COALESCE(NULLIF(selected_answer, ''), answer_given)
    WHERE selected_answer IS NULL OR selected_answer = '';
  END IF;
END $$;

-- Remove duplicate rows so unique index can be created
DELETE FROM public.responses r1
USING public.responses r2
WHERE r1.id > r2.id
  AND r1.participant_id = r2.participant_id
  AND r1.question_id = r2.question_id;

CREATE UNIQUE INDEX IF NOT EXISTS responses_participant_question_uidx
  ON public.responses (participant_id, question_id);

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
    WHERE participant_id = p_participant_id
      AND question_id = p_question_id;

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
    WHERE participant_id = p_participant_id
      AND question_id = p_question_id;

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

GRANT EXECUTE ON FUNCTION public.submit_answer(uuid, uuid, uuid, text, integer) TO anon, authenticated;
