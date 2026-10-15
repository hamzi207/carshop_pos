"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Trash2 } from "lucide-react";
import { deleteInventoryItem } from "@/lib/actions/inventory";
import { notify } from "@/lib/notify";
import type { InventoryListItem } from "@/lib/types/inventory";

type Props = {
  item: InventoryListItem | null;
  onOpenChange: (open: boolean) => void;
};

export function DeleteItemDialog({ item, onOpenChange }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!item) return;
    setPending(true);
    setError(null);
    const result = await deleteInventoryItem(item.id);
    setPending(false);
    if (result.status === "error") {
      setError(result.message);
      notify.error(`${item.name} not deleted`, result.message);
      return;
    }
    notify.success(`${item.name} deleted`, `${item.sku} removed from inventory. Existing documents keep their lines and prices.`);
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) setError(null);
        onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content className="modal modal-sm" role="alertdialog">
            <div className="modal-header">
              <div>
                <span className="header-icon danger"><Trash2 size={18} /></span>
                <div>
                  <Dialog.Title asChild><h2>Delete this part?</h2></Dialog.Title>
                  <Dialog.Description asChild>
                    <p>This can&apos;t be undone.</p>
                  </Dialog.Description>
                </div>
              </div>
            </div>
            <div className="modal-body">
              {error && <div className="form-alert form-alert-error modal-alert" role="alert">{error}</div>}
              <p className="confirm-text">
                <strong>{item?.name}</strong> <span className="mono">({item?.sku})</span> and its vehicle
                fitment links will be removed. Existing quotes keep their line descriptions and prices.
              </p>
            </div>
            <div className="modal-footer">
              <Dialog.Close asChild>
                <button type="button" className="button" disabled={pending}>Cancel</button>
              </Dialog.Close>
              <button type="button" className="button button-danger" onClick={confirm} disabled={pending}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {pending ? "Deleting…" : "Delete Part"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
