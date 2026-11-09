import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const headers = {
  'Access-Control-Allow-Origin': 'https://nutrimarcelatupi.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers});
const denied = () => reply(401, {error: 'Usuário ou senha incorretos.'});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, {headers});
  if (request.method !== 'POST') return reply(405, {error: 'Método não permitido.'});
  try {
    const {username, password} = await request.json();
    if (typeof username !== 'string' || !/^[a-z0-9._-]{3,32}$/.test(username) ||
        typeof password !== 'string' || !password || password.length > 4096) return denied();
    const url = Deno.env.get('SUPABASE_URL')!;
    const authOptions = {auth: {persistSession: false, autoRefreshToken: false}};
    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, authOptions);
    const {data: address, error: lookupError} = await server.rpc('auth_email_for_username', {p_username: username});
    if (lookupError) return reply(503, {error: 'Não foi possível entrar agora. Tente novamente.'});
    const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, authOptions);
    const {data, error} = await auth.auth.signInWithPassword({email: address || 'no-login@account.invalid', password});
    if (error?.status === 429) return reply(429, {error: 'Muitas tentativas. Aguarde alguns minutos.'});
    if (error && error.status && error.status >= 500) return reply(503, {error: 'Login temporariamente indisponível.'});
    if (!address || error || !data.session) return denied();
    const {access_token, refresh_token} = data.session;
    return reply(200, {access_token, refresh_token});
  } catch {
    return reply(400, {error: 'Não foi possível concluir o login.'});
  }
});
