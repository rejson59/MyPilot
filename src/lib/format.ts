import type { ActivityEvent, Device, Locale, LocalizedText } from '../../shared/types';
import type { TKey } from '../i18n';

export const cx = (...values: (string | false | null | undefined)[]) => values.filter(Boolean).join(' ');

export const localized = (text: LocalizedText | undefined, locale: Locale) => (text ? text[locale] ?? text.pl : '');

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function timeAgo(ts: number, locale: Locale): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 20) return locale === 'pl' ? 'teraz' : 'just now';
  if (seconds < 60) return locale === 'pl' ? `${seconds} s temu` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return locale === 'pl' ? `${minutes} min temu` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === 'pl' ? `${hours} godz. temu` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return locale === 'pl' ? `${days} dni temu` : `${days}d ago`;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, '0')}`;
}

export const isDeviceOn = (device: Device): boolean => {
  const state = device.state as Record<string, unknown>;
  if (device.kind === 'phone' || device.kind === 'tablet') return Boolean(state.screenOn);
  if (device.kind === 'blind') return Number(state.position ?? 0) > 0;
  return Boolean(state.on);
};

export type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

export function deviceStatus(device: Device, t: TFn): string {
  const s = device.state as Record<string, any>;
  switch (device.kind) {
    case 'light':
      return s.on
        ? t('status.lightOn', { value: Math.round(s.brightness ?? 0), temp: Math.round(s.tempK ?? 2700) })
        : t('status.lightOff');
    case 'led_strip':
      return s.on ? t('status.led', { effect: s.effect ?? '—', value: Math.round(s.brightness ?? 0) }) : t('status.lightOff');
    case 'speaker':
      return s.on
        ? t('status.speaker', { artist: s.track?.artist ?? '', title: s.track?.title ?? '' })
        : t('status.speakerOff');
    case 'tv':
      return s.on ? t('status.tvOn', { input: s.input ?? 'HDMI', value: Math.round(s.volume ?? 0) }) : t('status.tvOff');
    case 'ac':
      return s.on
        ? t('status.acOn', {
            mode: t(`sheet.mode.${s.mode ?? 'cool'}` as TKey),
            target: Math.round(s.target ?? 22),
          })
        : t('status.acOff');
    case 'pc':
    case 'laptop':
      return s.on
        ? t('status.pcOn', { app: s.activeApp ?? '—', cpu: Math.round(s.cpu ?? 0) })
        : t('status.pcOff');
    case 'phone':
      return t('status.phone', { value: Math.round(s.battery ?? 0) });
    case 'tablet':
      return t('status.tablet', { value: Math.round(s.battery ?? 0) });
    case 'plug':
      return s.on ? t('status.plugOn', { value: Math.round(s.loadW ?? 0) }) : t('status.plugOff');
    case 'blind':
      return t('status.blind', { value: Math.round(s.position ?? 0) });
    default:
      return '';
  }
}

export function eventIconKind(event: ActivityEvent): 'scene' | 'automation' | 'warning' | 'command' {
  if (event.kind === 'scene') return 'scene';
  if (event.kind === 'automation') return 'automation';
  if (event.kind === 'warning') return 'warning';
  return 'command';
}

export const sceneActionSummary = (device: Device, patch: Record<string, unknown>, t: TFn) => {
  if ('on' in patch) return `${device.name.pl.split(' ')[0]} ${patch.on ? 'ON' : 'OFF'}`;
  if ('brightness' in patch) return `${device.name.pl.split(' ')[0]} ${patch.brightness}%`;
  if ('position' in patch) return `${device.name.pl.split(' ')[0]} ${patch.position}%`;
  return device.name.pl;
};

export const kindAccent: Record<string, string> = {
  light: '#f59e0b',
  led_strip: '#a855f7',
  speaker: '#06b6d4',
  tv: '#3b82f6',
  ac: '#14b8a6',
  pc: '#6366f1',
  laptop: '#7c3aed',
  phone: '#10b981',
  tablet: '#0ea5e9',
  plug: '#f43f5e',
  blind: '#78716c',
};

void clock;

/** Polska liczba mnoga: 1 akcja / 2 akcje / 5 akcji. */
export function plural(
  locale: Locale,
  count: number,
  plForms: [string, string, string],
  enForms: [string, string],
): string {
  if (locale === 'en') return `${count} ${count === 1 ? enForms[0] : enForms[1]}`;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const form =
    count === 1
      ? plForms[0]
      : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
        ? plForms[1]
        : plForms[2];
  return `${count} ${form}`;
}
