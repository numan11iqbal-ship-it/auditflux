import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { stabilizeSession } from '@/lib/stable-session';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const stabilizing = useRef(false);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const applyStableSession = async (next: Session | null) => {
      stabilizing.current = true;
      setLoading(true);
      const resolved = await stabilizeSession(supabase, next);
      if (active) { setSession(resolved); setLoading(false); }
      stabilizing.current = false;
    };
    supabase.auth.getSession().then(({ data }) => void applyStableSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (stabilizing.current) return;
      void applyStableSession(next);
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    configured: supabaseConfigured,
    loading,
    user: session?.user ?? null,
    session,
    async signIn(email, password) { if (!supabase) return 'Supabase is not configured.'; const { error } = await supabase.auth.signInWithPassword({ email, password }); return error?.message ?? null; },
    async signUp(email, password) { if (!supabase) return 'Supabase is not configured.'; const { error } = await supabase.auth.signUp({ email, password }); return error?.message ?? null; },
    async signOut() { await supabase?.auth.signOut(); },
  }), [loading, session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useSupabaseAuth must be used inside SupabaseAuthProvider.');
  return context;
}
