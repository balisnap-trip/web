"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

  if (!src) {
    return <>{children}</>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("group relative block w-full text-left", className)}
        >
          {children}
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
            View
          </span>
        </button>
      </DialogTrigger>

      <DialogContent
        className="grid max-h-[95vh] max-w-[96vw] place-items-center border-white/20 bg-black/95 p-2 sm:p-4"
        showClose={false}
      >
        <DialogTitle className="sr-only">{alt || "Image preview"}</DialogTitle>
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
          className="max-h-[88vh] max-w-[92vw] h-auto w-auto object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
