"use client";

import { useEffect, useState } from "react";
import { FormSubmitButton } from "@/components/catalog/form-submit-button";
import { Button } from "@/components/ui/button";

interface CatalogItemDeleteModalProps {
  itemId: string;
  itemName: string;
  canEdit: boolean;
  action: (formData: FormData) => void | Promise<void>;
}

export function CatalogItemDeleteModal({ itemId, itemName, canEdit, action }: CatalogItemDeleteModalProps) {
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

  return (
    <>
      <Button type="button" variant="destructive" size="sm" disabled={!canEdit} onClick={() => setOpen(true)}>
        Delete item
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">Delete catalog item?</h3>
            <p className="mt-2 text-sm text-slate-600">
              You are about to delete <span className="font-semibold text-slate-900">{itemName || "this item"}</span>.
              This action deactivates the item and removes it from active catalog views.
            </p>

            <form action={action} className="mt-5 flex items-center justify-end gap-2">
              <input type="hidden" name="itemId" value={itemId} />
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <FormSubmitButton
                idleLabel="Delete item"
                pendingLabel="Deleting..."
                variant="destructive"
                disabled={!canEdit}
              />
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

