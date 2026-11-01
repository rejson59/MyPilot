import type { DeviceKind, DeviceState, IrButton, LocalizedText, Transport } from '../../shared/types';

export interface DeviceTemplate {
  id: string;
  name: LocalizedText;
  desc: LocalizedText;
  kind: DeviceKind;
  transport: Transport;
  model: string;
  state: DeviceState;
  meta?: Record<string, unknown>;
  fields: ('ip' | 'mac')[];
}

/**
 * Zestaw przycisków typowego pilota IR do taśmy RGB (24-klawiszowy).
 * Kody są puste — każdy pilot ma inne. Wpisujesz je w panelu urządzenia
 * po przechwyceniu (Tasmota wypisuje je w konsoli).
 */
const stripButtons: IrButton[] = [
  { id: 'power', label: 'POWER', action: 'toggle' },
  { id: 'bright-up', label: 'JAŚNIEJ', action: 'bright+' },
  { id: 'bright-down', label: 'CIEMNIEJ', action: 'bright-' },
  { id: 'white', label: 'BIAŁY', action: 'color', value: '#ffffff' },
  { id: 'red', label: 'CZERWONY', action: 'color', value: '#ff3b30' },
  { id: 'green', label: 'ZIELONY', action: 'color', value: '#34c759' },
  { id: 'blue', label: 'NIEBIESKI', action: 'color', value: '#0a84ff' },
  { id: 'purple', label: 'FIOLET', action: 'color', value: '#6c5ce7' },
  { id: 'orange', label: 'POMARAŃCZ', action: 'color', value: '#ff9500' },
  { id: 'cyan', label: 'CYJAN', action: 'color', value: '#00c7be' },
  { id: 'fade', label: 'FADE', action: 'effect', value: 'Fade' },
  { id: 'flash', label: 'FLASH', action: 'effect', value: 'Flash' },
];

export const deviceTemplates: DeviceTemplate[] = [
  {
    id: 'ir-strip',
    name: { pl: 'Taśma LED z pilotem', en: 'IR LED strip' },
    desc: { pl: 'Grundig / LSC / dowolna taśma RGB na podczerwień', en: 'Grundig / LSC / any infrared RGB strip' },
    kind: 'led_strip',
    transport: 'ir',
    model: 'Taśma LED RGB · pilot IR',
    state: { on: true, brightness: 60, color: '#ff2d55', effect: 'Statyczny' },
    meta: { effects: ['Statyczny', 'Fade', 'Flash', 'Smooth'], buttons: stripButtons },
    fields: [],
  },
  {
    id: 'wifi-light',
    name: { pl: 'Lampa Wi-Fi', en: 'Wi-Fi light' },
    desc: { pl: 'Shelly, Tasmota, Tuya, LSC Smart Connect', en: 'Shelly, Tasmota, Tuya, LSC Smart Connect' },
    kind: 'light',
    transport: 'wifi',
    model: 'Lampa Wi-Fi',
    state: { on: false, brightness: 70, tempK: 3000 },
    fields: ['ip'],
  },
  {
    id: 'wifi-plug',
    name: { pl: 'Gniazdko Wi-Fi', en: 'Wi-Fi plug' },
    desc: { pl: 'Z pomiarem energii lub bez', en: 'With or without energy metering' },
    kind: 'plug',
    transport: 'wifi',
    model: 'Gniazdko Wi-Fi',
    state: { on: false, loadW: 0, energyKwh: 0 },
    fields: ['ip'],
  },
  {
    id: 'bt-speaker',
    name: { pl: 'Głośnik Bluetooth', en: 'Bluetooth speaker' },
    desc: { pl: 'Parowanie i głośność przez bluetoothctl', en: 'Pairing and volume via bluetoothctl' },
    kind: 'speaker',
    transport: 'bluetooth',
    model: 'Głośnik Bluetooth',
    state: {
      on: false,
      playing: false,
      volume: 40,
      source: 'bluetooth',
      track: { title: '—', artist: '—', album: '—', duration: 240, position: 0, artwork: '#06b6d4' },
    },
    fields: ['mac'],
  },
  {
    id: 'tv-ir',
    name: { pl: 'Telewizor (IR)', en: 'TV (IR)' },
    desc: { pl: 'Sterowanie pilotem przez mostek IR', en: 'Remote control through the IR bridge' },
    kind: 'tv',
    transport: 'ir',
    model: 'Telewizor · pilot IR',
    state: { on: false, volume: 20, muted: false, input: 'HDMI 1' },
    fields: [],
  },
  {
    id: 'ac-ir',
    name: { pl: 'Klimatyzacja (IR)', en: 'Air conditioner (IR)' },
    desc: { pl: 'Gree, Midea, LG, Samsung — zależnie od kodów', en: 'Gree, Midea, LG, Samsung — depending on codes' },
    kind: 'ac',
    transport: 'ir',
    model: 'Klimatyzacja · pilot IR',
    state: { on: false, mode: 'cool', target: 22, fan: 1, swing: false },
    fields: [],
  },
  {
    id: 'blind',
    name: { pl: 'Roleta / zasłona', en: 'Blind / curtain' },
    desc: { pl: 'SwitchBot lub własny silnik', en: 'SwitchBot or your own motor' },
    kind: 'blind',
    transport: 'wifi',
    model: 'Roleta',
    state: { position: 100 },
    fields: ['mac'],
  },
  {
    id: 'other',
    name: { pl: 'Coś innego', en: 'Something else' },
    desc: { pl: 'Ogólne urządzenie, ustawisz szczegóły później', en: 'A generic device, details later' },
    kind: 'light',
    transport: 'wifi',
    model: 'Własne urządzenie',
    state: { on: false, brightness: 70, tempK: 3000 },
    fields: ['ip'],
  },
];
