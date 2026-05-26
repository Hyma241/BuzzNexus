-- ================================================================
-- BuzzNexus v6 - verified quiz pipeline + realtime hardening
-- Run after migration_v5_profiles.sql. Safe to re-run.
-- ================================================================

-- Quiz lifecycle metadata for bulk management.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS generation_metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_mentor_archived_created
  ON public.quizzes (mentor_id, archived_at, created_at DESC);

-- Keep generated question verification metadata queryable.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_quiz_order
  ON public.questions (quiz_id, order_index);

-- Make deletes and live updates deterministic.
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_current_question_id_fkey;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_current_question_id_fkey
  FOREIGN KEY (current_question_id)
  REFERENCES public.questions(id)
  ON DELETE SET NULL;

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_current_quiz_id_fkey;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_current_quiz_id_fkey
  FOREIGN KEY (current_quiz_id)
  REFERENCES public.quizzes(id)
  ON DELETE SET NULL;

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_locked_participant_id_fkey;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_locked_participant_id_fkey
  FOREIGN KEY (locked_participant_id)
  REFERENCES public.participants(id)
  ON DELETE SET NULL;

ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.buzzes REPLICA IDENTITY FULL;
ALTER TABLE public.responses REPLICA IDENTITY FULL;
ALTER TABLE public.questions REPLICA IDENTITY FULL;

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

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.questions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bulk archive/unarchive helper for mentor-owned quizzes.
CREATE OR REPLACE FUNCTION public.set_quiz_archive_state(
  p_quiz_ids uuid[],
  p_archived boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  UPDATE public.quizzes
  SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
  WHERE id = ANY(p_quiz_ids)
    AND mentor_id = auth.uid();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_quiz_archive_state(uuid[], boolean) TO authenticated;

