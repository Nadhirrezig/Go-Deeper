import type { PageLevel } from "./lazy-load";
import type { ResolvedBook } from "./types";

/** One page of the book: a thumb placeholder under the standard image. */
export interface PageElement {
  element: HTMLElement;
  thumb: HTMLImageElement;
  image: HTMLImageElement;
  level: PageLevel;
}

export const LOADED_CLASS = "vgf-loaded";

export function createPage(page: number, alt: string): PageElement {
  const element = document.createElement("div");
  element.className = "vgf-page";
  element.dataset.page = String(page);

  // Blurred thumb underneath, standard image fading in on top once loaded.
  const thumb = document.createElement("img");
  thumb.className = "vgf-page-thumb";
  thumb.alt = "";
  thumb.setAttribute("aria-hidden", "true");
  thumb.decoding = "async";
  thumb.draggable = false;

  const image = document.createElement("img");
  image.className = "vgf-page-img";
  image.alt = alt;
  image.decoding = "async";
  image.draggable = false;
  image.addEventListener("load", () => image.classList.add(LOADED_CLASS));

  element.append(thumb, image);
  return { element, thumb, image, level: "none" };
}

function setSource(img: HTMLImageElement, url: string | null): void {
  if (url === null) {
    if (!img.hasAttribute("src")) return;
    img.removeAttribute("src");
    img.classList.remove(LOADED_CLASS);
  } else if (img.getAttribute("src") !== url) {
    img.classList.remove(LOADED_CLASS);
    img.src = url;
  }
}

/** Apply a load plan (index 0 = page 1); `order` lists pages in request order. */
export function applyLevels(
  pages: readonly PageElement[],
  book: ResolvedBook,
  levels: readonly PageLevel[],
  order: readonly number[],
): void {
  for (const n of order) {
    const page = pages[n - 1];
    const source = book.pages[n - 1];
    const level = levels[n - 1] ?? "none";
    if (!page || !source || page.level === level) continue;
    page.level = level;
    setSource(page.thumb, level === "none" ? null : source.thumb);
    setSource(page.image, level === "standard" ? source.standard : null);
  }
}
