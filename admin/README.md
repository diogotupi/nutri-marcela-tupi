# Consultório administrativo — entrega e verificação

## Arquitetura e navegação

A interface permanece estática e compatível com GitHub Pages. `/admin/` é a central autenticada, com lateral persistente e prontuário sem recarregar a lista. A rota antiga `/admin/patient/?id=...` encaminha à ficha nova; editor de dietas, desafios e Banco de Pontos foram preservados.

Os pacientes são consultados em páginas de 50, com busca por nome. Filtros: todos, favoritos persistidos no Supabase, plano ativo, pendências e ausência de atividade observada nos últimos sete dias. Ausência de atividade não é interpretada como ausência de consumo ou exercício. Último login vem de RPC administrativa específica.

## Funcionalidades ligadas aos dados

- Resumo com cobertura, hidratação, peso, pendências, atualizações e preparação de consulta desde a última consulta marcada realizada.
- Anamnese registrada por Marcela a partir do relato do paciente, com campos condicionais para medicamentos/suplementos. Editar cria uma nova versão e arquiva a anterior; não há seleção de origem, estado ou rascunho no formulário.
- Plano alimentar com horários opcionais, substituições, duplicação como rascunho/modelo e impressão integral em PDF pelo navegador. O backend publica de forma transacional, mantendo as versões anteriores.
- Diário com calendário de registros e matriz. Relatos explícitos realizados/parciais/não realizados têm precedência sobre checks legados. Ausência é “sem registro”.
- Hidratação em barras, meta profissional vigente, comparação entre períodos com cobertura e tabela de eventos com horário de lançamento. Não se inventam horários para agregados antigos.
- Peso, IMC, medidas, energia e sono em gráficos acessíveis com tabelas. IMC usa kg/(m²) sem interpretação clínica; energia/sono exigem ao menos dois relatos para linha de evolução.
- Avaliações, check-ins, atividade física, fotos comparativas e documentos privados. Links de arquivos expiram em 120 segundos.
- Notas privadas, histórico cronológico, agenda, tarefas revisáveis/adiáveis, notificações internas, modelos de check-in configuráveis e parâmetros amigáveis das automações.
- Metas da profissional com data de vigência, redefinição administrativa segura de acesso e link para configuração de dois fatores.

## Verificações

`node --test admin/metrics.test.mjs`: quatro testes, cobrindo ausência versus zero, metas históricas, IMC e data civil de São Paulo.

`tests/admin-browser-qa.cjs` é executado pela ferramenta Playwright `browser_run_code_unsafe` com servidor local na porta 8877. Ele cria uma aba separada, intercepta módulos e bloqueia o Supabase: nenhum dado de demonstração é enviado à produção. Verifica dez abas, gráficos de peso/IMC, relato parcial, evento de água, anamnese condicional, filtro de atividade, ausência de erros e ausência de overflow a 1440 e 390 pixels. O teste utiliza eventos DOM para navegação e não substitui um teste de ponta a ponta com sessão real autorizada.

Screenshots locais de desktop/mobile foram inspecionados. Sintaxe ESM e diff whitespace foram verificados. Os testes de permissões e integridade no backend pertencem à validação integrada da migração.

## Limites e configuração externa

E-mail, WhatsApp e push são apresentados como não configurados; esta entrega não simula envio. Automações internas dependem da migração e do agendador no Supabase. A ativação de regras é uma escolha da administradora.

Registros clínicos, agenda e tarefas são consultados em lotes paginados de 500, com ordenação estável. A exportação administrativa é explicitamente dos registros consultados e do período selecionado, incluindo notas privadas. Fotos usam arquivos privados e não sofrem transformação visual. Não há cache local de prontuário.

O legado não possui vigência completa dos planos: o painel não apresenta percentuais históricos calculados sobre refeições do plano atual. Não reconstrói medições, horário de consumo, composição corporal ou tendências ausentes. A meta antiga de água em logs não é tratada como meta validada pela nutricionista.

A biblioteca de modelos usa duplicação de planos existentes; não há catálogo clínico com prescrições predefinidas. O PDF é gerado pela impressão do navegador. Os modelos de check-in aceitam até seis perguntas por formulário, com texto, número ou escala de 1 a 5.
## Acompanhamento e equipe — segunda rodada

A ficha permite definir entrada e vencimento em 90, 180 dias ou intervalo personalizado. Vencimento em até três dias aparece em vermelho. Os alertas de ausência de acesso hoje, ausência de registro de refeição há três dias e dois episódios de dificuldade na semana são independentes; nenhum deles presume o que o paciente consumiu. Observações privadas ficam separadas das instruções da secretária.

Salvar o acompanhamento gera pendências semanais de WhatsApp no backend, a partir do sétimo dia. O calendário representa trabalho manual da equipe: não envia mensagens. Tarefas automáticas removidas são canceladas para não reaparecerem no agendador. Cadastro de secretárias define capacidades separadas para visualizar/concluir tarefas, contato e agenda; a área restrita da equipe fica em `/secretaria/`.

