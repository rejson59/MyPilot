import { useState } from 'react';
import { ArrowLeft, ArrowRight, Info, Plus } from 'lucide-react';
import type { ZoneId } from '../../shared/types';
import { api } from '../lib/api';
import { useT, useApp } from '../lib/store';
import { deviceTemplates, type DeviceTemplate } from '../lib/templates';
import { getDeviceIcon } from '../lib/icons';
import { Modal, Segmented } from './ui';

export function AddDeviceModal() {
  const t = useT();
  const locale = useApp((state) => state.locale);
  const open = useApp((state) => state.addOpen);
  const setAddOpen = useApp((state) => state.setAddOpen);
  const openSheet = useApp((state) => state.openSheet);
  const toast = useApp((state) => state.toast);

  const [template, setTemplate] = useState<DeviceTemplate | null>(null);
  const [name, setName] = useState('');
  const [zone, setZone] = useState<ZoneId>('room');
  const [model, setModel] = useState('');
  const [ip, setIp] = useState('');
  const [mac, setMac] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const close = () => {
    setAddOpen(false);
    setTemplate(null);
    setName('');
    setModel('');
    setIp('');
    setMac('');
    setZone('room');
  };

  const choose = (item: DeviceTemplate) => {
    setTemplate(item);
    setName(item.name[locale]);
    setModel(item.model);
    setZone(item.kind === 'led_strip' || item.kind === 'plug' ? 'desk' : 'room');
  };

  const submit = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const meta: Record<string, unknown> = { ...(template.meta ?? {}) };
      if (ip.trim()) meta.ip = ip.trim();
      if (mac.trim()) meta.mac = mac.trim();
      const result = await api.createDevice({
        name: name.trim() || template.name[locale],
        kind: template.kind,
        transport: template.transport,
        zone,
        model: model.trim() || template.model,
        state: template.state,
        meta,
      });
      toast(t('add.added', { name: result.device.name[locale] }), 'success');
      close();
      openSheet(result.device.id);
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={close} label={t('add.title')}>
      <div className="hubHero" style={{ background: 'linear-gradient(150deg, #0a84ff, #22d3ee)' }}>
        <Plus size={22} />
      </div>
      <h2 className="hubTitle">{t('add.title')}</h2>
      <p className="hubLead">{template ? template.desc[locale] : t('add.subtitle')}</p>

      <div className="wizardSteps">
        <span className="wizardStep" data-active={!template}>
          <i>1</i> {t('add.step1')}
        </span>
        <span className="wizardLine" />
        <span className="wizardStep" data-active={Boolean(template)}>
          <i>2</i> {t('add.step2')}
        </span>
      </div>

      {!template ? (
        <div className="templateGrid">
          {deviceTemplates.map((item) => {
            const Icon = getDeviceIcon(item.kind);
            return (
              <button key={item.id} type="button" className="templateCard" onClick={() => choose(item)}>
                <span className="templateCard__icon">
                  <Icon size={18} />
                </span>
                <span className="templateCard__name">{item.name[locale]}</span>
                <span className="templateCard__desc">{item.desc[locale]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="formRow">
            <label htmlFor="add-name">{t('add.name')}</label>
            <input
              id="add-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('add.namePlaceholder')}
              maxLength={48}
              autoFocus
            />
          </div>

          <div className="formRow">
            <label>{t('add.zone')}</label>
            <Segmented
              value={zone}
              onChange={(value) => setZone(value)}
              options={[
                { value: 'room', label: t('zone.room') },
                { value: 'desk', label: t('zone.desk') },
                { value: 'bed', label: t('zone.bed') },
              ]}
            />
          </div>

          <div className="formGrid">
            <div className="formRow">
              <label htmlFor="add-model">{t('add.model')}</label>
              <input
                id="add-model"
                className="input"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                maxLength={64}
              />
            </div>
            {template.fields.includes('ip') && (
              <div className="formRow">
                <label htmlFor="add-ip">{t('add.ip')}</label>
                <input id="add-ip" className="input" value={ip} onChange={(event) => setIp(event.target.value)} placeholder="192.168.1.50" />
              </div>
            )}
            {template.fields.includes('mac') && (
              <div className="formRow">
                <label htmlFor="add-mac">{t('add.mac')}</label>
                <input id="add-mac" className="input" value={mac} onChange={(event) => setMac(event.target.value)} placeholder="C8:2A:14:9F:31:77" />
              </div>
            )}
          </div>

          {template.transport === 'ir' && (
            <div className="note" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 2 }}>
              <Info size={15} style={{ flex: '0 0 auto', marginTop: 1 }} />
              <span>{t('add.irTip')}</span>
            </div>
          )}

          <div className="setFooter" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn--sm" onClick={() => setTemplate(null)}>
              <ArrowLeft size={13} /> {t('add.back')}
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={saving}>
              {saving ? t('add.creating') : t('add.submit')}
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
