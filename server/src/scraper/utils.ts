import type { CheerioAPI } from 'cheerio';
import { cleanWhitespace } from '../domain/normalize.js';

export function setQueryParam(url: string, key: string, value: string | number | null): string {
  const u = new URL(url);
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, String(value));
  return u.toString();
}

export function absoluteUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Izvlači JSON objekat koji počinje posle `marker` u HTML-u (npr. "QuidditaEnvironment.CurrentClassified="). */
export function extractJsonAfter(html: string, marker: string): unknown | null {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const from = html.indexOf('{', start + marker.length);
  if (from === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(from, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function extractNextData<T = any>(html: string): T | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}

export function text($: CheerioAPI, el: any): string {
  return cleanWhitespace($(el).text());
}

/** Parsira datum u formatu "28.09.2026." ili "28/09/26" */
export function parseSerbianDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
