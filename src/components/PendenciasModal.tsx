import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { format, startOfDay, subDays, isBefore } from 'date-fns';
import { ALOCACAO_INICIO, calcularGapsHoras } from '@/lib/horas';

const PendenciasModal = () => {
  const { profile, loading } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [gaps, setGaps] = useState<{ data: string; esperado: number; alocado: number }[]>([]);
  const [totalFaltante, setTotalFaltante] = useState(0);

  useEffect(() => {
    if (loading || location.pathname === '/horas' || profile?.role !== 'arquiteta') return;

    const checkPendencias = async () => {
      try {
        const ontem = startOfDay(subDays(new Date(), 1));
        const inicioAlocacao = startOfDay(ALOCACAO_INICIO);
        if (isBefore(ontem, inicioAlocacao)) return;

        const { data: allHoras, error } = await supabase
          .from('esquadro_registro_horas')
          .select('data, horas')
          .eq('user_id', profile.id)
          .gte('data', format(inicioAlocacao, 'yyyy-MM-dd'))
          .lte('data', format(ontem, 'yyyy-MM-dd'));

        if (error) {
          console.error('Erro ao verificar pendências:', error.message);
          return;
        }

        const horasMap: Record<string, number> = {};
        (allHoras || []).forEach((r: any) => {
          horasMap[r.data] = (horasMap[r.data] || 0) + (r.horas || 0);
        });

        const pendGaps = calcularGapsHoras({
          inicio: inicioAlocacao,
          fim: ontem,
          horasPorData: horasMap,
          cargaDiaria: profile.carga_horaria_diaria,
          entrada: profile.created_at,
        });

        if (pendGaps.length > 0) {
          setGaps(pendGaps);
          setTotalFaltante(pendGaps.reduce((s, g) => s + (g.esperado - g.alocado), 0));
          setOpen(true);
        } else {
          setOpen(false);
        }
      } catch (err) {
        console.error('Erro inesperado em PendenciasModal:', err);
      }
    };

    checkPendencias();
  }, [loading, location.pathname, profile?.id, profile?.role]);

  if (loading || location.pathname === '/horas' || profile?.role !== 'arquiteta' || gaps.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Pendências de Alocação de Horas
          </DialogTitle>
          <DialogDescription>
            Você possui <strong className="text-destructive">{totalFaltante.toFixed(1)}h</strong> não alocadas em <strong>{gaps.length}</strong> {gaps.length === 1 ? 'dia' : 'dias'}. Por favor, regularize seu registro de horas.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[300px] overflow-y-auto space-y-1 mt-2">
          {gaps.map((g) => (
            <div key={g.data} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
              <span>{format(new Date(g.data + 'T12:00:00'), 'dd/MM/yyyy')}</span>
              <span className="text-destructive font-medium">
                {g.alocado}h / {g.esperado}h
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PendenciasModal;
