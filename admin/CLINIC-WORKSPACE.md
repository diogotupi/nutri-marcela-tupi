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


## Dieta manual e trocas por calorias (02/11/2026)

- A importação de dietas por PDF saiu da interface. O editor mantém refeições e opções numeradas, alimentos livres e observações.
- As trocas resolvem automaticamente a referência e a porção. A equipe também pode escolher uma referência em **Buscar alimento na TACO** e informar **Peso da porção para as trocas (g)**. O peso em gramas já escrito na dieta sempre prevalece; outras medidas podem usar um peso aproximado. Editar nome/quantidade/unidade limpa a vinculação anterior para consultar novamente.
- Referência preferencial: TACO 4ª edição, NEPA/UNICAMP, a mesma publicação hospedada no CFN. `data/taco-4.json` contém 597 alimentos. `scripts/import-taco.py` confere os 591 valores numéricos de energia com o PDF oficial; as seis energias não numéricas ficam nulas. URLs e hashes estão em `data/taco-provenance.json`.
- A fórmula é `gramas originais × kcal originais por 100 g ÷ kcal do substituto por 100 g`. Não se igualam proteínas, carboidratos ou gorduras. O cálculo é feito novamente no servidor; o cliente não envia gramas calculados.
- No paciente: **Trocar um alimento** abre a busca no plano atual. Cada resultado identifica refeição, horário e opção. Alimentos ainda sem referência/peso iniciam a consulta automática ao serem selecionados.
- As trocas escolhidas são salvas para o dia em `patient_food_substitutions`, sem modificar a prescrição. Escolher/restaurar uma troca limpa a marcação de consumo daquele alimento; o paciente marca novamente quando comer.
- Cada troca também é guardada em `patient_saved_substitutions`, por paciente e par de alimentos TACO. Clicar no nome do alimento abre diretamente as trocas salvas. Elas sobrevivem à restauração do alimento original e a novas versões da dieta; o peso é recalculado para a porção vigente. O paciente pode remover uma opção da lista salva.
- `save_food_substitution` usa operação UUID, bloqueio por paciente/refeição/dia e versão esperada da troca. Repetir um envio confirmado retorna o estado atual, sem duplicar nem reverter uma troca posterior. RLS separa pacientes; apenas funções autorizadas gravam quantidades e referências.
- O histórico compartilhado fica em `clinical_records` (`meal_substitution`, replace/restore), com snapshots de alimentos, pesos, kcal e autor. A equipe vê as trocas no resumo/detalhe da refeição e pode desfazê-las. A atuação da secretária continua nos logs da Marcela.
- Testes: `npm test`, `supabase/calorie-substitutions-regression.sql` (rollback), roteiros de paciente e clínica com APIs simuladas. Nenhum paciente real é usado como fixture.

## Assistente flutuante de trocas (02/11/2026)

- O botão IA acompanha o paciente nas abas do painel. Abre uma conversa com mensagens, cartões de escolha, busca por alimento do plano e acesso às trocas salvas. Minimizar preserva conversa e rascunho; animações respeitam a preferência por movimento reduzido.
- A integração OpenAI fica na Edge Function `food-substitution-ai`. A chave do cliente deve ser cadastrada como `OPENAI_API_KEY` nos Secrets do Supabase, nunca no HTML, JavaScript público ou Git. Sem chave, a interface oferece o modo guiado pela TACO, sem chamadas pagas.
- O modelo interpreta a conversa e identifica alimentos; as quantidades finais continuam sendo calculadas e confirmadas pelo servidor a partir da energia por 100 g. A IA não altera a dieta nem confirma uma troca sem a escolha explícita do paciente.
- O servidor guarda o histórico privado por paciente e recupera as seis últimas interações concluídas. Envia à OpenAI apenas o contexto de alimentos, opção/refeição e mensagens de substituição; não envia cadastro, anamnese nem chat com a nutricionista. A requisição usa `store:false`.
- Cada envio tem UUID para evitar chamadas duplicadas em reenvios. Há limite de 12 mensagens/minuto e 80/dia por paciente. Falhas na IA mantêm disponíveis busca, cálculos e trocas salvas.
- Alimentos encontrados no plano continuam clicáveis. Ao selecionar, a consulta prefere TACO, tenta a TBCA oficial e usa estimativa de IA quando não houver referência compatível disponível. A TBCA é consultada pelo nome e preparo, com código/URL e energia por 100 g conferidos no HTML oficial; uma falha de consulta nunca é rotulada como valor da TBCA. Não se troca hidratado por seco ou proteína por farinha/óleo. O paciente vê alimentos e quantidades aproximadas; a origem fica apenas nos registros do sistema. Falhas permitem tentar novamente, escolher outro alimento ou abrir o chat da Marcela com um rascunho, sem envio automático.
- Verificação: `npm test`, `tests/substitution-chat-browser-qa.cjs` (celular/desktop, contexto, histórico, modo sem chave, reenvios, alimentos sem referência e acessibilidade), regressão completa do paciente e `supabase/substitution-ai-regression.sql` com rollback. As respostas da OpenAI são simuladas nos testes automatizados; a conexão real com a chave cadastrada foi validada separadamente com alimentos de exemplo, sem dados de paciente.

- Referências adicionais ficam no catálogo existente, com IDs próprios, origem, código/URL, modelo e indicação de estimativa. O cache de correspondências e a vinculação estreita ao alimento do paciente são gravados apenas pelo servidor. Nome e medida prescritos são preservados. O histórico de trocas guarda um snapshot da origem; as trocas salvas funcionam também com essas referências.
- Uma nova busca de origem limpa a seleção e o histórico anterior. Pedidos de substituto mantêm somente o contexto do alimento selecionado. Nomes diretos como “arroz” são encontrados no plano sem depender da memória do modelo.
