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
