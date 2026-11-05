import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const headers={
  'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store','Content-Type':'application/json',
};
const respond=(data:object,status=200)=>new Response(JSON.stringify(data),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async req=>{
  if (req.method==='OPTIONS') return new Response(null,{headers});
  if (req.method!=='POST') return respond({error:'Método não permitido.'},405);
  const authorization=req.headers.get('Authorization');
  if (!authorization) return respond({error:'Faça login para continuar.'},401);
  try {
    const body=await req.json();
    if (!uuid.test(body?.id)||!['open','remove'].includes(body?.action)) return respond({error:'Material inválido.'},400);
    const url=Deno.env.get('SUPABASE_URL')!, auth={persistSession:false,autoRefreshToken:false};
    const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth,global:{headers:{Authorization:authorization}}});
    const user=await caller.auth.getUser();
    if (user.error||!user.data.user) return respond({error:'Sua sessão expirou.'},401);
    const server=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth});
    const bucket=server.storage.from('patient-materials'), path=body.id+'.pdf';
    if (body.action==='remove') {
      const transition=(action:string)=>caller.rpc('clinic_material_transition',{p_id:body.id,p_action:action});
      const hide=await transition('remove');
      if (hide.error) return respond({error:'Acesso da equipe necessário.'},403);
      const deletion=await bucket.remove([path]);
      if (deletion.error) return respond({error:'O material está oculto. Tente concluir a remoção.'},503);
      const finish=await transition('finish_remove');
      return finish.error?respond({error:'Tente concluir a remoção.'},503):respond({removed:true});
    }
    // The caller's own RLS context checks publication, enrollment lock and staff membership.
    const material=await caller.from('clinic_materials').select('id').eq('id',body.id).eq('state','published').maybeSingle();
    if (material.error || !material.data) return respond({error:'Material indisponível para este acesso.'},403);
    const link=await bucket.createSignedUrl(path,120);
    if (link.error||!link.data?.signedUrl) return respond({error:'Não foi possível abrir o PDF. Tente novamente.'},503);
    return respond({url:link.data.signedUrl});
  } catch {return respond({error:'Não foi possível concluir a solicitação.'},400);}
});
