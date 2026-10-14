-- Remove the original save_inventory_item signature (superseded by the previous
-- migration). Two overloads with the same argument names would make PostgREST
-- RPC calls ambiguous.
drop function public.save_inventory_item(uuid, text, text, text, text, numeric, numeric, integer, integer, boolean, integer[]);
