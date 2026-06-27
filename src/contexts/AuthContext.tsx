import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id: string;
  email: string;
  nome: string | null;
  role: 'admin' | 'arquiteta' | 'comum';
  ativo: boolean;
  custo_hora: number | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Login com Google é restrito ao domínio corporativo da Young.
const ALLOWED_DOMAINS = ['@youngempreendimentos.com.br'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchProfile = async (email: string) => {
    const { data } = await supabase
      .from('esquadro_profiles')
      .select('*')
      .eq('email', email)
      .eq('ativo', true)
      .single();
    setProfile(data as UserProfile | null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Restrição de domínio: só para quem entrou via Google.
      const provider = session?.user?.app_metadata?.provider as string | undefined;
      const email = session?.user?.email ?? '';
      if (session?.user && provider === 'google'
          && !ALLOWED_DOMAINS.some((d) => email.toLowerCase().endsWith(d))) {
        setAuthError(`Login com Google permitido apenas para e-mails ${ALLOWED_DOMAINS.join(' ou ')}.`);
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setTimeout(() => fetchProfile(session.user.email!), 0);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        fetchProfile(session.user.email);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    setProfile(null);
    await supabase.auth.signOut();
  };

  const clearAuthError = () => setAuthError(null);

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, authError, signIn, signInWithGoogle, signOut, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
