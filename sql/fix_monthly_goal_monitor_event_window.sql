-- Corrige o monitoramento mensal de metas quando o volume de eventos ultrapassa o limite padrão do PostgREST.
-- Problema observado em 22/10/2026: goal_indicator_actual_path possuía 2.131 linhas em outubro,
-- e a consulta do painel recebia apenas as 1.000 mais recentes (13/10 a 21/10), excluindo eventos do início do mês.

-- Preserva a visão completa para auditoria interna.
alter view public.goal_indicator_actual_path rename to goal_indicator_actual_path_all;

-- A visão consumida pelo painel mostra apenas indicadores ativos.
-- Eventos auxiliares/internos de indicadores desativados não devem ocupar o limite da API.
create view public.goal_indicator_actual_path
with (security_invoker=true)
as
select v.*
from public.goal_indicator_actual_path_all v
join public.indicator_catalog c on c.code=v.indicator_code
where c.active=true;

grant select on public.goal_indicator_actual_path to authenticated, service_role;

-- Há competências com mais de 1.000 eventos válidos. Aumenta a margem da API para que
-- a leitura mensal não seja truncada silenciosamente antes do cálculo no painel.
alter role authenticator set pgrst.db_max_rows = '10000';
notify pgrst, 'reload config';

-- A lógica da Meta 2 continua mensal:
-- M2.1 soma todos os eventos entre o primeiro dia da competência e o primeiro dia do mês seguinte.
-- M2.2 e M2.3 usam os percentuais mensais consolidados por app_private.meta2_refresh_month.
