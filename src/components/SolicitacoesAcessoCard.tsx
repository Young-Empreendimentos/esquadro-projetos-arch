import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Solicitacao {
  id: string;
  user_id: string;
  email: string | null;
  nome: string | null;
  requested_at: string;
}

/**
 * Card (home/Dashboard, só admin) com os pedidos de acesso pendentes.
 * Aprovar chama esquadro_aprovar_solicitacao(id, role); recusar chama
 * esquadro_recusar_solicitacao(id). As RPCs validam admin no banco.
 */
const SolicitacoesAcessoCard = () => {
  const { isAdmin } = useAuth();
  const [pendentes, setPendentes] = useState<Solicitacao[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await (supabase.from('esquadro_solicitacao_acesso' as any) as any)
      .select('id, user_id, email, nome, requested_at')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    setPendentes((data as Solicitacao[]) || []);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (!isAdmin || pendentes.length === 0) return null;

  const aprovar = async (s: Solicitacao) => {
    const role = roles[s.id] || 'arquiteta';
    setBusy(s.id);
    const { error } = await (supabase.rpc as any)('esquadro_aprovar_solicitacao', { p_id: s.id, p_role: role });
    setBusy(null);
    if (error) {
      toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Acesso liberado', description: `${s.nome || s.email} agora é ${role}.` });
    load();
  };

  const recusar = async (s: Solicitacao) => {
    setBusy(s.id);
    const { error } = await (supabase.rpc as any)('esquadro_recusar_solicitacao', { p_id: s.id });
    setBusy(null);
    if (error) {
      toast({ title: 'Erro ao recusar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Solicitação recusada' });
    load();
  };

  return (
    <div className="bg-card border border-primary/20 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="w-4 h-4 text-primary" />
        <p className="font-semibold">Solicitações de acesso ({pendentes.length})</p>
      </div>
      <div className="space-y-1">
        {pendentes.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{s.nome || '—'}</p>
              <p className="text-xs text-muted-foreground truncate">{s.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select
                value={roles[s.id] || 'arquiteta'}
                onValueChange={(v) => setRoles((r) => ({ ...r, [s.id]: v }))}
              >
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arquiteta">Arquiteta</SelectItem>
                  <SelectItem value="comum">Comum</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={busy === s.id} onClick={() => aprovar(s)} title="Aprovar">
                <Check className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={busy === s.id} onClick={() => recusar(s)} title="Recusar">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SolicitacoesAcessoCard;
