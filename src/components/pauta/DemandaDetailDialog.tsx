import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Send, Pencil, Check, X, AlertTriangle, Plus, Trash2, ChevronDown, History, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-muted text-muted-foreground',
};

interface DemandaDetailDialogProps {
  demanda: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
}

const DemandaDetailDialog = ({ demanda, open, onOpenChange, onRefresh }: DemandaDetailDialogProps) => {
  const { user, isAdmin, profile } = useAuth();
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [novoTexto, setNovoTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [updatingPrioridade, setUpdatingPrioridade] = useState(false);
  const [editingInstrucoes, setEditingInstrucoes] = useState(false);
  const [instrucoes, setInstrucoes] = useState('');
  const [savingInstrucoes, setSavingInstrucoes] = useState(false);
  const [editingHoras, setEditingHoras] = useState(false);
  const [horasEstimadas, setHorasEstimadas] = useState('');
  const [impugnacoes, setImpugnacoes] = useState<any[]>([]);
  const [novaImpugnacao, setNovaImpugnacao] = useState('');
  const [novaImpugnacaoData, setNovaImpugnacaoData] = useState('');
  const [addingImpugnacao, setAddingImpugnacao] = useState(false);
  const [showImpugnacaoForm, setShowImpugnacaoForm] = useState(false);
  const [horasConsumidas, setHorasConsumidas] = useState<number>(0);
  const [editingPrazo, setEditingPrazo] = useState(false);
  const [prazoValue, setPrazoValue] = useState('');
  const [editingConclusao, setEditingConclusao] = useState(false);
  const [conclusaoValue, setConclusaoValue] = useState('');
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  const canEditInstrucoes = isAdmin || profile?.role === 'arquiteta';

  useEffect(() => {
    if (!demanda || !open) return;
    fetchComentarios();
    fetchImpugnacoes();
    fetchHorasConsumidas();
    fetchStatusHistory();
  }, [demanda, open]);

  const fetchStatusHistory = async () => {
    if (!demanda) return;
    const [histRes, statusRes] = await Promise.all([
      supabase
        .from('esquadro_status_historico')
        .select('*')
        .eq('demanda_id', demanda.id)
        .order('created_at', { ascending: false }),
      supabase.from('esquadro_status').select('id, nome'),
    ]);
    const sMap: Record<string, string> = {};
    (statusRes.data || []).forEach((s: any) => { sMap[s.id] = s.nome; });
    const hist = histRes.data || [];
    // attach user names
    const userIds = [...new Set(hist.map((h: any) => h.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from('esquadro_profiles').select('id, nome, email').in('id', userIds);
      const pMap = new Map((profs || []).map((p: any) => [p.id, p]));
      hist.forEach((h: any) => { h.usuario = pMap.get(h.user_id) || null; });
    }
    setStatusMap(sMap);
    setStatusHistory(hist);
  };

  const handleDeleteHistoryEntry = async (entryId: string) => {
    if (!demanda) return;
    if (!confirm('Excluir esta mudança de status? O status atual será revertido para a mudança mais recente restante.')) return;
    const { error } = await supabase.from('esquadro_status_historico').delete().eq('id', entryId);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    // Re-evaluate current status from remaining history
    const { data: remaining } = await supabase
      .from('esquadro_status_historico')
      .select('status_novo_id')
      .eq('demanda_id', demanda.id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (remaining && remaining[0]) {
      const newStatusId = remaining[0].status_novo_id;
      await supabase.from('esquadro_demandas').update({ status_id: newStatusId }).eq('id', demanda.id);
      demanda.status_id = newStatusId;
      if (demanda.status) demanda.status = { ...demanda.status, id: newStatusId, nome: statusMap[newStatusId] || '' };
    }
    fetchStatusHistory();
    onRefresh?.();
  };

  const fetchComentarios = async () => {
    if (!demanda) return;
    setLoadingComments(true);
    const { data } = await supabase
      .from('esquadro_comentarios')
      .select('*')
      .eq('demanda_id', demanda.id)
      .order('created_at', { ascending: false });

    const comments = data || [];
    if (comments.length > 0) {
      const userIds = [...new Set(comments.map((c: any) => c.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('esquadro_profiles')
          .select('id, nome, email')
          .in('id', userIds);
        const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
        comments.forEach((c: any) => {
          c.usuario = profileMap.get(c.user_id) || null;
        });
      }
    }
    setComentarios(comments);
    setLoadingComments(false);
  };

  const fetchImpugnacoes = async () => {
    if (!demanda) return;
    const { data } = await supabase
      .from('esquadro_impugnacoes')
      .select('*')
      .eq('demanda_id', demanda.id)
      .order('data', { ascending: false });
    setImpugnacoes(data || []);
  };

  const fetchHorasConsumidas = async () => {
    if (!demanda) return;
    const { data } = await supabase
      .from('esquadro_registro_horas')
      .select('horas')
      .eq('demanda_id', demanda.id);
    setHorasConsumidas((data || []).reduce((sum: number, r: any) => sum + (r.horas || 0), 0));
  };

  const handleAddImpugnacao = async () => {
    if (!demanda || !novaImpugnacao.trim()) return;
    setAddingImpugnacao(true);
    const { error } = await supabase.from('esquadro_impugnacoes').insert({
      demanda_id: demanda.id,
      descricao: novaImpugnacao.trim(),
      data: novaImpugnacaoData || new Date().toISOString().split('T')[0],
    });
    if (error) {
      toast({ title: 'Erro ao registrar impugnação', description: error.message, variant: 'destructive' });
    } else {
      setNovaImpugnacao('');
      setNovaImpugnacaoData('');
      setShowImpugnacaoForm(false);
      fetchImpugnacoes();
      onRefresh?.();
    }
    setAddingImpugnacao(false);
  };

  const handleDeleteImpugnacao = async (id: string) => {
    const { error } = await supabase.from('esquadro_impugnacoes').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      fetchImpugnacoes();
      onRefresh?.();
    }
  };

  const handleSend = async () => {
    if (!novoTexto.trim() || !user || !demanda) return;
    setSending(true);
    const { error } = await supabase.from('esquadro_comentarios').insert({
      demanda_id: demanda.id,
      user_id: user.id,
      conteudo: novoTexto.trim(),
    });
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } else {
      setNovoTexto('');
      fetchComentarios();
    }
    setSending(false);
  };

  const handlePrioridadeChange = async (value: string) => {
    if (!demanda) return;
    setUpdatingPrioridade(true);
    const { error } = await supabase
      .from('esquadro_demandas')
      .update({ prioridade: Number(value) })
      .eq('id', demanda.id);
    if (error) {
      toast({ title: 'Erro ao atualizar prioridade', description: error.message, variant: 'destructive' });
    } else {
      demanda.prioridade = Number(value);
      onRefresh?.();
    }
    setUpdatingPrioridade(false);
  };

  const handleSaveInstrucoes = async () => {
    if (!demanda) return;
    setSavingInstrucoes(true);
    const { error } = await supabase
      .from('esquadro_demandas')
      .update({ instrucoes: instrucoes.trim() })
      .eq('id', demanda.id);
    if (error) {
      toast({ title: 'Erro ao salvar instruções', description: error.message, variant: 'destructive' });
    } else {
      demanda.instrucoes = instrucoes.trim();
      setEditingInstrucoes(false);
      onRefresh?.();
    }
    setSavingInstrucoes(false);
  };

  const handleSaveHorasEstimadas = async () => {
    if (!demanda) return;
    const value = horasEstimadas === '' ? null : Number(horasEstimadas);
    const { error } = await supabase
      .from('esquadro_demandas')
      .update({ horas_estimadas: value })
      .eq('id', demanda.id);
    if (error) {
      toast({ title: 'Erro ao salvar horas', description: error.message, variant: 'destructive' });
    } else {
      demanda.horas_estimadas = value;
      setEditingHoras(false);
      onRefresh?.();
    }
  };

  const handleSavePrazo = async () => {
    if (!demanda) return;
    const value = prazoValue || null;
    const { error } = await supabase
      .from('esquadro_demandas')
      .update({ prazo: value })
      .eq('id', demanda.id);
    if (error) {
      toast({ title: 'Erro ao salvar prazo', description: error.message, variant: 'destructive' });
    } else {
      demanda.prazo = value;
      setEditingPrazo(false);
      onRefresh?.();
    }
  };

  const handleSaveConclusao = async () => {
    if (!demanda) return;
    const value = conclusaoValue || null;
    const update: any = { data_conclusao: value };
    // If data_conclusao is set, force status to "Concluído"
    if (value) {
      const { data: concluido } = await supabase
        .from('esquadro_status')
        .select('id, nome')
        .ilike('nome', 'Concluído')
        .limit(1)
        .maybeSingle();
      if (concluido?.id) {
        update.status_id = concluido.id;
      }
    }
    const { error } = await supabase
      .from('esquadro_demandas')
      .update(update)
      .eq('id', demanda.id);
    if (error) {
      toast({ title: 'Erro ao salvar conclusão', description: error.message, variant: 'destructive' });
    } else {
      const previousStatusId = demanda.status_id;
      demanda.data_conclusao = value;
      if (update.status_id && update.status_id !== previousStatusId) {
        await supabase.from('esquadro_status_historico').insert({
          demanda_id: demanda.id,
          status_anterior_id: previousStatusId || null,
          status_novo_id: update.status_id,
          observacao: 'Status alterado automaticamente ao definir data de conclusão.',
          user_id: user?.id || null,
        });
        demanda.status_id = update.status_id;
        if (demanda.status) demanda.status = { ...demanda.status, id: update.status_id, nome: 'Concluído' };
        fetchStatusHistory();
      }
      setEditingConclusao(false);
      onRefresh?.();
    }
  };

  if (!demanda) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {demanda.empreendimento?.nome || '—'}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">Prioridade:</span>
            <Select
              value={String(demanda.prioridade)}
              onValueChange={handlePrioridadeChange}
              disabled={updatingPrioridade}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Alta</SelectItem>
                <SelectItem value="2">Média</SelectItem>
                <SelectItem value="3">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogDescription className="flex items-center gap-2 text-sm flex-wrap">
            {demanda.tipo_projeto?.nome || '—'} · Status: {demanda.status?.nome || '—'}
            {editingPrazo ? (
              <span className="inline-flex items-center gap-1">
                · Prazo:
                <Input
                  type="date"
                  value={prazoValue}
                  onChange={(e) => setPrazoValue(e.target.value)}
                  className="w-36 h-6 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSavePrazo}>
                  <Check className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingPrazo(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </span>
            ) : (
              <span
                className={isAdmin ? 'cursor-pointer hover:underline' : ''}
                onClick={isAdmin ? () => { setPrazoValue(demanda.prazo || ''); setEditingPrazo(true); } : undefined}
              >
                · Prazo: {demanda.prazo ? format(new Date(demanda.prazo + 'T00:00:00'), 'dd/MM/yyyy') : (isAdmin ? 'Definir' : '—')}
              </span>
            )}
            {editingConclusao ? (
              <span className="inline-flex items-center gap-1">
                · Conclusão:
                <Input
                  type="date"
                  value={conclusaoValue}
                  onChange={(e) => setConclusaoValue(e.target.value)}
                  className="w-36 h-6 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSaveConclusao}>
                  <Check className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingConclusao(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </span>
            ) : (
              <span
                className={isAdmin ? 'cursor-pointer hover:underline' : ''}
                onClick={isAdmin ? () => { setConclusaoValue(demanda.data_conclusao || ''); setEditingConclusao(true); } : undefined}
              >
                · Conclusão: {demanda.data_conclusao ? format(new Date(demanda.data_conclusao + 'T00:00:00'), 'dd/MM/yyyy') : (isAdmin ? 'Definir' : '—')}
              </span>
            )}
            {editingHoras ? (
              <span className="inline-flex items-center gap-1 ml-1">
                · <Input
                  type="number"
                  step="0.5"
                  value={horasEstimadas}
                  onChange={(e) => setHorasEstimadas(e.target.value)}
                  className="w-20 h-6 text-xs inline"
                />
                h
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSaveHorasEstimadas}>
                  <Check className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingHoras(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </span>
            ) : (
              <span
                className="cursor-pointer hover:underline ml-1"
                onClick={() => { setHorasEstimadas(demanda.horas_estimadas != null ? String(demanda.horas_estimadas) : ''); setEditingHoras(true); }}
              >
                · {demanda.horas_estimadas != null ? `${demanda.horas_estimadas}h estimadas` : 'Definir horas'}
              </span>
            )}
            {horasConsumidas > 0 && (
              <span className="ml-1 text-primary font-medium">· {horasConsumidas}h consumidas</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
          {/* Instruções */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Instruções</h4>
              {canEditInstrucoes && !editingInstrucoes && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => { setInstrucoes(demanda.instrucoes || ''); setEditingInstrucoes(true); }}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Editar
                </Button>
              )}
            </div>
            {editingInstrucoes ? (
              <div className="space-y-2">
                <Textarea
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                  className="min-h-[80px] text-sm"
                />
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditingInstrucoes(false)} disabled={savingInstrucoes}>
                    <X className="w-3 h-3 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" className="h-7" onClick={handleSaveInstrucoes} disabled={savingInstrucoes}>
                    <Check className="w-3 h-3 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap min-h-[60px]">
                {demanda.instrucoes || 'Nenhuma instrução registrada.'}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Impugnações - collapsible */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                Impugnações ({impugnacoes.length})
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowImpugnacaoForm(!showImpugnacaoForm)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Registrar
              </Button>
            </div>
            {showImpugnacaoForm && (
              <div className="space-y-2 bg-muted rounded-md p-3">
                <Textarea
                  placeholder="Descrição da impugnação..."
                  value={novaImpugnacao}
                  onChange={(e) => setNovaImpugnacao(e.target.value)}
                  className="min-h-[60px] text-sm"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={novaImpugnacaoData}
                    onChange={(e) => setNovaImpugnacaoData(e.target.value)}
                    className="w-40 h-7 text-xs"
                  />
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowImpugnacaoForm(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddImpugnacao} disabled={addingImpugnacao || !novaImpugnacao.trim()}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}
            {impugnacoes.length === 0 && !showImpugnacaoForm ? (
              <p className="text-xs text-muted-foreground">Nenhuma impugnação registrada.</p>
            ) : (
              <div className="space-y-1">
                {impugnacoes.map((imp) => (
                  <Collapsible key={imp.id}>
                    <div className="border border-destructive/20 rounded-md">
                      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-muted/50 rounded-md transition-colors">
                        <span className="text-xs font-medium text-destructive flex items-center gap-2">
                          {format(new Date(imp.data), 'dd/MM/yyyy')}
                          <span className="text-muted-foreground font-normal truncate max-w-[300px]">
                            {imp.descricao?.substring(0, 60)}{imp.descricao?.length > 60 ? '...' : ''}
                          </span>
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3">
                          <p className="text-sm whitespace-pre-wrap">{imp.descricao}</p>
                          <div className="flex justify-end mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteImpugnacao(imp.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Comentários */}
          <div className="space-y-3 pb-2">
            <h4 className="text-sm font-semibold">Comentários ({comentarios.length})</h4>
            {loadingComments ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : comentarios.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum comentário ainda.</p>
            ) : (
              <div className="space-y-3">
                {comentarios.map((c) => (
                  <div key={c.id} className="bg-card border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{c.usuario?.nome || c.usuario?.email || 'Usuário'}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.conteudo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New comment */}
        <div className="flex gap-2 mt-2">
          <Textarea
            placeholder="Escreva um comentário..."
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
            }}
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !novoTexto.trim()} className="self-end">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemandaDetailDialog;
