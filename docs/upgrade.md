Claude, read this entire instruction carefully before taking any action.

### 🛑 CRITICAL CONSTRAINT: PLAN-ONLY MODE
DO NOT touch, write, edit, or refactor ANY application code, source files, or database migrations in this session. Your ONLY objective in this turn is to inspect project context, draft a comprehensive, production-grade upgrade plan, save it to `docs/upgrade-plan.md`, and then STOP and wait for my explicit approval.

---

### 1. CONTEXT & MEMORY RECALL
1. Check your internal memory and project records for this repository (`carshop_pos`), including your previous build logs, commit history, `docs/PROJECT_SPEC.md` (§7 what was built, §8 roadmap), and `docs/dev-stages-results.md`.
2. Inspect the branding, assets, and design identity in the ProductLogik repository located at:
   `D:\SpicedProjects\Projects\productlogik`
   - Specifically check: `assets/logo.svg`, `assets/logo.png`, `frontend/public/logo.png`, `README.md`, and its core color palette (Emerald/Teal `#059669` to `#34D399`, slate structural surfaces, clean typography, lightning bolt glyph).

---

### 2. THE UPGRADE GOAL: GENERAL-PURPOSE RETAIL POS
Transform this project from a specialized car-accessories and quoting tool into a complete, universal, industry-grade **Regular Point of Sale (POS) & Retail Management System** branded as **ProductLogik POS**.

Automotive-specific elements (YMM fitment, vehicle catalogs) must be decoupled into optional custom attributes so the system functions seamlessly for any retail business (supermarkets, apparel, electronics, general retail, convenience stores, and specialty shops).

---

### 3. WHAT MUST BE INCLUDED IN THE PLAN
Your upgrade plan must be comprehensive and outline every feature required in a modern, commercial-grade POS system, structured into clear, sequential execution phases:

1. **Rebranding & Visual Identity (ProductLogik)**:
   - Migration from "CarShop.Pk POS" to **ProductLogik POS**.
   - **Repository & Project Renaming**:
     - Remote GitHub repository renaming from `carshop_pos` to `productlogik-pos` (via GitHub CLI `gh repo rename productlogik-pos --yes` or GitHub repo settings) and sync local git remote (`git remote set-url origin https://github.com/hamzi207/productlogik-pos.git`).
     - Update `package.json` (`"name": "productlogik-pos"`), app metadata, titles, and documentation.
   - Replacement of carshop logos (`public/brand/*`, `carshop_logo/`) with ProductLogik's emerald lightning bolt logo, brand mark, favicon suite, and typography.
   - Theme modernization: Swap racing red (`#ea1b25`, `#d9161f`) with ProductLogik's signature Emerald/Teal tokens (`#059669`, `#10B981`, `#34D399`, `#047857`, `#ecfdf5`).

2. **Dedicated Fast POS Register / Cashier Terminal Screen (`/pos`)**:
   - Touch/Desktop speed-of-service checkout register interface.
   - Continuous barcode gun scanning listener (auto-detects barcode input, adds item to cart, audio beep on scan).
   - Visual quick-pick grid with category tabs and favorite items.
   - Live interactive cart panel: quantity stepper, line discounts, custom items on the fly, price override (with supervisor permission).
   - **Park / Hold Cart**: Ability to park/suspend multiple active sales and resume them anytime.
   - **Fast Checkout Tender Modal**: Quick cash buttons (`Exact`, `+Rs. 500`, `+Rs. 1,000`, `+Rs. 5,000`), real-time Change Due calculation, split tender (Cash + Card + Store Credit), ESC/POS cash drawer kick trigger.

3. **Cash Drawer & Register Shift Management**:
   - Day-open shift with opening cash float.
   - Petty cash in / cash out (Pay-in / Pay-out expenses) with reasons.
   - End-of-shift closing & drawer reconciliation (counted cash vs. expected cash, over/short variance).
   - Shift summary reports: **X-Report** (mid-shift audit) and **Z-Report** (final shift closeout).

4. **Universal Retail Inventory & Catalog Architecture**:
   - Decouple from automotive hardcoding; generalize categories for universal retail.
   - Product Variants & Matrix (e.g., Size, Color, Flavor, Capacity).
   - Barcode & SKU management: Support EAN-13, UPC, Code 128; built-in thermal barcode label generator & sticker printing.
   - Units of Measure (UOM: pcs, pack, kg, meter, box, dozen).
   - Stock adjustments with audit reason codes (Damaged, Theft/Shrinkage, Spoilage, Inventory Count Discrepancy, Return to Vendor).
   - Purchase Orders (PO) & Supplier Receiving: Vendor records, stock intake, automated stock-on-hand & cost updates.

5. **Returns, Refunds & Customer Accounts (Khata / Ledger)**:
   - Receipt scan-to-return: full/partial refunds, restock toggle, return to original tender or Store Credit.
   - Customer account ledger / credit control: Credit limits, running account balances, statements of account (PDF & WhatsApp link), pay-later clearance.
   - Customer loyalty points & promotional discount codes.

6. **Receipts & Printing Engine**:
   - Thermal receipt printer engine (80mm & 58mm roll formats) with customizable header/footer, store tax ID, cashier name, barcode/QR code.
   - Professional A4 commercial invoice PDF engine (for wholesale/B2B clients).
   - Digital receipt dispatch via WhatsApp and Resend transactional email.

7. **Security, Staff Roles & Cashier Fast-Switch**:
   - RBAC: Cashier, Supervisor / Store Manager, Store Admin, Platform Superadmin (`/admin`).
   - Screen lock with quick 4-digit PIN unlock for cashiers stepping away from the counter.
   - Permission overrides (requiring supervisor PIN for discounts above threshold, refunds, or manual price changes).

8. **Multi-Register & Multi-Branch Architecture**:
   - Outlets/branches and designated physical registers/tills per tenant.

---

### 4. OUTPUT REQUIREMENTS
- Synthesize all the above into a structured, phase-by-phase implementation blueprint.
- Ensure each phase has clear deliverables, affected files, database migration outlines, and strict pause-and-test checkpoints.
- Write this complete plan to:
  `docs/upgrade-plan.md`
- When finished writing the file, summarize the key milestones for me in your response and **HALT**. 
- **DO NOT write or modify any application code until I review and explicitly tell you: "Plan approved, proceed with Phase [X]"**.
