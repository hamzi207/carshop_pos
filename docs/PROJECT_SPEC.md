# PROJECT_SPEC.md: Master Architecture & Implementation Specification
## B2B SaaS POS & Quoting Engine for Automotive Accessory Sellers & Retailers (Wrap, Tint, Audio, Aftermarket Parts)

> **Document Status**: Production Blueprint / Master Instruction Manual  
> **Target Audience**: AI Coding Agents (Claude Code, Antigravity) & Lead Engineers  
> **Application Type**: Multi-Tenant B2B SaaS (Cloud POS & Quoting Engine)  
> **Release Target**: Phase 1 MVP (Inventory, Quoting, Customer Directory, YMM Engine)
> **Current Standing (2026-10-17)**: Phases 1–8 are built and committed (latest: `60e619a` "Phase 8"); Phase 9 is built, awaiting commit; Phases 10–15 (§8) are next, one at a time. Sections 1–6 are the original blueprint. §7 records exactly what each completed phase built (the app as it is today) and §8 lists only what is still to build; where §1–6 differ (e.g. the schema in §3, `process_quote_payment`, the vehicle picker on quotes), §7 and `supabase/migrations/` are authoritative.

---

## 1. PROJECT OVERVIEW & ARCHITECTURE

### 1.1 Product Vision
Car accessory sellers and retailers (distributing window tint rolls, vehicle vinyl wraps, paint protection film [PPF], 12V audio electronics, lighting, and aftermarket styling accessories) operate in a fast-paced environment where parts, accessories, and film rolls are strictly vehicle-specific.

While these businesses are primarily **sellers and retailers** (supplying walk-in retail customers, wholesale dealership accounts, and commercial fleet clients), some shops also offer optional on-site fitting or installation services from time to time. A standard general-purpose POS fails because it lacks **Year/Make/Model (YMM)** compatibility checks, product fitment filtering, and the flexibility to seamlessly quote physical products with or without optional service/labor charges.

**Phase 1 Objective**: Deliver a streamlined, lightning-fast B2B Inventory Management and Quoting engine tailored for automotive accessory sellers, retail shops, and specialty aftermarket distributors (with support for optional installation/labor services when offered). 

### 1.2 Technology Stack
| Layer | Technology | Selection Rationale |
| :--- | :--- | :--- |
| **Framework** | **Next.js 14+ (App Router)** | Server Components for instant load speeds, Server Actions for mutations, optimal SEO and routing. |
| **Language** | **TypeScript (Strict Mode)** | End-to-end type safety across database entities, API contracts, and UI components. |
| **Styling** | **Tailwind CSS** | Utility-first styling with tight design tokens, zero runtime overhead. |
| **UI Components** | **shadcn/ui + Radix UI** | Accessible, headless, customizable primitives (Dialog, Select, Command, Popover, Table, Toasts). |
| **Icons** | **Lucide React** | Consistent, lightweight SVG icon system. |
| **State & Forms** | **React Hook Form + Zod** | High-performance schema-validated form state management. |
| **Database & Auth** | **Supabase (PostgreSQL + Auth)** | Managed PostgreSQL with native Row Level Security (RLS), real-time primitives, and JWT auth. |
| **Document Engine** | **@react-pdf/renderer** | Deterministic, pixel-perfect vector PDF generation for quotes and invoices. |
| **Email Engine** | **Resend** | High-deliverability transactional email delivery for onboarding, password resets, quotes/invoices, receipts, and staff invites. |
| **External Data** | **NHTSA vPIC API** | Free, authoritative US Department of Transportation vehicle database for Year/Make/Model cataloging. |

### 1.3 Supabase Project Configuration & AI Tooling
- **Supabase Project Reference ID**: `atjbxwhvtattwiivrqbe`
- **Project URL**: `https://atjbxwhvtattwiivrqbe.supabase.co`
- **Supabase MCP Server (For Claude Code & Cursor)**:
  ```bash
  claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=atjbxwhvtattwiivrqbe&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
  ```
- **Supabase Agent Skills**:
  ```bash
  npx skills add supabase/agent-skills
  ```
  *Empowers AI coding agents with direct Supabase CLI commands, schema inspection, database debugging, and type generation.*

### 1.4 UI Reference Implementation: Figma Code Export (`./design/figma-ui/`)
The visual design for this application has already been generated from the Figma prompt and is saved as a complete, working React + Tailwind CSS project in the repository:
- **Location**: `./design/figma-ui/`
- **Master UI Component**: `design/figma-ui/src/App.tsx` (Contains complete interactive screens, navigation, layout, modals, and status badges for Dashboard, Quotes, Inventory, and Customers).
- **Design Tokens & Theme CSS**: `design/figma-ui/src/index.css` (Contains the exact color tokens, dark slate structure, badges, buttons, and responsive styles).
- **Directive for Claude Code / Antigravity**: Use `./design/figma-ui/` as the visual and component reference. Port, modularize, and adapt these components into the Next.js App Router structure in `src/app/` and `src/components/`. Do not reinvent the UI from scratch!

---

### 1.5 Multi-Tenant Architecture & The RLS "Digital Lock"
The application uses a **Shared Database, Shared Schema, Row-Level Isolation** architecture. Every business operating on the platform is assigned an isolated `tenant_id` (UUID). 

```
                                  [ Incoming Request ]
                                           │
                                  [ Supabase Auth JWT ]
                                           │
                           (Extracts auth.uid() -> tenant_id)
                                           │
                ┌──────────────────────────┴──────────────────────────┐
                ▼                                                     ▼
     ┌───────────────────────┐                             ┌───────────────────────┐
     │  Shop A (Tenant A)    │                             │  Shop B (Tenant B)    │
     │  Quotes & Inventory   │                             │  Quotes & Inventory   │
     └───────────────────────┘                             └───────────────────────┘
                ▲                                                     ▲
                └────────────── [ PostgreSQL RLS ENGINE ] ────────────┘
                              "Digital Lock" Prevents Any
                              Cross-Tenant Data Leakage
```

#### How the "Digital Lock" Works:
1. **User Membership**: Every authenticated user in `auth.users` maps to a record in `public.profiles`, containing a foreign key `tenant_id` pointing to `public.tenants`.
2. **Context Helper Function**: A PostgreSQL security definer function `current_tenant_id()` extracts the tenant ID belonging to the caller:
   ```sql
   create or replace function public.current_tenant_id()
   returns uuid as $$
     select tenant_id from public.profiles where id = auth.uid();
   $$ language sql stable security definer;
   ```
3. **Row Level Security (RLS) Enforcement**: Every multi-tenant table (`inventory_items`, `customers`, `quotes`, etc.) has a mandatory `tenant_id` column and an active RLS policy:
   ```sql
   alter table public.inventory_items enable row level security;

   create policy "Tenant isolation for inventory_items"
   on public.inventory_items
   for all
   using (tenant_id = public.current_tenant_id())
   with check (tenant_id = public.current_tenant_id());
   ```
4. **Leak-Proof Guarantee**: Even if an attacker manipulates API requests, queries the database directly with client-side Supabase tokens, or exploits a frontend bug, PostgreSQL physically blocks access to rows belonging to any other `tenant_id`.

---

## 2. CORE FEATURES TO BUILD (STRICT SCOPE)

### 2.1 Scope Boundary Matrix
AI agents implementing this project must adhere strictly to the boundaries defined below.

| Category | IN SCOPE (Build This) | OUT OF SCOPE (DO NOT BUILD) |
| :--- | :--- | :--- |
| **Payments** | Manual payment logging (Cash, Bank Transfer, Card Terminal, Check), quick cash buttons, 80mm thermal POS receipt printing. | **NO** Stripe, PayPal, Square, or online payment gateways. |
| **Inventory** | On-hand quantity, low-stock threshold alert, Cost price, Retail price, SKU, YMM fitment vs Universal Fit, CSV bulk import/export. | **NO** multi-warehouse bin/aisle tracking, RFID hardware, or serial number tracking. |
| **Vehicle Data** | NHTSA vPIC Year, Make, Model selection (model years 1960–2026). | **NO** complex 17-digit VIN decoding, engine code lookups, or OBD-II diagnostics. |
| **Messaging & Email** | WhatsApp click-to-chat links with pre-composed text/PDF links + Resend transactional email engine. | **NO** Twilio WhatsApp Business API or automated SMS webhooks. |
| **Quoting & POS** | Line items for physical inventory parts + optional labor/service fees, discounts, tax rate, PDF generation, status pipeline, 80mm thermal receipts. | **NO** complex multi-tiered commission splits or recurring billing subscriptions. |
| **Platform Administration** | Superadmin Control Plane (`/admin`) for SaaS owners to manage tenants, users, company details, password resets, and support impersonation. | **NO** public access; strictly guarded by `is_superadmin` flag. |
| **Device Compatibility** | Adaptive responsive design across Mobile, Tablet, Laptop, Desktop, and Ultrawide/4K displays with touch ergonomics. | **NO** native iOS/Android binary apps (PWA / responsive web app). |

---

### 2.2 Feature Specifications

