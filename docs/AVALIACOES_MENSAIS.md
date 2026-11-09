# Avaliações mensais

O menu Avaliações é destinado a educadores, equipe técnica e Coordenação Geral. O mês selecionado define o recorte de cada anexo.

- Anexo 7: um formulário por oficina e mês, com link para os jovens.
- Anexo 12: um formulário por mês do Circuito Formativo, com link para os jovens.
- Anexo 13: um formulário por mês do Circuito Formativo, respondido e atualizado individualmente pela equipe autenticada.

A equipe inicia a avaliação quando precisa do link e pode encerrá-la e reabri-la. O endereço público contém um token aleatório e não requer cadastro. A página não pede o nome do jovem. Links encerrados não recebem respostas. A análise de cada anexo considera somente as respostas daquele formulário e mês; o percentual de cada pergunta usa apenas as respostas válidas dessa pergunta. Os totais contam respostas, não pessoas únicas, pois mais de uma pessoa pode usar o mesmo dispositivo e o link é compartilhável.

O esquema está em `sql/evaluations_monthly.sql`. As tabelas usam RLS para a equipe autorizada. O formulário público acessa somente os dois RPCs específicos que validam o token, o tipo do anexo e os campos; não tem acesso direto às tabelas de respostas. A chave temporária por envio evita que uma tentativa de rede repetida conte duas vezes, sem impedir que outra pessoa responda no mesmo aparelho.
