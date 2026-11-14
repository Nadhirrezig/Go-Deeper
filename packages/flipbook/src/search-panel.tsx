import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { IconClose } from "./icons";
import { fillLabel } from "./labels";
import type { FlipbookLabels } from "./labels";
import { MAX_RESULTS } from "./search";
import type { SearchOutcome } from "./search";

/** Where the search index is: not asked yet, loading, loaded, failed, or empty (scanned PDF). */
export type SearchStatus = "loading" | "ready" | "error" | "unavailable";

export interface SearchPanelProps {
  labels: FlipbookLabels;
  /** "side": panel next to the book (wide readers). "sheet": bottom sheet (narrow readers). */
  layout: "side" | "sheet";
  status: SearchStatus;
  query: string;
  /** Results for the query once the debounce has passed; null while typing / too short. */
  outcome: SearchOutcome | null;
  /** True when the query has fewer than 2 characters. */
  tooShort: boolean;
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onActive: (index: number) => void;
  onSelect: (index: number) => void;
  onRetry: () => void;
  onClose: () => void;
}

export function resultsLabel(labels: FlipbookLabels, count: number): string {
  return count === 1 ? labels.searchResultsOne : fillLabel(labels.searchResults, { count });
}

/**
 * Search panel (side panel or bottom sheet). Combobox pattern: focus stays in the input,
 * ↑ ↓ move the active result, Enter opens it. Escape is handled by the reader (closes).
 */
export function SearchPanel(props: SearchPanelProps) {
  const { labels, layout, status, outcome, activeIndex, inputRef } = props;
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const results = outcome?.results ?? [];
  const optionId = (index: number): string => `${listId}-option-${index}`;

  // Keep the active result visible by scrolling the list only (never the host page).
  useEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  }, [activeIndex, outcome]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      props.onActive(Math.min(activeIndex + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      props.onActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      props.onSelect(activeIndex);
    } else {
      return;
    }
    event.preventDefault();
  };

  let message: string | null = null;
  if (status === "loading") message = labels.searchLoading;
  else if (status === "error") message = labels.searchError;
  else if (props.tooShort && props.query.trim()) message = labels.searchMinChars;
  else if (outcome && outcome.total === 0) message = labels.searchNoResults;

  const input =
    status === "unavailable" ? (
      <p className="vgf-search-unavailable">{labels.searchUnavailable}</p>
    ) : (
      <input
        ref={inputRef}
        className="vgf-search-input"
        type="search"
        role="combobox"
        aria-label={labels.searchInput}
        aria-controls={listId}
        aria-expanded={results.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
        placeholder={labels.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        dir="auto"
        value={props.query}
        onChange={(event) => props.onQuery(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
    );

  return (
    <section className="vgf-search" data-layout={layout} aria-label={labels.search}>
      <header className="vgf-search-header">
        <h2 className="vgf-search-title">{labels.search}</h2>
        {outcome && outcome.total > 0 && (
          <span className="vgf-search-count">{resultsLabel(labels, outcome.total)}</span>
        )}
        <button
          type="button"
          className="vgf-button"
          aria-label={labels.searchClose}
          title={labels.searchClose}
          onClick={props.onClose}
        >
          <IconClose />
        </button>
      </header>

      {/* Bottom sheet: input below the results, so the phone keyboard never hides them. */}
      {layout === "side" && <div className="vgf-search-field">{input}</div>}

      <div className="vgf-search-body">
        {message && (
          <p className="vgf-search-message" role={status === "error" ? "alert" : undefined}>
            {message}
            {status === "error" && (
              <button type="button" className="vgf-button vgf-button--text" onClick={props.onRetry}>
                {labels.retry}
              </button>
            )}
          </p>
        )}
        <ul
          ref={listRef}
          id={listId}
          className="vgf-search-results"
          role="listbox"
          aria-label={labels.search}
        >
          {results.map((result, index) => (
            <li
              key={result.page}
              id={optionId(index)}
              data-index={index}
              className="vgf-search-result"
              role="option"
              aria-selected={index === activeIndex}
              onPointerDown={(event) => event.preventDefault() /* keep focus in the input */}
              onClick={() => props.onSelect(index)}
            >
              <span className="vgf-search-result-head">
                <span className="vgf-search-result-page">
                  {fillLabel(labels.searchResultPage, { n: result.page })}
                </span>
                <span className="vgf-search-result-matches">
                  {result.matches === 1
                    ? labels.searchMatchesOne
                    : fillLabel(labels.searchMatches, { count: result.matches })}
                </span>
              </span>
              <span className="vgf-search-snippet" dir="auto">
                {result.snippet.map((part, i) =>
                  part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
                )}
              </span>
            </li>
          ))}
        </ul>
        {outcome?.capped && (
          <p className="vgf-search-capped">
            {fillLabel(labels.searchCapped, { max: MAX_RESULTS })}
          </p>
        )}
      </div>

      {layout === "sheet" && <div className="vgf-search-field">{input}</div>}
    </section>
  );
}
