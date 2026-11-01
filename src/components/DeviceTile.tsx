import { useState } from 'react';
import type { Device } from '../../shared/types';
import { api } from '../lib/api';
import { deviceStatus, isDeviceOn, kindAccent } from '../lib/format';
import { getDeviceIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';
import { Slider, Switch } from './ui';

export function DeviceTile({ device, index }: { device: Device; index: number }) {
  const t = useT();
  const locale = useApp((state) => state.locale);
  const openSheet = useApp((state) => state.openSheet);
  const toast = useApp((state) => state.toast);
  const [busy, setBusy] = useState(false);

  const state = device.state as Record<string, any>;
  const on = isDeviceOn(device);
  const Icon = getDeviceIcon(device.kind);
  const accent = kindAccent[device.kind] ?? '#0a84ff';

  const fail = (error: unknown) => {
    toast(`${t('toast.error')}: ${(error as Error).message}`, 'error');
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.command(device.id, 'toggle');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (next: Record<string, unknown>) => {
    try {
      await api.patchDevice(device.id, next);
    } catch (error) {
      fail(error);
    }
  };

  const inline = (() => {
    if (device.kind === 'light' || device.kind === 'led_strip') {
      if (!state.on) return null;
      return (
        <Slider
          value={Number(state.brightness ?? 0)}
          onChange={(value) => patch({ brightness: value })}
          label={`${device.name[locale]} — ${t('sheet.brightness')}`}
          accent={accent}
        />
      );
    }
    if (device.kind === 'speaker') {
      if (!state.on) return null;
      return (
        <Slider
          value={Number(state.volume ?? 0)}
          onChange={(value) => patch({ volume: value })}
          label={`${device.name[locale]} — ${t('sheet.volume')}`}
          accent={accent}
        />
      );
    }
    if (device.kind === 'tv' || device.kind === 'pc' || device.kind === 'laptop') {
      if (!state.on) return null;
      return (
        <Slider
          value={Number(state.volume ?? 0)}
          onChange={(value) => patch({ volume: value })}
          label={`${device.name[locale]} — ${t('sheet.volume')}`}
          accent={accent}
        />
      );
    }
    if (device.kind === 'blind') {
      return (
        <Slider
          value={Number(state.position ?? 0)}
          onChange={(value) => patch({ position: value })}
          label={`${device.name[locale]} — pozycja`}
          accent={accent}
        />
      );
    }
    if (device.kind === 'phone' || device.kind === 'tablet') {
      return (
        <div className="tile__status" style={{ marginTop: 0 }}>
          <span style={{ color: 'var(--text-3)' }}>{state.charging ? '⚡' : '🔋'}</span>
          {t('sheet.battery')} {Math.round(state.battery ?? 0)}%
        </div>
      );
    }
    if (device.kind === 'ac') {
      return (
        <div className="tile__status" style={{ marginTop: 0 }}>
          {state.on
            ? `${Math.round(state.target ?? 22)}°C · ${t(`sheet.mode.${state.mode ?? 'cool'}` as any)}`
            : t('status.acOff')}
        </div>
      );
    }
    if (device.kind === 'plug') {
      return (
        <div className="tile__status" style={{ marginTop: 0 }}>
          {state.on ? `${Math.round(state.loadW ?? 0)} W` : '—'} · {Number(state.energyKwh ?? 0).toFixed(1)} kWh
        </div>
      );
    }
    return null;
  })();

  return (
    <article
      className="tile"
      data-on={on}
      data-online={device.online}
      style={{ '--c': accent, animationDelay: `${Math.min(index * 26, 260)}ms` } as React.CSSProperties}
      onClick={() => device.online && openSheet(device.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (device.online) openSheet(device.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={device.name[locale]}
    >
      <div className="tile__head">
        <span className="tile__icon">
          <Icon size={19} strokeWidth={1.9} />
        </span>
        <span className="tile__zone">{t(`zone.${device.zone}`)}</span>
        <Switch
          checked={on}
          accent={accent}
          onChange={() => toggle()}
          label={`${device.name[locale]} ${on ? t('common.off') : t('common.on')}`}
          disabled={!device.online || busy}
        />
      </div>

      <div className="tile__body">
        <h3 className="tile__name">
          {device.name[locale]}
          {!device.online && <span className="offlineTag">{t('common.offline')}</span>}
        </h3>
        <div className={on ? 'tile__status' : 'tile__status tile__status--off'}>{deviceStatus(device, t)}</div>
      </div>

      {device.online && inline && <div className="tile__inline">{inline}</div>}
    </article>
  );
}
