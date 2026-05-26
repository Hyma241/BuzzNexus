import { supabase } from '@/lib/supabase';

type SubmitParams = {
  roomId: string;
  questionId: string;
  participantId: string;
  answer: string;
  responseTimeMs: number;
};

type SubmitResult =
  | { ok: true }
  | { ok: false; message: string; reason?: string };

function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Unknown error';
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ') || 'Request failed';
}

/** Submit student answer via RPC, with direct-insert fallback if RPC/columns differ. */
export async function submitStudentAnswer(params: SubmitParams): Promise<SubmitResult> {
  const { roomId, questionId, participantId, answer, responseTimeMs } = params;
  const trimmed = answer.trim();

  const { data: freshRoom, error: roomErr } = await supabase
    .from('rooms')
    .select('game_state, locked_participant_id')
    .eq('id', roomId)
    .single();

  if (roomErr || !freshRoom) {
    return { ok: false, message: 'Could not verify arena state. Try again.' };
  }

  if (freshRoom.locked_participant_id !== participantId) {
    return { ok: false, message: 'You are not the locked buzzer for this question.', reason: 'not_locked_player' };
  }

  const { data, error } = await supabase.rpc('submit_answer', {
    p_room_id: roomId,
    p_question_id: questionId,
    p_participant_id: participantId,
    p_answer: trimmed,
    p_response_time_ms: responseTimeMs,
  });

  if (!error && data && typeof data === 'object' && (data as { success?: boolean }).success === true) {
    return { ok: true };
  }

  const rpcReason =
    data && typeof data === 'object' && 'reason' in data
      ? String((data as { reason?: string }).reason)
      : undefined;

  const rpcMsg = formatSupabaseError(error);
  const rpcMissing =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    ((error as { code?: string }).code === 'PGRST202' ||
      rpcMsg.includes('submit_answer'));

  const rpcUpsertConstraint =
    rpcMsg.includes('ON CONFLICT') ||
    rpcMsg.includes('42P10') ||
    (error && typeof error === 'object' && (error as { code?: string }).code === '42P10');

  if (!rpcMissing && !rpcUpsertConstraint && rpcReason !== 'not_locked_player') {
    if (rpcReason) {
      return { ok: false, message: `Submit blocked (${rpcReason}).`, reason: rpcReason };
    }
    if (rpcMsg && rpcMsg !== 'Request failed') {
      return { ok: false, message: rpcMsg };
    }
  }

  // Fallback: insert response (allowed by RLS); mentor sees answer via realtime
  const baseRow = {
    participant_id: participantId,
    question_id: questionId,
    is_correct: false,
    points_awarded: 0,
    response_time_ms: responseTimeMs,
  };

  let { error: insErr } = await supabase.from('responses').insert({
    ...baseRow,
    selected_answer: trimmed,
  });

  if (insErr?.message?.includes('selected_answer')) {
    ({ error: insErr } = await supabase.from('responses').insert({
      ...baseRow,
      answer_given: trimmed,
    } as typeof baseRow & { answer_given: string }));
  }

  if (insErr) {
    if (insErr.code === '23505') {
      const updatePayload = { selected_answer: trimmed, response_time_ms: responseTimeMs };
      const { error: updErr } = await supabase
        .from('responses')
        .update(updatePayload)
        .eq('participant_id', participantId)
        .eq('question_id', questionId);

      if (updErr) {
        const { error: updErr2 } = await supabase
          .from('responses')
          .update({ answer_given: trimmed, response_time_ms: responseTimeMs } as Record<string, unknown>)
          .eq('participant_id', participantId)
          .eq('question_id', questionId);

        if (updErr2) {
          return {
            ok: false,
            message: formatSupabaseError(updErr2),
            reason: 'update_failed',
          };
        }
      }
    } else {
      return {
        ok: false,
        message: formatSupabaseError(insErr),
        reason: 'insert_failed',
      };
    }
  }

  // Room state → evaluation requires RPC or mentor policy; try RPC once more silently
  await supabase.rpc('submit_answer', {
    p_room_id: roomId,
    p_question_id: questionId,
    p_participant_id: participantId,
    p_answer: trimmed,
    p_response_time_ms: responseTimeMs,
  });

  return { ok: true };
}
