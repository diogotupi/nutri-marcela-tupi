# Plataforma de acompanhamento — entrega de 29/10/2026

## Arquitetura e decisões

Mantidos HTML, CSS, JavaScript, Supabase e GitHub Pages. O vídeo fornecido orientou a composição: pacientes na lateral, prontuário central e informações organizadas por abas. A marca usa verde profundo e sálvia; paciente tem navegação mobile com quatro entradas.

Dados clínicos não são armazenados em cache offline. PWA não foi ativada, evitando cache indiscriminado de prontuários. O funcionamento requer conexão; a interface confirma salvamento somente após resposta do servidor. Não há provedor de IA nem envio externo de dados de saúde.

## Etapas implementadas

1. Diagnóstico: identificadas recriação destrutiva de refeições, atualizações concorrentes de água e notas legadas acessíveis por paciente. Os três fluxos foram corrigidos preservando registros existentes.
2. Acesso: entradas separadas, mostrar senha, recuperação por e-mail real, redefinição administrativa para contas técnicas, TOTP e exigência do segundo fator no banco quando cadastrado. Navegação administrativa persistente e lista paginada de pacientes.
3. Prontuário: resumo, preparo para consulta, planos/versionamento, diário, hidratação, avaliações, fotos, atualizações, atividade física, documentos e histórico. Gráficos e tabelas usam fontes reais; ausência não é zero.
4. Registros: anamnese por versões, rascunho no servidor, avaliações com origem, arquivos privados com URLs temporárias, check-ins configuráveis e consentimento para upload. Metas de água têm vigência e propostas do Banco de Pontos exigem validação profissional.
5. Operação: agenda, tarefas revisáveis/adiáveis, notificações internas, regras e histórico de execução. Agendador `care-automations` executa no PostgreSQL a cada 15 minutos, sem navegador. Regras começam desativadas e são ativadas pela profissional. Chaves de deduplicação e até três tentativas são controladas no servidor. Lembretes de consulta usam chave por consulta.
6. Paciente: Hoje/Meu plano/Evolução/Perfil, relato de refeição realizada/parcial/não realizada, água idempotente, rascunho de anamnese, check-in, uploads, plano e exportação. Banco de pontos, guias e desafios preservados.

## Verificação

- `npm test`: cálculos do Banco de Pontos e métricas, incluindo valores ausentes, zero informado, vigência das metas, IMC e datas de São Paulo.
- `supabase/clinical-regression.sql`: preservação de checks/versões, isolamento de pacientes/notas privadas, água idempotente, RPC administrativa e proteção de identidade.
- `supabase/clinical-extra-regression.sql`: Storage, MFA, rollback de plano inválido e automações executadas duas vezes sem duplicar resultados.
- `supabase/bank-target-regression.sql`: aprovação profissional e invalidação após mudança de propostas.
- `supabase/meal-regression.sql`: estados de refeições e checks mantidos atomicamente.
- `supabase/legacy-notes-regression.sql`: transferência segura de notas legadas e bloqueio do acesso pelo paciente.
- Testes SQL usam fixtures transacionais identificadas e ROLLBACK. Não deixam pacientes fictícios na produção.
- Navegador: testes locais com respostas interceptadas, telas mobile 390 px e desktop 1440 px, login/MFA, prontuário, gráficos e fluxos do paciente. Estes testes não equivalem a login com credenciais reais; as permissões foram verificadas separadamente no banco com papéis autenticados.

## Configuração externa e limites explícitos

- Canais externos de e-mail/WhatsApp/push para acompanhamento não estão configurados. O sistema não simula envios. Notificações internas funcionam independentemente desses canais.
- Recuperação por e-mail depende de conta com e-mail real e configuração de redirecionamentos/entrega do Supabase. Ver `login/README.md`. Contas técnicas utilizam redefinição administrativa após verificação de identidade por contato conhecido.
- Não foram alteradas senhas nem cadastrados fatores MFA em contas reais durante os testes.
- Eventos de água com horário existem somente a partir desta migração. Dados antigos não permitem reconstruir a distribuição horária.
- Metas antigas não são tratadas automaticamente como prescrições validadas. Datas reais de publicação de planos legados não foram inventadas.
- Exportações estruturadas incluem referências de anexos; os arquivos originais são baixados por acesso privado autorizado. A política de retenção/exclusão do serviço precisa ser definida pela responsável antes de implementar descarte automático.
- A biblioteca oficial TACO continua dependendo de importação de fonte verificada. Exemplos existentes estão marcados como ilustrativos.
- Resumos são descritivos e verificáveis, sem diagnóstico, prescrição ou interpretação clínica automática.
## Rodada de gestão, equipe e progresso

