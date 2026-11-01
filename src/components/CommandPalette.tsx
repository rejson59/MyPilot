import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Command,
  Leaf,
  Search,
  Settings,
  Sparkles,
  Workflow,
  House,
  Power,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { isDeviceOn, localized } from '../lib/format';
import { getDeviceIcon, getSceneIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';
import type { ViewId } from '../lib/store';

interface Item {
  id: string;
  group: string;
  label: string;
  meta?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette() {
  const t = useT();
  const locale = useApp((state) => state.locale);
  const open = useApp((state) => state.paletteOpen);
  const snapshot = useApp((state) => state.snapshot);
  const setPalette = useApp((state) => state.setPalette);
  const setView = useApp((state) => state.setView);
  const openSheet = useApp((state) => state.openSheet);
  const toast = useApp((state) => state.toast);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open || !snapshot) return null;

  const close = () => setPalette(false);

  const toggle = async (deviceId: string, name: string, next: boolean) => {
    close();
    try {
      await api.command(deviceId, 'toggle');
      toast(`${name}: ${next ? t('common.on') : t('common.off')}`, 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const applyScene = async (sceneId: string, name: string) => {
    close();
    try {
      await api.applyScene(sceneId);
      toast(t('toast.scene', { name }), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const navItems: { view: ViewId; label: string; icon: LucideIcon }[] = [
    { view: 'room', label: t('nav.room'), icon: House },
    { view: 'scenes', label: t('nav.scenes'), icon: Sparkles },
    { view: 'automations', label: t('nav.automations'), icon: Workflow },
    { view: 'energy', label: t('nav.energy'), icon: Leaf },
    { view: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  const items: Item[] = [
    ...snapshot.devices.map((device) => {
      const on = isDeviceOn(device);
      return {
        id: `device-${device.id}`,
        group: t('palette.devices'),
        label: localized(device.name, locale),
        meta: on ? t('palette.toggleOff', { name: '' }).trim() : t('palette.toggleOn', { name: '' }).trim(),
        icon: getDeviceIcon(device.kind),
        run: () => toggle(device.id, localized(device.name, locale), !on),
      };
    }),
    ...snapshot.scenes.map((scene) => ({
      id: `scene-${scene.id}`,
      group: t('palette.scenes'),
      label: localized(scene.name, locale),
      meta: scene.description[locale],
      icon: getSceneIcon(scene.icon),
      run: () => applyScene(scene.id, localized(scene.name, locale)),
    })),
    ...navItems.map((item) => ({
      id: `nav-${item.view}`,
      group: t('palette.nav'),
      label: item.label,
      icon: item.icon,
      run: () => {
        close();
        setView(item.view);
      },
    })),
    {
      id: 'open-settings',
      group: t('palette.actions'),
      label: t('nav.settings'),
      icon: Settings,
      run: () => {
        close();
        setView('settings');
      },
    },
  ];

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) => `${item.label} ${item.group} ${item.meta ?? ''}`.toLowerCase().includes(needle))
    : items.slice(0, 14);

  const grouped = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    acc[item.group] = acc[item.group] ?? [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const flat = Object.values(grouped).flat();
  const current = Math.min(selected, Math.max(0, flat.length - 1));

  const pick = (index: number) => {
    const item = flat[index];
    if (!item) return;
    item.run();
  };

  return (
    <div
      className="paletteWrap"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('topbar.command')}>
        <div className="palette__inputRow">
          <Search size={18} />
          <input
            ref={inputRef}
            className="palette__input"
            value={query}
            placeholder={t('palette.placeholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((value) => Math.min(value + 1, flat.length - 1));
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((value) => Math.max(0, value - 1));
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                pick(current);
              }
            }}
            aria-label={t('palette.placeholder')}
          />
          <span className="kbd">ESC</span>
        </div>

        <div className="palette__list">
          {flat.length === 0 && <div className="empty">{t('palette.empty')}</div>}
          {Object.entries(grouped).map(([group, groupItems]) => (
            <div key={group}>
              <div className="palette__group">{group}</div>
              {groupItems.map((item) => {
                const index = flat.indexOf(item);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="palette__item"
                    data-selected={index === current}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => pick(index)}
                  >
                    <span className="palette__itemIcon">
                      <Icon size={14} />
                    </span>
                    <span>{item.label}</span>
                    {item.meta && <span className="palette__itemMeta">{item.meta}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette__footer">
          <span>{t('palette.hint')}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Command size={11} /> MyPilot
          </span>
        </div>
      </div>
    </div>
  );
}

void ArrowRight;
void Power;
