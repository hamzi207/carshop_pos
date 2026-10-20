-- Phase 16: ProductLogik POS rebrand.
-- 1. RF-16.1: an optional accent colour per organization, used on its own documents
--    (A4 PDF, share page, emails). Null = the ProductLogik default. Readability against white
--    paper is checked by the app; the database only checks the #rrggbb form.
alter table public.tenants
  add column accent_color text
  constraint tenants_accent_color_check check (accent_color ~ '^#[0-9a-f]{6}$');
grant update (accent_color) on public.tenants to authenticated;

-- 2. RF-16.3: the newest "What's new" entry this user has seen (id from src/lib/changelog.ts).
alter table public.profiles
  add column whats_new_seen text
  constraint profiles_whats_new_seen_check check (char_length(whats_new_seen) <= 40);
grant update (whats_new_seen) on public.profiles to authenticated;

-- 3. The impersonation header is renamed x-carshop-impersonation -> x-productlogik-impersonation.
--    Both are accepted for one release (dropped in Phase 33), so a "Login As" session started
--    before the deploy keeps working.
create or replace function private.impersonated_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_token text := coalesce(v_headers ->> 'x-productlogik-impersonation', v_headers ->> 'x-carshop-impersonation');
  v_tenant_id uuid;
begin
  if v_token is null or auth.uid() is null then
    return null;
  end if;
  select s.tenant_id into v_tenant_id
  from public.impersonation_sessions s
  join public.profiles p on p.id = s.admin_id and p.is_superadmin
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    and s.admin_id = auth.uid()
    and s.ended_at is null
    and s.expires_at > now();
  return v_tenant_id;
end;
$$;
revoke all on function private.impersonated_tenant_id() from public, anon;
grant execute on function private.impersonated_tenant_id() to authenticated, service_role;
