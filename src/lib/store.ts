import { create } from 'zustand';
import type { Locale, Snapshot } from '../../shared/types';
import { translate, type TKey } from '../i18n';

export type ViewId = 'room' | 'scenes' | 'automations' | 'energy' | 'settings';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface AppState {
  snapshot: Snapshot | null;
  connected: boolean;
  locale: Locale;
  theme: ThemeMode;
  view: ViewId;
  sheetDeviceId: string | null;
  paletteOpen: boolean;
  hubOpen: boolean;
  ready: boolean;
  toasts: Toast[];

  setSnapshot: (snapshot: Snapshot) => void;
  setConnected: (connected: boolean) => void;
  setReady: (ready: boolean) => void;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setView: (view: ViewId) => void;
  openSheet: (deviceId: string) => void;
  closeSheet: () => void;
  setPalette: (open: boolean) => void;
  setHub: (open: boolean) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

const read = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* tryb prywatny — trudno */
  }
};

export const useApp = create<AppState>((set) => ({
  snapshot: null,
  connected: false,
  locale: read<Locale>('mypilot.locale', 'pl'),
  theme: read<ThemeMode>('mypilot.theme', 'system'),
  view: 'room',
  sheetDeviceId: null,
  paletteOpen: false,
  hubOpen: false,
  ready: false,
  toasts: [],

  setSnapshot: (snapshot) => set({ snapshot }),
  setConnected: (connected) => set({ connected }),
  setReady: (ready) => set({ ready }),
  setLocale: (locale) => {
    write('mypilot.locale', locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
  setTheme: (theme) => {
    write('mypilot.theme', theme);
    set({ theme });
  },
  setView: (view) => set({ view, paletteOpen: false }),
  openSheet: (deviceId) => set({ sheetDeviceId: deviceId }),
  closeSheet: () => set({ sheetDeviceId: null }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setHub: (hubOpen) => set({ hubOpen }),
  toast: (message, tone = 'info') =>
    set((state) => ({
      toasts: [...state.toasts.slice(-2), { id: Math.random().toString(36).slice(2), message, tone }],
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export function useT() {
  const locale = useApp((state) => state.locale);
  return (key: TKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

export const useDevice = (id: string | null) =>
  useApp((state) => state.snapshot?.devices.find((device) => device.id === id) ?? null);