O administrativo agora registra anamnese como relato do paciente documentado por Marcela, sem controles de origem/rascunho. Edição cria versão e oculta a anterior da visão ativa; remoção preserva auditoria. Consultas não exigem término. Água, metas, refeições e checks possuem correção administrativa, e planos podem ser arquivados. Nomes personalizados de refeições são preservados e editáveis.

Entrada e vencimento do acompanhamento aceitam 90/180 dias ou datas personalizadas. Alertas separam vencimento em até três dias, ausência de acesso hoje, ausência de registros de refeições por três dias e dois episódios de dificuldade na semana. O “modo babá” é exclusivo do administrativo. Notas privadas e instruções da secretária são campos distintos. Tarefas de contato começam no sétimo dia e se repetem a cada sete dias até o vencimento; cancelamento mantém a chave para impedir recriação pelo agendador.

Secretárias são cadastradas pela profissional com capacidades independentes. A área `/secretaria/` mostra tarefas atribuídas ou disponíveis à equipe, instruções e ações autorizadas. O acesso não concede leitura de prontuários, anexos, notas privadas ou outras áreas administrativas. Cadastro usa `create-secretary`; listagem, conclusão e agendamento usam RPCs verificadas no servidor. Não são enviados convites ou senhas automaticamente.

O paciente ganhou registro de treino, fotos de refeições associadas ao plano, foto de perfil, episódio de dificuldade com linguagem neutra, medalhas baseadas em evidências e gráfico de água com meta vigente. A medalha “Orgulho da nutri” é concedida ou retirada pela profissional. Uploads usam o Storage privado do Supabase, sem Cloudinary. A redução local de imagens controla tamanho, mas não elimina consumo das cotas de armazenamento/tráfego; não foi integrado serviço externo de imagens.

### Validação desta rodada

- `npm test`: 21 testes passaram, incluindo cálculos do paciente e metas históricas.
- `supabase/progress-regression.sql`: idempotência, medalhas com evidências, restrições de concessão e progresso.
- `supabase/secretary-regression.sql`: isolamento, atribuição de tarefas, capacidades e ausência de acesso clínico indevido.
- `supabase/management-regression.sql`: correções administrativas, exclusão lógica, tarefas canceladas e integridade de registros.
- Os testes SQL usam fixtures transacionais e rollback, sem dados demonstrativos persistentes.
- `tests/admin-browser-qa.cjs` e `tests/admin-care-team-qa.cjs`: prontuário, consulta sem término, edição de anamnese, prazos, alertas, calendário, capacidades e refeições personalizadas; layout desktop/mobile e nenhum erro de página.
- `tests/patient-browser-qa.cjs`: fluxos do paciente, conversão real de foto no navegador, registro de dificuldade idempotente, medalhas e atualização do gráfico após água.
- Testes de navegador usam respostas locais interceptadas; não substituem ensaio com credenciais reais. Nenhuma senha real foi alterada nos testes.

O calendário WhatsApp representa pendências manuais da secretária. Não existe envio automático nem confirmação de entrega/leitura de mensagem externa. Ausência de registro nunca é tratada como ausência de alimentação. Exclusões administrativas preservam auditoria; descarte definitivo de dados e exclusão de contas continuam fora desta interface.

Fotos JPG/PNG/WebP de até 20 MB são reduzidas no navegador para WebP (acompanhamento: até 1600 px e 900 KB; avatar: até 512 px e 350 KB). PDFs não são transformados. HEIC requer exportação para JPG. O paciente consulta o histórico de anamnese; a edição fica com Marcela.

