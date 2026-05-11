import { useState, useEffect } from 'react';
import { ChevronRight, ChevronsLeftRight, ChevronsRightLeft, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Status } from '@/types/database';
import { toast } from '@/hooks/use-toast';

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-muted text-muted-foreground',
};

interface KanbanViewProps {
  demandas: any[];
  onRefresh: () => void;
  onDemandaClick?: (demanda: any) => void;
}

const KanbanView = ({ demandas, onRefresh, onDemandaClick }: KanbanViewProps) => {
  const [statusList, setStatusList] = useState<Status[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());

  const toggleCollapse = (statusId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      return next;
    });
  };

  const expandAll = () => setCollapsedColumns(new Set());
  const collapseAll = () => setCollapsedColumns(new Set(statusList.map((s) => s.id)));

  const allCollapsed = statusList.length > 0 && collapsedColumns.size === statusList.length;

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('esquadro_status')
        .select('*')
        .eq('ativo', true)
        .order('ordem');
      setStatusList(data || []);
    };
    fetch();
  }, []);

  const handleDragStart = (e: React.DragEvent, demandaId: string) => {
    setDraggedId(demandaId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId) return;

    const targetStatus = statusList.find((s) => s.id === statusId);
    const isConcluido = targetStatus?.nome?.toLowerCase() === 'concluído';
    const update: any = { status_id: statusId };
    if (isConcluido) {
      const dem = demandas.find((d) => d.id === draggedId);
      if (!dem?.data_conclusao) {
        update.data_conclusao = new Date().toISOString().split('T')[0];
      }
    } else {
      update.data_conclusao = null;
    }

    const { error } = await supabase
      .from('esquadro_demandas')
      .update(update)
      .eq('id', draggedId);

    if (error) {
      toast({ title: 'Erro ao mover', description: error.message, variant: 'destructive' });
    } else {
      onRefresh();
    }
    setDraggedId(null);
  };

  if (statusList.length === 0) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={allCollapsed ? expandAll : collapseAll}
        >
          {allCollapsed ? (
            <>
              <ChevronsLeftRight className="w-3.5 h-3.5" />
              Expandir todas
            </>
          ) : (
            <>
              <ChevronsRightLeft className="w-3.5 h-3.5" />
              Recolher todas
            </>
          )}
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {statusList.map((status) => {
          const columnDemandas = demandas.filter((d) => d.status_id === status.id);
          const isCollapsed = collapsedColumns.has(status.id);

          if (isCollapsed) {
            return (
              <div
                key={status.id}
                className="flex-shrink-0 w-10 bg-muted/50 rounded-lg flex flex-col items-center cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => toggleCollapse(status.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status.id)}
              >
                <div className="py-3 flex flex-col items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <Badge variant="secondary" className="text-xs">
                    {columnDemandas.length}
                  </Badge>
                </div>
                <span
                  className="text-xs font-semibold text-muted-foreground"
                  style={{ writingMode: 'vertical-lr', textOrientation: 'mixed' }}
                >
                  {status.nome}
                </span>
              </div>
            );
          }

          return (
            <div
              key={status.id}
              className="flex-shrink-0 w-72 bg-muted/50 rounded-lg flex flex-col"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, status.id)}
            >
              {/* Column header */}
              <div
                className="px-3 py-3 border-b flex items-center justify-between cursor-pointer hover:bg-muted/80 transition-colors rounded-t-lg"
                onClick={() => toggleCollapse(status.id)}
              >
                <h3 className="text-sm font-semibold truncate select-none">{status.nome}</h3>
                <Badge variant="secondary" className="text-xs ml-2 flex-shrink-0">
                  {columnDemandas.length}
                </Badge>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 flex-1 min-h-[120px]">
                {columnDemandas.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, d.id)}
                    onClick={() => onDemandaClick?.(d)}
                    className="bg-card border rounded-md p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {d.empreendimento?.nome || '—'}
                      </p>
                      {d.impugnacoes?.length > 0 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 ml-1" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {d.tipo_projeto?.nome || '—'}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge className={`text-[10px] px-1.5 py-0 ${prioridadeColor[d.prioridade] || ''}`}>
                        {prioridadeLabel[d.prioridade] || '—'}
                      </Badge>
                      {d.prazo && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(d.prazo).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {columnDemandas.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                    Arraste demandas aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KanbanView;
