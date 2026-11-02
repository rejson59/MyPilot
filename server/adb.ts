import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LocalizedText } from '../shared/types.js';
import type { StoredConfig } from './config.js';

const run = promisify(execFile);

export interface AdbDevice {
  serial: string;
  model: string;
}

export interface PhoneSnapshot {
  serial: string;
  battery: number | null;
  charging: boolean | null;
  screenOn: boolean | null;
  dnd: boolean | null;
  mediaVolume: number | null;
  volumeRange: [number, number] | null;
}

export interface AdbResponse {
  ok: boolean;
  message: LocalizedText;
  latencyMs?: number;
  devices?: AdbDevice[];
}

const binary = (config: StoredConfig) => config.phone.adbPath?.trim() || 'adb';

async function adb(config: StoredConfig, args: string[], timeout = 6000): Promise<string | null> {
  try {
    const { stdout } = await run(binary(config), args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return stdout.trim();
  } catch {
    return null;
  }
}

const target = (config: StoredConfig, serial?: string) => {
  const chosen = serial ?? config.phone.serial?.trim();
  return chosen ? ['-s', chosen] : [];
};

export async function listAdbDevices(config: StoredConfig): Promise<AdbResponse> {
  const started = Date.now();
  const out = await adb(config, ['devices', '-l']);
  if (out === null) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: 'Nie znaleziono „adb”. Zainstaluj platform-tools i podaj pełną ścieżkę do adb.exe.',
        en: '“adb” not found. Install platform-tools and provide the full path to adb.exe.',
      },
    };
  }

  const devices: AdbDevice[] = out
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*') && !line.includes('offline'))
    .map((line) => {
      const [serial] = line.split(/\s+/);
      const model = /model:(\S+)/.exec(line)?.[1] ?? '';
      return { serial, model };
    })
    .filter((device) => device.serial && !device.serial.startsWith('List'));

  if (!devices.length) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      devices,
      message: {
        pl: 'ADB działa, ale nie widzi telefonu. Włącz debugowanie USB i zaakceptuj prompt na ekranie telefonu.',
        en: 'ADB works but sees no phone. Enable USB debugging and accept the prompt on the phone.',
      },
    };
  }

  return {
    ok: true,
    latencyMs: Date.now() - started,
    devices,
    message: {
      pl: `Widzę ${devices.length === 1 ? 'telefon' : `${devices.length} urządzenia`}: ${devices.map((device) => device.model || device.serial).join(', ')}.`,
      en: `Found ${devices.length === 1 ? 'a phone' : `${devices.length} devices`}: ${devices.map((device) => device.model || device.serial).join(', ')}.`,
    },
  };
}

function parseVolume(text: string | null): { percent: number | null; range: [number, number] | null } {
  if (!text) return { percent: null, range: null };
  const match = /volume is (\d+) in range \[(\d+)\.\.(\d+)\]/i.exec(text);
  if (!match) return { percent: null, range: null };
  const index = Number(match[1]);
  const min = Number(match[2]);
  const max = Number(match[3]);
  if (!Number.isFinite(index) || max <= min) return { percent: null, range: null };
  return { percent: Math.round((index / max) * 100), range: [min, max] };
}

export async function readPhoneState(config: StoredConfig): Promise<PhoneSnapshot | null> {
  const base = target(config);
  const batteryOut = await adb(config, [...base, 'shell', 'dumpsys', 'battery']);
  if (batteryOut === null) return null;

  const level = /level:\s*(\d+)/.exec(batteryOut)?.[1];
  const status = /status:\s*(\d+)/.exec(batteryOut)?.[1];
  const plugged = /plugged:\s*(\d+)/.exec(batteryOut)?.[1];
  const powerOut = await adb(config, [...base, 'shell', 'dumpsys', 'power']);
  const wake = /mWakefulness=(\w+)/.exec(powerOut ?? '')?.[1];
  const zenOut = await adb(config, [...base, 'shell', 'settings', 'get', 'global', 'zen_mode']);
  const volumeOut = await adb(config, [...base, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get']);
  const parsedVolume = parseVolume(volumeOut ?? (await adb(config, [...base, 'shell', 'media', 'volume', '--stream', '3', '--get'])));

  return {
    serial: config.phone.serial || 'default',
    battery: level ? Number(level) : null,
    charging: status ? Number(status) === 2 || Number(plugged) > 0 : null,
    screenOn: wake ? wake === 'Awake' : null,
    dnd: zenOut ? Number(zenOut) !== 0 : null,
    mediaVolume: parsedVolume.percent,
    volumeRange: parsedVolume.range,
  };
}

async function shell(config: StoredConfig, command: string[]): Promise<string | null> {
  return adb(config, [...target(config), 'shell', ...command]);
}

export async function setMediaVolume(config: StoredConfig, percent: number): Promise<AdbResponse> {
  const started = Date.now();
  const state = await readPhoneState(config);
  const range = state?.volumeRange ?? [0, 15];
  const index = Math.round((Math.max(0, Math.min(100, percent)) / 100) * range[1]);
  const out = await shell(config, ['cmd', 'media_session', 'volume', '--stream', '3', '--set', String(index)]);
  if (out === null) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: { pl: 'Nie udało się ustawić głośności telefonu.', en: 'Could not set the phone volume.' },
    };
  }
  return {
    ok: true,
    latencyMs: Date.now() - started,
    message: { pl: `Głośność telefonu: ${percent}%.`, en: `Phone volume: ${percent}%.` },
  };
}

