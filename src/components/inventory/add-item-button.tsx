"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { InventoryItemDialog } from "./inventory-item-dialog";

export function AddItemButton({ currency, pricesIncludeTax }: { currency: string; pricesIncludeTax: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add New Part
      </button>
      <InventoryItemDialog open={open} onOpenChange={setOpen} currency={currency} pricesIncludeTax={pricesIncludeTax} />
    </>
  );
}
