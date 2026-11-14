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
  /** Toolbar button that downloads the original PDF. */
  download: string;
  /** Toolbar button and panel title. */
  search: string;
  searchInput: string;
  searchPlaceholder: string;
  searchClose: string;
  searchLoading: string;
  searchError: string;
  /** Shown instead of the input when no page has text (scanned PDF). */
  searchUnavailable: string;
  searchMinChars: string;
  searchNoResults: string;
  searchResultsOne: string;
  /** `{count}` results. */
  searchResults: string;
  /** Shown when the results are capped, `{max}` = 100. */
  searchCapped: string;
  searchMatchesOne: string;
  /** `{count}` occurrences on one page. */
  searchMatches: string;
  /** Result row title, `{n}` = page number. */
  searchResultPage: string;
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
  download: "Télécharger le PDF",
  search: "Rechercher",
  searchInput: "Rechercher dans le document",
  searchPlaceholder: "Rechercher…",
  searchClose: "Fermer la recherche",
  searchLoading: "Chargement de la recherche…",
  searchError: "La recherche n’a pas pu être chargée.",
  searchUnavailable: "La recherche n’est pas disponible pour ce document.",
  searchMinChars: "Saisissez au moins 2 caractères.",
  searchNoResults: "Aucun résultat.",
  searchResultsOne: "1 résultat",
  searchResults: "{count} résultats",
  searchCapped: "Affichage des {max} premiers résultats",
  searchMatchesOne: "1 occurrence",
  searchMatches: "{count} occurrences",
  searchResultPage: "Page {n}",
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
  download: "Download PDF",
  search: "Search",
  searchInput: "Search the document",
  searchPlaceholder: "Search…",
  searchClose: "Close search",
  searchLoading: "Loading search…",
  searchError: "Search could not be loaded.",
  searchUnavailable: "Search is not available for this document.",
  searchMinChars: "Type at least 2 characters.",
  searchNoResults: "No results.",
  searchResultsOne: "1 result",
  searchResults: "{count} results",
  searchCapped: "Showing the first {max} results",
  searchMatchesOne: "1 match",
  searchMatches: "{count} matches",
  searchResultPage: "Page {n}",
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
