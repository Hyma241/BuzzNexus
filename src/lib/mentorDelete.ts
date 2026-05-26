import { supabase } from '@/lib/supabase';

type RpcResult = { success?: boolean; reason?: string };

function rpcMessage(reason?: string): string {
  switch (reason) {
    case 'not_authenticated':
      return 'You are not signed in. Log in and try again.';
    case 'forbidden':
      return 'You can only delete your own items.';
    default:
      return reason || 'Delete failed.';
  }
}

/** Delete arena via RPC (clears FKs) with direct-delete fallback */
export async function deleteMentorRoom(roomId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('delete_mentor_room', { p_room_id: roomId });

  if (!error && (data as RpcResult)?.success) {
    return { ok: true };
  }

  if (error?.code === 'PGRST202' || error?.message?.includes('delete_mentor_room')) {
    const { data: rows, error: delError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .select('id');

    if (delError) return { ok: false, error: delError.message };
    if (!rows?.length) {
      return {
        ok: false,
        error: 'Arena was not deleted. Run migration_v4_delete_fix.sql in Supabase, then try again.',
      };
    }
    return { ok: true };
  }

  const rpc = data as RpcResult | null;
  if (rpc && rpc.success === false) {
    return { ok: false, error: rpcMessage(rpc.reason) };
  }

  return { ok: false, error: error?.message || rpcMessage(rpc?.reason) };
}

/** Delete quiz via RPC (clears room question pointers) with direct-delete fallback */
export async function deleteMentorQuiz(quizId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('delete_mentor_quiz', { p_quiz_id: quizId });

  if (!error && (data as RpcResult)?.success) {
    return { ok: true };
  }

  if (error?.code === 'PGRST202' || error?.message?.includes('delete_mentor_quiz')) {
    await supabase
      .from('rooms')
      .update({ current_question_id: null, current_quiz_id: null })
      .eq('current_quiz_id', quizId);

    const questionIds = (
      await supabase.from('questions').select('id').eq('quiz_id', quizId)
    ).data?.map((q) => q.id);

    if (questionIds?.length) {
      await supabase
        .from('rooms')
        .update({ current_question_id: null })
        .in('current_question_id', questionIds);
    }

    const { data: rows, error: delError } = await supabase
      .from('quizzes')
      .delete()
      .eq('id', quizId)
      .select('id');

    if (delError) return { ok: false, error: delError.message };
    if (!rows?.length) {
      return {
        ok: false,
        error: 'Quiz was not deleted. Run migration_v4_delete_fix.sql in Supabase, then try again.',
      };
    }
    return { ok: true };
  }

  const rpc = data as RpcResult | null;
  if (rpc && rpc.success === false) {
    return { ok: false, error: rpcMessage(rpc.reason) };
  }

  return { ok: false, error: error?.message || rpcMessage(rpc?.reason) };
}
