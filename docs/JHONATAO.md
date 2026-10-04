# Jhonatão — Assistente Operacional do CRJ Trajetórias

O Jhonatão consolida agenda, oficinas, CFDH, responsáveis e pendências do colaborador autenticado.

## Recursos instalados

- visão diária, semanal e mensal;
- calendário geral e filtro "só o que ficou comigo";
- responsabilidades automáticas por função;
- detecção de jovens/participantes com cadastro inicial pendente;
- detecção de participante provisório com 3 ou mais participações sem cadastro concluído;
- alertas internos 30 minutos antes das atividades;
- notificações do navegador quando autorizadas e o sistema está aberto/em segundo plano;
- chat em tempo real com contexto operacional do usuário autenticado;
- histórico individual de conversa protegido por RLS.

## OpenAI

A integração usa a Responses API por meio da Edge Function `jhonatao-chat`.
A chave nunca deve ser colocada no GitHub Pages ou em JavaScript público.

No Supabase Dashboard, configure em **Edge Functions > Secrets**:

- `OPENAI_API_KEY` — obrigatório;
- `OPENAI_MODEL` — opcional. Se não informado, o backend usa `gpt-6-luna`.

Depois de salvar o secret, o chat passa a responder sem nova alteração no frontend.

## Segurança

- a Edge Function exige JWT válido;
- as consultas são executadas com o token do próprio usuário e respeitam RLS;
- o contexto enviado ao modelo é operacional e evita CPF, endereço, saúde e outros dados sensíveis;
- o alerta automático é gerado no banco e gravado em `staff_notifications`;
- a chave da OpenAI permanece somente no ambiente servidor.

## Regra dos 30 minutos

O job `jhonatao-alertas-30min` roda a cada minuto e cria um alerta quando uma atividade atribuída ao colaborador está a aproximadamente 30 minutos de começar. O índice de deduplicação impede que a mesma atividade gere o mesmo aviso repetidamente.
