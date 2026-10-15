-- Customer credit period: an invoice for this customer is due this many days
-- after the invoice date (0 = due on the invoice date).
alter table public.customers
  add column credit_days integer not null default 0
    constraint customers_credit_days_check check (credit_days between 0 and 365);
