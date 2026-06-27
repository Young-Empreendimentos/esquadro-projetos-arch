import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Ruler } from 'lucide-react';

const Login = () => {
  const { signInWithGoogle, authError } = useAuth();

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
          <Button type="button" className="w-full" onClick={() => signInWithGoogle()}>
            Entrar com Google
          </Button>
          {authError && (
            <p className="text-sm text-destructive mt-3 text-center">{authError}</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Young Empreendimentos
        </p>
      </div>
    </div>
  );
};

export default Login;
