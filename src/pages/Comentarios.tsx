import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, Send, Pin, PinOff, Megaphone } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

const Comentarios = () => {
  const { user, profile, isAdmin } = useAuth();
  const [comentarios, setComentarios] = useState<any[]>([]);
  const [demandas, setDemandas] = useState<any[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDemanda, setFilterDemanda] = useState('all');
  const [novoTexto, setNovoTexto] = useState('');
  const [novoDemandaId, setNovoDemandaId] = useState('');
  const [sending, setSending] = useState(false);

  // Comentário-pauta state
  const [comentariosPauta, setComentariosPauta] = useState<any[]>([]);
  const [novoPautaTexto, setNovoPautaTexto] = useState('');
  const [sendingPauta, setSendingPauta] = useState(false);

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
      // Build profiles map
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

  useEffect(() => {
    fetchComentarios();
  }, [fetchComentarios]);

  useEffect(() => {
    fetchComentariosPauta();
  }, [fetchComentariosPauta]);

  const filteredDemandas = filterEmp === 'all'
    ? demandas
    : demandas.filter((d: any) => d.empreendimento_id === filterEmp);

  const handleSend = async () => {
    if (!novoTexto.trim() || !novoDemandaId) {
      toast({ title: 'Selecione uma demanda e escreva o comentário', variant: 'destructive' });
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
  };

  const handleSendPauta = async () => {
    if (!novoPautaTexto.trim()) {
      toast({ title: 'Escreva o comentário-pauta', variant: 'destructive' });
      return;
    }
    setSendingPauta(true);
    const { error } = await (supabase.from('esquadro_comentarios_pauta' as any) as any).insert({
      user_id: user?.id,
      conteudo: novoPautaTexto.trim(),
      fixado: false,
    });
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Comentário-pauta enviado' });
      setNovoPautaTexto('');
      fetchComentariosPauta();
    }
    setSendingPauta(false);
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

  // Merge both comment types into unified feed, sorted by date desc
  const unifiedFeed = (() => {
    const items: any[] = [];

    // Only include pautas if no demanda/empreendimento filter active
    if (filterDemanda === 'all' && filterEmp === 'all') {
      comentariosPauta.forEach((cp) => {
        items.push({
          ...cp,
          _type: 'pauta',
          _sortDate: cp.created_at,
        });
      });
    }

    comentarios.forEach((c) => {
      items.push({
        ...c,
        _type: 'comentario',
        _sortDate: c.created_at,
      });
    });

    // Sort: fixados first, then by date desc
    items.sort((a, b) => {
      if (a._type === 'pauta' && a.fixado && !(b._type === 'pauta' && b.fixado)) return -1;
      if (b._type === 'pauta' && b.fixado && !(a._type === 'pauta' && a.fixado)) return 1;
      return new Date(b._sortDate).getTime() - new Date(a._sortDate).getTime();
    });

    return items;
  })();

  const getUserDisplay = (userId: string) => {
    const p = profiles[userId];
    return p?.nome || p?.email || 'Usuário';
  };

  const getUserInitial = (userId: string) => {
    const display = getUserDisplay(userId);
    return display.charAt(0).toUpperCase();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Comentários</h1>
        <p className="text-muted-foreground text-sm mt-1">Comunicação por demanda</p>
      </div>

      {/* Comentário-pauta (admin only) */}
      {isAdmin && (
        <div className="bg-card border border-primary/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Comentário-Pauta (Direção)</span>
          </div>
          <div className="flex gap-3">
            <Textarea
              value={novoPautaTexto}
              onChange={(e) => setNovoPautaTexto(e.target.value)}
              placeholder="Escreva um comunicado da direção..."
              rows={2}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendPauta();
              }}
            />
            <Button onClick={handleSendPauta} disabled={sendingPauta} size="icon" className="self-end h-10 w-10">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* New comment */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex gap-3">
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
        </div>
        <div className="flex gap-3">
          <Textarea
            value={novoTexto}
            onChange={(e) => setNovoTexto(e.target.value)}
            placeholder="Escreva seu comentário..."
            rows={2}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={sending} size="icon" className="self-end h-10 w-10">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => toggleFixar(item.id, item.fixado)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={item.fixado ? 'Desafixar' : 'Fixar'}
                      >
                        {item.fixado ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{item.conteudo}</p>
              </div>
            );
          }

          // Regular comment
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