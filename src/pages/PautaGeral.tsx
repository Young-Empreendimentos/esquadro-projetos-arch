import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, LayoutGrid, Table as TableIcon } from 'lucide-react';
import PautaFilters, { type Filters } from '@/components/pauta/PautaFilters';
import NovaDemandaDialog from '@/components/pauta/NovaDemandaDialog';
import KanbanView from '@/components/pauta/KanbanView';
import DemandaDetailDialog from '@/components/pauta/DemandaDetailDialog';
import { format } from 'date-fns';

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-muted text-muted-foreground',
};

const PautaGeral = () => {
  const { profile, isAdmin } = useAuth();
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status_id: 'all',
    empreendimento_id: 'all',
    tipo_projeto_id: 'all',
    prioridade: 'all',
    arquiteta_id: 'mine',
  });

  const fetchDemandas = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('esquadro_demandas')
      .select(`
        *,
        empreendimento:esquadro_empreendimentos(id, nome),
        status:esquadro_status(id, nome),
        tipo_projeto:esquadro_tipos_projeto(id, nome),
        impugnacoes:esquadro_impugnacoes(id)
      `)
      .order('prioridade')
      .order('created_at', { ascending: false });

    // Filter by arquiteta
    if (filters.arquiteta_id === 'mine' && profile?.id) {
      query = query.eq('arquiteta_id', profile.id);
    } else if (filters.arquiteta_id !== 'all' && filters.arquiteta_id !== 'mine') {
      query = query.eq('arquiteta_id', filters.arquiteta_id);
    }

    if (filters.status_id !== 'all') query = query.eq('status_id', filters.status_id);
    if (filters.empreendimento_id !== 'all') query = query.eq('empreendimento_id', filters.empreendimento_id);
    if (filters.tipo_projeto_id !== 'all') query = query.eq('tipo_projeto_id', filters.tipo_projeto_id);
    if (filters.prioridade !== 'all') query = query.eq('prioridade', Number(filters.prioridade));

    const { data, error } = await query;
    if (!error) {
      let result = data || [];
      if (filters.search) {
        const s = filters.search.toLowerCase();
        result = result.filter(
          (d: any) =>
            d.empreendimento?.nome?.toLowerCase().includes(s) ||
            d.tipo_projeto?.nome?.toLowerCase().includes(s) ||
            d.instrucoes?.toLowerCase().includes(s)
        );
      }
      setDemandas(result);
    }
    setLoading(false);
  }, [filters, profile?.id]);

  useEffect(() => {
    fetchDemandas();
  }, [fetchDemandas]);

  const handleDemandaClick = (demanda: any) => {
    setSelectedDemanda(demanda);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-end">
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Nova Demanda
        </Button>
      </div>

      <PautaFilters onFiltersChange={setFilters} />

      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="kanban" className="gap-1.5">
            <LayoutGrid className="w-4 h-4" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="tabela" className="gap-1.5">
            <TableIcon className="w-4 h-4" />
            Tabela
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          {loading && demandas.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
          ) : (
            <KanbanView demandas={demandas} onRefresh={fetchDemandas} onDemandaClick={handleDemandaClick} />
          )}
        </TabsContent>

        <TabsContent value="tabela">
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empreendimento</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo de Projeto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Prioridade</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Prazo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Horas Est.</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
                  </tr>
                )}
                {!loading && demandas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma demanda encontrada.</td>
                  </tr>
                )}
                {demandas.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleDemandaClick(d)}
                  >
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.prazo ? format(new Date(d.prazo), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {d.horas_estimadas != null ? `${d.horas_estimadas}h` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <NovaDemandaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchDemandas}
      />

      <DemandaDetailDialog
        demanda={selectedDemanda}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={fetchDemandas}
      />
    </div>
  );
};

export default PautaGeral;
