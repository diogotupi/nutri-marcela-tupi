import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors={'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try{
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key||!service)return json({error:'Configuração incompleta.'},503);
 const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Autenticação necessária.'},401);
 const caller=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await caller.auth.getUser();if(authError||!auth.user)return json({error:'Sessão inválida.'},401);
 const {data:allowed,error:roleError}=await caller.rpc('is_clinic_staff');if(roleError||allowed!==true)return json({error:'Acesso da equipe autenticada necessário. Verifique sua autenticação em dois fatores.'},403);
 const body=await req.json(),patient=String(body.patient_id||''),username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
 if(!/^[0-9a-f-]{36}$/i.test(patient)||!/^[a-z0-9._-]{3,32}$/.test(username)||password.length<12||password.length>128)return json({error:'Informe cliente, usuário válido e senha de 12 a 128 caracteres.'},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await admin.from('profiles').select('id,user_id,full_name').eq('id',patient).eq('role','patient').single();
 if(profileError||!profile)return json({error:'Cliente não encontrado.'},404);if(profile.user_id)return json({error:'Este cliente já possui login. Use a redefinição de senha.'},409);
 const {data:created,error:createError}=await admin.auth.admin.createUser({email:`${username}@app.nutrimarcelatupi.com`,password,email_confirm:true,user_metadata:{username,full_name:profile.full_name}});
 if(createError||!created.user)return json({error:'Não foi possível criar o acesso. Verifique se o usuário já existe e os requisitos da senha.'},400);
 const {error:linkError}=await caller.rpc('crm_link_login',{p_patient:patient,p_user:created.user.id,p_username:username});
 if(linkError){await admin.auth.admin.deleteUser(created.user.id);return json({error:'Não foi possível vincular o acesso. Atualize o cadastro e tente novamente.'},409);}
 return json({success:true});
 }catch{return json({error:'Não foi possível liberar o acesso.'},500);}
});