export async function setDnd(config: StoredConfig, enabled: boolean): Promise<AdbResponse> {
  const out = await shell(config, ['settings', 'put', 'global', 'zen_mode', enabled ? '1' : '0']);
  if (out === null) {
    return {
      ok: false,
      message: {
        pl: 'Nie udało się zmienić trybu Nie przeszkadzać (wymaga uprawnień przez ADB).',
        en: 'Could not change Do Not Disturb (needs ADB permissions).',
      },
    };
  }
  return {
    ok: true,
    message: {
      pl: enabled ? 'Telefon: Nie przeszkadzać włączone.' : 'Telefon: Nie przeszkadzać wyłączone.',
      en: enabled ? 'Phone: Do Not Disturb on.' : 'Phone: Do Not Disturb off.',
    },
  };
}

export async function setScreen(config: StoredConfig, on: boolean, lock = false): Promise<AdbResponse> {
  const key = lock ? '26' : on ? '224' : '223';
  const out = await shell(config, ['input', 'keyevent', key]);
  if (out === null) {
    return {
      ok: false,
      message: { pl: 'Nie udało się sterować ekranem telefonu.', en: 'Could not control the phone screen.' },
    };
  }
  return {
    ok: true,
    message: lock
      ? { pl: 'Telefon zablokowany.', en: 'Phone locked.' }
      : { pl: on ? 'Ekran telefonu włączony.' : 'Ekran telefonu wyłączony.', en: on ? 'Phone screen on.' : 'Phone screen off.' },
  };
}

export async function mediaKey(config: StoredConfig, action: 'play-pause' | 'next' | 'prev'): Promise<AdbResponse> {
  const key = action === 'next' ? '87' : action === 'prev' ? '88' : '85';
  const out = await shell(config, ['input', 'keyevent', key]);
  if (out === null) {
    return { ok: false, message: { pl: 'Nie udało się wysłać klawisza multimedialnego.', en: 'Could not send the media key.' } };
  }
  return {
    ok: true,
    message: { pl: `Telefon: ${action}.`, en: `Phone: ${action}.` },
  };
}

export async function launchOnPhone(config: StoredConfig, pkg: string): Promise<AdbResponse> {
  if (!/^[a-z0-9_.]+$/i.test(pkg)) {
    return { ok: false, message: { pl: 'Niepoprawna nazwa pakietu.', en: 'Invalid package name.' } };
  }
  const out = await shell(config, ['monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
  if (out === null || /No activities found/i.test(out)) {
    return {
      ok: false,
      message: {
        pl: `Nie znaleziono aplikacji „${pkg}” na telefonie. Podaj nazwę pakietu, np. com.spotify.music.`,
        en: `App “${pkg}” not found on the phone. Use a package name, e.g. com.spotify.music.`,
      },
    };
  }
  return { ok: true, message: { pl: `Uruchomiono ${pkg}.`, en: `Launched ${pkg}.` } };
}

export async function vibrate(config: StoredConfig): Promise<AdbResponse> {
  const out = await shell(config, ['cmd', 'vibrate', '800']);
  if (out === null) {
    return {
      ok: false,
      message: {
        pl: 'Telefon nie przyjął wibracji (brak połączenia ADB albo starszy Android). Włącz ekran, żeby go znaleźć.',
        en: 'The phone did not accept vibration (no ADB connection or an older Android). Wake the screen to find it.',
      },
    };
  }
  return { ok: true, message: { pl: 'Telefon wibruje.', en: 'Phone is vibrating.' } };
}
