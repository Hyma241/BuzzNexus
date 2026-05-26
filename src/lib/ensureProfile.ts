import { supabase } from '@/lib/supabase';

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

/** After a DB reset, auth users exist but profiles row may be missing — quizzes need it. */
export async function ensureMentorProfile(user: AuthUser): Promise<{ ok: boolean; error?: string }> {
  if (!user.id) return { ok: false, error: 'Not signed in' };

  const { data, error } = await supabase.rpc('ensure_my_profile');

  if (!error && data && typeof data === 'object' && (data as { success?: boolean }).success) {
    return { ok: true };
  }

  if (error?.code === 'PGRST202' || error?.message?.includes('ensure_my_profile')) {
    return ensureMentorProfileDirect(user);
  }

  const rpc = data as { success?: boolean; reason?: string } | null;
  if (rpc?.success === false) {
    return { ok: false, error: rpc.reason || 'Could not create profile' };
  }

  if (error) {
    return {
      ok: false,
      error: `${error.message}. Run migration_v5_profiles.sql in Supabase SQL Editor.`,
    };
  }

  return { ok: true };
}

async function ensureMentorProfileDirect(user: AuthUser): Promise<{ ok: boolean; error?: string }> {
  let email = user.email;
  let metadata = user.user_metadata;
  if (!email) {
    const { data: { session } } = await supabase.auth.getSession();
    email = session?.user.email;
    metadata = session?.user.user_metadata;
  }

  const base =
    (metadata?.username as string) ||
    email?.split('@')[0] ||
    'mentor';
  const username = `${base}_${user.id.replace(/-/g, '').slice(0, 8)}`;
  const fullName = (metadata?.full_name as string) || base;

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      username,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    return {
      ok: false,
      error: `${error.message}${error.hint ? ` (${error.hint})` : ''}`,
    };
  }

  return { ok: true };
}
