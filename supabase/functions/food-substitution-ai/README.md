# SUB — conversa de substituições

A interface mantém uma conversa natural: alimento do plano → alimento desejado → preparo, quando necessário → porção calculada. O modelo recebe as últimas 12 interações da mesma `conversation_id` e o plano autorizado. Uma nova troca inicia outra conversa; respostas como “frita” completam a pergunta anterior. Somente ocorrências ambíguas do plano exigem escolher a refeição.

O paciente escolhe o destino. O modelo avalia a plausibilidade da troca na refeição e encaminha pedidos muito discrepantes para o chat da Marcela, com um rascunho que o paciente precisa enviar. Nenhuma mensagem à nutri ou marcação de consumo é automática.

## Credenciais e contexto

`OPENAI_API_KEY` fica exclusivamente nos Secrets do projeto Supabase `pvkkxzatvuubkddzvbiq`. `OPENAI_MODEL` é opcional; o padrão é `gpt-6.1-sol`, com raciocínio `low` (o Sol 6.1 não aceita `none`). A cobrança pertence à conta da chave. Nunca colocar credenciais no frontend ou Git.

Responses API, saída estruturada, `store:false`. Enviam-se nomes/medidas do plano e a conversa SUB; cadastro, anamnese e chat da nutri ficam fora do contexto. As respostas ao paciente não citam tabelas, fontes ou provedor.

## Contrato

- `GET`: disponibilidade, últimas 12 interações próprias e referências adicionais autorizadas.
- `POST action:chat`: `operation_id`, `conversation_id`, `message` (até 500 caracteres), `item_id` opcional explicitamente selecionado, `saved_target_id` opcional para reavaliar uma troca salva e `image` opcional como data URL JPG/PNG/WebP.
- JWT e perfil de paciente são obrigatórios. A reserva SQL verifica o item no plano ativo, limita 12 mensagens/minuto e 80/dia e garante repetição idempotente. A identidade da operação inclui digest da imagem e conversa, sem armazenar a imagem.
- O browser comprime fotos em JPEG; o endpoint limita o corpo em streaming e aceita apenas imagens inline com assinatura compatível. Imagens não são armazenadas na tabela de conversa nem em buckets; somente os valores extraídos e o registro de que houve foto.
- Respostas perdidas reutilizam o UUID. Falhas confirmadas permitem nova operação. Erros não expõem chave nem detalhes internos do provedor.
- As ações antigas `resolve_source` e `resolve_target` permanecem compatíveis durante a atualização de abas antigas.

## Cálculo e rótulos

A consulta em segundo plano segue TACO → TBCA → estimativa de IA para alimentos comuns. `references.mjs` preserva peso e preparo; `tbca.mjs` lê a referência pública oficial. A fonte e a data ficam registradas internamente. Os 597 IDs TACO originais são preservados. Exemplo de referência TBCA: https://tbca.net.br/base-dados-en/int_statistical_composition.php?cod_produto=BRC0170T .

Para produtos embalados específicos, a conversa pede foto da tabela ou calorias, proteínas, carboidratos, gorduras totais e peso da mesma porção. A leitura é mostrada para confirmação; o servidor verifica se os valores confirmados pertencem ao mesmo alimento e à mesma leitura. Não se confunde kcal/kJ, g/ml, porção/100 g ou %VD. Foto ilegível volta a pedir esclarecimento. A confirmação já avança para a conta, mesmo que o modelo apenas agradeça a confirmação.

O modelo avalia a função do alimento e o preparo. `nutrition.mjs` procura a porção mais próxima em calorias e macros, limitada também pelo tamanho da porção. Dados incompletos, macros incompatíveis ou porções muito pequenas encaminham ao suporte da nutri. A resposta explica a diferença sem julgamentos. Os limites e suas limitações estão em [substitution-compatibility.md](../../../docs/substitution-compatibility.md).

O paciente só confirma uma proposta revisada. `save_reviewed_substitution` valida a análise armazenada no servidor, a propriedade, a validade, os dados atuais e as tolerâncias novamente. O RPC antigo de calorias não é acessível a pacientes. Trocas salvas são reavaliadas antes do uso; rótulos completos podem ser reutilizados sem nova foto.

Referências de rótulos têm `reference_source=label` e proprietário. RLS permite acesso somente ao paciente e à equipe; triggers protegem também os RPCs de gravação. A gravação do rótulo é exclusiva de `service_role` e idempotente. As tabelas públicas não expõem esses registros a outros pacientes ou anônimos.

## Validação e deploy

`npm test` inclui os testes de backend, referências e conversa. Os scripts `supabase/*-regression.sql` correspondentes verificam permissões e contas com dados sintéticos e rollback. `tests/substitution-chat-browser-qa.cjs` cobre conversa, foto, confirmação, retomada, trocas salvas e encaminhamento com APIs interceptadas.

Publicar os sete arquivos `index.ts`, `handler.mjs`, `policy.mjs`, `references.mjs`, `tbca.mjs`, `conversation.mjs` e `nutrition.mjs` como `food-substitution-ai`, com `verify_jwt=true`. Aplicar as migrações de nutrientes/revisões antes do backend e frontend. O site está no GitHub Pages; as URLs dos módulos usam versão para invalidar cache.

Verificação real em 02/11/2026 com GPT-6.1 Sol: arroz → batata → cozida produz porção revisada; arroz → batata frita encaminha ao suporte; banana → barrinha → rótulo com macros confirmado bloqueia a troca e explica a redução de porção; mudar para arroz abandona o contexto anterior; foto sintética completa → confirmação de todos os macros → proposta revisada. Sem escrita em pacientes reais. O runtime temporário de diagnóstico foi removido após os testes.
