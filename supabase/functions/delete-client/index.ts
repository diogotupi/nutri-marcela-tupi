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
 const {data:allowed,error:roleError}=await caller.rpc('is_admin');if(roleError||allowed!==true)return json({error:'Exclusão exclusiva da administradora.'},403);
 const body=await req.json();let jobId=body.job_id;
 if(!jobId){const {data,error}=await caller.rpc('crm_delete_client',{p_patient:body.patient_id,p_name:body.name,p_confirmed:body.confirmed===true,p_active_ack:body.active_ack===true,p_confirmation:String(body.confirmation||'')});if(error)return json({error:error.message},400);jobId=data;}
 if(typeof jobId!=='string'||!/^[0-9a-f-]{36}$/i.test(jobId))return json({error:'Exclusão inválida.'},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:job,error:jobError}=await admin.from('client_deletion_jobs').select('id,user_id,files,status').eq('id',jobId).single();if(jobError||!job)return json({error:'Registro de exclusão não encontrado.'},404);
 if(job.status==='completed')return json({deleted:true,cleanup_pending:false});
 try{
 const buckets=new Map<string,string[]>();for(const f of job.files||[]){if(!buckets.has(f.bucket))buckets.set(f.bucket,[]);buckets.get(f.bucket)!.push(f.path);}
 for(const [bucket,paths]of buckets){for(let i=0;i<paths.length;i+=100){const {error}=await admin.storage.from(bucket).remove(paths.slice(i,i+100));if(error)throw error;}}
 if(job.user_id){const {error}=await admin.auth.admin.deleteUser(job.user_id);if(error&&error.status!==404)throw error;}
 const {error}=await admin.from('client_deletion_jobs').update({status:'completed',completed_at:new Date().toISOString(),user_id:null,files:[]}).eq('id',job.id);if(error)throw error;
 return json({deleted:true,cleanup_pending:false});
 }catch{return json({deleted:true,cleanup_pending:true,job_id:job.id},202);}
 }catch{return json({error:'Não foi possível excluir o cliente. Nenhuma exclusão deve ser presumida sem a confirmação da tela.'},500);}
});
