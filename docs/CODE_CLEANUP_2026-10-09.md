# Limpeza responsável do código — 09/10/2026

## Objetivo

Reduzir resíduos de versões antigas sem interromper o CRJ Trajetórias, sem excluir dados e sem remover objetos do banco que ainda possam sustentar registros históricos ou fluxos ativos.

## Segurança aplicada

- Branch de preservação criada antes da limpeza: `backup/pre-limpeza-2026-10-09`.
- Nenhuma tabela, função, trigger, policy ou dado do Supabase foi removido nesta etapa.
- Só foram excluídos arquivos sem referência ativa ou módulos substituídos após validação do novo fluxo.
- O workflow de deploy valida sintaticamente todos os JavaScript efetivamente publicados e testa a presença dos módulos obrigatórios.
- O novo workspace técnico passou pela etapa de montagem e validação JavaScript do GitHub Actions antes da remoção da versão anterior.

## Arquivos removidos

### `src/articulation_area.js`
Módulo antigo da Articulação. Não era copiado pelo deploy e não possuía referências ativas. A área atual é atendida por `articulation_workspace.js` e módulos complementares.

### `src/document_delete.js`
Camada antiga de exclusão de documentos. Não era publicada e não havia chamadas para o arquivo no código atual.

### `src/global_month_crud.js`
Overlay antigo de CRUD mensal global. Não fazia parte do deploy e não havia referência ativa.

### `src/demand_public_enrollment.js`
Overlay antigo da inscrição pública por demanda. A página atual usa `demand_public.js` + `demand_identity_public.js`; o arquivo removido não era carregado por `demanda.html` nem publicado pelo workflow.

### `src/technical_workspace_tabs_v2.js`
Versão intermediária do workspace da Equipe Técnica. Foi substituída por `src/technical_workspace.js` somente depois que o novo módulo passou pela validação JavaScript do deploy e nenhuma referência restante apontava para o arquivo antigo.

## Deploy corrigido

O deploy publica e valida explicitamente:

- `technical-checkin.html`
- `src/technical_checkin.js`
- `src/technical_workspace.js`

Isso elimina a inconsistência em que partes do fluxo técnico existiam no repositório, mas não chegavam ao site publicado.

## Consolidação realizada na Equipe Técnica

`src/technical_workspace.js` passou a ser o workspace canônico para:

- abas Planejamento, Relatório de execução e Evidências;
- geração e consulta do link público de presença;
- elaboração e edição do relatório de execução;
- gravação pela função `save_technical_action_execution_v2`;
- pré-visualização do relatório;
- abertura da evidência oficial da lista de presença;
- PDF e impressão de planejamento e relatório;
- relação de atendimento exibida apenas com `full_name`.

A versão anterior escondia a seção antiga de presença e interceptava o `submit` do formulário legado. O novo workspace cria o próprio formulário de execução, portanto não depende mais de marcar/desmarcar checkboxes ocultos nem de capturar o envio do formulário antigo.

`technical_program_actions.js` continua responsável pelo painel e pelo planejamento PVida/PTrampo. Ele ainda contém funções antigas de execução/lista como fallback interno; enquanto `technical_workspace.js` estiver carregado, os cliques de execução e evidência são direcionados ao fluxo canônico antes dos listeners antigos. A remoção física dessas funções do arquivo grande será feita somente quando o núcleo empacotado for consolidado, para evitar uma reescrita arriscada de um arquivo monolítico em produção.

## Banco de dados

Nenhum objeto foi removido.

Após a limpeza do frontend, foi confirmado que continuam existentes:

- `open_technical_action_checkin(uuid)`;
- `technical_action_checkin_status(uuid)`;
- `save_technical_action_execution_v2(jsonb, uuid[])`;
- `developer_get_my_state()`;
- trigger `methodology_forms_technical_full_name`.

A decisão é preservar funções e estruturas antigas do banco até uma auditoria específica de dependências, histórico e chamadas por Edge Functions/RPC.

## Compatibilidades mantidas de propósito

### `bundle/`
Não é considerado lixo neste momento. O deploy ainda reconstrói a partir dele:

- `src/app.js`
- `src/api.js`
- `src/forms.js`
- `src/agenda.js`
- `assets/app.css`

A pasta só poderá ser removida quando esses arquivos passarem a existir como fontes consolidadas e o workflow deixar de concatenar os `.part`.

### Patch de versão de `permissions.js`
O `app.js` montado pelo bundle ainda contém uma referência antiga de cache. O deploy mantém temporariamente uma substituição explícita para apontar para a matriz atual. Isso é dívida técnica conhecida e não deve ser removido antes da consolidação do núcleo.

### Jhonatão
`jhonatao.js`, `jhonatao_multimodal.js` e `jhonatao_live.js` continuam ativos. Há duas gerações de voz coexistindo, mas `jhonatao_live.js` ainda depende da interface e do chat montados pelos módulos anteriores. Não remover até consolidar o recurso de voz.

## Próxima consolidação segura

1. Consolidar `app.js`, `api.js`, `forms.js` e `agenda.js` fora do `bundle/`.
2. Remover o `sed` de compatibilidade do workflow.
3. Depois disso, eliminar fisicamente do `technical_program_actions.js` as funções antigas de execução/lista que hoje permanecem apenas como fallback.
4. Consolidar a voz do Jhonatão mantendo um único controlador.
5. Só então auditar e remover objetos antigos do banco, com consulta de dependências e teste transacional.

## Regra para futuras limpezas

Um arquivo, função ou tabela só deve ser removido quando houver evidência de que:

1. não é carregado pelo HTML;
2. não é importado direta ou dinamicamente;
3. não é referenciado pelo workflow de deploy;
4. não é chamado pelo frontend ou por Edge Function;
5. não tem dependências no banco;
6. existe um substituto atual validado, quando aplicável;
7. há um ponto de restauração antes da alteração.
