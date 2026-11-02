import {DEFAULT_MODEL,instructions,outputSchema,modelInput,parseModelResponse,flattenPlan,conversationSelection,conversationHistory,sourceFoodLookup} from './policy.mjs';
const cors={'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const fallback=reply=>({mode:'guided',reply,intent:'clarify',source_item_ids:[],target_food_ids:[],target_query:''});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createHandler({createClient,getEnv,fetchImpl=fetch}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(!['GET','POST'].includes(req.method))return json({error:'Método não permitido.'},405);
  try{
   const url=getEnv('SUPABASE_URL'),anon=getEnv('SUPABASE_ANON_KEY'),service=getEnv('SUPABASE_SERVICE_ROLE_KEY');
   if(!url||!anon||!service)return json({error:'Assistente temporariamente indisponível.'},503);
   const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Autenticação necessária.'},401);
   const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:auth,error:authError}=await caller.auth.getUser();if(authError||!auth?.user)return json({error:'Sessão expirada. Entre novamente.'},401);
   const {data:profile,error:profileError}=await caller.from('profiles').select('id,role').eq('user_id',auth.user.id).single();
   if(profileError||profile?.role!=='patient')return json({error:'Acesso do paciente necessário.'},403);
   const key=getEnv('OPENAI_API_KEY')?.trim(),model=getEnv('OPENAI_MODEL')?.trim()||DEFAULT_MODEL;
   if(req.method==='GET'){
    const {data:history,error}=await caller.from('substitution_ai_turns').select('id,message,response,created_at').eq('patient_id',profile.id).eq('status','completed').order('created_at',{ascending:false}).limit(6);
    return json({configured:Boolean(key),history:error?[]:(history||[]).reverse()});
   }
   if(Number(req.headers.get('Content-Length')||0)>6000)return json({error:'Mensagem muito longa.'},413);
   const raw=await req.text();if(raw.length>6000)return json({error:'Mensagem muito longa.'},413);
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Mensagem inválida.'},400);}
   if(!uuid.test(body?.operation_id||'')||typeof body.message!=='string'||body.message.trim().length<1||body.message.length>600||(body.item_id!==null&&body.item_id!==undefined&&!uuid.test(body.item_id)))return json({error:'Escreva uma mensagem de até 600 caracteres.'},400);
   if(!key)return json({...fallback('A conversa com IA ainda está sendo conectada. Você já pode buscar alimentos e usar suas trocas salvas.'),configured:false});
   const {data:reservation,error:reserveError}=await caller.rpc('reserve_substitution_ai_turn',{p_id:body.operation_id,p_message:body.message.trim(),p_item:body.item_id||null});
   if(reserveError)return json({error:reserveError.message},reserveError.code==='42501'?403:reserveError.message?.includes('limite')?429:400);
   if(!reservation.created){
    if(reservation.response)return json(reservation.response);
    if(Date.now()-Date.parse(reservation.created_at||'')<60000)return json({pending:true},202);
    return json(fallback('Essa consulta não foi concluída. As trocas guiadas continuam disponíveis; envie uma nova mensagem para tentar de novo.'));
   }
   const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
   const finish=async(response,status='completed')=>{
    const {error}=await admin.from('substitution_ai_turns').update({status,response,finished_at:new Date().toISOString()}).eq('id',body.operation_id).eq('patient_id',profile.id);
    if(error)return json({error:'Não consegui confirmar a resposta. Tente novamente.'},503);
    return json(response);
   };
   try{
    const {data:diet,error:dietError}=await caller.from('diets').select('id').eq('patient_id',profile.id).eq('status','active').maybeSingle();if(dietError)throw dietError;
    if(!diet)return await finish(fallback('Seu plano ainda não está disponível. A Marcela poderá liberar as trocas quando cadastrar sua dieta.'));
    const {data:meals,error:mealError}=await caller.from('diet_meals').select('id,name,options,diet_items(id,food_name,option_name,taco_food_id,portion_g)').eq('diet_id',diet.id).order('sort_order');if(mealError)throw mealError;
    const plan=flattenPlan(meals||[]);
    const [{data:catalog,error:catalogError},{data:history,error:historyError}]=await Promise.all([
     caller.from('taco_foods').select('id,name,kcal_per_100g').order('id'),
     caller.from('substitution_ai_turns').select('message,response,item_id').eq('patient_id',profile.id).eq('status','completed').order('created_at',{ascending:false}).limit(6)
    ]);if(catalogError||historyError)throw catalogError||historyError;
    const selected=conversationSelection(plan,catalog||[],body.item_id,body.message);
    const direct=!selected&&sourceFoodLookup(plan,body.message);
    if(direct)return await finish(direct);
    const context=conversationHistory(history||[],selected,body.message);
    const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(22000),body:JSON.stringify({model,store:false,...(model.startsWith('gpt-6')?{reasoning:{effort:'none'}}:{}),instructions,input:modelInput(plan,selected,context,body.message.trim()),max_output_tokens:1200,text:{format:{type:'json_schema',name:'food_substitution',strict:true,schema:outputSchema}}})});
    if(!response.ok)throw Error('Provider unavailable');
    const result=parseModelResponse(await response.json(),plan,catalog||[],selected);
    return await finish(result);
   }catch{
    return await finish(fallback('Não consegui consultar a IA agora. Você pode continuar pelas opções de alimentos e trocas salvas.'),'failed');
   }
  }catch{return json({error:'Não foi possível conectar o assistente. Tente novamente.'},503);}
 };
}
