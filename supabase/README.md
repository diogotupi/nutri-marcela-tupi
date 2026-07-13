# Setup do sistema de pacientes (Supabase)

O site é estático no GitHub Pages. Login, admin e dietas usam **Supabase** (banco + autenticação).

## 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar o site

Edite `js/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://SEU_PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_CHAVE_ANON',
};
```

> A chave `anon` pode ficar no front-end. **Nunca** coloque a `service_role` no site.

## 3. Rodar o schema SQL

No Supabase, abra **SQL Editor** e execute o arquivo:

`supabase/schema.sql`

## 4. Criar a Marcela como admin

1. Em **Authentication → Users → Add user**
   - Email: `marcela@app.nutrimarcelatupi.com`
   - Senha: (escolha uma senha forte)
   - Marque **Auto Confirm User**

2. Copie o **User UID** criado.

3. No **SQL Editor**, rode (troque o UUID):

```sql
insert into public.profiles (user_id, username, full_name, role)
values (
  'COLE_O_UUID_AQUI',
  'marcela',
  'Marcela Tupinambá',
  'admin'
);
```

Login da admin:
- Usuário: `marcela`
- Senha: a que você definiu

## 5. Publicar a função `create-patient` (obrigatório para cadastrar pacientes)

Sem este passo, ao criar paciente aparece **"Failed to fetch"**.

### Opção A — Pelo painel do Supabase (mais fácil)

1. Abra [supabase.com/dashboard](https://supabase.com/dashboard) → seu projeto
2. Menu **Edge Functions** → **Deploy a new function**
3. Nome: `create-patient`
4. Cole o código de `supabase/functions/create-patient/index.ts`
5. Clique em **Deploy**

### Opção B — Pelo terminal

```bash
npx supabase login
npx supabase link --project-ref pvkkxzatvuubkddzvbiq
npx supabase functions deploy create-patient
```

## 6. Tracking diário (checks + H2Ômetro)

Execute no **SQL Editor**:

`supabase/migration-tracking.sql`

Isso habilita:
- check de refeições e alimentos por dia
- registro de água (H2Ômetro)

## 7. Banco de pontos + desafios

Execute no **SQL Editor**:

`supabase/migration-tournaments.sql`

Isso habilita:
- rastreador BDP salvo no Supabase (conta para desafios)
- desafios criados pela Marcela em `/admin/desafios/`
- ranking por **Banco de pontos** e/ou **H2Ômetro**

### Desafios (admin)

1. Acesse `/admin/desafios/`
2. Crie o desafio (título, datas, métricas, participantes)
3. Pacientes inscritos veem o ranking na aba **Banco de pontos**
4. Ao fim, clique **Encerrar** e veja o vencedor no ranking

**Critério de ranking (v1):** mais água total no período; em empate, menos pontos no BDP.

Se o desafio não aparecer para o paciente, rode também:

`supabase/migration-desafios-fetch.sql`

(e confirme que o paciente foi marcado como participante ao criar o desafio)

## 8. Testar

| URL | Quem usa |
|-----|----------|
| `/login/` | Admin e pacientes |
| `/admin/` | Marcela — pacientes e dietas |
| `/admin/desafios/` | Marcela — desafios |
| `/dashboard/` | Pacientes |

Fluxo:
1. Admin entra em `/admin/`
2. Cria paciente (nome, usuário, senha)
3. Abre o paciente → **Nova dieta**
4. Monta refeições → **Ativar dieta**
5. Paciente entra em `/login/` e vê a dieta em `/dashboard/`
6. Paciente usa **Banco de pontos** (com H2Ômetro espelhado) e participa de desafios

## Estrutura das dietas (estilo WebDiet)

- Refeições padrão: café, lanches, almoço, jantar, ceia
- Tabela por refeição: alimento, quantidade, medida, observação
- Status: `rascunho`, `ativa`, `arquivada`
- Só **uma dieta ativa** por paciente

## Próximos passos (futuro)

- Salvar rastreador de pontos no Supabase (sync entre dispositivos)
- Admin ajustar tabela de alimentos e cotas por paciente
- Banco de alimentos com busca
- Cálculo automático de macros
- PDF da dieta
- Reset de senha pelo admin
