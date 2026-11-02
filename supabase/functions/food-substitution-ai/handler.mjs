import {DEFAULT_MODEL,modelOptions,instructions,outputSchema,modelInput,parseModelResponse,flattenPlan,conversationSelection,conversationHistory,sourceFoodLookup} from './policy.mjs';
import {resolveFoodReference} from './references.mjs';
import {runConversation} from './conversation.mjs';
const cors={'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const fallback=reply=>({mode:'guided',reply,intent:'clarify',source_item_ids:[],target_food_ids:[],target_query:''});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boundedBody(req){
 const reader=req.body?.getReader();if(!reader)return '';
 const decoder=new TextDecoder();let text='',size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1600000){await reader.cancel();throw Error('body-too-large');}text+=decoder.decode(value,{stream:true});}
 return text+decoder.decode();
}
export function validImage(image){
 if(image===undefined||image===null)return true;
 if(typeof image!=='string'||image.length>1500000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return false;
 const data=image.split(',')[1];
 try{const bytes=atob(data.slice(0,32));return image.startsWith('data:image/jpeg;')?bytes.startsWith('\xff\xd8\xff'):image.startsWith('data:image/png;')?bytes.startsWith('\x89PNG\r\n\x1a\n'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';}catch{return false;}
}
async function readCatalog(client,extraOnly=false){
 const foods=[];
 for(let offset=0;;offset+=500){
  let query=client.from('taco_foods').select('id,name,category,kcal_per_100g,reference_source,source_version').order('id');
  if(extraOnly)query=query.gt('id',597);
  const {data,error}=await query.range(offset,offset+499);if(error)return {data:null,error};
  foods.push(...data||[]);if((data||[]).length<500)return {data:foods,error:null};
 }
}

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
    const [{data:history,error},{data:extraFoods,error:foodsError}]=await Promise.all([
     caller.from('substitution_ai_turns').select('id,message,response,created_at').eq('patient_id',profile.id).eq('status','completed').is('response->kind',null).order('created_at',{ascending:false}).limit(12),
     readCatalog(caller,true)
    ]);
    return json({configured:Boolean(key),history:error?[]:(history||[]).reverse(),foods:foodsError?[]:(extraFoods||[]).map(f=>({id:f.id,name:f.name,category:f.category,kcal_per_100g:f.kcal_per_100g,priority:f.reference_source==='tbca'?1:2}))});
   }
   if(Number(req.headers.get('Content-Length')||0)>1600000)return json({error:'A foto é muito grande. Escolha outra imagem.'},413);
   let raw;try{raw=await boundedBody(req);}catch{return json({error:'A foto é muito grande. Escolha outra imagem.'},413);}
   let body;try{body=JSON.parse(raw);}catch{return json({error:'Mensagem inválida.'},400);}
   if(!uuid.test(body?.operation_id||'')||typeof body.message!=='string'||body.message.trim().length<1||body.message.length>600||(body.item_id!==null&&body.item_id!==undefined&&!uuid.test(body.item_id)))return json({error:'Escreva uma mensagem de até 600 caracteres.'},400);
   const referenceAction=['resolve_source','resolve_target'].includes(body.action);
   const conversation=body.action==='chat';
   if(body.action&&!referenceAction&&!conversation||referenceAction&&(!body.item_id||body.action==='resolve_target'&&(typeof body.query!=='string'||body.query.trim().length<1||body.query.length>100)))return json({error:'Escolha um alimento do seu plano.'},400);
   if(conversation&&(!uuid.test(body.conversation_id||'')||body.message.length>500||!validImage(body.image))||!conversation&&(raw.length>6000||body.image))return json({error:'Mensagem ou foto inválida. Envie uma imagem JPG, PNG ou WebP.'},400);
   if(!key)return json({...fallback('A conversa com IA ainda está sendo conectada. Você já pode buscar alimentos e usar suas trocas salvas.'),configured:false});
   const fingerprint=conversation?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({conversation_id:body.conversation_id,message:body.message,image:body.image||null,item_id:body.item_id||null}))))).map(b=>b.toString(16).padStart(2,'0')).join(''):'';
   const turnMessage=conversation?`[chat:${body.conversation_id}:${fingerprint}] ${body.message.trim().slice(0,450)}`:referenceAction?`[reference] ${body.action}:${body.item_id}:${body.query?.trim()||''}`:body.message.trim();
   const {data:reservation,error:reserveError}=await caller.rpc('reserve_substitution_ai_turn',{p_id:body.operation_id,p_message:turnMessage,p_item:body.item_id||null});
   if(reserveError)return json({error:reserveError.message},reserveError.code==='42501'?403:reserveError.message?.includes('limite')?429:400);
   if(!reservation.created){
    if(reservation.response)return json(reservation.response,reservation.response.error?503:200);
    if(Date.now()-Date.parse(reservation.created_at||'')<(referenceAction||conversation?180000:60000))return json({pending:true},202);
    if(conversation)return json({error:'Essa resposta não foi concluída. Envie novamente para tentar outra vez.',confirmed_failure:true},503);
    if(referenceAction)return json({kind:'reference',error:'Essa busca não foi concluída. Tente novamente.',confirmed_failure:true},503);
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
    const {data:meals,error:mealError}=await caller.from('diet_meals').select('id,name,options,diet_items(id,food_name,quantity,unit,option_name,taco_food_id,portion_g)').eq('diet_id',diet.id).order('sort_order');if(mealError)throw mealError;
    const plan=flattenPlan(meals||[]);
    const [{data:catalog,error:catalogError},{data:history,error:historyError}]=await Promise.all([
     readCatalog(caller),
     (()=>{let q=caller.from('substitution_ai_turns').select('message,response,item_id').eq('patient_id',profile.id).eq('status','completed').is('response->kind',null);if(conversation)q=q.eq('response->>conversation_id',body.conversation_id);return q.order('created_at',{ascending:false}).limit(conversation?12:6);})()
    ]);if(catalogError||historyError)throw catalogError||historyError;
    if(conversation)return await finish(await runConversation({plan,catalog:catalog||[],history:history||[],body,admin,patient:profile.id,key,model,fetchImpl}));
    if(referenceAction){
     const item=plan.find(i=>i.id===body.item_id);if(!item)throw Error('Esse alimento não está mais no plano atual.');
     const resolved=await resolveFoodReference({item,query:body.query?.trim(),source:body.action==='resolve_source',catalog:catalog||[],admin,patient:profile.id,key,model,fetchImpl});
     return await finish(resolved);
    }
    const selected=conversationSelection(plan,catalog||[],body.item_id,body.message);
    const direct=!selected&&sourceFoodLookup(plan,body.message);
    if(direct)return await finish(direct);
    const context=conversationHistory(history||[],selected,body.message);
    const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(22000),body:JSON.stringify({model,store:false,...modelOptions(model,1200),instructions,input:modelInput(plan,selected,context,body.message.trim()),text:{format:{type:'json_schema',name:'food_substitution',strict:true,schema:outputSchema}}})});
    if(!response.ok)throw Error('Provider unavailable');
    const result=parseModelResponse(await response.json(),plan,catalog||[],selected);
    return await finish(result);
   }catch(error){
    if(conversation){const result={error:'Não consegui concluir essa resposta agora. Tente novamente; sua conversa foi mantida.',confirmed_failure:true};await finish(result,'failed');return json(result,503);}
    if(referenceAction){const result={kind:'reference',error:error.message||'Não consegui calcular essa troca agora.',confirmed_failure:true};await finish(result,'failed');return json(result,503);}
    return await finish(fallback('Não consegui consultar a IA agora. Você pode continuar pelas opções de alimentos e trocas salvas.'),'failed');
   }
  }catch{return json({error:'Não foi possível conectar o assistente. Tente novamente.'},503);}
 };
}
