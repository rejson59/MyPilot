/** Typy współdzielone między serwerem a interfejsem. */

export type Locale = 'pl' | 'en';

export interface LocalizedText {
  pl: string;
  en: string;
}

export type DeviceKind =
  | 'light'
  | 'led_strip'
  | 'speaker'
  | 'tv'
  | 'ac'
  | 'pc'
  | 'laptop'
  | 'phone'
  | 'tablet'
  | 'plug'
  | 'blind';

export type Transport = 'mock' | 'wifi' | 'ir' | 'bluetooth' | 'agent' | 'ha';

export type ZoneId = 'room' | 'desk' | 'bed';

export type Capability =
  | 'power'
  | 'brightness'
  | 'colorTemp'
  | 'color'
  | 'effect'
  | 'volume'
  | 'playback'
  | 'source'
  | 'input'
  | 'thermostat'
  | 'fan'
  | 'wake'
  | 'irRemote'
  | 'battery'
  | 'apps'
  | 'position'
  | 'metering'
  | 'dnd';

export interface DeviceState {
  [key: string]: unknown;
}

export interface IrButton {
  id: string;
  label: string;
  /** Kod w formacie mostka, np. 0x00FF906F. Puste = przycisk tylko w trybie demo. */
  code?: string;
  protocol?: string;
  bits?: number;
  action?: 'toggle' | 'on' | 'off' | 'bright+' | 'bright-' | 'color' | 'effect' | 'none';
  value?: string | number;
}

export interface Device {
  id: string;
  name: LocalizedText;
  kind: DeviceKind;
  zone: ZoneId;
  transport: Transport;
  online: boolean;
  capabilities: Capability[];
  state: DeviceState;
  /** Chwilowy pobór mocy w watach (symulowany lub z meteringu). */
  powerW: number;
  model: string;
  meta?: {
    effects?: string[];
    mac?: string;
    ip?: string;
    apps?: string[];
    buttons?: IrButton[];
    custom?: boolean;
    [key: string]: unknown;
  };
}

export interface DeviceAction {
  deviceId: string;
  patch: DeviceState;
}

export interface Scene {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  accent: string;
  actions: DeviceAction[];
}

export type Trigger =
  | { type: 'time'; at: string; days?: number[] }
  | { type: 'device'; deviceId: string; key: string; equals: unknown };

export interface Automation {
  id: string;
  name: LocalizedText;
  enabled: boolean;
  trigger: Trigger;
  actions: DeviceAction[];
  lastRun: number | null;
}

export type EventKind = 'command' | 'scene' | 'automation' | 'system' | 'warning';

export interface ActivityEvent {
  id: string;
  ts: number;
  kind: EventKind;
  message: LocalizedText;
  deviceId?: string;
}

export interface EnergyPoint {
  date: string;
  kwh: number;
}

export interface EnergyReport {
  liveW: number;
  todayKwh: number;
  monthKwh: number;
  history: EnergyPoint[];
  liveSeries: number[];
  pricePerKwh: number;
  currency: string;
  breakdown: { deviceId: string; name: LocalizedText; w: number }[];
}

export interface PublicConfig {
  mode: 'simulation' | 'live';
  ownerName: string;
  energyPricePerKwh: number;
  currency: string;
  irBridge: { enabled: boolean; url: string; format: 'tasmota' | 'generic' };
  bluetooth: { enabled: boolean; adapter: string; speakerMac: string; speakerName: string };
  homeAssistant: { enabled: boolean; url: string; hasToken: boolean };
  mqtt: { enabled: boolean; url: string; username: string; hasPassword: boolean };
  agent: { enabled: boolean; url: string; hasToken: boolean };
  phone: { enabled: boolean; adbPath: string; serial: string };
}

export interface Ambient {
  tempC: number;
  humidity: number;
  co2: number;
}

export interface SystemInfo {
  version: string;
  uptimeSec: number;
  wsClients: number;
  mode: 'simulation' | 'live';
  adapters: AdapterInfo[];
}

export interface AdapterInfo {
  id: string;
  label: string;
  transport: Transport;
  configured: boolean;
  devices: number;
  note: LocalizedText;
}

export interface Snapshot {
  devices: Device[];
  scenes: Scene[];
  automations: Automation[];
  events: ActivityEvent[];
  energy: EnergyReport;
  config: PublicConfig;
  ambient: Ambient;
  system: SystemInfo;
  serverTime: number;
}

export interface SceneResult {
  ok: boolean;
  sceneId: string;
  changed: number;
  offline: string[];
}

export interface BluetoothPeer {
  mac: string;
  name: string;
  rssi: number;
  kind: 'speaker' | 'phone' | 'tv' | 'unknown';
  paired: boolean;
}

export interface SetupTestResult {
  target: 'ir' | 'bluetooth' | 'homeassistant' | 'mqtt' | 'agent' | 'adb';
  ok: boolean;
  message: LocalizedText;
  latencyMs?: number;
}

export type ServerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'event'; event: ActivityEvent }
  | { type: 'toast'; message: LocalizedText; tone: 'success' | 'error' | 'info' }
  | { type: 'hello'; clientId: string };
