import type { IzvorInfo, ListingsResponse, Oglas, Podesavanja, PushPreferences, ScrapeStatus, Stats } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body?.details) ? `: ${body.details.map((d: any) => d.message).join(', ')}` : '';
    throw new ApiError(`${body?.error ?? `Greška ${res.status}`}${detail}`, res.status);
  }
  return body as T;
}

export interface ListingsQuery {
  grupa?: string;
  kategorija?: string;
  izvor?: string[];
  status?: string;
  oznaka?: string;
  sort?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

function toSearch(q: ListingsQuery): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === '' || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => p.append(key, v));
    else p.set(key, String(value));
  }
  return p.toString();
}

export const api = {
  listings: (q: ListingsQuery) => request<ListingsResponse>(`/listings?${toSearch(q)}`),
  stats: () => request<Stats>('/listings/stats'),
  updateListing: (id: number, data: Partial<Pick<Oglas, 'omiljeno' | 'arhivirano' | 'novo'>>) =>
    request<Oglas>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  markAllSeen: () => request<{ azurirano: number }>('/listings/oznaci-pregledano', { method: 'POST', body: '{}' }),

  settings: () => request<Podesavanja>('/settings'),
  saveSettings: (data: Partial<Podesavanja>) =>
    request<{ settings: Podesavanja; promenjenoOglasa: number }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  sources: () => request<IzvorInfo[]>('/settings/izvori'),

  scrapeStatus: () => request<ScrapeStatus>('/scrape/status'),
  runScrape: (duboko = false) => request<{ started: boolean }>('/scrape/run', { method: 'POST', body: JSON.stringify({ duboko }) }),

  pushConfig: () => request<{ enabled: boolean; publicKey: string | null }>('/push/config'),
  pushSubscribe: (subscription: PushSubscriptionJSON, preferences: PushPreferences) =>
    request<{ id: number }>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription, preferences, uredjaj: navigator.userAgent.slice(0, 200) }),
    }),
  pushStatus: (endpoint: string) =>
    request<{ subscribed: boolean; preferences?: PushPreferences }>('/push/status', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushPreferences: (endpoint: string, preferences: PushPreferences) =>
    request<{ id: number }>('/push/preferences', { method: 'POST', body: JSON.stringify({ endpoint, ...preferences }) }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: boolean }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: (endpoint?: string) => request<{ poslato: number }>('/push/test', { method: 'POST', body: JSON.stringify({ endpoint }) }),
};
