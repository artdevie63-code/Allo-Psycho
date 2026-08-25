-- V5.2 - vérifications production non destructives
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('premium_entitlements','premium_codes');

select policyname, tablename, cmd, roles
from pg_policies
where schemaname='public'
  and tablename in ('premium_entitlements','premium_codes');

-- Vérifier aussi Security Advisor dans le Dashboard Supabase avant lancement.
