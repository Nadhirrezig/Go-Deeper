"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional line under the title. */
  description?: string;
  className?: string;
}

/**
 * Frosted modal on the native <dialog>: focus is trapped and Escape closes it, as the
 * browser does for modal dialogs; a click on the backdrop closes it too.
 */
export function Modal({ open, title, onClose, children, description, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault(); // let React state decide
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(); // backdrop
      }}
      className={
        "glass m-auto w-[min(92vw,30rem)] rounded-3xl p-0 text-foreground backdrop:bg-zinc-900/25 backdrop:backdrop-blur-[2px] " +
        (className ?? "")
      }
    >
      <div className="flex flex-col gap-5 p-6">
        <header className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </header>
        {children}
      </div>
    </dialog>
  );
}
