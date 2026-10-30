# Consultório simplificado

`/admin/` e `/secretaria/` carregam o mesmo `clinic.mjs` e o mesmo estilo. A diferença é o botão Logs, exclusivo da função `admin`. `is_admin()` continua exclusivo da Marcela; `is_clinic_staff()` autoriza a equipe habilitada e mantém a verificação de MFA. Pacientes não recebem acesso administrativo.

## Uso

- A entrada é o calendário de contatos, sem horários inventados. Semana/mês/hoje e o retorno à ficha preservam a navegação.
- O cadastro pede nome, telefone, e-mail e nascimento. O login do paciente é liberado separadamente no menu da ficha.
- Criar acompanhamento reúne prazo/modalidade, medidas, água, anamnese e dieta. A operação é transacional e usa um UUID para tolerar reenvio sem duplicar o acompanhamento.
- Verde: em dia/contato concluído; roxo: contato hoje ou programado naquela data; amarelo: pendente atrasado; vermelho: período vencido. A pendência atrasada também aparece no dia atual para continuar visível. A conclusão é manual após contato no WhatsApp.
- Cabeçalho e chat permanecem montados nas três abas. Em telas estreitas, o chat abre em uma lateral sobreposta. Os relatos e o calendário atualizam a cada minuto; o chat mantém sua atualização própria.
- As listas clínicas mostram somente registros existentes. Ausência de check não é interpretada como refeição omitida ou treino não realizado.

## Dietas / PDF

PDF.js 6.4.299 fica em `vendor/pdfjs/`, com licença. O arquivo é processado no navegador, sem serviço externo de conversão. O PDF precisa ter texto selecionável; PDFs digitalizados não têm OCR nesta versão. A prévia é editável e só é publicada após salvar.

O exemplo real de 12 páginas foi conferido: 7 refeições por nome/horário, 4 opções de lanche, 26 alimentos, 15 substituições e continuação de observações. O arquivo clínico original não foi incluído no repositório.

As opções ficam em `diet_meals.options`; os alimentos reais conservam IDs próprios com `diet_items.option_name`. O renderer do paciente mantém sua estrutura e exibe as alternativas dentro da mesma refeição. A versão anterior permanece no histórico. O endereço antigo `/admin/diet/` encaminha para o editor integrado.

## Logs

`clinic_audit` guarda autoria/nome/função, paciente, origem, ação, data/hora e valores antes/depois para alterações. Triggers registram as operações nos cadastros, acompanhamentos, contatos, registros clínicos, metas, dietas/alimentos, chat/leitura, equipe, tarefas, água e refeições. O login é registrado pelo servidor quando `auth.users.last_sign_in_at` muda. Abertura de ficha tem evento próprio. Redefinições de senha e criação de funcionários são registradas pela função responsável, sem senha ou token.

Não há permissão de escrita ou exclusão na tabela de logs pelo cliente, nem leitura para secretárias/pacientes. Nomes são preservados como fotografia do evento. Os logs começam com esta implantação; não reconstituem ações antigas. Mensagens usam `sender_id` e `sender_name`, embora o valor histórico `sender_role=admin` represente o lado da equipe para compatibilidade.

Exclusões exigem confirmação extra para acompanhamento ativo. O manifesto privado `client_deletion_jobs` permite retomar a remoção de arquivos e contas já autorizada. A função de exclusão retenta esses manifestos em segundo plano; isso não autoriza novas exclusões.

## Validação

- `npm test`: 30 testes de modelos, incluindo cores, datas, importação e agrupamento dos relatos.
- `tests/clinic-browser-qa.cjs`: calendário, ficha, chat persistente, cadastro de quatro campos, acompanhamento, opções, celular e painel da secretária, sem gravações reais.
- `tests/patient-browser-qa.cjs`: fluxos existentes do paciente, com APIs interceptadas.
- SQL transacional com rollback: `clinic-regression.sql`, `crm-regression.sql`, `patient-chat-regression.sql`, `client-deletion-regression.sql`, `management-regression.sql`, `progress-regression.sql`. O primeiro cobre painel compartilhado, autoria, logs, login, isolamento e idempotência; substitui o antigo teste de equipe com permissões diferentes.

Limpeza solicitada: os dois pacientes anteriores foram removidos com os registros, contas e arquivos; a conta administrativa foi preservada. Nenhuma amostra de teste fica no banco.
