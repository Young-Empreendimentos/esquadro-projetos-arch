import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, eachDayOfInterval, getDay, startOfDay, subDays, isBefore } from 'date-fns';

const HORAS_PADRAO: Record<number, number> = {
  1: 8.75, 2: 8.5, 3: 8.5, 4: 8.5, 5: 8.5, 6: 0, 0: 0,
};

const ALOCACAO_INICIO = new Date('2026-02-23');

const PendenciasHoras = () => {
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const ontem = startOfDay(subDays(new Date(), 1));
      const inicioAlocacao = startOfDay(ALOCACAO_INICIO);

      if (isBefore(ontem, inicioAlocacao)) {
        setLoading(false);
        return;
      }

      const [{ data: arquitetas }, { data: allHoras }] = await Promise.all([
        supabase
          .from('esquadro_profiles')
          .select('id, nome, email, role')
          .eq('ativo', true)
          .eq('role', 'arquiteta'),
        supabase
          .from('esquadro_registro_horas')
          .select('user_id, data, horas')
          .gte('data', format(inicioAlocacao, 'yyyy-MM-dd'))
          .lte('data', format(ontem, 'yyyy-MM-dd')),
      ]);

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
          if (esperado === 0) return;
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
            gaps,
          });
        }
      });

      setPendencias(pendList.sort((a, b) => b.horasFaltantes - a.horasFaltantes));
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
      ) : pendencias.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma pendência encontrada. ✅</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendencias.map((p: any) => (
            <div key={p.id} className="bg-card border border-destructive/20 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <p className="font-semibold">{p.nome}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-destructive font-medium">{p.horasFaltantes.toFixed(1)}h faltantes</span>
                  <Badge variant="secondary">{p.diasPendentes} {p.diasPendentes === 1 ? 'dia' : 'dias'}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.gaps.map((g: any) => (
                  <span key={g.data} className="text-xs bg-destructive/10 text-destructive rounded px-2 py-1">
                    {format(new Date(g.data + 'T12:00:00'), 'dd/MM/yyyy')} — {g.alocado}h / {g.esperado}h
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendenciasHoras;
