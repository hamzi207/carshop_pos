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