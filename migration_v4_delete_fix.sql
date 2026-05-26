-- ================================================================
-- BuzzNexus v4 — Fix quiz/arena deletes (FK + mentor RPCs)
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ================================================================

-- 1) Rooms must not block question/quiz deletion
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_current_question_id_fkey;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_current_question_id_fkey
  FOREIGN KEY (current_question_id)
  REFERENCES public.questions(id)
  ON DELETE SET NULL;

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_current_quiz_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
      AND column_name = 'current_quiz_id'
  ) THEN
    ALTER TABLE public.rooms
      ADD CONSTRAINT rooms_current_quiz_id_fkey
      FOREIGN KEY (current_quiz_id)
      REFERENCES public.quizzes(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Mentor-owned quiz delete (clears arena pointers first)
CREATE OR REPLACE FUNCTION public.delete_mentor_quiz(p_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quizzes
    WHERE id = p_quiz_id AND mentor_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  UPDATE public.rooms
  SET current_question_id = NULL
  WHERE current_question_id IN (
    SELECT id FROM public.questions WHERE quiz_id = p_quiz_id
  );

  UPDATE public.rooms
  SET current_quiz_id = NULL
  WHERE current_quiz_id = p_quiz_id;

  DELETE FROM public.quizzes WHERE id = p_quiz_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3) Mentor-owned arena delete
CREATE OR REPLACE FUNCTION public.delete_mentor_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = p_room_id AND mentor_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden');
  END IF;

  UPDATE public.rooms
  SET current_question_id = NULL,
      current_quiz_id = NULL,
      locked_participant_id = NULL
  WHERE id = p_room_id;

  DELETE FROM public.rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_mentor_quiz(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_mentor_room(uuid) TO authenticated;

-- 4) Ensure delete policies exist (idempotent)
DROP POLICY IF EXISTS "Mentors can delete rooms" ON public.rooms;
CREATE POLICY "Mentors can delete rooms" ON public.rooms
  FOR DELETE USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors can delete their quizzes" ON public.quizzes;
CREATE POLICY "Mentors can delete their quizzes" ON public.quizzes
  FOR DELETE USING (auth.uid() = mentor_id);
