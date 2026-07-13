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

## 5. Deploy da Edge Function `create-patient`

A Marcela cria pacientes pelo painel. Isso exige a function com permissão de admin do Supabase.

```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy create-patient
```

A function usa automaticamente as variáveis do projeto.

## 6. Testar

| URL | Quem usa |
|-----|----------|
| `/login/` | Admin e pacientes |
| `/admin/` | Marcela |
| `/dashboard/` | Pacientes |

Fluxo:
1. Admin entra em `/admin/`
2. Cria paciente (nome, usuário, senha)
3. Abre o paciente → **Nova dieta**
4. Monta refeições → **Ativar dieta**
5. Paciente entra em `/login/` e vê a dieta em `/dashboard/`

## Estrutura das dietas (estilo WebDiet)

- Refeições padrão: café, lanches, almoço, jantar, ceia
- Tabela por refeição: alimento, quantidade, medida, observação
- Status: `rascunho`, `ativa`, `arquivada`
- Só **uma dieta ativa** por paciente

## Próximos passos (futuro)

- Banco de alimentos com busca
- Cálculo automático de macros
- PDF da dieta
- Reset de senha pelo admin
