"use client";

import { useId, useRef, useState } from "react";
import { buttonClass } from "../ui/button";

/** Drop a PDF here, or pick one with the button. */
export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={
        "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition " +
        (over ? "border-zinc-500 bg-white/70" : "border-zinc-900/20 bg-white/35")
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p id={hintId} className="text-sm text-muted-foreground">
        Déposez un PDF ici
      </p>
      <button
        type="button"
        className={buttonClass.secondary}
        aria-describedby={hintId}
        onClick={() => inputRef.current?.click()}
      >
        Choisir un fichier
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
