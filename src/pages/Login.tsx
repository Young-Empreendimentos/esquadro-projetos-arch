import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Ruler } from 'lucide-react';

const Login = () => {
  const { signIn, signInWithGoogle, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      setError('Email ou senha inválidos.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4">
            <Ruler className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Esquadro</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de Projetos</p>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={() => signInWithGoogle()}>
            Entrar com Google
          </Button>

          {authError && <p className="text-sm text-destructive mt-3">{authError}</p>}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Young Empreendimentos
        </p>
      </div>
    </div>
  );
};

export default Login;
