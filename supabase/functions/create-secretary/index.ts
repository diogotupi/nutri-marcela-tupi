import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors={'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 try {
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),key=Deno.env.get('SUPABASE_ANON_KEY');if(!url||!service||!key)return json({error:'Configuração incompleta.'},503);
 const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Autenticação necessária.'},401);
 const caller=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await caller.auth.getUser();if(authError||!auth.user)return json({error:'Sessão inválida.'},401);
 const {data:allowed,error:roleError}=await caller.rpc('is_admin');if(roleError||allowed!==true)return json({error:'Cadastro exclusivo da administradora autenticada.'},403);
 const body=await req.json(),username=String(body.username||'').trim().toLowerCase(),fullName=String(body.full_name||'').trim(),password=String(body.password||'');
 if(!/^[a-z0-9._-]{3,32}$/.test(username)||!fullName||fullName.length>150||password.length<12||password.length>128)return json({error:'Informe nome, usuário válido (3–32 caracteres) e senha de 12 a 128 caracteres.'},400);
 const permissionKeys=['view_tasks','complete_tasks','view_contact','schedule_appointments'];
 const supplied=body.permissions||{};if(typeof supplied!=='object'||Array.isArray(supplied)||Object.entries(supplied).some(([k,v])=>!permissionKeys.includes(k)||typeof v!=='boolean'))return json({error:'Permissões inválidas.'},400);
 const permissions=Object.fromEntries(permissionKeys.map(k=>[k,supplied[k]??(k==='view_tasks')]));
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:actor,error:actorError}=await admin.from('profiles').select('id').eq('user_id',auth.user.id).eq('role','admin').single();if(actorError||!actor)return json({error:'Administradora não encontrada.'},403);
 const {data:created,error:createError}=await admin.auth.admin.createUser({email:`${username}@app.nutrimarcelatupi.com`,password,email_confirm:true,user_metadata:{username,full_name:fullName}});
 if(createError||!created.user)return json({error:createError?.message?.toLowerCase().includes('already')?'Este usuário já existe.':'Não foi possível cadastrar. Confira os requisitos da senha e tente novamente.'},400);
 const userId=created.user.id;
 const {data:profile,error:profileError}=await admin.from('profiles').insert({user_id:userId,username,full_name:fullName,role:'secretary',created_by:actor.id}).select('id,username,full_name,role').single();
 if(profileError||!profile){await admin.auth.admin.deleteUser(userId);return json({error:'Não foi possível criar o perfil da secretária.'},500);}
 const {error:permissionError}=await admin.from('staff_permissions').insert({user_id:userId,...permissions});
 if(permissionError){await admin.from('profiles').delete().eq('id',profile.id);await admin.auth.admin.deleteUser(userId);return json({error:'Não foi possível salvar as permissões. Cadastro desfeito.'},500);}
 const {error:auditError}=await admin.from('care_audit').insert({table_name:'profiles',record_id:profile.id,actor_id:auth.user.id,action:'secretary_created'});
 return json({secretary:profile,warning:auditError?'Cadastro concluído, mas o registro de auditoria falhou. Contate o suporte.':null});
 }catch{return json({error:'Não foi possível concluir o cadastro.'},500);}
});
