import type { JSX } from 'preact';
import type { AccountType } from '../core';

// Small inline SVGs imitating the SF Symbols named in docs/spec/design.md.
const paths: Record<string, JSX.Element> = {
  house: <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></>,
  chart: <path d="M5.5 20v-8M12 20V4M18.5 20v-5" strokeWidth="3.4" />,
  gear: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="6.6" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="M15 5l-7 7 7 7" />,
  right: <path d="M9 5l7 7-7 7" />,
  down: <path d="M5 9l7 7 7-7" />,
  up: <path d="M5 15l7-7 7 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  backspace: <><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></>,
  wallet: <><path d="M5 7V6a2 2 0 0 1 2-2h10v3" /><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="16.5" cy="13.5" r="1.1" fill="currentColor" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /></>,
  calculator: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8.5 13h3M10 11.5v3M13 14h3M8.5 18h3M13 18h3" /></>,
  bank: <path d="M3 9l9-5 9 5M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7M3 20h18" />,
  savings: <><rect x="3" y="7" width="18" height="10" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 12h.01M17.5 12h.01" /></>,
  credit: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M6.5 15h4" /></>,
  cash: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5C14 8.5 13 8 12 8c-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5" /></>,
  investment: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  loan: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v8M8.5 12.5l3.5 3.5 3.5-3.5" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11h14V8M10 12.5h4" /></>,
  restore: <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />,
  bend: <path d="M6 5v7a2 2 0 0 0 2 2h9M13 10.5l4 3.5-4 3.5" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} fill-opacity={filled ? 0.3 : undefined}
      stroke="currentColor" stroke-width={filled ? 2.2 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export const accountIcon = (t: AccountType): IconName => t;
