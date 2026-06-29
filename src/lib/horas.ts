import { eachDayOfInterval, format, getDay, startOfDay } from 'date-fns';

// Início da alocação de horas no Esquadro: ninguém é cobrado antes desta data.
export const ALOCACAO_INICIO = new Date('2026-02-23');

// Carga horária diária padrão (full-time) quando o perfil não define uma.
export const CARGA_HORARIA_PADRAO = 8.5;

/**
 * Horas esperadas num dia, conforme a carga diária da pessoa.
 * Dias úteis = segunda a sexta; fim de semana = 0.
 */
export function horasEsperadasNoDia(date: Date, cargaDiaria?: number | null): number {
  const dow = getDay(date); // 0 = domingo ... 6 = sábado
  if (dow === 0 || dow === 6) return 0;
  return cargaDiaria ?? CARGA_HORARIA_PADRAO;
}

export interface GapHoras {
  data: string;
  esperado: number;
  alocado: number;
}

/**
 * Calcula os dias com horas faltantes de um usuário dentro de uma janela,
 * respeitando:
 *  - a carga horária diária da pessoa (`cargaDiaria`); e
 *  - a data de entrada dela no sistema (`entrada` = `created_at` do perfil):
 *    dias anteriores à entrada NÃO são cobrados (evita faltante retroativo
 *    para quem acabou de ser cadastrado).
 */
export function calcularGapsHoras(params: {
  inicio: Date;
  fim: Date;
  horasPorData: Record<string, number>;
  cargaDiaria?: number | null;
  entrada?: string | Date | null;
}): GapHoras[] {
  const { inicio, fim, horasPorData, cargaDiaria, entrada } = params;

  // Data de entrada como string yyyy-MM-dd (comparação por dia, sem fuso).
  const entradaStr = entrada ? format(new Date(entrada), 'yyyy-MM-dd') : null;

  const inicioDia = startOfDay(inicio);
  if (inicioDia > fim) return [];

  const gaps: GapHoras[] = [];
  for (const dia of eachDayOfInterval({ start: inicioDia, end: fim })) {
    const dateStr = format(dia, 'yyyy-MM-dd');
    // Pula dias anteriores à entrada da pessoa.
    if (entradaStr && dateStr < entradaStr) continue;
    const esperado = horasEsperadasNoDia(dia, cargaDiaria);
    if (esperado === 0) continue; // fim de semana
    const alocado = horasPorData[dateStr] || 0;
    if (alocado < esperado) gaps.push({ data: dateStr, esperado, alocado });
  }
  return gaps;
}
