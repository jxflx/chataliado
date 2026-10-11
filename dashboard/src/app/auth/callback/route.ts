import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const isRelativeUrl = next.startsWith('/') && !next.startsWith('//');
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${isRelativeUrl ? next : '/'}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${isRelativeUrl ? next : '/'}`);
      } else {
        return NextResponse.redirect(`${origin}${isRelativeUrl ? next : '/'}`);
      }
    }
  }

  // Si ocurre un error, redirigir al login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
