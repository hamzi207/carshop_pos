# Category Templates (Draft for Review)

> **Status**: APPROVED as-is by the product owner on 2026-10-21 (drafted 2026-10-20). Written during planning for the product owner to review **before Phase 18**. Nothing has been seeded. Once approved, Phase 18 loads these files into the global category catalog (one catalog per industry); after that the superadmin maintains them in `/admin/categories`.

## Files

| # | Industry | File |
| :--- | :--- | :--- |
| 1 | General Retail & Departmental Stores | [general-retail.md](general-retail.md) |
| 2 | Supermarket, Grocery & Kiryana | [grocery.md](grocery.md) |
| 3 | Wholesale & FMCG Distribution | [wholesale-fmcg.md](wholesale-fmcg.md) |
| 4 | Apparel & Footwear | [apparel-footwear.md](apparel-footwear.md) |
| 5 | Textile, Fabric & Cloth Houses | [textile-fabric.md](textile-fabric.md) |
| 6 | Electronics, Mobile Phones & Accessories | [electronics-mobile.md](electronics-mobile.md) |
| 7 | Computers & IT Equipment | [computers-it.md](computers-it.md) |
| 8 | Pharmacy & Medical Supplies | [pharmacy-medical.md](pharmacy-medical.md) |
| 9 | Cosmetics, Beauty & Personal Care | [cosmetics-beauty.md](cosmetics-beauty.md) |
| 10 | Hardware, Building Materials & Sanitary | [hardware-building-sanitary.md](hardware-building-sanitary.md) |
| 11 | Electrical & Lighting | [electrical-lighting.md](electrical-lighting.md) |
| 12 | Automotive Accessories & Parts | [`../categories.md`](../categories.md) (existing V1 tree, unchanged) |
| 13 | Books, Stationery & School Supplies | [books-stationery.md](books-stationery.md) |
| 14 | Toys, Gifts & Party Supplies | [toys-gifts.md](toys-gifts.md) |

## Format (same as `docs/categories.md`)

```
Main Category                 ← level 1 (no prefix)
- Subcategory                 ← level 2
    = Sub-subcategory         ← level 3
        + Leaf                ← level 4 (the maximum depth)
```

Each file starts with a **Main categories** table:
- **SKU prefix**: used by "Generate SKU", e.g. `BEV-000123`. 3 capital letters, unique within the industry.
- **Icon**: a [Lucide](https://lucide.dev/icons) icon name.

The superadmin can change both later.

## How to review

- Edit the files directly: add, rename, remove or move lines. Keep the indentation markers above.
- Names are written as Pakistani shops commonly label stock. Urdu/local terms are in brackets where helpful, e.g. "Pulses (Daal)".
- Products can sit at any level. Leave out a level 3/4 if a shop doesn't need that much detail.
- Organizations only see their own industry's tree. Anything missing can still be added for one organization as an organization-specific category, or requested by the organization later, so the trees don't need to be perfect.
- Every tree ends with an **Others** main category (prefix `OTH`) as a safe fallback.
