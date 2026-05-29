export function formatMrrDisplay(mrr: number | null | undefined): string {
  if (mrr == null) return '—';
  if (!Number.isFinite(mrr)) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(mrr);
}
