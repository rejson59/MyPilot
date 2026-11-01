import fs from 'node:fs';
import path from 'node:path';
import type { PublicConfig } from '../shared/types.js';

export interface StoredConfig extends Omit<PublicConfig, 'homeAssistant' | 'mqtt'> {
  homeAssistant: PublicConfig['homeAssistant'] & { token: string };
  mqtt: PublicConfig['mqtt'] & { password: string };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export const defaultConfig: StoredConfig = {
  mode: 'simulation',
  ownerName: 'Rejson',
  energyPricePerKwh: 1.12,
  currency: 'zł',
  irBridge: { enabled: false, url: 'http://192.168.1.60', format: 'tasmota' },
  bluetooth: {
    enabled: false,
    adapter: 'hci0',
    speakerMac: 'C8:2A:14:9F:31:77',
    speakerName: 'JBL Charge 5',
  },
  homeAssistant: { enabled: false, url: 'http://homeassistant.local:8123', hasToken: false, token: '' },
  mqtt: { enabled: false, url: 'mqtt://192.168.1.10:1883', username: '', hasPassword: false, password: '' },
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadConfig(): StoredConfig {
  ensureDir();
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      irBridge: { ...defaultConfig.irBridge, ...(parsed.irBridge ?? {}) },
      bluetooth: { ...defaultConfig.bluetooth, ...(parsed.bluetooth ?? {}) },
      homeAssistant: { ...defaultConfig.homeAssistant, ...(parsed.homeAssistant ?? {}) },
      mqtt: { ...defaultConfig.mqtt, ...(parsed.mqtt ?? {}) },
    };
  } catch {
    return structuredClone(defaultConfig);
  }
}

export function saveConfig(config: StoredConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/** Usuwa sekrety przed wysłaniem do przeglądarki. */
export function toPublicConfig(config: StoredConfig): PublicConfig {
  return {
    mode: config.mode,
    ownerName: config.ownerName,
    energyPricePerKwh: config.energyPricePerKwh,
    currency: config.currency,
    irBridge: { enabled: config.irBridge.enabled, url: config.irBridge.url, format: config.irBridge.format },
    bluetooth: {
      enabled: config.bluetooth.enabled,
      adapter: config.bluetooth.adapter,
      speakerMac: config.bluetooth.speakerMac,
      speakerName: config.bluetooth.speakerName,
    },
    homeAssistant: {
      enabled: config.homeAssistant.enabled,
      url: config.homeAssistant.url,
      hasToken: Boolean(config.homeAssistant.token),
    },
    mqtt: {
      enabled: config.mqtt.enabled,
      url: config.mqtt.url,
      username: config.mqtt.username,
      hasPassword: Boolean(config.mqtt.password),
    },
  };
}

export const dataDir = DATA_DIR;
export const stateFile = path.join(DATA_DIR, 'state.json');
