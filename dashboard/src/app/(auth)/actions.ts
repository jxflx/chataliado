'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function loginWithPassword(formData: FormData): Promise<void> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = (formData.get('redirectTo') as string) || '/';

  if (!email || !password) {
    redirect(`/login?error=missing_credentials&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('[loginWithPassword] Error:', error.message);
    redirect(`/login?error=invalid_credentials&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
