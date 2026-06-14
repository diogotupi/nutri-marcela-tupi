const PASS_HASH = 'dd508fbe687479bd17e2a6643fbf2525c720f69a49af322afdf9d36265d38c98';
const STORAGE_KEY = 'copa_access_v2';

async function hashPassword(value) {
  if (!window.crypto?.subtle) {
    throw new Error('CRYPTO_UNAVAILABLE');
  }

  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function unlock() {
  sessionStorage.setItem(STORAGE_KEY, PASS_HASH);
  document.body.classList.remove('copa-locked');
  const heroVideo = document.querySelector('.copa-hero__bg-media');
  if (heroVideo) heroVideo.play().catch(() => {});
}

async function tryUnlock(password) {
  const hash = await hashPassword(password);
  if (hash === PASS_HASH) {
    unlock();
    return true;
  }
  return false;
}

async function initGate() {
  document.body.classList.add('copa-locked');

  if (sessionStorage.getItem(STORAGE_KEY) === PASS_HASH) {
    unlock();
    return;
  }

  const form = document.getElementById('copa-gate-form');
  const input = document.getElementById('copa-password');
  const error = document.getElementById('copa-gate-error');

  if (!form || !input || !error) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';

    try {
      const ok = await tryUnlock(input.value);
      if (!ok) {
        error.textContent = 'Senha incorreta. Tente novamente.';
        input.value = '';
        input.focus();
      }
    } catch {
      error.textContent = 'Não foi possível validar a senha neste navegador. Tente outro dispositivo.';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGate);
} else {
  initGate();
}
