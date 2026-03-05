"use client";

import { useState } from "react";
import { FormSubmitButton } from "@/components/catalog/form-submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

interface CatalogItemDeleteModalProps {
  itemId: string;
  itemName: string;
  canEdit: boolean;
  action: (formData: FormData) => void | Promise<void>;
}

export function CatalogItemDeleteModal({ itemId, itemName, canEdit, action }: CatalogItemDeleteModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={!canEdit}>
          Delete item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-red-200 p-5">
        <DialogHeader>
          <DialogTitle>Delete catalog item?</DialogTitle>
          <DialogDescription>
            You are about to delete <span className="font-semibold text-foreground">{itemName || "this item"}</span>.
            This action deactivates the item and removes it from active catalog views.
          </DialogDescription>
        </DialogHeader>

        <form action={action}>
          <input type="hidden" name="itemId" value={itemId} />
          <DialogFooter className="mt-5 flex gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <FormSubmitButton
              idleLabel="Delete item"
              pendingLabel="Deleting..."
              variant="destructive"
              disabled={!canEdit}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
