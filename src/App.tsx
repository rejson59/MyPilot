import { useEffect } from 'react';
import {
  House,
  Info,
  Leaf,
  Search,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Workflow,
  Wifi,
  Zap,
} from 'lucide-react';
import type { ViewId } from './lib/store';
import { useApp, useT } from './lib/store';
import { connectLive } from './lib/live';
import { Dashboard } from './components/Dashboard';
import { DeviceSheet } from './components/DeviceSheet';
import { CommandPalette } from './components/CommandPalette';
import { HubInfo } from './components/HubInfo';
import { Toasts } from './components/ui';
import { ScenesView } from './views/Scenes';
import { AutomationsView } from './views/Automations';
import { EnergyView } from './views/Energy';
import { SettingsView } from './views/Settings';

const NAV: { view: ViewId; icon: typeof House; key: 'nav.room' | 'nav.scenes' | 'nav.automations' | 'nav.energy' }[] = [
  { view: 'room', icon: House, key: 'nav.room' },
  { view: 'scenes', icon: Sparkles, key: 'nav.scenes' },
  { view: 'automations', icon: Workflow, key: 'nav.automations' },
  { view: 'energy', icon: Leaf, key: 'nav.energy' },
];

const isOn = (state: Record<string, unknown>, kind: string) => {
  if (kind === 'phone' || kind === 'tablet') return Boolean(state.screenOn);
  if (kind === 'blind') return Number(state.position ?? 0) > 0;
  return Boolean(state.on);
};

