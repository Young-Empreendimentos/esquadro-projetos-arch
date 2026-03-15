import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

interface Column {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number';
}

interface ConfigCrudTableProps {
  tableName: string;
  title: string;
  columns: Column[];
  orderBy?: string;
}

const ConfigCrudTable = ({ tableName, title, columns, orderBy = 'created_at' }: ConfigCrudTableProps) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const fetchItems = async () => {
    const { data, error } = await (supabase
      .from(tableName as any) as any)
      .select('*')
      .order(orderBy);
    if (error) {
      toast({ title: 'Erro ao carregar dados', description: error.message, variant: 'destructive' });
    } else {
      setItems(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [tableName]);

  const resetForm = () => {
    const empty: Record<string, any> = {};
    columns.forEach((col) => {
      empty[col.key] = col.type === 'number' ? 0 : '';
    });
    setFormData(empty);
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    const data: Record<string, any> = {};
    columns.forEach((col) => {
      data[col.key] = item[col.key] ?? '';
    });
    setFormData(data);
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingId) {
      const { error } = await (supabase
        .from(tableName as any) as any)
        .update(formData)
        .eq('id', editingId);
      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Atualizado com sucesso' });
    } else {
      const { error } = await supabase
        .from(tableName)
        .insert(formData);
      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Criado com sucesso' });
    }
    setDialogOpen(false);
    fetchItems();
  };

  const toggleAtivo = async (id: string, currentValue: boolean) => {
    const { error } = await supabase
      .from(tableName)
      .update({ ativo: !currentValue })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    fetchItems();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />
          Novo
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 font-medium text-muted-foreground">
                  {col.label}
                </th>
              ))}
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-20">Ativo</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground w-16"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-t hover:bg-muted/50 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.type === 'textarea'
                      ? (item[col.key] || '—').substring(0, 80) + (item[col.key]?.length > 80 ? '...' : '')
                      : item[col.key] ?? '—'}
                  </td>
                ))}
                <td className="px-4 py-3 text-center">
                  <Switch
                    checked={item.ativo}
                    onCheckedChange={() => toggleAtivo(item.id, item.ativo)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => openEdit(item)}
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
            <DialogTitle>{editingId ? 'Editar' : 'Novo'} {title.slice(0, -1)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {columns.map((col) => (
              <div key={col.key} className="space-y-1.5">
                <Label>{col.label}</Label>
                {col.type === 'textarea' ? (
                  <Textarea
                    value={formData[col.key] || ''}
                    onChange={(e) => setFormData({ ...formData, [col.key]: e.target.value })}
                  />
                ) : (
                  <Input
                    type={col.type === 'number' ? 'number' : 'text'}
                    value={formData[col.key] ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        [col.key]: col.type === 'number' ? Number(e.target.value) : e.target.value,
                      })
                    }
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingId ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigCrudTable;
