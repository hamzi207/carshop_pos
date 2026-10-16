# MASTER CROSS-DEVICE RESPONSIVE & ADAPTIVE UI BLUEPRINT (`docs/cross_compatibility.md`)
## Comprehensive Mobile, Tablet, Laptop, Desktop & Ultra-Wide Compatibility Specification
### Production Implementation Plan for AI Coding Agents (Claude Code / Antigravity) & Frontend Engineers

> **Document Version**: 1.0.0  
> **Target Audience**: Claude Code, Antigravity IDE, UI/UX Engineers & QA Testers  
> **Application**: CarShop.Pk B2B SaaS POS & Automotive Quoting Engine  
> **Status**: Ready for Phased Execution  

---

## TABLE OF CONTENTS
1. [Executive Summary & Viewport Strategy](#1-executive-summary--viewport-strategy)
2. [Current UI Responsiveness Audit & Failure Analysis](#2-current-ui-responsiveness-audit--failure-analysis)
   - 2.1 [The Critical Mobile Bottlenecks](#21-the-critical-mobile-bottlenecks)
   - 2.2 [Screen-by-Screen Vulnerability Map](#22-screen-by-screen-vulnerability-map)
3. [Responsive Breakpoint Architecture & Grid Tokens](#3-responsive-breakpoint-architecture--grid-tokens)
   - 3.1 [Standardized Breakpoint Matrix](#31-standardized-breakpoint-matrix)
   - 3.2 [Layout Shell Behavior by Viewport Tier](#32-layout-shell-behavior-by-viewport-tier)
4. [Adaptive UI Components & Transformation Patterns](#4-adaptive-ui-components--transformation-patterns)
   - 4.1 [Data Tables to Adaptive Card Stack Transformation](#41-data-tables-to-adaptive-card-stack-transformation)
   - 4.2 [Document & POS Builder Ergonomics on Touch Devices](#42-document--pos-builder-ergonomics-on-touch-devices)
   - 4.3 [Modals to Fullscreen Mobile Bottom-Sheets](#43-modals-to-fullscreen-mobile-bottom-sheets)
   - 4.4 [iOS Safari Auto-Zoom Fix & Touch Ergonomics](#44-ios-safari-auto-zoom-fix--touch-ergonomics)
   - 4.5 [Dashboard SVG Chart Fluid Scaling](#45-dashboard-svg-chart-fluid-scaling)
5. [Device-Specific Ergonomics & Hardware Adaptation](#5-device-specific-ergonomics--hardware-adaptation)
   - 5.1 [Smartphones (Portrait & Landscape, iPhone / Android / Foldables)](#51-smartphones-portrait--landscape-iphone--android--foldables)
   - 5.2 [Tablets & POS Terminals (iPad 10.2", iPad Pro, Android Counter Tablets)](#52-tablets--pos-terminals-ipad-102-ipad-pro-android-counter-tablets)
   - 5.3 [Laptops (1366Ã—768 Budget Laptops & 1080p Ultrabooks)](#53-laptops-1366768-budget-laptops--1080p-ultrabooks)
   - 5.4 [Desktop & Ultra-Wide Monitors (1440p, 4K, 21:9 Displays)](#54-desktop--ultra-wide-monitors-1440p-4k-219-displays)
6. [Step-by-Step Implementation Roadmap for Claude Code](#6-step-by-step-implementation-roadmap-for-claude-code)
   - [Phase 1: Breakpoint Foundations, Fluid Typography & iOS Zoom Fix](#phase-1-breakpoint-foundations-fluid-typography--ios-zoom-fix)
   - [Phase 2: Mobile Navigation, Drawer & Sticky Cashier Bottom Bar](#phase-2-mobile-navigation-drawer--sticky-cashier-bottom-bar)
   - [Phase 3: Adaptive Data Tables (Inventory, Customers, Documents)](#phase-3-adaptive-data-tables-inventory-customers-documents)
   - [Phase 4: Document & Invoice Builder Mobile Overhaul](#phase-4-document--invoice-builder-mobile-overhaul)
   - [Phase 5: Dialogs to Bottom-Sheets & Touch Input Scaling](#phase-5-dialogs-to-bottom-sheets--touch-input-scaling)
   - [Phase 6: Dashboard SVG Charts & Large Screen Optimization](#phase-6-dashboard-svg-charts--large-screen-optimization)
   - [Phase 7: End-to-End Cross-Device Testing & Verification](#phase-7-end-to-end-cross-device-testing--verification)
7. [Ready-to-Run Claude Code Terminal Prompts](#7-ready-to-run-claude-code-terminal-prompts)

---

## 1. EXECUTIVE SUMMARY & VIEWPORT STRATEGY

### 1.1 The Business Need
Auto accessory retail shops, tinting garages, and vinyl wrap studios operate in mixed-hardware environments:
1. **Floor Technicians & Fitters**: Inspect cars in bays using **smartphones (iPhone / Android)** to look up film inventory or add parts to a draft.
2. **Counter Cashiers & Service Advisors**: Manage walk-in customers and take payments on **countertop tablets (iPads / Android touchscreens)** or compact **14" POS laptops**.
3. **Shop Owners & Managers**: Review reports, manage categories, and adjust pricing from **desktops, dual monitors, or 1366Ã—768 budget laptops**.
4. **Customers**: View quotations and invoices on their **mobile phones via WhatsApp share links (`/share/[token]`)**.

A desktop-only or poorly adapted responsive web app causes severe operational friction: clipped tables, hidden action buttons, inputs that trigger forced zooming on iOS, and unreachable checkout buttons.

### 1.2 Core Architectural Objectives
- **Zero Horizontal Window Scrollbars**: No page or dialog may ever trigger sideways scrolling on the outer window.
- **Adaptive Touch Ergonomics**: All interactive elements must satisfy Apple Human Interface Guidelines and Google Material standards ($\ge 44 \times 44\text{ px}$ touch target).
- **Graceful Form Degradation**: Data tables transform smoothly into structured mobile cards on narrow screens.
- **Orientation Resilience**: Seamless reflow when rotating an iPad or smartphone between Portrait and Landscape.
- **Fluid Layout**: Content naturally expands up to ultra-wide displays without awkward stretching or orphan elements.

---

## 2. CURRENT UI RESPONSIVENESS AUDIT & FAILURE ANALYSIS

### 2.1 The Critical Mobile Bottlenecks

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        CURRENT AUDIT SUMMARY                           â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ âŒ iOS Safari 16px Input Bug : Inputs at 10px-12px trigger auto-zoom    â”‚
â”‚ âŒ Wide Table Overflow       : 8-column tables squashed or hidden      â”‚
â”‚ âŒ Invoice Builder On Phone  : Fixed desktop layout overflows screen   â”‚
â”‚ âŒ Steppers & Small Buttons  : 24px-28px buttons difficult for touch   â”‚
â”‚ âŒ Modals on Mobile          : Fixed pixel modals occluded by keyboard â”‚
â”‚ âŒ Category Tree Overflow    : Deep nested trees wrap unpredictably    â”‚
â”‚ âŒ Date Picker Popover       : 590px width extends beyond mobile edge  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### Detailed Failure Points:
1. **The iOS Safari Input Zoom Trap**:
   In `src/app/globals.css`, multiple inputs are styled with `font-size: 10px` or `12px` (e.g. `.form-field .cat-trigger`, `.settings-input`, `.line-search input`). In iOS WebKit, **any input with `font-size < 16px` automatically forces a page zoom on focus**, disrupting the layout and forcing the user to manually pinch-to-zoom out.
2. **Document / Invoice Builder (`QuoteBuilder`)**:
   The desktop SOS Inventory layout has customer bill-to details on the left, document status on the right, an 8-column table in the middle, and bottom notes/totals. On screens below 900px, columns like `Unit Price`, `Discount`, and `Sale Price` become unreadable or scroll clumsily inside the card.
3. **Add/Edit Part & Customer Modals**:
   Modals currently have `max-height: calc(100vh - 20px)`. When an Android or iOS soft keyboard appears (taking up ~300px), inputs are covered, the submit button is invisible, and users cannot complete forms without closing the keyboard blindly.
4. **Dashboard Date Picker Popover**:
   The two-month date range picker is ~590px wide. On phones (360pxâ€“414px) and small tablets, it clips outside the viewport, preventing users from selecting custom date ranges.

### 2.2 Screen-by-Screen Vulnerability Map

| Screen / Component | Mobile (< 768px) | Tablet (768px â€“ 1024px) | Laptop (1024px â€“ 1366px) | Desktop / 4K (> 1440px) |
| :--- | :--- | :--- | :--- | :--- |
| **App Shell & Topbar** | âš ï¸ â˜° Drawer works, but profile & search icons misalign with safe area. | âš ï¸ Sidebar collapses to icons, but flyout submenus missing. | âœ… Good. | âš ï¸ Sidebar feels too narrow on 4K; text feels tiny. |
| **Invoices / Quotes Table** | âŒ 8 columns squeezed; horizontal scroll clumsy. | âš ï¸ Crowded columns; status badges wrap. | âœ… Good. | âœ… Good. |
| **Invoice Builder Form** | âŒ Severe: Line items table impossible on phone; totals bar hidden. | âš ï¸ Tight layout; number fields truncated. | âœ… Good. | âœ… Good. |
| **Inventory Catalog** | âŒ 9 columns in table; margin % and stock badges clip. | âš ï¸ Fitment tags wrap clumsily. | âœ… Good. | âœ… Good. |
| **Add / Edit Part Modal** | âŒ YMM selector chips overflow; keyboard hides Save button. | âš ï¸ Modal width too narrow on tablet portrait. | âœ… Good. | âœ… Good. |
| **Customer Directory** | âš ï¸ Cards stack, but table actions get pushed off-screen. | âœ… Acceptable. | âœ… Good. | âœ… Good. |
| **Dashboard Charts** | âš ï¸ Donut chart legend wraps; bar labels collide. | âš ï¸ Metric cards wrap to 2 rows awkwardly. | âš ï¸ 4 cards cramped on 1366px. | âš ï¸ Cards stretch too wide; bars look spaced out. |
| **Settings Pages** | âš ï¸ Form rows wrap, but category tree management overflows. | âœ… Acceptable. | âœ… Good. | âœ… Good. |
| **Public Share Link** | âš ï¸ Needs native mobile PDF viewer & sticky WhatsApp share button. | âœ… Good. | âœ… Good. | âœ… Good. |

---

## 3. RESPONSIVE BREAKPOINT ARCHITECTURE & GRID TOKENS

### 3.1 Standardized Breakpoint Matrix
We replace the ad-hoc `768px` and `920px` media queries with a unified 6-tier breakpoint token system matching Tailwind CSS v4:

```css
/* Breakpoint Tokens */
--bp-xs: 480px;   /* Compact Smartphones (iPhone SE, Galaxy S compact) */
--bp-sm: 640px;   /* Phablets & Foldables (iPhone Pro Max, Pixel 8 Pro) */
--bp-md: 768px;   /* Tablets Portrait (iPad Mini, iPad 10th gen) */
--bp-lg: 1024px;  /* Tablets Landscape & Small Laptops (iPad Pro, 13" MacBook, 1366x768) */
--bp-xl: 1280px;  /* Standard Desktop / High-DPI Laptops (1080p) */
--bp-2xl: 1536px; /* Ultra-Wide & 4K Displays (QHD, 4K monitors) */
```

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   xs (<480)  â”‚  sm (480-767)â”‚  md (768-1023â”‚ lg (1024-1279â”‚ xl (1280-1535â”‚  2xl (â‰¥1536) â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Compact Phoneâ”‚ Large Phone  â”‚Tablet Portr. â”‚Tablet Land. /â”‚ Desktop 1080pâ”‚ Ultra-Wide   â”‚
â”‚ 1-Col Stack  â”‚ 1-Col Stack  â”‚ Icon Rail    â”‚ Laptop       â”‚ Expanded Nav â”‚ Contained Maxâ”‚
â”‚ Bottom Sheet â”‚ Bottom Sheet â”‚ Modal Dialog â”‚ Full Sidebar â”‚ Full Sidebar â”‚ Full Sidebar â”‚
â”‚ Full Cards   â”‚ Full Cards   â”‚ Tablet Table â”‚ Full Table   â”‚ Full Table   â”‚ Full Table   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 3.2 Layout Shell Behavior by Viewport Tier

#### 1. Mobile Shell (`< 768px` / `xs` & `sm`):
- **Sidebar**: Hidden off-canvas by default. Opens as an animated slide-out drawer from left on `â˜°` button tap. Backdrop scrim closes drawer on tap.
- **Topbar**: Compressed to `56px` height. Displays `â˜°` toggle, CarShop wordmark or brand mark, search icon button, notification bell, and compact profile avatar.
- **Bottom Cashier Quick-Bar** (on document edit/new routes): Fixed bottom bar displaying document total and primary CTA ("Save Invoice" / "Record Payment") permanently visible above the thumb zone.
- **Main Shell**: Zero left margin; full `100vw` width; `overflow-x: hidden`.

#### 2. Tablet Shell (`768px â€“ 1023px` / `md`):
- **Sidebar**: Defaults to collapsed **Icon Rail** (`72px` wide). Menu items display icons only; tooltip badges reveal full labels on hover or tap.
- **Topbar**: Height `70px`. Global search bar expands to `240px`.
- **Main Shell**: Left margin fixed at `72px`. Content padding `24px 20px`.
- **Two-Column Reflow**: Metric grids reflow to clean $2 \times 2$ arrangements; form grids use single-column or compact two-column layouts.

#### 3. Laptop & Standard Desktop Shell (`1024px â€“ 1535px` / `lg` & `xl`):
- **Sidebar**: Fully expanded (`264px` wide). Logo lockup, categorized menu sections, user shop card, collapse toggle visible on edge.
- **Main Shell**: Left margin `264px`. Content max-width unconstrained; fluid padding `32px 36px`.
- **Full Data Grids**: 4-column metric cards, 8-9 column data tables with hover tooltips and action buttons.

#### 4. Ultra-Wide & 4K Displays (`â‰¥ 1536px` / `2xl`):
- **Max Content Containment**: Main content container capped at `1720px` width and centered horizontally (`margin: 0 auto`) to avoid stretched line items or miles between table columns.
- **Enhanced Density**: Fluid font scaling using `clamp()` ensures text remains crisp and readable from standard office viewing distances.

---

## 4. ADAPTIVE UI COMPONENTS & TRANSFORMATION PATTERNS

### 4.1 Data Tables to Adaptive Card Stack Transformation
On viewports $< 768\text{px}$, standard HTML tables with 8â€“9 columns cannot fit without requiring cumbersome horizontal panning. We implement the **Adaptive Card Stack Pattern**:

```
[ DESKTOP TABLE VIEW (â‰¥ 768px) ]
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ NUMBER â”‚ CUSTOMER     â”‚ DATE     â”‚ STATUS   â”‚ TOTAL    â”‚ ACTION  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚INV-1002â”‚Precision Autoâ”‚Oct 15    â”‚ Paid     â”‚Rs. 12,500â”‚ Open â€º  â”‚
â”‚INV-1003â”‚Apex Detailingâ”‚Oct 16    â”‚ Due      â”‚Rs. 4,650 â”‚ Open â€º  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

                     â–¼ TRANSFORM ON MOBILE (< 768px) â–¼

[ MOBILE ADAPTIVE CARD VIEW ]
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  INV-1002                    [ Paid (Green Badge) ]              â”‚
â”‚  Precision Auto Dealership                                       â”‚
â”‚  Oct 15, 2026 Â· Due in 30 days                                   â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â”‚
â”‚  Total: Rs. 12,500.00                   Balance: Rs. 0.00        â”‚
â”‚  [ View PDF ]   [ Share WhatsApp ]               [ Open â€º ]      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### CSS & Implementation Structure:
```tsx
{/* Container switches view seamlessly based on media query */}
<div className="responsive-table-container">
  {/* Desktop Table: visible on md and up */}
  <div className="table-desktop-view">
    <table className="document-table">...</table>
  </div>

  {/* Mobile Card Stack: visible on mobile only */}
  <div className="table-mobile-cards">
    {items.map((item) => (
      <div key={item.id} className="mobile-card">
        <div className="mobile-card-header">
          <span className="doc-num">{item.number}</span>
          <StatusBadge status={item.status} />
        </div>
        <div className="mobile-card-body">
          <strong>{item.customer_name}</strong>
          <span>{formatDate(item.date)}</span>
        </div>
        <div className="mobile-card-footer">
          <span className="total">{formatMoney(item.total)}</span>
          <Link href={item.href} className="button button-sm button-secondary">
            Open Details
          </Link>
        </div>
      </div>
    ))}
  </div>
</div>
```

### 4.2 Document & POS Builder Ergonomics on Touch Devices
The document editor (`/invoices/new`, `/quotations/[id]`) is the most complex screen. On mobile and counter tablets, it must be reimagined for speed:

1. **Sticky Bottom Summary & Action Bar**:
   On mobile, the order summary (Subtotal, Tax, Grand Total, and primary CTA "Save & Issue Invoice") must be pinned to the bottom of the screen with a backdrop blur:
   ```css
   .mobile-doc-action-bar {
     position: sticky;
     bottom: 0;
     left: 0;
     right: 0;
     z-index: 40;
     background: rgba(255, 255, 255, 0.95);
     backdrop-filter: blur(8px);
     border-top: 1px solid var(--slate-200);
     padding: 12px 16px;
     display: flex;
     align-items: center;
     justify-content: space-between;
     box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
   }
   ```
2. **Mobile Line Item Card Component**:
   Instead of editing quantity, price, and discount inside a cramped table row, each line item on mobile renders as a touch card:
   - Part name & SKU on top with quick delete trash button.
   - Stepper control with large tap targets ($\ge 44\text{px}$) for Quantity (`-` and `+`).
   - Unit price and discount shown as tap-to-edit values that trigger a clean bottom-sheet or clean numeric input.
3. **Item Search Sheet**:
   Tapping "Add Product / Part" on mobile opens a **Full-Screen Search Sheet** with auto-focused search bar, category chips, and large list items with instant tap-to-add behavior.

### 4.3 Modals to Fullscreen Mobile Bottom-Sheets
Desktop dialogs centered in the screen feel claustrophobic on phones and are easily ruined by virtual keyboards.
- **Desktop ($\ge 768\text{px}$)**: Standard centered Radix Dialog modal (`width: 580px`, rounded corners, shadow).
- **Mobile ($< 768\text{px}$)**: Automatically transforms into a **Bottom Sheet Drawer**:
  - Attached to the bottom of the viewport (`bottom: 0`, `left: 0`, `right: 0`).
  - Rounded top corners (`border-radius: 16px 16px 0 0`).
  - Top drag handle pill indicator.
  - Maximum height `90vh`, with internal scrollable body.
  - Pinned submit/cancel action buttons at the bottom that remain visible above the virtual keyboard via `interactive-widget=resizes-content` in the viewport meta tag.

### 4.4 iOS Safari Auto-Zoom Fix & Touch Ergonomics
1. **Viewport Meta Configuration**:
   Update `src/app/layout.tsx`:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover, interactive-widget=resizes-content" />
   ```
2. **Input Font-Size Baseline Rule**:
   Add to `src/app/globals.css`:
   ```css
   /* Prevent iOS Safari auto-zoom on form inputs */
   @media (max-width: 768px) {
     input, select, textarea, .cat-trigger, .line-search input {
       font-size: 16px !important; /* WebKit will not zoom inputs >= 16px */
     }
   }
   ```
3. **Touch Targets ($\ge 44 \times 44\text{px}$)**:
   All buttons, filter chips, quantity steppers, and pagination controls must have a minimum interactive touch area of $44\text{px}$ via padding or pseudo-elements (`::after { content: ''; position: absolute; inset: -8px; }`).

### 4.5 Dashboard SVG Chart Fluid Scaling
Currently, the SVG bar charts and donut charts have fixed coordinate viewBoxes that cause text to overlap on narrow phone screens:
1. **Dynamic ViewBox & Aspect Ratio**:
   SVGs must declare `viewBox="0 0 100 60"` with `preserveAspectRatio="xMidYMid meet"`, allowing charts to scale smoothly from 300px to 800px width.
2. **Responsive Bar Labels**:
   On screen widths $< 480\text{px}$, alternate bar dates (e.g. show every 2nd or 3rd day label) to prevent text collision.
3. **Donut Legend Placement**:
   - Desktop: Donut chart and Legend sit side-by-side.
   - Mobile: Donut chart sits centered above a full-width stacked legend.

---

## 5. DEVICE-SPECIFIC ERGONOMICS & HARDWARE ADAPTATION

### 5.1 Smartphones (Portrait & Landscape, iPhone / Android / Foldables)
- **Safe Area Insets**:
  Use `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` for iPhone Dynamic Island, home indicators, and Android navigation bars.
- **Landscape Phone Orientation (`max-height: 500px` and orientation: landscape)**:
  - Topbar height compresses to `44px`.
  - Modals convert to 2-column horizontal layouts to prevent vertical clipping.
  - Bottom action bars adopt compact inline horizontal styling.
- **Foldable Phones (Samsung Galaxy Z Fold, Google Pixel Fold)**:
  Smoothly reflows from narrow cover screen (`360px` 1-col card stack) to unfolded square canvas (`768px` 2-col tablet rail layout).

### 5.2 Tablets & POS Terminals (iPad 10.2", iPad Pro, Android Counter Tablets)
- **Primary Cashier Experience**:
  Auto accessory cashiers frequently place an iPad in a counter stand.
- **Touch-Optimized Table Rows**:
  Table rows have increased vertical padding (`padding: 12px 14px`) so cashiers wearing protective wrap gloves can tap without precision errors.
- **Split-Pane Views**:
  On tablet landscape (`1024px`), Invoices and Customers support split-pane views (document list on left 35%, selected invoice live preview on right 65%).

### 5.3 Laptops (1366Ã—768 Budget Laptops & 1080p Ultrabooks)
- **Vertical Budget Optimization**:
  Many auto repair shop PCs in emerging markets are budget laptops with `768px` vertical resolution.
  - Page headings and card headers are compact (`padding: 16px 20px`).
  - Table wrapping limits vertical waste.
  - Fixed elements do not consume more than 15% of vertical viewport height.

### 5.4 Desktop & Ultra-Wide Monitors (1440p, 4K, 21:9 Displays)
- **Max Content Bounding Box**:
  Content wrapper enforces `max-width: 1720px; margin: 0 auto;`.
- **Card Grid Expansion**:
  Dashboard KPI metrics expand gracefully to 4 or 6 columns without stretching numbers into thin ribbons.
- **High-DPI Font Crispness**:
  Typography leverages `-webkit-font-smoothing: antialiased` with subtle optical weight adjustments for ultra-sharp rendering on 4K/Retina displays.

---

## 6. STEP-BY-STEP IMPLEMENTATION ROADMAP FOR CLAUDE CODE

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    RESPONSIVE IMPLEMENTATION ROADMAP                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Phase 1: Breakpoint Foundations, Fluid Typography & iOS Zoom Fix          â”‚
â”‚  Phase 2: Mobile Navigation, Drawer & Sticky Cashier Bottom Bar             â”‚
â”‚  Phase 3: Adaptive Data Tables (Inventory, Customers, Documents)            â”‚
â”‚  Phase 4: Document & Invoice Builder Mobile Overhaul                        â”‚
â”‚  Phase 5: Dialogs to Bottom-Sheets & Touch Input Scaling                    â”‚
â”‚  Phase 6: Dashboard SVG Charts & Large Screen Optimization                  â”‚
â”‚  Phase 7: End-to-End Cross-Device Testing & Verification                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

> âš ï¸ **RULE FOR CLAUDE CODE / AI AGENT**:  
> Execute ONE phase at a time. Run tests, verify with Chrome DevTools device mode across all 6 breakpoints, and commit code BEFORE proceeding.

---

### Phase 1: Breakpoint Foundations, Fluid Typography & iOS Zoom Fix

#### 1. Objectives
- Update viewport meta tag in `src/app/layout.tsx` for iOS notch safe areas and soft keyboard resize behavior.
- Define CSS breakpoint tokens and fluid typography variables in `src/app/globals.css`.
- Fix the iOS Safari 16px font-size auto-zoom issue across all text inputs, selects, and textareas.
- Enforce touch target minimums ($\ge 44\text{px}$) across utility buttons and steppers.

#### 2. Key Code Changes
- **`src/app/layout.tsx`**: Add `viewport-fit=cover, interactive-widget=resizes-content` to viewport metadata.
- **`src/app/globals.css`**:
  - Add `:root` responsive layout tokens (`--container-max-width: 1720px`).
  - Add `@media (max-width: 768px)` input override: `font-size: 16px !important;`.
  - Add safe-area padding helpers: `padding-top: env(safe-area-inset-top);`, `padding-bottom: env(safe-area-inset-bottom);`.

#### 3. Verification & Test Steps
1. In Chrome DevTools, toggle Device Toolbar (iPhone 14 Pro, 393Ã—852).
2. Tap inside every input field (search box, category filter, part price input).
3. Verify that the browser does not trigger unexpected zoom or shift.
4. Verify safe area padding does not collide with notch or home indicator.
5. Commit: `git add . && git commit -m "feat(responsive): phase 1 - breakpoint tokens, safe area insets and ios zoom fix"`

---

### Phase 2: Mobile Navigation, Drawer & Sticky Cashier Bottom Bar

#### 1. Objectives
- Refactor `src/components/shared/app-sidebar.tsx` and `mobile-nav.tsx` for smooth touch gestures and backdrop blur.
- Ensure the drawer slide-out animation is $60\text{fps}$ hardware-accelerated (`transform: translate3d`).
- Compact the topbar on mobile ($56\text{px}$ height) with optimized icon alignment.
- Implement the sticky mobile cashier bottom bar for document editing routes.

#### 2. Key Code Changes
- **`src/components/shared/app-sidebar.tsx`**: Add touch swipe-to-close listener; ensure full brand lockup and labels inside drawer.
- **`src/components/shared/top-navbar.tsx`**: Compact profile avatar, collapse global search to touch button with instant modal search.
- **`src/components/quotes/mobile-action-bar.tsx`**: Create sticky bottom checkout/save bar for mobile viewports.

#### 3. Verification & Test Steps
1. In mobile emulation (375px width), tap `â˜°` menu button: drawer opens smoothly.
2. Tap backdrop scrim or swipe left: drawer closes cleanly.
3. Open `/invoices/new`: verify sticky bottom bar shows grand total and "Save Invoice" button above the thumb zone.
4. Rotate screen to landscape: verify layout reflows without content overlap.
5. Commit: `git add . && git commit -m "feat(responsive): phase 2 - hardware accelerated mobile drawer and sticky cashier bar"`

---

### Phase 3: Adaptive Data Tables (Inventory, Customers, Documents)

#### 1. Objectives
- Create a reusable responsive table wrapper pattern: Full table on desktop/tablet, adaptive cards on mobile ($< 768\text{px}$).
- Implement adaptive card views for:
  - **Inventory List** ([InventoryTable](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/inventory/inventory-table.tsx)): Card displays part name, SKU, category badge, available/reserved stock badge, price, and tap-for-details action.
  - **Customer Directory** ([CustomerTable](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/customers/customer-table.tsx)): Card displays customer name, type badge, quick-call / WhatsApp button, balance due, and quote count.
  - **Documents List** ([DocumentTable](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/quotes/document-pages.tsx)): Card displays invoice number, status stamp, customer name, date, total, and balance.

#### 2. Key Code Changes
- **`src/components/inventory/inventory-table.tsx`**: Add `.table-desktop-view` and `.table-mobile-cards` sub-components.
- **`src/components/customers/customer-table.tsx`**: Add mobile card reflow with clickable WhatsApp button.
- **`src/components/quotes/document-pages.tsx`**: Add mobile card layout with status badges.
- **`src/app/globals.css`**: Add styling rules for `.mobile-card`, `.mobile-card-header`, `.mobile-card-body`, `.mobile-card-footer`.

#### 3. Verification & Test Steps
1. Open `/inventory` on desktop (1920px): full 9-column table displays.
2. Resize viewport to 390px (iPhone): table automatically hides; clean card stack renders.
3. Test search and category filters: cards update instantly with zero horizontal overflow.
4. Repeat test on `/customers` and `/invoices`.
5. Commit: `git add . && git commit -m "feat(responsive): phase 3 - adaptive table to card transformation for inventory, customers and documents"`

---

### Phase 4: Document & Invoice Builder Mobile Overhaul

#### 1. Objectives
- Overhaul [QuoteBuilder](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/quotes/quote-builder.tsx) for small viewports ($< 1024\text{px}$).
- Transform the line items table on mobile into touch-friendly item cards:
  - Large quantity stepper ($+$ and $-$ buttons $\ge 44\text{px}$).
  - Clean unit price, discount, and sale price summary.
  - Single-tap delete with confirmation.
- Stack document header (Customer info, Bill-to, Document dates, Due date, Status) into a clean touch card on mobile.
- Make the "Add Part / Item" search experience full-screen on mobile.

#### 2. Key Code Changes
- **`src/components/quotes/quote-builder.tsx`**: Implement conditional mobile line-item card rendering.
- **`src/components/quotes/line-search.tsx`**: On mobile, render as a bottom-sheet search dialog with large category chips.
- **`src/app/globals.css`**: Responsive styling for `.mobile-line-card`, `.stepper-button`, `.doc-header-card`.

#### 3. Verification & Test Steps
1. Open `/invoices/new` on mobile viewport (375px).
2. Tap "Search or add part": full-screen search sheet appears. Tap an item: item adds to invoice.
3. In line items, tap $+$ on quantity stepper: quantity increments, total updates immediately.
4. Scroll down: verify sticky bottom bar displays correct grand total.
5. Tap "Save Invoice": invoice saves, toast appears, redirects to invoice detail view cleanly.
6. Commit: `git add . && git commit -m "feat(responsive): phase 4 - touch friendly invoice builder and mobile line items"`

---

### Phase 5: Dialogs to Bottom-Sheets & Touch Input Scaling

#### 1. Objectives
- Convert dialog modals ([AddItemDialog](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/inventory/inventory-item-dialog.tsx), [AddCustomerDialog](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/customers/customer-table.tsx), [PaymentDialog](file:///d:/SpicedProjects/Projects/carshop_pos/src/components/quotes/payment-dialog.tsx)) into **Bottom-Sheets** on screens $< 768\text{px}$.
- Ensure modal action buttons (Save / Cancel) stay pinned at the bottom and are never pushed off-screen by virtual keyboards.
- Optimize the Year $\rightarrow$ Make $\rightarrow$ Model cascading dropdowns for touch tapping.
- Make category selector tree touch-friendly with larger tap targets and clear expansion toggles.

#### 2. Key Code Changes
- **`src/components/ui/dialog.tsx`**: Add responsive sheet transformation styles (`@media (max-width: 768px)` modal becomes bottom drawer).
- **`src/components/inventory/category-picker.tsx`**: Increase `.cat-toggle` and `.cat-pick` height to $\ge 40\text{px}$ on touch devices.
- **`src/app/globals.css`**: Styles for `.bottom-sheet`, `.sheet-handle`, `.sticky-modal-footer`.

#### 3. Verification & Test Steps
1. On a mobile viewport, tap "Add New Part" in Inventory: bottom sheet slides up from bottom with top handle.
2. Select Year $\rightarrow$ Make $\rightarrow$ Model: dropdowns open smoothly; selected chips display with easy-to-tap remove 'X'.
3. Open on real mobile device or simulated virtual keyboard: verify Save Part button remains accessible.
4. Commit: `git add . && git commit -m "feat(responsive): phase 5 - modal to bottom sheet transformation and touch target scaling"`

---

### Phase 6: Dashboard SVG Charts & Large Screen Optimization

#### 1. Objectives
- Make SVG bar charts and donut charts fully responsive with fluid coordinate viewBoxes.
- Refactor the Date Range Picker Popover: on mobile, display as a native date drawer with easy presets.
- Enhance large screen ($\ge 1536\text{px}$) experience with max content bounding boxes and balanced column grids.
- Ensure 4K monitors and ultra-wide screens render with crisp typography and proportional white space.

#### 2. Key Code Changes
- **`src/components/dashboard/dashboard-charts.tsx`**: Update SVG containers with `viewBox`, `preserveAspectRatio`, and responsive font sizes.
- **`src/components/dashboard/date-range-picker.tsx`**: Adapt mobile calendar view (single month view on mobile, dual month on desktop).
- **`src/app/globals.css`**: Add `.app-container-max` (`max-width: 1720px; margin: 0 auto;`).

#### 3. Verification & Test Steps
1. Open `/dashboard` on mobile (360px): Bar chart scales without horizontal clipping; date labels readable.
2. Open Date Range Picker on mobile: single-column layout fits within screen width.
3. Open on 1440p / 4K monitor (2560px width): content does not stretch into an unreadable thin line; margins balance naturally.
4. Commit: `git add . && git commit -m "feat(responsive): phase 6 - fluid svg charts, mobile date picker and ultrawide containment"`

---

### Phase 7: End-to-End Cross-Device Testing & Verification

#### 1. Objectives
- Perform comprehensive device simulation testing across all standard profiles:
  - **Mobile Small**: iPhone SE (375 Ã— 667)
  - **Mobile Medium**: iPhone 14 Pro / Pixel 8 (393 Ã— 852)
  - **Mobile Large / Phablet**: iPhone 15 Pro Max (430 Ã— 932)
  - **Foldable**: Samsung Galaxy Z Fold 5 (Unfolded: 768 Ã— 904, Folded: 344 Ã— 882)
  - **Tablet Portrait**: iPad 10th Gen (810 Ã— 1080)
  - **Tablet Landscape**: iPad Pro 11" (1194 Ã— 834)
  - **Laptop Budget**: Standard Windows 1366 Ã— 768
  - **Laptop High-DPI**: MacBook Air 13" (1440 Ã— 900)
  - **Desktop 1080p**: Standard 1920 Ã— 1080
  - **Ultra-Wide**: 2560 Ã— 1440 / 3440 Ã— 1440
- Check for zero console errors, zero layout shifts (CLS), and pass all automated lint and build checks.

#### 2. Execution Command
```bash
npm run lint && npm run build
```

---

## 7. READY-TO-RUN CLAUDE CODE TERMINAL PROMPTS

Use these exact prompts in your terminal to instruct Claude Code to execute each phase sequentially:

### Prompt for Phase 1:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 1: Breakpoint Foundations, Fluid Typography & iOS Zoom Fix'. Update src/app/layout.tsx with the enhanced viewport metadata, add the breakpoint tokens and safe area helpers to src/app/globals.css, implement the iOS Safari 16px input zoom fix, verify with npm run build, and commit once tested."
```

### Prompt for Phase 2:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 2: Mobile Navigation, Drawer & Sticky Cashier Bottom Bar'. Optimize app-sidebar.tsx and mobile-nav.tsx for hardware-accelerated drawer transitions, compact the topbar on mobile, implement the sticky mobile action bar for quote/invoice builder routes, test on mobile emulation, and commit."
```

### Prompt for Phase 3:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 3: Adaptive Data Tables'. Implement the adaptive table-to-card pattern for InventoryTable, CustomerTable, and DocumentTable. Verify that tables reflow into clean touch cards on screens under 768px with zero horizontal scrollbar, test, and commit."
```

### Prompt for Phase 4:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 4: Document & Invoice Builder Mobile Overhaul'. Overhaul QuoteBuilder for mobile viewports: transform line items into mobile touch cards with large stepper buttons, convert line-search into a full-screen mobile search sheet, connect the sticky bottom checkout bar, test thoroughly, and commit."
```

### Prompt for Phase 5:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 5: Dialogs to Bottom-Sheets & Touch Input Scaling'. Convert AddItemDialog, AddCustomerDialog, and PaymentDialog into mobile bottom-sheets on viewports under 768px. Ensure action buttons stay pinned above virtual keyboards, scale category tree tap targets to 44px, test on mobile, and commit."
```

### Prompt for Phase 6:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 6: Dashboard SVG Charts & Large Screen Optimization'. Make dashboard SVG charts fluidly responsive, optimize the date range picker for mobile screens, add container max-width containment for 4K and ultrawide displays, test, and commit."
```

### Prompt for Phase 7:
```bash
claude "Read docs/cross_compatibility.md section 'Phase 7: End-to-End Cross-Device Testing & Verification'. Run full lint and production build checks, audit all 10 device viewport profiles in Chrome DevTools, verify zero horizontal overflow anywhere, and create a final commit."
```

---
*End of Specification. Save as `docs/cross_compatibility.md` and execute systematically.*

