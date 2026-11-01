import dgram from 'node:dgram';
import type { LocalizedText } from '../shared/types.js';
import type { StoredConfig } from './config.js';

export interface AgentSnapshot {
  hostname: string;
  platform: string;
  arch: string;
  cpu: string;
  cpuCount: number;
  cpuPct: number | null;
  memPct: number;
  tempC: number | null;
  volume: number | null;
  volumeExact: boolean;
  audioBackend: string;
  battery: { percent: number; charging: boolean } | null;
  activeApp: string | null;
  uptimeSec: number;
}

export interface AgentProbe {
  ok: boolean;
  message: LocalizedText;
  latencyMs: number;
  state?: AgentSnapshot;
  hostname?: string;
}

const base = (config: StoredConfig) => config.agent.url.replace(/\/$/, '');

async function call(
  config: StoredConfig,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  timeoutMs = 3000,
): Promise<Response> {
  return fetch(`${base(config)}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-mypilot-token': config.agent.token,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function probeAgent(config: StoredConfig): Promise<AgentProbe> {
  const started = Date.now();
  if (!config.agent.url) {
    return { ok: false, latencyMs: 0, message: { pl: 'Podaj adres agenta.', en: 'Enter the agent address.' } };
  }
  if (!config.agent.token) {
    return {
      ok: false,
      latencyMs: 0,
      message: { pl: 'Wklej token z konsoli agenta.', en: 'Paste the token from the agent console.' },
    };
  }
  try {
    const response = await call(config, '/state');
    if (response.status === 401) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: { pl: 'Agent odrzucił token — sprawdź, czy jest aktualny.', en: 'The agent rejected the token — check it.' },
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: {
          pl: `Agent odpowiedział HTTP ${response.status}.`,
          en: `Agent answered HTTP ${response.status}.`,
        },
      };
    }
    const payload = (await response.json()) as { state: AgentSnapshot };
    return {
      ok: true,
      latencyMs: Date.now() - started,
      state: payload.state,
      hostname: payload.state?.hostname,
      message: {
        pl: `Agent działa na „${payload.state?.hostname ?? 'komputerze'}” (${payload.state?.platform ?? ''}).`,
        en: `Agent is running on “${payload.state?.hostname ?? 'computer'}” (${payload.state?.platform ?? ''}).`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: {
        pl: `Brak połączenia z agentem: ${(error as Error).message}. Uruchom „npm run agent” na komputerze.`,
        en: `Cannot reach the agent: ${(error as Error).message}. Run “npm run agent” on the computer.`,
      },
    };
  }
}

export async function readAgentState(config: StoredConfig): Promise<AgentSnapshot | null> {
  try {
    const response = await call(config, '/state', {}, 2500);
    if (!response.ok) return null;
    const payload = (await response.json()) as { state?: AgentSnapshot };
    return payload.state ?? null;
  } catch {
    return null;
  }
}

export async function agentCommand(
  config: StoredConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; message: LocalizedText }> {
  try {
    const response = await call(config, path, { method: 'POST', body }, 4000);
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: { ok?: boolean; error?: string; note?: string };
      error?: string;
    };
    const inner = payload.result;
    const ok = response.ok && (inner?.ok ?? payload.ok) !== false && !payload.error;
    if (!ok) {
      const detail = payload.error ?? inner?.error ?? `HTTP ${response.status}`;
      return { ok: false, message: { pl: `Agent: ${detail}`, en: `Agent: ${detail}` } };
    }
    return {
      ok: true,
      message: {
        pl: inner?.note === 'dry-run' ? 'Agent: dry-run (bez realnej akcji).' : 'Agent wykonał polecenie.',
        en: inner?.note === 'dry-run' ? 'Agent: dry-run (no real action).' : 'Agent executed the command.',
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: {
        pl: `Agent nie odpowiedział: ${(error as Error).message}`,
        en: `Agent did not respond: ${(error as Error).message}`,
      },
    };
  }
}

/** Wake-on-LAN — magic packet UDP na broadcast. */
export function wakeOnLan(mac: string, broadcast = '255.255.255.255'): Promise<{ ok: boolean; message: LocalizedText }> {
  return new Promise((resolve) => {
    const clean = mac.replace(/[^0-9a-f]/gi, '');
    if (clean.length !== 12) {
      resolve({
        ok: false,
        message: { pl: 'Nieprawidłowy adres MAC urządzenia.', en: 'Invalid device MAC address.' },
      });
      return;
    }
    const macBytes = Buffer.from(clean, 'hex');
    const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => macBytes)]);
    const socket = dgram.createSocket('udp4');
    socket.once('error', (error) => {
      socket.close();
      resolve({ ok: false, message: { pl: `WoL: ${error.message}`, en: `WoL: ${error.message}` } });
    });
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
        socket.send(packet, 0, packet.length, 9, broadcast, (error) => {
          socket.close();
          if (error) {
            resolve({ ok: false, message: { pl: `WoL: ${error.message}`, en: `WoL: ${error.message}` } });
          } else {
            resolve({
              ok: true,
              message: {
                pl: `Wysłano magic packet do ${mac}. Komputer musi mieć włączone Wake-on-LAN w BIOSie i karcie sieciowej.`,
                en: `Magic packet sent to ${mac}. The PC must have Wake-on-LAN enabled in BIOS and the NIC.`,
              },
            });
          }
        });
      } catch (error) {
        socket.close();
        resolve({
          ok: false,
          message: { pl: `WoL: ${(error as Error).message}`, en: `WoL: ${(error as Error).message}` },
        });
      }
    });
  });
}
