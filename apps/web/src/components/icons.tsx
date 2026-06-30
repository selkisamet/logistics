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
  | 'chevron';

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