#### Feature A: Multi-Shop Authentication & Settings
- **Shop Registration**: Sign up with Owner Name, Email, Password, and Shop Name. Creates a `tenants` row and a linked `profiles` row with the `admin` role.
- **Shop Profile & Settings**:
  - Shop Name, Physical Address, Contact Phone, Support Email.
  - Shop Logo upload (stored in Supabase Storage bucket `shop-assets`).
  - Tax Rate / VAT % (e.g., 8.25% or 20%).
  - Quote Disclaimer & Terms (e.g., *"All tint warranties require 48 hours cure time without rolling windows down"*).
  - Currency: `Rs.` (default) or `PKR`, chosen per shop. See §2.3.
  - Timezone: `Asia/Karachi` (Islamabad / Karachi, PKT) by default. See §2.3.
  - International phone numbers: off by default; shops with overseas clients can switch it on. See §2.3.
- **User Management**: Admins can invite staff members to their shop tenant via email.

#### Feature B: The YMM Inventory Engine
- **Item Fields**:
  - `sku`: Unique item code (auto-generated or manual).
  - `name`: e.g., "Ceramic IR Window Film 20% - 40in x 100ft", "Avery Dennison Gloss Black Vinyl", "Focal 6.5\" Component Speakers".
  - `category`: Preset categories (`Window Film`, `Vinyl Wrap`, `PPF`, `Car Audio`, `Accessories`, `Hardware / Chemicals`).
  - `cost_price`: Wholesale purchase price.
  - `selling_price`: Retail price charged to customer.
  - `quantity_on_hand`: Current physical stock level.
  - `low_stock_threshold`: Default is 5. When `quantity_on_hand <= low_stock_threshold`, visual warning badges appear.
  - `is_universal`: Boolean flag.
- **Compatibility Engine**:
  - If `is_universal = true`, the item is available for every vehicle quote.
  - If `is_universal = false`, the item must be mapped to one or more `vehicles` records via the `item_vehicle_compatibility` junction table.

#### Feature C: B2B Customer Directory
- **Client Profiles**:
  - Client Name / Company Name (e.g., "Apex Auto Dealership", "Metro Fleet Logistics", "John Smith").
  - Customer Type: `Dealership`, `Fleet Account`, `Retail Customer`.
  - Contact Person & Position.
  - WhatsApp Number: Required. Pakistani mobile in local format by default (e.g., `0300-1234567`); international `+` numbers only when the shop allows them. See §2.3.
  - Email Address.
  - Billing Address & Tax ID / VAT Number.
  - Customer History View: Chronological list of all past quotes and invoices with payment status.

#### Feature D: Quoting & Invoicing Pipeline (The Core Engine)
1. **Quote Creation Wizard**:
   - **Step 1: Customer Selection**: Searchable dropdown of existing customers or quick modal to create a new one.
   - **Step 2: Vehicle Selection**: Cascading dropdowns: `Year` -> `Make` -> `Model`. (Optional: Freeform notes for sub-trim, e.g., "M Sport Package").
   - **Step 3: Magic Fit Inventory Filtering**: When a vehicle is selected, the inventory selection table automatically filters to show:
     $$\text{Visible Items} = \{ \text{Items where } is\_universal = \text{true} \} \cup \{ \text{Items mapped to chosen Vehicle ID} \}$$
   - **Step 4: Optional Labor & Services**: For sellers that offer fitting/installation as an add-on, allow adding custom service/labor line items (e.g., "Installation Labor - 2 Hours", "Custom Fitting Fee"). For parts-only sellers, quotes are generated purely from physical inventory parts without any labor items.
   - **Step 5: Dynamic Totals**: Subtotal, line-item discounts, shop tax rate calculation, and grand total.
2. **Status Pipeline**:
   - Status transitions: `draft` $\rightarrow$ `sent` $\rightarrow$ `accepted` $\rightarrow$ `invoiced` $\rightarrow$ `paid` (or `cancelled`).
   - Shown to users as three separate sections, **Drafts**, **Quotations** and **Invoices**, with one-click conversions (Draft → Quotation or Invoice, Quotation → Invoice). See §7 Phase 5.
3. **One-Click Professional PDF Generation**:
   - Clean, automotive-branded PDF invoice/quote template generated on demand.
   - Includes Shop Logo, Shop Details, Customer Details, Vehicle YMM, Itemized Table (Parts & Labor), Totals, and Disclaimer.
4. **Direct WhatsApp Sharing**:
   - A single-click button: `"Share via WhatsApp"`.
   - Generates a `https://wa.me/{phone}?text={encoded_message}` deep link.
   - Pre-fills a professional message containing: Shop Name, Quote Number, Vehicle Details, Total Amount, and a secure public view link for the PDF.
