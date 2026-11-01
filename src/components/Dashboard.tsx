import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Droplets,
  Flame,
  Leaf,
  Music2,
  Search,
  Snowflake,
  Sun,
  Wind,
  Zap,
} from 'lucide-react';
import type { Device, Scene, ZoneId } from '../../shared/types';
import { api } from '../lib/api';
import { cx, eventIconKind, localized, plural, timeAgo } from '../lib/format';
import { getSceneIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';
import { DeviceTile } from './DeviceTile';
import { Sparkline, Switch } from './ui';

const isOn = (device: Device) => {
  const state = device.state as Record<string, any>;
  if (device.kind === 'blind') return Number(state.position ?? 0) > 0;
  if (device.kind === 'phone' || device.kind === 'tablet') return Boolean(state.screenOn);
  return Boolean(state.on);
};

const sceneMatches = (scene: Scene, devices: Device[]) =>
  scene.actions.every((action) => {
    const device = devices.find((item) => item.id === action.deviceId);
    if (!device) return false;
    return Object.entries(action.patch).every(([key, value]) => (device.state as Record<string, unknown>)[key] === value);
  });

export function Dashboard() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const toast = useApp((state) => state.toast);
  const setView = useApp((state) => state.setView);

  const [zone, setZone] = useState<'all' | ZoneId>('all');
  const [query, setQuery] = useState('');
  const [applying, setApplying] = useState<string | null>(null);

  const devices = snapshot.devices;
  const lights = devices.filter((device) => device.kind === 'light' || device.kind === 'led_strip');
  const lightsOn = lights.filter(isOn).length;
  const speaker = devices.find((device) => device.kind === 'speaker');
  const speakerState = speaker?.state as Record<string, any> | undefined;
  const ac = devices.find((device) => device.kind === 'ac');
  const acState = ac?.state as Record<string, any> | undefined;
  const blind = devices.find((device) => device.kind === 'blind');
  const blindState = blind?.state as Record<string, any> | undefined;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      if (zone !== 'all' && device.zone !== zone) return false;
      if (!needle) return true;
      return (
        device.name.pl.toLowerCase().includes(needle) ||
        device.name.en.toLowerCase().includes(needle) ||
        device.model.toLowerCase().includes(needle)
      );
    });
  }, [devices, zone, query]);

  const activeZones: ('all' | ZoneId)[] = ['all', 'room', 'desk', 'bed'];
  const zonesPresent = activeZones.filter((value) => value === 'all' || devices.some((device) => device.zone === value));

  const applyScene = async (scene: Scene) => {
    setApplying(scene.id);
    try {
      const result = await api.applyScene(scene.id);
      toast(
        `${t('toast.scene', { name: scene.name[locale] })} · ${plural(locale, result.changed, ['zmiana', 'zmiany', 'zmian'], ['change', 'changes'])}`,
        'success',
      );
    } catch (error) {
      toast(`${t('toast.error')}: ${(error as Error).message}`, 'error');
    } finally {
      setTimeout(() => setApplying(null), 600);
    }
  };

  const patch = (id: string, payload: Record<string, unknown>) =>
    api.patchDevice(id, payload).catch((error) => toast((error as Error).message, 'error'));

  const toggleLights = () => {
    const next = lightsOn < lights.length;
    lights
      .filter((light) => Boolean((light.state as any).on) !== next)
      .forEach((light) => void patch(light.id, { on: next }));
  };

  const allDevicesOn = devices.filter((device) => device.kind !== 'blind').filter(isOn).length;

  return (
    <div>
      <section className="section" style={{ marginTop: 8 }}>
        <div className="section__head">
          <h2 className="section__title">
            {t('scenes.title')}
            <span className="section__meta" style={{ fontWeight: 400 }}>
              {t('scenes.subtitle')}
            </span>
          </h2>
          <button type="button" className="chip" onClick={() => setView('scenes')}>
            {t('scenes.all')} <ArrowRight size={12} style={{ marginLeft: 4 }} />
          </button>
        </div>
        <div className="sceneRow">
          {snapshot.scenes.map((scene) => {
            const Icon = getSceneIcon(scene.icon);
            const active = sceneMatches(scene, devices);
            return (
              <button
                key={scene.id}
                type="button"
                className="scene"
                data-active={active}
                style={{ '--c': scene.accent } as React.CSSProperties}
                onClick={() => applyScene(scene)}
                aria-busy={applying === scene.id}
              >
                <span className="scene__icon">
                  <Icon size={17} strokeWidth={2} />
                </span>
                <span className="scene__name">{scene.name[locale]}</span>
                <span className="scene__desc">{scene.description[locale]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="gridDash">
        <div>
          <div className="section__head" style={{ marginBottom: 10 }}>
            <h2 className="section__title">
              {t('devices.title')}
              <span className="section__meta">{t('devices.count', { count: devices.length })}</span>
            </h2>
            <span className="section__meta">
              {t('summary.devices', { on: allDevicesOn, total: devices.length })}
            </span>
          </div>

          <div className="filterRow">
            {zonesPresent.map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                data-active={zone === value}
                onClick={() => setZone(value)}
              >
                {value === 'all' ? t('devices.all') : t(`zone.${value}`)}
              </button>
            ))}
            <label className="field" style={{ marginLeft: 'auto' }}>
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('devices.search')}
                aria-label={t('devices.search')}
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="card card--pad empty">{t('devices.empty')}</div>
          ) : (
            <div className="deviceGrid">
              {filtered.map((device, index) => (
                <DeviceTile key={device.id} device={device} index={index} />
              ))}
            </div>
          )}
        </div>

        <aside className="railRight">
          <div className="miniCard">
            <div className="miniCard__head">
              <span className="miniCard__title">
                <Zap size={13} /> {t('quick.title')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="feedItem__dot" style={{ background: 'color-mix(in srgb, #f59e0b 14%, transparent)', color: '#f59e0b' }}>
                  <Sun size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 570 }}>{t('quick.lights')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {t('summary.lights', { on: lightsOn, total: lights.length })}
                  </div>
                </div>
                <Switch checked={lightsOn > 0} onChange={toggleLights} label={t('quick.lights')} accent="#f59e0b" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="feedItem__dot" style={{ background: 'color-mix(in srgb, #06b6d4 14%, transparent)', color: '#06b6d4' }}>
                  <Music2 size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 570 }}>{t('quick.sound')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {speakerState?.playing ? `${speakerState.track?.artist} · ${speakerState.volume}%` : t('header.musicPaused')}
                  </div>
                </div>
                <Switch
                  checked={Boolean(speakerState?.playing)}
                  onChange={(value) => speaker && void api.command(speaker.id, value ? 'play' : 'pause')}
                  label={t('quick.sound')}
                  accent="#06b6d4"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="feedItem__dot" style={{ background: 'color-mix(in srgb, #14b8a6 14%, transparent)', color: '#14b8a6' }}>
                  <Snowflake size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 570 }}>{t('quick.climate')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {acState?.on ? `${acState.target}°C · ${t(`sheet.mode.${acState.mode}` as any)}` : t('climate.acOff')}
                  </div>
                </div>
                <Switch
                  checked={Boolean(acState?.on)}
                  onChange={(value) => ac && void patch(ac.id, { on: value })}
                  label={t('quick.climate')}
                  accent="#14b8a6"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="feedItem__dot" style={{ background: 'color-mix(in srgb, #78716c 14%, transparent)', color: '#78716c' }}>
                  <Wind size={13} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 570 }}>{t('kind.blind')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.round(blindState?.position ?? 0)}%</div>
                </div>
                <Switch
                  checked={Number(blindState?.position ?? 0) > 0}
                  onChange={(value) => blind && void patch(blind.id, { position: value ? 100 : 0 })}
                  label={t('kind.blind')}
                  accent="#78716c"
                />
              </div>
            </div>
          </div>

          <ClimateCard />
          <EnergyCard />
          <ActivityCard />
        </aside>
      </div>
    </div>
  );
}

