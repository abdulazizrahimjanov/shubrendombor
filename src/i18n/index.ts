import { uz } from './uz';
import { ru } from './ru';
import { useAppStore } from '../store/useAppStore';

export type Language = 'uz' | 'ru';

export const dictionaries = { uz, ru } as const;

export function useT() {
  const language = useAppStore((s) => s.language);
  return dictionaries[language];
}

export function formatMoney(
  amount: number,
  options?: { showUSD?: boolean; usdRate?: number; lang?: Language }
): string {
  const rounded = Math.round(amount || 0);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const suffix = options?.lang === 'ru' ? 'сум' : "so'm";
  const uzsStr = `${formatted} ${suffix}`;
  if (options?.showUSD && options?.usdRate && options.usdRate > 0) {
    const usd = (amount / options.usdRate).toFixed(2);
    return `${uzsStr} ($${usd})`;
  }
  return uzsStr;
}

export function formatShortMoney(amount: number, lang: Language = 'uz'): string {
  const abs = Math.abs(amount);
  const suffix = lang === 'ru' ? 'сум' : "so'm";
  if (abs >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)} mlrd ${suffix}`;
  }
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)} mln ${suffix}`;
  }
  return formatMoney(amount, { lang });
}

export function formatDateTime(iso?: string, lang: Language = 'uz'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
