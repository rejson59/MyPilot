import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LocalizedText, SetupTestResult } from '../shared/types.js';
import type { StoredConfig } from './config.js';
import { probeAgent } from './agent.js';

const run = promisify(execFile);

/* ------------------------------------------------------------------ */
/*  IR — mostek HTTP (ESP32 / Tasmota / Broadlink-bridge / własny)     */
/* ------------------------------------------------------------------ */

export type IrTarget = 'tv' | 'ac';

/**
 * Kody IR. Dla Samsunga to kody NEC — tak, jak wysyła je Tasmota.
 * W trybie live ZAWSZE zweryfikuj je pilotem: każdy model może używać
 * innych kodów, dlatego trzymamy je w jednym, edytowalnym miejscu.
 */
const SAMSUNG_NEC: Record<string, string> = {
  power: '0xE0E040BF',
  'vol+': '0xE0E0E01F',
  'vol-': '0xE0E0D02F',
  mute: '0xE0E0F04F',
};
// Uwaga: kody nawigacji (OK / strzałki / HOME / BACK) różnią się między modelami.
// Nie zgadujemy ich — w trybie live trzeba je przechwycić pilotem i dopisać tutaj.


export interface AdapterResult {
  ok: boolean;
  message: LocalizedText;
  latencyMs?: number;
}

