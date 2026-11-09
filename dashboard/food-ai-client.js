import {getSupabase} from '../js/app-core.js';

export async function requestFoodAI(payload){
 const {data,error}=await getSupabase().auth.getSession();
 if(error||!data?.session?.access_token)throw Error('Sua sessão expirou. Entre novamente para conversar.');
 const endpoint=new URL(window.APP_CONFIG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/food-substitution-ai');
 let response;try{response=await fetch(endpoint,{
  method:'POST',cache:'no-store',
  headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:window.APP_CONFIG.supabaseAnonKey,'Content-Type':'application/json'},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(150000)
 });}catch{throw Error('A conexão falhou. Toque em tentar enviar de novo.');}
 let result;try{result=await response.json();}catch{throw Error('Não consegui ler a resposta do assistente. Tente novamente.');}
 if(!response.ok){const error=Error(result.error||'Não consegui conectar o assistente. Tente novamente.');error.expired=result.context_expired===true;throw error;}
 return result;
}
