# PROJECT_SPEC.md: Master Architecture & Implementation Specification
## B2B SaaS POS & Quoting Engine for Automotive Accessory Sellers & Retailers (Wrap, Tint, Audio, Aftermarket Parts)

> **Document Status**: Production Blueprint / Master Instruction Manual  
> **Target Audience**: AI Coding Agents (Claude Code, Antigravity) & Lead Engineers  
> **Application Type**: Multi-Tenant B2B SaaS (Cloud POS & Quoting Engine)  
> **Release Target**: Phase 1 MVP (Inventory, Quoting, Customer Directory, YMM Engine)

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
| **Payments** | Manual payment logging (Cash, Bank Transfer, Card Terminal, Check). | **NO** Stripe, PayPal, Square, or online payment gateways. |
| **Inventory** | On-hand quantity, low-stock threshold alert, Cost price, Retail price, SKU, YMM fitment vs Universal Fit. | **NO** multi-warehouse bin/aisle tracking, serial number tracking, or barcoding hardware integration. |
| **Vehicle Data** | NHTSA vPIC Year, Make, Model selection. | **NO** complex 17-digit VIN decoding, engine code lookups, or OBD-II diagnostics. |
| **Messaging** | WhatsApp click-to-chat links with pre-composed text and PDF links. | **NO** Twilio WhatsApp Business API or automated SMS webhooks. |
| **Quoting** | Line items for physical inventory parts + optional labor/service fees (for sellers offering fitting/installation), discounts, tax rate, PDF generation, status pipeline. | **NO** complex multi-tiered commission splits or recurring billing subscriptions. |

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
   - Shown to users as three separate sections, **Drafts**, **Quotations** and **Invoices**, with one-click conversions (Draft → Quotation or Invoice, Quotation → Invoice). See Phase 5, step 4.
3. **One-Click Professional PDF Generation**:
   - Clean, automotive-branded PDF invoice/quote template generated on demand.
   - Includes Shop Logo, Shop Details, Customer Details, Vehicle YMM, Itemized Table (Parts & Labor), Totals, and Disclaimer.
4. **Direct WhatsApp Sharing**:
   - A single-click button: `"Share via WhatsApp"`.
   - Generates a `https://wa.me/{phone}?text={encoded_message}` deep link.
   - Pre-fills a professional message containing: Shop Name, Quote Number, Vehicle Details, Total Amount, and a secure public view link for the PDF.
5. **Manual Payment & Atomic Inventory Deduction**:
   - When marking an invoice as `paid`:
     - User selects `payment_method` (`Cash`, `Card Terminal`, `Bank Transfer`, `Check`) and enters optional reference notes.
     - System executes an atomic database transaction:
       1. Sets `quotes.status = 'paid'` and `quotes.paid_at = now()`.
       2. Loops through all `quote_items` that have a non-null `item_id`.
       3. Decrements `inventory_items.quantity_on_hand` by `quote_items.quantity`.
       4. Sets `quotes.inventory_deducted = true` (idempotency flag preventing double deductions).

### 2.3 Localization: Pakistan (Default Market)
The product targets Pakistani shops and sellers first. These defaults apply to every shop; the per-shop options are set on the shop Settings page.

| Setting | Default | Per-shop option |
| :--- | :--- | :--- |
| **Currency** | `Rs.` | `Rs.` or `PKR` (no other currencies) |
| **Timezone** | `Asia/Karachi` (PKT, UTC+5; covers Islamabad and Karachi) | Fixed for now |
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

## 7. STEP-BY-STEP EXECUTION INSTRUCTIONS FOR CLAUDE CODE & ANTIGRAVITY

> **MANDATORY INSTRUCTION FOR THE AI AGENT (Claude Code / Antigravity)**:  
> You must execute this build in **6 sequential phases**.  
> **DO NOT** skip steps or attempt to build future phases prematurely.  
> **STOP AND PAUSE** after each phase is completed, describe what you implemented, and ask the human developer to run tests and execute a `git commit` before proceeding to the next phase.

---

### PHASE 1: Project Foundation, Automated Supabase Setup & Multi-Tenant RLS
**Agent Directive**:
1. **Connect Supabase MCP & Agent Skills**:
   Claude Code is equipped with the Supabase MCP server for project `atjbxwhvtattwiivrqbe`:
   ```bash
   claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=atjbxwhvtattwiivrqbe&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching"
   npx skills add supabase/agent-skills
   ```
