import {validLabelImage} from './label.mjs';
import {DEFAULT_MODEL} from './policy.mjs';
import {runFreeformSwap} from './freeform.mjs';

const headers={
  'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Cache-Control':'no-store','Content-Type':'application/json'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readMessage(req) {
  const reader=req.body?.getReader();
  if (!reader) return null;
  const decoder=new TextDecoder();
  let text='',size=0;
  for (;;) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.length;
    if (size>1410000) { await reader.cancel(); return null; }
    text+=decoder.decode(value,{stream:true});
  }
  try { return JSON.parse(text+decoder.decode()); } catch { return null; }
}

async function readFoods(client) {
  const foods=[];
  for (let offset=0;;offset+=500) {
    const {data,error}=await client.from('taco_foods')
      .select('id,name,category,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,reference_source')
      .eq('reference_source','taco').is('owner_patient_id',null).order('id').range(offset,offset+499);
    if (error) throw error;
    foods.push(...data);
    if (data.length<500) return foods;
  }
}

export function createHandler({createClient,getEnv,fetchImpl=fetch,converse=runFreeformSwap}) {
  return async req=>{
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','POST'].includes(req.method)) return json({error:'Método não permitido.'},405);
    try {
      const url=getEnv('SUPABASE_URL'), authorization=req.headers.get('Authorization');
      if (!authorization) return json({error:'Entre para conversar com o Basiquito.'},401);
      const caller=createClient(url,getEnv('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
      const {data:auth,error:authError}=await caller.auth.getUser();
      if (authError||!auth?.user) return json({error:'Sua sessão expirou. Entre novamente.'},401);
      const {data:profile}=await caller.from('profiles').select('id,role').eq('user_id',auth.user.id).single();
      if (profile?.role!=='patient') return json({error:'Acesso de paciente necessário.'},403);
      const admin=createClient(url,getEnv('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
      const access=await admin.rpc('patient_tracking_unlocked',{p_patient:profile.id});
      if (access.error||access.data!==true) return json({error:'Seu acompanhamento está bloqueado.'},403);
      const key=getEnv('OPENAI_API_KEY')?.trim(),model=getEnv('OPENAI_MODEL')?.trim()||DEFAULT_MODEL;
      if (!key) return json({error:'O Basiquito está indisponível no momento.'},503);
      const history=()=>caller.from('substitution_ai_turns').select('response,created_at')
        .eq('patient_id',profile.id).eq('status','completed').order('created_at',{ascending:false}).order('id',{ascending:false});
      if (req.method==='GET') {
        const conversation=new URL(req.url).searchParams.get('conversation');
        if (!uuid.test(conversation||'')) return json({error:'Conversa inválida.'},400);
        const {data,error}=await history().eq('response->>conversation_id',conversation).limit(30);
        if (error) throw error;
        return json({history:data.reverse().map(r=>r.response)});
      }
      const body=await readMessage(req);
      if (body?.action!=='basiquito'||!uuid.test(body.operation_id)||!uuid.test(body.conversation_id)||
        typeof body.message!=='string'||!body.message.trim()||body.message.length>500||(body.image!=null&&!validLabelImage(body.image))) return json({error:'Escreva uma mensagem de até 500 caracteres.'},400);
      const message=body.message.trim();
      const imageHash=body.image?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([body.image,message])))),b=>b.toString(16).padStart(2,'0')).join(''):'';
      const reservation=await caller.rpc('reserve_substitution_ai_turn',{
        p_id:body.operation_id,p_message:body.conversation_id+' '+(imageHash||message),p_item:null
      });
      if (reservation.error) return json({error:reservation.error.message},reservation.error.code==='42501'?403:reservation.error.message.includes('limite')?429:400);
      const turn=reservation.data;
      if (!turn.created) {
        if (turn.status==='completed') return json(turn.response);
        if (turn.status==='failed'||Date.now()-Date.parse(turn.created_at)>180000) return json({error:'Essa consulta não terminou. Tente novamente.',confirmed_failure:true},503);
        return json({pending:true},202);
      }
      const finish=(status,response)=>admin.from('substitution_ai_turns')
        .update({status,response,finished_at:new Date().toISOString()}).eq('id',body.operation_id).eq('patient_id',profile.id);
      try {
        const [catalog,previous]=await Promise.all([readFoods(caller),history().eq('response->>conversation_id',body.conversation_id).limit(16)]);
        if (previous.error) throw previous.error;
        const answer=await converse({message,image:body.image,operationId:body.operation_id,history:previous.data,catalog,key,model,fetchImpl});
        const response={...answer,mode:'conversation',conversation_id:body.conversation_id,user_message:message};
        const saved=await finish('completed',response);
        if (saved.error) throw saved.error;
        return json(response);
      } catch {
        await finish('failed',null);
        return json({error:'Não consegui terminar a consulta agora. Pode tentar de novo?',confirmed_failure:true},503);
      }
    } catch { return json({error:'Não consegui abrir a conversa agora. Tente novamente.'},503); }
  };
}
