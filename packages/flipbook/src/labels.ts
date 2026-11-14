/** Every piece of UI text. `{n}`, `{page}` and `{total}` are replaced at render time. */
export interface FlipbookLabels {
  loading: string;
  errorLoad: string;
  errorVersion: string;
  retry: string;
  toolbar: string;
  previous: string;
  next: string;
  /** Accessible name of the page-number field. */
  pageInput: string;
  /** Image alt text, e.g. "Page {n}". */
  pageAlt: string;
  /** Live-region announcement, e.g. "Page {page} sur {total}". */
  announce: string;
  thumbnails: string;
  zoomIn: string;
  zoomOut: string;
  fullscreen: string;
  exitFullscreen: string;
  soundOn: string;
  soundOff: string;
  close: string;
}

export const labelsFr: FlipbookLabels = {
  loading: "Chargement…",
  errorLoad: "Impossible de charger ce document.",
  errorVersion: "Ce document utilise un format non pris en charge.",
  retry: "Réessayer",
  toolbar: "Barre d’outils du document",
  previous: "Page précédente",
  next: "Page suivante",
  pageInput: "Aller à la page",
  pageAlt: "Page {n}",
  announce: "Page {page} sur {total}",
  thumbnails: "Vignettes",
  zoomIn: "Zoom avant",
  zoomOut: "Zoom arrière",
  fullscreen: "Plein écran",
  exitFullscreen: "Quitter le plein écran",
  soundOn: "Activer le son",
  soundOff: "Couper le son",
  close: "Fermer",
};

export const labelsEn: FlipbookLabels = {
  loading: "Loading…",
  errorLoad: "This document could not be loaded.",
  errorVersion: "This document uses an unsupported format.",
  retry: "Try again",
  toolbar: "Document toolbar",
  previous: "Previous page",
  next: "Next page",
  pageInput: "Go to page",
  pageAlt: "Page {n}",
  announce: "Page {page} of {total}",
  thumbnails: "Thumbnails",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  soundOn: "Turn sound on",
  soundOff: "Turn sound off",
  close: "Close",
};

export function mergeLabels(overrides?: Partial<FlipbookLabels>): FlipbookLabels {
  return overrides ? { ...labelsFr, ...overrides } : labelsFr;
}

/** Replace `{name}` placeholders. Unknown placeholders are left as they are. */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
