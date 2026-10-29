# Plataforma clínica — contrato e validação

Mantém HTML/CSS/JavaScript, Supabase e GitHub Pages. Funcionalidades privilegiadas permanecem no banco e em Edge Functions. Nenhum prontuário será colocado em cache offline.

Registros clínicos são separados por paciente, origem/autoria, data observada e data de lançamento. Versões de anamnese são novos registros ligados à versão anterior. Notas privadas não são acessíveis ao paciente. Arquivos usam bucket privado e URLs temporárias.

Planos serão salvos por uma transação RPC que cria uma nova versão preservando IDs das refeições e checks anteriores. Água será registrada em eventos idempotentes e atualização atômica do total. Dados anteriores serão mantidos, sem inventar horários.

Automações internas serão processadas no banco com chave única por destinatário/período e histórico de tentativas. Canais externos permanecem indisponíveis até configuração real. MFA exige nível AAL2 para administradores com fator verificado.

Validação necessária antes da publicação: isolamento de pacientes, notas privadas, storage, concorrência de água, preservação de checks, rollback de plano inválido, execução repetida de automações, layout mobile/desktop e fluxos autenticados de teste.
