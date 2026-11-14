import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildIndex, isSearchable, parseQuery, parseSearchJson, searchPages } from "./search";
import type { IndexedPage, SearchOutcome } from "./search";
import type { SearchStatus } from "./search-panel";

/** Delay between the last keystroke and the search. */
export const SEARCH_DEBOUNCE_MS = 200;

type IndexState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; index: IndexedPage[] };

export interface BookSearch {
  status: SearchStatus;
  /** Fetch `search.json` if it is not loaded or loading yet. Call when the panel opens. */
  load: () => void;
  query: string;
  setQuery: (query: string) => void;
  /** Results for the debounced query; null while the query is too short or the index loads. */
  outcome: SearchOutcome | null;
  tooShort: boolean;
  retry: () => void;
}

/**
 * Search state for one book. `search.json` is fetched by the first `load()` (the panel
 * opening), then kept with its normalised index for the life of the component.
 */
export function useBookSearch(searchUrl: string): BookSearch {
  const [state, setState] = useState<IndexState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // One request at a time; aborted only when the reader unmounts.
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const load = useCallback(() => {
    if (request.current) return; // In flight.
    if (state.status !== "idle" && state.status !== "error") return; // Loaded (cached).
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    void fetch(searchUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const entries = parseSearchJson(await response.json());
        if (controller.signal.aborted) return;
        setState(
          isSearchable(entries)
            ? { status: "ready", index: buildIndex(entries) }
            : { status: "unavailable" },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
      });
  }, [searchUrl, state.status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const index = state.status === "ready" ? state.index : null;
  const outcome = useMemo(
    () => (index && parseQuery(debounced).length > 0 ? searchPages(index, debounced) : null),
    [index, debounced],
  );

  return {
    status: state.status === "idle" ? "loading" : state.status,
    load,
    query,
    setQuery,
    // While the debounce runs the previous results stay up (no flicker on each keystroke).
    outcome,
    tooShort: parseQuery(query).length === 0,
    retry: load,
  };
}
