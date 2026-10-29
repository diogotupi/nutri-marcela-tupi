import { getSupabase, isConfigured } from '../js/app-core.js';
import { getProfile, signIn, signOut, changePassword } from '../js/auth.js';
const $ = id => document.getElementById(id);
const admin = document.body.dataset.accessRole === 'admin';
const loginPath = admin ? '/admin/login/' : '/login/';
let factorId;
const params = new URLSearchParams(location.search);
const recovering = params.get('recovery') === '1' || new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
function errorMessage(error) {
  if (/invalid login credentials/i.test(error.message || '')) return 'Usuário ou senha incorretos. Confira e tente novamente.';
  if (/fetch|network/i.test(error.message || '')) return 'Não foi possível conectar. Confira sua conexão e tente novamente.';
  if (/rate|too many/i.test(error.message || '')) return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
  return error.message || 'Não foi possível concluir. Tente novamente.';
}
function showForm(id) { for (const name of ['login-form','recovery-form','reset-form','mfa-form']) $(name).hidden = name !== id; $('forgot').hidden = id !== 'login-form'; }
async function busy(form, operation) {
  const button = form.querySelector('button[type=submit]'); const label = button.textContent;
  button.disabled = true; button.textContent = 'Aguarde…'; form.setAttribute('aria-busy','true'); $('login-error').textContent = ''; $('access-status').textContent = '';
  try { await operation(); } catch (error) { $('login-error').textContent = errorMessage(error); }
  finally { button.disabled = false; button.textContent = label; form.removeAttribute('aria-busy'); }
}
async function route() {
  const profile = await getProfile(); if (!profile) return;
  if (!(admin ? ['admin', 'secretary'].includes(profile.role) : profile.role === 'patient')) { await signOut(); throw Error(admin ? 'Este acesso é exclusivo da equipe autorizada. Use a área do paciente.' : 'Esta conta é profissional. Use o acesso da equipe.'); }
  if (admin) {
    const { data, error } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel(); if (error) throw error;
    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      const factors = await getSupabase().auth.mfa.listFactors(); if (factors.error) throw factors.error;
      factorId = factors.data.totp.find(f => f.status === 'verified')?.id;
      if (!factorId) throw Error('Método de autenticação não disponível. Contate o suporte do sistema.');
      showForm('mfa-form'); $('mfa-code').focus(); return;
    }
  }
  location.replace(profile.role === 'secretary' ? '/secretaria/' : admin ? '/admin/' : '/dashboard/');
}
$('toggle-password').onclick = () => { const visible = $('password').type === 'password'; $('password').type = visible ? 'text' : 'password'; $('toggle-password').textContent = visible ? 'Ocultar' : 'Mostrar'; $('toggle-password').setAttribute('aria-pressed',String(visible)); };
$('forgot').onclick = () => { showForm('recovery-form'); $('email').focus(); };
$('login-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget,async () => { if (!isConfigured()) throw Error('Sistema indisponível no momento. Tente mais tarde.'); await signIn($('username').value,$('password').value); await route(); }); };
$('recovery-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget,async () => {
  const email = $('email').value.trim().toLowerCase();
  if (email.endsWith('@app.nutrimarcelatupi.com')) throw Error('Este é um e-mail técnico. Solicite a redefinição à administração.');
  const { error } = await getSupabase().auth.resetPasswordForEmail(email,{ redirectTo: `${location.origin}${loginPath}?recovery=1` }); if (error) throw error;
  $('access-status').textContent = 'Se este e-mail estiver associado à sua conta, você receberá um link. Confira também a caixa de spam.';
}); };
$('reset-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget,async () => {
  if ($('new-password').value !== $('confirm-password').value) throw Error('As senhas não coincidem.');
  const { data, error } = await getSupabase().auth.getUser(); if (error || !data.user) throw Error('Link expirado ou inválido. Solicite um novo link de recuperação.');
  const assurance = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) throw assurance.error;
  if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
    const factors = await getSupabase().auth.mfa.listFactors(); if (factors.error) throw factors.error;
    factorId = factors.data.totp.find(f => f.status === 'verified')?.id;
    if (!factorId) throw Error('Verifique seu segundo fator antes de alterar a senha.');
    showForm('mfa-form'); $('mfa-code').focus(); return;
  }
  await changePassword($('new-password').value); await signOut(); location.replace(`${loginPath}?changed=1`);
}); };
$('mfa-form').onsubmit = event => { event.preventDefault(); busy(event.currentTarget,async () => { const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId,code:$('mfa-code').value }); if (error) throw error; if (recovering) { showForm('reset-form'); $('new-password').focus(); } else await route(); }); };
if (recovering) { showForm('reset-form'); $('intro').textContent = 'Escolha uma nova senha para sua conta.'; }
else if (isConfigured()) route().catch(error => { $('login-error').textContent = errorMessage(error); });
if (params.get('changed') === '1') $('access-status').textContent = 'Senha alterada. Entre com a nova senha.';
if (params.get('error') === 'profile') $('login-error').textContent = 'Cadastro não encontrado. Solicite ajuda à administração.';
window.addEventListener('offline',() => { $('login-error').textContent = 'Você está sem conexão. Reconecte-se para continuar.'; });
