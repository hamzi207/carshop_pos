"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Category } from "@/lib/categories";
import { InventoryItemDialog } from "./inventory-item-dialog";

type Props = { currency: string; pricesIncludeTax: boolean; categories: Category[] };

export function AddItemButton({ currency, pricesIncludeTax, categories }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> Add New Product
      </button>
      <InventoryItemDialog open={open} onOpenChange={setOpen} currency={currency} pricesIncludeTax={pricesIncludeTax} categories={categories} />
    </>
  );
}
