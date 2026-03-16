import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, Pin, PinOff, Megaphone, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const Comentarios = () => {
  const { user, profile, isAdmin } = useAuth();
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [comentariosPauta, setComentariosPauta] = useState<any[]>([]);
  const [demandas, setDemandas] = useState<any[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDemanda, setFilterDemanda] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all'); // 'all' | 'pauta' | 'comentario'
  const [novoTexto, setNovoTexto] = useState('');
  const [novoDemandaId, setNovoDemandaId] = useState('');
  const [sending, setSending] = useState(false);
  const [modoPauta, setModoPauta] = useState(false);
  const [editingPautaId, setEditingPautaId] = useState<string | null>(null);
  const [editingPautaTexto, setEditingPautaTexto] = useState('');

  useEffect(() => {
    const fetchRefData = async () => {
      const [empRes, demRes, profRes] = await Promise.all([
        supabase.from('esquadro_empreendimentos').select('*').eq('ativo', true).order('nome'),
        supabase.from('esquadro_demandas').select(`
          id,
          empreendimento_id,
          empreendimento:esquadro_empreendimentos(nome),
          tipo_projeto:esquadro_tipos_projeto(nome)
        `).order('created_at', { ascending: false }),
        supabase.from('esquadro_profiles').select('id, nome, email'),
      ]);
      setEmpreendimentos(empRes.data || []);
      setDemandas(demRes.data || []);
      const map: Record<string, any> = {};
      (profRes.data || []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    };
    fetchRefData();
  }, []);

  const fetchComentarios = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('esquadro_comentarios')
      .select(`
        *,
        demanda:esquadro_demandas(
          id,
          empreendimento_id,
          empreendimento:esquadro_empreendimentos(nome),
          tipo_projeto:esquadro_tipos_projeto(nome)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (filterDemanda !== 'all') {
      query = query.eq('demanda_id', filterDemanda);
    }

    const { data, error } = await query;
    if (!error) {
      let result = data || [];
      if (filterEmp !== 'all') {
        result = result.filter((c: any) => c.demanda?.empreendimento_id === filterEmp);
      }
      setComentarios(result);
    }
    setLoading(false);
  }, [filterEmp, filterDemanda]);

  const fetchComentariosPauta = useCallback(async () => {
    const { data, error } = await (supabase
      .from('esquadro_comentarios_pauta' as any) as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setComentariosPauta(data || []);
    }
  }, []);

  useEffect(() => { fetchComentarios(); }, [fetchComentarios]);
  useEffect(() => { fetchComentariosPauta(); }, [fetchComentariosPauta]);

  const filteredDemandas = filterEmp === 'all'
    ? demandas
    : demandas.filter((d: any) => d.empreendimento_id === filterEmp);

  const handleSend = async () => {
    if (!novoTexto.trim()) {
      toast({ title: 'Escreva o comentário', variant: 'destructive' });
      return;
    }

    if (modoPauta) {
      setSending(true);
      const { error } = await (supabase.from('esquadro_comentarios_pauta' as any) as any).insert({
        user_id: user?.id,
        conteudo: novoTexto.trim(),
        fixado: false,
      });
      if (error) {
        toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Comentário-pauta enviado' });
        setNovoTexto('');
        fetchComentariosPauta();
      }
      setSending(false);
    } else {
      if (!novoDemandaId) {
        toast({ title: 'Selecione uma demanda', variant: 'destructive' });
        return;
      }
      setSending(true);
      const { error } = await supabase.from('esquadro_comentarios').insert({
        demanda_id: novoDemandaId,
        user_id: user?.id,
        conteudo: novoTexto.trim(),
      });
      if (error) {
        toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Comentário enviado' });
        setNovoTexto('');
        fetchComentarios();
      }
      setSending(false);
    }
  };

  const toggleFixar = async (id: string, currentFixado: boolean) => {
    const { error } = await (supabase
      .from('esquadro_comentarios_pauta' as any) as any)
      .update({ fixado: !currentFixado })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: currentFixado ? 'Comentário desafixado' : 'Comentário fixado' });
      fetchComentariosPauta();
    }
  };

  const handleDeletePauta = async (id: string) => {
    const { error } = await (supabase
      .from('esquadro_comentarios_pauta' as any) as any)
      .delete()
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Comentário-pauta excluído' });
      fetchComentariosPauta();
    }
  };

  const handleEditPauta = async (id: string) => {
    if (!editingPautaTexto.trim()) return;
    const { error } = await (supabase
      .from('esquadro_comentarios_pauta' as any) as any)
      .update({ conteudo: editingPautaTexto.trim() })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao editar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Comentário-pauta atualizado' });
      setEditingPautaId(null);
      fetchComentariosPauta();
    }
  };

  // Merge both comment types into unified feed
  const unifiedFeed = (() => {
    const items: any[] = [];
    if (filterTipo !== 'comentario' && filterDemanda === 'all' && filterEmp === 'all') {
      comentariosPauta.forEach((cp) => {
        items.push({ ...cp, _type: 'pauta', _sortDate: cp.created_at });
      });
    }
    if (filterTipo !== 'pauta') {
      comentarios.forEach((c) => {
        items.push({ ...c, _type: 'comentario', _sortDate: c.created_at });
      });
    }
    // Pure chronological order, most recent first
    items.sort((a, b) => new Date(b._sortDate).getTime() - new Date(a._sortDate).getTime());
    return items;
  })();

  const getUserDisplay = (userId: string) => {
    const p = profiles[userId];
    return p?.nome || p?.email || 'Usuário';
  };

  const getUserInitial = (userId: string) => {
    return getUserDisplay(userId).charAt(0).toUpperCase();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Unified input block */}
      <div className={`bg-card border rounded-lg p-4 space-y-3 ${modoPauta ? 'border-primary/30' : ''}`}>
        <div className="flex items-center gap-3">
          {!modoPauta && (
            <Select value={novoDemandaId} onValueChange={setNovoDemandaId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Selecione a demanda" />
              </SelectTrigger>
              <SelectContent>
                {demandas.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.empreendimento?.nome} — {d.tipo_projeto?.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {modoPauta && (
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Comentário-Pauta (Direção)</span>
            </div>
          )}

          {isAdmin && (
            <Button
              variant={modoPauta ? 'default' : 'outline'}
              size="sm"
              className="ml-auto gap-1.5 text-xs"
              onClick={() => setModoPauta(!modoPauta)}
            >
              <Megaphone className="w-3.5 h-3.5" />
              {modoPauta ? 'Pauta ativo' : 'Pauta'}
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Textarea
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            placeholder={modoPauta ? 'Escreva um comunicado da direção...' : 'Escreva seu comentário...'}
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
            }}
          />
          <Button onClick={handleSend} disabled={sending} size="icon" className="self-end h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="pauta">Apenas Comentários-Pauta</SelectItem>
            <SelectItem value="comentario">Apenas Comentários</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEmp} onValueChange={(v) => { setFilterEmp(v); setFilterDemanda('all'); }}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Empreendimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os empreendimentos</SelectItem>
            {empreendimentos.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDemanda} onValueChange={setFilterDemanda}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Demanda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as demandas</SelectItem>
            {filteredDemandas.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>
                {d.empreendimento?.nome} — {d.tipo_projeto?.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Unified comments feed */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>}
        {!loading && unifiedFeed.length === 0 && (
          <div className="bg-card border rounded-lg p-12 flex flex-col items-center text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum comentário encontrado.</p>
          </div>
        )}
        {!loading && unifiedFeed.map((item: any) => {
          if (item._type === 'pauta') {
            const isEditing = editingPautaId === item.id;
            return (
              <div
                key={`pauta-${item.id}`}
                className={`bg-card border rounded-lg p-4 ${item.fixado ? 'border-primary/30 bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                      {getUserInitial(item.user_id)}
                    </div>
                    <span className="text-xs font-medium">{getUserDisplay(item.user_id)}</span>
                    <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                      <Megaphone className="w-2.5 h-2.5" /> Pauta
                    </Badge>
                    {item.fixado && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                        <Pin className="w-2.5 h-2.5" /> Fixado
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">
                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {isAdmin && !isEditing && (
                      <>
                        <button
                          onClick={() => toggleFixar(item.id, item.fixado)}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title={item.fixado ? 'Desafixar' : 'Fixar'}
                        >
                          {item.fixado ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => { setEditingPautaId(item.id); setEditingPautaTexto(item.conteudo); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir comentário-pauta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePauta(item.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex gap-2 items-end">
                    <Textarea
                      value={editingPautaTexto}
                      onChange={(e) => setEditingPautaTexto(e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button size="icon" variant="ghost" onClick={() => handleEditPauta(item.id)} title="Salvar">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingPautaId(null)} title="Cancelar">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{item.conteudo}</p>
                )}
              </div>
            );
          }

          return (
            <div key={`com-${item.id}`} className="bg-card border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold">
                    {getUserInitial(item.user_id)}
                  </div>
                  <span className="text-xs font-medium">{getUserDisplay(item.user_id)}</span>
                  <p className="text-xs text-muted-foreground">
                    {item.demanda?.empreendimento?.nome} — {item.demanda?.tipo_projeto?.nome}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{item.conteudo}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Comentarios;
