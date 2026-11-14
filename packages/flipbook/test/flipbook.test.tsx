import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Flipbook, labelsEn } from "../src/index";
import { makeManifest } from "./helpers";

import * as fake from "./fake-page-flip";

vi.mock("page-flip", async () => {
  const { FakePageFlip } = await import("./fake-page-flip");
  return { PageFlip: FakePageFlip };
});

const MANIFEST_URL = "https://cdn.example.com/flipbooks/abc/manifest.json";
const BASE = "https://cdn.example.com/flipbooks/abc/";

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Wait until the reader has created its (only live) page-flip instance. */
async function readyInstance() {
  await waitFor(() => {
    expect(document.querySelector('.vgf-root[data-status="ready"]')).not.toBeNull();
    // The load plan is applied by an effect right after that render: wait for it too.
    expect(document.querySelector(".vgf-page-img[src]")).not.toBeNull();
  });
  const live = fake.instances.filter((instance) => !instance.destroyed);
  expect(live).toHaveLength(1);
  return live[0]!;
}

const pageImage = (n: number): HTMLImageElement =>
  document.querySelector<HTMLImageElement>(`.vgf-page[data-page="${n}"] .vgf-page-img`)!;
const pageThumb = (n: number): HTMLImageElement =>
  document.querySelector<HTMLImageElement>(`.vgf-page[data-page="${n}"] .vgf-page-thumb`)!;
const indicator = (): HTMLInputElement => screen.getByRole("textbox") as HTMLInputElement;