5. **Manual Payment** (changed by `docs/changes.md` §5: stock now moves with the document stage, not with payment):
   - Stock: quotations reserve their parts (`inventory_items.reserved_quantity`); issuing an invoice (directly or from a quotation) releases any reservation and deducts `quantity_on_hand`. Drafts hold nothing. Cancelling, deleting or moving a quotation back to drafts releases its reservation. Nothing can take more than is available (on hand − reserved). This is enforced by the `quote_items_sync_stock` trigger, so `quotes.inventory_deducted` simply mirrors "invoiced or paid".
   - Payments (built with `docs/changes.md` round 2): each payment is a row in `invoice_payments` (amount, method `Cash` / `Card Terminal` / `Bank Transfer` / `Check`, date, notes). A trigger keeps `quotes.amount_paid`, and the invoice becomes `paid` automatically once payments cover the total (`process_quote_payment` was removed). Payments never touch stock.
   - Invoice statuses shown: **Pending / Unpaid**, **Partially Paid** (some payments), **Due** (unpaid after `due_date`: the invoice date + the customer's `credit_days`, editable per invoice), **Paid**, **Cancelled** (stored as `void`; its stock is given back).
   - "Mark Unpaid" removes an invoice's payments. Anything without payments (drafts, quotations, unpaid or cancelled invoices) can be deleted, which gives back any stock it held.
   - Lines: inventory parts are sold at their inventory price (fixed); the discount is per unit (% or Rs.); sale price = unit price − discount; line total = qty × sale price. Custom items not in inventory can be added with their own price and don't affect stock. Vehicles are no longer chosen on documents.

### 2.3 Localization: Pakistan (Default Market)
The product targets Pakistani shops and sellers first. These defaults apply to every shop; the per-shop options are set on the shop Settings page.

| Setting | Default | Per-shop option |
| :--- | :--- | :--- |
| **Currency** | `Rs.` | `Rs.` or `PKR` (no other currencies) |
| **Timezone** | `Asia/Karachi` (PKT, UTC+5; covers Islamabad and Karachi) | Any IANA timezone, chosen in Settings |
| **Phone numbers** | Pakistani local format starting with `0` | Allow international numbers with a `+` country code |

- **Currency display**: symbol, a space, then the amount with thousands separators: `Rs. 12,500.00` / `PKR 12,500.00`.
- **Timezone**: all dates and times shown to users (quote dates, paid-at, "today" on the dashboard) are rendered in the shop's timezone. The database keeps storing `timestamptz` (UTC).
- **Phone numbers**:
  - **Pakistani numbers (always accepted)**: entered in local format starting with `0`. Mobiles are 11 digits starting `03` (e.g., `0300-1234567`). Landlines are 10–11 digits with an area code (e.g., `051-1234567`, `042-35123456`). Spaces, dashes and brackets are ignored. `+92` / `0092` / `92` forms are accepted and converted to the `0` format.
  - **WhatsApp number**: must be a mobile (`03…`) when Pakistani, since landlines can't use WhatsApp.
  - **International numbers**: accepted only when the shop has switched on international numbers, entered with a `+` country code (e.g., `+971501234567`, E.164: `^\+[1-9]\d{7,14}$`).
  - **Storage**: numbers are stored normalized in E.164 (`+923001234567`), so WhatsApp links (`https://wa.me/923001234567`) work for local and international clients alike. Pakistani numbers are always displayed back in local format (`0300-1234567`).

---

## 3. DATABASE SCHEMA & ROW LEVEL SECURITY (RLS)

### 3.1 PostgreSQL DDL (Full Schema)

```sql
-- =============================================================================
-- 1. EXTENSIONS & SETUP
-- =============================================================================
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 2. TENANTS TABLE (Each auto shop is a tenant)
-- =============================================================================
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  logo_url text,
  address text,
  phone text,
  email text,
  currency text not null default '$',  -- Phase 4: changed to 'Rs.' and limited to 'Rs.' / 'PKR' (§2.3)
  tax_rate numeric(5,2) not null default 0.00,
  quote_footer_notes text default 'All quotes are valid for 30 days. 50% deposit required on custom orders.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- 3. USER PROFILES TABLE (Linked to Supabase Auth)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'staff')) default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for RLS speed
create index idx_profiles_tenant_id on public.profiles(tenant_id);

-- Helper function to fetch current tenant id in RLS policies
create or replace function public.current_tenant_id()
returns uuid as $$
  select tenant_id from public.profiles where id = auth.uid();
$$ language sql stable security definer;

-- =============================================================================
-- 4. VEHICLES MASTER TABLE (Global reference data - NOT tenant-specific)
-- =============================================================================
create table public.vehicles (
  id serial primary key,
  year integer not null check (year between 1980 and 2035),
  make text not null,
  model text not null,
  trim text,
  created_at timestamptz not null default now(),
  constraint uq_vehicle_ymm unique (year, make, model, trim)
);

create index idx_vehicles_lookup on public.vehicles(year, make, model);

-- =============================================================================
-- 5. INVENTORY ITEMS TABLE (Tenant-specific)
-- =============================================================================
create table public.inventory_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text not null check (category in ('Window Film', 'Vinyl Wrap', 'PPF', 'Car Audio', 'Accessories', 'Hardware / Chemicals')),
  cost_price numeric(10,2) not null check (cost_price >= 0),
  selling_price numeric(10,2) not null check (selling_price >= 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  low_stock_threshold integer not null default 5,
  is_universal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_sku unique (tenant_id, sku)
);

create index idx_inventory_tenant on public.inventory_items(tenant_id);
create index idx_inventory_universal on public.inventory_items(tenant_id, is_universal);

-- =============================================================================
-- 6. ITEM-VEHICLE COMPATIBILITY JUNCTION TABLE
-- =============================================================================
create table public.item_vehicle_compatibility (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  constraint uq_item_vehicle unique (tenant_id, item_id, vehicle_id)
);

create index idx_compat_lookup on public.item_vehicle_compatibility(tenant_id, vehicle_id, item_id);

-- =============================================================================
-- 7. CUSTOMERS TABLE (Tenant-specific)
-- =============================================================================
create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  customer_type text not null check (customer_type in ('Dealership', 'Fleet Account', 'Retail Customer')) default 'Retail Customer',
  contact_person text,
  phone text,
  whatsapp_number text not null,
  email text,
  billing_address text,
  tax_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customers_tenant on public.customers(tenant_id);
create index idx_customers_whatsapp on public.customers(tenant_id, whatsapp_number);

-- =============================================================================
-- 8. QUOTES & INVOICES TABLE (Tenant-specific)
-- =============================================================================
create table public.quotes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_number text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id integer references public.vehicles(id) on delete set null,
  custom_vehicle_notes text,
  status text not null check (status in ('draft', 'sent', 'accepted', 'invoiced', 'paid', 'cancelled')) default 'draft',
  subtotal numeric(10,2) not null default 0.00,
  tax_rate numeric(5,2) not null default 0.00,
  tax_amount numeric(10,2) not null default 0.00,
  discount_amount numeric(10,2) not null default 0.00,
  total_amount numeric(10,2) not null default 0.00,
  payment_method text check (payment_method in ('Cash', 'Card Terminal', 'Bank Transfer', 'Check')),
  payment_notes text,
  paid_at timestamptz,
  inventory_deducted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tenant_quote_number unique (tenant_id, quote_number)
);

create index idx_quotes_tenant_status on public.quotes(tenant_id, status);
create index idx_quotes_customer on public.quotes(customer_id);

-- =============================================================================
-- 9. QUOTE LINE ITEMS TABLE
-- =============================================================================
create table public.quote_items (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  is_labor boolean not null default false,
  quantity numeric(10,2) not null default 1.00 check (quantity > 0),
  unit_cost numeric(10,2) not null default 0.00,
  unit_price numeric(10,2) not null default 0.00,
  total_price numeric(10,2) not null default 0.00,
  created_at timestamptz not null default now()
);

create index idx_quote_items_quote on public.quote_items(quote_id);
```

---

### 3.2 Row Level Security (RLS) Implementation

```sql
-- Enable RLS across all tenant-bound tables
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.item_vehicle_compatibility enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- -----------------------------------------------------------------------------
-- VEHICLES TABLE: Global read access for authenticated users
-- -----------------------------------------------------------------------------
create policy "Authenticated users can read global vehicles"
on public.vehicles for select
to authenticated
using (true);

-- -----------------------------------------------------------------------------
-- TENANTS TABLE: Users can view and update their own shop
-- -----------------------------------------------------------------------------
create policy "Users can view their own tenant"
on public.tenants for select
using (id = public.current_tenant_id());

create policy "Admins can update their own tenant"
on public.tenants for update
using (id = public.current_tenant_id())
with check (id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- PROFILES TABLE: Users view profiles in their tenant
-- -----------------------------------------------------------------------------
create policy "Users view profiles within their tenant"
on public.profiles for select
using (tenant_id = public.current_tenant_id());

create policy "Users can update their own profile"
on public.profiles for update
using (id = auth.uid());

-- -----------------------------------------------------------------------------
-- INVENTORY ITEMS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for inventory select"
on public.inventory_items for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory insert"
on public.inventory_items for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory update"
on public.inventory_items for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for inventory delete"
on public.inventory_items for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- ITEM VEHICLE COMPATIBILITY: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for compatibility select"
on public.item_vehicle_compatibility for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility insert"
on public.item_vehicle_compatibility for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for compatibility delete"
on public.item_vehicle_compatibility for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- CUSTOMERS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for customers select"
on public.customers for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers insert"
on public.customers for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers update"
on public.customers for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for customers delete"
on public.customers for delete
using (tenant_id = public.current_tenant_id());

-- -----------------------------------------------------------------------------
-- QUOTES & QUOTE ITEMS: Full tenant isolation
-- -----------------------------------------------------------------------------
create policy "Tenant isolation for quotes select"
on public.quotes for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes insert"
on public.quotes for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quotes update"
on public.quotes for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items select"
on public.quote_items for select
using (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items insert"
on public.quote_items for insert
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items update"
on public.quote_items for update
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy "Tenant isolation for quote_items delete"
on public.quote_items for delete
using (tenant_id = public.current_tenant_id());
```

---

### 3.3 Atomic Stock Deduction Stored Procedure
To prevent race conditions, negative inventory, or double deductions when an invoice is marked as paid:

```sql
create or replace function public.process_quote_payment(
  p_quote_id uuid,
  p_payment_method text,
  p_payment_notes text default null
)
returns void as $$
declare
  v_tenant_id uuid;
  v_already_deducted boolean;
  v_item record;
begin
  -- Validate tenant context
  v_tenant_id := public.current_tenant_id();

  -- Lock the quote row for update
  select inventory_deducted into v_already_deducted
  from public.quotes
  where id = p_quote_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Quote not found or unauthorized.';
  end if;

  if v_already_deducted then
    raise exception 'Inventory for this invoice has already been deducted.';
  end if;

  -- Loop through physical inventory items in the quote
  for v_item in
    select item_id, quantity
    from public.quote_items
    where quote_id = p_quote_id
      and item_id is not null
      and is_labor = false
  loop
    -- Deduct stock directly with atomic decrement
    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - v_item.quantity,
        updated_at = now()
    where id = v_item.item_id and tenant_id = v_tenant_id;
  end loop;

  -- Mark invoice as paid and inventory as deducted
  update public.quotes
  set status = 'paid',
      payment_method = p_payment_method,
      payment_notes = p_payment_notes,
      paid_at = now(),
      inventory_deducted = true,
      updated_at = now()
  where id = p_quote_id and tenant_id = v_tenant_id;

end;
$$ language plpgsql security definer;
```

---

## 4. EXTERNAL APIS & DATA SOURCES: NHTSA vPIC ENGINE

### 4.1 NHTSA vPIC Overview
The US National Highway Traffic Safety Administration (NHTSA) provides a free, public REST API with zero API key requirement. We use it to populate our master `vehicles` database so users can effortlessly select Years, Makes, and Models without typing them manually.

### 4.2 Endpoint Specifications

#### 1. Fetch Passenger Car & Truck Makes
```http
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/car?format=json
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/truck?format=json
```
- **Response Format**:
  ```json
  {
    "Count": 128,
    "Message": "Response returned successfully",
    "Results": [
      { "MakeId": 440, "MakeName": "ASTON MARTIN", "VehicleTypeId": 2, "VehicleTypeName": "Passenger Car" },
      { "MakeId": 448, "MakeName": "TOYOTA", "VehicleTypeId": 2, "VehicleTypeName": "Passenger Car" }
    ]
  }
  ```

#### 2. Fetch Models for a Specific Make & Model Year
```http
GET https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/{make}/modelyear/{year}?format=json
```
- **Example**: `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/Toyota/modelyear/2023?format=json`
- **Response Format**:
  ```json
  {
    "Count": 24,
    "Message": "Response returned successfully",
    "Results": [
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1861, "Model_Name": "Camry" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1863, "Model_Name": "Corolla" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1883, "Model_Name": "RAV4" },
      { "Make_ID": 448, "Make_Name": "TOYOTA", "Model_ID": 1888, "Model_Name": "Tacoma" }
    ]
  }
  ```

---

### 4.3 Ingestion Strategy & Seed Script (`scripts/seed-vehicles.ts`)
Rather than querying the NHTSA API in real-time during user quoting (which introduces network latency and third-party downtime risk), we pre-seed the top 20 automotive makes across model years 2015 to 2026 into the Supabase `vehicles` table.

```typescript
// scripts/seed-vehicles.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypass RLS for master vehicle data
);

const TARGET_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const TARGET_MAKES = [
  'Toyota', 'Ford', 'Chevrolet', 'Honda', 'Nissan', 'Jeep', 'Ram', 
  'Subaru', 'GMC', 'BMW', 'Mercedes-Benz', 'Audi', 'Tesla', 'Porsche', 
  'Lexus', 'Hyundai', 'Kia', 'Dodge', 'Cadillac', 'Volkswagen'
];

interface NhtsaModelResult {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedVehicles() {
  console.log('🚀 Starting NHTSA vPIC Seed Engine...');

  for (const year of TARGET_YEARS) {
    for (const make of TARGET_MAKES) {
      try {
        console.log(`Fetching: ${year} ${make}...`);
        const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        
        const data = await res.json();
        const models: NhtsaModelResult[] = data.Results || [];

        const rows = models.map((m) => ({
          year,
          make: m.Make_Name.toUpperCase().trim(),
          model: m.Model_Name.trim(),
        }));

        if (rows.length > 0) {
          const { error } = await supabase
            .from('vehicles')
            .upsert(rows, { onConflict: 'year,make,model,trim' });

          if (error) console.error(`DB Insert Error (${year} ${make}):`, error.message);
          else console.log(`✅ Saved ${rows.length} models for ${year} ${make}`);
        }

        // Polite delay to avoid API rate limiting
        await sleep(300);
      } catch (err: any) {
        console.error(`Failed ${year} ${make}:`, err.message);
      }
    }
  }
  console.log('🏁 NHTSA Vehicle seeding complete.');
}

seedVehicles();
```

---

## 5. GITHUB REPOSITORY STRUCTURE

```
carshop_pos/
├── .env.example
├── .gitignore
├── README.md
├── docs/
│   ├── PROJECT_SPEC.md                  <-- This specification manual
│   ├── FOUNDER_SETUP_GUIDE.md
│   └── supabase-mcp-setup.md
├── design/
│   └── figma-ui/                        <-- Figma UI export (reference only, not built)
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── scripts/
│   └── seed-vehicles.mts               <-- NHTSA vPIC ingestion script
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20261014193854_initial_schema.sql
│       ├── 20261014193915_rls_policies.sql
│       ├── 20261014193924_payment_procedure.sql
│       └── ...                         <-- one file per later change; names match the remote migration history
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                    <-- Marketing / Landing page
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   └── layout.tsx
    │   └── (dashboard)/
    │       ├── layout.tsx              <-- Multi-tenant shell with sidebar
    │       ├── dashboard/page.tsx      <-- Key stats, low stock alerts, pipeline
    │       ├── inventory/
    │       │   ├── page.tsx            <-- Inventory list, stock pills, filter
    │       │   ├── new/page.tsx        <-- Add part + YMM compatibility form
    │       │   └── [id]/edit/page.tsx
    │       ├── quotes/
    │       │   ├── page.tsx            <-- Quotes list & pipeline view
    │       │   ├── new/page.tsx        <-- Quoting Engine (Customer + YMM Magic Filter)
    │       │   └── [id]/
    │       │       ├── page.tsx        <-- Quote detail, WhatsApp dispatch, PDF button
    │       │       └── pdf/route.ts    <-- Server-side PDF render stream
    │       ├── customers/
    │       │   ├── page.tsx            <-- Customer Directory (WhatsApp, Type)
    │       │   ├── new/page.tsx
    │       │   └── [id]/page.tsx       <-- Customer purchase/quote history
    │       └── settings/
    │           └── page.tsx            <-- Shop Profile, Logo, Tax %, Terms
    ├── components/
    │   ├── ui/                         <-- shadcn/ui components (button, dialog, input, etc.)
    │   ├── dashboard/
    │   │   ├── stats-cards.tsx
    │   │   ├── low-stock-alert-card.tsx
    │   │   └── recent-quotes-table.tsx
    │   ├── inventory/
    │   │   ├── inventory-table.tsx
    │   │   ├── ymm-compatibility-selector.tsx
    │   │   └── stock-badge.tsx
    │   ├── quotes/
    │   │   ├── quote-wizard.tsx
    │   │   ├── magic-fit-filter.tsx    <-- YMM dynamic part selector
    │   │   ├── line-items-editor.tsx
    │   │   └── payment-modal.tsx       <-- Manual payment logger
    │   ├── pdf/
    │   │   ├── quote-pdf-document.tsx  <-- @react-pdf/renderer template
    │   │   └── quote-pdf-download-btn.tsx
    │   └── shared/
    │       ├── app-sidebar.tsx
    │       ├── top-navbar.tsx
    │       └── whatsapp-share-button.tsx
    └── lib/
        ├── supabase/
        │   ├── client.ts               <-- Browser client
        │   ├── server.ts               <-- Server Component client (cookies)
        │   └── middleware.ts           <-- Auth redirect & tenant session guard
        ├── types/
        │   └── database.types.ts       <-- Generated Supabase TypeScript types
        ├── utils/
        │   ├── currency.ts             <-- Format amounts with shop currency
        │   ├── whatsapp.ts             <-- URL deep-link & message composer
        │   └── ymm-filter.ts           <-- Fitment calculation helper
        └── validations/
            ├── inventory.schema.ts
            ├── quote.schema.ts
            └── customer.schema.ts
```

## 6. MASTER UI/UX GENERATION PROMPT (FOR FIGMA / AI UI TEMPLATES)

> 🟢 **STATUS**: **ALREADY GENERATED & AVAILABLE IN CODE**  
> The prompt below was executed in Figma, and the resulting complete React + Tailwind UI template is stored in `./design/figma-ui/`.  
> - Primary Component: `design/figma-ui/src/App.tsx`  
> - Styles & Tokens: `design/figma-ui/src/index.css`  
> AI Agents should inspect and adapt this existing code directly into the Next.js project.

The original prompt used to generate the UI:

---

```text
Design a complete, high-fidelity B2B SaaS web application UI template in Figma for "Apex Auto Accessories POS & Quoting Engine" — a modern Point of Sale, Inventory Management, and Quoting platform designed specifically for automotive accessory sellers, retailers, and aftermarket styling parts distributors (selling window tint rolls, vinyl wraps, PPF film, 12V audio electronics, lighting, and exterior accessories, with support for optional installation/fitting services).

### 1. DESIGN SYSTEM & VISUAL TOKENS (Desktop 1440px Canvas)
- **Aesthetic**: Sleek, precision-engineered automotive software. Dark-slate structural accents with a clean, high-contrast light workspace.
- **Color Palette**:
  - Primary / Surfaces: Clean slate background (`#F8FAFC`), crisp white elevated cards (`#FFFFFF`), borders (`#E2E8F0` / `#CBD5E1`).
  - Dark Structural Elements: Deep automotive slate (`#0F172A`, `#1E293B`) for sidebar and primary action buttons.
  - Accent & Brand: Electric Cobalt Blue (`#2563EB`) for primary focus and vehicle fitment badges.
  - WhatsApp & Paid Status: Vibrant Emerald Green (`#10B981`) for the "Share to WhatsApp" action and "Paid" invoice pills.
  - Alerts: Rose Red (`#F43F5E`) for low-stock threshold warning pills and restock alerts; Amber (`#F59E0B`) for pending quotes.
- **Typography**: Inter or Plus Jakarta Sans. Clean visual hierarchy: Page Titles (24px Bold), Section Headers (16px Semi-Bold), Body Text (14px Regular), Data Table & Labels (12–13px Medium), Monospace font for SKUs and VIN/Part codes.
- **Component Kit**: Modern rounded corners (8px–10px radius), subtle drop shadows (`shadow-sm`, `shadow-md`), clean badge pills, and Lucide automotive/commerce icons.

---

### 2. SCREEN 1: MAIN B2B STORE DASHBOARD (Store Overview & POS Hub)
- **Top Navigation Bar**:
  - Left: Shop switcher with custom logo ("Apex Auto Accessories - Downtown Store").
  - Center: Global search bar with shortcut key badge (`⌘K Search inventory, quotes, or customers...`).
  - Right: Quick notification bell with a rose badge ("4 Low Stock Alerts") and User Profile avatar dropdown ("Admin - Marcus Vance").
- **Key Performance Metrics (4 KPI Cards)**:
  - "Gross Revenue (This Month)": $48,250 (+14.2% vs last month).
  - "Active Quotes Pipeline": 16 quotes ($21,400 pending value).
  - "Low Stock Alerts": 4 items below threshold (rose red warning pill).
  - "Orders / Quotes Fulfilled": 42 orders completed this month.
- **Quick Action Bar**:
  - High-contrast primary button: `+ Create New Quote` (with car icon).
  - Secondary button: `+ Add Inventory Item`.
  - Secondary button: `+ Register Customer`.
- **Split Workspace Layout**:
  - **Left Section (65% width) - Recent Quotes & Invoices Pipeline**:
    - Data table columns: Quote # (e.g., `Q-1048`), Customer (e.g., "Metro Porsche Dealership"), Vehicle ("2024 Porsche 911 GT3"), Total Amount ($1,850.00), Status Pill (`Draft` = grey, `Sent` = blue, `Invoiced` = amber, `Paid` = emerald green), and Action icons (View, PDF Download, WhatsApp Share).
  - **Right Section (35% width) - Urgent Stock Restock Alerts Card**:
    - High-density card listing products where on-hand quantity $\le$ low-stock threshold.
    - Each row shows: SKU (`WF-CER-2040`), Product Name ("Suntek Carbon 20% 40in Roll"), Category tag ("Window Film"), a prominent warning pill ("2 rolls left (Min: 5)"), and a quick "Adjust Stock" button.

---

### 3. SCREEN 2: THE QUOTING ENGINE & YMM MAGIC FITMENT WIZARD (The Core Engine)
- **Quote Header Toolbar**:
  - Left: Back link, Quote title "Quote #Q-1042", Status Badge ("Draft").
  - Right Action Buttons: "Save Draft" (secondary outline), "Download PDF" (outline with file icon), "Share to WhatsApp" (emerald green with WhatsApp icon), and "Mark as Paid" (prominent dark primary button).
- **Top Card: Customer & Vehicle Cascading Selector**:
  - Customer Combobox: Searchable client selector with account badge ("Downtown Ford Fleet", "Dealership Account") and phone number.
  - Cascading 3-Step Vehicle Selector: Three linked dropdowns: `[Year: 2024]` $\rightarrow$ `[Make: Ford]` $\rightarrow$ `[Model: F-150 Lightning]`.
  - Live Fitment Indicator: A prominent electric-blue banner: `Vehicle Selected: 2024 Ford F-150 Lightning (Fits 14 catalog accessories)`.
- **Two-Column Interactive Quoting Workspace**:
  - **Left Column (60% width) - Magic Fit Accessory Selector & Line Items**:
    - *Accessory Picker*: Search input with toggle switch `"Show Only Compatible Parts"` (enabled by default). Table lists: SKU, Item Name, Category badge (e.g., 'Window Film', 'Audio Upgrade'), Retail Price, Stock Status ("12 in stock"), a subtle "Universal Fit" badge for universal rolls/accessories, and an `+ Add to Quote` button.
    - *Quote Line Items Table*: Reorderable list of chosen items with quantity stepper, unit price, line total, and remove button.
    - *Optional Fitting / Labor Services*: A dedicated button `+ Add Optional Fitting / Labor Service` allowing stores that provide installation to add custom labor fees (e.g., "Front Window Tint Installation - 1.5 Hours", "Speaker Fitting Fee"). For parts-only sellers, this section remains empty.
  - **Right Column (40% width) - Sticky Order Summary & Payment Drawer**:
    - Subtotal calculation: $630.00.
    - Discount field: Input box with % or $ toggle (-$30.00).
    - Shop Tax Rate (8.25%): $49.50.
    - Grand Total: $649.50 (bold, 28px text).
    - Payment Method Selector: Dropdown (`Cash`, `Card Terminal`, `Bank Transfer`, `Check`).
    - Internal Notes & Quote Disclaimer preview.

---

### 4. SCREEN 3: INVENTORY MANAGEMENT & VEHICLE FITMENT CATALOG
- **Top Filter Bar**:
  - Search input: Filter by SKU, Part Name, or Category.
  - Category Pills: `[All Items]` `[Window Film]` `[Vinyl Wrap]` `[PPF]` `[Car Audio]` `[Accessories]` `[Chemicals / Hardware]`.
  - Fitment Filter Dropdown: `[All Items]` `[Universal Fit Only]` `[Vehicle-Specific Only]`.
  - Action buttons: `+ Add New Part` and `Export CSV`.
- **Product Inventory Data Table**:
  - Columns:
    - SKU (Monospace font, e.g., `WF-IR-7040`).
    - Product Name & Category badge.
    - Fitment Type: Either an emerald badge `Universal Fit` OR a blue badge `Vehicle Specific (8 Models)` with a hover popover listing compatible vehicles.
    - Cost Price (e.g., $140.00).
    - Selling Price (e.g., $280.00).
    - Margin %: Auto-calculated pill (`50.0% Margin`).
    - On-Hand Quantity: High-contrast pill (Green if above threshold, Amber/Red with warning triangle if $\le$ low-stock threshold).
    - Actions Menu: Edit Part, Adjust Stock, Manage Vehicle Fitment, Delete.
- **Overlay Modal: "Add / Edit Inventory Part"**:
  - Inputs for SKU, Product Name, Category dropdown, Cost Price, Selling Price, Starting Stock, and Low Stock Alert Level.
  - Compatibility Mode selector:
    - Radio Card A: `Universal Fit` (Applies to all vehicles, film rolls, generic cleaners).
    - Radio Card B: `Vehicle Specific` (Reveals a multi-select combobox to link to Year/Make/Model vehicle records).

---

### 5. SCREEN 4: B2B CUSTOMER DIRECTORY & WHATSAPP CRM
- **Customer Directory Table**:
  - Columns: Customer / Company Name, Account Type badge (`Dealership`, `Fleet Account`, `Retail Customer`), Primary Contact Person, WhatsApp Phone (with direct green WhatsApp link icon), Email, Total Quotes/Invoices, and Outstanding Balance.
- **Slide-Over Customer Profile Drawer**:
  - Complete client details, billing address, tax/VAT number.
  - Direct Action button: `Message on WhatsApp` (opens pre-filled chat).
  - Purchase & Quote History: Chronological list of all quotes created for this customer, vehicle details, payment status, and quick link to view/print PDF.
```

---

## 7. COMPLETED PHASES (1–9): WHAT WAS BUILT

> **CURRENT STATUS (2026-10-17)**: Phases 1–8 are built and committed; Phase 9 is built and awaiting its commit. This section records exactly what each phase built, including later changes made within the phase (e.g. the `docs/changes.md` rounds after Phase 5). It describes the app as it exists today; where it differs from the blueprint in §1–6, this section and `supabase/migrations/` are authoritative. **Do not rebuild or refactor these phases.** Active work is in §8.

---

### PHASE 1: Project Foundation, Supabase Setup & Multi-Tenant RLS [COMPLETED]
**Commits**: `52884bb` "Phase 1", `c1eeee0` (hydration + dashboard prerender fixes).

**What was built**:
1. **Database (applied through the Supabase MCP, no manual SQL)**: tables `tenants`, `profiles`, `vehicles`, `inventory_items`, `customers`, `quotes`, `quote_items`, `item_vehicle_compatibility`, all with RLS. Migrations live in `supabase/migrations/`, named after the versions Supabase recorded; `npm run db:push` and `npm run db:types` (`scripts/db.mjs`) push migrations and regenerate `src/lib/types/database.types.ts`.
2. **Tenant isolation**: every policy checks `tenant_id = private.current_tenant_id()` (moved to schema `private` in Phase 6; the public wrapper is SECURITY INVOKER).
3. **Sign-up**: trigger `handle_new_shop_registration` creates the tenant and the owner's `admin` profile (later phases also add the walk-in customer and default categories). Pages `src/app/(auth)/register` and `login`.
4. **App foundation**: Next.js **16.4** App Router with `src/proxy.ts` (replaces `middleware.ts`) and Cache Components (session reads inside `<Suspense>`; `src/lib/supabase/server.ts` awaits `connection()` before reading cookies). Supabase clients in `src/lib/supabase/`. `getShopSession()` in `src/lib/auth.ts` returns the tenant, role (anything but `admin` is staff), name and email.
5. **Design system**: tokens and layout ported from `design/figma-ui/` into `src/app/globals.css` (mostly plain CSS classes) and `src/app/(dashboard)/layout.tsx` (sidebar + top bar). shadcn/ui is configured; its components import `cn` from `@/lib/utils`.
6. **Storage**: bucket `shop-assets` for shop logos (`shop-assets/<tenant>/`).

**No longer present**: `process_quote_payment` (§3.3) was dropped in the Phase 5 changes; payments use `invoice_payments` + `record_payment`.

**Open item**: Supabase Auth leaked-password protection is off (a dashboard toggle for the developer).

---

### PHASE 2: NHTSA vPIC Vehicle Engine & Seed Pipeline [COMPLETED]
**Commit**: `0b1e014` "Phase 2" (catalog extended in Phase 7).

**What was built**:
1. `src/lib/types/vehicle.ts`: NHTSA response and vehicle row types.
2. `scripts/seed-vehicles.mts` (`npm run seed:vehicles`, Node's built-in TypeScript, no ts-node/dotenv): 20 makes, cars/trucks/MPVs only, exact `Make_Name` matches (vPIC matches substrings), rate-limited with retries; `--from=YYYY --to=YYYY` (added in Phase 7, default 1981–2026).
3. Unique key `uq_vehicle_ymm` made NULLS NOT DISTINCT so re-runs skip existing rows (since Phase 7: `(year, make, model, trim, tenant_id)`).
4. `/api/vehicles` (signed-in only): Year → Make → Model through RPCs `vehicle_years`, `vehicle_makes`, `vehicle_models` (SECURITY INVOKER). Responses are `no-store` (since Phase 7). Client hook `src/lib/hooks/use-vehicle-cascade.ts`.

---

### PHASE 3: Inventory Engine (Universal Fit & YMM Compatibility) [COMPLETED]
**Commit**: `9693ac7` "Phase 3" (extended in Phases 4, 5 and 7).

**What was built**:
1. `src/lib/validations/inventory.schema.ts` and `src/lib/actions/inventory.ts` (list, create, update, delete).
2. RPC `save_inventory_item`: item + vehicle links saved in one transaction; SKUs in capitals, unique per shop; vehicle-specific items need at least one vehicle. (Phase 7: takes `p_category_id`.)
3. RPC `search_inventory_items`: SKU, name and linked vehicles (Phase 7: also category names), symbols matched literally.
4. `/inventory` page: `inventory-table.tsx` (name, SKU, category, fitment, cost, selling price, colour-coded margin, stock; rows at or below their own `low_stock_threshold`, default 5, highlighted), `inventory-item-dialog.tsx` (add/edit, Generate SKU, live margin, Universal Fit / Vehicle Specific), `ymm-compatibility-selector.tsx` (Year → Make → Model chips; changing the year keeps the make), delete with confirmation.
5. Filters in the URL. Any shop member can manage inventory. No pagination (Phase 9).

---

### PHASE 4: B2B Customer Directory, Pakistan Localization & Settings [COMPLETED]
**Commits**: `0537081` "Phase 4", `135f72b` "Phase 4 Tweaks".

**What was built**:
1. **Localization (§2.3)**: currency `Rs.`/`PKR` with optional paisa (`formatMoney(amount, tenant.money)` in `src/lib/format.ts`); phones parsed, stored E.164 and shown `0300-1234567` (`src/lib/phone.ts`, also builds `wa.me` links); WhatsApp must be a mobile; international numbers only when `allow_international_phones` is on.
2. **Tax-inclusive prices**: shop default `prices_include_tax` and per-item `price_includes_tax`.
3. **Settings** (`/settings`, admins edit, staff view): currency, paisa (live preview), tax rate, prices include tax, international numbers, editable timezone (IANA, grouped by region), dashboard clock (show/hide, digital/analog, 12/24-hour). Phase 5 added quotation validity days and week start; Phase 6 shop details + logo; Phase 7 product categories.
4. **Customers** (`src/lib/actions/customers.ts`, `/customers` with `customer-dialog.tsx`, profile `/customers/[id]` with WhatsApp button and document history): type badges (Dealership / Fleet / Retail), search by name, contact, phone, email, tax ID; delete blocked once a customer has documents.
5. Later additions (Phase 5 changes): CNIC/NTN (`cnic_or_ntn`), sales-tax registration + STRN (database-enforced for dealerships/fleet and registered customers), default discount %, credit period (`credit_days`), and one hidden, non-editable "Walk-in / Cash Customer" per shop (`customers.is_walk_in`).

---

### PHASE 5: Drafts, Quotations, Invoices, Payments & Dashboard [COMPLETED]
**Commits**: `cd9a9e4` (Phase 5), `fa2949f` (`docs/changes.md` rounds 1–5), `80434e2` (branding).

**What was built**:
1. **One document, three stages**: a `quotes` row moves draft → quotation (`sent` / `accepted` / `cancelled`) → invoice (`invoiced` / `paid`; cancelled invoice = `void`). Sidebar sections `/drafts`, `/quotations`, `/invoices`. Columns `draft_number`, `quotation_number`, `invoice_number` (unique per shop); `quote_number` is GENERATED (the current one). A quotation moved back to drafts keeps its Q- number for re-issue.
2. **Numbering**: RPC `next_document_number('D'|'Q'|'INV')` returns prefix + (highest used + 1, from 1001), under an advisory lock; new documents preview their next number without reserving it.
3. **RPCs**: `save_quote` (13 args: lines with per-unit discounts, document discount + required reason, walk-in name/phone, due date), `convert_quote` (to draft / quotation / invoice), `record_payment`, `dashboard_metrics`. Totals computed in SQL, mirrored in `src/lib/quote-math.ts`: line nets → subtotal → document discount → taxable → tax (inclusive lines have tax backed out, exclusive lines get it added).
4. **Builder** (`src/components/quotes/quote-builder.tsx`, `line-items.tsx`, `line-search.tsx`, `customer-picker.tsx`): SOS-style layout (bill-to left, number/dates/status right, full-width lines, notes and totals at the bottom); customer search with inline registration; Walk-in / Cash button with optional buyer name and phone; customer default discount applied as the document discount; lines from a search box (`/api/quote-items?q`) or custom items (`item_id` null, no stock); inventory unit price fixed server-side; per-unit discount in % or Rs., `sale_price`, line total = qty × sale price; quantity steppers, move up/down, remove; Save & Close / Save as Copy; unsaved-changes guard (`src/lib/hooks/use-leave-guard.ts`); toasts via `src/lib/notify.ts`. **No vehicle picker and no Magic Fit filter on documents** (removed in changes.md round 2 at the product owner's request).
5. **Stock**: drafts hold nothing; quotations reserve, invoices deduct **at invoicing, not payment** (trigger `quote_items_sync_stock`, SECURITY DEFINER, refuses more than on hand − reserved; `quotes_sync_stage_stock` on status changes). `inventory_items.reserved_quantity` is trigger-only. Quotation validity days (Settings, default 2); expired quotations keep their stock until acted on.
6. **Payments**: `invoice_payments` (amount, method, date, reference) and `invoice_payment_items` (pay specific lines; share = line total / Σ line totals × invoice total, `src/lib/payments.ts`); trigger keeps `quotes.amount_paid`; `quotes_derive_payment_status` makes invoiced ↔ paid automatic (paid can't be set directly); `quote_items_relink_payments` re-links allocations after lines are replaced. `payment-dialog.tsx`; Mark Unpaid removes payments; delete only with nothing paid.
7. **Invoice statuses** shown as Pending / Due / Partially Paid / Paid / Cancelled (`statusKey()` in `src/lib/documents.ts`, shop-local dates). Due date = invoice date + customer credit days, editable per invoice.
8. **Dashboard** (`/dashboard`): one date range from the URL (`?range=today|week|month|year|all|custom&from&to`, `date-range-picker.tsx`, `tenants.week_start`); widgets for sales, profit, tax, pending invoices/quotations, aging, counts, each as Numbers / Bar / Pie per user (`profiles.dashboard_prefs`); hand-rolled SVG charts in `src/components/dashboard/charts.tsx`.
9. **Vendors**: optional `vendor_name` per item, shown in the item details.
10. **Branding** (`80434e2`): product name "CarShop.Pk POS System", logos in `public/brand/`, favicons, collapsible sidebar (`html[data-sidebar=collapsed]`), red accent `#D9161F`.

---

### PHASE 6: PDFs, Sharing, Search, Notifications, Reports & Phone Layout [COMPLETED]
**Commit**: `b2d4fc5` "Phase 6".

**What was built**:
1. **PDFs** with `@react-pdf/renderer`: `src/components/pdf/document-pdf.tsx`, data loader `src/lib/printable.ts`. A4 with logo, shop details (address, phone, NTN, STRN), customer, lines with discounts, totals; invoices add payments, balance and a status stamp; "Terms & notes" (`tenants.quote_footer_notes`) at the bottom.
2. **Routes**: `/api/documents/[id]/pdf` (signed in); public `/share/[token]` and `/share/[token]/pdf` (service-role read by `quotes.share_token`; drafts can't be shared).
3. **Share menu** (`src/components/quotes/share-menu.tsx`): View PDF, Download PDF, Share on WhatsApp (pre-filled message + private link), Copy customer link. Links use `NEXT_PUBLIC_APP_URL` (still `http://localhost:3000` until deployed).
4. **Shop details** in Settings (name, phone, email, address, NTN, STRN, terms) and logo upload `POST /api/shop/logo`.
5. **Global search** (Ctrl K, `src/components/shared/global-search.tsx`, `/api/search`): documents by number or customer, customers, parts by name or SKU.
6. **Notification bell** (RPC `shop_alerts()`): overdue invoices, invoices due within 3 days, low stock, quotations expiring soon, expired quotations still holding stock.
7. **Reports** (`/reports`, RPC `report_data(range)`): sales, profit, payments collected, money owed, sales chart, top products/customers, payments by method, aging, stock value + low stock; CSV export per table (`src/components/reports/csv-button.tsx`).
8. **Phone layout**: ☰ slide-out drawer ≤ 768px (`src/components/shared/mobile-nav.tsx`, `html[data-mobile-nav=open]`, closes on backdrop tap, Escape and navigation, shows the full menu whatever the desktop collapse state), 60px top bar with search as an icon, stacked pages, full-width dialogs, wide tables scrolling inside their cards, no sideways page scroll.
9. **Security**: `rls_auto_enable()` execute revoked; `current_tenant_id()` moved to schema `private`. Dashboard "Coming next" card replaced with Quick actions.

---

### PHASE 7: Product Categories, 1960–2026 Vehicles & Pakistan-Market Catalog [COMPLETED]
**Commit**: `acc8dc9` "Phase 7".

**What was built**:
1. **Product categories** (`20261016120000_product_categories.sql`):
   - Table `public.categories` (`tenant_id`, `parent_id`, `name`, `sort_order`): a per-shop tree, at most 4 levels (trigger `private.categories_check_depth`); names unique per parent (case-insensitive). RLS: members read their shop's categories, only admins change them; a category with items or subcategories can't be deleted (`on delete restrict`).
   - Default list from `docs/categories.md` (14 main, 157 total) via `private.seed_default_categories()` and trigger `tenants_seed_categories` for new shops.
   - `inventory_items.category` (text) replaced by `category_id`; existing items mapped (Window Film → Exterior › Wrapping › Tinting Film, Vinyl Wrap → … › Vinyl Wraps, PPF → … › PPF, Car Audio → Audio, Accessories → Others, Hardware / Chemicals → Cleaning & Detailing). `save_inventory_item` takes `p_category_id`; `search_inventory_items` matches category and ancestor names.
   - Code: `src/lib/categories.ts` (tree index, paths, icons, SKU prefixes per main category), `src/lib/category-data.ts`, `src/lib/actions/categories.ts` (admin-only), Settings → Product categories (`src/components/settings/category-manager.tsx`: search, expand, add, rename, delete), searchable picker `src/components/inventory/category-picker.tsx` in the part dialog (Generate SKU uses the main category prefix, e.g. EXT-).
   - Inventory filters: category (includes everything below, with counts), Stock (`in`/`low`/`out`), Sort (`name`, `newest`, `stock`, `price-high`, `price-low`). Stock and Sort run in the server action after the query, not in SQL.
2. **Vehicle years 1960–2026**: `vehicles.year` check 1960–2035 (`20261016173614_vehicle_years_from_1960.sql`); 1981–2014 seeded from NHTSA; for US-only makes, 1960–1980 are copies of each make's 1981 models (`20261016190000_vehicles_1960_1980_from_1981.sql`, an approximation the developer chose); for makes in the Pakistan list those copies were removed (`20261016200000_drop_copied_pre1981_for_pk_makes.sql`).
3. **Shop vehicles** (`20261016180000_shop_vehicles.sql`): no separate table. `vehicles.tenant_id` is `null` for the shared catalog and set for a shop's own vehicles (RLS: catalog + own shop). RPC `add_vehicle(p_year, p_make, p_model)` returns an existing match (catalog first, case-insensitive) or inserts a shop vehicle; trigger `private.check_fitment_vehicle` blocks linking another shop's vehicle. UI: "Vehicle not listed? Add it" under the vehicle pickers in the **part dialog only** (`src/lib/actions/vehicles.ts`).
4. **Pakistan-market catalog**: `scripts/data/vehicles-pk.json` (32 makes, ~600 models, production years per model from PakWheels make pages + model knowledge; a few years approximate), loaded by `scripts/seed-pk-vehicles.mts` (`npm run seed:vehicles:pk`, skips existing year/make/model case-insensitively): 8,514 vehicle-years added, 23,273 catalog rows. Short makes shown in capitals (BYD, MG, FAW, DFSK, GWM, BAIC, ORA) by `formatMake`.

---

### PHASE 8: Responsive Foundations, Breakpoint Tokens & iOS Zoom Fix [COMPLETED]
**Commit**: `60e619a` "Phase 8 - responsive breakpoint tokens, drawer polish and ios zoom fix".

**What was built**:
1. **Viewport** (`src/app/layout.tsx`): `viewport` export with `width: device-width`, `initialScale: 1`, `maximumScale: 5`, `viewportFit: "cover"`, `interactiveWidget: "resizes-content"`, `themeColor: "#111113"`.
2. **Breakpoint tokens** in `:root` (`src/app/globals.css`): `--bp-xs` 480, `--bp-sm` 640, `--bp-md` 768 (phones: drawer, stacked pages), `--bp-lg` 1024 (tablets: icon-rail sidebar), `--bp-xl` 1280, `--bp-2xl` 1536, `--container-max-width` 1720px. Every `@media` now uses one of these widths: 520→480, 560→640, 760→768, 860/920/1080/1100→1024, 1180→1280. Visible effect: the icon-rail sidebar starts below 1024px (was 920px); auth pages, document header/footer, reports and customer profile stack below 1024px.
3. **No sideways scroll on small laptops**: `.main-shell`'s 900px minimum width is dropped at ≤ 1280px (242px sidebar + 900px scrolled sideways between 1025 and 1141px). Verified at 1440, 1280, 1100, 1030, 1000, 800 and 393px on dashboard, documents, reports, inventory, customers and settings.
4. **Safe areas**: `--safe-top/bottom/left/right` (`env(safe-area-inset-*)`) applied to the phone top bar, the drawer and page padding.
5. **iOS auto-zoom fix**: at ≤ 768px every input (except checkbox/radio/range), select and textarea is `font-size: 16px !important`.
6. **Drawer** (extends Phase 6, `src/components/shared/mobile-nav.tsx`): `translate3d` slide with `will-change: transform` and an eased transition; swipe left to close (the drawer follows the finger via `--drawer-drag` / `html[data-mobile-nav-dragging]`; closes past 70px or on a quick flick; vertical moves are left to scrolling); the drawer's shadow only shows while open (it used to show along the page's left edge).
7. **Phone top bar** 56px (+ top safe area), was 60px.

---

### PHASE 9: Server-Side Pagination & Mobile Table Cards [COMPLETED]
**Commit**: pending (`Phase 9 - …`).

**What was built**:
1. **Migration** `20261017100000_phase9_pagination.sql`:
   - `inventory_items.available_quantity` (= on hand − reserved) and `is_low_stock` (available ≤ `low_stock_threshold`) as stored generated columns, so the Stock filter and "lowest stock" sort run in SQL; index `(tenant_id, name)`.
   - RPC `customer_directory_stats()`: total customers, B2B accounts, outstanding balance for the whole directory (walk-in excluded).
   - RPC `filter_documents(p_statuses, p_status_key, p_search, p_today)` (setof `quotes`, SECURITY INVOKER): section statuses, displayed status (pending / due / partial worked out from payments and the due date against the shop's local date; anything else = stored status) and word search over all numbers, customer name and walk-in name. RPC `document_list_totals(...)` sums total (excluding cancelled) and balance for the same filters.
2. **Shared helpers** `src/lib/pagination.ts`: `parsePagination` (`?page=`, `?limit=` 25/50/100, invalid → page 1 / 25), `pageRange`, `Paged<T>`, `isRangePastEnd` (PostgREST PGRST103), `pastEndRedirect` (a page past the end redirects to the last page).
3. **Paged actions** (exact counts, stable `id` tiebreak): `getInventoryItems(filters, pagination)` → rows + total + `lowStock` (low-stock count across all matches); `getCustomers(filters, pagination)` + `getCustomerStats()`; `getDocuments(section, filters, pagination)` → rows + total + footer sums. All filtering and sorting moved from JavaScript into SQL.
4. **Pagination bar** `src/components/ui/pagination-bar.tsx`: "Showing 1–25 of 60 products", First / Previous / page numbers with gaps / Next / Last, rows per page (keeps the first visible row in view when the size changes); URL-synced, filters kept. Every filter bar (inventory, customers, documents) drops `page` on change.
5. **Phone cards ≤ 768px** (`.mobile-cards`; the table gets `.desktop-table` and is hidden): inventory (SKU, price, name, category pill, available/reserved pill; tap → details, 44px edit/delete), customers (name, type badge, document count, balance or Settled, one-tap WhatsApp), documents (number, status badge, customer, date/due date, total, balance). Footer totals and the pagination bar sit under the cards.
6. Summary figures now describe everything matching the filters, not just the loaded page: inventory "N products" / "N low stock", customer tiles (whole directory), document footer totals.

---

## 8. ROADMAP (PHASES 10–15): STILL TO BUILD

> **MANDATORY INSTRUCTION FOR CLAUDE CODE & ANTIGRAVITY**:  
> Each phase below lists **only work that does not exist yet** (audited against the codebase on 2026-10-17). Where a step extends something already built, it names the phase that built it (see §7); extend that code, don't replace it.  
> 
> 🛑 **CRITICAL EXECUTION RULE**:  
> Build **strictly one phase at a time**. **DO NOT** combine phases, skip steps, or build future phases early.  
> After each phase: **STOP AND PAUSE**, describe what you built, ask the developer to test in the browser and commit, then move the phase into §7 as "What was built" and update the phases after it.  
> Commit messages always start with `Phase <N> - `.

---

### PHASE 10: Mobile Document Builder & Sticky Cashier Bar
**Agent Directive** (extends the Phase 5 builder):
1. **Sticky cashier bar** `src/components/quotes/mobile-action-bar.tsx`: bottom of the screen on phones (`position: sticky; bottom: 0; z-index: 40` + safe-area inset), live grand total, line count, primary action (Save / Record Payment), translucent blurred background.
2. **Line cards below 768px** (`.mobile-line-card`): ≥ 44px +/− buttons (reusing the existing stepper logic), unit price and discount in a tap-to-edit sheet, one-tap delete with an undo toast.
3. **Full-screen search sheets on phones** for `line-search.tsx` and `customer-picker.tsx`: slide-up, auto-focused, category filter chips, tap to add.
4. **Header accordion on phones**: customer, document details, dates, due date and status in a collapsible touch card.

🛑 **PAUSE & CHECKPOINT**:  
> "Phase 10 complete! Please test `/invoices/new` in mobile emulation: 1) the full-screen part search adds items, 2) the large +/− buttons work, 3) the bottom bar shows the live total and main button, 4) save the invoice. Then run `git add . && git commit -m 'Phase 10 - mobile document builder and sticky cashier bar'` and tell me to begin Phase 11."

---

### PHASE 11: Bottom-Sheets, Quick Cash & 80mm Thermal Receipts
**Agent Directive**:
1. **Bottom-sheets below 768px** for the app's Radix `.modal*` dialogs (16px top corners, drag handle, `max-height: 90vh`, actions pinned above the keyboard): part dialog (`inventory-item-dialog.tsx`), customer dialog (`customer-dialog.tsx`), payment dialog (`payment-dialog.tsx`).
2. **Dashboard date range picker on phones** (`date-range-picker.tsx`): a one-month calendar in a bottom sheet instead of the two-month popover.
3. **80mm thermal receipt** `src/components/pdf/thermal-receipt.tsx`: continuous roll (Epson, Xprinter, Sunmi), compact shop header, number, date, customer, condensed items, tax/discount summary, payment method, balance, QR code to the share link; "Print POS Slip (80mm)" in the Phase 6 Share menu and document actions.
4. **Quick cash & change** in `payment-dialog.tsx`: `+Rs. 500`, `+Rs. 1,000`, `+Rs. 5,000`, `Exact Amount`, and "Received: Rs. 5,000 → Change Due: Rs. 350" (cash above the balance is change, not a payment).
5. **Touch targets ≥ 44px**: category picker and manager rows, filter chips, table row actions.

🛑 **PAUSE & CHECKPOINT**:  
> "Phase 11 complete! Please test: 1) 'Add New Part' on mobile opens as a bottom sheet with Save reachable, 2) 'Record Payment' quick cash buttons and Change Due, 3) 'Print POS Slip (80mm)' opens an 80mm print preview, 4) the dashboard date picker on a phone. Then run `git add . && git commit -m 'Phase 11 - bottom-sheets, quick cash and 80mm thermal receipts'` and tell me to begin Phase 12."

---

### PHASE 12: Superadmin Schema, Shop Settings Columns & Resend Email
**Agent Directive**:
1. **Migration** `supabase/migrations/<timestamp>_superadmin_and_scaling.sql`:
   - `profiles.is_superadmin boolean not null default false` + partial index; not writable by `authenticated`.
   - `public.superadmin_audit_logs` (admin id, target tenant/user id, action, details diff JSONB, IP, created_at).
   - `public.email_logs` (tenant id, recipient, template type, subject, resend id, status, error, metadata, created_at).
   - New `tenants` columns: `status` ('active' | 'suspended' | 'trial'), `invoice_prefix` / `quote_prefix` / `draft_prefix` (defaults `INV` / `Q` / `D`), `invoice_start_number` / `quote_start_number` / `draft_start_number` (a "start from" floor, not a counter), `bank_name`, `bank_account_title`, `bank_account_number`, `bank_iban`, `bank_raast_id`, `bank_wallets`, `invoice_terms`, `print_format`.
   - Update the Phase 5 `next_document_number` to use the shop's prefix and `greatest(highest used, start − 1) + 1`, still derived from existing documents. `quote_footer_notes` stays as the quotation terms.
   - RLS and grants for the new tables and columns.
2. **Resend**: `npm install resend`; `src/lib/email/client.ts` with console fallback when `RESEND_API_KEY` is missing.
3. **Templates** in `src/lib/email/templates/`: welcome, password reset (1-hour link), staff invite, document share (link + PDF from the Phase 6 renderer), payment receipt.
4. **`sendTransactionalEmail()`** in `src/lib/actions/email.ts`, logging every send to `email_logs`.

🛑 **PAUSE & CHECKPOINT**:  
> "Phase 12 complete! Please verify: 1) `is_superadmin` on `profiles` and the `email_logs` table exist, 2) a test email is delivered (or logged to the console without a key) and appears in `email_logs`, 3) existing documents keep their numbers and new ones continue the series. Then run `git add . && git commit -m 'Phase 12 - superadmin schema, shop settings columns and resend email'` and tell me to begin Phase 13."

---

### PHASE 13: Superadmin Control Plane (`/admin`)
**Agent Directive**:
1. **Guard**: `requireSuperadmin()` in `src/lib/superadmin.ts`; `/admin` redirects non-superadmins to `/dashboard` in `src/proxy.ts`.
2. **Layout & KPIs** (`src/app/admin/`, `src/components/admin/admin-navbar.tsx`, dark slate / racing red): total shops, active users, platform GMV, invoice/quote totals, signups chart (reuse `src/components/dashboard/charts.tsx`), recent activity.
3. **Tenants** (`src/app/admin/tenants/`): search/filter (name, slug, phone, owner email, status); Create Organization (through the existing sign-up provisioning, + welcome email); Edit Company Details (reuse `shop-profile-form.tsx` and `/api/shop/logo`); Suspend / Activate (suspended shops blocked at login with a polite message).
4. **Users** (`src/app/admin/users/`): cross-tenant search, Reset Password (Resend email or temporary password), change role.
5. **Impersonation ("Login As")**: signed cookie `carshop_impersonation`, warning banner with Exit on every page, all actions logged to `superadmin_audit_logs`. Decide first how tenant isolation works while impersonating (RLS uses `private.current_tenant_id()` from the caller's profile): service-role reads with explicit `tenant_id` filters, or a verified superadmin claim honoured by `current_tenant_id()`.

🛑 **PAUSE & CHECKPOINT**:  
> "Phase 13 complete! Please test: 1) set `is_superadmin = true` on your profile, 2) `/admin` shows KPIs, 3) create a test shop, 4) edit its details, 5) Impersonate Shop shows the exit banner, 6) trigger a password reset. Then run `git add . && git commit -m 'Phase 13 - superadmin control plane, tenants, users and impersonation'` and tell me to begin Phase 14."

---

### PHASE 14: Settings Sections, Team, Document Numbering & Bank Details
**Agent Directive** (uses the Phase 12 columns):
1. **Settings sections/tabs**: Profile, Localization, Categories, Team, Documents, Printing, POS, moving the existing Settings cards (Phases 4, 6, 7) rather than rebuilding them.
2. **Team** (`/settings/team`): members with role and status (Active / Invited); Invite Team Member (name, email, role → token + Resend email); change role, deactivate, resend invite.
3. **Documents** (`/settings/documents`): prefixes and "start from" numbers (e.g. continue from 5001); quotation terms (`quote_footer_notes`) vs invoice payment terms (`invoice_terms`) printed on the matching documents.
4. **Bank details**: bank name, account title, account number, IBAN, Raast ID, mobile wallets (JazzCash/EasyPaisa); Bank Remittance card on invoice PDFs (`document-pdf.tsx`) and on `/share/[token]` with Copy IBAN.

🛑 **PAUSE & CHECKPOINT**:  
> "Phase 14 complete! Please test: 1) Settings → Documents: set prefixes and bank details, 2) an invoice PDF shows Bank Remittance below the totals, 3) `/share/<token>` shows the bank card with Copy IBAN, 4) Settings → Team: invite a test staff member. Then run `git add . && git commit -m 'Phase 14 - settings sections, team, numbering and bank details'` and tell me to begin Phase 15."

---

### PHASE 15: Inventory CSV Import/Export, Chart Labels, 4K Containment & Final Build
**Agent Directive**:
1. **Inventory CSV** `src/components/inventory/csv-import-dialog.tsx` + `src/lib/actions/inventory-csv.ts`: sample template (SKU, Name, Category path e.g. `Exterior › Wrapping › PPF`, Cost, Sale Price, Stock, Universal, Vendor), client-side parsing, validation preview with errors highlighted, batch insert following `save_inventory_item` rules; "Export Inventory (CSV)" (reuse the Phase 6 CSV helper; the inventory list is paged since Phase 9, so the export must fetch every page / all rows).
2. **Chart labels below 480px** in `src/components/dashboard/charts.tsx` (already `viewBox`-scaled): show every other bar label so dates don't collide.
3. **Large screens**: `max-width: 1720px; margin: 0 auto;` on page content for 1440p/4K.
4. **Final verification**: `npm run lint && npm run build` and a pass over phone, tablet, laptop, desktop and ultrawide.

🛑 **PAUSE & FINAL SIGNOFF**:  
> "Phase 15 complete! Lint and the production build pass. All phases are done. Please run `git add . && git commit -m 'Phase 15 - inventory csv import/export, chart labels and 4k containment'`."

---


## 9. SUMMARY FOR THE DEVELOPER & AI AGENTS

This specification represents the **single source of truth** for this codebase. Any AI agent (Claude Code, Antigravity) reading this file must:
- Respect the **Strict Scope** (No online payment gateways, no complex warehouse tracking).
- Enforce the **Multi-Tenant RLS Digital Lock** on every tenant query and mutation.
- Use **Server Actions with `requireSuperadmin()`** and `createAdminClient()` for all platform administration operations.
- Ensure **all UI features are fully responsive** across Mobile, Tablet, Laptop, Desktop, and Ultrawide displays with zero horizontal window scrolling.
- Follow the **Sequential Phases** with strict pause-and-checkpoint verification after each phase.


