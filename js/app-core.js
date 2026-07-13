import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const EMAIL_DOMAIN = 'app.nutrimarcelatupi.com';

let client = null;

export function isConfigured() {
  const { supabaseUrl, supabaseAnonKey } = window.APP_CONFIG || {};
  return Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('SEU_PROJETO'));
}

export function getSupabase() {
  if (!isConfigured()) {
    throw new Error('Supabase não configurado. Copie js/config.example.js para js/config.js.');
  }
  if (!client) {
    client = createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function usernameToEmail(username) {
  return `${String(username).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

export function emailToUsername(email) {
  if (!email) return '';
  return email.split('@')[0];
}

export const DEFAULT_MEALS = [
  'Café da manhã',
  'Lanche da manhã',
  'Almoço',
  'Lanche da tarde',
  'Jantar',
  'Ceia',
];

export const UNIT_OPTIONS = [
  'g',
  'ml',
  'colher de sopa',
  'colher de chá',
  'xícara',
  'fatia',
  'unidade',
  'porção',
];

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function statusLabel(status) {
  const map = {
    draft: 'Rascunho',
    active: 'Ativa',
    archived: 'Arquivada',
  };
  return map[status] || status;
}

export function showToast(message, type = 'info') {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}
