"use client";

import * as React from "react";
import type { FolderMenuItem } from "./types";

export interface FolderMenuProps {
  id: string;
  ariaLabel: string;
  open: boolean;
  items: FolderMenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  /** Close the menu (focus goes back to the key). */
  onClose: () => void;
  /** Close the menu without moving focus (Tab leaves it). */
  onDismiss: () => void;
}

/** The frosted `···` menu, driven by arrow keys, Home and End. */
export function FolderMenu({
  id,
  ariaLabel,
  open,
  items,
  menuRef,
  onClose,
  onDismiss,
}: FolderMenuProps) {
  // focus the first menu item when the menu opens
  React.useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open, menuRef]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const elements = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
    );
    const at = elements.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      elements[(i + elements.length) % elements.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(elements.length - 1);
    else if (e.key === "Tab") onDismiss();
  };

  return (
    <div
      ref={menuRef}
      id={id}
      role="menu"
      aria-label={ariaLabel}
      className="gf-menu"
      data-open={open || undefined}
      onKeyDown={onMenuKey}
    >
      {items.map((item, i) => (
        <button
          key={item.label + i}
          type="button"
          role="menuitem"
          tabIndex={open ? -1 : undefined}
          disabled={!open}
          className={"gf-menu-item" + (item.danger ? " gf-menu-item--danger" : "")}
          onClick={() => {
            onClose();
            item.onSelect?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
