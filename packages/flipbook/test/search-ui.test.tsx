import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Flipbook } from "../src/index";
import * as fake from "./fake-page-flip";
import { makeManifest } from "./helpers";

vi.mock("page-flip", async () => {
  const { FakePageFlip } = await import("./fake-page-flip");
  return { PageFlip: FakePageFlip };
});

const MANIFEST_URL = "https://cdn.example.com/flipbooks/abc/manifest.json";
const SEARCH_URL = "https://cdn.example.com/flipbooks/abc/search.json";

const PAGES = [
  { page: 1, text: "Nos destinations" },
  { page: 2, text: "Séjour à l’Hôtel Été, petit déjeuner" },
  { page: 3, text: "Visite de Paris" },
  { page: 4, text: "Hôtel à Paris" },
  { page: 5, text: "" },
  { page: 6, text: "Plage" },
];

const json = (data: unknown): Response =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

function stubRoutes(searchData: unknown = PAGES) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === SEARCH_URL) return json(searchData);
    return json(makeManifest(6));
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    searchCalls: () => fetchMock.mock.calls.filter(([url]) => String(url) === SEARCH_URL).length,
  };
}

async function ready() {
  await waitFor(() => {
    expect(document.querySelector('.vgf-root[data-status="ready"]')).not.toBeNull();
    expect(document.querySelector(".vgf-page-img[src]")).not.toBeNull();
  });
  return fake.instances.filter((instance) => !instance.destroyed)[0]!;
}

const searchButton = () => screen.getByRole("button", { name: "Rechercher" });
const input = () => screen.getByRole("combobox", { name: "Rechercher dans le document" });
const options = () => screen.queryAllByRole("option");

beforeEach(() => {
  fake.instances.length = 0;
  window.localStorage.clear();
  // A desktop-sized reader: two pages, search as a side panel.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(700);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("in-book search", () => {
  it("fetches search.json only when the panel first opens, then keeps it", async () => {
    const { searchCalls } = stubRoutes();
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await ready();
    expect(searchCalls()).toBe(0);

    await user.click(searchButton());
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
    expect(searchCalls()).toBe(1);
    expect(document.activeElement).toBe(input());

    // Close and open again: no second request.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).toBe(searchButton());
    await user.click(searchButton());
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
    expect(searchCalls()).toBe(1);
  });

  it("requests a slow search.json exactly once (no request loop)", async () => {
    let searchCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: RequestInfo | URL) => {
        if (String(request) !== SEARCH_URL) return json(makeManifest(6));
        searchCalls++;
        // A real network: the answer comes after React has re-rendered a few times.
        await new Promise((resolve) => setTimeout(resolve, 80));
        return json(PAGES);
      }),
    );
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await ready();
    await user.click(searchButton());
    // Typing is possible while the index loads; results come once it is there.
    await user.type(input(), "paris");
    await waitFor(() => expect(options()).toHaveLength(2), { timeout: 2000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(searchCalls).toBe(1);
  });

  it("finds accented words, lists pages in order and jumps on click", async () => {
    stubRoutes();
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    const instance = await ready();

    await user.click(searchButton());
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
    await user.type(input(), "hotel");
    await waitFor(() => expect(options()).toHaveLength(2));

    const [first, second] = options();
    expect(first?.textContent).toContain("Page 2");
    expect(first?.textContent).toContain("1 occurrence");
    expect(first?.querySelector("mark")?.textContent).toBe("Hôtel");
    expect(first?.querySelector(".vgf-search-snippet")?.getAttribute("dir")).toBe("auto");
    expect(second?.textContent).toContain("Page 4");
    expect(document.querySelector("[aria-live='polite']:last-of-type")?.textContent).toBe(
      "2 résultats",
    );

    await user.click(second!);
    expect(instance.turnCalls).toEqual([3]);
    // Wide reader: the panel stays open, the opened row is active.
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("needs every word (AND) and at least 2 characters", async () => {
    stubRoutes();
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await ready();
    await user.click(searchButton());
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));

    await user.type(input(), "p");
    await waitFor(() =>
      expect(document.querySelector(".vgf-search-message")?.textContent).toBe(
        "Saisissez au moins 2 caractères.",
      ),
    );
    expect(options()).toHaveLength(0);

    await user.clear(input());
    await user.type(input(), "hotel paris");
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(options()[0]?.textContent).toContain("Page 4");

    await user.clear(input());
    await user.type(input(), "zanzibar");
    // Shown in the panel (and announced in the live region).
    await waitFor(() =>
      expect(document.querySelector(".vgf-search-message")?.textContent).toBe("Aucun résultat."),
    );
  });

  it("moves through results with ↑ ↓ and opens one with Enter", async () => {
    stubRoutes();
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    const instance = await ready();
    await user.click(searchButton());
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
    await user.type(input(), "paris");
    await waitFor(() => expect(options()).toHaveLength(2));

    expect(options()[0]?.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[1]?.id);
    await user.keyboard("{ArrowDown}{ArrowUp}{ArrowDown}{Enter}");
    expect(instance.turnCalls).toEqual([3]);
    // Arrow keys stayed in the list: no page was turned by them.
    expect(instance.nextCalls).toHaveLength(0);
    expect(instance.prevCalls).toHaveLength(0);
  });

  it("closes the bottom sheet after a jump on narrow readers", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(640);
    stubRoutes();
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await waitFor(() => {
      expect(document.querySelector('.vgf-root[data-status="ready"]')).not.toBeNull();
    });
    await user.click(searchButton());
    expect(document.querySelector('.vgf-search[data-layout="sheet"]')).not.toBeNull();
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
    await user.type(input(), "plage");
    await waitFor(() => expect(options()).toHaveLength(1));
    await user.click(options()[0]!);
    expect(document.querySelector(".vgf-search")).toBeNull();
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("6"));
  });

  it("shows 'search unavailable' instead of an input for a scanned book", async () => {
    stubRoutes([
      { page: 1, text: "" },
      { page: 2, text: "   " },
    ]);
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await ready();
    await user.click(searchButton());
    expect(
      await screen.findByText("La recherche n’est pas disponible pour ce document."),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("opens with Ctrl/Cmd+F only while the reader has focus", async () => {
    const { searchCalls } = stubRoutes();
    render(
      <>
        <input aria-label="Host field" />
        <Flipbook manifestUrl={MANIFEST_URL} />
      </>,
    );
    await ready();

    // Focus on the host page: the browser's find must run (event not cancelled).
    const host = screen.getByLabelText("Host field");
    host.focus();
    expect(fireEvent.keyDown(host, { key: "f", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: "f", metaKey: true })).toBe(true);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(searchCalls()).toBe(0);

    // Focus inside the reader: Ctrl+F opens the reader's search instead.
    const root = screen.getByRole("region", { name: "Test book" });
    root.focus();
    let notCancelled = true;
    act(() => {
      notCancelled = fireEvent.keyDown(root, { key: "f", ctrlKey: true });
    });
    expect(notCancelled).toBe(false);
    await waitFor(() => expect(input()).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("shows an error with a retry when search.json cannot be loaded", async () => {
    let fail = true;
    const fetchMock = vi.fn(async (request: RequestInfo | URL) => {
      if (String(request) === SEARCH_URL) {
        return fail ? new Response("nope", { status: 500 }) : json(PAGES);
      }
      return json(makeManifest(6));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Flipbook manifestUrl={MANIFEST_URL} />);
    await ready();
    await user.click(searchButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "La recherche n’a pas pu être chargée.",
    );
    fail = false;
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(input()).toHaveProperty("disabled", false));
  });
});
