# Limpeza responsável do código — 09/10/2026

## Objetivo

Reduzir resíduos de versões antigas sem interromper o CRJ Trajetórias, sem excluir dados e sem remover objetos do banco que ainda possam sustentar registros históricos ou fluxos ativos.

## Segurança aplicada

- Branch de preservação criada antes da limpeza: `backup/pre-limpeza-2026-10-09`.
- Nenhuma tabela, função, trigger, policy ou dado do Supabase foi removido nesta etapa.
- Só foram excluídos arquivos que estavam simultaneamente fora do deploy atual e sem referências encontradas no repositório.
- O workflow de deploy foi atualizado para validar todos os JavaScript efetivamente publicados.

## Arquivos removidos

### `src/articulation_area.js`
Módulo antigo da Articulação. Não era copiado pelo deploy e não possuía referências ativas. A área atual é atendida por `articulation_workspace.js` e módulos complementares.

### `src/document_delete.js`
Camada antiga de exclusão de documentos. Não era publicada e não havia chamadas para o arquivo no código atual.

### `src/global_month_crud.js`
Overlay antigo de CRUD mensal global. Não fazia parte do deploy e não havia referência ativa.

### `src/demand_public_enrollment.js`
Overlay antigo da inscrição pública por demanda. A página atual usa `demand_public.js` + `demand_identity_public.js`; o arquivo removido não era carregado por `demanda.html` nem publicado pelo workflow.

## Deploy corrigido

O deploy agora publica e valida explicitamente:

- `technical-checkin.html`
- `src/technical_checkin.js`
- `src/technical_workspace_tabs_v2.js`

Isso elimina a inconsistência em que o código existia no repositório, mas não chegava ao site publicado.

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
O `app.js` montado pelo bundle ainda contém uma referência antiga de cache. O deploy mantém temporariamente uma substituição explícita para apontar para a matriz atual. Isso é dívida técnica conhecida, não deve ser removido antes da consolidação do núcleo.

### Equipe Técnica
`technical_program_actions.js` ainda possui partes do fluxo anterior de execução/lista de presença, enquanto `technical_workspace_tabs_v2.js` aplica o fluxo atual por link e usa `save_technical_action_execution_v2`.

Essa duplicação foi identificada, porém não foi removida de forma agressiva nesta etapa porque o workspace atual ainda reutiliza o formulário de execução criado pelo módulo anterior. A remoção exige primeiro transferir integralmente a criação do formulário, metodologia, relatório e carregamento dos dados para um único módulo e validar o fluxo completo.

### Jhonatão
`jhonatao.js`, `jhonatao_multimodal.js` e `jhonatao_live.js` continuam ativos. Há duas gerações de voz coexistindo, mas `jhonatao_live.js` ainda depende da interface e do chat montados pelos módulos anteriores. Não remover até consolidar o recurso de voz.

## Próxima consolidação segura

1. Transformar o fluxo de execução da Equipe Técnica em uma única implementação.
2. Eliminar a seleção manual antiga de presença depois que a geração de link estiver nativa no módulo principal.
3. Retirar interceptadores que existam apenas para corrigir o fluxo antigo.
4. Consolidar `app.js`, `api.js`, `forms.js` e `agenda.js` fora do `bundle/`.
5. Remover o `sed` de compatibilidade do workflow.
6. Consolidar a voz do Jhonatão mantendo um único controlador.
7. Só depois auditar e remover objetos antigos do banco, com consulta de dependências e teste transacional.

## Regra para futuras limpezas

Um arquivo, função ou tabela só deve ser removido quando houver evidência de que:

1. não é carregado pelo HTML;
2. não é importado direta ou dinamicamente;
3. não é referenciado pelo workflow de deploy;
4. não é chamado pelo frontend ou por Edge Function;
5. não tem dependências no banco;
6. existe um substituto atual validado, quando aplicável;
7. há um ponto de restauração antes da alteração.
