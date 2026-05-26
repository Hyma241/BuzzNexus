/** Show Supabase / API errors in the UI (PostgrestError is not always instanceof Error). */
export function formatUserError(err: unknown): string {
  if (!err) return 'An error occurred.';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;

  if (typeof err === 'object') {
    const e = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [e.message, e.details, e.hint, e.code ? `Code: ${e.code}` : ''].filter(
      Boolean
    );
    if (parts.length > 0) return parts.join(' — ');
  }

  return 'An error occurred.';
}
