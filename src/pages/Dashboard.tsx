import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, ClipboardList, AlertTriangle, Clock, CheckCircle2, Users, Target, Megaphone, Pin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const HORAS_PADRAO: Record<number, number> = {
  1: 8.75, // segunda
  2: 8.5,  // terça
  3: 8.5,  // quarta
  4: 8.5,  // quinta
  5: 8.5,  // sexta
  6: 0,    // sábado
  0: 0,    // domingo
};

const ALOCACAO_INICIO = new Date('2026-02-23');

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-muted text-muted-foreground',
};

const Dashboard = () => {
  const { profile, isAdmin } = useAuth();
  const [stats, setStats] = useState({
    empreendimentos: 0,
    emAndamento: 0,
    atrasadas: 0,
    horasMes: 0,
    horasNaoTrabalho: 0,
    concluidas: 0,
    totalDemandas: 0,
  });
  const [urgentes, setUrgentes] = useState<any[]>([]);
  const [recentes, setRecentes] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [pautasFixadas, setPautasFixadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Indicador de conclusão no prazo
  const [allDemandasRaw, setAllDemandasRaw] = useState<any[]>([]);
  const [allStatusRaw, setAllStatusRaw] = useState<any[]>([]);
  const [allHorasRaw, setAllHorasRaw] = useState<any[]>([]);
  const [allStatusHistRaw, setAllStatusHistRaw] = useState<any[]>([]);
  const [allArquitetas, setAllArquitetas] = useState<any[]>([]);
  const [indicadorArqFilter, setIndicadorArqFilter] = useState('all');
  const [indicadorModalOpen, setIndicadorModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch pinned pautas + profiles for user info
      const [pautasRes, profilesRes] = await Promise.all([
        (supabase.from('esquadro_comentarios_pauta' as any) as any)
          .select('*')
          .eq('fixado', true)
          .order('created_at', { ascending: false }),
        supabase.from('esquadro_profiles').select('id, nome, email'),
      ]);
      const profilesMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profilesMap[p.id] = p; });
      setPautasFixadas((pautasRes.data || []).map((cp: any) => ({
        ...cp,
        _autorNome: profilesMap[cp.user_id]?.nome || profilesMap[cp.user_id]?.email || 'Direção',
        _autorInitial: (profilesMap[cp.user_id]?.nome || profilesMap[cp.user_id]?.email || 'D').charAt(0).toUpperCase(),
      })));
      const now = new Date();
      const mesInicio = format(startOfMonth(now), 'yyyy-MM-dd');
      const mesFim = format(endOfMonth(now), 'yyyy-MM-dd');

      const [empRes, demRes, horasRes, statusRes, allHorasRes, arqRes] = await Promise.all([
        supabase.from('esquadro_empreendimentos').select('id', { count: 'exact' }).eq('ativo', true),
        supabase.from('esquadro_demandas').select(`
          *,
          empreendimento:esquadro_empreendimentos(nome),
          status:esquadro_status(id, nome),
          tipo_projeto:esquadro_tipos_projeto(nome)
        `).order('prioridade').order('prazo'),
        supabase.from('esquadro_registro_horas').select('horas, user_id, demanda_id, motivo_nao_trabalho_id')
          .gte('data', mesInicio).lte('data', mesFim),
        supabase.from('esquadro_status').select('id, nome').eq('ativo', true),
        supabase.from('esquadro_registro_horas').select('demanda_id, data'),
        supabase.from('esquadro_profiles').select('id, nome, email, role').eq('ativo', true).eq('role', 'arquiteta'),
      ]);

      const allDemandas = demRes.data || [];
      const allStatus = statusRes.data || [];

      // Find status IDs by normalized name matching
      const findStatusIds = (keywords: string[]) =>
        allStatus
          .filter((s: any) => keywords.some((k) => s.nome.toLowerCase().includes(k)))
          .map((s: any) => s.id);

      const emAndamentoIds = findStatusIds(['andamento']);
      const concluidoIds = findStatusIds(['conclu']);
      const canceladoIds = findStatusIds(['cancel']);
      const finishedIds = [...concluidoIds, ...canceladoIds];

      const emAndamento = allDemandas.filter((d: any) => emAndamentoIds.includes(d.status_id));
      const concluidas = allDemandas.filter((d: any) => concluidoIds.includes(d.status_id));
      const atrasadas = allDemandas.filter(
        (d: any) => d.prazo && new Date(d.prazo) < now && !finishedIds.includes(d.status_id)
      );

      // Hours this month - filter by user if not admin
      const horasData = horasRes.data || [];
      const horasFiltered = isAdmin
        ? horasData
        : horasData.filter((h: any) => h.user_id === profile?.id);
      const horasWork = horasFiltered.filter((h: any) => h.demanda_id != null);
      const horasNonWork = horasFiltered.filter((h: any) => h.motivo_nao_trabalho_id != null);
      const horasTotal = horasWork.reduce((sum: number, r: any) => sum + (r.horas || 0), 0);
      const horasNaoTrabalho = horasNonWork.reduce((sum: number, r: any) => sum + (r.horas || 0), 0);

      setStats({
        empreendimentos: empRes.count || 0,
        emAndamento: emAndamento.length,
        atrasadas: atrasadas.length,
        horasMes: horasTotal,
        horasNaoTrabalho: horasNaoTrabalho,
        concluidas: concluidas.length,
        totalDemandas: allDemandas.length,
      });

      // Top urgentes (closest deadline, not finished)
      const urgentesList = allDemandas
        .filter((d: any) => d.prazo && !finishedIds.includes(d.status_id))
        .sort((a: any, b: any) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime())
        .slice(0, 5);
      setUrgentes(urgentesList);

      // Most recently created
      const recentesList = [...allDemandas]
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setRecentes(recentesList);

      // Pendências de alocação de horas (arquitetas)
      const ontem = startOfDay(subDays(new Date(), 1));
      const inicioAlocacao = startOfDay(ALOCACAO_INICIO);
      if (!isBefore(ontem, inicioAlocacao)) {
        // Fetch all arquitetas
        const { data: arquitetas } = await supabase
          .from('esquadro_profiles')
          .select('id, nome, email, role')
          .eq('ativo', true)
          .eq('role', 'arquiteta');

        // Fetch all hour registrations from start date
        const { data: allHoras } = await supabase
          .from('esquadro_registro_horas')
          .select('user_id, data, horas')
          .gte('data', format(inicioAlocacao, 'yyyy-MM-dd'))
          .lte('data', format(ontem, 'yyyy-MM-dd'));

        const horasMap: Record<string, Record<string, number>> = {};
        (allHoras || []).forEach((r: any) => {
          if (!horasMap[r.user_id]) horasMap[r.user_id] = {};
          horasMap[r.user_id][r.data] = (horasMap[r.user_id][r.data] || 0) + (r.horas || 0);
        });

        const diasCheck = eachDayOfInterval({ start: inicioAlocacao, end: ontem });
        const pendList: any[] = [];

        (arquitetas || []).forEach((arq: any) => {
          const userHoras = horasMap[arq.id] || {};
          const gaps: { data: string; esperado: number; alocado: number }[] = [];

          diasCheck.forEach((dia) => {
            const esperado = HORAS_PADRAO[getDay(dia)] || 0;
            if (esperado === 0) return; // skip weekends
            const dateStr = format(dia, 'yyyy-MM-dd');
            const alocado = userHoras[dateStr] || 0;
            if (alocado < esperado) {
              gaps.push({ data: dateStr, esperado, alocado });
            }
          });

          if (gaps.length > 0) {
            const totalFaltante = gaps.reduce((s, g) => s + (g.esperado - g.alocado), 0);
            pendList.push({
              id: arq.id,
              nome: arq.nome || arq.email,
              diasPendentes: gaps.length,
              horasFaltantes: totalFaltante,
              gaps: gaps.slice(-5), // show last 5 gaps
            });
          }
        });

        setPendencias(pendList.sort((a, b) => b.horasFaltantes - a.horasFaltantes));
      }

      // Store raw data for indicator
      setAllDemandasRaw(allDemandas);
      setAllStatusRaw(allStatus);
      setAllHorasRaw(allHorasRes.data || []);
      setAllArquitetas(arqRes.data || []);

      // Fetch status history (paginated to avoid 1000-row cap)
      const histAll: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('esquadro_status_historico')
          .select('demanda_id, status_anterior_id, status_novo_id, created_at')
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        histAll.push(...data);
        if (data.length < pageSize) break;
      }
      setAllStatusHistRaw(histAll);

      setLoading(false);
    };
    fetchData();
  }, [profile?.id, isAdmin]);

  const statCards = [
    { label: 'Total de Demandas', value: stats.totalDemandas, icon: ClipboardList, color: 'bg-primary' },
    { label: 'Em Andamento', value: stats.emAndamento, icon: Clock, color: 'bg-accent' },
    { label: 'Atrasadas', value: stats.atrasadas, icon: AlertTriangle, color: 'bg-destructive' },
    { label: 'Concluídas', value: stats.concluidas, icon: CheckCircle2, color: 'bg-primary' },
    { label: 'Empreendimentos', value: stats.empreendimentos, icon: Building2, color: 'bg-accent' },
    { label: isAdmin ? 'Horas no Mês (Equipe)' : 'Minhas Horas no Mês', value: `${stats.horasMes.toFixed(1)}h`, icon: Users, color: 'bg-primary' },
    { label: 'Não-Trabalho (Mês)', value: `${stats.horasNaoTrabalho.toFixed(1)}h`, icon: Clock, color: 'bg-accent' },
  ];

  // Indicador de conclusão no prazo - semestral
  const indicadorData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const isFirstHalf = now.getMonth() < 6;
    const semStart = isFirstHalf ? `${year}-01-01` : `${year}-07-01`;
    const semEnd = isFirstHalf ? `${year}-06-30` : `${year}-12-31`;
    const semLabel = isFirstHalf ? `1º Semestre ${year}` : `2º Semestre ${year}`;

    // "Em andamento" status ids (any case/variation)
    const emAndamentoIds = new Set(
      allStatusRaw
        .filter((s: any) => (s.nome || '').toLowerCase().includes('andamento'))
        .map((s: any) => s.id)
    );
    // Target statuses considered for "completion" goal (Concluído, Em análise interno/externo)
    const targetStatusIds = new Set(
      allStatusRaw
        .filter((s: any) => {
          const n = (s.nome || '').toLowerCase();
          return n.includes('conclu') || n.includes('análise interno') || n.includes('analise interno')
            || n.includes('análise externo') || n.includes('analise externo');
        })
        .map((s: any) => s.id)
    );

    // Group status history by demanda (already sorted ascending in the fetch)
    const histByDem: Record<string, any[]> = {};
    allStatusHistRaw.forEach((h: any) => {
      (histByDem[h.demanda_id] = histByDem[h.demanda_id] || []).push(h);
    });

    // For each demanda, find the last transition OUT of "em andamento"
    const lastExitMap: Record<string, string> = {};
    Object.entries(histByDem).forEach(([demId, arr]) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const h = arr[i];
        if (h.status_anterior_id && emAndamentoIds.has(h.status_anterior_id) && !emAndamentoIds.has(h.status_novo_id)) {
          lastExitMap[demId] = (h.created_at || '').slice(0, 10);
          break;
        }
      }
    });

    // Effective completion date: manual override (data_conclusao) > last exit from "em andamento"
    const getEffectiveDate = (d: any): string => {
      if (d.data_conclusao) return String(d.data_conclusao).slice(0, 10);
      return lastExitMap[d.id] || '';
    };

    // Filter demandas: have prazo, currently in a target status, completion in semester
    const elegiveis = allDemandasRaw.filter((d: any) => {
      if (!d.prazo) return false;
      if (indicadorArqFilter !== 'all' && d.arquiteta_id !== indicadorArqFilter) return false;
      if (!targetStatusIds.has(d.status_id)) return false;
      const eff = getEffectiveDate(d);
      if (!eff) return false;
      return eff >= semStart && eff <= semEnd;
    });

    const noPrazo = elegiveis.filter((d: any) => getEffectiveDate(d) <= d.prazo);

    const detalhes = elegiveis.map((d: any) => {
      const completionDate = getEffectiveDate(d);
      return {
        id: d.id,
        empreendimento: d.empreendimento?.nome || '—',
        tipo: d.tipo_projeto?.nome || '—',
        prazo: d.prazo,
        dataConclusao: completionDate,
        noPrazo: completionDate <= d.prazo,
      };
    });

    const percentual = elegiveis.length > 0 ? (noPrazo.length / elegiveis.length) * 100 : null;

    return { semLabel, total: elegiveis.length, noPrazo: noPrazo.length, percentual, detalhes };
  }, [allDemandasRaw, allStatusRaw, allStatusHistRaw, indicadorArqFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      {!isAdmin && (
        <p className="text-muted-foreground text-sm">{`Olá, ${profile?.nome || 'Bem-vindo(a)'}!`}</p>
      )}

      {/* Pendências de alocação de horas */}
      {pendencias.length > 0 && (
        <Link to="/pendencias-horas" className="block">
          <div className="bg-card border border-destructive/20 rounded-lg p-5 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h2 className="text-lg font-semibold">Pendências de Alocação de Horas</h2>
              </div>
              <Badge variant="destructive">{pendencias.length} {pendencias.length === 1 ? 'profissional' : 'profissionais'}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {pendencias.reduce((s: number, p: any) => s + p.horasFaltantes, 0).toFixed(1)}h faltantes no total. Clique para ver detalhes.
            </p>
          </div>
        </Link>
      )}

      {/* Indicador de Conclusão no Prazo */}
      {!loading && (
        <div className="bg-card border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Conclusão no Prazo</h2>
              <span className="text-xs text-muted-foreground">({indicadorData.semLabel})</span>
            </div>
            <Select value={indicadorArqFilter} onValueChange={setIndicadorArqFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Filtrar por arquiteta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as arquitetas</SelectItem>
                {allArquitetas.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome || a.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {indicadorData.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum projeto concluído com prazo neste semestre.</p>
          ) : (
            <div
              className="flex items-center gap-6 cursor-pointer hover:bg-accent/20 rounded-lg p-3 -m-3 transition-colors"
              onClick={() => setIndicadorModalOpen(true)}
            >
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    className="stroke-muted"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    className={indicadorData.percentual! >= 70 ? 'stroke-primary' : 'stroke-destructive'}
                    strokeWidth="3"
                    strokeDasharray={`${indicadorData.percentual}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{indicadorData.percentual!.toFixed(0)}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{indicadorData.noPrazo}</span> de{' '}
                  <span className="font-semibold">{indicadorData.total}</span> projetos concluídos no prazo
                </p>
                <p className="text-xs text-muted-foreground mt-1">Clique para ver a memória de cálculo</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comentários-pauta fixados */}
      {pautasFixadas.length > 0 && (
        <div className="bg-card border border-primary/20 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Comunicados da Direção</h2>
          </div>
          <div className="space-y-3">
            {pautasFixadas.map((cp: any) => (
              <div key={cp.id} className="border border-primary/10 rounded-lg p-4 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                      {cp._autorInitial}
                    </div>
                    <span className="text-xs font-medium">{cp._autorNome}</span>
                    <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                      <Pin className="w-2.5 h-2.5" /> Fixado
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(cp.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{cp.conteudo}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={indicadorModalOpen} onOpenChange={setIndicadorModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Memória de Cálculo — Conclusão no Prazo ({indicadorData.semLabel})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm">
                <strong>Fórmula:</strong> Projetos concluídos no prazo ÷ Total de projetos concluídos com prazo
              </p>
              <p className="text-sm mt-1">
                <strong>Resultado:</strong> {indicadorData.noPrazo} ÷ {indicadorData.total} ={' '}
                {indicadorData.percentual !== null ? `${indicadorData.percentual.toFixed(1)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                * Data de conclusão baseada no último registro de horas do projeto.
                Projetos sem prazo definido não entram no cálculo.
              </p>
            </div>

            {indicadorData.detalhes.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-3 font-medium">Projeto</th>
                      <th className="text-left p-3 font-medium">Tipo</th>
                      <th className="text-left p-3 font-medium">Prazo</th>
                      <th className="text-left p-3 font-medium">Conclusão</th>
                      <th className="text-center p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadorData.detalhes.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="p-3">{d.empreendimento}</td>
                        <td className="p-3 text-muted-foreground">{d.tipo}</td>
                        <td className="p-3 tabular-nums">{format(new Date(d.prazo + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                        <td className="p-3 tabular-nums">{format(new Date(d.dataConclusao + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                        <td className="p-3 text-center">
                          <Badge variant={d.noPrazo ? 'default' : 'destructive'} className="text-xs">
                            {d.noPrazo ? 'No prazo' : 'Atrasado'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card border rounded-lg p-5 flex items-start gap-4">
            <div className={`${stat.color} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>
              <stat.icon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{loading ? '—' : stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demandas Urgentes */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-4">Demandas com Prazo Próximo</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : urgentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma demanda com prazo definido.</p>
          ) : (
            <div className="space-y-3">
              {urgentes.map((d: any) => {
                const isLate = d.prazo && new Date(d.prazo) < new Date();
                return (
                  <div key={d.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{d.empreendimento?.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {d.tipo_projeto?.nome} · {d.status?.nome}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3 flex items-center gap-2">
                      <Badge className={`text-[10px] ${prioridadeColor[d.prioridade] || ''}`}>
                        {prioridadeLabel[d.prioridade] || '—'}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(d.prazo), 'dd/MM/yyyy')}
                        </p>
                        {isLate && (
                          <p className="text-xs text-destructive font-medium">Atrasada</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Últimas demandas criadas */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="text-lg font-semibold mb-4">Demandas Recentes</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma demanda registrada.</p>
          ) : (
            <div className="space-y-3">
              {recentes.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{d.empreendimento?.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.tipo_projeto?.nome} · {d.status?.nome}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <Badge className={`text-[10px] ${prioridadeColor[d.prioridade] || ''}`}>
                      {prioridadeLabel[d.prioridade] || '—'}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(d.created_at), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
