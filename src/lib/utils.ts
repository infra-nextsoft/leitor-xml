import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateTime(dateStr: string) {
  if (!dateStr) return '---';
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch (e) {
    return dateStr;
  }
}

export function formatSqlDateTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const cleaned = dateStr.trim();
    const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2}))?/);
    if (match) {
      const [_, year, month, day, hour = '00', min = '00', sec = '00'] = match;
      return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
    }
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function formatCNPJ(cnpj: string) {
  if (!cnpj) return '---';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export interface ParsedAccessKey {
  cUF: string;
  aamm: string;
  anoMesFormatado: string;
  cnpj: string;
  mod: string;
  serie: string;
  nNF: string;
  tpEmis: string;
  cNF: string;
  cDV: string;
}

export function parseAccessKey(chave: string): ParsedAccessKey | null {
  const clean = (chave || '').replace(/\D/g, '');
  if (clean.length !== 44) return null;

  const cUF = clean.slice(0, 2);
  const aamm = clean.slice(2, 6);
  const aa = aamm.slice(0, 2);
  const mm = aamm.slice(2, 4);
  const cnpj = clean.slice(6, 20);
  const mod = clean.slice(20, 22);
  const serie = String(parseInt(clean.slice(22, 25), 10));
  const nNF = String(parseInt(clean.slice(25, 34), 10));
  const tpEmis = clean.slice(34, 35);
  const cNF = clean.slice(35, 43);
  const cDV = clean.slice(43, 44);

  return {
    cUF,
    aamm,
    anoMesFormatado: `${mm}/20${aa}`,
    cnpj,
    mod,
    serie,
    nNF,
    tpEmis,
    cNF,
    cDV
  };
}
