import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type SessionWait = (milliseconds: number) => Promise<void>;

export const waitForSessionClock = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));

export async function stabilizeSession(
  client: Pick<SupabaseClient, 'auth'>,
  current: Session | null,
  wait: SessionWait = waitForSessionClock,
): Promise<Session | null> {
  if (!current) return null;
  await wait(2000);
  const { data } = await client.auth.refreshSession();
  return data.session ?? current;
}
