import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, BarChart3, Table as TableIcon, Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears, startOfQuarter, endOfQuarter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const COLORS = ['hsl(226, 100%, 22%)', 'hsl(20, 100%, 50%)', 'hsl(0, 0%, 45%)', 'hsl(226, 60%, 40%)', 'hsl(0, 84%, 60%)', 'hsl(226, 100%, 28%)', 'hsl(160, 60%, 40%)', 'hsl(280, 60%, 50%)'];

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-muted text-muted-foreground',
};

type PeriodoPreset = 'mes_atual' | 'mes_anterior' | 'trimestre' | 'ano_atual' | 'ano_anterior' | 'tudo';

const Historico = () => {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [demandas, setDemandas] = useState<any[]>([]);
  const [horas, setHoras] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);

  const [statusList, setStatusList] = useState<any[]>([]);

  // Filters
  const [periodo, setPeriodo] = useState<PeriodoPreset>('tudo');
  const [filterArquiteta, setFilterArquiteta] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmpreendimentos, setFilterEmpreendimentos] = useState<string[]>([]);
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterImpugnacao, setFilterImpugnacao] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [demRes, horasRes, usrRes, empRes] = await Promise.all([
        supabase.from('esquadro_demandas').select(`
          id, horas_estimadas, prioridade, prazo, data_solicitacao, arquiteta_id, instrucoes,
          empreendimento:esquadro_empreendimentos(id, nome),
          status:esquadro_status(id, nome),
          tipo_projeto:esquadro_tipos_projeto(id, nome),
          impugnacoes:esquadro_impugnacoes(id)
        `),
        supabase.from('esquadro_registro_horas').select('demanda_id, user_id, horas, data'),
        supabase.from('esquadro_profiles').select('id, nome, email, custo_hora').eq('ativo', true).order('nome'),
        supabase.from('esquadro_empreendimentos').select('id, nome').eq('ativo', true).order('nome'),
      ]);
      setDemandas(demRes.data || []);
      setHoras(horasRes.data || []);
      setUsuarios(usrRes.data || []);
      setEmpreendimentos(empRes.data || []);

      // Extract unique statuses from demandas
      const statusMap = new Map();
      (demRes.data || []).forEach((d: any) => {
        if (d.status?.id) statusMap.set(d.status.id, d.status.nome);
      });
      setStatusList(Array.from(statusMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a: any, b: any) => a.nome.localeCompare(b.nome)));

      setLoading(false);
    };
    fetchData();
  }, []);

  // Period date range
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (periodo) {
      case 'mes_atual': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'mes_anterior': { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case 'trimestre': return { start: startOfQuarter(now), end: endOfQuarter(now) };
      case 'ano_atual': return { start: startOfYear(now), end: endOfYear(now) };
      case 'ano_anterior': { const prev = subYears(now, 1); return { start: startOfYear(prev), end: endOfYear(prev) }; }
      default: return null;
    }
  }, [periodo]);

  // Filtered hours by period
  const filteredHoras = useMemo(() => {
    if (!dateRange) return horas;
    return horas.filter((h: any) => {
      const d = new Date(h.data);
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [horas, dateRange]);

  // Build enriched demandas
  const enrichedDemandas = useMemo(() => {
    return demandas.map((d: any) => {
      const demHoras = filteredHoras.filter((h: any) => h.demanda_id === d.id);
      const totalHoras = demHoras.reduce((s: number, h: any) => s + (h.horas || 0), 0);
      let custo = 0;
      demHoras.forEach((h: any) => {
        const usr = usuarios.find((u: any) => u.id === h.user_id);
        custo += (h.horas || 0) * (usr?.custo_hora || 0);
      });
      const arquiteta = usuarios.find((u: any) => u.id === d.arquiteta_id);
      return { ...d, totalHoras, custo, arquiteta };
    });
  }, [demandas, filteredHoras, usuarios]);

  // Apply user filters
  const filteredDemandas = useMemo(() => {
    let result = enrichedDemandas;
    if (filterArquiteta !== 'all') {
      result = result.filter((d) => d.arquiteta_id === filterArquiteta);
    }
    if (filterStatus !== 'all') {
      result = result.filter((d) => d.status?.id === filterStatus);
    }
    if (filterEmpreendimentos.length > 0) {
      result = result.filter((d) => filterEmpreendimentos.includes(d.empreendimento?.id));
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((d) =>
        d.empreendimento?.nome?.toLowerCase().includes(s) ||
        d.tipo_projeto?.nome?.toLowerCase().includes(s) ||
        d.instrucoes?.toLowerCase().includes(s)
      );
    }
    if (filterImpugnacao === 'impugnados') {
      result = result.filter((d) => d.impugnacoes?.length > 0);
    } else if (filterImpugnacao === 'nao_impugnados') {
      result = result.filter((d) => !d.impugnacoes || d.impugnacoes.length === 0);
    }
    return result;
  }, [enrichedDemandas, filterArquiteta, filterStatus, filterEmpreendimentos, search, filterImpugnacao]);

  // Chart data: costs by empreendimento
  const custosPorEmpreendimento = useMemo(() => {
    const map: Record<string, { nome: string; custo: number; horas: number }> = {};
    filteredDemandas.forEach((d) => {
      const empId = d.empreendimento?.id;
      const empNome = d.empreendimento?.nome;
      if (!empId) return;
      if (!map[empId]) map[empId] = { nome: empNome, custo: 0, horas: 0 };
      map[empId].custo += d.custo;
      map[empId].horas += d.totalHoras;
    });
    return Object.values(map).filter((e) => e.horas > 0).sort((a, b) => b.custo - a.custo);
  }, [filteredDemandas]);

  // Chart data: avg hours by tipo
  const mediaHorasPorTipo = useMemo(() => {
    const map: Record<string, { nome: string; totalHoras: number; count: number }> = {};
    filteredDemandas.forEach((d) => {
      const tipoId = d.tipo_projeto?.id;
      const tipoNome = d.tipo_projeto?.nome;
      if (!tipoId || d.totalHoras <= 0) return;
      if (!map[tipoId]) map[tipoId] = { nome: tipoNome, totalHoras: 0, count: 0 };
      map[tipoId].totalHoras += d.totalHoras;
      map[tipoId].count += 1;
    });
    return Object.values(map)
      .filter((t) => t.count > 0)
      .map((t) => ({ nome: t.nome, media: Math.round((t.totalHoras / t.count) * 10) / 10, total: t.totalHoras }))
      .sort((a, b) => b.media - a.media);
  }, [filteredDemandas]);

  // Chart data: hours by architect
  const horasPorArquiteta = useMemo(() => {
    const map: Record<string, { nome: string; horas: number; custo: number }> = {};
    filteredDemandas.forEach((d) => {
      const demHoras = filteredHoras.filter((h: any) => h.demanda_id === d.id);
      demHoras.forEach((h: any) => {
        const usr = usuarios.find((u: any) => u.id === h.user_id);
        if (!usr) return;
        if (!map[usr.id]) map[usr.id] = { nome: usr.nome || usr.email, horas: 0, custo: 0 };
        map[usr.id].horas += h.horas || 0;
        map[usr.id].custo += (h.horas || 0) * (usr.custo_hora || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.horas - a.horas);
  }, [filteredDemandas, filteredHoras, usuarios]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = isAdmin
      ? ['Empreendimento', 'Tipo de Projeto', 'Status', 'Prioridade', 'Responsável', 'Prazo', 'Horas Realizadas', 'Custo (R$)']
      : ['Empreendimento', 'Tipo de Projeto', 'Status', 'Prioridade', 'Responsável', 'Prazo', 'Horas Realizadas'];
    const rows = filteredDemandas.map((d) => {
      const base = [
        d.empreendimento?.nome || '',
        d.tipo_projeto?.nome || '',
        d.status?.nome || '',
        prioridadeLabel[d.prioridade] || d.prioridade,
        d.arquiteta?.nome || d.arquiteta?.email || '',
        d.prazo ? format(new Date(d.prazo), 'dd/MM/yyyy') : '',
        d.totalHoras.toFixed(1),
      ];
      if (isAdmin) base.push(d.custo.toFixed(2));
      return base;
    });
    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historico_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const periodoLabel: Record<PeriodoPreset, string> = {
    mes_atual: 'Mês Atual',
    mes_anterior: 'Mês Anterior',
    trimestre: 'Trimestre Atual',
    ano_atual: 'Ano Atual',
    ano_anterior: 'Ano Anterior',
    tudo: 'Todo o Período',
  };

  // Summary stats
  const totalHoras = filteredDemandas.reduce((s, d) => s + d.totalHoras, 0);
  const totalCusto = filteredDemandas.reduce((s, d) => s + d.custo, 0);
  const demandasComHoras = filteredDemandas.filter((d) => d.totalHoras > 0).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={handleExportCSV} disabled={loading}>
          <Download className="w-4 h-4 mr-1" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoPreset)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(periodoLabel).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Multi-select empreendimento */}
        <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-64 justify-between font-normal">
              {filterEmpreendimentos.length === 0
                ? 'Empreendimentos'
                : `${filterEmpreendimentos.length} selecionado(s)`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0">
            <Command>
              <CommandInput placeholder="Buscar empreendimento..." />
              <CommandList>
                <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                <CommandGroup>
                  {empreendimentos.map((e: any) => (
                    <CommandItem
                      key={e.id}
                      value={e.nome}
                      onSelect={() => {
                        setFilterEmpreendimentos((prev) =>
                          prev.includes(e.id)
                            ? prev.filter((id) => id !== e.id)
                            : [...prev, e.id]
                        );
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', filterEmpreendimentos.includes(e.id) ? 'opacity-100' : 'opacity-0')} />
                      {e.nome}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {filterEmpreendimentos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilterEmpreendimentos([])}>
            <X className="w-3 h-3 mr-1" /> Limpar
          </Button>
        )}
        <Select value={filterArquiteta} onValueChange={setFilterArquiteta}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {usuarios.map((u: any) => (
              <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusList.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterImpugnacao} onValueChange={setFilterImpugnacao}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Impugnações" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="impugnados">Impugnados</SelectItem>
            <SelectItem value="nao_impugnados">Não impugnados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filterEmpreendimentos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filterEmpreendimentos.map((id) => {
            const emp = empreendimentos.find((e: any) => e.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1 text-xs">
                {emp?.nome || id}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setFilterEmpreendimentos((prev) => prev.filter((x) => x !== id))}
                />
              </Badge>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Demandas com Horas</p>
              <p className="text-2xl font-bold mt-1">{demandasComHoras}</p>
            </div>
            <div className="bg-card border rounded-lg p-4">
              <p className="text-xs text-muted-foreground">Total de Horas</p>
              <p className="text-2xl font-bold mt-1">{totalHoras.toFixed(1)}h</p>
            </div>
            {isAdmin && (
              <div className="bg-card border rounded-lg p-4">
                <p className="text-xs text-muted-foreground">Custo Total</p>
                <p className="text-2xl font-bold mt-1">R$ {totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>

          <Tabs defaultValue="graficos" className="space-y-4">
            <TabsList className="bg-muted">
              <TabsTrigger value="graficos" className="gap-1.5">
                <BarChart3 className="w-4 h-4" />
                Gráficos
              </TabsTrigger>
              <TabsTrigger value="tabela" className="gap-1.5">
                <TableIcon className="w-4 h-4" />
                Tabela Detalhada
              </TabsTrigger>
            </TabsList>

            <TabsContent value="graficos">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Horas por empreendimento (todos) / Custos por empreendimento (admin) */}
                {custosPorEmpreendimento.length > 0 && (
                  <div className="bg-card border rounded-lg p-5">
                    <h2 className="text-lg font-semibold mb-4">{isAdmin ? 'Custos por Empreendimento' : 'Horas por Empreendimento'}</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={custosPorEmpreendimento} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          type="number"
                          tickFormatter={isAdmin ? (v) => `R$${(v / 1000).toFixed(0)}k` : (v) => `${v}h`}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                        <Tooltip
                          formatter={isAdmin
                            ? (value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Custo']
                            : (value: number) => [`${value.toFixed(1)}h`, 'Horas']
                          }
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        />
                        <Bar dataKey={isAdmin ? 'custo' : 'horas'} fill="hsl(226, 100%, 22%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Distribuição por empreendimento (Pie) */}
                {custosPorEmpreendimento.length > 0 && (
                  <div className="bg-card border rounded-lg p-5">
                    <h2 className="text-lg font-semibold mb-4">{isAdmin ? 'Distribuição de Custos' : 'Distribuição de Horas'}</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={custosPorEmpreendimento}
                          dataKey={isAdmin ? 'custo' : 'horas'}
                          nameKey="nome"
                          cx="50%"
                          cy="50%"
                          outerRadius={110}
                          label={({ nome, percent }) => `${nome} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={{ stroke: 'hsl(var(--muted-foreground))' }}
                        >
                          {custosPorEmpreendimento.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={isAdmin
                            ? (value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Custo']
                            : (value: number) => [`${value.toFixed(1)}h`, 'Horas']
                          }
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {custosPorEmpreendimento.length === 0 && mediaHorasPorTipo.length === 0 && horasPorArquiteta.length === 0 && (
                  <div className="lg:col-span-2 bg-card border rounded-lg p-12 text-center">
                    <p className="text-muted-foreground">Sem dados suficientes para gerar gráficos no período selecionado.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tabela">
              <div className="border rounded-lg overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empreendimento</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo de Projeto</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">Prioridade</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Responsável</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prazo</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Horas</th>
                        {isAdmin && (
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Custo</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDemandas.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">
                            Nenhuma demanda encontrada para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        filteredDemandas.map((d) => (
                          <tr key={d.id} className="border-t hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3 font-medium">{d.empreendimento?.nome || '—'}</td>
                            <td className="px-4 py-3">{d.tipo_projeto?.nome || '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="font-normal">{d.status?.nome || '—'}</Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={prioridadeColor[d.prioridade as number] || ''}>
                                {prioridadeLabel[d.prioridade as number] || d.prioridade}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{d.arquiteta?.nome || d.arquiteta?.email || '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {d.prazo ? format(new Date(d.prazo), 'dd/MM/yyyy') : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {d.totalHoras > 0 ? `${d.totalHoras.toFixed(1)}h` : '—'}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-3 text-right tabular-nums">
                                {d.custo > 0 ? `R$ ${d.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default Historico;
