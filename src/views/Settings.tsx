import { useState } from 'react';
import {
  Bluetooth,
  Download,
  Info,
  Languages,
  LayoutGrid,
  Leaf,
  Monitor,
  Palette,
  Radio,
  RotateCcw,
  Router,
  Server,
  Smartphone,
  User,
  Wifi,
} from 'lucide-react';
import type { SetupTestResult } from '../../shared/types';
import { api } from '../lib/api';
import { useApp, useT } from '../lib/store';
import { Segmented, Switch } from '../components/ui';
import type { ThemeMode } from '../lib/store';

interface FormState {
  ownerName: string;
  price: string;
  currency: string;
  irEnabled: boolean;
  irUrl: string;
  irFormat: 'tasmota' | 'generic';
  btEnabled: boolean;
  btAdapter: string;
  btMac: string;
  btName: string;
  agentEnabled: boolean;
  agentUrl: string;
  agentToken: string;
  phoneEnabled: boolean;
  phoneAdb: string;
  phoneSerial: string;
  haEnabled: boolean;
  haUrl: string;
  haToken: string;
  mqttEnabled: boolean;
  mqttUrl: string;
  mqttUser: string;
  mqttPass: string;
}

export function SettingsView() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const theme = useApp((state) => state.theme);
  const setTheme = useApp((state) => state.setTheme);
  const setLocale = useApp((state) => state.setLocale);
  const setHub = useApp((state) => state.setHub);
  const toast = useApp((state) => state.toast);
  const config = snapshot.config;

  const [form, setForm] = useState<FormState>({
    ownerName: config.ownerName,
    price: String(config.energyPricePerKwh),
    currency: config.currency,
    irEnabled: config.irBridge.enabled,
    irUrl: config.irBridge.url,
    irFormat: config.irBridge.format,
    btEnabled: config.bluetooth.enabled,
    btAdapter: config.bluetooth.adapter,
    btMac: config.bluetooth.speakerMac,
    btName: config.bluetooth.speakerName,
    agentEnabled: config.agent.enabled,
    agentUrl: config.agent.url,
    agentToken: '',
    phoneEnabled: config.phone.enabled,
    phoneAdb: config.phone.adbPath,
    phoneSerial: config.phone.serial,
    haEnabled: config.homeAssistant.enabled,
    haUrl: config.homeAssistant.url,
    haToken: '',
    mqttEnabled: config.mqtt.enabled,
    mqttUrl: config.mqtt.url,
    mqttUser: config.mqtt.username,
    mqttPass: '',
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SetupTestResult>>({});

  const set = <K extends keyof FormState>(key: K) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (label: string, patch: Record<string, unknown>) => {
    setSaving(label);
    try {
      await api.saveConfig(patch);
      toast(t('settings.savedNote'), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSaving(null);
    }
  };

  const test = async (target: SetupTestResult['target'], payload: Record<string, unknown>) => {
    setTesting(target);
    try {
      const result = await api.testIntegration(target, payload);
      setResults((current) => ({ ...current, [target]: result }));
      toast(result.message[locale], result.ok ? 'success' : 'error');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  };

  const reset = async () => {
    if (!window.confirm(locale === 'pl' ? 'Przywrócić domyślny pokój demo?' : 'Restore the default demo room?')) return;
    try {
      await api.resetDemo();
      toast(t('toast.reset'), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const status = (ok: boolean) => (
    <span className="setCard__status" data-ok={ok}>
      {ok ? t('settings.connected') : t('settings.notConnected')}
    </span>
  );

  const result = (target: string) => {
    const item = results[target];
    if (!item) return null;
    return (
      <div className="testResult" data-ok={item.ok}>
        {item.message[locale]}
        {item.latencyMs != null && ` · ${item.latencyMs} ms`}
      </div>
    );
  };

  return (
    <div>
      <h1 className="pageTitle">{t('settings.title')}</h1>
      <p className="pageSub">{t('settings.subtitle')}</p>

      <div className="settingsLayout">
        <nav className="settingsNav">
          <a href="#profile">{t('settings.profile')}</a>
          <a href="#mode">{t('settings.mode')}</a>
          <a href="#integrations">{t('settings.integrations')}</a>
          <a href="#appearance">{t('settings.appearance')}</a>
          <a href="#energy">{t('settings.energy')}</a>
          <a href="#adapters">{t('settings.adapters')}</a>
          <a href="#danger">{t('settings.danger')}</a>
        </nav>

        <div className="settingsBody">
          {/* profile */}
          <section className="setCard" id="profile">
            <div className="setCard__head">
              <span className="setCard__icon">
                <User size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.profile')}</div>
                <div className="setCard__desc">{t('app.tagline')}</div>
              </div>
            </div>
            <div className="formGrid">
              <div className="formRow">
                <label htmlFor="ownerName">{t('settings.name')}</label>
                <input id="ownerName" className="input" value={form.ownerName} onChange={set('ownerName')} maxLength={40} />
              </div>
              <div className="formRow">
                <label>{t('common.language')}</label>
                <Segmented
                  value={locale}
                  onChange={(value) => setLocale(value)}
                  options={[
                    { value: 'pl', label: 'Polski' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>
            <div className="setFooter">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => save('profile', { ownerName: form.ownerName })}
                disabled={saving === 'profile'}
              >
                {saving === 'profile' ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>

          {/* mode */}
          <section className="setCard" id="mode">
            <div className="setCard__head">
              <span className="setCard__icon">
                <Server size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.mode')}</div>
                <div className="setCard__desc">{t('settings.modeSwitchNote')}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="modeCard"
                data-active={config.mode === 'simulation'}
                onClick={() => save('mode', { mode: 'simulation' })}
              >
                <span className="modeCard__radio" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.modeSim')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.modeSimNote')}</div>
                </div>
              </button>
              <button
                type="button"
                className="modeCard"
                data-active={config.mode === 'live'}
                onClick={() => save('mode', { mode: 'live' })}
              >
                <span className="modeCard__radio" />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.modeLive')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.modeLiveNote')}</div>
                </div>
              </button>
            </div>
          </section>

          {/* integrations */}
          <section className="setCard" id="integrations">
            <div className="setCard__head">
              <span className="setCard__icon">
                <Router size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.integrations')}</div>
                <div className="setCard__desc">{t('settings.howTo')}</div>
              </div>
            </div>

            {/* IR */}
            <div style={{ padding: '4px 0 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <Radio size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.ir')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.irDesc')}</div>
                </div>
                {status(config.irBridge.enabled && Boolean(config.irBridge.url))}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="irUrl">{t('settings.irUrl')}</label>
                  <input id="irUrl" className="input" value={form.irUrl} onChange={set('irUrl')} placeholder="http://192.168.1.60" />
                </div>
                <div className="formRow">
                  <label>{t('settings.irFormat')}</label>
                  <Segmented
                    value={form.irFormat}
                    onChange={(value) => setForm((current) => ({ ...current, irFormat: value }))}
                    options={[
                      { value: 'tasmota', label: 'Tasmota' },
                      { value: 'generic', label: 'Generic REST' },
                    ]}
                  />
                </div>
              </div>
              <div className="setFooter">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => test('ir', { url: form.irUrl })}
                  disabled={testing === 'ir'}
                >
                  {testing === 'ir' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => save('ir', { irBridge: { enabled: form.irEnabled, url: form.irUrl, format: form.irFormat } })}
                  disabled={saving === 'ir'}
                >
                  {saving === 'ir' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.irEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, irEnabled: value }))}
                    label={t('settings.ir')}
                  />
                </span>
              </div>
              {result('ir')}
            </div>

            {/* Bluetooth */}
            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <Bluetooth size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.bt')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.btDesc')}</div>
                </div>
                {status(config.bluetooth.enabled && Boolean(config.bluetooth.speakerMac))}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="btName">{t('settings.btName')}</label>
                  <input id="btName" className="input" value={form.btName} onChange={set('btName')} />
                </div>
                <div className="formRow">
                  <label htmlFor="btMac">{t('settings.btMac')}</label>
                  <input id="btMac" className="input" value={form.btMac} onChange={set('btMac')} placeholder="C8:2A:14:9F:31:77" />
                </div>
                <div className="formRow">
                  <label htmlFor="btAdapter">{t('settings.btAdapter')}</label>
                  <input id="btAdapter" className="input" value={form.btAdapter} onChange={set('btAdapter')} placeholder="hci0" />
                </div>
              </div>
              <div className="setFooter">
                <button type="button" className="btn btn--sm" onClick={() => test('bluetooth', {})} disabled={testing === 'bluetooth'}>
                  {testing === 'bluetooth' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    save('bt', {
                      bluetooth: {
                        enabled: form.btEnabled,
                        adapter: form.btAdapter,
                        speakerMac: form.btMac,
                        speakerName: form.btName,
                      },
                    })
                  }
                  disabled={saving === 'bt'}
                >
                  {saving === 'bt' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.btEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, btEnabled: value }))}
                    label={t('settings.bt')}
                  />
                </span>
              </div>
              {result('bluetooth')}
            </div>

            {/* Agent MyPilot */}
            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <Monitor size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.agent')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.agentDesc')}</div>
                </div>
                {status(config.agent.enabled && config.agent.hasToken)}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="agentUrl">{t('settings.agentUrl')}</label>
                  <input
                    id="agentUrl"
                    className="input"
                    value={form.agentUrl}
                    onChange={set('agentUrl')}
                    placeholder="http://127.0.0.1:8790"
                  />
                </div>
                <div className="formRow">
                  <label htmlFor="agentToken">{t('settings.agentToken')}</label>
                  <input
                    id="agentToken"
                    className="input"
                    type="password"
                    value={form.agentToken}
                    onChange={set('agentToken')}
                    placeholder={config.agent.hasToken ? t('common.secretSaved') : 'np. 9f3c…'}
                  />
                </div>
              </div>
              <div className="setFooter">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => test('agent', { url: form.agentUrl, token: form.agentToken })}
                  disabled={testing === 'agent'}
                >
                  {testing === 'agent' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    save('agent', {
                      agent: {
                        enabled: form.agentEnabled,
                        url: form.agentUrl,
                        ...(form.agentToken ? { token: form.agentToken } : {}),
                      },
                    })
                  }
                  disabled={saving === 'agent'}
                >
                  {saving === 'agent' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.agentEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, agentEnabled: value }))}
                    label={t('settings.agent')}
                  />
                </span>
              </div>
              <div className="note">{t('settings.agentHow')}</div>
              {result('agent')}
            </div>

            {/* Telefon (ADB) */}
            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <Smartphone size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.phone')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.phoneDesc')}</div>
                </div>
                {status(config.phone.enabled)}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="phoneAdb">{t('settings.phoneAdb')}</label>
                  <input
                    id="phoneAdb"
                    className="input"
                    value={form.phoneAdb}
                    onChange={set('phoneAdb')}
                    placeholder="adb"
                  />
                </div>
                <div className="formRow">
                  <label htmlFor="phoneSerial">{t('settings.phoneSerial')}</label>
                  <input
                    id="phoneSerial"
                    className="input"
                    value={form.phoneSerial}
                    onChange={set('phoneSerial')}
                    placeholder={t('settings.phoneSerialHint')}
                  />
                </div>
              </div>
              <div className="setFooter">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => test('adb', { adbPath: form.phoneAdb, serial: form.phoneSerial })}
                  disabled={testing === 'adb'}
                >
                  {testing === 'adb' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    save('phone', {
                      phone: {
                        enabled: form.phoneEnabled,
                        adbPath: form.phoneAdb,
                        serial: form.phoneSerial,
                      },
                    })
                  }
                  disabled={saving === 'phone'}
                >
                  {saving === 'phone' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.phoneEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, phoneEnabled: value }))}
                    label={t('settings.phone')}
                  />
                </span>
              </div>
              <div className="note">{t('settings.phoneHow')}</div>
              {result('adb')}
            </div>

            {/* Home Assistant */}
            <div style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <LayoutGrid size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.ha')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.haDesc')}</div>
                </div>
                {status(config.homeAssistant.enabled && config.homeAssistant.hasToken)}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="haUrl">URL</label>
                  <input id="haUrl" className="input" value={form.haUrl} onChange={set('haUrl')} placeholder="http://homeassistant.local:8123" />
                </div>
                <div className="formRow">
                  <label htmlFor="haToken">{t('settings.haToken')}</label>
                  <input
                    id="haToken"
                    className="input"
                    type="password"
                    value={form.haToken}
                    onChange={set('haToken')}
                    placeholder={config.homeAssistant.hasToken ? t('common.secretSaved') : 'eyJ0eXAiOi…'}
                  />
                </div>
              </div>
              <div className="setFooter">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => test('homeassistant', { url: form.haUrl, token: form.haToken })}
                  disabled={testing === 'homeassistant'}
                >
                  {testing === 'homeassistant' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    save('ha', {
                      homeAssistant: {
                        enabled: form.haEnabled,
                        url: form.haUrl,
                        ...(form.haToken ? { token: form.haToken } : {}),
                      },
                    })
                  }
                  disabled={saving === 'ha'}
                >
                  {saving === 'ha' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.haEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, haEnabled: value }))}
                    label={t('settings.ha')}
                  />
                </span>
              </div>
              {result('homeassistant')}
            </div>

            {/* MQTT */}
            <div style={{ paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="setCard__icon" style={{ width: 30, height: 30, borderRadius: 9 }}>
                  <Wifi size={15} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.mqtt')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('settings.mqttDesc')}</div>
                </div>
                {status(config.mqtt.enabled && Boolean(config.mqtt.url))}
              </div>
              <div className="formGrid">
                <div className="formRow">
                  <label htmlFor="mqttUrl">URL</label>
                  <input id="mqttUrl" className="input" value={form.mqttUrl} onChange={set('mqttUrl')} placeholder="mqtt://192.168.1.10:1883" />
                </div>
                <div className="formRow">
                  <label htmlFor="mqttUser">{t('settings.mqttUser')}</label>
                  <input id="mqttUser" className="input" value={form.mqttUser} onChange={set('mqttUser')} />
                </div>
                <div className="formRow">
                  <label htmlFor="mqttPass">{t('settings.mqttPass')}</label>
                  <input
                    id="mqttPass"
                    className="input"
                    type="password"
                    value={form.mqttPass}
                    onChange={set('mqttPass')}
                    placeholder={config.mqtt.hasPassword ? t('common.secretSaved') : ''}
                  />
                </div>
              </div>
              <div className="setFooter">
                <button type="button" className="btn btn--sm" onClick={() => test('mqtt', { url: form.mqttUrl })} disabled={testing === 'mqtt'}>
                  {testing === 'mqtt' ? t('common.testing') : t('common.test')}
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() =>
                    save('mqtt', {
                      mqtt: {
                        enabled: form.mqttEnabled,
                        url: form.mqttUrl,
                        username: form.mqttUser,
                        ...(form.mqttPass ? { password: form.mqttPass } : {}),
                      },
                    })
                  }
                  disabled={saving === 'mqtt'}
                >
                  {saving === 'mqtt' ? t('common.saving') : t('common.save')}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  {t('common.enabled')}
                  <Switch
                    checked={form.mqttEnabled}
                    onChange={(value) => setForm((current) => ({ ...current, mqttEnabled: value }))}
                    label={t('settings.mqtt')}
                  />
                </span>
              </div>
              {result('mqtt')}
            </div>
          </section>

          {/* appearance */}
          <section className="setCard" id="appearance">
            <div className="setCard__head">
              <span className="setCard__icon">
                <Palette size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.appearance')}</div>
                <div className="setCard__desc">
                  {t('common.theme')} · {t('common.language')}
                </div>
              </div>
            </div>
            <div className="formGrid">
              <div className="formRow">
                <label>{t('common.theme')}</label>
                <Segmented
                  value={theme}
                  onChange={(value) => setTheme(value as ThemeMode)}
                  options={[
                    { value: 'system', label: t('common.system') },
                    { value: 'light', label: t('common.light') },
                    { value: 'dark', label: t('common.dark') },
                  ]}
                />
              </div>
              <div className="formRow">
                <label>{t('common.language')}</label>
                <Segmented
                  value={locale}
                  onChange={(value) => setLocale(value)}
                  options={[
                    { value: 'pl', label: 'Polski' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            </div>
            <div className="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Smartphone size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
              <span>
                <strong style={{ color: 'var(--text)' }}>{t('settings.pwa')}</strong> — {t('settings.pwaNote')}
              </span>
            </div>
          </section>

          {/* energy price */}
          <section className="setCard" id="energy">
            <div className="setCard__head">
              <span className="setCard__icon">
                <Leaf size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.energy')}</div>
                <div className="setCard__desc">{t('energy.note')}</div>
              </div>
            </div>
            <div className="formGrid">
              <div className="formRow">
                <label htmlFor="price">{t('settings.price')}</label>
                <input id="price" className="input" type="number" step="0.01" min="0" value={form.price} onChange={set('price')} />
              </div>
              <div className="formRow">
                <label htmlFor="currency">{t('settings.currency')}</label>
                <input id="currency" className="input" value={form.currency} onChange={set('currency')} maxLength={4} />
              </div>
            </div>
            <div className="setFooter">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() =>
                  save('energy', { energyPricePerKwh: Number(form.price) || 0, currency: form.currency || 'zł' })
                }
                disabled={saving === 'energy'}
              >
                {saving === 'energy' ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </section>

          {/* adapters */}
          <section className="setCard" id="adapters">
            <div className="setCard__head">
              <span className="setCard__icon">
                <Info size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.adapters')}</div>
                <div className="setCard__desc">
                  MyPilot v{snapshot.system.version} · {snapshot.system.mode === 'live' ? t('common.live') : t('common.demo')} · {snapshot.system.wsClients} klientów WS
                </div>
              </div>
            </div>
            {snapshot.system.adapters.map((adapter) => (
              <div className="adapterRow" key={adapter.id}>
                <span className="adapterRow__dot" data-ok={adapter.configured} />
                <div style={{ minWidth: 0 }}>
                  <div className="adapterRow__name">{adapter.label}</div>
                  <div className="adapterRow__note">{adapter.note[locale]}</div>
                </div>
                <span className="adapterRow__count">
                  {adapter.configured ? t('settings.connected') : t('settings.notConnected')}
                  {adapter.devices > 0 ? ` · ${adapter.devices}` : ''}
                </span>
              </div>
            ))}
            <button type="button" className="btn btn--sm" style={{ marginTop: 14 }} onClick={() => setHub(true)}>
              <Info size={13} /> {t('nav.howItWorks')}
            </button>
          </section>

          {/* danger */}
          <section className="setCard" id="danger">
            <div className="setCard__head">
              <span className="setCard__icon" style={{ color: 'var(--danger)' }}>
                <RotateCcw size={17} />
              </span>
              <div>
                <div className="setCard__title">{t('settings.danger')}</div>
                <div className="setCard__desc">{t('settings.resetNote')}</div>
              </div>
            </div>
            <button type="button" className="btn btn--danger btn--sm" onClick={reset}>
              <RotateCcw size={13} /> {t('settings.reset')}
            </button>
          </section>

          <div className="note" style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <Download size={14} /> MyPilot · <Languages size={14} /> PL / EN · <Bluetooth size={14} /> IR · BT · Wi-Fi · Agent · Home Assistant
          </div>
        </div>
      </div>
    </div>
  );
}
