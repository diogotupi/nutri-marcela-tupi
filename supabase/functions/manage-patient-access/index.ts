import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors = {'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'Metodo nao permitido.'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL'), serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anonKey=Deno.env.get('SUPABASE_ANON_KEY');
    if(!url||!serviceKey||!anonKey) return json({error:'Configuração incompleta.'},503);
    const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Autenticação necessária.'},401);
    const caller=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:user,error:authError}=await caller.auth.getUser();if(authError||!user.user)return json({error:'Sessão inválida.'},401);
    const {data:allowed,error:roleError}=await caller.rpc('is_clinic_staff');if(roleError||allowed!==true)return json({error:'Acesso da equipe autenticada necessário. Verifique sua autenticação em dois fatores.'},403);
    const body=await req.json();const patientId=String(body.patient_id||''),password=String(body.new_password||'');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)||password.length<12||password.length>128)return json({error:'Informe um paciente válido e uma senha de 12 a 128 caracteres.'},400);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:patient,error:patientError}=await admin.from('profiles').select('user_id').eq('id',patientId).eq('role','patient').single();
    if(patientError||!patient)return json({error:'Paciente não encontrado.'},404);
    const {error:updateError}=await admin.auth.admin.updateUserById(patient.user_id,{password});
    if(updateError)return json({error:'Não foi possível redefinir a senha. Confira os requisitos de segurança.'},400);
    const {data:actor}=await admin.from('profiles').select('id,full_name,role').eq('user_id',user.user.id).single(); const {error:auditError}=await admin.from('clinic_audit').insert({actor_id:actor.id,actor_name:actor.full_name,actor_role:actor.role,patient_id:patientId,source:'access',action:'password_reset'});
    return json({success:true,warning:auditError?'Senha redefinida; falha ao registrar auditoria. Contate o suporte.':null});
  } catch {return json({error:'Não foi possível concluir a solicitação.'},500);}
});
