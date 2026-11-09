import {getSupabase} from '../js/app-core.js';

export async function requestFoodAI(payload=null,conversation=''){
 const {data,error}=await getSupabase().auth.getSession();
 if(error||!data?.session?.access_token)throw Error('Sua sessão expirou. Entre novamente para conversar.');
 const endpoint=new URL(window.APP_CONFIG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/food-substitution-ai');
 if(!payload)endpoint.searchParams.set('conversation',conversation);
 let response;try{response=await fetch(endpoint,{
  method:payload?'POST':'GET',
  headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:window.APP_CONFIG.supabaseAnonKey,...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(payload?.action?150000:28000)
 });}catch{throw Error('Não consegui conectar agora. Sua mensagem foi mantida; tente novamente.');}
 let result;try{result=await response.json();}catch{throw Error('Não consegui ler a resposta do assistente. Tente novamente.');}
 if(!response.ok){const error=Error(result.error||'Não consegui conectar o assistente. Tente novamente.');error.confirmedFailure=result.confirmed_failure===true;throw error;}
 return result;
}
