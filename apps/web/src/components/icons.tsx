import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'clipboard'
  | 'inbox'
  | 'boxes'
  | 'truck'
  | 'building'
  | 'warehouse'
  | 'van'
  | 'users'
  | 'key'
  | 'logout'
  | 'menu'
  | 'x'
  | 'plus'
  | 'chevron'
  // Sayfa içi eylemler — emoji yerine (emoji her işletim sisteminde farklı çiziliyor
  // ve aynı ekrandaki çizgi ikonlarla uyuşmuyordu)
  | 'printer'
  | 'camera'
  | 'qr'
  | 'package'
  | 'calendar'
  | 'alert'
  | 'check'
  | 'undo'
  | 'pin'
  | 'edit'
  | 'trash'
  | 'search'
  | 'tag';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" />,
  clipboard: (
    <>
      <rect x="6" y="4.5" width="12" height="15.5" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 12l2-7h12l2 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z" />
      <path d="M4 12h4l1 2h6l1-2h4" />
    </>
  ),
  boxes: (
    <>
      <rect x="3" y="13" width="7.5" height="7" rx="1" />
      <rect x="13.5" y="13" width="7.5" height="7" rx="1" />
      <rect x="8.25" y="4" width="7.5" height="7" rx="1" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7a1 1 0 0 1 1-1h9v9H3z" />
      <path d="M13 9h3.5l3.5 3.5V15h-7z" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
    </>
  ),
  building: (
    <>
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M15 9h3a1 1 0 0 1 1 1v11" />
      <path d="M3 21h18" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 21V9.5L12 4l9 5.5V21" />
      <path d="M3 21h18" />
      <path d="M7 21v-6h10v6" />
      <path d="M7 15h10" />
    </>
  ),
  van: (
    <>
      <path d="M2 8a1 1 0 0 1 1-1h8v9H2z" />
      <path d="M11 10h4.5l3.5 3.5V15h-8z" />
      <circle cx="6" cy="17.5" r="1.7" />
      <circle cx="16.5" cy="17.5" r="1.7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M16.5 13.2A5.5 5.5 0 0 1 20.5 19" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M18.5 12v3M16 12v2.2" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 8l-4 4 4 4M5 12h11" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M6 18 18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  printer: (
    <>
      <path d="M7 9V4h10v5" />
      <path d="M5 9h14a2 2 0 0 1 2 2v5h-4" />
      <path d="M7 16H3v-5a2 2 0 0 1 2-2" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />
    </>
  ),
  package: (
    <>
      <path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 20H3Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  check: <path d="M5 12.5 10 17.5 19 7" />,
  undo: (
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10H8" />
      <path d="M8 5 4 9l4 4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  tag: (
    <>
      <path d="M4 11.5V5a1 1 0 0 1 1-1h6.5L20 12.5 12.5 20Z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
};

export function Icon({
  name,
  className,
  ...props
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
