import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { Icon } from './icons';

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div class="seg" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={v === value} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button class={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>;
}

export function MonthNav({ title, onPrev, onNext, nextDisabled, variant }: {
  title: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean; variant: 'round' | 'plain';
}) {
  return (
    <div class={'monthnav ' + variant}>
      <button aria-label="Previous month" onClick={onPrev}><Icon name="left" size={16} /></button>
      {variant === 'plain' && <span>{title}</span>}
      <button aria-label="Next month" disabled={nextDisabled} onClick={onNext}><Icon name="right" size={16} /></button>
    </div>
  );
}

export const SectionHeader = ({ children }: { children: ComponentChildren }) => <div class="section-h">{children}</div>;

/** Bottom sheet: dimmed backdrop (tap to close), grabber (tap or drag down to close). */
export function Sheet({ onClose, tall, children }: { onClose: () => void; tall: boolean; children: ComponentChildren }) {
  const y0 = useRef<number | null>(null);
  return (
    <>
      <div class="backdrop" onClick={onClose} />
      <div class={'sheet ' + (tall ? 'tall' : 'short')} role="dialog" aria-modal="true">
        <div class="grabber-area" onClick={onClose}
          onTouchStart={(e) => { y0.current = e.touches[0]!.clientY; }}
          onTouchEnd={(e) => { if (y0.current !== null && e.changedTouches[0]!.clientY - y0.current > 50) onClose(); y0.current = null; }}>
          <div class="grabber" />
        </div>
        {children}
      </div>
    </>
  );
}

/** Ref callback: focus an input once when it appears (iOS ignores autofocus). */
export const focusOnce = (el: HTMLInputElement | null) => { if (el && !el.dataset.f) { el.dataset.f = '1'; el.focus(); } };
