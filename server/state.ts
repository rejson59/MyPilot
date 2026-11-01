import fs from 'node:fs';
import type {
  ActivityEvent,
  AdapterInfo,
  Ambient,
  Automation,
  BluetoothPeer,
  Device,
  DeviceKind,
  DeviceState,
  EnergyReport,
  EventKind,
  IrButton,
  LocalizedText,
  Scene,
  SceneResult,
  ServerMessage,
  Snapshot,
  Transport,
  ZoneId,
} from '../shared/types.js';
import { customDevicesFile, loadConfig, saveConfig, stateFile, toPublicConfig, type StoredConfig } from './config.js';
import { seedAutomations, seedDevices, seedScenes } from './seed.js';
import { btConnect, btDisconnect, sendIr, sendIrRaw, setSystemVolume } from './adapters.js';

const VERSION = '0.1.0';
const ENERGY_SEED = [1.24, 1.02, 1.61, 0.88, 1.35, 1.78, 1.11];

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 0) => Number(n.toFixed(digits));
const id = () => Math.random().toString(36).slice(2, 10);

export function computePower(d: Device): number {
  const s = d.state as Record<string, number | boolean | string>;
  switch (d.kind) {
    case 'light':
      return s.on ? round(3 + Number(s.brightness ?? 0) * 0.13, 1) : 0.4;
    case 'led_strip':
      return s.on ? round(2 + Number(s.brightness ?? 0) * 0.26, 1) : 0.5;
    case 'speaker':
      return s.on ? round(2 + (s.playing ? 4 : 0) + Number(s.volume ?? 0) * 0.32, 1) : 0.3;
    case 'tv':
      return s.on ? 92 : 0.5;
    case 'ac':
      return s.on ? round(820 + Number(s.fan ?? 0) * 45 + Math.abs(Number(s.target ?? 22) - 22) * 30, 0) : 1;
    case 'pc':
      return s.on ? round(55 + Number(s.cpu ?? 20) * 1.1, 0) : 2;
    case 'laptop':
      return s.on ? round(28 + Number(s.cpu ?? 20) * 0.7, 0) : 1.4;
    case 'phone':
      return s.charging ? 12 : 1.5;
    case 'tablet':
      return s.on ? 7 : 1;
    case 'plug':
      return s.on ? Number(s.loadW ?? 40) : 0.4;
    case 'blind':
      return 0.1;
    default:
      return 0;
  }
}

function clampPatch(device: Device, patch: DeviceState): DeviceState {
  const out: DeviceState = {};
  for (const [key, raw] of Object.entries(patch)) {
    switch (key) {
      case 'on':
      case 'playing':
      case 'muted':
      case 'charging':
      case 'dnd':
      case 'screenOn':
      case 'swing':
        if (typeof raw === 'boolean') out[key] = raw;
        break;
      case 'brightness':
      case 'volume':
      case 'mediaVolume':
      case 'position':
        if (typeof raw === 'number') out[key] = Math.round(clamp(raw, 0, 100));
        break;
      case 'tempK':
        if (typeof raw === 'number') out[key] = Math.round(clamp(raw, 2200, 6500));
        break;
      case 'target':
        if (typeof raw === 'number') out[key] = Math.round(clamp(raw, 16, 30));
        break;
      case 'fan':
        if (typeof raw === 'number') out[key] = Math.round(clamp(raw, 0, 3));
        break;
      case 'cpu':
        if (typeof raw === 'number') out[key] = Math.round(clamp(raw, 1, 100));
        break;
      case 'color':
        if (typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)) out.color = raw;
        break;
      case 'effect':
      case 'input':
      case 'source':
      case 'mode':
      case 'activeApp':
        if (typeof raw === 'string') out[key] = raw;
        break;
      case 'track':
        // ścieżka dźwiękowa jest zarządzana przez serwer
        break;
      default:
        break;
    }
  }
  void device;
  return out;
}

