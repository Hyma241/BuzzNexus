-- ================================================================
-- BuzzNexus v5 — Profiles after DB reset (quiz save fix)
-- Safe to re-run. Fixes duplicate username + RLS errors.
-- ================================================================

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Creates/updates profile for the logged-in user (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_email text;
  v_base text;
  v_username text;
  v_full text;
BEGIN
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_authenticated');
  END IF;

  SELECT
    u.email,
    coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1)),
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
  INTO v_email, v_base, v_full
  FROM auth.users u
  WHERE u.id = v_id;

  v_base := coalesce(nullif(v_base, ''), 'mentor');
  v_username := v_base || '_' || substr(replace(v_id::text, '-', ''), 1, 8);

  INSERT INTO public.profiles (id, username, full_name, updated_at)
  VALUES (v_id, v_username, v_full, now())
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'username', v_username);
EXCEPTION
  WHEN unique_violation THEN
    v_username := 'user_' || substr(replace(v_id::text, '-', ''), 1, 12);
    INSERT INTO public.profiles (id, username, full_name, updated_at)
    VALUES (v_id, v_username, v_full, now())
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      full_name = EXCLUDED.full_name,
      updated_at = now();
    RETURN jsonb_build_object('success', true, 'username', v_username);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- Remove orphan profiles; fix duplicate usernames from failed earlier runs
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);

UPDATE public.profiles p
SET username = p.username || '_' || substr(replace(p.id::text, '-', ''), 1, 8)
WHERE EXISTS (
  SELECT 1 FROM public.profiles p2
  WHERE p2.username = p.username AND p2.id <> p.id
);

-- Backfill every auth user with a unique username (id suffix)
INSERT INTO public.profiles (id, username, full_name, updated_at)
SELECT
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))
    || '_' || substr(replace(u.id::text, '-', ''), 1, 8),
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
  now()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  updated_at = now();
