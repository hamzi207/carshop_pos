# Regression checklist

Run this before every phase commit and every release. Each phase adds its own section at the bottom; nothing is removed. Tick each line on a phone width (≈390px) and a desktop width unless it says otherwise.

Test account: a normal shop owner, plus the superadmin for the admin section.

## Version 1 core flows

**Auth**
- [ ] Register a new organization → confirmation email arrives → confirm link signs in.
- [ ] Log out, log in, wrong password shows an error, password reset email arrives.

**Inventory**
- [ ] Add a product (category, SKU, cost, price, quantity, low-stock level); margin shows.
- [ ] Add a vehicle-specific product with Year/Make/Model fitment, and a Universal Fit one.
- [ ] Edit, delete; filters, search and pagination work; low-stock alert appears.
- [ ] CSV export, then import the file back (update + new rows); errors are reported per row.

**Customers**
- [ ] Add/edit a customer with a local phone number; the WhatsApp link opens with the right number.

**Documents**
- [ ] Create a draft with products + a labour line, discount and tax; totals are right.
- [ ] Fitment filter: choosing a vehicle hides products that don't fit; universal ones stay.
- [ ] Draft → quotation → invoice; numbers follow the Settings numbering.
- [ ] Record a partial payment, then the rest (quick cash buttons); status becomes Paid; stock goes down once.
- [ ] Leaving an unsaved document asks for confirmation.

**Output**
- [ ] A4 PDF downloads with the business profile (logo, name, address, NTN, contact; missing fields skipped).
- [ ] 80mm POS slip prints/previews correctly.
- [ ] Share link opens without login, shows the document and the QR code; the WhatsApp share text includes it.
- [ ] Document email arrives and renders.

**Dashboard, search, notifications, reports**
- [ ] Dashboard metrics and charts load; global search finds products, customers and documents.
- [ ] Notification bell shows low-stock / payment notices; reports load and filter.

**Settings and team**
- [ ] Business profile, shop settings, numbering and bank details save and appear on documents.
- [ ] Invite a staff member; they join with the right role and restrictions.

**Superadmin**
- [ ] `/admin` lists organizations and users; edit an organization; reset a password.
- [ ] Impersonate an organization, act inside it, stop impersonating.
- [ ] A suspended organization is blocked from the app.

## Phase 16: ProductLogik rebrand, accent colour, Urdu PDFs, What's new, dark mode

- [ ] No "CarShop" / "carshop" text anywhere in the UI, PDFs, slip, share page or emails (`grep -ri carshop src public` only shows the dual-read fallbacks).
- [ ] Favicon, apple-touch icon and PWA install (Android Chrome "Install app") show the ProductLogik mark.
- [ ] Login, register, sidebar, top bar and admin show the ProductLogik brand in Plus Jakarta Sans.
- [ ] Settings → accent colour: change it; the A4 PDF, share page and emails use it. The superadmin can set it for an organization.
- [ ] A product or customer name in Urdu prints correctly (joined letters, right-to-left) on the A4 PDF and the slip.
- [ ] What's new: the dot shows after a new changelog entry; opening it clears the dot and it stays cleared after a reload.
- [ ] User menu → Light / Dark / System: every app screen (dashboard, lists, document editor, settings, admin, dialogs, sheets on phone) is readable in both themes.
- [ ] Documents stay light in dark mode: A4 PDF, POS slip on screen and printed, share page, emails.
- [ ] The theme survives a reload with no flash of the wrong theme.
- [ ] `npm run check:contrast` passes (light and dark pairs, WCAG AA).
- [ ] An impersonation session started before the deploy still works after it (old header/cookie are still read).
- [ ] The old saved sidebar state and other localStorage settings carry over.
