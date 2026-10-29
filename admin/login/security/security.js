import { requireAuth } from '../../../js/auth.js';
import { getSupabase } from '../../../js/app-core.js';
const $ = id => document.getElementById(id); let factorId;
async function init() {
  const auth = await requireAuth({role:'admin'}); if (!auth) return;
  const {data,error} = await getSupabase().auth.mfa.listFactors(); if(error) throw error;
  const active = data.totp.some(f=>f.status==='verified');
  $('status').textContent = active ? 'Autenticação em dois fatores ativa.' : 'Sua conta ainda não tem autenticação em dois fatores.';
  $('enroll').hidden = active;
}
$('enroll').onclick = async () => {
  $('enroll').disabled=true; $('error').textContent='';
  try {
    const {data,error}=await getSupabase().auth.mfa.enroll({factorType:'totp',friendlyName:'Consultório Marcela '+new Date().toISOString().slice(0,16)}); if(error) throw error;
    factorId=data.id; $('qr').src=data.totp.qr_code; $('verify').hidden=false; $('enroll').hidden=true; $('code').focus();
  } catch(error){$('error').textContent=error.message;} finally {$('enroll').disabled=false;}
};
$('verify').onsubmit=async event=>{
  event.preventDefault(); const button=event.currentTarget.querySelector('button');button.disabled=true;$('error').textContent='';
  try { const {error}=await getSupabase().auth.mfa.challengeAndVerify({factorId,code:$('code').value});if(error) throw error;
    $('verify').hidden=true;$('qr').removeAttribute('src');$('status').textContent='Proteção ativada. O código será solicitado nos próximos logins.';
  } catch(error){$('error').textContent=error.message;}finally{button.disabled=false;}
};
init().catch(error=>{$('error').textContent=error.message;});
