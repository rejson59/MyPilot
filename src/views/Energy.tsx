import { Activity, Gauge, Leaf, Zap } from 'lucide-react';
import { localized } from '../lib/format';
import { useApp, useT } from '../lib/store';
import { Sparkline } from '../components/ui';

export function EnergyView() {
  const snapshot = useApp((state) => state.snapshot)!;
  const t = useT();
  const locale = useApp((state) => state.locale);
  const energy = snapshot.energy;

  const maxDay = Math.max(0.4, ...energy.history.map((point) => point.kwh));
  const liveMax = Math.max(...energy.liveSeries, 1);
  const liveAvg = Math.round(energy.liveSeries.reduce((sum, value) => sum + value, 0) / Math.max(1, energy.liveSeries.length));
  const maxDevice = Math.max(1, ...energy.breakdown.map((item) => item.w));
  const totalLive = Math.max(1, energy.breakdown.reduce((sum, item) => sum + item.w, 0));

  const dayLabel = (date: string, index: number) => {
    if (index === energy.history.length - 1) return locale === 'pl' ? 'dziś' : 'today';
    const label = new Date(date).toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-GB', { weekday: 'short' });
    return label.replace('.', '');
  };

  return (
    <div>
      <h1 className="pageTitle">{t('energy.title')}</h1>
      <p className="pageSub">{t('energy.subtitle')}</p>

      <div className="energyHero">
        <div className="energyStat">
          <div className="energyStat__label">{t('energy.live')}</div>
          <div className="energyStat__value">
            {energy.liveW}
            <small>W</small>
          </div>
          <div className="energyStat__foot">{t('summary.devices', { on: snapshot.devices.filter((d) => (d.state as any).on).length, total: snapshot.devices.length })}</div>
        </div>
        <div className="energyStat">
          <div className="energyStat__label">{t('energy.today')}</div>
          <div className="energyStat__value">
            {energy.todayKwh.toFixed(2)}
            <small>kWh</small>
          </div>
          <div className="energyStat__foot">
            {(energy.todayKwh * energy.pricePerKwh).toFixed(2)} {energy.currency} · {t('energy.costToday').toLowerCase()}
          </div>
        </div>
        <div className="energyStat">
          <div className="energyStat__label">{t('energy.month')}</div>
          <div className="energyStat__value">
            {energy.monthKwh.toFixed(1)}
            <small>kWh</small>
          </div>
          <div className="energyStat__foot">
            {(energy.monthKwh * energy.pricePerKwh).toFixed(2)} {energy.currency}
          </div>
        </div>
        <div className="energyStat">
          <div className="energyStat__label">{t('energy.price')}</div>
          <div className="energyStat__value">
            {energy.pricePerKwh.toFixed(2)}
            <small>{energy.currency}/kWh</small>
          </div>
          <div className="energyStat__foot">{t('energy.note').split('.')[0]}</div>
        </div>
      </div>

      <div className="chartCard">
        <div className="miniCard__head">
          <span className="miniCard__title">
            <Leaf size={13} /> {t('energy.history')}
          </span>
          <span className="chipMini">
            {t('energy.avg')} {(energy.history.reduce((sum, point) => sum + point.kwh, 0) / energy.history.length).toFixed(2)} kWh
          </span>
        </div>
        <div className="bars">
          {energy.history.map((point, index) => {
            const isToday = index === energy.history.length - 1;
            return (
              <div className="barCol" key={point.date}>
                <span className="bar__value">{point.kwh.toFixed(2)}</span>
                <div
                  className="bar"
                  data-today={isToday}
                  style={{ height: `${Math.max(4, (point.kwh / maxDay) * 100)}%` }}
                  title={`${point.date}: ${point.kwh.toFixed(2)} kWh`}
                />
                <span className="bar__label">{dayLabel(point.date, index)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="twoCol" style={{ marginTop: 14 }}>
        <div className="chartCard" style={{ marginTop: 0 }}>
          <div className="miniCard__head">
            <span className="miniCard__title">
              <Activity size={13} /> {t('energy.liveChart')}
            </span>
            <span className="chipMini">{liveAvg} W {t('energy.avg').toLowerCase()}</span>
          </div>
          <Sparkline values={energy.liveSeries} height={96} />
          <div className="miniGrid">
            <div className="statBox">
              <div className="statBox__label">{t('energy.peak')}</div>
              <div className="statBox__value">{Math.round(liveMax)} W</div>
            </div>
            <div className="statBox">
              <div className="statBox__label">{t('energy.avg')}</div>
              <div className="statBox__value">{liveAvg} W</div>
            </div>
          </div>
        </div>

        <div className="chartCard" style={{ marginTop: 0 }}>
          <div className="miniCard__head">
            <span className="miniCard__title">
              <Gauge size={13} /> {t('energy.breakdown')}
            </span>
            <span className="chipMini">
              <Zap size={10} /> {energy.liveW} W
            </span>
          </div>
          <div className="breakdown" style={{ marginTop: 4, gap: 11 }}>
            {energy.breakdown.slice(0, 8).map((item) => (
              <div className="breakdownRow" key={item.deviceId} style={{ gridTemplateColumns: '92px 1fr 64px' }}>
                <span>{localized(item.name, locale)}</span>
                <span className="barTrack">
                  <span
                    className="barFill"
                    style={{
                      width: `${(item.w / maxDevice) * 100}%`,
                      '--c': item.w > 100 ? '#f59e0b' : '#0a84ff',
                    } as React.CSSProperties}
                  />
                </span>
                <span>
                  {Math.round(item.w)} W · {Math.round((item.w / totalLive) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="note" style={{ marginTop: 16 }}>
        {t('energy.note')}
      </p>
    </div>
  );
}
