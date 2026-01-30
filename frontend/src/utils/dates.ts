import { format, subDays } from 'date-fns';

export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function daysAgoISODate(days: number): string {
  return format(subDays(new Date(), days), 'yyyy-MM-dd');
}

export function fmtDateBR(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(d.getTime())) return '-';
  return format(d, 'dd/MM/yyyy');
}

export function fmtDateTimeBR(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(d.getTime())) return '-';
  return format(d, 'dd/MM/yyyy HH:mm');
}