function useTheme() {
  const theme = useApp((state) => state.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#08080a' : '#f1f1f4');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

function useLiveConnection() {
  useEffect(() => connectLive(), []);
}

function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useApp.getState();
      const target = event.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        state.setPalette(true);
        return;
      }
      if (event.key === 'Escape') {
        if (state.paletteOpen) state.setPalette(false);
        else if (state.sheetDeviceId) state.closeSheet();
        else if (state.hubOpen) state.setHub(false);
        return;
      }
      if (typing) return;
      if (event.key === '/') {
        event.preventDefault();
        state.setPalette(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export default function App() {
  const snapshot = useApp((state) => state.snapshot);
  const connected = useApp((state) => state.connected);
  const view = useApp((state) => state.view);
  const setView = useApp((state) => state.setView);
  const setPalette = useApp((state) => state.setPalette);
  const setHub = useApp((state) => state.setHub);
  const locale = useApp((state) => state.locale);
  const t = useT();

  useTheme();
  useLiveConnection();
  useShortcuts();

  if (!snapshot) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          justifyItems: 'center',
          gap: 16,
          textAlign: 'center',
          padding: 24,
        }}
      >
        <span className="brand__mark" style={{ width: 52, height: 52, borderRadius: 16 }}>
          <Zap size={24} />
        </span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>MyPilot</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('app.tagline')}</div>
        </div>
        <div className="statusPill">
          <span className="statusPill__dot" data-offline={!connected} /> {connected ? 'Łączenie…' : t('toast.offline')}
        </div>
      </div>
    );
  }

  const devices = snapshot.devices;
  const lights = devices.filter((device) => device.kind === 'light' || device.kind === 'led_strip');
  const lightsOn = lights.filter((device) => isOn(device.state as Record<string, unknown>, device.kind)).length;
  const devicesOn = devices.filter((device) => isOn(device.state as Record<string, unknown>, device.kind)).length;
  const speaker = devices.find((device) => device.kind === 'speaker');
  const playing = Boolean((speaker?.state as Record<string, unknown> | undefined)?.playing);
  const enabledAutomations = snapshot.automations.filter((automation) => automation.enabled).length;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? t('greeting.night') : hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening');
  const dateLabel = new Date().toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const badge: Partial<Record<ViewId, number>> = { automations: enabledAutomations, scenes: snapshot.scenes.length };

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <span className="brand__mark">
            <Zap size={17} strokeWidth={2.4} />
          </span>
          <div className="brand__text">
            <div className="brand__name">MyPilot</div>
            <span className="brand__sub">{t('rail.hint')}</span>
          </div>
        </div>

        <nav className="rail__nav" aria-label="Nawigacja">
          <div className="rail__label">MyPilot</div>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                type="button"
                className="navlink"
                data-active={view === item.view}
                onClick={() => setView(item.view)}
              >
                <Icon size={17} strokeWidth={1.9} />
                <span>{t(item.key)}</span>
                {badge[item.view] ? <span className="navlink__badge">{badge[item.view]}</span> : null}
              </button>
            );
          })}
          <div className="rail__label" style={{ marginTop: 14 }}>
            System
          </div>
          <button
            type="button"
            className="navlink"
            data-active={view === 'settings'}
            onClick={() => setView('settings')}
          >
            <Settings size={17} strokeWidth={1.9} />
            <span>{t('nav.settings')}</span>
          </button>
        </nav>

        <div className="rail__spacer" />

        <div className="rail__card">
          <div className="rail__cardTitle">
            <Info size={13} /> {t('nav.howItWorks')}
          </div>
          <div className="rail__cardText">{t('hub.lead')}</div>
          <button type="button" className="rail__cardLink" onClick={() => setHub(true)}>
            {t('hub.doINeed')} →
          </button>
        </div>

        <div className="rail__footer">
          <span className={`statusPill ${snapshot.system.mode === 'simulation' ? 'statusPill--demo' : ''}`}>
            <span className="statusPill__dot" data-offline={!connected} />
            <span>{snapshot.system.mode === 'simulation' ? t('common.demo') : t('common.live')}</span>
          </span>
          <button type="button" className="iconBtn" onClick={() => setPalette(true)} aria-label={t('topbar.command')}>
            <Search size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="greeting__eyebrow">
              <Zap size={12} />
              {dateLabel}
              <span className="dotSep" />
              <span style={{ color: connected ? 'var(--ok)' : 'var(--danger)' }}>
                {connected ? t('common.online') : t('common.offline')}
              </span>
            </div>
            <h1 className="greeting__title">
              {greeting}, {snapshot.config.ownerName || 'Rejson'}.
            </h1>
            <div className="greeting__sub">
              <span>
                {lightsOn}/{lights.length} {t('header.lightsOn')}
              </span>
              <span className="dotSep" />
              <span>
                {playing ? '▶' : '❚❚'} {playing ? t('header.musicPlaying') : t('header.musicPaused')}
              </span>
              <span className="dotSep" />
              <span>
                {devicesOn}/{devices.length} {t('header.devicesOnline')}
              </span>
              <span className="dotSep" />
              <span>
                {snapshot.ambient.tempC.toFixed(1)}°C · {snapshot.energy.liveW} W
              </span>
            </div>
          </div>

          <div className="topbar__actions">
            <button type="button" className="searchBtn" onClick={() => setPalette(true)}>
              <Search size={15} />
              <span>{t('topbar.search')}</span>
              <span className="kbd">⌘K</span>
            </button>
            <ThemeButton />
            <div className="langToggle" role="group" aria-label={t('common.language')}>
              <button type="button" data-active={locale === 'pl'} onClick={() => useApp.getState().setLocale('pl')}>
                PL
              </button>
              <button type="button" data-active={locale === 'en'} onClick={() => useApp.getState().setLocale('en')}>
                EN
              </button>
            </div>
            <button
              type="button"
              className="iconBtn"
              onClick={() => setView('settings')}
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        <main className="view" key={view}>
          {view === 'room' && <Dashboard />}
          {view === 'scenes' && <ScenesView />}
          {view === 'automations' && <AutomationsView />}
          {view === 'energy' && <EnergyView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      <nav className="tabbar" aria-label="Nawigacja mobilna">
        {[...NAV, { view: 'settings' as ViewId, icon: Settings, key: 'nav.settings' as const }].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              className="tab"
              data-active={view === item.view}
              onClick={() => setView(item.view)}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{t(item.key)}</span>
            </button>
          );
        })}
      </nav>

      <DeviceSheet />
      <CommandPalette />
      <HubInfo />
      <Toasts />
    </div>
  );
}

function ThemeButton() {
  const theme = useApp((state) => state.theme);
  const setTheme = useApp((state) => state.setTheme);
  const order: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Wifi;

  return (
    <button
      type="button"
      className="iconBtn"
      onClick={() => setTheme(next)}
      aria-label={`Motyw: ${theme}`}
      title={`Motyw: ${theme}`}
    >
      <Icon size={16} />
    </button>
  );
}
