import type { FlipbookManifest } from "@vipgroup/shared";
import type { FlipbookLabels } from "./labels";

/** One page per view (narrow/portrait containers) or two facing pages. */
export type ViewMode = "single" | "double";

export type FlipDirection = "forward" | "backward";

/** A manifest page with every path resolved to an absolute URL. */
export interface ResolvedPage {
  n: number;
  thumb: string;
  standard: string;
  zoom: string;
}

/** A manifest with every path resolved to an absolute URL. */
export interface ResolvedBook {
  id: string;
  slug: string;
  title: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  pdf: string;
  search: string;
  pages: ResolvedPage[];
}

interface FlipbookCommonProps {
  /** First page to show (1-based). Read once, when the book opens. Default 1. */
  startPage?: number;
  /** Page-turn sound. Default true; the user's mute choice is remembered in localStorage. */
  sound?: boolean;
  /** UI text overrides. French by default; `labelsEn` is exported too. */
  labels?: Partial<FlipbookLabels>;
  className?: string;
  /** Show the button that downloads the original PDF (as `<slug>.pdf`). Default true. */
  download?: boolean;
  /** Show in-book search (toolbar button, Ctrl/Cmd+F while the reader has focus). Default true. */
  search?: boolean;
  /** Called with the first visible page (1-based) each time the visible spread changes. */
  onPageChange?: (page: number) => void;
  onReady?: (manifest: FlipbookManifest) => void;
}

export type FlipbookProps = FlipbookCommonProps &
  (
    | {
        /** URL of `manifest.json`; relative paths in it resolve against this URL. */
        manifestUrl: string;
        manifest?: undefined;
        baseUrl?: undefined;
      }
    | {
        manifestUrl?: undefined;
        /** An already loaded manifest. */
        manifest: FlipbookManifest;
        /** URL of the book folder (the manifest's folder). */
        baseUrl: string;
      }
  );
