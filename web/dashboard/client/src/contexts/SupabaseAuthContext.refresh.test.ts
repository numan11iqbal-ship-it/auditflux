import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'SupabaseAuthContext.tsx'), 'utf8');

describe('Supabase auth refresh handling', () => {
  it('keeps routine auth events out of the delayed bootstrap path', () => {
    const listener = source.match(/client\.auth\.onAuthStateChange\([\s\S]*?\n    \}\);/)?.[0] || '';
    expect(listener).not.toContain('applyStableSession(next)');
    expect(listener).toContain('setSession(next)');
    expect(listener).toContain('setLoading(false)');
  });
});