O adviser do Supabase aponta a configuração preexistente de proteção contra senhas vazadas desativada. A ativação depende da configuração/plano de autenticação: [documentação de proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). RPCs com `SECURITY DEFINER` são intencionais para operações restritas: verificam identidade e capacidade, com testes de isolamento e privilégios executados. Essa implementação não dispensa revisão periódica de permissões.
# Entrega atual: CRM de clientes e períodos

Esta versão substitui a regra anterior de Modo Babá automático e tarefas semanais de WhatsApp por um CRM com períodos e ciclos de contato persistentes. Entrada padrão: `/admin/?view=crm`. Equipe: `/admin/?view=team`; portal restrito: `/secretaria/`.

Implementado: cadastro permanente de cliente sem login obrigatório; nome/telefone; prevenção de telefone duplicado; Journey 90 dias, Legacy 180 dias e Consulta Avulsa 30 dias; datas ajustáveis; avaliação inicial opcional; observações de equipe; pesquisa e filtros; indicadores; prioridade vermelho/roxo; Modo Babá manual com frequência individual; conclusão de ciclo com autoria e histórico; encerramento e renovação; atalho WhatsApp manual. Código e dados do Banco de Pontos continuam preservados e ocultos dos pacientes.

Backend: `crm_enrollments`, `crm_contacts`, `crm_audit`; campos adicionais em `profiles` e `staff_permissions`; RPCs com autorização/MFA; seis migrações versionadas; agendador PostgreSQL de 15 minutos. Os ciclos são ancorados no início e deduplicados por período/data. Um contato atrasado conclui o ciclo pendente mais recente e identifica os anteriores como substituídos, sem inventar contatos realizados. Frequência especial usa intervalos distribuídos dentro de cada semana; desativar Modo Babá retorna à frequência semanal.

Equipe pode receber capacidades de leitura do CRM, cadastro, gestão de períodos, contatos, observações e telefone. As observações do CRM são visíveis à equipe com essa leitura autorizada; prontuários e notas privadas continuam restritos. `create-secretary` foi atualizado e `provision-patient` permite liberar login para um cliente existente sem duplicar sua ficha. Nenhuma senha administrativa foi alterada.

Validação: 26 testes unitários passaram; `crm-regression.sql`, `secretary-regression.sql`, `progress-regression.sql` e `management-regression.sql` passaram com rollback. Quatro roteiros Playwright passaram (CRM/equipe, prontuário, gestão clínica/editor e paciente), com mocks locais e layouts mobile/desktop. O novo CRM também foi testado com conta da equipe sem permissões de escrita. Não houve cadastro fictício persistente em produção.

Limpeza autorizada: quatro pacientes originais, seus registros e contas de autenticação foram removidos em uma transação restrita; administradora preservada. Verificado ao fim: zero pacientes, zero períodos/contatos e uma conta administrativa. A limpeza não está embutida nas migrações.

Para começar, a Marcela cadastra a equipe em **Equipe administrativa**, define as permissões, cadastra os clientes no CRM e adiciona os acompanhamentos. Login de paciente é opcional e liberado pelo perfil. Não há configuração de serviço externo adicional nem disparo automático de WhatsApp. Datas usam America/Sao_Paulo. Notas sobre recuperação de senha, cotas de Storage e proteção contra senhas vazadas nas seções históricas continuam aplicáveis.
# Exclusão pelo CRM

Incluída ação administrativa **Excluir cliente** com confirmação obrigatória. Acompanhamento ativo/agendado exige aviso destacado, confirmação adicional e digitação de `EXCLUIR`, conferidos novamente no servidor. Exclusão de registros é transacional; sessões são revogadas e a conta fica bloqueada antes da limpeza de arquivos/conta Auth via API. Falhas externas deixam uma pendência administrativa de limpeza com ação de repetição. Secretárias não recebem essa capacidade.

Migrações de exclusão e função `delete-client` publicadas. Teste SQL com rollback e teste de navegador do CRM passaram. Os testes usaram fixtures; nenhum cliente real foi excluído.
