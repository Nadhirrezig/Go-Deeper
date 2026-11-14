import { useState } from "react";
import { formatSpread, parsePageInput } from "./spread";
import type { Spread } from "./spread";

interface PageIndicatorProps {
  spread: Spread;
  pageCount: number;
  label: string;
  disabled: boolean;
  onJump: (page: number) => void;
}

/** "2–3 / 48". The left part is editable: type a page number and press Enter. */
export function PageIndicator({ spread, pageCount, label, disabled, onJump }: PageIndicatorProps) {
  // null = not editing: the field shows the current spread.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? formatSpread(spread);

  return (
    <span className="vgf-indicator">
      <input
        className="vgf-page-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        disabled={disabled}
        value={value}
        // Wide enough for the longest spread ("198–199").
        style={{ width: `calc(${String(pageCount).length * 2 + 1}ch + 14px)` }}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const page = parsePageInput(draft ?? "", pageCount);
            if (page !== null) onJump(page);
            setDraft(null);
            event.currentTarget.blur();
          } else if (event.key === "Escape" && draft !== null) {
            // Cancel the edit only; do not let Escape also close zoom or fullscreen.
            event.stopPropagation();
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="vgf-page-total" aria-hidden="true">
        / {pageCount}
      </span>
    </span>
  );
}
