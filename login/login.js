import { isConfigured, showToast } from '../js/app-core.js';
import { getProfile, signIn } from '../js/auth.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const setupNotice = document.getElementById('setup-notice');
const params = new URLSearchParams(window.location.search);

async function redirectIfLoggedIn() {
  if (!isConfigured()) return;
  try {
    const profile = await getProfile();
    if (!profile) return;
    window.location.href = profile.role === 'admin' ? '/admin/' : '/dashboard/';
  } catch {
    // sessão inválida — permanece no login
  }
}

function showSetupMessage() {
  if (!isConfigured() || params.get('setup') === '1') {
    setupNotice.hidden = false;
    setupNotice.textContent = 'O sistema ainda precisa ser conectado ao Supabase. Veja supabase/README.md.';
  }
}

if (params.get('error') === 'profile') {
  errorEl.textContent = 'Perfil não encontrado. Peça para a nutricionista verificar seu cadastro.';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.textContent = '';

  if (!isConfigured()) {
    errorEl.textContent = 'Sistema em configuração. Tente novamente mais tarde.';
    return;
  }

  const username = form.username.value.trim();
  const password = form.password.value;

  try {
    await signIn(username, password);
    const profile = await getProfile();
    showToast('Login realizado com sucesso.');
    window.location.href = profile.role === 'admin' ? '/admin/' : '/dashboard/';
  } catch (error) {
    errorEl.textContent = error.message || 'Usuário ou senha inválidos.';
  }
});

showSetupMessage();
redirectIfLoggedIn();
