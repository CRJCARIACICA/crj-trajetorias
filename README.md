# CRJ Trajetórias

Sistema operacional do **CRJ Cariacica** para acompanhar a trajetória individual dos jovens e transformar o trabalho cotidiano das equipes em dados auditáveis do Plano de Trabalho.

## Princípio

A equipe **não preenche a meta diretamente**.

Cada profissional registra o trabalho que executou: cadastro, atendimento, acompanhamento, oficina, aula, presença, formulário, benefício, encaminhamento, parceria ou lançamento geral.

O sistema converte esses registros em indicadores e envia snapshots consolidados ao projeto institucional **Metas e Etapas**.

## Arquitetura

### CRJ Trajetórias — operacional
- GitHub: `CRJCARIACICA/crj-trajetorias`
- Supabase: `CRJ Trajetorias`
- Project ref: `rbjanenpckkmejamwuef`
- Jovem como entidade central
- Login individual por colaborador
- RLS e permissões por função
- Trajetória individual
- 13 formulários da Metodologia
- Oficinas, inscrições, aulas e presenças
- Atendimentos e acompanhamentos
- PVida / PTrampo / Outras Demandas
- Benefícios, encaminhamentos e parcerias
- Lançamentos gerais separados de registros nominais
- Auditoria da contribuição de cada colaborador/equipe

### Metas e Etapas — institucional
- GitHub: `CRJCARIACICA/etapasemetas`
- Supabase: `SEMCIGA`
- Project ref: `yvkohaourbimctadwtpj`
- Recebe somente indicadores consolidados do sistema operacional
- Não recebe CPF, endereço ou conteúdo técnico dos acompanhamentos
- Preserva preenchimentos manuais da coordenação
- Exibe origem, valor identificado, agregado, jovens únicos e janela contratual

## Fluxo

```
Profissional registra trabalho
          ↓
Registro operacional
          ↓
Trajetória do jovem
          ↓
Evento de indicador
          ↓
Consolidação por período contratual
          ↓
Sincronização servidor-a-servidor
          ↓
Metas e Etapas
```

## Perfis

- Coordenação Geral
- Coordenação de Articulação
- Articulador(a) Local
- Educador(a) Social
- Assistente Social
- Psicólogo(a)
- Terapeuta Ocupacional
- Administrativo
- Oficineiro(a)
- Monitoramento / Gestão OSC
- Acesso pendente

O primeiro usuário confirmado no banco inicializa como Coordenação Geral. Contas seguintes entram como pendentes até receberem equipe e perfil.

## Dados identificados x agregados

O sistema separa:

- **identificado**: é possível saber qual jovem gerou o registro e reconstruir sua trajetória;
- **agregado**: existe somente um total geral, sem identificação nominal;
- **misto**: existem as duas fontes no mesmo indicador e o sistema sinaliza possível sobreposição em vez de fingir uma deduplicação.

Exemplo: dois atendimentos realizados com o mesmo jovem são registrados como **2 atendimentos / 1 jovem único**.

## Formulários metodológicos

Os 13 anexos implementados são:

1. Formulário Inicial / Acolhimento
2. Lista de Presença e Contato
3. Formulário de Acompanhamento
4. PVida
5. Outras Demandas
6. PTrampo
7. Avaliação das Atividades
8. Relatório de Mobilização
9. Empréstimo
10. Canhoto de Empréstimo
11. Planejamento CFDH
12. Avaliação CFDH pelos Jovens
13. Avaliação CFDH por Educadores/Oficineiros

## Deploy

O site é estático e o GitHub Actions remonta os arquivos-fonte a partir de blocos de texto em `bundle/`, executa `node --check` nos módulos JavaScript e somente depois publica no GitHub Pages.

Para o primeiro deploy:

1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment**, escolha **Source: GitHub Actions**.
3. Abra **Actions → Deploy CRJ Trajetórias to GitHub Pages**.
4. Execute **Run workflow** ou reexecute a última execução.

Endereço planejado:

`https://crjcariacica.github.io/crj-trajetorias/`

## Segurança

- Nenhuma service role fica no navegador.
- O frontend usa somente a publishable key do Supabase.
- Permissões sensíveis são aplicadas também no PostgreSQL via RLS.
- A ponte entre os dois bancos usa token guardado no Vault do Supabase.
- Conteúdo técnico individual não é replicado ao banco de metas.
