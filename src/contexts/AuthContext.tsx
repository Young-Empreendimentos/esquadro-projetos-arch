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
  carga_horaria_diaria: number | null;
  created_at: string;
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
    try {
      const { data, error } = await projetosDb
        .from('esquadro_profiles')
        .select('*')
        .eq('email', email)
        .eq('ativo', true)
        .maybeSingle();
      if (error) console.error('Erro ao consultar perfil (projetos):', error.message);
      setProfile((data as UserProfile) ?? null);
      // 2ª validação: logado mas sem perfil ATIVO → registra/reabre o pedido de acesso.
      if (!data) {
        try {
          await supabase.rpc('esquadro_registrar_solicitacao_acesso' as any);
        } catch (e) {
          console.error('Erro ao registrar solicitação de acesso:', e);
        }
      }
    } catch (e) {
      console.error('Falha ao carregar perfil:', e);
      setProfile(null);
    } finally {
      setLoading(false); // nunca deixa o app preso na tela de loading
    }
  };

  useEffect(() => {
    // Rede de segurança: nunca prender o app na tela de loading (ex.: chamada que trava).
    const safety = setTimeout(() => setLoading(false), 8000);

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
        // fetchProfile libera o loading (após checar perfil / registrar pedido)
        setTimeout(() => fetchProfile(session.user.email!), 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        fetchProfile(session.user.email);
      } else {
        setLoading(false);
      }
    });

    return () => { clearTimeout(safety); subscription.unsubscribe(); };
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
