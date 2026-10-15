-- quote_number becomes a generated column (next migration). The table is empty.
alter table public.quotes drop column quote_number;
