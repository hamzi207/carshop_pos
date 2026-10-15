Phase 1: 

The Supabase database is set up for Phase 1. I applied all three migrations through the MCP connection, so you didn't have to run any SQL yourself. Type-checking and npm run 
  build both pass.

  What's in the database now:
  - Tables: all 8 exist, and every one has row-level security (RLS, the rules that keep each shop's data separate) turned on.
  - Policies: 23 on the app tables and 4 on file storage.
  - Functions: current_tenant_id, handle_new_shop_registration and process_quote_payment are in place.
  - Sign-up trigger: creating an account also creates the shop and makes that person its admin.
  - Logo storage: the shop-assets bucket exists.

  Code changes:
  - I replaced src/lib/types/database.types.ts with types generated from the live database.
  - The generated types list columns like role as plain text, so I added a one-line fix in src/lib/auth.ts. Any role other than admin is treated as staff.

  One security warning you should decide on: Supabase's security check flags public.rls_auto_enable(), which anyone can call without signing in. It's one of Supabase's own      
  functions, not part of our migrations, so I left it alone. If you want, I can remove that public access. The check also lists our two functions; that's intended, because      
  signed-in users need to call them.

  Please test Phase 1 in the browser:
  1. Run npm run dev and open http://localhost:3000/register.
  2. Register with a shop name, your name, an email and a password. If email confirmation is on in Supabase, click the link in the email.
  3. You should land on /dashboard with your shop name and "admin" showing.
  4. Sign out, then sign back in at /login. You should reach the dashboard again.
  5. In the Supabase dashboard, open Table Editor: tenants and profiles should each have one new row, with role = admin.
  6. Optional: register a second shop in a private window. Each account should see only its own shop.

  I'm stopping here. Once the test passes and you've committed, tell me and I'll start Phase 2.

  Also, claude --resume is a terminal command; typed into this chat it does nothing. This session already picked up where we left off.

  Phase 2: 

  Phase 2 is built, but the vehicle catalog is still empty: you need to run the seed script once to load it. The new database change is already live in
  Supabase. The type-check, lint and build pass, and a dry run of the seed pulled clean data from NHTSA. The Phase 1 fixes are committed (c1eeee0); the
  Phase 2 work is not committed yet.

  What's new:
  - Seed script (scripts/seed-vehicles.mts, run with npm run seed:vehicles): loads Year → Make → Model data for the top 20 makes, model years 2015–2026,
    into the vehicles table.
  - Lookup endpoint (/api/vehicles): feeds the cascading dropdowns that later phases use. It only answers signed-in users.
  - Vehicle types (src/lib/types/vehicle.ts), plus a new database migration (vehicle_lookups).

  Where I changed the spec's version, and why:
  - Junk results: NHTSA matches make names partially. The spec's script would have stored 40+ unrelated manufacturers under "Ram" (Rambler, trailer
    builders) and Honda motorcycles under Honda. The script now only takes cars, trucks and SUVs/minivans, and only exact make names.
  - Duplicates on re-run: the spec's script would have added duplicate rows every time it ran. I fixed the unique constraint so it's safe to run again.
  - Years: 2015–2026, as the spec's text says; its code sample only started at 2018.
  - Running it: it uses Node's built-in TypeScript support instead of ts-node/dotenv, so nothing new to install.

  Your test steps:
  1. Run npm run seed:vehicles. It takes about 2–4 minutes and prints one line per make and year, then a total. The total should be a few thousand
     vehicles, with no ✗ lines. If any fail, run it again; it only fills in what's missing.
  2. In Supabase, open Table Editor → vehicles. It should show clean rows like 2023 | TOYOTA | Camry.
  3. With npm run dev running and you signed in, open these in the browser:
     - http://localhost:3000/api/vehicles should list the years.
     - http://localhost:3000/api/vehicles?year=2023 should list the makes for that year.
     - http://localhost:3000/api/vehicles?year=2023&make=toyota should list Toyota models, each with an id.
  4. In a private window where you're not signed in, open /api/vehicles. You should be redirected to the login page, not shown any data.
  5. If everything checks out, commit with: git add . && git commit -m "feat: phase 2 - nhtsa vehicle engine and seed pipeline"

  Two security warnings, your call whenever you like:
  - Supabase's own rls_auto_enable() function can still be called without signing in (from earlier).
  - New: Supabase Auth's leaked-password check is off. It blocks passwords that appear in known data breaches. You turn it on in Authentication →
    Settings (it may require a paid Supabase plan).

  I'm stopping here. Tell me when Phase 2 passes and is committed, and I'll start Phase 3 (inventory).

  Follow-up during testing: the models list came back empty because the seed hadn't been run yet. I ran it (3,255 vehicles, no failures) and changed
  the endpoint so empty answers are never cached by the browser. The empty answer from before the seed stayed cached for that one URL until the cache
  expired or was cleared.

  Phase 3: 

  Phase 3 is built: the Inventory page is live in the sidebar. You can add, edit and delete parts, mark each as Universal Fit or tied to specific vehicles, and
  see margins and low-stock warnings. Type-checking, lint and the production build pass. I also loaded the page as a temporary test shop: it showed the right
  items for each search and filter, highlighted low stock, and showed nothing from your shop. I've deleted that test shop. I haven't clicked through the        
  add/edit form myself, which is what your test below covers. Nothing from this phase is committed yet.

  What's on the page:
  - Table: each part shows its name, SKU, category, fitment, cost, selling price, a colour-coded margin and stock level. Rows at or below their own alert level
    (default 5) are highlighted.
  - Filters: search by SKU or name, category buttons, and a fitment-type dropdown. Filters are kept in the URL, so a refresh or a shared link keeps them.       
  - Add / Edit dialog:
    - SKUs can be generated from the category; SKUs are always saved in capitals.
    - A live margin preview shows as you type prices.
    - The Universal Fit / Vehicle Specific choice follows the Figma design.
    - Vehicle selection is Year → Make → Model. Each model you pick becomes a removable tag. If you change the year, the make stays selected, so adding the same
      model across several years only takes two clicks each.
  - Delete: asks for confirmation first. Past quotes keep their line descriptions and prices.

  Changes behind the scenes:
  - Saving is all-or-nothing: an item and its vehicle links save together in one database transaction, so a half-finished save can't leave an item with no      
    vehicles.
  - Search handles symbols: searching for 20% or 6.5" matches those characters literally. I tested this against the live database.
  - Migration file names: I renamed the local migration files to match the version numbers Supabase recorded. Without this, npm run db:push would have tried to 
    re-run everything.

  Limits for now: there's no pagination yet, and the database API returns at most 1,000 rows. That's fine for most shops, and I can add paging later. Any shop  
  member can manage inventory, since the spec doesn't restrict it to admins.

  Your test steps:
  1. Open /inventory (sidebar → Inventory). You should see the empty state.
  2. Add a Universal part, e.g. "Standard Window Cleaner", category Hardware / Chemicals. Try Generate for the SKU.
  3. Add a Vehicle Specific part, e.g. "Ford F-150 Pre-cut Ceramic Tint". Choose 2022 → Ford → F-150, then switch the year to 2021 and pick F-150 again. Give it
     a stock of 3 so it shows as low stock.
  4. Check the table: green "Universal Fit" and blue "Vehicle Specific (2 vehicles)" tags (hover the blue one for the list), margin percentages, and a red      
     low-stock badge on the tint.
  5. Try the search box, the category buttons and the fitment filter. Then edit an item, and delete one.
  6. Optional: try saving a duplicate SKU (you should get an error on the SKU field), or Vehicle Specific with no vehicles (you should be blocked).
  7. Commit: git add . && git commit -m "feat: phase 3 - inventory management and ymm compatibility"

  The two security warnings from earlier, rls_auto_enable() and leaked-password protection, are still waiting on your decision.

  Tell me when Phase 3 passes and is committed, and I'll start Phase 4 (customers and WhatsApp CRM).

  Phase 4:

  Phase 4 is built and ready for you to test in the browser; nothing is committed yet. Type-checking, lint and the production build all pass. Every new
  page was loaded with a temporary test shop (since deleted) and rendered correctly.

  Pakistan defaults (spec §2.3):
  - Currency: the shop switched from $ to Rs.; only Rs. or PKR are allowed. Amounts show as Rs. 12,500.00, or whole rupees if paisa is turned off.
  - Timezone: dates use Pakistan time (Asia/Karachi).
  - Phone numbers: typed the Pakistani way (0300-1234567, 0300 123 4567, +92 300 1234567 and 3001234567 all work). Landlines like 051-1234567 are
    fine for "other phone", but WhatsApp numbers must be mobiles starting 03. + international numbers are rejected until switched on in Settings.
    Numbers are saved in one standard format so WhatsApp links work, and always display as 0300-1234567.

  Settings page (sidebar → Settings; admins edit, staff view only): currency (Rs./PKR), show paisa with a live preview, tax rate (starts at 0%),
  "selling prices include tax" (on by default), allow international numbers, and timezone (shown, fixed for now).

  Tax-inclusive products: each product has a "Selling price includes tax" checkbox defaulting to the shop setting. The inventory table shows
  "incl. tax" or "+ tax" under each price. Quotes in Phase 5 will work tax out of the price instead of adding it on top.

  Customers (sidebar → Customers):
  - List: totals (customers, B2B accounts, outstanding balance), type badges, clickable WhatsApp numbers, quote count / outstanding per customer.
  - Search covers name, contact, phone (either format), email and NTN. Type filters: Dealerships, Fleet, Retail.
  - Register / edit in a pop-up, with an NTN / Tax ID field.
  - Profile page: contact details, notes, a "Message on WhatsApp" button with a greeting pre-filled, and a quote history that fills in from Phase 5.
  - Delete is blocked once a customer has quotes, so their history is kept.

  Drafts / Quotations / Invoices (requested for Phase 5): the sidebar shows Drafts, Quotations and Invoices as "coming soon" instead of
  "Quotes & POS". The spec's Phase 5 now says: one document at different stages; conversions Draft → Quotation or Invoice, Quotation → Invoice;
  number series D-1001 / Q-1001 / INV-1001, with earlier numbers kept ("INV-1007, from Q-1004"); direct billing from Invoices for walk-in sales.

  Also fixed: the customer profile page (the first page with an ID in its address) broke the production build because the sidebar couldn't work
  out the current page at build time. Fixed the way the Next.js docs recommend (sidebar nav wrapped in Suspense).

  Your test steps:
  1. Settings: check Rs. is selected. Switch to PKR and turn paisa off; watch the preview. Save, check prices on /inventory, then switch back.
  2. Inventory: edit a product; check the new tax checkbox and the Rs. prefix on the price fields.
  3. Customers: register "Precision Auto Dealership" with WhatsApp 0300 123 4567. It should save and display as 0300-1234567.
  4. Phone rules: WhatsApp +971501234567 should be rejected with a hint about Settings; turn on international numbers and it saves.
     A landline like 051-1234567 is rejected as WhatsApp but accepted as "other phone".
  5. Search 0300-123 or the contact's name. Open the profile and click Message on WhatsApp.
  6. Commit: git add . && git commit -m "feat: phase 4 - b2b customer directory and pakistan localization"

  Still waiting on a decision: rls_auto_enable() can be called without signing in, and leaked-password protection is off.

  Phase 4 tweaks (committed as "Phase 4 Tweaks"):

  - Settings: the shop timezone can be changed (any timezone, grouped by region with its UTC offset). The database only accepts real timezone names.
  - Dashboard clock at the right end of the Overview heading, in the shop timezone, with the day, date and timezone under it.
    Settings → Dashboard clock: show/hide, digital or analog, and 12-hour or 24-hour for the digital clock. The analog clock has a second hand; the
    digital one shows hours and minutes only.

  Phase 5:

  Phase 5 is built: Drafts, Quotations and Invoices are live in the sidebar. Type-checking, lint and the production build pass. I also ran a full
  browser test as a temporary test shop (24 checks, all passed, no browser errors) and deleted that test shop afterwards. Your shop's data was not
  touched. Nothing is committed yet.

  How it works:
  - One document moves through the stages: Draft (D-1001) → Quotation (Q-1001) → Invoice (INV-1001). It keeps every number it has had, so an invoice
    shows "from Q-1001 · D-1001" and old links redirect to where the document is now. Numbers run per shop and start at 1001.
  - Conversions are one click with a confirmation: Draft → Quotation, Draft → Invoice, Quotation → Invoice. Invoices can't be turned back.
  - Drafts can be deleted. Quotations can be marked accepted, cancelled, or re-opened. Unpaid invoices can still be edited; paid ones (Phase 6) and
    cancelled quotations are read-only.
  - "New" buttons on each page. New Invoice is direct billing for walk-in sales. A customer's profile has a "New Quotation" button that pre-selects
    them, and their history links to each document.

  The builder:
  - Customer search (name, phone or NTN), with "Register a new customer" in a pop-up.
  - Year → Make → Model vehicle picker (optional for parts-only sales) plus a trim/package notes box.
  - Magic Fit: with a vehicle chosen, the parts list shows only universal parts and parts linked to that vehicle, and the banner says how many fit.
    Switch off "Compatible parts only" to see everything; parts that aren't linked are labelled.
  - Line items: quantity stepper, editable unit price, move up/down, remove, and a warning when the quantity is more than the stock. Adding the same
    part again adds 1 to its quantity. Optional fitting / labour lines with their own description, hours and rate.
  - Order summary: subtotal, discount in Rs. or %, tax, grand total, internal notes and your quote terms.
  - Tax follows your settings. Tax-inclusive prices have the tax worked out of them; tax-exclusive prices have it added on top. The final totals are
    calculated in the database, so they can't be tampered with from the browser.

  Fixed during testing: Next.js keeps visited pages alive in the background, so "New Draft" could reopen the form you had just saved and create a
  duplicate. The form now resets after each create.

  Your test steps:
  1. Customers: add a customer if you deleted your test one.
  2. Drafts → New Draft: pick the customer, then a vehicle that some of your parts are linked to. Check that the list hides parts for other vehicles
     but still shows universal ones. Turn "Compatible parts only" off and on.
  3. Add two parts and a labour line, set a 10% discount, and check the totals. (Set a tax rate in Settings first if you want to see tax.)
  4. Save Draft (D-1001), then Convert to Quotation (Q-1001), Mark Accepted, then Convert to Invoice (INV-1001, "from Q-1001 · D-1001").
  5. Invoices → New Invoice: bill a walk-in sale with no vehicle.
  6. Open the customer's profile: the history lists both invoices and links to them.
  7. Commit: git add . && git commit -m "feat: phase 5 - drafts, quotations, invoices and ymm magic filter"

  Still waiting on a decision: rls_auto_enable() can be called without signing in, and leaked-password protection is off. Before Phase 6:
  signed-in users can still change a quote's payment fields directly through the database API, so Phase 6 should lock "paid" down to the payment
  procedure only.

  Changes from docs/changes.md (after Phase 5):

  Phase 5 was committed on its own first (cd9a9e4). These changes are built and tested but not committed. Type-checking, lint and the
  production build pass. A browser test as a temporary test shop passed all 25 checks with no browser errors; the test shop was deleted.
  The database logic was also tested directly against your shop inside a transaction that was rolled back, so your data is unchanged.

  Your choices: keep tax-inclusive prices alongside the new tax order; leave the Purchases widget and Total Suppliers out (no purchase
  records yet); apply a customer's default discount as the document discount.

  1. Sidebar: Overview, Invoices, Quotations, Drafts, Customers, Inventory.

  2. Customers and walk-in sales:
  - Every shop has a "Walk-in / Cash Customer" (new shops get it on sign-up). A "Walk-in / Cash" button on every document picks it, with
    optional buyer name and phone stored on the document only. It is hidden from the customer directory and can't be edited or deleted.
  - "Save details to customer directory for future use" opens the full customer form with the name and phone filled in; the new profile then
    replaces the walk-in on that document.
  - Customers have a default discount %. Picking them on a document fills in the document discount with the reason
    "Customer default discount (50%)". You can change it.

  3. Pricing: each line has a discount in % or Rs. Order: line nets → subtotal → document discount (reason required) → taxable amount →
     sales tax → grand total. Tax-inclusive prices still have tax worked out of them; with tax-exclusive prices the tax is exactly
     (subtotal − discount) × rate.

  4. Tax identity: "NTN / Tax ID" is now "CNIC / NTN", checked and stored as 12345-1234567-1 or 1234567-8. New fields: sales tax registration
     (registered / not) and STRN. Dealerships and fleet accounts need a CNIC or NTN; registered customers also need an STRN. The database
     enforces the same rules.

  5. Stock reservations:
  - Drafts hold nothing. Quotations reserve their parts. Invoices deduct stock (direct, or from a quotation, which releases its reservation).
  - Cancelling, deleting or moving a quotation back to drafts releases the reservation. A quotation moved back to drafts gets its Q- number
    back when re-issued.
  - Nothing can sell or reserve more than is available (on hand − reserved), and on-hand stock can't be set below what is reserved.
  - Quotations are valid for 2 days by default (Settings → Quotations). Expired ones are marked but keep their stock reserved until you act.
  - Change from the original plan: stock is deducted when the invoice is issued, not when it is paid. Phase 6's "mark as paid" no longer
    touches stock (spec updated).
  - Inventory shows available, on hand and reserved for each part. The quote picker shows available stock.

  6. Vendors: each part has an optional vendor / supplier name. It is not shown in the inventory table; click a product's name to see its
     details, including the vendor.

  7. Dashboard: a Business overview with Sales, Profit (sales excluding tax minus parts cost), Pending invoices and Pending quotations
     (unexpired), each for today, this week, this month, this year and all time, in your shop's timezone. Plus counts of customers, products,
     quotations and invoices. "Customize" shows or hides each widget and period, saved per user.

  Your test steps:
  1. Check the sidebar order and the Business overview on the dashboard. Use Customize to hide something, reload, and check it stays hidden.
  2. Inventory: click a part's name and check the details (add a vendor via Edit first).
  3. Customers: edit or register a dealership; try saving without a CNIC/NTN (refused), then with one. Set a default discount of 50%.
  4. Quotations → New Quotation: pick that customer (50% fills in with a reason). Add a part with a 10% line discount and check the totals.
     Save it, then check Inventory shows those units as reserved.
  5. Invoices → New Invoice → Walk-in / Cash: try to sell the reserved units (refused), then sell something else.
  6. Open the quotation: Move to Drafts (stock released), Convert to Quotation (same Q number), Convert to Invoice (stock deducted).
  7. Commit: git add . && git commit -m "feat: walk-in sales, discounts, tax IDs, stock reservations, vendors and dashboard metrics"

  Still open: rls_auto_enable() can be called without signing in, and leaked-password protection is off. Before Phase 6 ships, clients must
  be stopped from setting an invoice to "paid" directly through the API.

  Changes from docs/changes.md, round 2 (same phase, still not committed):

  Type-checking, lint and the production build pass. Browser tests as a temporary test shop passed 28 checks (22 for this round,
  6 re-checking last round's quotation flows on the new layout) with no browser errors; the test shop was deleted. One bug was found and
  fixed during testing: saving failed because Supabase's API rejects an UPDATE without a WHERE clause inside save_quote.

  Documents (drafts, quotations, invoices):
  - New layout, like SOS Inventory: a header with the customer and bill-to address on the left and number, dates, due date and status on
    the right; the line items in full width; notes and quote terms bottom-left; totals, payments and balance bottom-right.
  - No more parts catalog, vehicle or trim. A search box in Line items finds parts by name or SKU; click one to add it (again to add 1).
  - Columns: qty, unit price, discount, sale price, line total. The unit price of an inventory part comes from inventory and can't be
    edited (the server enforces this). The discount is per unit, in % or Rs. Changing the discount changes the sale price; typing a sale
    price turns the discount into a flat Rs. amount. Line total = qty × sale price.
  - Items not in inventory: "Custom item" (or pick "Add ... as a custom item" in the search). You type the description and price; it
    doesn't touch stock.
  - Quote terms show on drafts and quotations only, not on invoices.

  Invoices:
  - Statuses: Pending / Unpaid, Partially Paid, Due (unpaid past the due date), Paid, Cancelled. The Invoices list has a filter for each,
    plus Due date and Balance columns.
  - Each invoice has a due date (default: invoice date + 7 days, change it in Settings → Quotations & invoices, or per invoice).
  - Record Payment: amount (part payments are fine), cash / card / bank transfer / cheque, date, reference. Paid in full = Paid.
  - Mark Unpaid removes the payments. Unpaid invoices can be cancelled (stock goes back) or deleted (stock goes back). Paid invoices must
    be marked unpaid first.

  Elsewhere: product names are bigger (13px) everywhere; the sidebar order is Overview, Inventory, Invoices, Quotations, Drafts, Customers.

  Your test steps:
  1. Invoices → New Invoice: pick a customer (their address shows under Bill to). Search a part and click it; try a 10% discount and watch
     the sale price; then type a sale price and watch the discount switch to Rs. Add a custom item with a price.
  2. Create Invoice. Record a part payment (Partially Paid), then the rest (Paid). Mark Unpaid, then Delete: the stock comes back.
  3. Make another invoice and Cancel it: the stock comes back and it shows as Cancelled.
  4. Change an unpaid invoice's due date to yesterday and save: it shows as Due, and the Due filter finds it.
  5. Quotations → New Quotation: Quote terms show at the bottom; on invoices they don't.
  6. Commit: git add . && git commit -m "feat: document layout, line pricing, custom items, payments and invoice statuses"

  Still open: rls_auto_enable() can be called without signing in, and leaked-password protection is off.

  Changes from docs/changes.md, round 3 (same phase, still not committed):

  Type-checking and lint pass. Browser test on your dev server as a temporary test shop: 14 checks passed, no browser errors; the test
  shop was deleted. (No production build was run, so the dev server keeps serving fresh styles.)

  - Invoice number: a new invoice / quotation / draft shows the next number in line (e.g. INV-1002) as soon as it opens. Nothing is
    reserved: if it's never saved, the number stays free for the next one. If someone else saves first, this one gets the next free
    number and the save message says so.
  - Due date: a new invoice starts due on the invoice date. Customers have a Credit period (days) on their profile; picking that customer
    sets the due date to the invoice date + their credit period. You can still change it per invoice. The due date is saved on the
    invoice. Converting a quotation to an invoice uses the customer's credit period too. The shop-wide "due after N days" setting from
    round 2 was removed (the customer's credit period replaces it).
  - Unsaved changes: leaving a draft / quotation / invoice with unsaved changes (the back arrow, the browser Back button, or any link such
    as the sidebar) asks "Save your changes?" with Save, Discard changes or Keep editing. Reload / close tab uses the browser's own
    prompt.
  - Business / Private customer category: skipped, as you asked.
  - Walk-in / cash sales without a name or number: answered below; no change needed.

  Walk-in sales tracking: every walk-in invoice belongs to the shop's "Walk-in / Cash Customer" record, so it counts in Sales, Profit,
  Pending invoices and stock exactly like any other invoice; the name and phone are optional extras on that one invoice. In the
  Invoices list it shows as "Walk-in / Cash Customer" (or the buyer's name if typed).

  Your test steps:
  1. Customers: edit a customer and set Credit period to 30 days.
  2. Invoices → New Invoice: the next invoice number shows at the top right. Due date = today. Pick that customer: due date jumps 30 days
     ahead. Pick Walk-in / Cash: back to today.
  3. Add a part, then click the back arrow (or a sidebar link): you're asked to save or discard. Try Keep editing, then Save Invoice.
  4. Open the invoice, change a discount and press the browser's Back button: same prompt. Discard → the change isn't saved.
  5. Commit: git add . && git commit -m "feat: invoice number preview, customer credit periods, unsaved-changes prompt"

  Changes from docs/changes.md, round 4 (same phase, still not committed):

  Type-checking and lint pass. Browser test on the dev server as a temporary test shop: 12 checks passed, no browser errors; the test
  shop was deleted.

  - Sidebar: more space around the header, shop card, menu items and help card; on short screens it scrolls instead of squashing and the
    help card is hidden.
  - Name: CarShop.Pk POS System everywhere (sidebar logo "C", sign-in/register pages, browser tab titles, help card, version line).
  - Editing a draft / quotation / invoice: "Save Changes" now has a menu (▾) with Save & Close (saves, back to the list) and Save as Copy
    (your edits become a new draft; the original stays as it was saved).
  - Bigger titles: document numbers, customer names, bill-to and summary names are now 13px, the same as product names.
  - Dashboard: Customize lets each card show Numbers, a Bar chart or a Pie chart (counts: numbers or bars).
    Sales / Profit bars = last 6 months; pie = one period split into profit, cost of parts and tax (pick the period on the card).
    Pending invoices bars = unpaid balance by age (not due, 1–30, 31–60, 60+ days overdue); pie = overdue vs not yet due.
    Pending quotations bars / pie = sent vs accepted. Hover any bar or slice for details.
  - Toasts for every save, create, discard and delete (invoices, quotations, drafts, customers, inventory, payments, settings,
    dashboard), each with a line saying what happened, e.g. "Invoice INV-1003 saved — Precision Auto · Rs. 4,650.00. Stock updated to
    match." Failures show a red toast with the reason.

  Your test steps:
  1. Check the sidebar and the CarShop.Pk name; make the window shorter to see it scroll.
  2. Open an invoice, change something, use Save Changes ▾ → Save & Close, then try Save as Copy on another.
  3. Dashboard → Customize: set some cards to Bar chart and Pie chart, Save. Hover the bars; change the period on the Sales pie.
  4. Save a customer, a part and Settings: each shows a toast with details.
  5. Commit: git add . && git commit -m "feat: CarShop.Pk branding, save options, dashboard charts, detailed toasts"

  Round 4 follow-ups:
  - More room at the top: sidebar logo area matches the top bar height (84px, borders line up); more space between logo, shop card and menu;
    page headings sit 36–40px below the top bar. Sidebar menu items and the gaps between page cards are tighter.
  - Customer and inventory pop-ups: closing with unsaved edits (Cancel, X, Escape, clicking outside) asks "Discard changes?"
    (Keep editing / Discard changes); discarding shows a "Changes discarded" toast. Closing without edits is instant.
    Browser test: 7 checks passed.

  changes.md round 5:
  - Dashboard: date range picker beside Customize (Today / This week / This month / This year / All time / Custom from-to),
    kept in the URL (?range=&from=&to=); periods removed from Customize. Cards show the range's headline figure + breakdown;
    bar charts follow the range (by day up to a month, by month up to 2 years, else by year). RPC dashboard_metrics(p_range, p_from, p_to)
    (migration 20261015140000_dashboard_date_range).
  - Count cards reordered: Customers, Products, Invoices, Quotations (Invoices above Pending invoices, etc.).
  - Toasts: fixed light theme (OS dark mode had made them black) + rich colours: success green, error red, info blue, warning amber; white text.
  - Customer profile: four all-time cards above the history (Total invoices, Pending invoices, Total due, Overdue; Overdue turns red);
    WhatsApp / other phone are tel: links, email is a mailto: link.
  - Record Payment: optionally apply a payment to invoice items: tick items (and units) to fill the amount, or type an amount and tick items
    to spread it in order; each item's share editable; the rest is a general payment. Line share = its net total's share of the invoice total
    (incl. tax and invoice discount). Table invoice_payment_items + RPC record_payment; a trigger re-links allocations when an invoice's lines
    are saved again (migration 20261015143000_payment_item_allocations). The payments list shows what each payment was for.
  - Search shortcut hint shows Ctrl K (or ⌘ K on Apple devices).
    Browser test: 31 + 1 checks passed. Known: the invoice page itself is wider than a phone screen (pre-existing).
  - Follow-up: the dashboard date dropdown became a date picker (Radix Popover, no new dependency): button shows the range name + dates;
    panel has shortcuts (Today, Yesterday, This week, Last 7 days, This month, Last 30 days, Last month, This year, All time) and a
    two-month calendar (Monday-first, future days disabled, click start then end, hover preview, Apply/Cancel); one month on phones.
    Browser test: 10 checks passed.
  - Follow-up: Settings → Timezone & week → First day of the week (Monday / Sunday / Saturday; tenants.week_start, ISO 1/7/6,
    migration 20261015160000_tenant_week_start). Drives dashboard "This week" (RPC) and the calendar's first column.
    Date picker made compact (~590×300 on a 1366×768 laptop); phones: one month, 3-column shortcuts, fits 360px. 10 checks passed.
