import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

/**
 * Tela mostrada quando a pessoa está logada (auth.users) mas ainda não tem
 * acesso ativo no Esquadro (sem perfil ativo). O pedido de acesso já foi
 * registrado/reaberto pelo AuthContext; aqui só informamos e deixamos sair.
 */
const AcessoPendente = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center mb-4">
            <Clock className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso pendente</h1>
          <p className="text-sm text-muted-foreground mt-1">Esquadro · Gestão de Projetos</p>
        </div>

        <div className="bg-card rounded-lg border p-6 shadow-sm text-center space-y-4">
          <p className="text-sm text-foreground">
            Sua conta{user?.email ? ` (${user.email})` : ''} está{' '}
            <strong>aguardando liberação</strong> de um administrador do Esquadro.
          </p>
          <p className="text-sm text-muted-foreground">
            O pedido já foi enviado. Assim que for aprovado, é só entrar novamente.
          </p>
          <Button type="button" variant="outline" className="w-full" onClick={() => signOut()}>
            Sair
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Young Empreendimentos
        </p>
      </div>
    </div>
  );
};

export default AcessoPendente;
