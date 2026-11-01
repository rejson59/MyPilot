import { Check, Radio } from 'lucide-react';
import { useApp, useT } from '../lib/store';
import { Modal } from './ui';

export function HubInfo() {
  const t = useT();
  const open = useApp((state) => state.hubOpen);
  const setHub = useApp((state) => state.setHub);

  if (!open) return null;

  return (
    <Modal onClose={() => setHub(false)} label={t('hub.title')}>
      <div className="hubHero">
        <Radio size={22} />
      </div>
      <h2 className="hubTitle">{t('hub.title')}</h2>
      <p className="hubLead">{t('hub.lead')}</p>

      <div className="hubSection">
        <h4>{t('hub.why')}</h4>
        <div className="hubList">
          {[t('hub.why1'), t('hub.why2'), t('hub.why3')].map((item) => (
            <div className="hubListItem" key={item}>
              <Check size={14} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hubSection">
        <h4>{t('hub.doINeed')}</h4>
        <div className="hubBox" style={{ marginBottom: 8 }}>
          <strong>{t('common.no')}.</strong> {t('hub.needNo')}
        </div>
        <div className="hubBox">
          <strong>{t('common.yes')}.</strong> {t('hub.needYes')}
        </div>
      </div>

      <div className="hubSection">
        <h4>{t('hub.recommend')}</h4>
        <div className="hubBox hubBox--accent">{t('hub.recommendText')}</div>
      </div>

      <div className="hubSection">
        <h4>{t('hub.roadmap')}</h4>
        <div className="steps">
          <div className="step">{t('hub.step1')}</div>
          <div className="step">{t('hub.step2')}</div>
          <div className="step">{t('hub.step3')}</div>
          <div className="step">{t('hub.step4')}</div>
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 20 }} onClick={() => setHub(false)}>
        {t('hub.gotIt')}
      </button>
    </Modal>
  );
}
