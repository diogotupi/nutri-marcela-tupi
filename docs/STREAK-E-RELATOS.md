# Streak e relatos do paciente

## Refeição livre e acompanhamento

Refeição livre aparece junto aos quatro checks. Ao tocar, o paciente abre o campo “O que você comeu?”, referente ao dia selecionado. Salvar marca a caixinha; abrir novamente permite editar ou excluir. Fechar sem salvar preserva o rascunho e não registra uma refeição. Não há pontos; o resumo semanal e o aviso após três refeições continuam usando os registros existentes.

O mural da equipe e as notificações mostram o texto completo das mensagens e dos relatos, com filtros por categoria e a data original. Os links abrem a ficha no período correto ou a conversa. Edições atualizam a mesma notificação; mudanças no conteúdo reabrem a pendência. Os relatos anteriores também entram, sem duplicar o mural ou apagar estrelinhas. Notas privadas da equipe não são publicadas.

## Streak

Substitui o nome “Rotina no prato” e usa os dias realmente marcados em “Gabaritei a dieta”. Hoje fica aberto até o fim do dia em Brasília. Uma sequência que termina ontem permanece viva enquanto o paciente ainda pode registrar hoje. O recorde é calculado com todo o histórico, independentemente da sequência atual. Tempo de acompanhamento por si só não inventa dias de dieta.

Cada dez dias representa um nível, com diamantes e ornamentos. Aos cem dias a insígnia recebe uma chama animada; o movimento é desativado quando o dispositivo pede movimento reduzido. Há títulos especiais para sequências longas, inclusive um, dois, três e quatro anos. O cálculo não tem um teto de cem dias ou quatro anos.

Uma lacuna de um dia entre dois checks reais pode ser perdoada **somente pela nutri (admin)**. A equipe visualiza o histórico; o paciente pode abrir o chat com um rascunho para conversar sobre a recuperação. O envio da mensagem continua sendo feito pelo paciente.

A nutri encontra o controle no **Resumo geral → Streak**, escolhe a data elegível e registra o motivo. A recuperação une as sequências, mas não cria um check no dia faltante, não o adiciona à contagem e não altera a pontuação dos hábitos no desafio. Dois dias consecutivos sem check não podem ser ligados por essa recuperação. O registro guarda data, autoria e motivo, com auditoria e proteção contra reenvios duplicados.

O identificador interno da medalha continua `meals3`: não há remoção de conquistas anteriores nem um novo bônus a cada nível decorativo. A primeira aquisição continua exigindo três dias reais; apenas essa medalha única pode valer o bônus do desafio, respeitando seu período.

## Interface móvel

O seletor de data tem largura limitada entre as duas setas. Campos nativos de data nos formulários receberam limites equivalentes. As seis abas da área do paciente ficam na mesma linha, com o Basiquito acima da barra.

## Verificação

- `npm test`: modelos e marcos, incluindo sequências longas.
- `tests/patient-browser-qa.cjs` e `tests/clinic-browser-qa.cjs`: fluxos integrados de paciente/equipe, incluindo datas anteriores.
- `tests/streak-browser-qa.cjs`: marcos, animação, acessibilidade, recuperação, reenvio e foco no chat.
- `tests/patient-reports-feed-qa.cjs`: filtros, texto completo, escape e links.
- `tests/mobile-date-layout-qa.cjs`: sobreposições, seis abas e Basiquito em 320, 390 e 430 px (Chromium).
- `supabase/offensive-regression.sql` e `supabase/patient-reports-activity-regression.sql`: regras, isolamento, auditoria e notificações em transações revertidas.
