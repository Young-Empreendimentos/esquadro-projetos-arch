import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data de "hoje" no fuso de São Paulo (UTC-3), no formato YYYY-MM-DD.
 *
 * Use SEMPRE isto em vez de `new Date().toISOString().slice(0,10)`: o toISOString
 * devolve a data em UTC, então qualquer ação feita à noite (após ~21h em SP) rolava
 * para o dia seguinte — ex.: concluir uma demanda às 22:36 gravava a data de amanhã.
 * O locale "en-CA" formata como YYYY-MM-DD.
 */
export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
