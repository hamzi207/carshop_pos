-- Old signatures, replaced by the versions with discount/walk-in and vendor arguments.
drop function public.save_quote(uuid, jsonb, uuid, text, integer, text, text, numeric, text);
drop function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[], boolean);
