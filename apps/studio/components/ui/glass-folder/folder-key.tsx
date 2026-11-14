"use client";

import * as React from "react";

export interface FolderKeyProps {
  action: "add" | "more";
  keyRef: React.RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  menuId: string;
  menuOpen: boolean;
  /** Re-keys the `+` glyph so it turns again after each add. */
  bump: number;
  onClick: () => void;
}

/** The round key in the corner: `+` (add a file) or `···` (open the menu). */
export function FolderKey({
  action,
  keyRef,
  ariaLabel,
  menuId,
  menuOpen,
  bump,
  onClick,
}: FolderKeyProps) {
  return (
    <button
      ref={keyRef}
      type="button"
      className={"gf-key gf-key--" + action}
      aria-label={ariaLabel}
      aria-haspopup={action === "more" ? "menu" : undefined}
      aria-expanded={action === "more" ? menuOpen : undefined}
      aria-controls={action === "more" ? menuId : undefined}
      onClick={onClick}
    >
      {action === "add" ? (
        <PlusGlyph key={bump} />
      ) : (
        <svg className="gf-glyph gf-glyph--more" viewBox="0 0 30 12" aria-hidden="true">
          <rect x="1" y="1.5" width="8" height="9" rx="3.4" />
          <rect x="11" y="1.5" width="8" height="9" rx="3.4" />
          <rect x="21" y="1.5" width="8" height="9" rx="3.4" />
        </svg>
      )}
    </button>
  );
}

/** The `+` drawn on the add key (also used by the new-folder tile). */
export function PlusGlyph() {
  return (
    <svg className="gf-glyph gf-glyph--plus" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}
