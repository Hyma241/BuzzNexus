import { NextRequest, NextResponse } from 'next/server';

/**
 * Supabase Auth callback handler.
 *
 * Supabase detectSessionInUrl (enabled in supabase.ts) automatically exchanges
 * the code for a session client-side. This server route redirects users to the
 * correct destination after email-based auth flows (password reset, magic link).
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';
  const type = requestUrl.searchParams.get('type');

  if (code) {
    // If this is a password recovery link, send to the reset-password page
    // which detects the PASSWORD_RECOVERY auth event and shows the password form
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin));
    }
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  // No code — check fragment-based recovery (hash params handled client-side)
  // Redirect to reset-password; it will detect the session
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin));
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
