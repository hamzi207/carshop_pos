-- Lets the "Tenant isolation for draft delete" policy work: only drafts of
-- the caller's shop can be deleted (their lines cascade).
grant delete on public.quotes to authenticated;
