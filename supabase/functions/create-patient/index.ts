import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_DOMAIN = 'app.nutrimarcelatupi.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: 'Configuração do servidor incompleta.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autorizado.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return json({ error: 'Sessão inválida.' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: adminProfile, error: adminError } = await adminClient
      .from('profiles')
      .select('id, role')
      .eq('user_id', userData.user.id)
      .single()

    if (adminError || !adminProfile || adminProfile.role !== 'admin') {
      return json({ error: 'Apenas administradores podem criar pacientes.' }, 403)
    }

    const body = await req.json()
    const username = String(body.username || '').trim().toLowerCase()
    const password = String(body.password || '')
    const fullName = String(body.full_name || '').trim()
    const notes = body.notes ? String(body.notes).trim() : null

    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
      return json({
        error: 'Usuário inválido. Use 3–32 caracteres: letras, números, ponto, hífen ou underscore.',
      }, 400)
    }

    if (password.length < 6) {
      return json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400)
    }

    if (!fullName) {
      return json({ error: 'Informe o nome do paciente.' }, 400)
    }

    const email = `${username}@${EMAIL_DOMAIN}`

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName, role: 'patient' },
    })

    if (createError) {
      if (createError.message.toLowerCase().includes('already')) {
        return json({ error: 'Este nome de usuário já está em uso.' }, 409)
      }
      return json({ error: createError.message }, 400)
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .insert({
        user_id: createdUser.user.id,
        username,
        full_name: fullName,
        role: 'patient',
        notes,
        created_by: adminProfile.id,
      })
      .select('id, username, full_name, created_at')
      .single()

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id)
      return json({ error: profileError.message }, 400)
    }

    return json({ patient: profile })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
  }
})