const nextTrack = (track: any) => {
  const playlist = [
    { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', duration: 243, artwork: '#5b6cff' },
    { title: 'Nightcall', artist: 'Kavinsky', album: 'OutRun', duration: 258, artwork: '#f472b6' },
    { title: 'Resonance', artist: 'HOME', album: 'Odyssey', duration: 213, artwork: '#22d3ee' },
    { title: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Presence', duration: 238, artwork: '#fbbf24' },
    { title: 'Innerbloom', artist: 'RÜFÜS DU SOL', album: 'Bloom', duration: 278, artwork: '#a78bfa' },
  ];
  const index = playlist.findIndex((t) => t.title === track?.title);
  return { ...playlist[(index + 1 + playlist.length) % playlist.length], position: 0 };
};


const KIND_CAPABILITIES: Record<DeviceKind, Device['capabilities']> = {
  light: ['power', 'brightness', 'colorTemp'],
  led_strip: ['power', 'brightness', 'color', 'effect'],
  speaker: ['power', 'volume', 'playback', 'source'],
  tv: ['power', 'volume', 'input', 'irRemote'],
  ac: ['power', 'thermostat', 'fan', 'irRemote'],
  pc: ['power', 'wake', 'volume', 'apps'],
  laptop: ['power', 'wake', 'volume', 'apps'],
  phone: ['battery', 'dnd', 'volume', 'apps'],
  tablet: ['battery', 'dnd', 'apps'],
  plug: ['power', 'metering'],
  blind: ['position'],
};

const KIND_DEFAULT_STATE: Record<DeviceKind, DeviceState> = {
  light: { on: false, brightness: 70, tempK: 3000 },
  led_strip: { on: false, brightness: 60, color: '#ff2d55', effect: 'Statyczny' },
  speaker: {
    on: false,
    playing: false,
    volume: 40,
    source: 'bluetooth',
    track: { title: '—', artist: '—', album: '—', duration: 240, position: 0, artwork: '#5b6cff' },
  },
  tv: { on: false, volume: 20, muted: false, input: 'HDMI 1' },
  ac: { on: false, mode: 'cool', target: 22, fan: 1, swing: false },
  pc: { on: false, volume: 40, muted: false, activeApp: '—', cpu: 10, tempC: 42 },
  laptop: { on: false, volume: 40, muted: false, activeApp: '—', cpu: 10, tempC: 42 },
  phone: { on: true, battery: 100, charging: false, dnd: false, mediaVolume: 50, screenOn: false },
  tablet: { on: true, battery: 100, charging: false, dnd: false, screenOn: false },
  plug: { on: false, loadW: 0, energyKwh: 0 },
  blind: { position: 100 },
};

const ZONES: ZoneId[] = ['room', 'desk', 'bed'];
const TRANSPORTS: Transport[] = ['wifi', 'ir', 'bluetooth', 'agent', 'ha', 'mock'];

function loadCustomDevices(): Device[] {
  try {
    const raw = JSON.parse(fs.readFileSync(customDevicesFile, 'utf8')) as Device[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((device) => device?.id?.startsWith('custom-'));
  } catch {
    return [];
  }
}

export class Room {
  devices: Device[];
  customDevices: Device[] = [];
  scenes: Scene[];
  automations: Automation[];
  events: ActivityEvent[] = [];
  config: StoredConfig;
  ambient: Ambient = { tempC: 22.4, humidity: 41, co2: 640 };
  todayKwh: number;
  monthKwh: number;
  history: { date: string; kwh: number }[] = [];
  liveSeries: number[] = [];
  startedAt = Date.now();
  wsClients = 0;

  private listeners = new Set<(message: ServerMessage) => void>();
  private tickTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private lastMinuteKey = '';
  private sampleClock = 0;
  private automationGuard = 0;
  private suppressTriggers = 0;

  constructor() {
    this.config = loadConfig();
    this.devices = seedDevices();
    this.customDevices = loadCustomDevices();
    this.devices.push(...this.customDevices);
    this.scenes = seedScenes();
    this.automations = seedAutomations();
    this.todayKwh = 0.62;
    this.monthKwh = 38.4;

    for (let i = 0; i < ENERGY_SEED.length; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (ENERGY_SEED.length - i));
      this.history.push({ date: d.toISOString().slice(0, 10), kwh: ENERGY_SEED[i] });
    }
    this.history.push({ date: new Date().toISOString().slice(0, 10), kwh: this.todayKwh });

    this.restore();
    this.recomputePower();
    for (let i = 0; i < 60; i++) this.liveSeries.push(180 + Math.sin(i / 4) * 24 + Math.random() * 18);

    this.addEvent('system', {
      pl: 'MyPilot wystartował w trybie symulacji. Witaj w pokoju.',
      en: 'MyPilot started in simulation mode. Welcome to your room.',
    });
  }

  /* ------------------------------- lifecycle ------------------------------ */

  start() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), 1000);
    this.saveTimer = setInterval(() => this.persist(), 10_000);
  }

  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.tickTimer = null;
    this.saveTimer = null;
    this.persist();
  }

  subscribe(fn: (message: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private broadcast(message: ServerMessage) {
    for (const fn of this.listeners) {
      try {
        fn(message);
      } catch {
        /* pojedynczy klient nie może psuć reszty */
      }
    }
  }

  broadcastSnapshot() {
    this.broadcast({ type: 'snapshot', snapshot: this.snapshot() });
  }

  /* --------------------------------- events ------------------------------- */

  addEvent(kind: EventKind, message: LocalizedText, deviceId?: string): ActivityEvent {
    const event: ActivityEvent = { id: id(), ts: Date.now(), kind, message, deviceId };
    this.events.unshift(event);
    this.events = this.events.slice(0, 60);
    this.broadcast({ type: 'event', event });
    return event;
  }

  /* --------------------------------- power -------------------------------- */

  private recomputePower() {
    for (const device of this.devices) device.powerW = computePower(device);
  }

  private liveWatts() {
    return this.devices.reduce((sum, d) => sum + (d.online ? d.powerW : 0), 0);
  }

  getEnergy(): EnergyReport {
    const liveW = this.liveWatts();
    const breakdown = this.devices
      .map((d) => ({ deviceId: d.id, name: d.name, w: d.online ? d.powerW : 0 }))
      .sort((a, b) => b.w - a.w);
    const history = [...this.history];
    history[history.length - 1] = { date: new Date().toISOString().slice(0, 10), kwh: round(this.todayKwh, 3) };
    return {
      liveW: round(liveW),
      todayKwh: round(this.todayKwh, 3),
      monthKwh: round(this.monthKwh, 2),
      history,
      liveSeries: this.liveSeries.map((v) => round(v)),
      pricePerKwh: this.config.energyPricePerKwh,
      currency: this.config.currency,
      breakdown,
    };
  }

  /* -------------------------------- devices ------------------------------- */

  device(deviceId: string) {
    return this.devices.find((d) => d.id === deviceId);
  }

  applyPatch(deviceId: string, patch: DeviceState): { device?: Device; changed: string[] } {
    const device = this.device(deviceId);
    if (!device) return { changed: [] };
    const clean = clampPatch(device, patch);
    const changed: string[] = [];
    for (const [key, value] of Object.entries(clean)) {
      if (device.state[key] !== value) {
        device.state[key] = value;
        changed.push(key);
      }
    }
    if (!changed.length) return { device, changed };

    if (changed.includes('on') && device.kind === 'tv' && device.state.on) {
      device.state.input = device.state.input ?? 'HDMI 2';
    }
    if (changed.includes('on') && device.kind === 'speaker' && !device.state.on) {
      device.state.playing = false;
    }
    if (changed.includes('on') && device.kind === 'speaker' && device.state.on) {
      device.state.playing = true;
    }

    device.powerW = computePower(device);
    this.persistSoon();
    if (this.suppressTriggers === 0) this.fireDeviceTriggers(device, changed);
    return { device, changed };
  }

  private fireDeviceTriggers(device: Device, changed: string[]) {
    if (this.automationGuard > 2) return;
    for (const automation of this.automations) {
      if (!automation.enabled || automation.trigger.type !== 'device') continue;
      if (automation.trigger.deviceId !== device.id) continue;
      if (!changed.includes(automation.trigger.key)) continue;
      if (device.state[automation.trigger.key] !== automation.trigger.equals) continue;
      this.automationGuard++;
      try {
        this.runAutomation(automation.id, 'device');
      } finally {
        this.automationGuard--;
      }
    }
  }

  applyMany(actions: { deviceId: string; patch: DeviceState }[]): { changed: number; offline: string[] } {
    let changed = 0;
    const offline: string[] = [];
    for (const action of actions) {
      const device = this.device(action.deviceId);
      if (!device) continue;
      if (!device.online) {
        offline.push(device.id);
        continue;
      }
      changed += this.applyPatch(action.deviceId, action.patch).changed.length;
    }
    return { changed, offline };
  }

  /* --------------------------------- scenes ------------------------------- */

  applyScene(sceneId: string): SceneResult {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) return { ok: false, sceneId, changed: 0, offline: [] };
    this.suppressTriggers++;
    const { changed, offline } = this.applyMany(scene.actions);
    this.suppressTriggers--;
    this.addEvent('scene', {
      pl: `Scena „${scene.name.pl}” ustawiona (${changed} zmian).`,
      en: `Scene “${scene.name.en}” applied (${changed} changes).`,
    });
    this.persistSoon();
    this.broadcastSnapshot();
    return { ok: true, sceneId, changed, offline };
  }

  /* ------------------------------ automations ----------------------------- */

  runAutomation(automationId: string, source: 'manual' | 'time' | 'device' = 'manual') {
    const automation = this.automations.find((a) => a.id === automationId);
    if (!automation) return { ok: false };
    this.suppressTriggers++;
    let changed = 0;
    try {
      changed = this.applyMany(automation.actions).changed;
    } finally {
      this.suppressTriggers--;
    }
    automation.lastRun = Date.now();
    this.addEvent('automation', {
      pl: `Automatyzacja „${automation.name.pl}” wykonana (${changed} zmian, ${source}).`,
      en: `Automation “${automation.name.en}” ran (${changed} changes, ${source}).`,
    });
    this.persistSoon();
    this.broadcastSnapshot();
    return { ok: true, changed };
  }

  toggleAutomation(automationId: string, enabled: boolean) {
    const automation = this.automations.find((a) => a.id === automationId);
    if (!automation) return { ok: false };
    automation.enabled = enabled;
    this.addEvent('automation', {
      pl: `Automatyzacja „${automation.name.pl}” ${enabled ? 'włączona' : 'wyłączona'}.`,
      en: `Automation “${automation.name.en}” ${enabled ? 'enabled' : 'disabled'}.`,
    });
    this.persistSoon();
    this.broadcastSnapshot();
    return { ok: true };
  }

  /* ------------------------------- commands ------------------------------- */

  async command(deviceId: string, command: string, payload: Record<string, unknown> = {}) {
    const device = this.device(deviceId);
    if (!device) return { ok: false, message: { pl: 'Nie ma takiego urządzenia.', en: 'Device not found.' } };
    const live = this.config.mode === 'live';
    const note = (ok: boolean, message: LocalizedText) => {
      this.addEvent(ok ? 'command' : 'warning', message, device.id);
      this.broadcastSnapshot();
      return { ok, message };
    };

    switch (command) {
      case 'toggle': {
        if (device.kind === 'blind') {
          this.applyPatch(deviceId, { position: Number(device.state.position) > 0 ? 0 : 100 });
        } else if (device.kind === 'phone' || device.kind === 'tablet') {
          this.applyPatch(deviceId, { screenOn: !device.state.screenOn });
        } else {
          this.applyPatch(deviceId, { on: !device.state.on });
        }
        return note(true, {
          pl: `${device.name.pl}: ${device.state.on === false ? 'wyłączone' : 'włączone'}.`,
          en: `${device.name.en}: ${device.state.on === false ? 'off' : 'on'}.`,
        });
      }

      case 'volume': {
        const value = clamp(Number(payload.value ?? 0), 0, 100);
        this.applyPatch(deviceId, { volume: value });
        if (live && device.kind === 'speaker') await setSystemVolume(value);
        return note(true, { pl: `Głośność ${value}%.`, en: `Volume ${value}%.` });
      }

      case 'play':
      case 'pause': {
        const playing = command === 'play';
        this.applyPatch(deviceId, { on: true, playing });
        return note(true, {
          pl: playing ? `Odtwarzanie: ${device.name.pl}.` : `Pauza: ${device.name.pl}.`,
          en: playing ? `Playing: ${device.name.en}.` : `Paused: ${device.name.en}.`,
        });
      }

      case 'next':
      case 'prev': {
        const track = device.state.track as any;
        const updated = command === 'next' ? nextTrack(track) : { ...track, position: 0 };
        this.applyPatch(deviceId, { playing: true });
        device.state.track = updated;
        return note(true, { pl: `Trwa: ${updated.artist} — ${updated.title}`, en: `Now playing: ${updated.artist} — ${updated.title}` });
      }


      case 'ir-button': {
        const buttons = (device.meta?.buttons as IrButton[] | undefined) ?? [];
        const button = buttons.find((item) => item.id === String(payload.buttonId));
        if (!button) return note(false, { pl: 'Nie znaleziono przycisku.', en: 'Button not found.' });
        const state = device.state as Record<string, any>;
        switch (button.action) {
          case 'toggle':
            this.applyPatch(deviceId, { on: !state.on });
            break;
          case 'on':
            this.applyPatch(deviceId, { on: true });
            break;
          case 'off':
            this.applyPatch(deviceId, { on: false });
            break;
          case 'bright+':
            this.applyPatch(deviceId, { on: true, brightness: clamp(Number(state.brightness ?? 0) + 10, 0, 100) });
            break;
          case 'bright-':
            this.applyPatch(deviceId, { on: true, brightness: clamp(Number(state.brightness ?? 0) - 10, 0, 100) });
            break;
          case 'color':
            this.applyPatch(deviceId, { on: true, color: String(button.value ?? '#ffffff') });
            break;
          case 'effect':
            this.applyPatch(deviceId, { on: true, effect: String(button.value ?? 'Statyczny') });
            break;
          default:
            break;
        }

        if (!live) {
          return note(true, { pl: `Pilot: ${button.label} (demo)`, en: `Remote: ${button.label} (demo)` });
        }
        if (!button.code) {
          return note(false, {
            pl: `Brak kodu IR dla „${button.label}”. Przechwyć go pilotem i dopisz w panelu urządzenia.`,
            en: `No IR code for “${button.label}”. Capture it and add it in the device panel.`,
          });
        }
        const irResult = await sendIrRaw(this.config, {
          code: button.code,
          protocol: button.protocol,
          bits: button.bits,
        });
        return note(irResult.ok, irResult.message);
      }

      case 'bt-connect': {
        const result = live ? await btConnect(this.config) : { ok: true, message: { pl: 'Symulacja: sparowano z głośnikiem.', en: 'Simulated: speaker paired.' } };
        this.applyPatch(deviceId, { on: true, source: 'bluetooth', playing: true });
        return note(result.ok, result.message);
      }

      case 'bt-disconnect': {
        if (live) await btDisconnect(this.config);
        this.applyPatch(deviceId, { playing: false, source: 'aux' });
        return note(true, { pl: 'Rozłączono głośnik Bluetooth.', en: 'Bluetooth speaker disconnected.' });
      }

      case 'ir-key': {
        const key = String(payload.key ?? '');
        if (device.kind === 'tv') {
          if (key === 'power') this.applyPatch(deviceId, { on: !device.state.on });
          if (key === 'vol+') this.applyPatch(deviceId, { volume: clamp(Number(device.state.volume) + 2, 0, 100) });
          if (key === 'vol-') this.applyPatch(deviceId, { volume: clamp(Number(device.state.volume) - 2, 0, 100) });
          if (key === 'mute') this.applyPatch(deviceId, { muted: !device.state.muted });
        }
        const result = live ? await sendIr(this.config, device.kind === 'ac' ? 'ac' : 'tv', key, payload) : null;
        if (result) return note(result.ok, result.message);
        return note(true, {
          pl: `Wysłano pilotem: ${key.toUpperCase()}`,
          en: `Remote sent: ${key.toUpperCase()}`,
        });
      }

      case 'wake': {
        this.applyPatch(deviceId, { on: true, cpu: 12 });
        device.state.activeApp = 'Uruchamianie…';
        this.addEvent('command', {
          pl: `Wysłano magic packet (Wake-on-LAN) do ${device.name.pl}.`,
          en: `Wake-on-LAN magic packet sent to ${device.name.en}.`,
        });
        return note(true, { pl: 'Budzę komputer…', en: 'Waking the computer…' });
      }

      case 'sleep': {
        this.applyPatch(deviceId, { on: false });
        return note(true, { pl: 'Komputer przechodzi w stan uśpienia.', en: 'Computer is going to sleep.' });
      }

      case 'launch-app': {
        const app = String(payload.app ?? '');
        this.applyPatch(deviceId, { on: true, activeApp: app });
        return note(true, { pl: `Uruchomiono ${app}.`, en: `Launched ${app}.` });
      }

      case 'ring': {
        return note(true, { pl: `Dzwonię na ${device.name.pl} (symulacja).`, en: `Ringing ${device.name.en} (simulated).` });
      }

      case 'find': {
        this.applyPatch(deviceId, { screenOn: true });
        return note(true, { pl: 'Tablet podświetlony.', en: 'Tablet screen lit.' });
      }

      case 'bt-scan': {
        return note(true, { pl: 'Skanowanie Bluetooth…', en: 'Scanning Bluetooth…' });
      }

      default:
        return note(false, { pl: `Nieznane polecenie: ${command}`, en: `Unknown command: ${command}` });
    }
  }

  scanBluetooth(): BluetoothPeer[] {
    const configured = this.config.bluetooth.speakerMac;
    const peers: BluetoothPeer[] = [
      { mac: configured || 'C8:2A:14:9F:31:77', name: this.config.bluetooth.speakerName || 'JBL Charge 5', rssi: -46, kind: 'speaker', paired: true },
      { mac: 'F4:4E:FD:2A:19:C1', name: 'Sony WH-1000XM4', rssi: -58, kind: 'speaker', paired: false },
      { mac: '9C:2E:A1:44:0B:77', name: 'Galaxy S23', rssi: -63, kind: 'phone', paired: false },
      { mac: '00:1A:7D:DA:71:13', name: 'Mi Box (TV)', rssi: -71, kind: 'tv', paired: false },
      { mac: '34:15:9E:11:88:A2', name: 'Nieznane urządzenie', rssi: -82, kind: 'unknown', paired: false },
    ];
    return this.config.mode === 'live' ? peers : peers;
  }


  /* ---------------------------- własne urządzenia -------------------------- */

  private persistCustom() {
    try {
      fs.writeFileSync(customDevicesFile, JSON.stringify(this.customDevices, null, 2));
    } catch {
      /* brak zapisu nie blokuje aplikacji */
    }
  }

  createDevice(input: {
    name?: string | LocalizedText;
    kind?: DeviceKind;
    zone?: ZoneId;
    transport?: Transport;
    model?: string;
    state?: DeviceState;
    meta?: Record<string, unknown>;
  }): Device {
    const kind = (input.kind ?? 'light') as DeviceKind;
    if (!KIND_CAPABILITIES[kind]) throw new Error(`Nieznany typ urządzenia: ${kind}`);
    const room = new Date().toISOString();
    const rawName = input.name ?? (input.kind ? KIND_CAPABILITIES[kind] && 'Nowe urządzenie' : 'Nowe urządzenie');
    const name: LocalizedText =
      typeof rawName === 'string'
        ? { pl: rawName.trim().slice(0, 48) || 'Nowe urządzenie', en: rawName.trim().slice(0, 48) || 'New device' }
        : rawName;

    const device: Device = {
      id: `custom-${Math.random().toString(36).slice(2, 8)}`,
      name,
      kind,
      zone: ZONES.includes(input.zone ?? 'room') ? (input.zone ?? 'room') : 'room',
      transport: TRANSPORTS.includes(input.transport ?? 'wifi') ? (input.transport ?? 'wifi') : 'wifi',
      online: true,
      capabilities: KIND_CAPABILITIES[kind],
      state: { ...structuredClone(KIND_DEFAULT_STATE[kind]), ...(input.state ?? {}) },
      powerW: 0,
      model: (input.model ?? 'Własne urządzenie').slice(0, 64),
      meta: { custom: true, addedAt: room, ...(input.meta ?? {}) },
    };
    device.powerW = computePower(device);

    this.devices.push(device);
    this.customDevices.push(device);
    this.persistCustom();
    this.addEvent('system', {
      pl: `Dodano urządzenie „${device.name.pl}”.`,
      en: `Device “${device.name.en}” added.`,
    }, device.id);
    this.broadcastSnapshot();
    return device;
  }

  updateDeviceInfo(
    deviceId: string,
    patch: { name?: string | LocalizedText; zone?: ZoneId; model?: string; meta?: Record<string, unknown> },
  ) {
    const device = this.device(deviceId);
    if (!device || !device.id.startsWith('custom-')) return { ok: false };
    if (patch.name) {
      const name =
        typeof patch.name === 'string'
          ? { pl: patch.name.slice(0, 48), en: patch.name.slice(0, 48) }
          : patch.name;
      device.name = name;
    }
    if (patch.zone && ZONES.includes(patch.zone)) device.zone = patch.zone;
    if (typeof patch.model === 'string') device.model = patch.model.slice(0, 64);
    if (patch.meta) device.meta = { ...device.meta, ...patch.meta };
    this.persistCustom();
    this.persistSoon();
    this.broadcastSnapshot();
    return { ok: true };
  }

  deleteDevice(deviceId: string) {
    const device = this.device(deviceId);
    if (!device || !device.id.startsWith('custom-')) return { ok: false };
    this.devices = this.devices.filter((item) => item.id !== deviceId);
    this.customDevices = this.customDevices.filter((item) => item.id !== deviceId);
    this.scenes = this.scenes.map((scene) => ({
      ...scene,
      actions: scene.actions.filter((action) => action.deviceId !== deviceId),
    }));
    this.persistCustom();
    this.addEvent('system', {
      pl: `Usunięto urządzenie „${device.name.pl}”.`,
      en: `Device “${device.name.en}” removed.`,
    });
    this.broadcastSnapshot();
    return { ok: true };
  }

  /* -------------------------------- config -------------------------------- */

  updateConfig(patch: Partial<StoredConfig>) {
    this.config = {
      ...this.config,
      ...patch,
      irBridge: { ...this.config.irBridge, ...(patch.irBridge ?? {}) },
      bluetooth: { ...this.config.bluetooth, ...(patch.bluetooth ?? {}) },
      homeAssistant: { ...this.config.homeAssistant, ...(patch.homeAssistant ?? {}) },
      mqtt: { ...this.config.mqtt, ...(patch.mqtt ?? {}) },
    };
    this.config.homeAssistant.hasToken = Boolean(this.config.homeAssistant.token);
    this.config.mqtt.hasPassword = Boolean(this.config.mqtt.password);
    saveConfig(this.config);
    this.addEvent('system', {
      pl: `Konfiguracja zapisana. Tryb: ${this.config.mode === 'live' ? 'prawdziwe urządzenia' : 'symulacja'}.`,
      en: `Configuration saved. Mode: ${this.config.mode === 'live' ? 'live devices' : 'simulation'}.`,
    });
    this.broadcastSnapshot();
    return toPublicConfig(this.config);
  }

  reset() {
    this.customDevices = this.devices.filter((device) => device.id.startsWith('custom-'));
    this.devices = [...seedDevices(), ...this.customDevices];
    this.scenes = seedScenes();
    this.automations = seedAutomations();
    this.todayKwh = 0.62;
    this.monthKwh = 38.4;
    this.recomputePower();
    this.persist();
    this.addEvent('system', {
      pl: 'Przywrócono domyślny pokój demonstracyjny.',
      en: 'The default demo room has been restored.',
    });
    this.broadcastSnapshot();
  }

  /* ------------------------------ persistence ----------------------------- */

  private persistSoon() {
    if (this.saveTimer) return; // i tak zapiszemy w ticku
    setTimeout(() => this.persist(), 1500);
  }

  persist() {
    try {
      const payload = {
        savedAt: Date.now(),
        todayKwh: this.todayKwh,
        monthKwh: this.monthKwh,
        devices: this.devices.map((d) => ({ id: d.id, state: d.state })),
        automations: this.automations.map((a) => ({ id: a.id, enabled: a.enabled, lastRun: a.lastRun })),
      };
      fs.writeFileSync(stateFile, JSON.stringify(payload, null, 2));
    } catch {
      /* brak zapisu nie może zatrzymać aplikacji */
    }
  }

  private restore() {
    try {
      if (!fs.existsSync(stateFile)) return;
      const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (typeof raw.todayKwh === 'number') this.todayKwh = raw.todayKwh;
      if (typeof raw.monthKwh === 'number') this.monthKwh = raw.monthKwh;
      if (Array.isArray(raw.devices)) {
        for (const saved of raw.devices) {
          const device = this.device(saved.id);
          if (!device) continue;
          Object.assign(device.state, saved.state ?? {});
        }
      }
      if (Array.isArray(raw.automations)) {
        for (const saved of raw.automations) {
          const automation = this.automations.find((a) => a.id === saved.id);
          if (!automation) continue;
          automation.enabled = Boolean(saved.enabled);
          automation.lastRun = saved.lastRun ?? null;
        }
      }
    } catch {
      /* uszkodzony plik = start od zera */
    }
  }

  /* ---------------------------------- tick -------------------------------- */

  private tick() {
    const s = this.devices.find((d) => d.id === 'speaker')?.state as any;
    if (s?.playing && s.track) {
      s.track.position = Number(s.track.position) + 1;
      if (s.track.position >= Number(s.track.duration)) {
        const updated = nextTrack(s.track);
        this.device('speaker')!.state.track = updated;
        this.addEvent('command', {
          pl: `Trwa: ${updated.artist} — ${updated.title}`,
          en: `Now playing: ${updated.artist} — ${updated.title}`,
        }, 'speaker');
      }
    }

    const pc = this.devices.find((d) => d.id === 'pc')?.state as any;
    if (pc?.on) {
      pc.cpu = Math.round(clamp(Number(pc.cpu) + (Math.random() - 0.5) * 12, 4, 92));
      pc.tempC = Math.round(clamp(45 + Number(pc.cpu) * 0.3 + (Math.random() - 0.5) * 3, 36, 88));
    }

    const phone = this.devices.find((d) => d.id === 'phone')?.state as any;
    if (phone) {
      const delta = phone.charging ? 0.012 : -0.006;
      phone.battery = round(clamp(Number(phone.battery) + delta, 1, 100), 1);
    }

    const ac = this.devices.find((d) => d.id === 'ac')?.state as any;
    if (ac?.on) {
      const target = Number(ac.target ?? 23);
      this.ambient.tempC += (target - this.ambient.tempC) * 0.004;
    } else {
      this.ambient.tempC += (22.6 - this.ambient.tempC) * 0.0008;
    }
    this.ambient.humidity = round(clamp(this.ambient.humidity + (Math.random() - 0.5) * 0.15, 32, 58), 1);
    this.ambient.co2 = Math.round(clamp(this.ambient.co2 + (Math.random() - 0.5) * 9, 420, 1100));

    this.recomputePower();

    // energia: próbki co 2 s, zużycie co sekundę
    const watts = this.liveWatts();
    this.todayKwh += watts / 1000 / 3600;
    this.monthKwh += watts / 1000 / 3600;
    this.sampleClock++;
    if (this.sampleClock % 2 === 0) {
      this.liveSeries.push(watts);
      if (this.liveSeries.length > 60) this.liveSeries.shift();
    }

    // automatyzacje czasowe — raz na minutę
    const now = new Date();
    const minuteKey = `${now.getHours()}:${now.getMinutes()}`;
    if (minuteKey !== this.lastMinuteKey) {
      this.lastMinuteKey = minuteKey;
      for (const automation of this.automations) {
        if (!automation.enabled || automation.trigger.type !== 'time') continue;
        if (automation.trigger.at !== minuteKey) continue;
        const days = automation.trigger.days;
        if (days && days.length && !days.includes(now.getDay())) continue;
        this.runAutomation(automation.id, 'time');
      }
    }

    // autonomia: zasilanie gniazdka wpływa na pobór
    const plug = this.devices.find((d) => d.id === 'plug')?.state as any;
    if (plug?.on) plug.loadW = Math.round(clamp(Number(plug.loadW) + (Math.random() - 0.5) * 6, 18, 90));

    this.broadcastSnapshot();
  }

  /* -------------------------------- snapshot ------------------------------ */

  adapters(): AdapterInfo[] {
    const live = this.config.mode === 'live';
    const signal: LocalizedText = live
      ? { pl: 'Tryb live: polecenia idą do prawdziwego sprzętu.', en: 'Live mode: commands go to real hardware.' }
      : { pl: 'Symulacja: pełna funkcjonalność, zero sprzętu.', en: 'Simulation: full functionality, no hardware.' };
    return [
      {
        id: 'mock',
        label: 'Symulator pokoju',
        transport: 'mock',
        configured: true,
        devices: this.devices.length,
        note: signal,
      },
      {
        id: 'ir',
        label: 'Mostek IR (ESP32 / Tasmota)',
        transport: 'ir',
        configured: Boolean(this.config.irBridge.enabled && this.config.irBridge.url),
        devices: 2,
        note: {
          pl: 'Wysyła kody podczerwieni do TV i klimatyzacji przez HTTP.',
          en: 'Sends infrared codes to the TV and AC over HTTP.',
        },
      },
      {
        id: 'bluetooth',
        label: 'Głośnik Bluetooth',
        transport: 'bluetooth',
        configured: Boolean(this.config.bluetooth.enabled && this.config.bluetooth.speakerMac),
        devices: 1,
        note: {
          pl: 'Parowanie i głośność przez bluetoothctl / PulseAudio.',
          en: 'Pairing and volume via bluetoothctl / PulseAudio.',
        },
      },
      {
        id: 'agent',
        label: 'Agent MyPilot (PC / telefon)',
        transport: 'agent',
        configured: true,
        devices: this.devices.filter((d) => d.transport === 'agent').length,
        note: {
          pl: 'Mały program na komputerze/telefonie zdejmuje głośność, aplikacje i baterię.',
          en: 'A small app on your computer/phone exposes volume, apps and battery.',
        },
      },
      {
        id: 'homeassistant',
        label: 'Home Assistant',
        transport: 'ha',
        configured: Boolean(this.config.homeAssistant.enabled && this.config.homeAssistant.hasToken),
        devices: 0,
        note: {
          pl: 'Mostek do setek urządzeń: Zigbee, Wi-Fi, chmury.',
          en: 'Bridge to hundreds of devices: Zigbee, Wi-Fi, clouds.',
        },
      },
    ];
  }

  snapshot(): Snapshot {
    return {
      devices: this.devices.map((d) => ({ ...d, state: { ...d.state } })),
      scenes: this.scenes,
      automations: this.automations,
      events: this.events,
      energy: this.getEnergy(),
      config: toPublicConfig(this.config),
      ambient: { ...this.ambient, tempC: round(this.ambient.tempC, 1) },
      system: {
        version: VERSION,
        uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
        wsClients: this.wsClients,
        mode: this.config.mode,
        adapters: this.adapters(),
      },
      serverTime: Date.now(),
    };
  }
}