2. **Automated Database & Storage Provisioning (No Manual SQL for Human)**:
   - Claude Code MUST NOT require the human developer to manually copy-paste SQL into the browser.
   - Use the Supabase MCP server database execution tools (or Supabase CLI) to directly apply the SQL DDL from **Section 3.1 & 3.2** (`tenants`, `profiles`, `vehicles`, `inventory_items`, `customers`, `quotes`, `quote_items`, `item_vehicle_compatibility`, and all RLS policies).
   - Execute the stored procedure from **Section 3.3** (`process_quote_payment`).
   - Create and configure the public `shop-assets` storage bucket for shop logos.
   - Run a verification query to confirm all 8 tables and functions exist.
   - Generate TypeScript database types directly into `src/lib/types/database.types.ts`.
3. **Initialize Next.js App Router**:
   ```bash
   npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   ```
4. **Install Foundational Dependencies & shadcn/ui**:
   ```bash
   npm install @supabase/supabase-js @supabase/ssr lucide-react clsx tailwind-merge class-variance-authority zod react-hook-form @hookform/resolvers
   npx shadcn-ui@latest init
   npx shadcn-ui@latest add button dialog input label select table card badge dropdown-menu toast
   ```
5. **Port Visual Design System**:
   - Inspect `design/figma-ui/src/index.css` and incorporate the color tokens, button classes, and badge styles into `src/app/globals.css`.
   - Adapt the sidebar and topbar navigation from `design/figma-ui/src/App.tsx` into `src/app/(dashboard)/layout.tsx`.
6. **Implement Supabase Auth & Multi-Shop Onboarding**:
   - Create Supabase client utilities in `src/lib/supabase/client.ts`, `server.ts`, and `middleware.ts` connecting to project `atjbxwhvtattwiivrqbe`.
   - Build the Shop Registration & Login pages (`src/app/(auth)/register/page.tsx` and `login/page.tsx`). On registration, automatically create both the `tenants` and `profiles` records in a single flow.

🛑 **PAUSE & CHECKPOINT**:  
*Prompt the human developer*:
> "Phase 1 complete! I have automatically executed the database migrations, enabled RLS, deployed the payment procedure, and built the registration flow. Please test user registration at http://localhost:3000/register. When verified, run `git add . && git commit -m 'feat: phase 1 - automated supabase db setup, auth & multi-tenant rls'` and tell me to continue to Phase 2."

---

### PHASE 2: NHTSA vPIC Vehicle Engine & Seed Pipeline
**Agent Directive**:
1. Implement TypeScript interfaces for NHTSA vPIC responses and database vehicle rows in `src/lib/types/vehicle.ts`.
2. Build the ingestion CLI script in `scripts/seed-vehicles.ts` using the exact rate-limited batch logic from Section 4.3 of this specification.
3. Add a script command in `package.json`:
   ```json
   "seed:vehicles": "ts-node -r dotenv/config scripts/seed-vehicles.ts"
   ```
4. Create a cached Next.js API route or Server Action in `src/app/api/vehicles/route.ts` that provides cascading vehicle queries:
   - Query 1: Get distinct Years (`SELECT DISTINCT year FROM vehicles ORDER BY year DESC`)
   - Query 2: Get Makes for a selected Year (`SELECT DISTINCT make FROM vehicles WHERE year = ?`)
   - Query 3: Get Models for a selected Year + Make (`SELECT DISTINCT model, id FROM vehicles WHERE year = ? AND make = ?`)

🛑 **PAUSE & CHECKPOINT**:  
*Prompt the human developer*:
> "Phase 2 complete! Please run `npm run seed:vehicles` to populate your Supabase `vehicles` table with common automotive makes and models. Verify that the vehicles table has data, run `git add . && git commit -m 'feat: phase 2 - nhtsa vehicle engine and seed pipeline'`, and confirm when you are ready for Phase 3."

---

### PHASE 3: Inventory Engine (Universal Fit & YMM Compatibility)
**Agent Directive**:
1. Implement the Zod validation schema for inventory items in `src/lib/validations/inventory.schema.ts`.
2. Create Server Actions for Inventory CRUD in `src/lib/actions/inventory.ts`:
   - `getInventoryItems(filters: { category?, search?, fitment? })`
   - `createInventoryItem(data)` (handles both `is_universal = true` and vehicle junction table inserts)
   - `updateInventoryItem(id, data)`
   - `deleteInventoryItem(id)`
