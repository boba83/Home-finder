const nf = new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('sr-Latn-RS', { maximumFractionDigits: 1 });

export function formatPrice(eur: number | null | undefined): string {
  return eur ? `${nf.format(eur)} €` : 'Cena na upit';
}

export function formatArea(m2: number | null | undefined): string {
  return m2 ? `${nf.format(m2)} m²` : '—';
}

/** 1250 m² -> "12,5 a" */
export function formatAres(m2: number | null | undefined): string {
  return m2 ? `${nf1.format(m2 / 100)} a` : '—';
}

export function formatNumber(n: number): string {
  return nf.format(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'upravo';
  if (diff < 3600) return `pre ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `pre ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'juče';
  if (days < 30) return `pre ${days} dana`;
  return new Date(iso).toLocaleDateString('sr-Latn-RS');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sr-Latn-RS', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
