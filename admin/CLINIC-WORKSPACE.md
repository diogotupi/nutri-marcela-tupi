# Consultório simplificado

`/admin/` e `/secretaria/` carregam o mesmo `clinic.mjs` e o mesmo estilo. A diferença é o botão Logs, exclusivo da função `admin`. `is_admin()` continua exclusivo da Marcela; `is_clinic_staff()` autoriza a equipe habilitada e mantém a verificação de MFA. Pacientes não recebem acesso administrativo.

## Uso

- A entrada é o calendário de contatos, sem horários inventados. Semana/mês/hoje e o retorno à ficha preservam a navegação.
- O cadastro pede nome, telefone, e-mail e nascimento. O login do paciente é liberado separadamente no menu da ficha.
- Criar acompanhamento reúne prazo/modalidade, medidas e meta de água. A operação é transacional e usa um UUID para tolerar reenvio sem duplicar o acompanhamento.
- Verde: em dia/contato concluído; roxo: contato hoje ou programado naquela data; amarelo: pendente atrasado; vermelho: período vencido. A pendência atrasada também aparece no dia atual para continuar visível. A conclusão é manual após contato no WhatsApp.
- Cabeçalho e chat permanecem montados nas duas abas. Em telas estreitas, o chat abre em uma lateral sobreposta. Os relatos e o calendário atualizam a cada minuto; o chat mantém sua atualização própria.
- As listas clínicas mostram somente registros existentes. Ausência de check não é interpretada como hábito não cumprido.

## Checks de hábitos

Dieta e anamnese ficam no WebDiet. Os checks do paciente são individuais e diários (horário de São Paulo): banheiro, força, cardio e dieta valem +1 cada; álcool desconta um ponto no dia, com intensidade de 1 a 10. A equipe acompanha e corrige os registros na ficha do paciente. O Story usa os checks de movimento realmente marcados. Banheiro e álcool ficam fora da imagem pública.

## Logs

`clinic_audit` guarda autoria/nome/função, paciente, origem, ação, data/hora e valores antes/depois para alterações. Triggers registram as operações nos cadastros, acompanhamentos, contatos, registros clínicos, metas, checks, chat/leitura, equipe, tarefas e água. O login é registrado pelo servidor quando `auth.users.last_sign_in_at` muda. Abertura de ficha tem evento próprio. Redefinições de senha e criação de funcionários são registradas pela função responsável, sem senha ou token.

Não há permissão de escrita ou exclusão na tabela de logs pelo cliente, nem leitura para secretárias/pacientes. Nomes são preservados como fotografia do evento. Os logs começam com esta implantação; não reconstituem ações antigas. Mensagens usam `sender_id` e `sender_name`, embora o valor histórico `sender_role=admin` represente o lado da equipe para compatibilidade.

Exclusões exigem confirmação extra para acompanhamento ativo. O manifesto privado `client_deletion_jobs` permite retomar a remoção de arquivos e contas já autorizada. A função de exclusão retenta esses manifestos em segundo plano; isso não autoriza novas exclusões.

## Validação

- `npm test`: datas e cores do CRM, hidratação, treino, peso, pontuação e dados usados nos Stories.
- `tests/clinic-browser-qa.cjs` e `tests/patient-browser-qa.cjs`: celular e desktop com dados fictícios. Cobrem o cadastro, as permissões da equipe, os checks, a correção pelo consultório, o chat e a imagem compartilhável.
- `supabase/daily-habits-regression.sql`: verifica pontuação, idempotência, isolamento entre pacientes e bloqueio por acompanhamento em uma transação revertida.
