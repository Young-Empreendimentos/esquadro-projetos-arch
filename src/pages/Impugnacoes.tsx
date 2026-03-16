import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const Impugnacoes = () => {
  const [impugnacoes, setImpugnacoes] = useState<any[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    supabase.from('esquadro_empreendimentos').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => {
      setEmpreendimentos(data || []);
    });
  }, []);

  const fetchImpugnacoes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('esquadro_impugnacoes')
      .select(`
        *,
        demanda:esquadro_demandas(
          id,
          empreendimento:esquadro_empreendimentos(id, nome),
          tipo_projeto:esquadro_tipos_projeto(id, nome)
        )
      `)
      .order('data', { ascending: false });

    if (filterDateFrom) query = query.gte('data', filterDateFrom);
    if (filterDateTo) query = query.lte('data', filterDateTo);

    const { data } = await query;
    setImpugnacoes(data || []);
    setLoading(false);
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchImpugnacoes();
  }, [fetchImpugnacoes]);

  const filtered = useMemo(() => {
    if (filterEmp === 'all') return impugnacoes;
    return impugnacoes.filter((i) => i.demanda?.empreendimento?.id === filterEmp);
  }, [impugnacoes, filterEmp]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Empreendimento</label>
          <Select value={filterEmp} onValueChange={setFilterEmp}>
            <SelectTrigger className="w-52 h-9 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {empreendimentos.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data inicial</label>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-40 h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data final</label>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-40 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empreendimento</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo de Projeto</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma impugnação encontrada.</td>
              </tr>
            )}
            {!loading && filtered.map((imp) => (
              <tr key={imp.id} className="border-t hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {format(new Date(imp.data), 'dd/MM/yyyy')}
                </td>
                <td className="px-4 py-3 font-medium">
                  {imp.demanda?.empreendimento?.nome || '—'}
                </td>
                <td className="px-4 py-3">
                  {imp.demanda?.tipo_projeto?.nome || '—'}
                </td>
                <td className="px-4 py-3 max-w-md">
                  <p className="whitespace-pre-wrap">{imp.descricao}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} impugnação(ões) encontrada(s)
      </p>
    </div>
  );
};

export default Impugnacoes;
