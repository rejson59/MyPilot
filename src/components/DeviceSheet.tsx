import { useState } from 'react';
import {
  BatteryCharging,
  BellRing,
  Bluetooth,
  Check,
  Radio,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudMoon,
  CornerUpLeft,
  House,
  Lightbulb,
  MonitorPlay,
  Music2,
  Pause,
  Play,
  Power,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  Zap,
} from 'lucide-react';
import type { BluetoothPeer, Device, IrButton } from '../../shared/types';
import { api } from '../lib/api';
import { formatDuration, kindAccent } from '../lib/format';
import { getDeviceIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';
import { Ring, Segmented, Sheet, Slider, Switch } from './ui';

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#6c5ce7', '#ff2d55'];

export function DeviceSheet() {
  const t = useT();
  const id = useApp((state) => state.sheetDeviceId);
  const close = useApp((state) => state.closeSheet);
  const device = useApp((state) => state.snapshot?.devices.find((item) => item.id === id) ?? null);

  if (!device) return null;

  return (
    <Sheet onClose={close} label={device.name.pl}>
      <DeviceBody device={device} />
    </Sheet>
  );
}

function DeviceBody({ device }: { device: Device }) {
  const t = useT();
  const locale = useApp((state) => state.locale);
  const toast = useApp((state) => state.toast);
  const close = useApp((state) => state.closeSheet);
  const ambient = useApp((state) => state.snapshot!.ambient);
  const Icon = getDeviceIcon(device.kind);
  const accent = kindAccent[device.kind] ?? '#0a84ff';
  const state = device.state as Record<string, any>;
  const powered = Boolean(state.on);

  const fail = (error: unknown) => toast(`${t('toast.error')}: ${(error as Error).message}`, 'error');
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(fail);
  const command = (name: string, payload: Record<string, unknown> = {}) =>
    api.command(device.id, name, payload).catch(fail);

  const showPower = !['blind', 'phone', 'tablet'].includes(device.kind);
  const buttons = (device.meta?.buttons as IrButton[] | undefined) ?? [];
  const isCustom = Boolean(device.meta?.custom);

  return (
    <>
      <div className="sheet__head">
        <span className="sheet__heroIcon" style={{ '--c': accent } as React.CSSProperties}>
          <Icon size={22} strokeWidth={1.8} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="sheet__title">{device.name[locale]}</h2>
          <div className="sheet__sub">
            <span>{t(`kind.${device.kind}`)}</span>
            <span className="dotSep" />
            <span>{t(`transport.${device.transport}`)}</span>
            {device.meta?.custom && (
              <>
                <span className="dotSep" />
                <span>{t('sheet.customDevice')}</span>
              </>
            )}
            {!device.online && (
              <>
                <span className="dotSep" />
                <span className="offlineTag">{t('common.offline')}</span>
              </>
            )}
          </div>
        </div>
        <button type="button" className="sheet__close" onClick={close} aria-label={t('common.close')}>
          <ChevronDown size={17} />
        </button>
      </div>

      <div className="sheet__scroll" style={{ '--c': accent } as React.CSSProperties}>
        {showPower && (
          <div className="powerBar">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="powerBar__title">{t('sheet.power')}</div>
              <div className="powerBar__sub">
                {powered ? `${t('common.on')} · ${Math.round(device.powerW)} W` : t('common.off')}
              </div>
            </div>
            <Switch
              size="lg"
              checked={powered}
              accent={accent}
              onChange={(value) =>
                device.kind === 'speaker'
                  ? command(value ? 'play' : 'pause')
                  : patch({ on: value })
              }
              label={t('sheet.power')}
              disabled={!device.online}
            />
          </div>
        )}

        {device.kind === 'light' && <LightControls device={device} />}
        {device.kind === 'led_strip' && <LightControls device={device} withColor />}
        {device.kind === 'speaker' && <SpeakerControls device={device} />}
        {device.kind === 'tv' && <TvControls device={device} />}
        {device.kind === 'ac' && <AcControls device={device} ambient={ambient.tempC} />}
        {device.kind === 'pc' && <PcControls device={device} />}
        {(device.kind === 'phone' || device.kind === 'tablet') && <PhoneControls device={device} />}
        {device.kind === 'plug' && <PlugControls device={device} />}
        {device.kind === 'blind' && <BlindControls device={device} />}

        {buttons.length > 0 && <IrPad device={device} buttons={buttons} />}
        {buttons.length > 0 && <IrCodeEditor key={device.id} device={device} buttons={buttons} />}

        <div className="block">
          <div className="block__head">
            <span className="block__label">{t('sheet.info')}</span>
            <span className="block__value">{Math.round(device.powerW)} W</span>
          </div>
          <div className="infoRows">
            <div className="infoRow">
              <span>{t('sheet.model')}</span>
              <strong>{device.model}</strong>
            </div>
            <div className="infoRow">
              <span>{t('sheet.transport')}</span>
              <strong>{t(`transport.${device.transport}`)}</strong>
            </div>
            {device.meta?.mac && (
              <div className="infoRow">
                <span>MAC</span>
                <strong>{String(device.meta.mac)}</strong>
              </div>
            )}
            {device.meta?.ip && (
              <div className="infoRow">
                <span>IP</span>
                <strong>{String(device.meta.ip)}</strong>
              </div>
            )}
            <div className="infoRow">
              <span>{t('sheet.powerDraw')}</span>
              <strong>{Math.round(device.powerW)} W</strong>
            </div>
          </div>
        </div>

        {isCustom && (
          <div className="block">
            <button type="button" className="btn btn--danger btn--sm btn--block" onClick={async () => {
              if (!window.confirm(t('sheet.deleteConfirm'))) return;
              try {
                await api.deleteDevice(device.id);
                close();
                toast(t('sheet.deleteDevice'), 'info');
              } catch (error) {
                toast((error as Error).message, 'error');
              }
            }}>
              <Trash2 size={13} /> {t('sheet.deleteDevice')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- light */

function LightControls({ device, withColor = false }: { device: Device; withColor?: boolean }) {
  const t = useT();
  const locale = useApp((state) => state.locale);
  const toast = useApp((state) => state.toast);
  const state = device.state as Record<string, any>;
  const accent = kindAccent[device.kind];
  const patch = (payload: Record<string, unknown>) =>
    api.patchDevice(device.id, payload).catch((error) => toast((error as Error).message, 'error'));

  return (
    <>
      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.brightness')}</span>
          <span className="block__value">{Math.round(state.brightness ?? 0)}%</span>
        </div>
        <Slider
          value={Number(state.brightness ?? 0)}
          onChange={(value) => patch({ brightness: value })}
          label={t('sheet.brightness')}
          accent={accent}
        />
        <div className="presetRow" style={{ marginTop: 8 }}>
          {[25, 50, 75, 100].map((value) => (
            <button key={value} type="button" className="preset" onClick={() => patch({ brightness: value })}>
              {value}%
            </button>
          ))}
        </div>
      </div>

      {!withColor && (
        <div className="block">
          <div className="block__head">
            <span className="block__label">{t('sheet.temperature')}</span>
            <span className="block__value">{Math.round(state.tempK ?? 2700)} K</span>
          </div>
          <Slider
            value={Number(state.tempK ?? 2700)}
            min={2200}
            max={6500}
            step={100}
            variant="warm"
            onChange={(value) => patch({ tempK: value })}
            label={t('sheet.temperature')}
            labels={[t('sheet.warm'), t('sheet.cool')]}
          />
        </div>
      )}

      {withColor && (
        <>
          <div className="block">
            <div className="block__head">
              <span className="block__label">{t('sheet.color')}</span>
              <span className="block__value">{state.color}</span>
            </div>
            <div className="swatches">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  data-active={String(state.color).toLowerCase() === color}
                  style={{ '--sw': color } as React.CSSProperties}
                  aria-label={color}
                  onClick={() => patch({ color })}
                />
              ))}
            </div>
          </div>

          <div className="block">
            <div className="block__head">
              <span className="block__label">{t('sheet.effects')}</span>
            </div>
            <div className="effectRow">
              {(device.meta?.effects as string[] | undefined)?.map((effect) => (
                <button
                  key={effect}
                  type="button"
                  className="chip"
                  data-active={state.effect === effect}
                  onClick={() => patch({ effect })}
                >
                  {effect}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="note">
        {t('common.on')} · {device.name[locale]} · {Math.round(device.powerW)} W
      </div>
    </>
  );
}

/* ------------------------------------------------------------- speaker */

function SpeakerControls({ device }: { device: Device }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const state = device.state as Record<string, any>;
  const track = state.track ?? { title: '—', artist: '—', duration: 1, position: 0, artwork: '#5b6cff' };
  const [peers, setPeers] = useState<BluetoothPeer[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pairing, setPairing] = useState<string | null>(null);

  const command = (name: string, payload: Record<string, unknown> = {}) =>
    api.command(device.id, name, payload).catch((error) => toast((error as Error).message, 'error'));
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await api.scanBluetooth();
      setPeers(result.peers);
      toast(t('toast.scan', { count: result.peers.length }), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const pair = async (peer: BluetoothPeer) => {
    setPairing(peer.mac);
    try {
      await api.command(device.id, 'bt-connect');
      toast(`${peer.name}: ${t('sheet.paired')}`, 'success');
      setPeers((current) => current?.map((item) => ({ ...item, paired: item.mac === peer.mac })) ?? null);
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setPairing(null);
    }
  };

  const progress = Math.min(100, (Number(track.position) / Math.max(1, Number(track.duration))) * 100);

  return (
    <>
      <div className="block" style={{ paddingTop: 10 }}>
        <div className="nowPlaying" style={{ '--art': track.artwork ?? '#5b6cff' } as React.CSSProperties}>
          <div className="art">
            <Music2 size={24} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nowPlaying__title">{track.title}</div>
            <div className="nowPlaying__artist">{track.artist}</div>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress__fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progressTimes">
              <span>{formatDuration(track.position)}</span>
              <span>{formatDuration(track.duration)}</span>
            </div>
          </div>
        </div>

        <div className="transport">
          <button type="button" className="transport__side" onClick={() => command('prev')} aria-label="Poprzedni">
            <SkipBack size={17} />
          </button>
          <button
            type="button"
            className="transport__play"
            onClick={() => command(state.playing ? 'pause' : 'play')}
            aria-label={state.playing ? 'Pauza' : 'Odtwarzaj'}
          >
            {state.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button type="button" className="transport__side" onClick={() => command('next')} aria-label="Następny">
            <SkipForward size={17} />
          </button>
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">
            <Volume2 size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.volume')}
          </span>
          <span className="block__value">{Math.round(state.volume ?? 0)}%</span>
        </div>
        <Slider
          value={Number(state.volume ?? 0)}
          onChange={(value) => patch({ volume: value })}
          label={t('sheet.volume')}
          accent="#06b6d4"
        />
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.source')}</span>
        </div>
        <Segmented
          value={String(state.source ?? 'bluetooth')}
          onChange={(value) => patch({ source: value })}
          options={[
            { value: 'bluetooth', label: t('sheet.source.bluetooth') },
            { value: 'spotify', label: t('sheet.source.spotify') },
            { value: 'aux', label: t('sheet.source.aux') },
          ]}
        />
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">
            <Bluetooth size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.pairing')}
          </span>
          <button type="button" className="btn btn--sm" onClick={scan} disabled={scanning}>
            {scanning ? t('sheet.scanning') : t('sheet.scan')}
          </button>
        </div>

        {peers && (
          <div className="peers">
            {peers.map((peer) => (
              <div className="peer" key={peer.mac}>
                <span className="peer__icon">
                  {peer.kind === 'speaker' ? <Volume2 size={14} /> : peer.kind === 'phone' ? <BellRing size={14} /> : <Wifi size={14} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="peer__name">{peer.name}</div>
                  <div className="peer__meta">
                    {peer.mac} · {peer.rssi} dBm
                  </div>
                </div>
                <span className="peer__action">
                  {peer.paired ? (
                    <span className="chipMini" style={{ color: 'var(--ok)' }}>
                      <Check size={11} /> {t('sheet.paired')}
                    </span>
                  ) : (
                    <button type="button" className="btn btn--sm" onClick={() => pair(peer)} disabled={pairing === peer.mac}>
                      {pairing === peer.mac ? '…' : t('sheet.pair')}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {!peers && <div className="note">{t('sheet.scan')} → wybierz głośnik. Parowanie idzie przez `bluetoothctl` w trybie live.</div>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ TV */

function TvControls({ device }: { device: Device }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const state = device.state as Record<string, any>;
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);
  const key = (value: string) =>
    api.command(device.id, 'ir-key', { key: value }).catch((error) => toast((error as Error).message, 'error'));

  return (
    <>
      <div className="block">
        <div className="block__head">
          <span className="block__label">
            <Volume2 size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.volume')}
          </span>
          <span className="block__value">
            {state.muted ? <VolumeX size={13} style={{ display: 'inline' }} /> : `${Math.round(state.volume ?? 0)}%`}
          </span>
        </div>
        <Slider value={Number(state.volume ?? 0)} onChange={(value) => patch({ volume: value })} label={t('sheet.volume')} accent="#3b82f6" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('sheet.volume')} · mute</span>
          <Switch checked={Boolean(state.muted)} accent="#3b82f6" onChange={(value) => patch({ muted: value })} label="Mute" />
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.input')}</span>
          <span className="block__value">{state.input}</span>
        </div>
        <div className="effectRow">
          {['HDMI 1', 'HDMI 2', 'HDMI 3', 'TV', 'USB'].map((input) => (
            <button
              key={input}
              type="button"
              className="chip"
              data-active={state.input === input}
              onClick={() => patch({ input })}
            >
              {input}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.remote')}</span>
          <span className="chipMini">
            <Zap size={11} /> IR
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button type="button" className="remoteKey" onClick={() => key('power')}>
            <Power size={16} />
            <span>POWER</span>
          </button>
          <button type="button" className="remoteKey" onClick={() => key('vol-')}>
            <Volume1 size={16} />
            <span>VOL −</span>
          </button>
          <button type="button" className="remoteKey" onClick={() => key('vol+')}>
            <Volume2 size={16} />
            <span>VOL +</span>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 8 }}>
          <div className="dpad">
            <span />
            <button type="button" onClick={() => key('up')} aria-label="Góra">
              <ChevronUp size={18} />
            </button>
            <span />
            <button type="button" onClick={() => key('left')} aria-label="Lewo">
              <ChevronLeft size={18} />
            </button>
            <button type="button" data-center="true" onClick={() => key('ok')}>
              OK
            </button>
            <button type="button" onClick={() => key('right')} aria-label="Prawo">
              <ChevronRight size={18} />
            </button>
            <span />
            <button type="button" onClick={() => key('down')} aria-label="Dół">
              <ChevronDown size={18} />
            </button>
            <span />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="remoteKey" onClick={() => key('mute')}>
              <VolumeX size={16} />
              <span>MUTE</span>
            </button>
            <button type="button" className="remoteKey" onClick={() => key('home')}>
              <House size={16} />
              <span>HOME</span>
            </button>
            <button type="button" className="remoteKey" onClick={() => key('back')}>
              <CornerUpLeft size={16} />
              <span>BACK</span>
            </button>
            <button type="button" className="remoteKey" onClick={() => key('hdmi2')}>
              <MonitorPlay size={16} />
              <span>HDMI</span>
            </button>
          </div>
        </div>
        <div className="note">{t('sheet.irNote')}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ AC */

function AcControls({ device, ambient }: { device: Device; ambient: number }) {
  const t = useT();
  const state = device.state as Record<string, any>;
  const target = Number(state.target ?? 22);
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);

  return (
    <>
      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.targetTemp')}</span>
          <span className="block__value">{t('sheet.ambient', { temp: ambient.toFixed(1) })}</span>
        </div>
        <div className="thermostat">
          <button type="button" className="thermoBtn" onClick={() => patch({ target: target - 1 })} aria-label="−">
            <ChevronDown size={20} />
          </button>
          <div className="thermoValue">
            {target}
            <sup>°C</sup>
          </div>
          <button type="button" className="thermoBtn" onClick={() => patch({ target: target + 1 })} aria-label="+">
            <ChevronUp size={20} />
          </button>
        </div>
        <div className="thermoHint">{state.on ? t('sheet.ambient', { temp: ambient.toFixed(1) }) : t('status.acOff')}</div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.mode')}</span>
        </div>
        <Segmented
          value={String(state.mode ?? 'cool')}
          onChange={(value) => patch({ mode: value, on: true })}
          options={[
            { value: 'cool', label: t('sheet.mode.cool') },
            { value: 'heat', label: t('sheet.mode.heat') },
            { value: 'fan', label: t('sheet.mode.fan') },
            { value: 'dry', label: t('sheet.mode.dry') },
            { value: 'auto', label: t('sheet.mode.auto') },
          ]}
        />
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.fan')}</span>
          <span className="block__value">{['0', '1', '2', '3'][Number(state.fan ?? 0)] ?? '0'}</span>
        </div>
        <Segmented
          value={String(state.fan ?? 0)}
          onChange={(value) => patch({ fan: Number(value) })}
          options={[
            { value: '0', label: 'AUTO' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('sheet.swing')}</span>
          <Switch checked={Boolean(state.swing)} accent="#14b8a6" onChange={(value) => patch({ swing: value })} label={t('sheet.swing')} />
        </div>
        <div className="note">{t('sheet.irNote')}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ PC */

function PcControls({ device }: { device: Device }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const state = device.state as Record<string, any>;
  const apps = (device.meta?.apps as string[] | undefined) ?? [];
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);
  const command = (name: string, payload: Record<string, unknown> = {}) =>
    api.command(device.id, name, payload).catch((error) => toast((error as Error).message, 'error'));

  return (
    <>
      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.pcSpecs')}</span>
          <span className="chipMini">{state.on ? t('common.online') : t('common.offline')}</span>
        </div>
        <div className="breakdown">
          <div className="breakdownRow">
            <span>{t('sheet.cpu')}</span>
            <span className="barTrack">
              <span className="barFill" style={{ width: `${Math.min(100, Number(state.cpu ?? 0))}%`, '--c': '#6366f1' } as React.CSSProperties} />
            </span>
            <span>{Math.round(state.cpu ?? 0)}%</span>
          </div>
          <div className="breakdownRow">
            <span>{t('sheet.temp')}</span>
            <span className="barTrack">
              <span className="barFill" style={{ width: `${Math.min(100, (Number(state.tempC ?? 0) / 95) * 100)}%`, '--c': '#f59e0b' } as React.CSSProperties} />
            </span>
            <span>{Math.round(state.tempC ?? 0)}°C</span>
          </div>
        </div>
        <div className="infoRow" style={{ marginTop: 12 }}>
          <span>{t('sheet.apps')}</span>
          <strong>{state.activeApp ?? '—'}</strong>
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.volume')}</span>
          <span className="block__value">{Math.round(state.volume ?? 0)}%</span>
        </div>
        <Slider value={Number(state.volume ?? 0)} onChange={(value) => patch({ volume: value })} label={t('sheet.volume')} accent="#6366f1" />
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">Media</span>
          <span className="block__value">
            {state.muted ? <VolumeX size={13} style={{ display: 'inline' }} /> : `${Math.round(state.volume ?? 0)}%`}
          </span>
        </div>
        <div className="setFooter" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn--sm" onClick={() => command('media', { action: 'prev' })} aria-label="Poprzedni">
            <SkipBack size={13} />
          </button>
          <button type="button" className="btn btn--sm" onClick={() => command('media', { action: 'play-pause' })} aria-label="Play/Pauza">
            <Pause size={13} />
          </button>
          <button type="button" className="btn btn--sm" onClick={() => command('media', { action: 'next' })} aria-label="Następny">
            <SkipForward size={13} />
          </button>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <VolumeX size={13} /> mute
            <Switch checked={Boolean(state.muted)} accent="#6366f1" onChange={() => command('mute')} label="Mute" />
          </span>
        </div>
        <div className="effectRow" style={{ marginTop: 12 }}>
          {apps.map((app) => (
            <button
              key={app}
              type="button"
              className="chip"
              data-active={state.activeApp === app}
              onClick={() => command('launch-app', { app })}
            >
              {app}
            </button>
          ))}
        </div>
        <div className="setFooter" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--sm" onClick={() => command('wake')}>
            <Zap size={13} /> {t('sheet.wake')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => command('sleep')}>
            <CloudMoon size={13} /> {t('sheet.sleep')}
          </button>
        </div>
        <div className="note">{t('sheet.pcNote')}</div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- phone/tablet */

function PhoneControls({ device }: { device: Device }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const state = device.state as Record<string, any>;
  const apps = (device.meta?.apps as string[] | undefined) ?? [];
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);
  const command = (name: string) => api.command(device.id, name).catch((error) => toast((error as Error).message, 'error'));

  return (
    <>
      <div className="block">
        <div className="batteryWrap">
          <Ring
            value={Number(state.battery ?? 0)}
            label={`${Math.round(state.battery ?? 0)}%`}
            sublabel={state.charging ? '⚡' : undefined}
            color={Number(state.battery) > 30 ? '#10b981' : '#f59e0b'}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                <BatteryCharging size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.charging')}
              </span>
              <Switch checked={Boolean(state.charging)} accent="#10b981" onChange={(value) => patch({ charging: value })} label={t('sheet.charging')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                <BellRing size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.dnd')}
              </span>
              <Switch checked={Boolean(state.dnd)} accent="#10b981" onChange={(value) => patch({ dnd: value })} label={t('sheet.dnd')} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                <Lightbulb size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('sheet.screen')}
              </span>
              <Switch checked={Boolean(state.screenOn)} accent="#10b981" onChange={(value) => patch({ screenOn: value })} label={t('sheet.screen')} />
            </div>
          </div>
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.volume')}</span>
          <span className="block__value">{Math.round(state.mediaVolume ?? 0)}%</span>
        </div>
        <Slider value={Number(state.mediaVolume ?? 0)} onChange={(value) => patch({ mediaVolume: value })} label={t('sheet.volume')} accent="#10b981" />
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.actions')}</span>
        </div>
        <div className="setFooter" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn--sm" onClick={() => command('ring')}>
            <BellRing size={13} /> {t('sheet.ring')}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => command('find')}>
            <Lightbulb size={13} /> {t('sheet.find')}
          </button>
        </div>
      </div>

      <div className="block">
        <div className="block__head">
          <span className="block__label">{t('sheet.apps')}</span>
        </div>
        <div className="effectRow">
          {apps.map((app) => (
            <span key={app} className="chipMini">
              {app}
            </span>
          ))}
        </div>
        <div className="note">{t('sheet.batteryNote')}</div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ plug */

function PlugControls({ device }: { device: Device }) {
  const t = useT();
  const state = device.state as Record<string, any>;
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);

  return (
    <div className="block">
      <div className="block__head">
        <span className="block__label">{t('sheet.whatPlugged')}</span>
        <span className="chipMini">{state.on ? `${Math.round(state.loadW ?? 0)} W` : '0 W'}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 560 }}>{t('sheet.whatPluggedValue')}</div>
      <div className="miniGrid">
        <div className="statBox">
          <div className="statBox__label">{t('energy.live')}</div>
          <div className="statBox__value">{Math.round(state.loadW ?? 0)} W</div>
        </div>
        <div className="statBox">
          <div className="statBox__label">kWh</div>
          <div className="statBox__value">{Number(state.energyKwh ?? 0).toFixed(1)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('sheet.power')}</span>
        <Switch checked={Boolean(state.on)} accent="#f43f5e" onChange={(value) => patch({ on: value })} label={t('sheet.power')} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- blind */

function BlindControls({ device }: { device: Device }) {
  const t = useT();
  const state = device.state as Record<string, any>;
  const patch = (payload: Record<string, unknown>) => api.patchDevice(device.id, payload).catch(() => undefined);

  return (
    <div className="block">
      <div className="block__head">
        <span className="block__label">{t('kind.blind')}</span>
        <span className="block__value">{Math.round(state.position ?? 0)}%</span>
      </div>
      <Slider value={Number(state.position ?? 0)} onChange={(value) => patch({ position: value })} label={t('kind.blind')} accent="#78716c" />
      <div className="presetRow" style={{ marginTop: 8 }}>
        <button type="button" className="preset" onClick={() => patch({ position: 0 })}>
          {t('sheet.blindClosed')}
        </button>
        <button type="button" className="preset" onClick={() => patch({ position: 50 })}>
          {t('sheet.blindHalf')}
        </button>
        <button type="button" className="preset" onClick={() => patch({ position: 100 })}>
          {t('sheet.blindOpen')}
        </button>
        <button type="button" className="preset" onClick={() => patch({ position: Number(state.position) > 0 ? 0 : 100 })}>
          {Number(state.position) > 0 ? t('common.off') : t('common.on')}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- pilot IR */

function IrPad({ device, buttons }: { device: Device; buttons: IrButton[] }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const [busy, setBusy] = useState<string | null>(null);
  const state = device.state as Record<string, any>;

  const send = async (button: IrButton) => {
    setBusy(button.id);
    try {
      await api.command(device.id, 'ir-button', { buttonId: button.id });
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="block">
      <div className="block__head">
        <span className="block__label">{t('sheet.remote')}</span>
        <span className="chipMini">
          <Radio size={11} /> IR
        </span>
      </div>
      <div className="irPad">
        {buttons.map((button) => {
          const active =
            button.action === 'color' &&
            String(state.color ?? '').toLowerCase() === String(button.value ?? '').toLowerCase();
          return (
            <button
              key={button.id}
              type="button"
              className="irKey"
              data-active={active}
              disabled={busy === button.id}
              style={button.action === 'color' ? ({ '--sw': String(button.value) } as React.CSSProperties) : undefined}
              onClick={() => send(button)}
            >
              {button.action === 'color' && <span className="irKey__dot" />}
              <span>{button.label}</span>
            </button>
          );
        })}
      </div>
      <div className="note">{t('sheet.irDemoNote')}</div>
    </div>
  );
}

/* --------------------------------------------------------- edytor kodów IR */

function IrCodeEditor({ device, buttons }: { device: Device; buttons: IrButton[] }) {
  const t = useT();
  const toast = useApp((state) => state.toast);
  const [codes, setCodes] = useState<Record<string, string>>(
    Object.fromEntries(buttons.map((button) => [button.id, button.code ?? ''])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = buttons.map((button) => {
        const code = (codes[button.id] ?? '').trim();
        return { ...button, code: code || undefined };
      });
      await api.updateDeviceInfo(device.id, { meta: { buttons: updated } });
      toast(t('common.saved'), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="codesBox">
      <summary>
        <span>{t('sheet.irCodes')}</span>
        <span className="chipMini">
          {buttons.filter((button) => button.code).length}/{buttons.length}
        </span>
      </summary>
      <p className="note" style={{ marginTop: 10 }}>
        {t('sheet.irCodesNote')}
      </p>
      <div className="codesList">
        {buttons.map((button) => (
          <div className="codeRow" key={button.id}>
            <span className="codeRow__label">{button.label}</span>
            <input
              className="input codeRow__input"
              value={codes[button.id] ?? ''}
              placeholder="0x00FF906F"
              aria-label={`${button.label} — ${t('sheet.code')}`}
              onChange={(event) =>
                setCodes((current) => ({ ...current, [button.id]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn--primary btn--sm" style={{ marginTop: 10 }} onClick={save} disabled={saving}>
        {saving ? t('common.saving') : t('sheet.saveCodes')}
      </button>
    </details>
  );
}
