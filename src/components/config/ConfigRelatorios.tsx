import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import { supabase, projetosDb } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileText, Send, Eye, Clock, CalendarClock, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  format,
  startOfWeek,
  endOfWeek,
  subWeeks,
  getDay,
  isSaturday,
  isSunday,
  eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  role: string;
  ativo: boolean;
}

interface ReportConfig {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  destinatarios: string[];
  frequencia: string;
  horario: string;
  ultimo_envio: string | null;
}

const HORAS_PADRAO: Record<number, number> = {
  1: 8.75, 2: 8.5, 3: 8.5, 4: 8.5, 5: 8.5, 6: 0, 0: 0,
};

const prioridadeLabel: Record<number, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };
const prioridadeColor: Record<number, string> = {
  1: 'bg-destructive text-destructive-foreground',
  2: 'bg-accent text-accent-foreground',
  3: 'bg-secondary text-secondary-foreground',
};

const DAY_NAMES_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const DEFAULT_REPORTS: Omit<ReportConfig, 'id'>[] = [
  {
    nome: 'Relatório Semanal de Projetos',
    descricao: 'Inclui lista de projetos em andamento com prazo, prioridade, data de início e horas gastas, além do relatório completo de horas da semana anterior.',
    ativo: true,
    destinatarios: [],
    frequencia: 'Toda segunda-feira',
    horario: '08:00',
    ultimo_envio: null,
  },
];

interface PreviewUserDemanda {
  demandaId: string;
  label: string;
  horasPorDia: Record<string, number>;
  total: number;
}

interface PreviewUser {
  id: string;
  nome: string;
  demandas: PreviewUserDemanda[];
  totalPorDia: Record<string, number>;
  total: number;
}

interface PreviewData {
  periodo: string;
  demandas: any[];
  horasUsuarios: PreviewUser[];
  days: { data: string; label: string }[];
}

