import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Status, Empreendimento, TipoProjeto, Profile } from '@/types/database';

interface PautaFiltersProps {
  onFiltersChange: (filters: Filters) => void;
}

export interface Filters {
  search: string;
  status_id: string;
  empreendimento_id: string;
  tipo_projeto_id: string;
  prioridade: string;
  arquiteta_id: string;
}

const PautaFilters = ({ onFiltersChange }: PautaFiltersProps) => {
  const { profile, isAdmin } = useAuth();
  const defaultArquiteta = isAdmin ? 'all' : 'mine';
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status_id: 'all',
    empreendimento_id: 'all',
    tipo_projeto_id: 'all',
    prioridade: 'all',
    arquiteta_id: defaultArquiteta,
  });
  const [statusList, setStatusList] = useState<Status[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [tiposProjeto, setTiposProjeto] = useState<TipoProjeto[]>([]);
  const [usuarios, setUsuarios] = useState<Profile[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const fetchFilterData = async () => {
      const [s, e, t, u] = await Promise.all([
        projetosDb.from('esquadro_status').select('*').eq('ativo', true).order('ordem'),
        projetosDb.from('esquadro_empreendimentos').select('*').eq('ativo', true).order('nome'),
        projetosDb.from('esquadro_tipos_projeto').select('*').eq('ativo', true).order('nome'),
        projetosDb.from('esquadro_profiles').select('*').eq('ativo', true).order('nome'),
      ]);
      setStatusList(s.data || []);
      setEmpreendimentos(e.data || []);
      setTiposProjeto(t.data || []);
      setUsuarios((u.data as Profile[]) || []);
    };
    fetchFilterData();
  }, []);

  // Emit initial filter with profile id once available
  useEffect(() => {
    if (!initialized && profile?.id) {
      const initial = { ...filters, arquiteta_id: defaultArquiteta };
      setFilters(initial);
      onFiltersChange(initial);
      setInitialized(true);
    }
  }, [profile?.id, initialized]);

  const updateFilter = (key: keyof Filters, value: string) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    onFiltersChange(updated);
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Buscar..."
        value={filters.search}
        onChange={(e) => updateFilter('search', e.target.value)}
        className="w-48"
      />
      <Select value={filters.arquiteta_id} onValueChange={(v) => updateFilter('arquiteta_id', v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mine">Minhas demandas</SelectItem>
          <SelectItem value="all">Todas</SelectItem>
          {usuarios.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.status_id} onValueChange={(v) => updateFilter('status_id', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {statusList.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.empreendimento_id} onValueChange={(v) => updateFilter('empreendimento_id', v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Empreendimento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {empreendimentos.map((e) => (
            <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.tipo_projeto_id} onValueChange={(v) => updateFilter('tipo_projeto_id', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          {tiposProjeto.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.prioridade} onValueChange={(v) => updateFilter('prioridade', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="1">Alta</SelectItem>
          <SelectItem value="2">Média</SelectItem>
          <SelectItem value="3">Baixa</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default PautaFilters;
