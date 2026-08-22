import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { stabilizeSession } from './stable-session';

const session = (token: string) => ({ access_token: token }) as Session;

describe('stabilizeSession', () => {
  it('does not refresh when there is no authenticated session', async () => {
    const refreshSession = vi.fn();
    const client = { auth: { refreshSession } } as unknown as Pick<SupabaseClient, 'auth'>;
    const wait = vi.fn();
    await expect(stabilizeSession(client, null, wait)).resolves.toBeNull();
    expect(wait).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('waits briefly and uses the refreshed token for protected API calls', async () => {
    const refreshed = session('refreshed-token');
    const refreshSession = vi.fn().mockResolvedValue({ data: { session: refreshed } });
    const client = { auth: { refreshSession } } as unknown as Pick<SupabaseClient, 'auth'>;
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(stabilizeSession(client, session('initial-token'), wait)).resolves.toBe(refreshed);
    expect(wait).toHaveBeenCalledWith(2000);
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it('preserves the current session when refresh yields no replacement', async () => {
    const current = session('initial-token');
    const refreshSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const client = { auth: { refreshSession } } as unknown as Pick<SupabaseClient, 'auth'>;
    await expect(stabilizeSession(client, current, vi.fn().mockResolvedValue(undefined))).resolves.toBe(current);
  });
});