const ConfigRelatorios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [reports, setReports] = useState<ReportConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usuariosRes, reportsRes] = await Promise.all([
        projetosDb
          .from('esquadro_profiles')
          .select('id, email, nome, role, ativo')
          .eq('ativo', true)
          .order('nome'),
        projetosDb
          .from('esquadro_relatorios_config')
          .select('*')
          .order('created_at'),
      ]);

      setUsuarios(usuariosRes.data || []);

      const mapReport = (r: any): ReportConfig => ({
        id: r.id,
        nome: r.nome,
        descricao: r.descricao,
        ativo: r.ativo,
        destinatarios: r.destinatarios || [],
        frequencia: r.frequencia || 'Toda segunda-feira',
        horario: r.horario || '08:00',
        ultimo_envio: r.ultimo_envio || null,
      });

      if (reportsRes.error) {
        console.warn('Tabela esquadro_relatorios_config não encontrada:', reportsRes.error.message);
        setReports(DEFAULT_REPORTS.map((r, i) => ({ ...r, id: `default-${i}` })));
      } else if ((reportsRes.data || []).length === 0) {
        const inserts = DEFAULT_REPORTS.map((r) => ({
          nome: r.nome,
          descricao: r.descricao,
          ativo: r.ativo,
          destinatarios: r.destinatarios,
          frequencia: r.frequencia,
          horario: r.horario,
        }));
        const { data: inserted, error: insertError } = await projetosDb
          .from('esquadro_relatorios_config')
          .insert(inserts)
          .select('*');
        if (insertError) {
          console.error('Erro ao criar relatórios padrão:', insertError.message);
          setReports(DEFAULT_REPORTS.map((r, i) => ({ ...r, id: `default-${i}` })));
        } else {
          setReports((inserted || []).map(mapReport));
        }
      } else {
        setReports((reportsRes.data || []).map(mapReport));
      }
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateReport = async (reportId: string, updates: Partial<ReportConfig>) => {
    setSaving(true);
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, ...updates } : r))
    );

    if (!reportId.startsWith('default-')) {
      const { error } = await projetosDb
        .from('esquadro_relatorios_config')
        .update(updates)
        .eq('id', reportId);
      if (error) {
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        fetchData();
      }
    }
    setSaving(false);
  };

  const toggleDestinatario = (reportId: string, userId: string) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    const newDest = report.destinatarios.includes(userId)
      ? report.destinatarios.filter((id) => id !== userId)
      : [...report.destinatarios, userId];
    updateReport(reportId, { destinatarios: newDest });
  };

  const generatePreviewData = async (): Promise<PreviewData> => {
    const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
    const dateFrom = format(lastWeekStart, 'yyyy-MM-dd');
    const dateTo = format(lastWeekEnd, 'yyyy-MM-dd');

    const emAndamentoId = '819a3d87-3884-4223-ac1b-7262434f0828';
    const [demandasRes, horasSemanRes, allUsuariosRes, demandasAllRes] = await Promise.all([
      projetosDb
        .from('esquadro_demandas')
        .select(`
          id, prioridade, prazo, created_at,
          empreendimento:esquadro_empreendimentos(nome),
          tipo_projeto:esquadro_tipos_projeto(nome),
          status:esquadro_status(nome)
        `)
        .eq('status_id', emAndamentoId)
        .order('prioridade'),
      projetosDb
        .from('esquadro_registro_horas')
        .select('user_id, demanda_id, data, horas, motivo_nao_trabalho_id')
        .gte('data', dateFrom)
        .lte('data', dateTo),
      projetosDb
        .from('esquadro_profiles')
        .select('id, nome, email')
        .eq('ativo', true),
      projetosDb
        .from('esquadro_demandas')
        .select(`id, empreendimento:esquadro_empreendimentos(nome), tipo_projeto:esquadro_tipos_projeto(nome)`),
    ]);

    // Total hours per demanda (all time)
    const horasTotalRes = await projetosDb
      .from('esquadro_registro_horas')
      .select('demanda_id, horas')
      .not('demanda_id', 'is', null);

    const horasPorDemanda: Record<string, number> = {};
    (horasTotalRes.data || []).forEach((r: any) => {
      if (r.demanda_id) {
        horasPorDemanda[r.demanda_id] = (horasPorDemanda[r.demanda_id] || 0) + (r.horas || 0);
      }
    });

    // Build days array
    const daysInterval = eachDayOfInterval({ start: lastWeekStart, end: lastWeekEnd });
    const days = daysInterval.map((d, i) => ({
      data: format(d, 'yyyy-MM-dd'),
      label: DAY_NAMES_SHORT[i],
    }));

    // Build per-user, per-project breakdown (like RelatorioHoras)
    const allDemandas = demandasAllRes.data || [];
    const weekRegs = horasSemanRes.data || [];
    const allUsers = allUsuariosRes.data || [];

    const userIds = [...new Set(weekRegs.map((r: any) => r.user_id))];

    const horasUsuarios: PreviewUser[] = userIds.map((userId) => {
      const usr = allUsers.find((u: any) => u.id === userId);
      const userRegs = weekRegs.filter((r: any) => r.user_id === userId);

      // Group by demanda
      const demandaIds = [...new Set(userRegs.filter((r: any) => r.demanda_id).map((r: any) => r.demanda_id))];

      const userDemandas: PreviewUserDemanda[] = demandaIds.map((dId) => {
        const dem: any = allDemandas.find((d: any) => d.id === dId);
        const empNome = dem?.empreendimento?.nome || '—';
        const tipoNome = dem?.tipo_projeto?.nome || '—';
        const label = dem ? `${empNome} · ${tipoNome}` : 'Demanda desconhecida';

        const horasPorDia: Record<string, number> = {};
        userRegs.filter((r: any) => r.demanda_id === dId).forEach((r: any) => {
          horasPorDia[r.data] = (horasPorDia[r.data] || 0) + (r.horas || 0);
        });

        const total = Object.values(horasPorDia).reduce((s, h) => s + h, 0);
        return { demandaId: dId, label, horasPorDia, total };
      }).sort((a, b) => b.total - a.total);

      // Total per day
      const totalPorDia: Record<string, number> = {};
      userRegs.forEach((r: any) => {
        totalPorDia[r.data] = (totalPorDia[r.data] || 0) + (r.horas || 0);
      });
      const total = Object.values(totalPorDia).reduce((s, h) => s + h, 0);

      return {
        id: userId,
        nome: usr?.nome || usr?.email || userId,
        demandas: userDemandas,
        totalPorDia,
        total,
      };
    }).filter((u) => u.total > 0).sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      periodo: `${format(lastWeekStart, "dd/MM/yyyy")} a ${format(lastWeekEnd, "dd/MM/yyyy")}`,
      demandas: (demandasRes.data || []).map((d: any) => ({
        empreendimento: d.empreendimento?.nome || '—',
        tipoProjeto: d.tipo_projeto?.nome || '—',
        status: d.status?.nome || '—',
        prioridade: d.prioridade || 0,
        prazo: d.prazo ? format(new Date(d.prazo + 'T12:00:00'), 'dd/MM/yyyy') : '—',
        inicio: d.created_at ? format(new Date(d.created_at), 'dd/MM/yyyy') : '—',
        horasGastas: horasPorDemanda[d.id] ? horasPorDemanda[d.id].toFixed(1) : '0',
      })),
      horasUsuarios,
      days,
    };
  };

  const handlePreview = async () => {
    setGeneratingPreview(true);
    try {
      const data = await generatePreviewData();
      setPreviewData(data);
      // Start with all users expanded
      setExpandedUsers(new Set(data.horasUsuarios.map((u) => u.id)));
      setPreviewOpen(true);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      toast({ title: 'Erro ao gerar relatório', variant: 'destructive' });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleSendEmail = async (reportId: string) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;

    if (report.destinatarios.length === 0) {
      toast({ title: 'Nenhum destinatário selecionado', description: 'Selecione ao menos um destinatário antes de enviar.', variant: 'destructive' });
      return;
    }

    setSendingEmail(true);
    try {
      const recipientEmails = usuarios
        .filter((u) => report.destinatarios.includes(u.id))
        .map((u) => u.email);

      const supabaseUrl = 'https://vvtympzatclvjaqucebr.supabase.co';
      const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2dHltcHphdGNsdmphcXVjZWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTI1NzYsImV4cCI6MjA4NjAyODU3Nn0.C8vWcljx6veAQ0hCi0ms7Ixm6NxhSdWBDeRgUy2Kz50';

      const response = await fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ reportId: report.id, recipients: recipientEmails }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorBody = data?.error || data?.message || 'Erro desconhecido ao enviar.';
        toast({
          title: 'Erro ao enviar e-mail',
          description: errorBody,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'E-mails enviados com sucesso!' });
        const now = new Date().toISOString();
        updateReport(reportId, { ultimo_envio: now } as any);
      }
    } catch (err) {
      console.error('Erro ao enviar e-mail:', err);
      toast({
        title: 'Envio indisponível',
        description: 'A funcionalidade de envio por e-mail requer a configuração de uma Edge Function. Habilite o Lovable Cloud para prosseguir.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const togglePreviewUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const getDisplayName = (u: Usuario) => {
    if (u.nome) {
      const parts = u.nome.split(' ');
      if (parts.length >= 2) return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
      return u.nome;
    }
    return u.email;
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-5 h-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">Relatórios</h3>
          <p className="text-sm text-muted-foreground">Configure os relatórios automáticos do sistema</p>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {reports.map((report) => (
          <AccordionItem
            key={report.id}
            value={report.id}
            className="border rounded-lg px-4 bg-card"
          >
            <div className="flex items-center justify-between py-3">
              <AccordionTrigger className="hover:no-underline p-0 flex-1 [&[data-state=open]>svg]:rotate-180">
                <div className="flex items-center gap-3 text-left">
                  <span className="font-semibold text-sm">{report.nome}</span>
                  <Badge
                    variant={report.ativo ? 'default' : 'secondary'}
                    className={report.ativo
                      ? 'bg-accent text-accent-foreground text-[10px] px-2 py-0'
                      : 'text-[10px] px-2 py-0'
                    }
                  >
                    {report.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <Switch
                checked={report.ativo}
                onCheckedChange={(checked) => updateReport(report.id, { ativo: checked })}
                className="ml-4"
              />
            </div>

            <AccordionContent className="pb-4">
              {/* Automation schedule highlight */}
              <div className="bg-muted/50 rounded-lg p-3 mb-4 flex items-start gap-3">
                <CalendarClock className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Automação programada</span>
                    <Badge
                      variant={report.ativo ? 'default' : 'secondary'}
                      className={report.ativo
                        ? 'bg-accent/20 text-accent border-accent/30 text-[10px] px-1.5 py-0'
                        : 'text-[10px] px-1.5 py-0'
                      }
                    >
                      {report.ativo ? 'Ativa' : 'Desativada'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {report.frequencia} às {report.horario}
                    </span>
                    {report.ultimo_envio && (
                      <span className="text-accent text-[11px]">
                        Último envio: {format(new Date(report.ultimo_envio), "dd/MM/yyyy, HH:mm:ss")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{report.descricao}</p>

              <div className="space-y-3">
                <p className="text-sm font-medium">Destinatários</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {usuarios.map((u) => {
                    const isSelected = report.destinatarios.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleDestinatario(report.id, u.id)}
                          className={isSelected ? 'border-accent data-[state=checked]:bg-accent data-[state=checked]:border-accent' : ''}
                        />
                        <span className={isSelected ? 'font-medium' : 'text-muted-foreground'}>
                          {getDisplayName(u)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-5 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handlePreview}
                  disabled={generatingPreview}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {generatingPreview ? 'Carregando...' : 'Exibir'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleSendEmail(report.id)}
                  disabled={sendingEmail || report.destinatarios.length === 0}
                >
                  <Mail className="w-3.5 h-3.5" />
                  {sendingEmail ? 'Enviando...' : 'Enviar por E-mail'}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório Semanal de Projetos</DialogTitle>
            {previewData && (
              <p className="text-sm text-muted-foreground">
                Período: {previewData.periodo}
              </p>
            )}
          </DialogHeader>

          {previewData && (
            <div className="space-y-6 mt-2">
              {/* Projects in progress */}
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent" />
                  Projetos em Andamento
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empreendimento</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tipo</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Prioridade</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Início</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Prazo</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Horas Gastas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.demandas.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                            Nenhum projeto em andamento.
                          </td>
                        </tr>
                      )}
                      {previewData.demandas.map((d: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-medium">{d.empreendimento}</td>
                          <td className="px-3 py-2 text-muted-foreground">{d.tipoProjeto}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge className={`text-[10px] px-1.5 py-0 ${prioridadeColor[d.prioridade] || ''}`}>
                              {prioridadeLabel[d.prioridade] || d.prioridade || '—'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">{d.inicio}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{d.prazo}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{d.horasGastas}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Weekly hours report — expandable like RelatorioHoras */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent" />
                    Horas da Semana Anterior
                  </h3>
                  {previewData.horasUsuarios.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={() => {
                        const allIds = previewData.horasUsuarios.map((u: PreviewUser) => u.id);
                        if (expandedUsers.size === allIds.length) {
                          setExpandedUsers(new Set());
                        } else {
                          setExpandedUsers(new Set(allIds));
                        }
                      }}
                    >
                      {expandedUsers.size === previewData.horasUsuarios.length ? 'Recolher todos' : 'Expandir todos'}
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px] sticky left-0 bg-muted z-10">
                          Profissional / Projeto
                        </th>
                        {previewData.days.map((d: any, i: number) => {
                          const date = new Date(d.data + 'T12:00:00');
                          const isWeekend = isSaturday(date) || isSunday(date);
                          return (
                            <th key={i} className={`text-center px-1 py-2 font-medium min-w-[52px] ${isWeekend ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                              <div className="text-[10px]">{d.label}</div>
                              <div className="text-[10px] font-normal">{format(date, 'dd/MM')}</div>
                            </th>
                          );
                        })}
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground min-w-[60px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.horasUsuarios.length === 0 && (
                        <tr>
                          <td colSpan={previewData.days.length + 2} className="px-3 py-4 text-center text-muted-foreground">
                            Nenhum registro de horas na semana.
                          </td>
                        </tr>
                      )}
                      {previewData.horasUsuarios.map((usr: PreviewUser) => {
                        const isExpanded = expandedUsers.has(usr.id);
                        return (
                          <React.Fragment key={usr.id}>
                            {/* User summary row */}
                            <tr
                              className="border-t bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => togglePreviewUser(usr.id)}
                            >
                              <td className="px-3 py-2 font-medium text-xs sticky left-0 bg-muted/30 z-10">
                                <div className="flex items-center gap-1.5">
                                  {isExpanded
                                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  }
                                  <span>{usr.nome}</span>
                                  <span className="text-muted-foreground font-normal ml-1">
                                    ({usr.demandas.length} {usr.demandas.length === 1 ? 'projeto' : 'projetos'})
                                  </span>
                                </div>
                              </td>
                              {previewData.days.map((d: any, i: number) => {
                                const val = usr.totalPorDia[d.data] || 0;
                                const date = new Date(d.data + 'T12:00:00');
                                const isWeekend = isSaturday(date) || isSunday(date);
                                return (
                                  <td key={i} className={cn('px-1 py-2 text-center text-xs tabular-nums font-medium', isWeekend && 'bg-muted/20')}>
                                    {val > 0 ? val : <span className="text-muted-foreground/30">—</span>}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-center font-bold text-xs tabular-nums">
                                {usr.total > 0 ? `${usr.total}h` : '—'}
                              </td>
                            </tr>

                            {/* Expanded: project rows */}
                            {isExpanded && usr.demandas.map((dem) => (
                              <tr key={dem.demandaId} className="border-t border-dashed">
                                <td className="pl-8 pr-3 py-1.5 text-[11px] text-muted-foreground sticky left-0 bg-card z-10 truncate max-w-[200px]">
                                  {dem.label}
                                </td>
                                {previewData.days.map((d: any, i: number) => {
                                  const val = dem.horasPorDia[d.data] || 0;
                                  const date = new Date(d.data + 'T12:00:00');
                                  const isWeekend = isSaturday(date) || isSunday(date);
                                  return (
                                    <td key={i} className={cn('px-1 py-1.5 text-center text-[11px] tabular-nums', isWeekend && 'bg-muted/20')}>
                                      {val > 0 ? val : <span className="text-muted-foreground/20">—</span>}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5 text-center text-xs tabular-nums text-muted-foreground">
                                  {dem.total > 0 ? `${dem.total}h` : '—'}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}

                      {/* Grand totals */}
                      {previewData.horasUsuarios.length > 1 && (
                        <tr className="border-t-2 border-primary/20 bg-muted/50 font-medium">
                          <td className="px-3 py-2.5 sticky left-0 bg-muted/50 z-10 text-xs">Total Geral</td>
                          {previewData.days.map((d: any, i: number) => {
                            const val = previewData.horasUsuarios.reduce((s: number, u: PreviewUser) => s + (u.totalPorDia[d.data] || 0), 0);
                            return (
                              <td key={i} className="px-1 py-2.5 text-center text-xs tabular-nums">
                                {val > 0 ? val : '—'}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2.5 text-center text-sm tabular-nums font-bold">
                            {previewData.horasUsuarios.reduce((s: number, u: PreviewUser) => s + u.total, 0).toFixed(1)}h
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfigRelatorios;
