import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SWIPE_OPEN, lockAxis, settleOffset, swipeOffset } from '../core';
import { Icon } from './icons';

export function Segmented<T extends string>({ value, options, onChange, label, disabled }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div class="seg" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="tab" aria-selected={v === value} class={v === value ? 'on' : ''} disabled={disabled} onClick={() => onChange(v)}>{text}</button>
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

/** Row that slides left to reveal an "Archive" button. `openId` is shared so only one row is open at a time. */
export function SwipeRow({ id, name, openId, setOpenId, onArchive, children }: {
  id: string; name: string; openId: string | null; setOpenId: (id: string | null) => void; onArchive: () => void; children: ComponentChildren;
}) {
  const open = openId === id;
  const root = useRef<HTMLDivElement>(null);
  const g = useRef({ x: 0, y: 0, start: 0, axis: null as 'h' | 'v' | null, moved: false, pid: -1 });
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    // Like iOS: a tap elsewhere only closes the row (the tap is swallowed); scrolling closes it too.
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) { e.preventDefault(); e.stopPropagation(); setOpenId(null); } };
    const scroll = () => setOpenId(null);
    document.addEventListener('click', away, true);
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('click', away, true); document.removeEventListener('scroll', scroll, true); };
  }, [open]);
  const end = (e: PointerEvent, cancel: boolean) => {
    const s = g.current;
    if (s.axis === 'h' && drag !== null) {
      const rest = cancel ? s.start : settleOffset(drag);
      if (rest !== 0) setOpenId(id); else if (open) setOpenId(null);
    }
    s.axis = null; setDrag(null);
    const el = e.currentTarget as HTMLElement; // iOS throws if we release a pointer we never captured
    if (el.hasPointerCapture?.(s.pid)) el.releasePointerCapture(s.pid);
  };
  return (
    <div class="swipe" ref={root}>
      {/* Covered by the row until it slides open; focusing it (VoiceOver, keyboard) opens the row. */}
      <button class="swipe-act" aria-label={`Archive ${name}`} onFocus={() => setOpenId(id)} onClick={onArchive}>Archive</button>
      <div class={'swipe-body' + (drag === null ? ' snap' : '')} style={{ transform: `translateX(${drag ?? (open ? -SWIPE_OPEN : 0)}px)` }}
        onPointerDown={(e) => { const s = g.current; s.x = e.clientX; s.y = e.clientY; s.start = open ? -SWIPE_OPEN : 0; s.axis = null; s.moved = false; s.pid = e.pointerId; }}
        onPointerMove={(e) => {
          const s = g.current, dx = e.clientX - s.x;
          if (s.axis === null) {
            if (!(e.buttons & 1) && e.pointerType === 'mouse') return;
            s.axis = lockAxis(dx, e.clientY - s.y);
            if (s.axis === 'h') { s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); }
          }
          if (s.axis === 'h') setDrag(swipeOffset(s.start, dx));
        }}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onClickCapture={(e) => { const s = g.current; if (s.moved || open) { e.preventDefault(); e.stopPropagation(); if (!s.moved) setOpenId(null); s.moved = false; } }}>
        {children}
      </div>
    </div>
  );
}
