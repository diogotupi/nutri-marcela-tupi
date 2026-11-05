import {estimateFreeMeal,interpretEstimate} from './assessment.mjs';

const headers={
  'Access-Control-Allow-Origin':'https://nutrimarcelatupi.com',
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store',
};
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...headers,'Content-Type':'application/json'}});
const failure={kind:'unavailable',error:'Não consegui concluir a análise agora. Seu relato continua aqui para você tentar novamente.'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readBoundedJson(req) {
  const reader=req.body?.getReader();
  if (!reader) throw Error();
  const bytes=new Uint8Array(16384);
  let position=0;
  while (true) {
    const {done,value}=await reader.read();
    if (done) break;
    if (position+value.length>bytes.length) {await reader.cancel();throw Error();}
    bytes.set(value,position);
    position+=value.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes.subarray(0,position)));
}

export function createFreeMealHandler({createClient,getEnv,fetchImpl=fetch}) {
  return async req=>{
    if (req.method==='OPTIONS') return new Response('ok',{headers});
    if (req.method!=='POST') return json({error:'Método não permitido.'},405);
    const token=req.headers.get('Authorization');
    if (!token?.startsWith('Bearer ')) return json({error:'Entre novamente para continuar.'},401);
    let body;
    try {body=await readBoundedJson(req);} catch {return json({error:'Não consegui ler seu relato.'},400);}
    const description=typeof body?.description==='string' ? body.description.trim() : '';
    if (!uuid.test(body?.operation_id) || description.length<3 || description.length>2000)
      return json({error:'Descreva sua refeição em até 2.000 caracteres.'},400);
    try {
      const url=getEnv('SUPABASE_URL'), anon=getEnv('SUPABASE_ANON_KEY'), service=getEnv('SUPABASE_SERVICE_ROLE_KEY');
      const key=getEnv('OPENAI_API_KEY')?.trim(), model=getEnv('OPENAI_MODEL')?.trim()||'gpt-6.1-sol';
      if (!url || !anon || !service || !key) return json(failure,503);
      const auth={persistSession:false,autoRefreshToken:false};
      const caller=createClient(url,anon,{auth,global:{headers:{Authorization:token}}});
      const user=await caller.auth.getUser();
      if (user.error || !user.data?.user) return json({error:'Sua sessão expirou. Entre novamente.'},401);
      const profile=await caller.from('profiles').select('id,role').eq('user_id',user.data.user.id).single();
      if (profile.error || profile.data?.role!=='patient') return json({error:'Acesso do paciente necessário.'},403);
      const patient=profile.data.id;
      const admin=createClient(url,service,{auth});
      const reservation=await admin.rpc('reserve_free_meal_analysis',{p_id:body.operation_id,p_patient:patient,p_description:description});
      if (reservation.error) {
        if (reservation.error.code==='42501') return json({error:'Esta análise não está disponível para o seu acesso.'},403);
        if (reservation.error.code==='54000') return json({error:'Você chegou ao limite de análises. Tente mais tarde.'},429);
        return json(failure,503);
      }
      if (!reservation.data.created) {
        if (reservation.data.response) return json(reservation.data.response,reservation.data.response.kind==='unavailable'?503:200);
        if (Date.now()-Date.parse(reservation.data.at)<90000) return json({kind:'pending'},202);
        return json(failure,503);
      }
      let outcome;
      try {
        // Only the meal description goes to the provider. Compare privately on our server.
        const [estimate, settings]=await Promise.all([
          estimateFreeMeal({description,key,model,fetchImpl}),
          admin.from('patient_free_meal_settings').select('daily_kcal,meals_per_day').eq('patient_id',patient).maybeSingle(),
        ]);
        if (settings.error) throw Error();
        outcome=interpretEstimate(estimate,settings.data);
      } catch {outcome=failure;}
      const access=await caller.rpc('patient_tracking_unlocked',{p_patient:patient});
      if (access.error || access.data!==true) return json({error:'Seu acompanhamento está bloqueado.'},403);
      const saved=await admin.from('free_meal_previews').update({response:outcome}).eq('patient_id',patient).eq('id',body.operation_id);
      if (saved.error) return json(failure,503);
      return json(outcome,outcome.kind==='unavailable'?503:200);
    } catch {return json(failure,503);}
  };
}
