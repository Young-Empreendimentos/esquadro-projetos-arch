import { useState, useEffect } from 'react';
import { supabase, projetosDb } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import type { Status, Empreendimento, TipoProjeto, Profile } from '@/types/database';

interface NovaDemandaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const NovaDemandaDialog = ({ open, onOpenChange, onCreated }: NovaDemandaDialogProps) => {
  const [statusList, setStatusList] = useState<Status[]>([]);
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [tiposProjeto, setTiposProjeto] = useState<TipoProjeto[]>([]);
  const [usuarios, setUsuarios] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    empreendimento_id: '',
    tipo_projeto_id: '',
    status_id: '',
    arquiteta_id: '',
    prioridade: 2,
    prazo: '',
    horas_estimadas: '',
    instrucoes: '',
  });

  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
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
    fetchData();
  }, [open]);

  const handleSave = async () => {
    if (!form.empreendimento_id || !form.tipo_projeto_id || !form.status_id) {
      toast({ title: 'Preencha os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await projetosDb.from('esquadro_demandas').insert({
      empreendimento_id: form.empreendimento_id,
      tipo_projeto_id: form.tipo_projeto_id,
      status_id: form.status_id,
      arquiteta_id: form.arquiteta_id || null,
      prioridade: form.prioridade,
      prazo: form.prazo || null,
      horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : null,
      instrucoes: form.instrucoes || null,
      data_solicitacao: new Date().toISOString().split('T')[0],
    });

    if (error) {
      toast({ title: 'Erro ao criar demanda', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Demanda criada com sucesso' });
      onCreated();
      onOpenChange(false);
      setForm({
        empreendimento_id: '',
        tipo_projeto_id: '',
        status_id: '',
        arquiteta_id: '',
        prioridade: 2,
        prazo: '',
        horas_estimadas: '',
        instrucoes: '',
      });
    }
    setSaving(false);
  };

  const updateField = (key: string, value: any) => setForm({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Demanda</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Empreendimento *</Label>
              <Select value={form.empreendimento_id} onValueChange={(v) => updateField('empreendimento_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {empreendimentos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Projeto *</Label>
              <Select value={form.tipo_projeto_id} onValueChange={(v) => updateField('tipo_projeto_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {tiposProjeto.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status *</Label>
              <Select value={form.status_id} onValueChange={(v) => updateField('status_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {statusList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.arquiteta_id} onValueChange={(v) => updateField('arquiteta_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={String(form.prioridade)} onValueChange={(v) => updateField('prioridade', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Alta</SelectItem>
                  <SelectItem value="2">Média</SelectItem>
                  <SelectItem value="3">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={(e) => updateField('prazo', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas Estimadas</Label>
              <Input
                type="number"
                step="0.5"
                value={form.horas_estimadas}
                onChange={(e) => updateField('horas_estimadas', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Instruções</Label>
            <Textarea
              value={form.instrucoes}
              onChange={(e) => updateField('instrucoes', e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Criando...' : 'Criar Demanda'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NovaDemandaDialog;
