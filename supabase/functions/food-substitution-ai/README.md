# Assistente de substituições

## Ativar a OpenAI

No projeto Supabase `pvkkxzatvuubkddzvbiq`, abra **Edge Functions → Secrets** e cadastre a chave da conta do cliente em `OPENAI_API_KEY`. A cobrança das chamadas ocorre nessa conta OpenAI. Não coloque a chave no repositório, no navegador ou em `js/config.js`.

`OPENAI_MODEL` é opcional; o padrão é `gpt-6-luna`. O projeto OpenAI da chave precisa ter acesso ao modelo e saldo disponível. Sem chave, o endpoint informa `configured:false` e o paciente continua usando as trocas guiadas, sem consumir créditos.

## Contrato e limites

- JWT válido e perfil de paciente são obrigatórios. `GET` retorna disponibilidade e as seis últimas interações próprias; `POST` recebe `operation_id`, `message` (até 600 caracteres) e `item_id` opcional do plano vigente.
- A reserva SQL valida propriedade, limita 12 novas mensagens/minuto e 80/dia por paciente e garante que um UUID não chame o provedor duas vezes. Respostas pendentes podem ser retomadas pelo mesmo UUID.
- Responses API com saída estruturada e `store:false`. O modelo recebe nomes de alimentos/refeições/opções e mensagens deste assistente. Cadastro, anamnese e chat da nutri não compõem o contexto.
- O modelo identifica intenções; IDs são validados contra o plano autorizado e os substitutos são procurados na TACO. Texto numérico do modelo não é utilizado para porções. A fórmula TACO e a gravação permanecem nas funções existentes, após confirmação do paciente.
- Tempo limite de 22 segundos no provedor. Erros retornam modo guiado, sem expor detalhes da chave ou resposta interna do provedor. Uma operação falha não dispara nova chamada ao repetir o mesmo UUID; uma nova mensagem pode tentar novamente.

## Validar e publicar

`npm test` inclui `tests/food-ai-backend.test.mjs`, com provedor simulado. `supabase/substitution-ai-regression.sql` valida permissões, isolamento, limites e idempotência numa transação com rollback. `tests/substitution-chat-browser-qa.cjs` usa APIs interceptadas no Playwright e não grava dados reais.

Publicar os três arquivos de runtime (`index.ts`, `handler.mjs`, `policy.mjs`) como `food-substitution-ai`, mantendo `verify_jwt=true`. Depois de cadastrar a chave, conferir uma conversa autenticada com o cliente para validar acesso ao modelo e a resposta real. Nenhuma chamada paga foi feita durante a implementação sem essa chave.