beforeEach(() => {
  fake.instances.length = 0;
  window.localStorage.clear();
  // jsdom lays nothing out: give the stage a desktop-like size (two-page mode).
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(700);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("<Flipbook />", () => {
  it("loads the manifest, opens on the cover and lazy-loads around it", async () => {
    const fetchMock = stubFetch(() => jsonResponse(makeManifest(20)));
    const onReady = vi.fn();
    render(<Flipbook manifestUrl={MANIFEST_URL} onReady={onReady} />);

    expect(document.querySelector('.vgf-root[data-status="loading"]')).not.toBeNull();
    const instance = await readyInstance();

    expect(fetchMock).toHaveBeenCalledWith(MANIFEST_URL, expect.anything());
    expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ pageCount: 20 }));
    expect(screen.getByRole("region", { name: "Test book" })).toBeTruthy();

    // page-flip settings the behaviour depends on.
    expect(instance.settings).toMatchObject({
      startPage: 0,
      showCover: true,
      usePortrait: true,
      mobileScrollSupport: true,
    });
    expect(document.querySelectorAll(".vgf-page")).toHaveLength(20);
    expect(pageImage(1).alt).toBe("Page 1");

    // Paths are resolved against the manifest URL.
    expect(pageImage(1).getAttribute("src")).toBe(`${BASE}pages/001.webp`);
    expect(pageThumb(1).getAttribute("src")).toBe(`${BASE}pages/001-thumb.webp`);
    // Thumbs only within ±6 of the cover, nothing beyond, standard for the cover alone.
    expect(pageImage(2).hasAttribute("src")).toBe(false);
    expect(pageThumb(7).getAttribute("src")).toBe(`${BASE}pages/007-thumb.webp`);
    expect(pageThumb(8).hasAttribute("src")).toBe(false);
    // Zoom images are never requested by the book.
    expect(document.querySelector('img[src*="-zoom"]')).toBeNull();
    expect(indicator().value).toBe("1");
  });

  it("follows page-flip: indicator, live region, onPageChange and the ±2 window", async () => {
    stubFetch(() => jsonResponse(makeManifest(20)));
    const onPageChange = vi.fn();
    render(<Flipbook manifestUrl={MANIFEST_URL} onPageChange={onPageChange} />);
    const instance = await readyInstance();

    act(() => instance.emit("flip", 3)); // 0-based index of page 4
    await waitFor(() => expect(indicator().value).toBe("4–5"));

    expect(onPageChange).toHaveBeenCalledWith(4);
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Page 4–5 sur 20");
    for (const n of [2, 3, 4, 5, 6, 7]) {
      expect(pageImage(n).getAttribute("src")).toBe(
        `${BASE}pages/${String(n).padStart(3, "0")}.webp`,
      );
    }
    expect(pageImage(1).hasAttribute("src")).toBe(false);
    expect(pageImage(8).hasAttribute("src")).toBe(false);
    expect(pageThumb(11).hasAttribute("src")).toBe(true);
    expect(pageThumb(12).hasAttribute("src")).toBe(false);
  });

  it("jumps to the page typed in the indicator", async () => {
    stubFetch(() => jsonResponse(makeManifest(20)));
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    const instance = await readyInstance();

    await user.click(indicator());
    await user.keyboard("12{Enter}");
    expect(instance.turnCalls).toEqual([11]);
    await waitFor(() => expect(indicator().value).toBe("12–13"));

    // Out of range is clamped; text without a number changes nothing.
    await user.click(indicator());
    await user.keyboard("999{Enter}");
    expect(instance.turnCalls).toEqual([11, 19]);
    await user.click(indicator());
    await user.keyboard("abc{Enter}");
    expect(instance.turnCalls).toEqual([11, 19]);
    expect(indicator().value).toBe("20");
  });

  it("uses the keyboard only while focus is inside the reader", async () => {
    stubFetch(() => jsonResponse(makeManifest(20)));
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Host page button</button>
        <Flipbook manifestUrl={MANIFEST_URL} />
      </>,
    );
    const instance = await readyInstance();

    // Focus is on the host page: nothing happens.
    screen.getByText("Host page button").focus();
    await user.keyboard("{ArrowRight}{ArrowLeft}{End}");
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(instance.nextCalls).toHaveLength(0);
    expect(instance.prevCalls).toHaveLength(0);
    expect(instance.turnCalls).toHaveLength(0);

    // Focus inside the reader: the keys work.
    screen.getByRole("region", { name: "Test book" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(instance.nextCalls).toHaveLength(1);
    await user.keyboard("{ArrowLeft}");
    expect(instance.prevCalls).toHaveLength(1);
    await user.keyboard("{End}");
    expect(instance.turnCalls).toEqual([19]);
    await user.keyboard("{Home}");
    expect(instance.turnCalls).toEqual([19, 0]);
  });

  it("turns pages from the toolbar and never flips while zoomed", async () => {
    stubFetch(() => jsonResponse(makeManifest(20)));
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    const instance = await readyInstance();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1200, 700),
    );

    const next = screen.getByRole("button", { name: "Page suivante" });
    expect(
      (screen.getByRole("button", { name: "Page précédente" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(next);
    expect(instance.nextCalls).toHaveLength(1);

    // Zoom in: the overlay requests the zoom image of the visible page, flipping is disabled.
    await user.click(screen.getByRole("button", { name: "Zoom avant" }));
    expect(document.querySelector(".vgf-zoom-img")?.getAttribute("src")).toBe(
      `${BASE}pages/001-zoom.webp`,
    );
    expect((next as HTMLButtonElement).disabled).toBe(true);
    screen.getByRole("region", { name: "Test book" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(instance.nextCalls).toHaveLength(1);

    // Escape returns to the book.
    await user.keyboard("{Escape}");
    expect(document.querySelector(".vgf-zoom")).toBeNull();
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows thumbnails with the current page marked and jumps on click", async () => {
    stubFetch(() => jsonResponse(makeManifest(20)));
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    const instance = await readyInstance();

    await user.click(screen.getByRole("button", { name: "Vignettes" }));
    const thumbs = document.querySelectorAll<HTMLElement>(".vgf-thumb");
    expect(thumbs).toHaveLength(20);
    expect(thumbs[0]?.getAttribute("aria-current")).toBe("page");
    expect(thumbs[0]?.querySelector("img")?.getAttribute("loading")).toBe("lazy");

    await user.click(thumbs[8]!);
    expect(instance.turnCalls).toEqual([8]);
    await waitFor(() => expect(thumbs[8]?.getAttribute("aria-current")).toBe("page"));
  });

  it("remembers the sound toggle in localStorage", async () => {
    stubFetch(() => jsonResponse(makeManifest(4)));
    const user = userEvent.setup();
    const { unmount } = render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await readyInstance();

    await user.click(screen.getByRole("button", { name: "Couper le son" }));
    expect(window.localStorage.getItem("vgf:sound")).toBe("off");
    expect(screen.getByRole("button", { name: "Activer le son" })).toBeTruthy();

    unmount();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await readyInstance();
    expect(screen.getByRole("button", { name: "Activer le son" })).toBeTruthy();
  });

  it("rejects a manifest that is not version 1 with the error state", async () => {
    stubFetch(() => jsonResponse({ ...makeManifest(4), version: 2 }));
    render(<Flipbook manifestUrl={MANIFEST_URL} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Ce document utilise un format non pris en charge.");
    expect(document.querySelector('.vgf-root[data-status="error"]')).not.toBeNull();
    expect(fake.instances).toHaveLength(0);
  });

  it("shows the error state when the manifest is unreachable, and can retry", async () => {
    let fail = true;
    stubFetch(() => (fail ? jsonResponse({}, 404) : jsonResponse(makeManifest(4))));
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Impossible de charger ce document.");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await readyInstance();
  });

  it("creates a single book in React Strict Mode and destroys it on unmount", async () => {
    stubFetch(() => jsonResponse(makeManifest(6)));
    const { unmount } = render(
      <StrictMode>
        <Flipbook manifestUrl={MANIFEST_URL} />
      </StrictMode>,
    );
    const instance = await readyInstance();
    // Give a second, unwanted instance every chance to appear.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(fake.instances).toHaveLength(1);
    expect(document.querySelectorAll(".vgf-book")).toHaveLength(1);

    unmount();
    expect(instance.destroyed).toBe(true);
  });

  it("takes UI text from labels", async () => {
    stubFetch(() => jsonResponse(makeManifest(4)));
    const { unmount } = render(<Flipbook manifestUrl={MANIFEST_URL} labels={labelsEn} />);
    await readyInstance();
    expect(screen.getByRole("button", { name: "Next page" })).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Document toolbar" })).toBeTruthy();
    expect(pageImage(1).alt).toBe("Page 1");
    unmount();

    // A partial override keeps French for the rest.
    render(
      <Flipbook
        manifestUrl={MANIFEST_URL}
        labels={{ next: "Suivant !", pageAlt: "Feuille {n}" }}
      />,
    );
    await readyInstance();
    expect(screen.getByRole("button", { name: "Suivant !" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page précédente" })).toBeTruthy();
    expect(pageImage(2).alt).toBe("Feuille 2");
  });

  it("accepts a loaded manifest with a baseUrl, and a startPage", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    render(
      <Flipbook
        manifest={makeManifest(10)}
        baseUrl="https://cdn.example.com/books/xyz"
        startPage={6}
      />,
    );
    const instance = await readyInstance();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(instance.settings.startPage).toBe(5);
    expect(indicator().value).toBe("6–7");
    expect(pageImage(6).getAttribute("src")).toBe(
      "https://cdn.example.com/books/xyz/pages/006.webp",
    );
  });

  it("uses its own page turn, not page-flip, on a phone in portrait", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(640);
    stubFetch(() => jsonResponse(makeManifest(6)));
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);

    await waitFor(() => {
      expect(document.querySelector('.vgf-root[data-status="ready"]')).not.toBeNull();
    });
    expect(document.querySelector(".vgf-root")?.getAttribute("data-mode")).toBe("single");
    expect(document.querySelector(".vgf-book--single")).not.toBeNull();
    expect(fake.instances).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Page suivante" }));
    await waitFor(() => expect(indicator().value).toBe("2"), { timeout: 2000 });
  });

  it("offers the original PDF as a <slug>.pdf download", async () => {
    stubFetch(() => jsonResponse(makeManifest(4)));
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await readyInstance();
    const link = screen.getByRole("link", { name: "Télécharger le PDF" });
    expect(link.getAttribute("href")).toBe(`${BASE}original.pdf`);
    expect(link.getAttribute("download")).toBe("test-book.pdf");
  });

  it("hides the download and search buttons when turned off", async () => {
    stubFetch(() => jsonResponse(makeManifest(4)));
    render(<Flipbook manifestUrl={MANIFEST_URL} download={false} search={false} />);
    await readyInstance();
    expect(screen.queryByRole("link", { name: "Télécharger le PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechercher" })).toBeNull();
    // Ctrl+F then belongs to the browser even inside the reader.
    const root = screen.getByRole("region", { name: "Test book" });
    root.focus();
    expect(fireEvent.keyDown(root, { key: "f", ctrlKey: true })).toBe(true);
  });
});
