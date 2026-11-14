import type { ReactNode } from "react";

/** Inline SVG icons (24 × 24, stroke = currentColor). No icon library. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="vgf-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconPrevious = () => (
  <Icon>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const IconNext = () => (
  <Icon>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const IconThumbnails = () => (
  <Icon>
    <rect x="3" y="4" width="7" height="7" rx="1" />
    <rect x="14" y="4" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Icon>
);

export const IconZoomIn = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-5-5M8 11h6M11 8v6" />
  </Icon>
);

export const IconZoomOut = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-5-5M8 11h6" />
  </Icon>
);

export const IconFullscreen = () => (
  <Icon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
);

export const IconExitFullscreen = () => (
  <Icon>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
);

export const IconSoundOn = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />
  </Icon>
);

export const IconSoundOff = () => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 9.5l5 5M22 9.5l-5 5" />
  </Icon>
);

export const IconClose = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const IconSearch = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-5-5" />
  </Icon>
);

export const IconDownload = () => (
  <Icon>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);
