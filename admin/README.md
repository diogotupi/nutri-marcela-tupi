# Consultório administrativo — entrega e verificação

## Arquitetura e navegação

A interface permanece estática e compatível com GitHub Pages. `/admin/` é a central autenticada, com lateral persistente e prontuário sem recarregar a lista. A rota antiga `/admin/patient/?id=...` encaminha à ficha nova; editor de dietas, desafios e Banco de Pontos foram preservados.

Os pacientes são consultados em páginas de 50, com busca por nome. Filtros: todos, favoritos persistidos no Supabase, plano ativo, pendências e ausência de atividade observada nos últimos sete dias. Ausência de atividade não é interpretada como ausência de consumo ou exercício. Último login vem de RPC administrativa específica.

## Funcionalidades ligadas aos dados

- Resumo com cobertura, hidratação, peso, pendências, atualizações e preparação de consulta desde a última consulta marcada realizada.
- Anamnese versionada, origem do relato, rascunho manual e campos condicionais para medicamentos/suplementos. Cada salvamento cria uma nova versão.
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
