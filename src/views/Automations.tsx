import { Clock, Play, Plus, Power, Zap } from 'lucide-react';
import type { Automation, Device } from '../../shared/types';
import { api } from '../lib/api';
import { localized, plural, timeAgo } from '../lib/format';
import { getDeviceIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';
import { Switch } from '../components/ui';

export function AutomationsView() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const toast = useApp((state) => state.toast);

  const toggle = async (automation: Automation, enabled: boolean) => {
    try {
      await api.setAutomation(automation.id, enabled);
      toast(`${localized(automation.name, locale)}: ${enabled ? t('common.enabled') : t('common.disabled')}`, 'info');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const run = async (automation: Automation) => {
    try {
      await api.runAutomation(automation.id);
      toast(localized(automation.name, locale), 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  return (
    <div>
      <h1 className="pageTitle">{t('automations.title')}</h1>
      <p className="pageSub">{t('automations.subtitle')}</p>

      <div className="autoList" style={{ marginTop: 22 }}>
        {snapshot.automations.map((automation) => (
          <AutomationCard
            key={automation.id}
            automation={automation}
            devices={snapshot.devices}
            onToggle={(enabled) => toggle(automation, enabled)}
            onRun={() => run(automation)}
          />
        ))}
      </div>

      <div className="insetSection">
        <span className="autoCard__icon" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
          <Plus size={18} />
        </span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{t('automations.new')}</div>
          <p>{t('automations.newNote')}</p>
        </div>
      </div>
    </div>
  );
}

function AutomationCard({
  automation,
  devices,
  onToggle,
  onRun,
}: {
  automation: Automation;
  devices: Device[];
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
}) {
  const t = useT();
  const locale = useApp((state) => state.locale);

  const trigger = automation.trigger;
  const triggerDevice = trigger.type === 'device' ? devices.find((device) => device.id === trigger.deviceId) : undefined;
  const triggerText =
    trigger.type === 'time'
      ? t('automations.timeTrigger', { at: trigger.at })
      : t('automations.deviceTrigger', {
          device: triggerDevice ? localized(triggerDevice.name, locale) : '—',
          value: String(trigger.equals),
        });

  const participants = automation.actions
    .map((action) => devices.find((device) => device.id === action.deviceId))
    .filter(Boolean)
    .slice(0, 3) as Device[];

  const Icon = triggerDevice ? getDeviceIcon(triggerDevice.kind) : Clock;

  return (
    <div className="autoCard" data-enabled={automation.enabled}>
      <span className="autoCard__icon">
        <Icon size={18} />
      </span>

      <div className="autoCard__body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="autoCard__name">{localized(automation.name, locale)}</div>
            <div className="autoCard__flow">
              <span className="chipMini">
                <Clock size={10} /> {triggerText}
              </span>
              <span>→</span>
              <span className="chipMini">
                <Zap size={10} /> {plural(locale, automation.actions.length, ['akcja', 'akcje', 'akcji'], ['action', 'actions'])}
              </span>
            </div>
          </div>
          <Switch
            checked={automation.enabled}
            onChange={onToggle}
            label={localized(automation.name, locale)}
            accent="var(--accent)"
          />
        </div>

        <div className="autoCard__footer">
          {participants.map((device) => (
            <span key={device.id} className="chipMini">
              {localized(device.name, locale)}
            </span>
          ))}
          <span className="autoCard__meta" style={{ marginLeft: 'auto' }}>
            {t('automations.lastRun')}: {automation.lastRun ? timeAgo(automation.lastRun, locale) : t('common.never')}
          </span>
          <button type="button" className="btn btn--sm" onClick={onRun}>
            <Play size={12} /> {t('common.runNow')}
          </button>
        </div>
      </div>
    </div>
  );
}

void Power;