async function irRequest(
  config: StoredConfig,
  target: IrTarget,
  key: string,
  extra?: Record<string, unknown>,
): Promise<AdapterResult> {
  const { enabled, url, format } = config.irBridge;
  if (!enabled || !url) {
    return {
      ok: false,
      message: {
        pl: 'Mostek IR nie jest skonfigurowany — polecenie zapisane lokalnie.',
        en: 'IR bridge is not configured — command saved locally.',
      },
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  const code = SAMSUNG_NEC[key];
  if (format === 'tasmota' && !code) {
    return {
      ok: false,
      message: {
        pl: `Brak zapisanego kodu IR dla przycisku „${key}”. Przechwyć go pilotem i dopisz w server/adapters.ts.`,
        en: `No IR code stored for “${key}”. Capture it with the remote and add it in server/adapters.ts.`,
      },
    };
  }

  try {
    if (format === 'tasmota') {
      const command = 'IRsend';
      const payload = encodeURIComponent(
        JSON.stringify({ Protocol: 'SAMSUNG', Bits: 32, Data: code, ...extra }),
      );
      const res = await fetch(`${url.replace(/\/$/, '')}/cm?cmnd=${command}%20${payload}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      const res = await fetch(`${url.replace(/\/$/, '')}/ir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, key, ...extra }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: { pl: `Wysłano kod IR: ${key}`, en: `IR code sent: ${key}` },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: `Mostek IR nie odpowiedział (${(error as Error).message}).`,
        en: `IR bridge did not respond (${(error as Error).message}).`,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const sendIr = irRequest;

/* ------------------------------------------------------------------ */
/*  Bluetooth — głośnik przez bluetoothctl (Linux)                     */
/* ------------------------------------------------------------------ */

async function bt(args: string[]): Promise<AdapterResult> {
  const started = Date.now();
  try {
    const { stdout } = await run('bluetoothctl', args, { timeout: 12_000 });
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: { pl: 'Bluetooth: ok', en: 'Bluetooth: ok' },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: `Bluetooth niedostępny (${(error as Error).message.split('\n')[0]}).`,
        en: `Bluetooth unavailable (${(error as Error).message.split('\n')[0]}).`,
      },
    };
  }
}

export async function btConnect(config: StoredConfig): Promise<AdapterResult> {
  const mac = config.bluetooth.speakerMac;
  if (!config.bluetooth.enabled || !mac) {
    return {
      ok: false,
      message: {
        pl: 'Sterowanie Bluetooth nie jest włączone w Ustawieniach.',
        en: 'Bluetooth control is disabled in Settings.',
      },
    };
  }
  await bt(['power', 'on']);
  return bt(['connect', mac]);
}

export async function btDisconnect(config: StoredConfig): Promise<AdapterResult> {
  return bt(['disconnect', config.bluetooth.speakerMac]);
}

/** Głośność systemowa (PulseAudio/PipeWire) — działa dla wyjścia BT. */
export async function setSystemVolume(percent: number): Promise<AdapterResult> {
  try {
    await run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${Math.round(percent)}%`], { timeout: 4000 });
    return { ok: true, message: { pl: 'Głośność ustawiona', en: 'Volume set' } };
  } catch {
    return {
      ok: false,
      message: {
        pl: 'Nie znaleziono PulseAudio — głośność ustawiona w aplikacji.',
        en: 'PulseAudio not found — volume set in the app only.',
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Home Assistant — mostek do setek urządzeń                          */
/* ------------------------------------------------------------------ */

export async function haService(
  config: StoredConfig,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<AdapterResult> {
  const { enabled, url, token } = config.homeAssistant;
  if (!enabled || !token) {
    return {
      ok: false,
      message: { pl: 'Home Assistant nie jest podłączony.', en: 'Home Assistant is not connected.' },
    };
  }
  const started = Date.now();
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: { pl: 'Home Assistant wykonał akcję.', en: 'Home Assistant executed the action.' },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: `Home Assistant: ${(error as Error).message}`,
        en: `Home Assistant: ${(error as Error).message}`,
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Test połączeń z poziomu Ustawień                                   */
/* ------------------------------------------------------------------ */

export async function testTarget(
  target: SetupTestResult['target'],
  config: StoredConfig,
): Promise<SetupTestResult> {
  const started = Date.now();

  if (target === 'ir') {
    if (!config.irBridge.url) {
      return { target, ok: false, message: { pl: 'Podaj adres mostka IR.', en: 'Enter the IR bridge address.' } };
    }
    try {
      const probeUrl =
        config.irBridge.format === 'tasmota'
          ? `${config.irBridge.url.replace(/\/$/, '')}/cm?cmnd=Status`
          : config.irBridge.url.replace(/\/$/, '');
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(4000) });
      return {
        target,
        ok: res.status < 500,
        latencyMs: Date.now() - started,
        message:
          res.status < 500
            ? {
                pl: `Mostek IR odpowiada (HTTP ${res.status}, format ${config.irBridge.format}).`,
                en: `IR bridge responded (HTTP ${res.status}, ${config.irBridge.format} format).`,
              }
            : { pl: `Mostek odpowiedział HTTP ${res.status}.`, en: `Bridge answered HTTP ${res.status}.` },
      };
    } catch (error) {
      return {
        target,
        ok: false,
        latencyMs: Date.now() - started,
        message: {
          pl: `Brak odpowiedzi: ${(error as Error).message}. Sprawdź IP i sieć lokalną.`,
          en: `No response: ${(error as Error).message}. Check the IP and local network.`,
        },
      };
    }
  }

  if (target === 'bluetooth') {
    try {
      const { stdout } = await run('bluetoothctl', ['show'], { timeout: 5000 });
      return {
        target,
        ok: true,
        latencyMs: Date.now() - started,
        message: {
          pl: `Adapter Bluetooth działa (${stdout.split('\n')[0]?.trim() ?? 'hci0'}).`,
          en: `Bluetooth adapter works (${stdout.split('\n')[0]?.trim() ?? 'hci0'}).`,
        },
      };
    } catch (error) {
      return {
        target,
        ok: false,
        latencyMs: Date.now() - started,
        message: {
          pl: 'Brak adaptera Bluetooth w systemie. Na Windows/macOS uruchom agenta MyPilot na komputerze.',
          en: 'No Bluetooth adapter found. On Windows/macOS run the MyPilot agent on your computer.',
        },
      };
    }
  }

  if (target === 'homeassistant') {
    if (!config.homeAssistant.token) {
      return {
        target,
        ok: false,
        message: { pl: 'Wklej token długotrwałego dostępu z HA.', en: 'Paste a long-lived access token from HA.' },
      };
    }
    try {
      const res = await fetch(`${config.homeAssistant.url.replace(/\/$/, '')}/api/`, {
        headers: { authorization: `Bearer ${config.homeAssistant.token}` },
        signal: AbortSignal.timeout(5000),
      });
      return {
        target,
        ok: res.ok,
        latencyMs: Date.now() - started,
        message: res.ok
          ? { pl: 'Home Assistant przyjął token.', en: 'Home Assistant accepted the token.' }
          : { pl: `HA odpowiedział HTTP ${res.status} — sprawdź token.`, en: `HA answered HTTP ${res.status} — check the token.` },
      };
    } catch (error) {
      return {
        target,
        ok: false,
        latencyMs: Date.now() - started,
        message: {
          pl: `Brak połączenia z HA: ${(error as Error).message}.`,
          en: `Cannot reach HA: ${(error as Error).message}.`,
        },
      };
    }
  }

  if (target === 'agent') {
    const probe = await probeAgent(config);
    return { target, ok: probe.ok, message: probe.message, latencyMs: probe.latencyMs };
  }

  // MQTT — sprawdzamy tylko format URL-a; realne połączenie robi broker.
  const urlOk = /^mqtts?:\/\//.test(config.mqtt.url);
  return {
    target,
    ok: urlOk,
    latencyMs: Date.now() - started,
    message: urlOk
      ? {
          pl: 'Adres brokera wygląda poprawnie. Po zapisaniu serwer podłączy się do MQTT.',
          en: 'Broker address looks valid. The server will connect after saving.',
        }
      : { pl: 'Adres musi zaczynać się od mqtt:// lub mqtts://', en: 'URL must start with mqtt:// or mqtts://' },
  };
}

/* ------------------------------------------------------------------ */
/*  Surowy kod IR — dla własnych urządzeń (taśma LED, lampa, cokolwiek) */
/* ------------------------------------------------------------------ */

export async function sendIrRaw(
  config: StoredConfig,
  params: { code: string; protocol?: string; bits?: number },
): Promise<AdapterResult> {
  const { enabled, url, format } = config.irBridge;
  if (!enabled || !url) {
    return {
      ok: false,
      message: {
        pl: 'Mostek IR nie jest skonfigurowany — przycisk zadziałał tylko w aplikacji.',
        en: 'IR bridge is not configured — the button worked in the app only.',
      },
    };
  }

  const started = Date.now();
  try {
    if (format === 'tasmota') {
      const payload = encodeURIComponent(
        JSON.stringify({
          Protocol: params.protocol ?? 'NEC',
          Bits: params.bits ?? 32,
          Data: params.code,
        }),
      );
      const res = await fetch(`${url.replace(/\/$/, '')}/cm?cmnd=IRsend%20${payload}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      const res = await fetch(`${url.replace(/\/$/, '')}/ir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      message: { pl: `Wysłano kod IR ${params.code}.`, en: `Sent IR code ${params.code}.` },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: `Mostek IR nie odpowiedział (${(error as Error).message}).`,
        en: `IR bridge did not respond (${(error as Error).message}).`,
      },
    };
  }
}
