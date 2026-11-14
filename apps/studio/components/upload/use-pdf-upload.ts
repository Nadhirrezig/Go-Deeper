"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRecord } from "@vipgroup/shared";
import { fetchBook, POLL_INTERVAL_MS } from "../use-live-books";

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number }
  | { phase: "converting"; book: BookRecord }
  | { phase: "ready"; book: BookRecord }
  | { phase: "failed"; message: string; book?: BookRecord }
  | { phase: "rejected"; code: string; message: string; suggestion?: string };

export interface UploadRequest {
  file: File;
  folderId: string;
  title: string;
  slug: string;
}

/**
 * Upload with progress (XMLHttpRequest: fetch has no upload progress), then follow the
 * conversion by polling the book. Closing the modal does not stop either: the upload
 * finishes and the conversion runs; the folder shows it.
 */
export function usePdfUpload(): { state: UploadState; start: (request: UploadRequest) => void } {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const update = useCallback((next: UploadState) => {
    if (mounted.current) setState(next);
  }, []);

  const follow = useCallback(
    async (book: BookRecord) => {
      let current = book;
      while (mounted.current && current.status === "converting") {
        update({ phase: "converting", book: current });
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        current = (await fetchBook(book.id).catch(() => null)) ?? current;
      }
      if (current.status === "ready") update({ phase: "ready", book: current });
      else if (current.status === "failed") {
        update({
          phase: "failed",
          message: current.error?.message ?? "La conversion a échoué.",
          book: current,
        });
      }
    },
    [update],
  );

  const start = useCallback(
    ({ file, folderId, title, slug }: UploadRequest) => {
      const params = new URLSearchParams({ folderId, title, slug });
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload?${params}`);
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          update({ phase: "uploading", percent: Math.round((event.loaded / event.total) * 100) });
        }
      };
      xhr.onload = () => {
        let body: {
          book?: BookRecord;
          error?: { code: string; message: string; suggestion?: string };
        } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // not JSON: handled below
        }
        if (xhr.status === 201 && body.book) {
          router.refresh(); // the converting sheet appears in its folder
          void follow(body.book);
        } else {
          update({
            phase: "rejected",
            code: body.error?.code ?? "UPLOAD_FAILED",
            message: body.error?.message ?? "L’envoi du fichier a échoué.",
            suggestion: body.error?.suggestion,
          });
        }
      };
      xhr.onerror = () =>
        update({
          phase: "rejected",
          code: "NETWORK",
          message: "L’envoi du fichier a échoué (réseau).",
        });
      update({ phase: "uploading", percent: 0 });
      xhr.send(file);
    },
    [follow, router, update],
  );

  return { state, start };
}
