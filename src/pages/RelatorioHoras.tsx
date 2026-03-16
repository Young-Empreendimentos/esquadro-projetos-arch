import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Visualizacao = 'semanal' | 'mensal';

const DAY_NAMES_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const RelatorioHoras = () => {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUsuario, setFilterUsuario] = useState('all');
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('semanal');
  const [refDate, setRefDate] = useState(new Date());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const periodStart = useMemo(() =>
    visualizacao === 'semanal'
      ? startOfWeek(refDate, { weekStartsOn: 1 })
      : startOfMonth(refDate),
    [refDate, visualizacao]
  );

  const periodEnd = useMemo(() =>
    visualizacao === 'semanal'
      ? endOfWeek(refDate, { weekStartsOn: 1 })
      : endOfMonth(refDate),
    [refDate, visualizacao]
  );

  const days = useMemo(() => eachDayOfInterval({ start: periodStart, end: periodEnd }), [periodStart, periodEnd]);

  useEffect(() => {
    supabase.from('esquadro_profiles').select('id, nome, email').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios(data || []));
  }, []);

  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    const dateFrom = format(periodStart, 'yyyy-MM-dd');
    const dateTo = format(periodEnd, 'yyyy-MM-dd');

    let query = supabase
      .from('esquadro_registro_horas')
      .select('user_id, data, horas, demanda_id, motivo_nao_trabalho_id')
      .gte('data', dateFrom)
      .lte('data', dateTo);

    if (filterUsuario !== 'all') {
      query = query.eq('user_id', filterUsuario);
    }

    const [regRes, demRes] = await Promise.all([
      query,
      supabase.from('esquadro_demandas').select(`
        id,
        empreendimento:esquadro_empreendimentos(nome),
        tipo_projeto:esquadro_tipos_projeto(nome)
      `),
    ]);

    setRegistros(regRes.data || []);
    setDemandas(demRes.data || []);
    setLoading(false);
  }, [periodStart, periodEnd, filterUsuario]);

  useEffect(() => { fetchRegistros(); }, [fetchRegistros]);

  const navigate = (dir: number) => {
    setRefDate(prev =>
      visualizacao === 'semanal'
        ? (dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1))
        : (dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1))
    );
  };

  const toggleUser = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const expandAll = () => setExpandedUsers(new Set(usersData.map(u => u.id)));
  const collapseAll = () => setExpandedUsers(new Set());

  // Build grouped data: user -> demandas with hours
  const usersData = useMemo(() => {
    const userIds = filterUsuario !== 'all'
      ? [filterUsuario]
      : [...new Set(registros.map(r => r.user_id))];

    return userIds.map(userId => {
      const usr = usuarios.find(u => u.id === userId);
      const userRegs = registros.filter(r => r.user_id === userId);

      // Get unique demanda_ids with hours
      const demandaIds = [...new Set(userRegs.filter(r => r.demanda_id).map(r => r.demanda_id))];

      const userDemandas = demandaIds.map(dId => {
        const dem = demandas.find(d => d.id === dId);
        const label = dem
          ? `${dem.empreendimento?.nome || '—'} · ${dem.tipo_projeto?.nome || '—'}`
          : 'Demanda desconhecida';

        const horasPorDia: Record<string, number> = {};
        userRegs.filter(r => r.demanda_id === dId).forEach(r => {
          horasPorDia[r.data] = (horasPorDia[r.data] || 0) + (r.horas || 0);
        });

        const total = Object.values(horasPorDia).reduce((s, h) => s + h, 0);
        return { demandaId: dId, label, horasPorDia, total };
      }).sort((a, b) => b.total - a.total);

      // Total per day for this user
      const userTotalPorDia: Record<string, number> = {};
      userRegs.forEach(r => {
        const d = r.data;
        userTotalPorDia[d] = (userTotalPorDia[d] || 0) + (r.horas || 0);
      });
      const userTotal = Object.values(userTotalPorDia).reduce((s, h) => s + h, 0);

      return {
        id: userId,
        nome: usr?.nome || usr?.email || userId,
        demandas: userDemandas,
        totalPorDia: userTotalPorDia,
        total: userTotal,
      };
    }).filter(u => u.total > 0).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [registros, filterUsuario, usuarios, demandas]);

  const getDayTotal = (dateStr: string) =>
    registros.filter(r => r.data === dateStr).reduce((sum, r) => sum + (r.horas || 0), 0);

  const grandTotal = registros.reduce((sum, r) => sum + (r.horas || 0), 0);

  const periodLabel = visualizacao === 'semanal'
    ? `${format(periodStart, "dd 'de' MMMM", { locale: ptBR })} — ${format(periodEnd, "dd 'de' MMMM yyyy", { locale: ptBR })}`
    : format(periodStart, "MMMM 'de' yyyy", { locale: ptBR });

  const allExpanded = usersData.length > 0 && expandedUsers.size === usersData.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={visualizacao} onValueChange={(v) => setVisualizacao(v as Visualizacao)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semanal">Semanal</SelectItem>
            <SelectItem value="mensal">Mensal</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterUsuario} onValueChange={setFilterUsuario}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os usuários</SelectItem>
            {usuarios.map(u => (
              <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {usersData.length > 1 && (
          <Button variant="outline" size="sm" className="text-xs" onClick={allExpanded ? collapseAll : expandAll}>
            {allExpanded ? 'Recolher todos' : 'Expandir todos'}
          </Button>
        )}
      </div>

      {/* Period navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium min-w-[260px] text-center capitalize">
          {periodLabel}
        </span>
        <Button variant="outline" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[240px] sticky left-0 bg-muted z-10">
                Profissional / Projeto
              </th>
              {days.map((day, i) => {
                const isWeekend = isSaturday(day) || isSunday(day);
                return (
                  <th key={i} className={`text-center px-1 py-3 font-medium min-w-[52px] ${isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                    <div className="text-[10px]">{visualizacao === 'semanal' ? DAY_NAMES_SHORT[i] : format(day, 'EEE', { locale: ptBR })}</div>
                    <div className="text-[10px] font-normal">{format(day, 'dd')}</div>
                  </th>
                );
              })}
              <th className="text-center px-3 py-3 font-medium text-muted-foreground min-w-[60px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={days.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            ) : usersData.length === 0 ? (
              <tr>
                <td colSpan={days.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              <>
                {usersData.map(usr => {
                  const isExpanded = expandedUsers.has(usr.id);
                  return (
                    <React.Fragment key={usr.id}>
                      {/* User summary row */}
                      <tr
                        className="border-t bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleUser(usr.id)}
                      >
                        <td className="px-4 py-2.5 font-medium text-xs sticky left-0 bg-muted/30 z-10">
                          <div className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            }
                            <span>{usr.nome}</span>
                            <span className="text-muted-foreground font-normal ml-1">
                              ({usr.demandas.length} {usr.demandas.length === 1 ? 'projeto' : 'projetos'})
                            </span>
                          </div>
                        </td>
                        {days.map((day, i) => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const val = usr.totalPorDia[dateStr] || 0;
                          const isWeekend = isSaturday(day) || isSunday(day);
                          return (
                            <td key={i} className={cn('px-1 py-2.5 text-center text-xs tabular-nums font-medium', isWeekend && 'bg-muted/20')}>
                              {val > 0 ? val : <span className="text-muted-foreground/30">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center font-bold text-xs tabular-nums">
                          {usr.total > 0 ? `${usr.total}h` : '—'}
                        </td>
                      </tr>

                      {/* Expanded: project rows */}
                      {isExpanded && usr.demandas.map(dem => (
                        <tr key={dem.demandaId} className="border-t border-dashed">
                          <td className="pl-10 pr-4 py-1.5 text-xs text-muted-foreground sticky left-0 bg-card z-10 truncate max-w-[240px]">
                            {dem.label}
                          </td>
                          {days.map((day, i) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const val = dem.horasPorDia[dateStr] || 0;
                            const isWeekend = isSaturday(day) || isSunday(day);
                            return (
                              <td key={i} className={cn('px-1 py-1.5 text-center text-[11px] tabular-nums', isWeekend && 'bg-muted/20')}>
                                {val > 0 ? val : <span className="text-muted-foreground/20">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-center text-xs tabular-nums text-muted-foreground">
                            {dem.total > 0 ? `${dem.total}h` : '—'}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Grand totals */}
                {usersData.length > 1 && (
                  <tr className="border-t-2 border-primary/20 bg-muted/50 font-medium">
                    <td className="px-4 py-3 sticky left-0 bg-muted/50 z-10 text-xs">Total Geral</td>
                    {days.map((day, i) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const val = getDayTotal(dateStr);
                      return (
                        <td key={i} className="px-1 py-3 text-center text-xs tabular-nums">
                          {val > 0 ? val : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center text-sm tabular-nums font-bold">
                      {grandTotal}h
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RelatorioHoras;
