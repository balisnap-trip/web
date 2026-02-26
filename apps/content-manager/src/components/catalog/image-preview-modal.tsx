"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ImagePreviewModalProps {
  src: string;
  alt: string;
  children: React.ReactNode;
  className?: string;
}

export function ImagePreviewModal({
  src,
  alt,
  children,
  className
}: ImagePreviewModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!src) {
    return <>{children}</>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("group relative block w-full text-left", className)}
      >
        {children}
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
          View
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg border border-white/30 bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
            onClick={() => setOpen(false)}
          >
            Close
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[96vw] h-auto w-auto object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