3. Build the Inventory Management UI:
   - `src/app/(dashboard)/inventory/page.tsx`
   - `src/components/inventory/inventory-table.tsx` (displays SKU, Name, Cost, Selling Price, Margin %, Stock Pills)
   - `src/components/inventory/ymm-compatibility-selector.tsx` (allows linking a part to multiple YMM vehicles)
4. Implement the Low-Stock Alert visual indicators (highlighting rows with $\le 5$ units).

🛑 **PAUSE & CHECKPOINT**:  
*Prompt the human developer*:
> "Phase 3 complete! Open `/inventory` in your browser. Create 1 Universal item (e.g. 'Standard Window Cleaner') and 1 Vehicle-Specific item (e.g. 'Ford F-150 Pre-cut Ceramic Tint'). Verify both items save to Supabase and show appropriate fitment tags. Run `git add . && git commit -m 'feat: phase 3 - inventory management and ymm compatibility'` and instruct me to begin Phase 4."

---

### PHASE 4: B2B Customer Directory & WhatsApp CRM
**Agent Directive**:
1. **Pakistan localization (§2.3)**:
   - Migration on `tenants`: currency limited to `Rs.` / `PKR` with default `Rs.` (existing shops move from `$` to `Rs.`); add `timezone text not null default 'Asia/Karachi'` and `allow_international_phones boolean not null default false`.
   - Shared phone helpers in `src/lib/phone.ts`: parse/normalize to E.164, format for display (`0300-1234567`), build `wa.me` links.
   - Currency formatting `Rs. 12,500.00` and date formatting in the shop timezone in `src/lib/format.ts`.
   - Minimal shop Settings page (`src/app/(dashboard)/settings/page.tsx`, admins only): currency (`Rs.` / `PKR`) and the international-numbers switch. The rest of Feature A settings comes in a later phase.
2. Create Customer Zod schema in `src/lib/validations/customer.schema.ts` using the §2.3 phone rules (Pakistani local format by default, `+` international only when the shop allows it; WhatsApp must be a mobile).
3. Build Customer Server Actions in `src/lib/actions/customers.ts` (List, Create, Update, Get with Purchase History).
4. Build Customer Management UI:
   - `src/app/(dashboard)/customers/page.tsx` (Customer table with badges for Dealership, Fleet, Retail)
   - Add / edit customer as a modal on the list page (matching the inventory pattern), instead of a separate `customers/new` page
   - `src/app/(dashboard)/customers/[id]/page.tsx` (Client profile with quick WhatsApp launch button and full quote history).

🛑 **PAUSE & CHECKPOINT**:  
*Prompt the human developer*:
> "Phase 4 complete! Navigate to `/customers` and add a test customer (e.g., 'Precision Auto Dealership' with WhatsApp `0300-1234567`). Check that Pakistani numbers validate, that `+` international numbers are rejected until you enable them in Settings, and that prices show as `Rs.`. Run `git add . && git commit -m 'feat: phase 4 - b2b customer directory'` and tell me to proceed to Phase 5."

---

### PHASE 5: The Quoting Engine & Magic YMM Fitment Filter
**Agent Directive**:
1. Build the Quoting Server Actions in `src/lib/actions/quotes.ts`:
   - Auto-generate sequential quote numbers (e.g. `Q-1001`, `Q-1002`) isolated per tenant.
   - `createQuote(payload)` and `updateQuote(id, payload)` with line items.
2. Build the Quoting Wizard at `src/app/(dashboard)/quotes/new/page.tsx`:
   - Customer Combobox selector.
   - Cascading Vehicle Selector (Year $\rightarrow$ Make $\rightarrow$ Model).
   - **The Magic Fit Filter**: When a vehicle is chosen, filter inventory parts to show:
     ```typescript
     const compatibleItems = allItems.filter(item => 
       item.is_universal || item.compatible_vehicle_ids.includes(selectedVehicleId)
     );
     ```
   - Dynamic Line Items Editor: Add inventory parts OR custom non-inventory labor lines.
   - Live Subtotal, Shop Tax calculation, and Grand Total display.
