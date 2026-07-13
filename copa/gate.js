import { getProfile } from '../js/auth.js';
import { isConfigured } from '../js/app-core.js';

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
  document.body.classList.remove('copa-locked');
  const heroVideo = document.querySelector('.copa-hero__bg-media');
  if (heroVideo) heroVideo.play().catch(() => {});
  addDashboardLink();
}

function addDashboardLink() {
  const nav = document.querySelector('.copa-header__nav');
  if (!nav || nav.querySelector('[data-dashboard-link]')) return;

  const link = document.createElement('a');
  link.href = '/dashboard/';
  link.className = 'copa-header__back';
  link.dataset.dashboardLink = 'true';
  link.textContent = 'Meu painel';
  nav.insertBefore(link, nav.querySelector('.copa-header__back'));
}

async function hasLoggedInAccess() {
  if (!isConfigured()) return false;

  try {
    const profile = await getProfile();
    return profile?.role === 'patient' || profile?.role === 'admin';
  } catch {
    return false;
  }
}

async function tryUnlock(password) {
  const hash = await hashPassword(password);
  if (hash === PASS_HASH) {
    sessionStorage.setItem(STORAGE_KEY, PASS_HASH);
    unlock();
    return true;
  }
  return false;
}

async function initGate() {
  document.body.classList.add('copa-locked');

  if (await hasLoggedInAccess()) {
    unlock();
    return;
  }

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

initGate();
