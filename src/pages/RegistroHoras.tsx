import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Save, Plus, X, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSaturday,
  isSunday,
  getDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAY_NAMES_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const HORAS_PADRAO: Record<number, number> = {
  1: 8.75,
  2: 8.5,
  3: 8.5,
  4: 8.5,
  5: 8.5,
  6: 0,
  0: 0,
};

type CellKey = string; // `${demanda_id}__${date}`
type CellData = {
  id?: string;
  horas: number | '';
  motivo_nao_trabalho_id: string | null;
};

// A "motivo row" is like a demanda row but for non-work reasons
type MotivoRow = {
  tempId: string;
  motivoId: string;
  horas: Record<string, number | ''>;  // date -> hours
  observacao: string;
};

const EM_ANDAMENTO_ID = '819a3d87-3884-4223-ac1b-7262434f0828';

const createTempId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint32Array(4);
    crypto.getRandomValues(bytes);
    return `tmp-${Array.from(bytes).map((b) => b.toString(16)).join('')}`;
  }

  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const RegistroHoras = () => {
  const { user, loading: authLoading } = useAuth();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [demandas, setDemandas] = useState<any[]>([]);
  const [cells, setCells] = useState<Record<CellKey, CellData>>({});
  const [motivos, setMotivos] = useState<any[]>([]);
  const [motivoRows, setMotivoRows] = useState<MotivoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusList, setStatusList] = useState<any[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>(EM_ANDAMENTO_ID);
  const [filterEmpreendimentos, setFilterEmpreendimentos] = useState<string[]>([]);
  const [empreendimentoPopoverOpen, setEmpreendimentoPopoverOpen] = useState(false);
  const [motivoModalOpen, setMotivoModalOpen] = useState(false);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  // Fetch filter options once
  useEffect(() => {
    const fetchFilters = async () => {
      const [s, e] = await Promise.all([
        supabase.from('esquadro_status').select('*').eq('ativo', true).order('ordem'),
        supabase.from('esquadro_empreendimentos').select('*').eq('ativo', true).order('nome'),
      ]);
      setStatusList(s.data || []);
      setEmpreendimentos(e.data || []);
    };
    fetchFilters();
  }, []);

  const fetchData = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    setLoading(true);

    try {
      const dateFrom = format(weekStart, 'yyyy-MM-dd');
      const dateTo = format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      let demandasQuery = supabase
        .from('esquadro_demandas')
        .select(`id, empreendimento_id, empreendimento:esquadro_empreendimentos(nome), tipo_projeto:esquadro_tipos_projeto(nome), status:esquadro_status(nome), status_id`)
        .order('prioridade');

      if (filterStatus !== 'all') {
        demandasQuery = demandasQuery.eq('status_id', filterStatus);
      }
      if (filterEmpreendimentos.length > 0) {
        demandasQuery = demandasQuery.in('empreendimento_id', filterEmpreendimentos);
      }

      const [demandasRes, horasRes, motivosRes] = await Promise.all([
        demandasQuery,
        supabase
          .from('esquadro_registro_horas')
          .select('*')
          .eq('user_id', user.id)
          .gte('data', dateFrom)
          .lte('data', dateTo),
        supabase
          .from('esquadro_motivos_nao_trabalho')
          .select('*')
          .eq('ativo', true)
          .order('nome'),
      ]);

      if (demandasRes.error) {
        console.error('Erro ao carregar demandas:', demandasRes.error.message);
        toast({ title: 'Erro ao carregar demandas', description: demandasRes.error.message, variant: 'destructive' });
      }
      if (horasRes.error) {
        console.error('Erro ao carregar horas:', horasRes.error.message);
        toast({ title: 'Erro ao carregar horas', description: horasRes.error.message, variant: 'destructive' });
      }
      if (motivosRes.error) {
        console.error('Erro ao carregar motivos:', motivosRes.error.message);
        toast({ title: 'Erro ao carregar motivos de ausência', description: motivosRes.error.message, variant: 'destructive' });
      }

      setDemandas(demandasRes.data || []);
      setMotivos(motivosRes.data || []);

      const cellMap: Record<CellKey, CellData> = {};
      const motivoMap: Record<string, Record<string, number>> = {};
      const motivoObsMap: Record<string, string> = {};

      (horasRes.data || []).forEach((r: any) => {
        if (r.demanda_id) {
          cellMap[`${r.demanda_id}__${r.data}`] = {
            id: r.id,
            horas: r.horas ?? '',
            motivo_nao_trabalho_id: null,
          };
        } else if (r.motivo_nao_trabalho_id) {
          if (!motivoMap[r.motivo_nao_trabalho_id]) motivoMap[r.motivo_nao_trabalho_id] = {};
          motivoMap[r.motivo_nao_trabalho_id][r.data] = r.horas || 0;
          if (r.observacao && !motivoObsMap[r.motivo_nao_trabalho_id]) {
            motivoObsMap[r.motivo_nao_trabalho_id] = r.observacao;
          }
        }
      });

      setCells(cellMap);

      const rows: MotivoRow[] = Object.entries(motivoMap).map(([motivoId, horas]) => ({
        tempId: createTempId(),
        motivoId,
        horas: Object.fromEntries(Object.entries(horas).map(([d, h]) => [d, h || ''])),
        observacao: motivoObsMap[motivoId] || '',
      }));
      setMotivoRows(rows);
    } catch (err) {
      console.error('Erro inesperado ao carregar dados:', err);
      toast({ title: 'Erro inesperado', description: 'Não foi possível carregar os dados. Tente recarregar a página.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, weekStart, filterStatus, filterEmpreendimentos]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateCell = (demandaId: string, date: string, horas: string) => {
    const key = `${demandaId}__${date}`;
    const val = horas === '' ? '' : parseFloat(horas);
    setCells((prev) => ({
      ...prev,
      [key]: { ...prev[key], horas: isNaN(val as number) ? '' : val },
    }));
  };

  const addMotivoRow = (motivoId: string) => {
    if (!motivoId) return;
    setMotivoRows((prev) => [...prev, { tempId: createTempId(), motivoId, horas: {}, observacao: '' }]);
    setMotivoModalOpen(false);
  };

  const removeMotivoRow = (tempId: string) => {
    setMotivoRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const updateMotivoRowMotivo = (tempId: string, motivoId: string) => {
    setMotivoRows((prev) => prev.map((r) => r.tempId === tempId ? { ...r, motivoId } : r));
  };

  const updateMotivoRowHoras = (tempId: string, date: string, value: string) => {
    const val = value === '' ? '' : parseFloat(value);
    setMotivoRows((prev) =>
      prev.map((r) =>
        r.tempId === tempId
          ? { ...r, horas: { ...r.horas, [date]: isNaN(val as number) ? '' : val } }
          : r
      )
    );
  };

  const updateMotivoRowObservacao = (tempId: string, value: string) => {
    setMotivoRows((prev) => prev.map((r) => r.tempId === tempId ? { ...r, observacao: value } : r));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const dateFrom = format(weekStart, 'yyyy-MM-dd');
    const dateTo = format(weekEnd, 'yyyy-MM-dd');

    // Only delete records for visible demandas and motivo rows (not ALL records)
    const visibleDemandaIds = demandas.map((d: any) => d.id);
    const visibleMotivoIds = motivoRows.map((r) => r.motivoId).filter(Boolean);

    // Delete demanda hours only for visible demandas
    if (visibleDemandaIds.length > 0) {
      await supabase
        .from('esquadro_registro_horas')
        .delete()
        .eq('user_id', user.id)
        .gte('data', dateFrom)
        .lte('data', dateTo)
        .in('demanda_id', visibleDemandaIds);
    }

    // Delete motivo hours (those without demanda_id)
    await supabase
      .from('esquadro_registro_horas')
      .delete()
      .eq('user_id', user.id)
      .gte('data', dateFrom)
      .lte('data', dateTo)
      .is('demanda_id', null);

    const inserts: any[] = [];

    // Demanda hours
    Object.entries(cells).forEach(([key, cell]) => {
      if (cell.horas === '' || cell.horas === 0) return;
      const [demanda_id, data] = key.split('__');
      // Only save cells for visible demandas
      if (!visibleDemandaIds.includes(demanda_id)) return;
      inserts.push({
        demanda_id,
        user_id: user.id,
        data,
        horas: Number(cell.horas),
        motivo_nao_trabalho_id: null,
      });
    });

    // Motivo rows
    motivoRows.forEach((row) => {
      if (!row.motivoId) return;
      Object.entries(row.horas).forEach(([data, h]) => {
        if (h === '' || h === 0) return;
        inserts.push({
          demanda_id: null,
          user_id: user.id,
          data,
          horas: Number(h),
          motivo_nao_trabalho_id: row.motivoId,
          observacao: row.observacao || null,
        });
      });
    });

    if (inserts.length > 0) {
      const { error } = await supabase.from('esquadro_registro_horas').insert(inserts);
      if (error) {
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
    }

    toast({ title: 'Horas salvas com sucesso' });
    setSaving(false);
    fetchData();
  };

  const getDayTotal = (date: string) => {
    const demandaHours = Object.entries(cells)
      .filter(([key]) => key.endsWith(`__${date}`))
      .reduce((sum, [, cell]) => sum + (typeof cell.horas === 'number' ? cell.horas : 0), 0);
    const motivoHours = motivoRows.reduce((sum, row) => {
      const h = row.horas[date];
      return sum + (typeof h === 'number' ? h : 0);
    }, 0);
    return demandaHours + motivoHours;
  };

  const getDemandaTotal = (demandaId: string) => {
    return Object.entries(cells)
      .filter(([key]) => key.startsWith(`${demandaId}__`))
      .reduce((sum, [, cell]) => sum + (typeof cell.horas === 'number' ? cell.horas : 0), 0);
  };

  const getMotivoRowTotal = (row: MotivoRow) => {
    return Object.values(row.horas).reduce<number>((sum, h) => sum + (typeof h === 'number' ? h : 0), 0);
  };

  const weekTotal = days.reduce((sum, day) => sum + getDayTotal(format(day, 'yyyy-MM-dd')), 0);
  const expectedTotal = days.reduce((sum, day) => sum + (HORAS_PADRAO[getDay(day)] || 0), 0);

  // Removed role restriction - admins and arquitetas can both use this page

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium min-w-[220px] text-center">
          {format(weekStart, "dd 'de' MMMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusList.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={empreendimentoPopoverOpen} onOpenChange={setEmpreendimentoPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-64 justify-between h-9 text-sm font-normal">
              {filterEmpreendimentos.length === 0
                ? 'Todos empreendimentos'
                : `${filterEmpreendimentos.length} selecionado(s)`}
              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar empreendimento..." />
              <CommandList>
                <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                <CommandGroup>
                  {empreendimentos.map((e: any) => {
                    const isSelected = filterEmpreendimentos.includes(e.id);
                    return (
                      <CommandItem
                        key={e.id}
                        value={e.nome}
                        onSelect={() => {
                          setFilterEmpreendimentos((prev) =>
                            isSelected ? prev.filter((id) => id !== e.id) : [...prev, e.id]
                          );
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                        {e.nome}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {filterEmpreendimentos.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {filterEmpreendimentos.map((id) => {
              const emp = empreendimentos.find((e: any) => e.id === id);
              return (
                <Badge key={id} variant="secondary" className="text-xs gap-1">
                  {emp?.nome}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => setFilterEmpreendimentos((prev) => prev.filter((i) => i !== id))}
                  />
                </Badge>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => setFilterEmpreendimentos([])}
            >
              Limpar
            </Button>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[220px] sticky left-0 bg-muted z-10">
                Atividade
              </th>
              {days.map((day, i) => {
                const isWeekend = isSaturday(day) || isSunday(day);
                return (
                  <th key={i} className={`text-center px-2 py-3 font-medium min-w-[80px] ${isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                    <div>{DAY_NAMES_SHORT[i]}</div>
                    <div className="text-xs font-normal">{format(day, 'dd/MM')}</div>
                  </th>
                );
              })}
              <th className="text-center px-3 py-3 font-medium text-muted-foreground min-w-[70px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && demandas.length === 0 && motivoRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma demanda encontrada.
                </td>
              </tr>
            )}

            {/* Demanda rows */}
            {!loading && demandas.map((d: any) => {
              const demandaTotal = getDemandaTotal(d.id);
              return (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2 sticky left-0 bg-card z-10">
                    <p className="font-medium text-xs truncate max-w-[200px]">
                      {d.empreendimento?.nome}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {d.tipo_projeto?.nome}
                    </p>
                  </td>
                  {days.map((day, i) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const key = `${d.id}__${dateStr}`;
                    const cell = cells[key];
                    const isWeekend = isSaturday(day) || isSunday(day);
                    return (
                      <td key={i} className={`px-1 py-2 text-center ${isWeekend ? 'bg-muted/30' : ''}`}>
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          max="24"
                          value={cell?.horas ?? ''}
                          onChange={(e) => updateCell(d.id, dateStr, e.target.value)}
                          className="w-16 mx-auto text-center h-8 text-xs tabular-nums"
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center font-medium tabular-nums text-xs">
                    {demandaTotal > 0 ? `${demandaTotal}h` : '—'}
                  </td>
                </tr>
              );
            })}

            {/* Separator between demandas and motivos */}
            {!loading && (demandas.length > 0 || motivoRows.length > 0) && (
              <tr className="border-t-2 border-dashed border-muted-foreground/20">
                <td colSpan={9} className="px-4 py-2 sticky left-0 bg-card z-10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Ausências
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        setMotivoModalOpen(true);
                      }}
                    >
                      <Plus className="w-3 h-3" />
                      Adicionar motivo
                    </Button>
                  </div>
                </td>
              </tr>
            )}

            {/* Motivo rows — each row = one reason with hours per day */}
            {!loading && motivoRows.map((row) => {
              const rowTotal = getMotivoRowTotal(row);
              const motivoNome = motivos.find((m: any) => m.id === row.motivoId)?.nome || 'Motivo desconhecido';
              const isAtivAdmin = motivoNome.toLowerCase().includes('administrativ');
              return (
                <Fragment key={row.tempId}>
                  <tr className="border-t border-dashed">
                    <td className="px-4 py-2 sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium truncate max-w-[170px]">
                          {motivoNome}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={(e) => {
                            e.preventDefault();
                            removeMotivoRow(row.tempId);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    {days.map((day, i) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isWeekend = isSaturday(day) || isSunday(day);
                      return (
                        <td key={i} className={`px-1 py-2 text-center ${isWeekend ? 'bg-muted/30' : ''}`}>
                          <Input
                            type="number"
                            step="0.25"
                            min="0"
                            max="24"
                            value={row.horas[dateStr] ?? ''}
                            onChange={(e) => updateMotivoRowHoras(row.tempId, dateStr, e.target.value)}
                            className="w-16 mx-auto text-center h-8 text-xs tabular-nums"
                            disabled={!row.motivoId}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-medium tabular-nums text-xs text-muted-foreground">
                      {rowTotal > 0 ? `${rowTotal}h` : '—'}
                    </td>
                  </tr>
                  {isAtivAdmin && (
                    <tr>
                      <td colSpan={9} className="px-4 py-2">
                        <Textarea
                          placeholder="Descreva as atividades administrativas realizadas..."
                          value={row.observacao}
                          onChange={(e) => updateMotivoRowObservacao(row.tempId, e.target.value)}
                          className="text-xs min-h-[50px]"
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {/* Totals row */}
            {!loading && (demandas.length > 0 || motivoRows.length > 0) && (
              <tr className="border-t-2 border-primary/20 bg-muted/50 font-medium">
                <td className="px-4 py-3 sticky left-0 bg-muted/50 z-10 text-sm">Total do Dia</td>
                {days.map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayTotal = getDayTotal(dateStr);
                  const expected = HORAS_PADRAO[getDay(day)] || 0;
                  const isOver = dayTotal > expected && expected > 0;
                  const isUnder = dayTotal < expected && dayTotal > 0;
                  return (
                    <td key={i} className="px-2 py-3 text-center text-xs tabular-nums">
                      <span className={isOver ? 'text-accent font-bold' : isUnder ? 'text-muted-foreground' : ''}>
                        {dayTotal > 0 ? `${dayTotal}h` : '—'}
                      </span>
                      <div className="text-[10px] text-muted-foreground">{expected}h</div>
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-center text-sm tabular-nums">
                  <span className={weekTotal > expectedTotal ? 'text-accent font-bold' : ''}>
                    {weekTotal}h
                  </span>
                  <div className="text-[10px] text-muted-foreground">{expectedTotal}h</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Horas padrão: Seg 8,75h · Ter–Sex 8,5h · Fim de semana 0h</span>
        <span className="text-accent">● Hora extra</span>
      </div>

      {/* Modal para adicionar motivo */}
      <Dialog open={motivoModalOpen} onOpenChange={setMotivoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar motivo de ausência</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-4">
            {motivos.map((m: any) => (
              <Button
                type="button"
                key={m.id}
                variant="outline"
                className="justify-start text-sm h-10"
                onClick={(e) => {
                  e.preventDefault();
                  addMotivoRow(m.id);
                }}
              >
                {m.nome}
              </Button>
            ))}
            {motivos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum motivo cadastrado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RegistroHoras;
