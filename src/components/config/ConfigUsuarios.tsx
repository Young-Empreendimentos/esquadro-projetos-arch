import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  role: string;
  ativo: boolean;
  custo_hora: number | null;
  created_at: string;
}

const ConfigUsuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    email: '',
    nome: '',
    role: 'comum',
    custo_hora: '',
    password: '',
  });

  const fetchUsuarios = async () => {
    const { data, error } = await supabase
      .from('esquadro_profiles')
      .select('*')
      .order('nome');
    if (!error) setUsuarios(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const resetForm = () => {
    setForm({ email: '', nome: '', role: 'arquiteta', custo_hora: '', password: '' });
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setForm({
      email: u.email,
      nome: u.nome || '',
      role: u.role,
      custo_hora: u.custo_hora != null ? String(u.custo_hora) : '',
      password: '',
    });
    setEditingId(u.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.email) {
      toast({ title: 'Email é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);

    if (editingId) {
      // Update profile data
      const updateData: any = {
        nome: form.nome || null,
        role: form.role,
        custo_hora: form.custo_hora ? Number(form.custo_hora) : null,
      };

      const { error } = await supabase
        .from('esquadro_profiles')
        .update(updateData)
        .eq('id', editingId);

      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      toast({ title: 'Usuário atualizado' });
    } else {
      // Create new user: first create auth user, then profile
      if (!form.password || form.password.length < 6) {
        toast({ title: 'Senha deve ter pelo menos 6 caracteres', variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Insert into esquadro_usuarios table
      // The auth user should be created separately or via admin API
      // For now, we insert the profile record
      const { error } = await supabase
        .from('esquadro_profiles')
        .insert({
          email: form.email,
          nome: form.nome || null,
          role: form.role,
          custo_hora: form.custo_hora ? Number(form.custo_hora) : null,
          ativo: true,
        });

      if (error) {
        toast({ title: 'Erro ao criar usuário', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      toast({ title: 'Usuário cadastrado com sucesso' });
    }

    setSaving(false);
    setDialogOpen(false);
    fetchUsuarios();
  };

  const toggleAtivo = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('esquadro_profiles')
      .update({ ativo: !current })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    fetchUsuarios();
  };

  const changeRole = async (id: string, newRole: string) => {
    const { data, error } = await supabase
      .from('esquadro_profiles')
      .update({ role: newRole })
      .eq('id', id)
      .select('id, role')
      .maybeSingle();

    if (error) {
      toast({ title: 'Erro ao alterar perfil', description: error.message, variant: 'destructive' });
      return;
    }

    if (!data || data.role !== newRole) {
      toast({
        title: 'Alteração não permitida',
        description: 'Sua política de acesso (RLS) não permitiu atualizar o perfil.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Perfil atualizado' });
    fetchUsuarios();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Usuários</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />
          Novo Usuário
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Perfil</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Custo/Hora</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-20">Ativo</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium">{u.nome || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 text-center">
                  <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                    <SelectTrigger className="h-7 w-28 mx-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="arquiteta">Arquiteta</SelectItem>
                      <SelectItem value="comum">Comum</SelectItem>
                      <SelectItem value="desativado">Desativado</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {u.custo_hora != null ? `R$ ${u.custo_hora.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <Switch checked={u.ativo} onCheckedChange={() => toggleAtivo(u.id, u.ativo)} />
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => openEdit(u)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar' : 'Novo'} Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!editingId}
                />
              </div>
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <Label>Senha *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="arquiteta">Arquiteta</SelectItem>
                      <SelectItem value="comum">Comum</SelectItem>
                      <SelectItem value="desativado">Desativado</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Custo/Hora (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.custo_hora}
                  onChange={(e) => setForm({ ...form, custo_hora: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigUsuarios;
