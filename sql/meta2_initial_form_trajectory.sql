-- Meta 2 — regra consolidada da trajetória do jovem
-- Aplicada em produção em 22/10/2026.
--
-- 2.1 Número de atendimentos: cada ação efetiva vinculada ao jovem conta atendimento;
--     a criação do Formulário Inicial é o primeiro atendimento.
-- 2.2 Percentual de acolhimento: o Formulário Inicial comprova procura e realização.
-- 2.3 Percentual do acesso dos jovens: o Formulário Inicial comprova procura e efetivação.
-- Os percentuais usam jovens únicos por competência mensal.
-- Subindicadores A/B/C permanecem somente como eventos internos de cálculo/auditoria
-- e ficam inativos no catálogo/painel.

update public.indicator_catalog set active=false
where code in (
 'M2.1B_DEMANDAS','M2.1B_ATENDIDAS','M2.1B_COBERTURA_PERCENTUAL',
 'M2.2_A_DEMANDAS_ACOLHIMENTO','M2.2_B_ACOLHIMENTOS_REALIZADOS',
 'M2.3_A_TENTATIVAS_ACESSO','M2.3_B_ACESSOS_EFETIVADOS'
);

update public.indicator_catalog set label='Número de atendimentos',goal_stage='2.1',periodicity='mensal',active=true where code='M2.1_ATENDIMENTOS';
update public.indicator_catalog set label='Percentual de acolhimento',goal_stage='2.2',target=100,unit='%',target_mode='minimum',periodicity='mensal',active=true where code='M2.2_ACOLHIMENTOS_PERCENTUAL';
update public.indicator_catalog set label='Percentual do acesso dos jovens',goal_stage='2.3',target=100,unit='%',target_mode='minimum',periodicity='mensal',active=true where code='M2.3_ACESSO_PERCENTUAL';

-- A implementação de produção usa app_private.meta2_initial_form_root(),
-- app_private.sync_meta2_action_indicators() e app_private.meta2_refresh_month().
-- O trigger meta2_initial_form_root é AFTER INSERT em public.young_people.
-- source_type='initial_form', source_id=young_people.id mantém a evidência rastreável.
-- Backfill: todos os jovens não excluídos recebem os eventos do Formulário Inicial
-- na data original de criação, sem duplicar por causa da chave única dos eventos.
