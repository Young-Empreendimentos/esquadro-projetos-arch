import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, ChevronDown, ChevronRight, CalendarIcon, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const CustosIncorridos = () => {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [horas, setHoras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter options data
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [tiposProjeto, setTiposProjeto] = useState<any[]>([]);

  // Multi-select filters
  const [selEmps, setSelEmps] = useState<string[]>([]);
  const [selStatus, setSelStatus] = useState<string[]>([]);
  const [selTipos, setSelTipos] = useState<string[]>([]);
  const [selArqs, setSelArqs] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Sort, collapse & view mode
  const [sortBy, setSortBy] = useState<'custo' | 'horas'>('custo');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'projetos' | 'medias'>('projetos');
  const [incluirRateio, setIncluirRateio] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const [demRes, usrRes, horasRes, empRes, statusRes, tipoRes] = await Promise.all([
        supabase.from('esquadro_demandas').select(`
          id, horas_estimadas, arquiteta_id,
          empreendimento:esquadro_empreendimentos(id, nome),
          tipo_projeto:esquadro_tipos_projeto(id, nome),
          status:esquadro_status(id, nome)
        `),
        supabase.from('esquadro_profiles').select('id, nome, email, custo_hora'),
        supabase.from('esquadro_registro_horas').select('demanda_id, user_id, horas, data, motivo_nao_trabalho_id'),
        supabase.from('esquadro_empreendimentos').select('*').eq('ativo', true).order('nome'),
        supabase.from('esquadro_status').select('*').eq('ativo', true).order('ordem'),
        supabase.from('esquadro_tipos_projeto').select('*').eq('ativo', true).order('nome'),
      ]);

      setDemandas(demRes.data || []);
      setUsuarios(usrRes.data || []);
      setHoras(horasRes.data || []);
      setEmpreendimentos(empRes.data || []);
      setStatusList(statusRes.data || []);
      setTiposProjeto(tipoRes.data || []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const toggleFilter = (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setArr(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleOpen = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Arquitetas that appear in demandas
  const arquitetas = useMemo(() => {
    const ids = new Set(demandas.map((d: any) => d.arquiteta_id).filter(Boolean));
    return usuarios.filter((u: any) => ids.has(u.id));
  }, [demandas, usuarios]);

  const custosPorDemanda = useMemo(() => {
    return demandas
      .filter((d: any) => {
        if (selEmps.length > 0 && !selEmps.includes(d.empreendimento?.id)) return false;
        if (selStatus.length > 0 && !selStatus.includes(d.status?.id)) return false;
        if (selTipos.length > 0 && !selTipos.includes(d.tipo_projeto?.id)) return false;
        if (selArqs.length > 0 && !selArqs.includes(d.arquiteta_id)) return false;
        return true;
      })
      .map((d: any) => {
        let horasDemanda = horas.filter((h: any) => h.demanda_id === d.id);

        // Date filter on horas
        if (dateFrom) {
          const from = format(dateFrom, 'yyyy-MM-dd');
          horasDemanda = horasDemanda.filter((h: any) => h.data >= from);
        }
        if (dateTo) {
          const to = format(dateTo, 'yyyy-MM-dd');
          horasDemanda = horasDemanda.filter((h: any) => h.data <= to);
        }

        const totalHoras = horasDemanda.reduce((s: number, h: any) => s + (h.horas || 0), 0);

        let custoTotal = 0;
        const porUsuario: Record<string, { horas: number; custo: number; nome: string }> = {};

        horasDemanda.forEach((h: any) => {
          const usr = usuarios.find((u: any) => u.id === h.user_id);
          const custoHora = usr?.custo_hora || 0;
          const custo = (h.horas || 0) * custoHora;
          custoTotal += custo;

          if (!porUsuario[h.user_id]) {
            porUsuario[h.user_id] = { horas: 0, custo: 0, nome: usr?.nome || usr?.email || 'Desconhecido' };
          }
          porUsuario[h.user_id].horas += h.horas || 0;
          porUsuario[h.user_id].custo += custo;
        });

        return {
          ...d,
          totalHoras,
          custoTotal,
          porUsuario,
          progresso: d.horas_estimadas ? Math.min((totalHoras / d.horas_estimadas) * 100, 100) : 0,
        };
      })
      .filter((d: any) => d.totalHoras > 0)
      .sort((a: any, b: any) =>
        sortBy === 'custo' ? b.custoTotal - a.custoTotal : b.totalHoras - a.totalHoras
      );
  }, [demandas, horas, usuarios, selEmps, selStatus, selTipos, selArqs, dateFrom, dateTo, sortBy]);

  const custoGeral = custosPorDemanda.reduce((s, d) => s + d.custoTotal, 0);
  const horasGeral = custosPorDemanda.reduce((s, d) => s + d.totalHoras, 0);

  // Average cost by project type
  const mediasPorTipo = useMemo(() => {
    const source = incluirRateio ? rateioData : custosPorDemanda;
    const map: Record<string, { nome: string; total: number; count: number }> = {};
    source.forEach((d: any) => {
      const tipoNome = d.tipo_projeto?.nome || 'Sem tipo';
      const tipoId = d.tipo_projeto?.id || 'sem';
      if (!map[tipoId]) map[tipoId] = { nome: tipoNome, total: 0, count: 0 };
      map[tipoId].total += incluirRateio ? (d.custoComRateio || d.custoTotal) : d.custoTotal;
      map[tipoId].count += 1;
    });
    return Object.values(map)
      .map(m => ({ ...m, media: m.count > 0 ? m.total / m.count : 0 }))
      .sort((a, b) => b.media - a.media);
  }, [custosPorDemanda, rateioData, incluirRateio]);

  // Rateio de horas não trabalhadas
  const rateioData = useMemo(() => {
    let nonWorkHours = horas.filter((h: any) => h.motivo_nao_trabalho_id != null);
    if (dateFrom) {
      const from = format(dateFrom, 'yyyy-MM-dd');
      nonWorkHours = nonWorkHours.filter((h: any) => h.data >= from);
    }
    if (dateTo) {
      const to = format(dateTo, 'yyyy-MM-dd');
      nonWorkHours = nonWorkHours.filter((h: any) => h.data <= to);
    }
    if (selArqs.length > 0) {
      nonWorkHours = nonWorkHours.filter((h: any) => selArqs.includes(h.user_id));
    }

    const nonWorkByUser: Record<string, number> = {};
    nonWorkHours.forEach((h: any) => {
      nonWorkByUser[h.user_id] = (nonWorkByUser[h.user_id] || 0) + (h.horas || 0);
    });

    const workByUserProject: Record<string, Record<string, number>> = {};
    const totalWorkByUser: Record<string, number> = {};
    custosPorDemanda.forEach((d: any) => {
      Object.entries(d.porUsuario as Record<string, any>).forEach(([userId, userData]: [string, any]) => {
        if (!workByUserProject[userId]) workByUserProject[userId] = {};
        workByUserProject[userId][d.id] = userData.horas;
        totalWorkByUser[userId] = (totalWorkByUser[userId] || 0) + userData.horas;
      });
    });

    const rateioByProject: Record<string, { rateioHoras: number; rateioCusto: number }> = {};
    Object.entries(nonWorkByUser).forEach(([userId, nwHoras]) => {
      const usr = usuarios.find((u: any) => u.id === userId);
      const custoHora = usr?.custo_hora || 0;
      const totalWork = totalWorkByUser[userId] || 0;
      if (totalWork === 0) return;
      const userProjects = workByUserProject[userId] || {};
      Object.entries(userProjects).forEach(([demandaId, workHoras]) => {
        const proportion = workHoras / totalWork;
        if (!rateioByProject[demandaId]) rateioByProject[demandaId] = { rateioHoras: 0, rateioCusto: 0 };
        rateioByProject[demandaId].rateioHoras += nwHoras * proportion;
        rateioByProject[demandaId].rateioCusto += nwHoras * proportion * custoHora;
      });
    });

    return custosPorDemanda.map((d: any) => ({
      ...d,
      rateioHoras: rateioByProject[d.id]?.rateioHoras || 0,
      rateioCusto: rateioByProject[d.id]?.rateioCusto || 0,
      custoComRateio: d.custoTotal + (rateioByProject[d.id]?.rateioCusto || 0),
    }));
  }, [custosPorDemanda, horas, usuarios, dateFrom, dateTo, selArqs]);

  const totalRateio = rateioData.reduce((s, d) => s + d.rateioCusto, 0);

  const totalNonWorkFiltered = useMemo(() => {
    let nw = horas.filter((h: any) => h.motivo_nao_trabalho_id != null);
    if (dateFrom) nw = nw.filter((h: any) => h.data >= format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) nw = nw.filter((h: any) => h.data <= format(dateTo, 'yyyy-MM-dd'));
    if (selArqs.length > 0) nw = nw.filter((h: any) => selArqs.includes(h.user_id));
    return nw.reduce((s: number, h: any) => s + (h.horas || 0), 0);
  }, [horas, dateFrom, dateTo, selArqs]);

  const MultiSelectFilter = ({
    label,
    options,
    selected,
    onToggle,
  }: {
    label: string;
    options: { id: string; nome: string }[];
    selected: string[];
    onToggle: (id: string) => void;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-between gap-1 min-w-[140px]">
          <span className="truncate">
            {selected.length === 0 ? label : `${label} (${selected.length})`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 pointer-events-auto" align="start">
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {options.map(opt => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(opt.id)}
                onCheckedChange={() => onToggle(opt.id)}
              />
              <span className="truncate">{opt.nome}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Custo Total</p>
            <p className="text-2xl font-bold mt-1">
              {loading ? '—' : `R$ ${custoGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>
        <div className="bg-card border rounded-lg p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total de Horas</p>
            <p className="text-2xl font-bold mt-1">{loading ? '—' : `${horasGeral}h`}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <CalendarIcon className="h-3.5 w-3.5" />
          Período
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 min-w-[140px] justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Data início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={pt} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 min-w-[140px] justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Data fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={pt} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Filtros
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MultiSelectFilter
              label="Empreendimento"
              options={empreendimentos}
              selected={selEmps}
              onToggle={(id) => toggleFilter(selEmps, setSelEmps, id)}
            />
            <MultiSelectFilter
              label="Status"
              options={statusList}
              selected={selStatus}
              onToggle={(id) => toggleFilter(selStatus, setSelStatus, id)}
            />
            <MultiSelectFilter
              label="Tipo de Projeto"
              options={tiposProjeto}
              selected={selTipos}
              onToggle={(id) => toggleFilter(selTipos, setSelTipos, id)}
            />
            <MultiSelectFilter
              label="Arquiteta"
              options={arquitetas.map((a: any) => ({ id: a.id, nome: a.nome || a.email }))}
              selected={selArqs}
              onToggle={(id) => toggleFilter(selArqs, setSelArqs, id)}
            />
          </div>
        </div>

        <div className="border-t pt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'custo' | 'horas')}>
              <SelectTrigger className="h-9 w-[170px]">
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custo">Ordenar por Custo</SelectItem>
                <SelectItem value="horas">Ordenar por Horas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(selEmps.length > 0 || selStatus.length > 0 || selTipos.length > 0 || selArqs.length > 0 || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground"
              onClick={() => { setSelEmps([]); setSelStatus([]); setSelTipos([]); setSelArqs([]); setDateFrom(undefined); setDateTo(undefined); }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('projetos')}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            viewMode === 'projetos'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Relação de Projetos
        </button>
        <button
          onClick={() => setViewMode('medias')}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            viewMode === 'medias'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Média de Custos
        </button>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'projetos' ? (
        <>
          {/* Toggle rateio */}
          <div className="flex items-center gap-3">
            <Button
              variant={incluirRateio ? "default" : "outline"}
              size="sm"
              onClick={() => setIncluirRateio(!incluirRateio)}
            >
              {incluirRateio ? 'Com Rateio de Não-Trabalho' : 'Sem Rateio de Não-Trabalho'}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : custosPorDemanda.length === 0 ? (
            <div className="bg-card border rounded-lg p-12 text-center">
              <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum custo registrado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(incluirRateio ? rateioData : custosPorDemanda).map((d: any) => {
                const isOpen = openIds.has(d.id);
                const displayCusto = incluirRateio ? d.custoComRateio : d.custoTotal;
                return (
                  <Collapsible key={d.id} open={isOpen} onOpenChange={() => toggleOpen(d.id)}>
                    <CollapsibleTrigger asChild>
                      <div className="bg-card border rounded-lg px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          }
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{d.empreendimento?.nome}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{d.tipo_projeto?.nome}</span>
                              <Badge variant="outline" className="text-xs px-1.5 py-0">
                                {d.status?.nome}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold tabular-nums whitespace-nowrap">
                            R$ {displayCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          {incluirRateio && d.rateioCusto > 0 && (
                            <p className="text-xs text-primary tabular-nums">
                              +R$ {d.rateioCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} rateio
                            </p>
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="bg-card border border-t-0 rounded-b-lg px-5 pb-4 pt-2 -mt-1">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm text-muted-foreground">
                            {d.totalHoras}h {d.horas_estimadas ? `/ ${d.horas_estimadas}h estimadas` : ''}
                          </p>
                        </div>

                        {d.horas_estimadas && (
                          <div className="mb-3">
                            <Progress value={d.progresso} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {d.progresso.toFixed(0)}% das horas estimadas
                            </p>
                          </div>
                        )}

                        <div className="border-t pt-3 space-y-1.5">
                          {Object.values(d.porUsuario as Record<string, any>).map((u: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{u.nome}</span>
                              <div className="flex items-center gap-4">
                                <span className="tabular-nums text-muted-foreground">{u.horas}h</span>
                                <span className="tabular-nums font-medium">
                                  R$ {u.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Non-work as pseudo-project when NOT using rateio */}
              {!incluirRateio && totalNonWorkFiltered > 0 && (() => {
                const nonWorkCost = (() => {
                  let nw = horas.filter((h: any) => h.motivo_nao_trabalho_id != null);
                  if (dateFrom) nw = nw.filter((h: any) => h.data >= format(dateFrom, 'yyyy-MM-dd'));
                  if (dateTo) nw = nw.filter((h: any) => h.data <= format(dateTo, 'yyyy-MM-dd'));
                  if (selArqs.length > 0) nw = nw.filter((h: any) => selArqs.includes(h.user_id));
                  return nw.reduce((s: number, h: any) => {
                    const usr = usuarios.find((u: any) => u.id === h.user_id);
                    return s + (h.horas || 0) * (usr?.custo_hora || 0);
                  }, 0);
                })();
                const isOpen = openIds.has('__nao_trabalho__');
                return (
                  <Collapsible open={isOpen} onOpenChange={() => toggleOpen('__nao_trabalho__')}>
                    <CollapsibleTrigger asChild>
                      <div className="bg-card border rounded-lg px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors border-dashed">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          }
                          <div className="min-w-0">
                            <p className="font-semibold truncate text-muted-foreground">Horas Não-Trabalho</p>
                            <span className="text-xs text-muted-foreground">{totalNonWorkFiltered.toFixed(1)}h no período</span>
                          </div>
                        </div>
                        <p className="text-lg font-bold tabular-nums whitespace-nowrap ml-4 text-muted-foreground">
                          R$ {nonWorkCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="bg-card border border-t-0 border-dashed rounded-b-lg px-5 pb-4 pt-2 -mt-1">
                        <p className="text-xs text-muted-foreground">
                          Este custo representa as horas alocadas em motivos de não-trabalho. Ative "Com Rateio" para distribuir proporcionalmente entre os projetos.
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })()}
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : mediasPorTipo.length === 0 ? (
            <div className="bg-card border rounded-lg p-12 text-center">
              <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum dado para exibir.</p>
            </div>
          ) : (
            <div className="bg-card border rounded-lg p-5 space-y-4">
              <h2 className="font-semibold">Média de Custo por Tipo de Projeto</h2>
              <div className="space-y-3">
                {mediasPorTipo.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{m.nome}</p>
                      <p className="text-xs text-muted-foreground">{m.count} projeto{m.count > 1 ? 's' : ''} · Total: R$ {m.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      R$ {m.media.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CustosIncorridos;
