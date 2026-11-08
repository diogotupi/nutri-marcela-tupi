# Setup do sistema de pacientes (Supabase)

O site é estático no GitHub Pages. Login, admin e dietas usam **Supabase** (banco + autenticação).

> Plataforma atual: consulte `PLATFORM-DELIVERY.md` na raiz. No projeto existente, aplique somente migrations novas; não recrie tabelas nem sobrescreva contas. A pasta `migrations/` acompanha as versões aplicadas no servidor. As funções `create-patient` e `manage-patient-access` validam a sessão e o papel administrativo no backend. O agendador interno é `care-automations`, e as regras são ativadas em Configurações do admin.

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

## 6. Acompanhamento e hábitos

Aplique as migrações versionadas em `supabase/migrations/` em ordem. O esquema inicial sozinho não representa a aplicação atual. As migrações históricas de dieta são anteriores à retirada dessas funcionalidades.

- Pacientes acessam `/dashboard/` para registrar hábitos, água, treino e peso, consultar materiais e conversar com a equipe.
- Marcela e secretária usam `/admin/` e `/secretaria/`. O cadastro de acompanhamento mantém modalidade, prazo, medidas e meta de água. Dieta e anamnese são mantidas no WebDiet.
- Cada check é único por paciente, data civil de São Paulo e hábito. Confira as políticas e a verificação em `daily-habits-regression.sql`.
- Dados ativos não migram entre os serviços; a migração de retirada elimina os antigos registros de dieta e anamnese, inclusive cópias no histórico de edição. Não remova registros de autenticação, consultas, mensagens, pesos ou hidratação.
