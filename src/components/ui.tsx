import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useApp } from '../lib/store';
import { cx } from '../lib/format';

/* ------------------------------------------------------------------ switch */

export function Switch({
  checked,
  onChange,
  label,
  size = 'sm',
  accent,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  size?: 'sm' | 'lg';
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('switch', size === 'lg' && 'switch--lg')}
      style={accent ? ({ '--c': accent } as React.CSSProperties) : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
    />
  );
}

/* ------------------------------------------------------------------ slider */

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  accent,
  variant = 'default',
  labels,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  accent?: string;
  variant?: 'default' | 'warm';
  labels?: [string, string];
}) {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(value);

  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  const percent = ((local - min) / (max - min)) * 100;

  const push = (next: number, immediate = false) => {
    setLocal(next);
    latest.current = next;
    window.clearTimeout(timer.current);
    if (immediate) {
      dragging.current = false;
      onChange(next);
      return;
    }
    timer.current = window.setTimeout(() => onChange(latest.current), 110);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div>
      <input
        type="range"
        className={cx('slider', variant === 'warm' && 'slider--warm')}
        style={{ '--p': `${percent}%`, ...(accent ? { '--c': accent } : {}) } as React.CSSProperties}
        min={min}
        max={max}
        step={step}
        value={local}
        aria-label={label}
        onPointerDown={(event) => {
          dragging.current = true;
          event.stopPropagation();
        }}
        onPointerUp={() => push(local, true)}
        onKeyUp={() => push(local, true)}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => push(Number(event.target.value))}
      />
      {labels && (
        <div className="slider__labels">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          data-active={option.value === value}
          onClick={(event) => {
            event.stopPropagation();
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- ring */

export function Ring({
  value,
  color = '#0a84ff',
  size = 104,
  stroke = 9,
  label,
  sublabel,
}: {
  value: number;
  color?: string;
  size?: number;
  stroke?: number;
  label: string;
  sublabel?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <div className="ringWrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22,0.8,0.3,1)' }}
        />
      </svg>
      <div className="ringLabel">
        <strong>{label}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- sparkline */

export function Sparkline({ values, color = 'var(--accent)', height = 46 }: { values: number[]; color?: string; height?: number }) {
  const gradientId = useId().replace(/:/g, '');
  if (!values.length) return <svg className="spark" viewBox="0 0 100 46" style={{ height }} />;
  const max = Math.max(...values) * 1.15 || 1;
  const min = Math.min(...values) * 0.85;
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * 100;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M ${points.join(' L ')}`;
  const area = `${line} L 100,${height} L 0,${height} Z`;
  return (
    <svg className="spark" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} className="sparkLine" stroke={color} />
    </svg>
  );
}

/* ----------------------------------------------------------------- overlays */

export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel}>
        <div className="grabber" />
        {children}
      </div>
    </>,
    document.body,
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="sheet__close modal__close" onClick={onClose} aria-label="Zamknij">
          <X size={16} />
        </button>
        {children}
      </div>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------------------- toasts */

export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) => window.setTimeout(() => dismiss(toast.id), 3800));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  if (!toasts.length) return null;

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cx('toast', `toast--${toast.tone}`)} onClick={() => dismiss(toast.id)}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
