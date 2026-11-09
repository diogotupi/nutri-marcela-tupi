import {validLabelImage} from './label.mjs';
import {DEFAULT_MODEL} from './policy.mjs';
import {runFreeformSwap} from './freeform.mjs';
import {readContext,nextContext} from './conversation.mjs';

const headers={
  'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
  'Cache-Control':'no-store','Content-Type':'application/json'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});

async function readMessage(req) {
  const reader=req.body?.getReader();
  if (!reader) return null;
  const decoder=new TextDecoder();
  let text='',size=0;
  for (;;) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.length;
    if (size>1500000) { await reader.cancel(); return null; }
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
  // This catalog contains public food composition only. Reuse it on warm workers.
  let foods=null,catalogExpires=0;
  function getCatalog(caller) {
    if (!foods||Date.now()>=catalogExpires) {
      catalogExpires=Date.now()+600000;
      foods=readFoods(caller).catch(error=>{foods=null;throw error;});
    }
    return foods;
  }
  return async req=>{
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','POST'].includes(req.method)) return json({error:'Método não permitido.'},405);
    try {
      const url=getEnv('SUPABASE_URL'), authorization=req.headers.get('Authorization');
      if (!authorization) return json({error:'Entre para conversar com o Basiquito.'},401);
      const caller=createClient(url,getEnv('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
      const post=req.method==='POST',body=post?await readMessage(req):null;
      if (post&&(body?.action!=='basiquito'||typeof body.message!=='string'||!body.message.trim()||
        body.message.length>500||(body.image!=null&&!validLabelImage(body.image)))) return json({error:'Confira a mensagem ou a foto e tente de novo.'},400);
      if (body?.conversation_id&&!Object.hasOwn(body,'context')) return json({error:'Atualize a página para conversar com a nova versão do Basiquito.'},409);
      const key=getEnv('OPENAI_API_KEY')?.trim(),model=getEnv('OPENAI_MODEL')?.trim()||DEFAULT_MODEL;
      const secret=getEnv('BASIQUITO_CONTEXT_SECRET')||getEnv('SUPABASE_SERVICE_ROLE_KEY');
      if (!key||!secret) return json({error:'O Basiquito está indisponível no momento.'},503);
      const {data:patient,error}=await caller.rpc('basiquito_access',{p_charge:post});
      if (error||!patient) {
        if (error?.code==='P0429') return json({error:error.message},429);
        if (error?.code==='42501') return json({error:'Seu acesso de paciente não está disponível.'},403);
        if (error?.code?.startsWith('PGRST30')) return json({error:'Sua sessão expirou. Entre novamente.'},401);
        return json({error:'Não consegui verificar seu acesso. Tente de novo.'},503);
      }
      if (!post) return json({history:[]});
      let turns;
      try { turns=await readContext(body.context,patient,secret); }
      catch { return json({error:'Esse papo expirou. Toque em Nova conversa para recomeçar.',context_expired:true},409); }
      const message=body.message.trim();
      const answer=await converse({message,image:body.image,history:turns.map(response=>({response})).reverse(),
        getCatalog:()=>getCatalog(caller),key,model,fetchImpl});
      const context=await nextContext(turns,patient,secret,message,answer);
      return json({intent:answer.intent,reply:answer.reply,choices:answer.choices||[],source_name:answer.source_name,
        target_name:answer.target_name,state:{awaiting:answer.state?.awaiting},context});
    } catch { return json({error:'Não consegui abrir a conversa agora. Tente novamente.'},503); }
  };
}
