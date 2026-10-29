# Acesso e recuperação

- Pacientes: `/login/`. Profissional: `/admin/login/`.
- Usuários antigos continuam usando o identificador técnico existente. O login também aceita e-mail real de uma conta já vinculada no Supabase Auth.
- Recuperação por e-mail utiliza Supabase Auth; nenhuma mensagem é enviada a endereços técnicos `@app.nutrimarcelatupi.com`.
- Para contas técnicas, a profissional verifica a identidade por contato já conhecido e redefine a senha no prontuário usando `manage-patient-access`. A função exige sessão válida e autorização administrativa, incluindo segundo fator quando cadastrado. Não retorna nem registra a senha em logs.
- Configurar na lista de Redirect URLs do Supabase Auth: `https://nutrimarcelatupi.com/login/?recovery=1` e `https://nutrimarcelatupi.com/admin/login/?recovery=1`. Entrega real depende do serviço de e-mail do projeto e de um endereço real vinculado. Não foi efetuado envio de e-mail de teste.
- Configuração TOTP: `/admin/login/security/`. Não ativamos fatores em contas reais. A ativação só conclui com código válido do autenticador. O banco exige `aal2` de administradores com fator verificado.

## Verificação executada

- Sintaxe dos módulos de login, segurança e autenticação validada com Node.
- Playwright em 390 x 844, adaptadores de autenticação simulados exclusivamente na aba de teste: sem overflow, mostrar senha, bloqueio de recuperação técnica, rejeição de papel incorreto e abertura de desafio MFA.
- `create-patient` e `manage-patient-access` publicados; requisições sem autenticação retornam HTTP 401.
- `supabase/clinical-extra-regression.sql` passou no banco remoto e reverteu todas as fixtures: isolamento de arquivos, bloqueio MFA no backend, publicação inválida sem persistência parcial, execução dupla de automações sem duplicidade.
- Não foram trocadas senhas, cadastrados fatores reais ou enviados e-mails reais durante a validação.
