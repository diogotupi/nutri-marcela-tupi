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

A importação também reconhece o formato impresso do Webdiet: `08:00 - Café da manhã`, alimentos com marcadores, quantidades como “à vontade”/“mínimo”, alternativas com “Ou” e referências aos grupos de substituição. Percorre todos os títulos da página, agrupando opções de mesmo nome/horário mesmo com diferenças de acentuação. Listas de substituição, compras e receitas são preservadas nas orientações gerais, em uma seção recolhida na tela do paciente; cabeçalhos e rodapés de identificação não entram nos registros. O segundo exemplo de 16 páginas conserva seus 26 alimentos e agora tem quatro preparos de café marcáveis.

Opções de preparo listadas em observações (dois ou mais blocos `Opção 1`, `Opção 2` etc.) são estruturadas somente quando ainda não há alternativas estruturadas para a refeição. O nome do preparo vira um item marcável, sem inventar porções ou ingredientes. Os alimentos e quantidades comuns ficam em `shared_items` no editor e em `diet_items.option_name=null` no banco. As observações comuns, como as do almoço, permanecem intactas. O editor permite alterar esses alimentos sem duplicá-los entre as opções. A correção da dieta já publicada preservou os IDs/quantidades/checks originais e guardou a versão anterior em `clinic_audit` como `import_repair`.

As opções ficam em `diet_meals.options`; os alimentos reais conservam IDs próprios com `diet_items.option_name`. O renderer do paciente mantém sua estrutura e exibe as alternativas dentro da mesma refeição. A versão anterior permanece no histórico. O endereço antigo `/admin/diet/` encaminha para o editor integrado.

## Logs

`clinic_audit` guarda autoria/nome/função, paciente, origem, ação, data/hora e valores antes/depois para alterações. Triggers registram as operações nos cadastros, acompanhamentos, contatos, registros clínicos, metas, dietas/alimentos, chat/leitura, equipe, tarefas, água e refeições. O login é registrado pelo servidor quando `auth.users.last_sign_in_at` muda. Abertura de ficha tem evento próprio. Redefinições de senha e criação de funcionários são registradas pela função responsável, sem senha ou token.

Não há permissão de escrita ou exclusão na tabela de logs pelo cliente, nem leitura para secretárias/pacientes. Nomes são preservados como fotografia do evento. Os logs começam com esta implantação; não reconstituem ações antigas. Mensagens usam `sender_id` e `sender_name`, embora o valor histórico `sender_role=admin` represente o lado da equipe para compatibilidade.

Exclusões exigem confirmação extra para acompanhamento ativo. O manifesto privado `client_deletion_jobs` permite retomar a remoção de arquivos e contas já autorizada. A função de exclusão retenta esses manifestos em segundo plano; isso não autoriza novas exclusões.

## Validação

- `npm test`: 36 testes de modelos, incluindo cores, datas, formatos de importação, anexos, preparos marcáveis e preservação de quantidades.
- `tests/clinic-browser-qa.cjs`: calendário, ficha, chat persistente, cadastro de quatro campos, acompanhamento, opções, celular e painel da secretária, sem gravações reais.
- `tests/patient-browser-qa.cjs`: fluxos existentes do paciente, registro de preparos, anexos recolhidos e envio de foto com escolha câmera/galeria, prévia, compressão e compartilhamento privado. O “chutei o balde” registra alimentos e gatilho, sem o campo de sentimento; relatos anteriores são preservados. APIs interceptadas, sem gravações reais.
- SQL transacional com rollback: `clinic-regression.sql`, `crm-regression.sql`, `patient-chat-regression.sql`, `client-deletion-regression.sql`, `management-regression.sql`, `progress-regression.sql`. O primeiro cobre painel compartilhado, autoria, logs, login, isolamento e idempotência; substitui o antigo teste de equipe com permissões diferentes.

Limpeza solicitada: os dois pacientes anteriores foram removidos com os registros, contas e arquivos; a conta administrativa foi preservada. Nenhuma amostra de teste fica no banco.


## Opções de refeição (31/10/2026)

- Todas as alternativas aparecem como Opção 1, Opção 2… abertas para o paciente, inclusive refeições com uma única opção.
- Alimentos antigos sem `option_name` são a primeira alternativa. IDs, quantidades e checks anteriores são preservados; não são alimentos comuns às demais receitas.
- O editor e as novas importações guardam os alimentos dentro das opções numeradas. As preparações vindas das observações são alternativas após a opção de alimentos original.
- `set_meal_option_check` usa as permissões existentes do paciente e altera seus checks em uma transação. Ao entrar em outra alternativa, retorna conflito sem escrever; a confirmação explícita escolhe adicionar ou substituir. Substituir remove todos os checks das outras opções somente naquela refeição/data.
- Mais de uma alternativa marcada aparece no painel do paciente e na visão/detalhe da refeição da equipe. O histórico depende dos checks persistidos, sem criar um segundo registro duplicado de consumo.
- Verificação: `npm test`, `supabase/meal-options-regression.sql` (rollback), `tests/patient-browser-qa.cjs` e `tests/clinic-browser-qa.cjs` (APIs interceptadas, sem gravações reais).
