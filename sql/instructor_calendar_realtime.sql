-- Invoice forecasts follow the canonical workshop calendar with existing RLS.
-- No payment records or access policies are changed.
do $$
declare relation_name text;
begin
 foreach relation_name in array array['workshop_calendar','workshops'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=relation_name) then
   execute format('alter publication supabase_realtime add table public.%I',relation_name);
  end if;
 end loop;
end $$;
