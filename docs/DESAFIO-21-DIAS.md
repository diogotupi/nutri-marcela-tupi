# Desafio 21 Dias — Faz o Básico Club

Período: **23/11/2026 a 13/12/2026**, inclusive, no horário de Brasília.

Todos começam com **zero pontos** às 0h de 23/11. Antes disso, o ranking não exibe pódio nem posições. Hábitos, minutos e medalhas anteriores ao período não entram no desafio. Para medalhas automáticas, vale o primeiro dia em que a sequência necessária foi concluída, mesmo que o sistema só reconheça a conquista em um acesso posterior. A data das medalhas no histórico pessoal é preservada.

## Como a equipe começa

1. Abra **Desafio · 21 dias** no painel da Marcela ou da equipe.
2. Entre em **Pontuar → Gerenciar participantes** e adicione os pacientes inscritos. A implantação não inscreve ninguém automaticamente.
3. Confira as fotos enviadas no **grupo de WhatsApp**, até 23h59 do dia da atividade.
4. Selecione a data, marque os hábitos comprovados e clique em **Salvar dia**. É possível lançar e corrigir dias anteriores; não é possível pontuar dias futuros.

Cada pessoa da equipe usa a própria conta habilitada. Pacientes não recebem permissão de lançar pontos. O histórico mostra autoria, horário e o que mudou. Se duas pessoas editarem a mesma linha, o sistema pede recarregamento em vez de sobrescrever a alteração de outra pessoa. Um reenvio idêntico não duplica pontos nem histórico.

## Pontos

| Categoria | Pontos por dia | Critério |
| --- | ---: | --- |
| Força | 10 | Pelo menos 40 minutos com carga |
| Legume | 8 | Uma porção no almoço ou jantar; batata, mandioca, inhame e milho não contam |
| Cardio | 6 | Pelo menos 30 minutos contínuos |
| Água | 5 | Atingir a meta individual |
| Demais atividades | 4 | Pelo menos 30 minutos |
| Stories | 3 | Compartilhar o resumo da plataforma |

Cada categoria pontua uma vez por dia. O total é **36 pontos por dia**, **756 em 21 dias**, mais **3 por medalha nova** conquistada no período. Medalhas anteriores não são zeradas nem concedidas novamente. Retirar e conceder a mesma medalha não cria bônus repetido.

Um treino pertence a uma única categoria. Crossfit conta como demais atividades. Atividades diferentes podem somar. Os checks comuns do painel continuam sem pontuação; o placar do desafio usa os lançamentos da equipe e os bônus de medalhas.

## Minutos e classificação

O registro de treino aceita tipo, duração e, no cardio, modalidade. Cada sessão entra uma vez. O total diário antigo de aeróbico continua funcionando quando não há sessões detalhadas de cardio naquele dia; ele nunca é somado novamente sobre as sessões. Treinos antigos sem duração não recebem minutos estimados.

Os pacientes podem corrigir os próprios registros de treino e completar dias anteriores. Para o desempate, a comprovação continua sendo a foto do tempo no aparelho enviada ao grupo, conforme as regras do desafio. A equipe consegue conferir e corrigir os registros no consultório.

O ranking ordena pelos pontos e depois pelos minutos de cardio acumulados no período. Se os dois valores forem iguais, a posição permanece empatada. As setas comparam o acumulado atual com o acumulado até o dia anterior, considerando as correções existentes; não representam uma fotografia congelada do que a equipe já havia lançado ontem.

O gráfico mostra os 21 dias, com dados somente até a data atual. A timeline usa medalhas, dias completos, mudanças de liderança e marcos de cardio válidos. Uma correção retira acontecimentos que deixaram de corresponder aos registros.

## Acesso e fotos

A home anuncia o desafio e abre as regras. A aba **Ranking** contém **Ranking** e **Regras**; a equipe tem também **Pontuar**. Os demais recursos do sistema continuam disponíveis conforme o acompanhamento de cada paciente.

Somente inscritos aparecem na classificação e consultam os dados dos demais participantes. Uma inscrição no desafio permite consultar o ranking mesmo que o acompanhamento esteja pausado; não libera os outros recursos bloqueados.

O ranking usa primeiro nome e, por padrão, uma inicial. O próprio paciente pode autorizar **Mostrar minha foto no ranking para os participantes**. Essa autorização não libera nenhum outro arquivo clínico. Ao remover um participante, ele sai da classificação e perde o acesso ao ranking; os lançamentos são preservados para a equipe.

## Exportação e verificação

Em Pontuar, a equipe pode baixar CSV de ranking, lançamentos e minutos. As observações são exclusivas da equipe. Os arquivos protegem contra fórmulas inseridas em campos de texto.

- `npm test`: regras de datas, pontuação, treino, gráfico e CSV, além das verificações existentes.
- `tests/challenge-browser-qa.cjs`: paciente, equipe, regras, celular, consentimento, pontuação, conflitos e exportação com dados fictícios.
- `tests/training-details-browser-qa.cjs`: sessões, correções, reenvio e minutos por data.
- `supabase/challenge-regression.sql`: permissões, classificação, medalhas, datas, auditoria e treino em transação revertida.
- `supabase/challenge-start-regression.sql`: início zerado e exclusão de conquistas antigas reconhecidas mais tarde, em transação revertida.

O contrato técnico está em [challenge-api.md](challenge-api.md).