Consultas aceitam apenas início. Registros clínicos podem ser editados ou removidos com histórico preservado; água, metas, refeições e checks possuem ações administrativas de correção. Consultas, tarefas e modelos de check-in também são editáveis/removíveis. Remover plano arquiva sua versão; refeições do editor aceitam nome personalizado e remoção, preservando versões já salvas. Não há exclusão de contas/pacientes nesta interface.

`tests/admin-care-team-qa.cjs` usa o mesmo servidor e executor Playwright do teste anterior. Com módulos interceptados e produção bloqueada, verifica consulta sem término, edição versionada de anamnese, prazo de 180 dias, quatro alertas independentes, calendário de WhatsApp, capacidades da secretária, preservação/edição/remoção de refeições personalizadas e layout móvel. Ambos os roteiros passaram sem erros de página. As operações remotas e permissões são verificadas separadamente pela integração do backend; este teste não cria contas reais.
# CRM de clientes e acompanhamento — versão atual

As regras desta seção substituem o cadastro e a recorrência descritos nas rodadas anteriores. O visual e o prontuário clínico foram preservados.

- **CRM e clientes** é a entrada administrativa padrão. **Cadastrar cliente** solicita somente nome, telefone e situação do cadastro. A mesma entidade `profiles`, com papel paciente, aceita agora `user_id` e `username` vazios. Telefone normalizado tem unicidade para evitar duplicação. Login é liberado separadamente no perfil, pela Marcela.
- **Novo acompanhamento** seleciona um cliente existente: Journey (90 dias), Legacy (180 dias) ou Consulta Avulsa (30 dias). O término é calculado e pode ser ajustado. Peso/altura iniciais são opcionais e geram avaliação no prontuário. Períodos sobrepostos são bloqueados; renovação preserva os períodos anteriores.
- **Paciente atualizado** registra data/hora, usuário e ciclo atendido. Contatos vencidos anteriores ficam como substituídos, sem fingir que foram realizados. O próximo contato permanece ancorado no início do período. A mesma ação repetida não duplica o registro.
- **Modo Babá** é manual e independente da modalidade. O padrão é 2 contatos por semana, distribuídos nos dias 3 e 7 de cada semana a partir do início; frequência de 1 a 7 é configurável. Desativar volta a um contato a cada 7 dias. Mudanças recalculam somente os ciclos pendentes a partir de hoje e preservam o histórico.
- **Roxo** indica contato vencido; **vermelho** indica data de término atingida e tem prioridade. Encerrar/tratar o período ou renovar resolve a pendência de vencimento. A aba Encerrados mantém acesso aos clientes com último período encerrado ou vencido; todos os períodos ficam no perfil.
- **Equipe administrativa** cadastra secretárias, nome e capacidades. Acesso ao CRM, cadastro de clientes, gestão de períodos, conclusão de contatos, edição de observações e consulta de telefone são controlados separadamente. Desabilitar a conta revoga as capacidades no backend. O CRM permite leitura de observações potencialmente sensíveis a quem recebeu acesso a essa área; não concede acesso ao prontuário nem a notas privadas.
- **WhatsApp** abre `wa.me` com o telefone autorizado. Não envia mensagens automaticamente. Credenciais iniciais são entregues manualmente pelo canal conhecido.

Arquivos: `admin/crm.mjs`, `admin/crm-model.mjs`, `admin/crm.css`, integração em `admin/workspace.mjs` e `secretaria/`. O agendador `crm-contact-cycles` executa no PostgreSQL a cada 15 minutos. Ciclos futuros são persistidos e o estado depende da data de São Paulo, mesmo sem navegador aberto. A interface atualiza a cada minuto/foco, preservando formulários abertos. O gerador de tarefas semanais anterior foi aposentado; tarefas manuais continuam disponíveis.

Migrações `crm_enrollments_and_contact_cycles`, `crm_team_management`, `crm_enrollment_integrity` , `crm_contact_compatibility` , `crm_clinical_alignment` e `crm_attention_qualified_columns` já foram aplicadas. Funções `create-secretary` (atualizada) e `provision-patient` estão publicadas. Tabelas `crm_enrollments`, `crm_contacts` e `crm_audit` usam RLS; RPCs verificam papel, capacidade e MFA configurado.

A limpeza pontual autorizada removeu as quatro contas de pacientes iniciais e seus registros/acessos, preservando a administradora. Essa limpeza não faz parte de migrações reproduzíveis e não será repetida em novos cadastros.

Validação: 26 testes unitários; SQL transacional do CRM, equipe, progresso e correções administrativas; Playwright do CRM, prontuário, editor de refeições e área do paciente. Fixtures SQL são revertidas e o navegador usa dados interceptados, sem cadastrar pacientes fictícios em produção. Os testes não usaram credenciais reais da Marcela ou da equipe.
