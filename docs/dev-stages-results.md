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