function ClimateCard() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const ac = snapshot.devices.find((device) => device.kind === 'ac');
  const acOn = Boolean((ac?.state as any)?.on);
  const { tempC, humidity, co2 } = snapshot.ambient;

  return (
    <div className="miniCard">
      <div className="miniCard__head">
        <span className="miniCard__title">
          <Sun size={13} /> {t('climate.title')}
        </span>
        <span className="chipMini" style={{ color: acOn ? '#14b8a6' : undefined }}>
          <Snowflake size={11} /> {acOn ? t('climate.acOn') : t('climate.acOff')}
        </span>
      </div>
      <div className="climateRow">
        <div className="climateMain">
          <div className="climateValue">
            {tempC.toFixed(1)}
            <span>°C</span>
          </div>
          <div className="climateSub">{t('climate.temp')}</div>
        </div>
        <div className="climateStats">
          <div className="statLine">
            <span>
              <Droplets size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {t('climate.humidity')}
            </span>
            <strong>{Math.round(humidity)}%</strong>
          </div>
          <div className="statLine">
            <span>
              <Wind size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {t('climate.co2')}
            </span>
            <strong>{Math.round(co2)}</strong>
          </div>
          <div className="statLine">
            <span>
              <Flame size={11} style={{ display: 'inline', verticalAlign: -1 }} /> {t('energy.live')}
            </span>
            <strong>{snapshot.energy.liveW} W</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnergyCard() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const setView = useApp((state) => state.setView);
  const energy = snapshot.energy;
  const cost = (energy.todayKwh * energy.pricePerKwh).toFixed(2);
  const top = energy.breakdown.filter((item) => item.w > 1).slice(0, 3);
  const max = Math.max(1, ...top.map((item) => item.w));

  return (
    <div className="miniCard">
      <div className="miniCard__head">
        <span className="miniCard__title">
          <Leaf size={13} /> {t('energy.title')}
        </span>
        <button type="button" className="chipMini" onClick={() => setView('energy')}>
          {t('common.more')} <ArrowRight size={10} />
        </button>
      </div>

      <div className="energyBig">
        <strong>{energy.liveW}</strong>
        <span>{t('common.watts')} · {t('energy.live').toLowerCase()}</span>
      </div>
      <Sparkline values={energy.liveSeries} />

      <div className="miniGrid">
        <div className="statBox">
          <div className="statBox__label">{t('energy.today')}</div>
          <div className="statBox__value">{energy.todayKwh.toFixed(2)} kWh</div>
        </div>
        <div className="statBox">
          <div className="statBox__label">{t('energy.costToday')}</div>
          <div className="statBox__value">
            {cost} {energy.currency}
          </div>
        </div>
      </div>

      <div className="breakdown" style={{ marginTop: 13 }}>
        {top.map((item, index) => (
          <div className="breakdownRow" key={item.deviceId}>
            <span>{localized(item.name, useApp.getState().locale)}</span>
            <span className="barTrack">
              <span
                className="barFill"
                style={{
                  width: `${(item.w / max) * 100}%`,
                  '--c': ['#f59e0b', '#06b6d4', '#6366f1'][index] ?? '#0a84ff',
                } as React.CSSProperties}
              />
            </span>
            <span>{Math.round(item.w)} W</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityCard() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const events = snapshot.events.slice(0, 7);

  return (
    <div className="miniCard">
      <div className="miniCard__head">
        <span className="miniCard__title">
          <Activity size={13} /> {t('activity.title')}
        </span>
      </div>
      {events.length === 0 ? (
        <div className="empty">{t('activity.empty')}</div>
      ) : (
        <div className="feed">
          {events.map((event) => {
            const kind = eventIconKind(event);
            const Icon = kind === 'scene' ? Zap : kind === 'automation' ? BatteryCharging : kind === 'warning' ? Flame : Activity;
            return (
              <div className="feedItem" key={event.id}>
                <span className="feedItem__dot" data-kind={kind}>
                  <Icon size={11} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="feedItem__text">{localized(event.message, locale)}</div>
                  <div className="feedItem__time">{timeAgo(event.ts, locale)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
