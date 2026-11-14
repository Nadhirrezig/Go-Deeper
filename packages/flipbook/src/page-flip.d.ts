// Minimal typings for page-flip 2.0.7 (the package ships none): only what the reader uses.
declare module "page-flip" {
  export type PageFlipState = "user_fold" | "fold_corner" | "flipping" | "read";
  export type PageFlipOrientation = "portrait" | "landscape";

  export interface PageFlipSettings {
    startPage: number;
    size: "fixed" | "stretch";
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    drawShadow: boolean;
    flippingTime: number;
    usePortrait: boolean;
    startZIndex: number;
    autoSize: boolean;
    maxShadowOpacity: number;
    showCover: boolean;
    mobileScrollSupport: boolean;
    clickEventForward: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
  }

  export interface PageFlipEvent {
    data: unknown;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(block: HTMLElement, settings: Partial<PageFlipSettings>);
    loadFromHTML(items: HTMLElement[]): void;
    on(event: string, callback: (event: PageFlipEvent) => void): this;
    update(): void;
    destroy(): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    turnToPage(pageIndex: number): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): PageFlipOrientation;
    getState(): PageFlipState;
    /** The live settings object (mutable). */
    getSettings(): PageFlipSettings;
    getRender(): { getDirection(): 0 | 1 | null };
    getUI(): object;
    userStop(position: { x: number; y: number }, isSwipe?: boolean): void;
  }
}