3. ~~Build the Quotes Pipeline List at `src/app/(dashboard)/quotes/page.tsx` with status filter tabs (`Draft`, `Sent`, `Invoiced`, `Paid`).~~ Replaced by the three sections below (requested by the product owner, 2026-10-15).
4. **Separate Drafts / Quotations / Invoices sections.** One sidebar item each instead of a single "Quotes & POS" list. All three are the same kind of document (a `quotes` row with line items) at different stages, so nothing is re-typed when converting:

   | Section | Route | Shows statuses | Number series |
   | :--- | :--- | :--- | :--- |
   | **Drafts** | `/drafts` | `draft` | `D-1001`… (internal only) |
   | **Quotations** | `/quotations` | `sent`, `accepted`, `cancelled` | `Q-1001`… |
   | **Invoices** | `/invoices` | `invoiced`, `paid` | `INV-1001`… |

   - **Conversions** (one click, with confirmation):
     - Draft → Quotation: status `sent`, gets the next `Q-` number.
     - Draft → Invoice: status `invoiced`, gets the next `INV-` number.
     - Quotation → Invoice: status `invoiced`, gets the next `INV-` number and keeps a link to the quotation (e.g. "from Q-1004").
   - Invoices are not converted back. A quotation can be cancelled; an invoice is settled by marking it paid (Phase 6).
   - "New" buttons: create a draft from Drafts or Quotations, or bill directly from Invoices (walk-in sale).
   - Each document keeps every number it has had (draft → quotation → invoice), so the customer history and PDFs stay traceable. Needs `invoice_number`, `quotation_number` and `converted_from` columns, numbered per tenant.

🛑 **PAUSE & CHECKPOINT**:  
*Prompt the human developer*:
> "Phase 5 complete! Test creating a quote at `/quotes/new`: Select a vehicle and verify that the inventory selector dynamically hides incompatible parts while displaying universal items. Save a draft quote. Run `git add . && git commit -m 'feat: phase 5 - quoting engine & ymm magic filter'` and prompt me to proceed to Phase 6."

---

### PHASE 6: PDF Generation, WhatsApp Dispatch & Atomic Stock Deduction
**Agent Directive**:
1. Install and configure `@react-pdf/renderer`:
   ```bash
   npm install @react-pdf/renderer
   ```
2. Build the vector PDF quote template in `src/components/pdf/quote-pdf-document.tsx`:
   - Embeds Shop Logo, Shop Details, Customer Name, Vehicle YMM, Itemized Table, Totals, and Shop Terms/Disclaimer.
3. Implement the WhatsApp sharing link generator in `src/lib/utils/whatsapp.ts`:
   - Format: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
   - Message includes: Quote Number, Vehicle, Total Price, and a link to view the quote.
4. Implement the manual payment modal and execute the atomic stock deduction stored procedure `process_quote_payment` created in Section 3.3.
5. Verify that when an invoice status changes to `paid`:
   - `quotes.inventory_deducted` becomes `true`.
   - `inventory_items.quantity_on_hand` decreases by the exact line-item quantities.
   - Marking as paid a second time is strictly blocked.

🛑 **PAUSE & FINAL PROJECT SIGNOFF**:  
*Prompt the human developer*:
> "Phase 6 complete! The full MVP Quoting and Inventory Engine is now operational. Please test: 1) Generating and viewing a PDF quote, 2) Clicking 'Share to WhatsApp' to verify the pre-filled message, and 3) Marking an invoice as 'Paid' and checking your `/inventory` screen to verify that stock counts deducted automatically. Run `git add . && git commit -m 'feat: phase 6 - pdf generation, whatsapp dispatch & inventory deduction'`."

---

## 8. SUMMARY FOR THE DEVELOPER & AI AGENTS

This specification represents the **single source of truth** for this codebase. Any AI agent (Claude Code, Antigravity) reading this file must:
- Respect the **Strict Scope** (No online payment gateways, no complex warehouse tracking).
- Enforce the **Multi-Tenant RLS Digital Lock** on every query and mutation.
- Use the **NHTSA vPIC Data** to power the cascading vehicle selectors.
- Deliver a clean, professional, high-performance UI tailored specifically for automotive accessory sellers, retail stores, and outfitter shops.
