import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import type { Device, Scene } from '../../shared/types';
import { api } from '../lib/api';
import { plural } from '../lib/format';
import { getSceneIcon } from '../lib/icons';
import { useApp, useT } from '../lib/store';

const matches = (scene: Scene, devices: Device[]) =>
  scene.actions.every((action) => {
    const device = devices.find((item) => item.id === action.deviceId);
    if (!device) return false;
    return Object.entries(action.patch).every(([key, value]) => (device.state as Record<string, unknown>)[key] === value);
  });

export function ScenesView() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const toast = useApp((state) => state.toast);
  const [applying, setApplying] = useState<string | null>(null);

  const apply = async (scene: Scene) => {
    setApplying(scene.id);
    try {
      const result = await api.applyScene(scene.id);
      toast(`${t('toast.scene', { name: scene.name[locale] })} · ${plural(locale, result.changed, ['zmiana', 'zmiany', 'zmian'], ['change', 'changes'])}`, 'success');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setTimeout(() => setApplying(null), 500);
    }
  };

  return (
    <div>
      <h1 className="pageTitle">{t('scenes.title')}</h1>
      <p className="pageSub">{t('scenes.subtitle')}</p>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">{t('scenes.scenesActive')}</h2>
          <span className="section__meta">{snapshot.scenes.length}</span>
        </div>
        <div className="sceneGrid">
          {snapshot.scenes.map((scene) => {
            const Icon = getSceneIcon(scene.icon);
            const active = matches(scene, snapshot.devices);
            return (
              <button
                key={scene.id}
                type="button"
                className="sceneCard"
                data-active={active}
                style={{ '--c': scene.accent } as React.CSSProperties}
                onClick={() => apply(scene)}
              >
                <div className="sceneCard__top">
                  <span className="sceneCard__icon">
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="sceneCard__name">{scene.name[locale]}</div>
                    <div className="sceneCard__desc">{scene.description[locale]}</div>
                  </div>
                  {active && (
                    <span className="chipMini" style={{ marginLeft: 'auto', color: scene.accent, flex: '0 0 auto' }}>
                      <Check size={11} />
                    </span>
                  )}
                </div>

                <div className="sceneCard__actions">
                  {scene.actions.slice(0, 4).map((action) => {
                    const device = snapshot.devices.find((item) => item.id === action.deviceId);
                    if (!device) return null;
                    const on = Object.entries(action.patch).every(([key, value]) => (device.state as Record<string, unknown>)[key] === value);
                    return (
                      <span key={action.deviceId} className="chipMini" style={{ opacity: on ? 1 : 0.72 }}>
                        {device.name[locale]}
                      </span>
                    );
                  })}
                  {scene.actions.length > 4 && <span className="chipMini">+{scene.actions.length - 4}</span>}
                </div>

                <span className="sceneCard__cta">
                  {applying === scene.id ? t('common.saving') : t('common.apply')}
                  <ArrowRight size={13} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
