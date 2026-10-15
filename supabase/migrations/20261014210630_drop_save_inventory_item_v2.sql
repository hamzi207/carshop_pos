-- Remove the previous save_inventory_item signature (superseded by
-- p_price_includes_tax in the previous migration); two overloads with the
-- same argument names would make PostgREST RPC calls ambiguous.
drop function public.save_inventory_item(text, text, text, numeric, numeric, integer, integer, boolean, uuid, text, integer[]);
