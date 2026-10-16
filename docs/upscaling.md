# MASTER SCALING & SUPERADMIN BLUEPRINT (`docs/upscaling.md`)
## Comprehensive Gap Analysis, Usability Upgrades, App Owner Control Plane & Resend Email Integration
### Production Execution Manual for AI Coding Agents (Claude Code / Antigravity) & Lead Engineers

> **Document Version**: 1.0.0  
> **Target Audience**: Claude Code, Antigravity IDE, Lead Engineers & Product Owners  
> **Application**: CarShop.Pk B2B SaaS POS & Automotive Quoting Engine  
> **Status**: Ready for Phased Execution  

---

## TABLE OF CONTENTS
1. [Executive Summary & Current Architecture Review](#1-executive-summary--current-architecture-review)
2. [Comprehensive Inventory of Missing Options, Features & Usability Gaps](#2-comprehensive-inventory-of-missing-options-features--usability-gaps)
   - 2.1 [Data Scalability & Pagination Gaps](#21-data-scalability--pagination-gaps)
   - 2.2 [Settings & Tenant Customization Gaps](#22-settings--tenant-customization-gaps)
   - 2.3 [POS & Cashier Speed-of-Service Gaps](#23-pos--cashier-speed-of-service-gaps)
   - 2.4 [Inventory & Catalog Management Gaps](#24-inventory--catalog-management-gaps)
   - 2.5 [Customer CRM & Credit Control Gaps](#25-customer-crm--credit-control-gaps)
   - 2.6 [Platform App Owner (Superadmin) & Operations Gaps](#26-platform-app-owner-superadmin--operations-gaps)
3. [Platform Owner / Superadmin Dashboard (`/admin`) Architecture](#3-platform-owner--superadmin-dashboard-admin-architecture)
   - 3.1 [Security Model & Row Level Security (RLS) Strategy](#31-security-model--row-level-security-rls-strategy)
   - 3.2 [Tenant Management & Company Details Setup](#32-tenant-management--company-details-setup)
   - 3.3 [Global User Management & Password Recovery](#33-global-user-management--password-recovery)
   - 3.4 [Tenant Impersonation ("Support Mode")](#34-tenant-impersonation-support-mode)
   - 3.5 [Superadmin Audit Trail](#35-superadmin-audit-trail)
4. [Transactional Email Engine Specification (Resend Integration)](#4-transactional-email-engine-specification-resend-integration)
   - 4.1 [SDK Configuration & Architecture](#41-sdk-configuration--architecture)
   - 4.2 [Transactional Email Templates Catalog](#42-transactional-email-templates-catalog)
   - 4.3 [Email Delivery Logging & Outbox Table](#43-email-delivery-logging--outbox-table)
5. [Universal Server-Side Pagination Engine](#5-universal-server-side-pagination-engine)
   - 5.1 [Pagination Strategy & URL State Synchronization](#51-pagination-strategy--url-state-synchronization)
   - 5.2 [Target Pages & Database Query Upgrades](#52-target-pages--database-query-upgrades)
6. [Expanded User & Shop Settings Specification](#6-expanded-user--shop-settings-specification)
   - 6.1 [Team & Staff Management (`/settings/team`)](#61-team--staff-management-settingsteam)
   - 6.2 [Document Customization (`/settings/documents`)](#62-document-customization-settingsdocuments)
   - 6.3 [Print & POS Receipt Preferences (`/settings/printing`)](#63-print--pos-receipt-preferences-settingsprinting)
   - 6.4 [Cashier & Fast Checkout Preferences (`/settings/pos`)](#64-cashier--fast-checkout-preferences-settingspos)
7. [Step-by-Step Implementation Plan for Claude Code](#7-step-by-step-implementation-plan-for-claude-code)
   - [Phase A: Database Schema, Superadmin Roles & Resend Setup](#phase-a-database-schema-superadmin-roles--resend-setup)
   - [Phase B: Resend Email Engine & Branded Templates](#phase-b-resend-email-engine--branded-templates)
   - [Phase C: Superadmin Control Plane (`/admin`) Infrastructure](#phase-c-superadmin-control-plane-admin-infrastructure)
   - [Phase D: Superadmin Operations (Tenant Provisioning, Password Reset, Impersonation)](#phase-d-superadmin-operations-tenant-provisioning-password-reset-impersonation)
   - [Phase E: Universal Server-Side Pagination & Performance Upgrades](#phase-e-universal-server-side-pagination--performance-upgrades)
   - [Phase F: Expanded Tenant Settings (Team Management, Bank Details, Custom Prefixes)](#phase-f-expanded-tenant-settings-team-management-bank-details-custom-prefixes)
   - [Phase G: POS Usability Upgrades, Thermal Receipts & CSV Import/Export](#phase-g-pos-usability-upgrades-thermal-receipts--csv-importexport)
8. [Claude Code Operational Rules & Terminal Prompts](#8-claude-code-operational-rules--terminal-prompts)

---

## 1. EXECUTIVE SUMMARY & CURRENT ARCHITECTURE REVIEW

### 1.1 What We Have Today (Phases 1â€“6 Completed)
CarShop.Pk has a solid multi-tenant B2B POS and quoting foundation:
- **Core Engine**: Next.js 16.4.1 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix UI), `@react-pdf/renderer`.
- **Database & Security**: Supabase PostgreSQL with strict Row Level Security (RLS) enforcing isolation via `current_tenant_id()`.
- **Workflows Built**:
  - Full document lifecycle: Draft (`D-1001`) â†’ Quotation (`Q-1001`) â†’ Invoice (`INV-1001`) with multi-status transitions (Pending, Partially Paid, Paid, Due, Cancelled).
  - Multi-tier product categories (up to 4 levels deep, 157 categories initialized).
  - NHTSA Year/Make/Model (YMM) vehicle fitment engine + "Magic Fit" filter.
  - Pakistan localization: PKR/Rs. currency, whole rupees or paisa, CNIC/NTN/STRN tax validation, Asia/Karachi timezone, 03xx phone formatting.
  - Partial payments with line-item payment allocations.
  - PDF document generation & public view-only `/share/<token>` links for WhatsApp dispatch.
  - Interactive dashboard with dynamic charts and date range filters.

### 1.2 The Scaling Bottleneck & App Owner Blind Spot
Despite the rich feature set, the application currently suffers from two major structural deficiencies:
1. **Zero App Owner / Superadmin Control Plane**:
   - The platform creator/owner has **no admin portal**.
   - If a client calls asking to reset their password, fix company details, or onboard a new branch, the owner must manually edit rows in the Supabase Table Editor.
   - Platform admins cannot see total platform GMV, active shops, user directories, or tenant health metrics.
   - There is no email infrastructure: no welcome emails, no password reset emails, no invite links, no receipt emails.
2. **Missing Everyday Usability & Data Scalability Options**:
   - **No pagination anywhere**: Invoices, Quotations, Drafts, Customers, and Inventory load entire record sets into memory. Once a shop records 2,000+ invoices or 5,000+ parts, the app hits the 1,000-row Supabase default limit and experiences latency.
   - **Rigid Settings**: No way to set custom invoice numbering (e.g. migrate from old POS starting at #5001), no bank details printed on invoices, no thermal receipt printer format (80mm), no team member management screen to invite or remove staff.

This specification provides the blueprint to upscale CarShop.Pk into a scalable enterprise SaaS.

---

## 2. COMPREHENSIVE INVENTORY OF MISSING OPTIONS, FEATURES & USABILITY GAPS

### 2.1 Data Scalability & Pagination Gaps
| Area | Current State | Missing Feature / Improvement Needed | Impact |
| :--- | :--- | :--- | :--- |
| **Inventory Table** | `supabase.from("inventory_items").select(...)` fetches all items in one call. | Server-side SQL pagination (`limit`, `offset`) with page size selector (25, 50, 100 items), total record count, and URL state sync (`?page=1&limit=25`). | High: Prevents crashes & browser lag on large catalogs (1,000+ SKUs). |
| **Customer Directory** | Loads all customers into memory; stats calculate in JavaScript. | Paginated customer table with fast server-side search; distinct fast count query for aggregate metrics. | High: Essential once customer base grows past 500 contacts. |
| **Documents (Invoices/Quotes/Drafts)** | Loads all documents for active tab; in-memory date sorting. | Server-side paginated queries with indexed `created_at` or `invoiced_at` ordering and status filtering. | Critical: Documents grow indefinitely over time. |
| **Reports & Audit Logs** | Single bulk RPC query. | Paginated transactions and drill-down logs. | Medium: Keeps reporting responsive. |

### 2.2 Settings & Tenant Customization Gaps
| Area | Current State | Missing Feature / Improvement Needed | Impact |
| :--- | :--- | :--- | :--- |
| **Team Management** | Hardcoded to whoever signs up. Staff cannot be invited via UI. | **Team Members Tab (`/settings/team`)**: Admin can invite staff by email, assign roles (`Admin` vs `Staff`), suspend/delete users, and trigger password resets. | Critical: Auto shops have multiple cashiers, managers, and owners. |
| **Document Numbering** | Fixed auto-increment starting at 1001 (`INV-1001`, `Q-1001`, `D-1001`). | Custom prefix (e.g. `CS-INV-`, `KHI-`), custom padding (4 to 6 digits), and custom starting sequence (e.g., start at `5001` to match historical books). | High: Needed when shops migrate from legacy systems. |
| **Bank Details on Invoices** | Only generic notes (`quote_footer_notes`). | Dedicated Bank Details block in Settings (Bank Name, Account Title, Account Number, IBAN, Raast ID, JazzCash/EasyPaisa) that automatically renders on PDF and `/share` pages. | High: Primary B2B payment method in Pakistan is direct bank transfer / Raast. |
| **Terms & Disclaimers** | One shared note for quotes and invoices. | Separate **Quotation Terms** (e.g., validity, warranty terms) vs **Invoice Payment Terms** (e.g., late payment charges, no cash refunds, return window). | Medium: Prevents legal/operational friction with customers. |
| **Thermal Receipt Printing** | Standard A4 vector PDF only. | **80mm / 58mm Thermal Receipt Mode**: Compact printer layout optimized for point-of-sale receipt printers (Epson, Xprinter, Sunmi) for walk-in cash sales. | High: Retail walk-in customers demand small POS paper slips, not full A4 sheets. |
| **Shop Branding Customization** | Logo upload only. | Primary brand accent color override for customer-facing PDFs and share links; toggle for tax number visibility on receipts. | Medium: Personalizes the SaaS experience for premium shops. |

### 2.3 POS & Cashier Speed-of-Service Gaps
| Feature | Problem with Current Implementation | Solution to Implement |
| :--- | :--- | :--- |
| **Quick Cash Denominations** | Cashier must manually type exact numbers (e.g., `4650.00`) into the Record Payment modal. | One-tap cash buttons: `+Rs. 500`, `+Rs. 1,000`, `+Rs. 5,000`, `Exact Amount`, plus change calculation display ("Customer gave Rs. 5,000 â†’ Change Due: Rs. 350"). |
| **Barcode / SKU Quick-Scan Mode** | Adding parts requires typing into search and clicking a dropdown. | Barcode scanner listener on document screen: USB/Bluetooth barcode scanner inputs trigger instant item add without opening modals. |
| **Keyboard Fast-Keys** | Mouse-driven interactions slow down high-volume retail counters. | Keyboard shortcuts: `F2` = New Invoice, `F4` = Open Payment Modal, `F8` = Select Walk-in Customer, `Ctrl + Enter` = Save & Print. |
| **Daily Shift / Cash Drawer Closing** | No shift reconciliation; cash collected is mixed with historical invoices. | **Daily Cash Drawer / Register Closeout (Z-Report)**: Cashier opens shift with float (e.g., Rs. 5,000), system tallies cash collected during shift, cashier inputs counted cash, calculates over/short, and exports shift report. |
| **Auto-Print on Checkout** | Cashier must save invoice, click Share menu, open PDF, and click Print. | Configurable setting: "Auto-trigger print dialog immediately upon recording full payment". |

### 2.4 Inventory & Catalog Management Gaps
| Feature | Problem with Current Implementation | Solution to Implement |
| :--- | :--- | :--- |
| **Bulk CSV Import / Export** | Creating 1,000 inventory items requires typing them one-by-one into the dialog. | CSV import engine with column mapping (SKU, Name, Category, Cost, Sale Price, Stock, Fitment, Vendor), error validation preview, and bulk export to CSV/Excel. |
| **Stock Adjustments & Audit Trail** | Changing stock from 10 to 8 silently overwrites the number with no explanation. | **Stock Adjustment Modal**: Requires reason (`Damaged`, `Expired`, `Theft/Shrinkage`, `Stocktake Count`, `Vendor Return`) and writes to an audit table `stock_movements`. |
| **Units of Measure (UOM)** | Every item is assumed to be a single unit. Wraps and window films are sold in rolls, meters, or linear feet; detailing chemicals in liters or bottles. | Optional UOM field per item: `Roll`, `Meter`, `Piece`, `Bottle`, `Set`, `Kit`, `Box`. Displays on invoice line items. |
| **Automated Reorder Alerts** | Low-stock badges only show when navigating to `/inventory`. | Daily or real-time automated email summary to shop admin via Resend: "Warning: 5 products hit critical reorder threshold today". |

### 2.5 Customer CRM & Credit Control Gaps
| Feature | Problem with Current Implementation | Solution to Implement |
| :--- | :--- | :--- |
| **Customer Credit Limit** | B2B dealerships can accumulate unlimited debt; system never blocks new invoices. | Optional `credit_limit` field on customer profile. When creating an invoice that pushes balance past credit limit, system displays warning badge or requires admin override. |
| **Customer Statement of Account** | No way to give a dealership their monthly ledger. | "Generate Statement" button on Customer profile: date-filtered statement showing previous balance, invoices, payments received, and final balance due, printable as PDF. |
| **Payment Receipts** | Recording a payment updates invoice balance, but customer gets no proof of payment. | "Send Payment Receipt" button: generates clean payment voucher / receipt slip to share via WhatsApp or Email. |

### 2.6 Platform App Owner (Superadmin) & Operations Gaps
| Feature | Current State | Requirement |
| :--- | :--- | :--- |
| **Superadmin Access** | No platform admin role; only tenant-scoped `admin` and `staff`. | Dedicated `is_superadmin` flag in database and `/admin` route layout inaccessible to standard tenant users. |
| **Tenant Provisioning** | Only self-registration via `/register` form. | Platform Admin can manually create organizations/shops directly (ideal for closing deals offline, pre-loading demo data, onboarding enterprise clients). |
| **Company Details Assistance** | If a customer misspells their shop name or messes up their tax setup, owner cannot fix it without database console. | Platform Admin can edit any tenant's profile (name, slug, logo, contact, NTN, STRN, currency, terms, timezone) from the admin panel. |
| **Password Reset & Recovery** | Relying on default Supabase Auth without transactional email control. | Platform Admin can trigger password reset emails via Resend or generate temporary passwords directly from the user management screen. |
| **Shop Impersonation ("Login As")** | Impossible without knowing the user's password. | Secure impersonation session: platform admin can view any shop's dashboard in support mode to troubleshoot customer issues. |
| **Tenant Suspension** | No way to disable a delinquent or test tenant. | Platform Admin toggle: `active` vs `suspended` (blocked with banner "Account suspended. Contact support."). |
| **Email Service (Resend)** | Zero email integration in codebase. | Complete Resend API integration for system emails, invites, quotes/invoices, receipts, and admin broadcasts. |

---

## 3. PLATFORM OWNER / SUPERADMIN DASHBOARD (`/admin`) ARCHITECTURE

### 3.1 Security Model & Row Level Security (RLS) Strategy
To give App Admins full control **without weakening the multi-tenant "Digital Lock"**, we adopt a clean two-tier architecture:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        SUPABASE AUTH USER                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                    â”‚
               â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
               â–¼                                         â–¼
   [ REGULAR SHOP MEMBER ]                     [ PLATFORM SUPERADMIN ]
   - Row in public.profiles                    - Row in public.profiles with
   - Tied to tenant_id                         - is_superadmin = true
   - Scoped by current_tenant_id()             - Access to /admin route group
   - Standard RLS applies                      - Elevated Server Actions via
                                                 createAdminClient() (Service Role)
```

#### Why Service-Role Server Actions are Superior for Superadmin:
1. **Preserves Tenant RLS**: Tenant RLS policies continue to enforce `tenant_id = current_tenant_id()` strictly. We do not inject complex `OR is_superadmin()` clauses into high-frequency tenant queries, preventing performance degradation and security regressions.
2. **Strict Server-Side Verification**: Every Superadmin route and Server Action executes `getSuperadminSession()`:
   ```typescript
   export async function requireSuperadmin() {
     const session = await getShopSession(); // or getClaims()
     const supabase = await createClient();
     const { data: profile } = await supabase
       .from("profiles")
       .select("is_superadmin")
       .eq("id", session.userId)
       .single();
     if (!profile?.is_superadmin) {
       redirect("/dashboard"); // Unauthorized
     }
     return session;
   }
   ```
3. **Auditability**: Every privileged action taken by a Superadmin is recorded into `superadmin_audit_logs`.

### 3.2 Tenant Management & Company Details Setup
The Superadmin panel provides complete oversight of every shop on the platform:
- **Tenant Directory (`/admin/tenants`)**:
  - Filter by status (`Active`, `Suspended`, `Trial`), search by Shop Name, Slug, Phone, NTN, or Owner Email.
  - Metrics per tenant: Total Invoices Created, All-Time GMV, Active User Count, Inventory Size, Created Date.
- **Create New Tenant (`/admin/tenants/new`)**:
  - Direct form to provision a new auto shop without going through the public sign-up flow.
  - Inputs: Shop Name, Unique Slug, Owner Full Name, Owner Email, Temporary Password (or "Send Setup Email via Resend"), Preset Phone, City/Address, Currency, Tax Rate.
- **Edit Tenant Profile (`/admin/tenants/[id]`)**:
  - Full control over shop metadata: Name, Slug, Logo URL, Contact Phone/Email, Billing Address, NTN, STRN, Quote Terms, Timezone, Currency, Paisa display, Week Start.
  - **Account Status Toggle**: Switch between `Active` and `Suspended`. If suspended, users belonging to this tenant are blocked by middleware.

### 3.3 Global User Management & Password Recovery
- **Global User Directory (`/admin/users`)**:
  - Search any user across the entire platform by Name, Email, or Shop Name.
  - Displays Role (`Admin`, `Staff`), Associated Shop, Last Sign-In, Email Confirmed status.
- **Password Reset Engine**:
  - **Option 1 (Recommended - Resend Email)**: Platform admin clicks "Send Password Reset Link". The system generates a Supabase recovery token and sends a branded email via Resend to the user with a single-click reset button.
  - **Option 2 (Direct Temporary Password)**: For clients who cannot access their email or need immediate phone assistance, the platform admin generates a random temporary password (e.g., `CarShop#2026!xyz`) using Supabase Auth Admin API (`auth.admin.updateUserById`), copies it to the clipboard, and marks `require_password_change_on_login = true`.
- **User Role Modification**:
  - Elevate a staff member to shop admin or demote an admin.
  - Deactivate a user's login without deleting their historic records.

### 3.4 Tenant Impersonation ("Support Mode")
When a shop owner calls saying *"My quotation Q-1042 totals look wrong"* or *"I can't find where to add this part"*, the App Owner can enter **Support Impersonation Mode**:
1. Platform admin clicks **"Impersonate Shop"** on the tenant card in `/admin/tenants/[id]`.
2. Server sets an encrypted, signed HTTP-only cookie `carshop_impersonation = { tenantId, originalAdminId, expiresAt }`.
3. In `getShopSession()`, if the cookie is present and valid:
   - Data is retrieved for the target tenant.
   - A bright, prominent banner is rendered at the top of the entire screen:
     ```
     âš ï¸ SUPPORT MODE: Impersonating "Precision Tint & Wrap" (ID: 8a4f...) â€” Any changes made are live!
     [Exit Impersonation]
     ```
4. Clicking **[Exit Impersonation]** deletes the cookie and redirects back to `/admin/tenants/[id]`.
5. All actions taken during impersonation are tagged with `impersonated_by: superadmin_id` in audit logs.

### 3.5 Superadmin Audit Trail
Every superadmin mutation is recorded in `superadmin_audit_logs`:
- `id` (UUID)
- `superadmin_id` (UUID references profiles.id)
- `target_tenant_id` (UUID, optional)
- `target_user_id` (UUID, optional)
- `action` (e.g. `TENANT_CREATED`, `TENANT_SUSPENDED`, `COMPANY_DETAILS_UPDATED`, `PASSWORD_RESET_TRIGGERED`, `IMPERSONATION_STARTED`)
- `details` (JSONB diff of changed fields)
- `ip_address` (text)
- `created_at` (timestamptz)

---

## 4. TRANSACTIONAL EMAIL ENGINE SPECIFICATION (RESEND INTEGRATION)

### 4.1 SDK Configuration & Architecture
We integrate the official **Resend** Node.js SDK:
```bash
npm install resend
```
Environment variables required in `.env.local`:
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL="CarShop.Pk POS <notifications@carshop.pk>"
RESEND_SUPPORT_EMAIL="support@carshop.pk"
```

#### Client Singleton (`src/lib/email/client.ts`):
```typescript
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("âš ï¸ RESEND_API_KEY is not set. Outgoing emails will be logged to console in development.");
}

export const resend = process.env.RESEND_API_KEY 
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
```

### 4.2 Transactional Email Templates Catalog
All templates use clean, responsive, bulletproof HTML with the CarShop.Pk brand palette (`#000000` dark background, `#D9161F` racing red accents, high-contrast typography):

| Template Name | Trigger Event | Primary Recipient | Contents |
| :--- | :--- | :--- | :--- |
| **1. Welcome & Onboarding** | New shop registered on platform. | Shop Admin | Welcome message, shop handle confirmation, quick links to setup logo, add first part, and create first invoice. |
| **2. Admin-Provisioned Setup** | Platform admin creates shop in `/admin`. | Shop Admin | "Your shop workspace has been created by CarShop.Pk support." Includes single-click account activation & password creation link. |
| **3. Password Reset** | Triggered by user at `/forgot-password` or by platform admin. | Shop User | Security notice, direct password reset button valid for 1 hour, IP/location hint. |
| **4. Team Member Invitation** | Shop Admin invites a staff member in Settings. | New Staff Member | "You have been invited to join [Shop Name] as [Role]." Includes direct acceptance link. |
| **5. Customer Invoice / Quotation** | Shop clicks "Email Invoice" from Share menu. | Customer Email | Branded email with shop details, document number, total amount, due date, direct link to view interactive document online, and attached PDF. |
| **6. Payment Receipt** | Payment recorded in full or partial. | Customer Email | Official payment receipt acknowledgment, amount paid, balance remaining, payment method, transaction reference. |
| **7. Platform Announcement** | Superadmin broadcasts system update. | All Active Shop Admins | System release notes, scheduled maintenance alert, or platform feature updates. |

### 4.3 Email Delivery Logging & Outbox Table
Table `email_logs`:
- `id` (UUID primary key default `gen_random_uuid()`)
- `tenant_id` (UUID references public.tenants, nullable for system-wide emails)
- `recipient_email` (text not null)
- `template_type` (text not null)
- `subject` (text not null)
- `resend_id` (text, nullable)
- `status` (`queued`, `sent`, `delivered`, `failed`)
- `error_message` (text, nullable)
- `metadata` (JSONB, stores document_id, quote_number, etc.)
- `created_at` (timestamptz default now())

---

## 5. UNIVERSAL SERVER-SIDE PAGINATION ENGINE

### 5.1 Pagination Strategy & URL State Synchronization
All list pages (`/inventory`, `/customers`, `/invoices`, `/quotations`, `/drafts`) must adopt unified, clean server-side pagination:
- **Query Parameters**:
  - `page`: 1-based page index (defaults to `1`).
  - `limit`: Number of items per page (defaults to `25`; selectable: `25`, `50`, `100`).
- **SQL Execution**:
  - Queries execute `range((page - 1) * limit, page * limit - 1)` with `{ count: "exact" }`.
- **Reusable Pagination UI Component (`src/components/ui/pagination-bar.tsx`)**:
  - Displays: "Showing **1â€“25** of **1,480** items".
  - Jump controls: `Â« First`, `â€¹ Previous`, Page Numbers (`1`, `2`, `...`, `10`), `Next â€º`, `Last Â»`.
  - Rows per page dropdown (`25 / page`, `50 / page`, `100 / page`).
  - Automatically preserves existing URL query parameters (`search`, `category`, `status`, `sort`).

### 5.2 Target Pages & Database Query Upgrades
1. **Inventory (`/inventory`)**:
   - Update `getInventoryItems(filters, pagination)`:
   - Perform category, fitment, stock, and search filtering directly in PostgreSQL.
   - Return `{ items: InventoryListItem[], totalCount: number, page: number, pageSize: number, totalPages: number }`.
2. **Customers (`/customers`)**:
   - Update `getCustomers(filters, pagination)`:
   - Fast `count: "exact"` query.
   - Search on `name`, `contact_person`, `phone`, `whatsapp_number`, `email`, and `tax_id`.
3. **Documents (`/invoices`, `/quotations`, `/drafts`)**:
   - Update `getDocuments(section, filters, pagination)`:
   - Filter by status, search by document number or customer name.
   - Paged results return instantly regardless of how many thousands of historical documents exist.

---

## 6. EXPANDED USER & SHOP SETTINGS SPECIFICATION

### 6.1 Team & Staff Management (`/settings/team`)
Auto repair shops and accessory retailers have teams: owners, counter cashiers, tinters, fitters, and accountants.
- **Member Directory**:
  - Name, Email, Role (`Admin` vs `Staff`), Date Joined, Status (`Active`, `Invited`, `Suspended`).
- **Invite New Member Dialog**:
  - Full Name, Email Address, Role selection.
  - Generates secure invitation token and sends branded email via Resend.
- **Actions**:
  - Change Role (Admin â†” Staff).
  - Deactivate User (immediately blocks login).
  - Resend Invitation Link.

### 6.2 Document Customization (`/settings/documents`)
- **Numbering Configuration**:
  - Invoice Prefix (default: `INV-`, customizable to `CS-`, `INV-2026-`, etc.).
  - Quotation Prefix (default: `Q-`, customizable to `EST-`, `QT-`, etc.).
  - Draft Prefix (default: `D-`).
  - Next Sequence Number: Allows a shop migrating from an existing POS to start invoicing at e.g. `5001`.
- **Bank & Remittance Details (Printed on Invoices & Share Pages)**:
  - Bank Name (e.g. Meezan Bank, HBL, Bank Alfalah).
  - Account Title.
  - Account Number.
  - IBAN (24 digits).
  - Raast ID (instant bank transfer identifier).
  - Mobile Wallets (JazzCash / EasyPaisa account number).
  - Display toggle: "Show bank transfer details on invoices and customer share links".
- **Terms & Notes Segmentation**:
  - Separate editable text areas for:
    - **Quotation Validity & Warranty Terms** (e.g. "Valid for 30 days. Stock reserved. 1 year film peel warranty.").
    - **Invoice Payment & Return Policy** (e.g. "Goods once sold can only be exchanged within 7 days in original packaging. No refunds.").

### 6.3 Print & POS Receipt Preferences (`/settings/printing`)
- **Primary Print Format**:
  - `A4 Standard (Vector PDF)` â€” Full page invoice with itemized table, logo, tax numbers, and footer notes.
  - `80mm Thermal Receipt (POS Roll)` â€” Continuous receipt roll format without excessive margins, optimized for counter receipt printers.
- **Receipt Header & Footer Options**:
  - Show / Hide Shop Logo on Thermal Receipt.
  - Show / Hide Vehicle Information on Receipt.
  - Custom receipt footer slogan (e.g. *"Thank you for trusting CarShop.pk with your ride!"*).
- **Auto-Print Action**:
  - Checkbox: "Automatically open print preview after completing invoice payment".

### 6.4 Cashier & Fast Checkout Preferences (`/settings/pos`)
- **Default Payment Method**: Choose between `Cash`, `Card Terminal`, or `Bank Transfer`.
- **Quick Cash Denomination Buttons**: Toggle on/off fast buttons (`Rs. 500`, `Rs. 1,000`, `Rs. 5,000`, `Exact Amount`) inside the payment dialog.
- **Sound Effects Toggle**: Audio confirmation on successful transaction.
- **Barcode Scanner Quick-Add**: Automatically increment line item quantity when scanning identical SKU.

---

## 7. STEP-BY-STEP IMPLEMENTATION PLAN FOR CLAUDE CODE

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                       EXECUTION ROADMAP (PHASES A â€“ G)                      â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  Phase A: Database Migrations, Superadmin Roles & Resend Environment        â”‚
â”‚  Phase B: Resend Email Engine & Transactional Templates                     â”‚
â”‚  Phase C: Superadmin Control Plane (`/admin`) Infrastructure                â”‚
â”‚  Phase D: Superadmin Operations (Tenant Provisioning, Password Reset, Imp.) â”‚
â”‚  Phase E: Universal Server-Side Pagination & Performance Upgrades           â”‚
â”‚  Phase F: Expanded Tenant Settings (Team Invites, Bank Details, Custom Num) â”‚
â”‚  Phase G: POS Usability Upgrades, Thermal Receipts & CSV Import/Export      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

> âš ï¸ **RULE FOR CLAUDE CODE / AI AGENT**:  
> Build ONE phase at a time. Run tests, verify in browser, check lint/types, and commit code BEFORE moving to the next phase.

---

### PHASE A: Database Schema, Superadmin Roles & Resend Setup

#### 1. Objectives
- Add `is_superadmin` flag to `public.profiles`.
- Create `public.superadmin_audit_logs` table.
- Create `public.email_logs` table.
- Add tenant-level document numbering and bank details columns to `public.tenants`.
- Configure `.env.local` and environment validation for Resend.

#### 2. SQL Migration (`supabase/migrations/20261017000000_superadmin_and_scaling.sql`)
```sql
-- 1. Add superadmin flag to profiles
alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

create index if not exists idx_profiles_superadmin on public.profiles(is_superadmin) where is_superadmin = true;

-- 2. Add tenant customization columns
alter table public.tenants
  add column if not exists status text not null check (status in ('active', 'suspended', 'trial')) default 'active',
  add column if not exists invoice_prefix text not null default 'INV-',
  add column if not exists quote_prefix text not null default 'Q-',
  add column if not exists draft_prefix text not null default 'D-',
  add column if not exists next_invoice_number integer not null default 1001,
  add column if not exists next_quote_number integer not null default 1001,
  add column if not exists next_draft_number integer not null default 1001,
  add column if not exists bank_name text,
  add column if not exists bank_account_title text,
  add column if not exists bank_account_number text,
  add column if not exists bank_iban text,
  add column if not exists bank_raast_id text,
  add column if not exists bank_wallets text,
  add column if not exists invoice_terms text default 'Goods once sold can only be exchanged within 7 days in original condition.',
  add column if not exists print_format text not null check (print_format in ('a4', 'thermal_80mm')) default 'a4',
  add column if not exists auto_print_on_payment boolean not null default false;

-- 3. Superadmin audit logging
create table if not exists public.superadmin_audit_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  superadmin_id uuid not null references public.profiles(id) on delete cascade,
  target_tenant_id uuid references public.tenants(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_superadmin_logs_admin on public.superadmin_audit_logs(superadmin_id);
create index if not exists idx_superadmin_logs_tenant on public.superadmin_audit_logs(target_tenant_id);

-- 4. Transactional email logs
create table if not exists public.email_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  tenant_id uuid references public.tenants(id) on delete set null,
  recipient_email text not null,
  template_type text not null,
  subject text not null,
  resend_id text,
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed')) default 'queued',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_logs_tenant on public.email_logs(tenant_id);
create index if not exists idx_email_logs_status on public.email_logs(status);

-- 5. RLS Policies for new tables
alter table public.superadmin_audit_logs enable row level security;
alter table public.email_logs enable row level security;

-- Only authenticated users who are superadmins can read audit logs
create policy "Superadmins can read audit logs"
  on public.superadmin_audit_logs for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_superadmin = true));

-- Service role has full access
grant all on public.superadmin_audit_logs to service_role;
grant all on public.email_logs to service_role;

-- Tenant admins can read their own tenant email logs
create policy "Tenant admins can read their email logs"
  on public.email_logs for select
  to authenticated
  using (
    tenant_id = (select tenant_id from public.profiles where id = auth.uid())
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

#### 3. Verification & Test Steps
1. Apply migration via `npm run db:push` or Supabase MCP.
2. Regenerate database types: `npm run db:types`.
3. Check Supabase Table Editor: verify new columns on `tenants` and `profiles`, verify `superadmin_audit_logs` and `email_logs`.
4. Run `npm run build` to confirm zero TypeScript regression.
5. Commit: `git add . && git commit -m "feat(scaling): phase a - superadmin, email logs and tenant settings schema"`

---

### PHASE B: Resend Email Engine & Branded Templates

#### 1. Objectives
- Install `resend` package.
- Build email sending client with fallback mode for local development.
- Implement HTML/React transactional email templates with CarShop.Pk dark/red branding.
- Create Server Action `sendTransactionalEmail()` that logs every sent email into `email_logs`.

#### 2. Key Files to Create
- `src/lib/email/client.ts` â€” Resend instance + safe send wrapper.
- `src/lib/email/templates/welcome-email.tsx` â€” Onboarding new shop owners.
- `src/lib/email/templates/password-reset-email.tsx` â€” Password reset with action button.
- `src/lib/email/templates/staff-invite-email.tsx` â€” Team invitation link.
- `src/lib/email/templates/document-share-email.tsx` â€” Customer invoice/quotation email with direct link.
- `src/lib/email/templates/payment-receipt-email.tsx` â€” Payment acknowledgment.
- `src/lib/actions/email.ts` â€” Server actions to send emails & fetch delivery logs.

#### 3. Verification & Test Steps
1. In development without `RESEND_API_KEY`, sending an email logs formatted HTML to terminal.
2. In production / with key set, sending an email calls Resend API and records `resend_id` in `email_logs`.
3. Test sending a test email to your own address; check spam score and mobile responsiveness.
4. Commit: `git add . && git commit -m "feat(email): phase b - resend integration and responsive transactional templates"`

---

### PHASE C: Superadmin Control Plane (`/admin`) Infrastructure

#### 1. Objectives
- Create dedicated App Router route group `src/app/admin/`.
- Build Superadmin authentication & session verifier: `src/lib/superadmin.ts`.
- Distinct visual layout: dark header with red accents, dedicated Superadmin navigation:
  - ðŸ“Š Overview (`/admin`)
  - ðŸ¢ Organizations / Tenants (`/admin/tenants`)
  - ðŸ‘¥ Global Users (`/admin/users`)
  - âœ‰ï¸ Email Logs (`/admin/emails`)
  - ðŸ›¡ï¸ Audit Trail (`/admin/audit`)
- Middleware route protection: non-superadmin users attempting to open `/admin` are redirected to `/dashboard`.

#### 2. Key Files to Create
- `src/lib/superadmin.ts` â€” `getSuperadminSession()` and permission guard.
- `src/app/admin/layout.tsx` â€” Superadmin dashboard wrapper, top bar, admin navigation, logout.
- `src/app/admin/page.tsx` â€” Global platform overview:
  - Total Shops Registered
  - Total Active Users
  - Total Platform GMV (Gross Invoiced Amount across all shops)
  - Total Quotes & Invoices Created
  - Daily/Monthly Signups Chart
  - Recent Platform Activity Log
- `src/components/admin/admin-navbar.tsx` â€” Dedicated admin header.

#### 3. Verification & Test Steps
1. Open `/admin` as a standard user: redirected to `/dashboard`.
2. Set `is_superadmin = true` on your profile in Supabase Table Editor.
3. Open `/admin`: access granted, KPIs render accurately.
4. Verify responsive mobile menu on tablet/mobile screens.
5. Commit: `git add . && git commit -m "feat(admin): phase c - superadmin control plane layout and kpi dashboard"`

---

### PHASE D: Superadmin Operations (Tenant Provisioning, Password Reset, Impersonation)

#### 1. Objectives
- **Manage Tenants (`/admin/tenants`)**:
  - Filter by Active/Suspended, search by name/slug/owner.
  - "Create Organization" modal: provisions new shop, creates owner profile, sends welcome/setup email.
  - "Edit Company Details" modal: change shop name, slug, phone, email, address, NTN, STRN, terms, status.
  - "Suspend / Activate" switch: suspended tenants are blocked from signing in with a clear explanation banner.
- **Global User Directory (`/admin/users`)**:
  - Cross-tenant user search.
  - "Reset Password" button: triggers password reset email via Resend, or generates a temporary password displayed in a secure modal.
  - "Change Role" dropdown (`admin` â†” `staff`).
- **Support Impersonation Mode**:
  - "Impersonate Shop" action sets encrypted cookie `carshop_impersonation`.
  - Global warning banner rendered on every page while impersonating.
  - "Exit Support Mode" button restores superadmin session.

#### 2. Key Files to Create / Modify
- `src/lib/actions/superadmin-tenants.ts` â€” Server actions for tenant CRUD, suspension, company detail updates.
- `src/lib/actions/superadmin-users.ts` â€” Server actions for global user management, password reset generation.
- `src/lib/actions/impersonation.ts` â€” Start/stop impersonation cookie handlers.
- `src/app/admin/tenants/page.tsx` & `src/app/admin/tenants/[id]/page.tsx` â€” Tenant directory and detail views.
- `src/app/admin/users/page.tsx` â€” Global user management view.
- `src/components/admin/impersonation-banner.tsx` â€” Persistent support mode banner.

#### 3. Verification & Test Steps
1. In `/admin/tenants`, create a test organization "Apex Wrap Studio". Verify row created in `tenants` and `profiles`.
2. Edit its NTN and company phone number from the admin UI; confirm changes reflect immediately.
3. In `/admin/users`, locate the test user and click "Reset Password". Verify email logged in `email_logs`.
4. Click "Impersonate Shop". Verify dashboard switches to "Apex Wrap Studio" with top banner active.
5. Click "Exit Support Mode". Verify return to `/admin/tenants`.
6. Commit: `git add . && git commit -m "feat(admin): phase d - tenant provisioning, company setup, password reset and impersonation"`

---

### PHASE E: Universal Server-Side Pagination & Performance Upgrades

#### 1. Objectives
- Build reusable UI `<PaginationBar />` component with page size selector (25, 50, 100).
- Upgrade `getInventoryItems()`, `getCustomers()`, and `getDocuments()` to execute paginated SQL queries with exact counts.
- Keep page and limit in URL search params (`?page=1&limit=25`).

#### 2. Key Files to Create / Modify
- `src/components/ui/pagination-bar.tsx` â€” Reusable pagination component.
- `src/lib/actions/inventory.ts` â€” Accept `page` and `limit`, return paginated items + total count.
- `src/lib/actions/customers.ts` â€” Accept `page` and `limit`, return paginated customers + total count.
- `src/lib/actions/quotes.ts` â€” Accept `page` and `limit`, return paginated documents + total count.
- `src/app/(dashboard)/inventory/page.tsx` â€” Wire pagination bar below table.
- `src/app/(dashboard)/customers/page.tsx` â€” Wire pagination bar below table.
- `src/components/quotes/document-pages.tsx` â€” Wire pagination bar below drafts, quotes, and invoices tables.

#### 3. Verification & Test Steps
1. Open `/inventory` with 30+ items. Verify only 25 items show on page 1.
2. Click page 2: URL updates to `?page=2`, items 26+ render instantly.
3. Change page size to `50 / page`: URL updates to `?page=1&limit=50`.
4. Apply a category or search filter: page resets to 1, pagination reflects filtered count.
5. Repeat testing on `/customers` and `/invoices`.
6. Commit: `git add . && git commit -m "feat(perf): phase e - universal server-side pagination for inventory, customers and documents"`

---

### PHASE F: Expanded Tenant Settings (Team Management, Bank Details, Custom Prefixes)

#### 1. Objectives
- Expand `/settings` into clean sub-sections or tabs:
  - **Shop Profile** (`/settings` or tab)
  - **Preferences & Localization** (Currency, Tax, Timezone, Clock)
  - **Product Categories** (Existing CategoryManager)
  - **Team Members** (`/settings/team` or tab)
  - **Documents & Bank Details** (`/settings/documents` or tab)
  - **Printing & Receipts** (`/settings/printing` or tab)
  - **POS & Checkout** (`/settings/pos` or tab)
- Implement **Team Management**:
  - List shop members.
  - "Invite Staff Member" dialog with email invite via Resend.
  - Deactivate / promote / remove staff member.
- Implement **Document & Bank Details**:
  - Bank Name, Account Title, Account Number, IBAN, Raast ID.
  - Custom invoice and quote prefixes (e.g. `INV-` â†’ `CS-INV-`).
  - Next sequence number override.
  - Render bank details block on PDF invoice and `/share/<token>` page.

#### 2. Key Files to Create / Modify
- `src/components/settings/team-manager.tsx` â€” Staff invitation and role management UI.
- `src/components/settings/document-settings-form.tsx` â€” Custom prefixes and bank details form.
- `src/components/settings/pos-settings-form.tsx` â€” POS fast checkout and receipt preferences.
- `src/components/pdf/document-pdf.tsx` â€” Render bank details section on invoice PDF.
- `src/app/share/[token]/page.tsx` â€” Render bank remittance card on customer view.
- `src/lib/actions/team.ts` â€” Server actions for team member invites and role updates.

#### 3. Verification & Test Steps
1. In Settings â†’ Documents, set Bank Name: "Meezan Bank", Title: "Precision Auto", IBAN: "PK45MEZN0001234567890123". Save.
2. Open an invoice PDF: verify Bank Remittance block renders neatly below totals.
3. Open `/share/<token>`: verify bank details card appears for customer with one-click "Copy IBAN" button.
4. In Settings â†’ Team, invite a new staff member with email. Verify invite email sent via Resend.
5. Commit: `git add . && git commit -m "feat(settings): phase f - team invites, bank remittance on invoices and custom prefixes"`

---

### PHASE G: POS Usability Upgrades, Thermal Receipts & CSV Import/Export

#### 1. Objectives
- **Thermal Receipt (80mm) Print View**:
  - Provide dedicated print button: "Print POS Slip (80mm)".
  - Compact CSS stylesheet formatted for continuous 80mm roll printers.
- **Fast Cash Denominations**:
  - Quick-click buttons in Record Payment dialog (`Rs. 500`, `Rs. 1,000`, `Rs. 5,000`, `Exact Amount`).
  - Live "Change Due" calculator.
- **Bulk CSV Import & Export for Inventory**:
  - "Import Products (CSV)" button with downloadable sample template.
  - Column mapper and preview validator.
  - "Export All Inventory (CSV)" button.

#### 2. Key Files to Create / Modify
- `src/components/pdf/thermal-receipt.tsx` â€” 80mm print component.
- `src/components/quotes/payment-dialog.tsx` â€” Add quick cash buttons and change calculator.
- `src/components/inventory/csv-import-dialog.tsx` â€” CSV upload, parse, and bulk insert.
- `src/lib/actions/inventory-csv.ts` â€” Server action for bulk CSV validation and batch creation.

#### 3. Verification & Test Steps
1. On an unpaid invoice, open Record Payment: click `Rs. 5,000` button; verify amount fills and change due calculates.
2. Click "Print POS Slip (80mm)": verify browser print preview opens in compact 80mm receipt format.
3. In Inventory, download CSV template, fill in 3 test items, upload: verify items appear in inventory table.
4. Export CSV: verify downloaded file contains full inventory list.
5. Commit: `git add . && git commit -m "feat(pos): phase g - thermal 80mm receipts, quick cash buttons and csv import/export"`

---

## 8. CLAUDE CODE OPERATIONAL RULES & TERMINAL PROMPTS

### 8.1 Golden Rules of Execution
1. **Never Break RLS Multi-Tenancy**: Tenant queries MUST always execute within `current_tenant_id()`. Superadmin queries MUST use `createAdminClient()` only within server-side functions protected by `requireSuperadmin()`.
2. **Never Break Next.js 16 App Router Conventions**:
   - `proxy.ts` is the middleware file.
   - Do not use deprecated `next/router` (use `next/navigation`).
   - Server Actions must start with `"use server";`.
3. **Respect Pakistan Localization**: Always maintain PKR/Rs. formatting, CNIC/NTN/STRN validations, 03xx phone formatting, and Asia/Karachi time.
4. **Preserve Design System Tokens**: Use the color palette from `carshop_logo/` (neutral blacks `#111113`, racing red `#D9161F`, crisp borders `var(--slate-200)`). Do not introduce random CSS frameworks.

### 8.2 Ready-to-Run Claude Code Terminal Prompts

#### Prompt to Start Phase A:
```bash
claude "Read docs/upscaling.md section 'PHASE A: Database Schema, Superadmin Roles & Resend Setup'. Apply the migration 20261017000000_superadmin_and_scaling.sql, run db:push and db:types, verify zero type errors, and commit once tested."
```

#### Prompt to Start Phase B:
```bash
claude "Read docs/upscaling.md section 'PHASE B: Resend Email Engine & Branded Templates'. Install resend, build src/lib/email/client.ts with fallback logging, build the 5 responsive HTML templates, create the sendTransactionalEmail action, test sending, and commit."
```

#### Prompt to Start Phase C:
```bash
claude "Read docs/upscaling.md section 'PHASE C: Superadmin Control Plane (/admin) Infrastructure'. Implement getSuperadminSession(), create the /admin route group with dark/red admin navbar, build the KPI overview dashboard, protect routes in proxy.ts, test in browser, and commit."
```

#### Prompt to Start Phase D:
```bash
claude "Read docs/upscaling.md section 'PHASE D: Superadmin Operations'. Build the /admin/tenants directory with organization creation and company details editing, build the /admin/users directory with password reset via Resend, build support impersonation mode, test thoroughly, and commit."
```

#### Prompt to Start Phase E:
```bash
claude "Read docs/upscaling.md section 'PHASE E: Universal Server-Side Pagination'. Build the reusable PaginationBar component, update getInventoryItems, getCustomers, and getDocuments with range/count queries, wire URL searchParams synchronization, test with multiple pages, and commit."
```

#### Prompt to Start Phase F:
```bash
claude "Read docs/upscaling.md section 'PHASE F: Expanded Tenant Settings'. Add the Team Management tab with staff invitations via Resend, add Document Customization with custom prefixes and bank details on invoices, update PDF and share pages to display bank details, test, and commit."
```

#### Prompt to Start Phase G:
```bash
claude "Read docs/upscaling.md section 'PHASE G: POS Usability Upgrades, Thermal Receipts & CSV Import/Export'. Add 80mm thermal receipt printing, quick cash denomination buttons with change calculator in payment dialog, inventory CSV bulk import/export, test, and commit."
```

---
*End of Blueprint. Save as `docs/upscaling.md` and execute systematically.*

