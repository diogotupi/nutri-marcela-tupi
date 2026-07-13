import { escapeHtml } from '../js/app-core.js';
import { PATIENT_GUIDES } from '../js/guides-data.js';

const rootEl = document.getElementById('guides-grid');

export function renderGuidesPanel() {
  if (!rootEl) return;

  rootEl.innerHTML = PATIENT_GUIDES.map((guide) => {
    const coverInner = `
      <img src="${guide.image}" alt="${escapeHtml(guide.alt)}" loading="lazy">
      ${guide.available ? '' : '<span class="guide-card__soon">Em breve</span>'}
    `;

    const cover = guide.available
      ? `<a href="${guide.href}" class="guide-card__cover">${coverInner}</a>`
      : `<div class="guide-card__cover guide-card__cover--locked" aria-disabled="true">${coverInner}</div>`;

    return `
      <article class="guide-card">
        ${cover}
        <span class="guide-card__label">${escapeHtml(guide.label)}</span>
      </article>
    `;
  }).join('');
}

export function initGuidesPanel() {
  renderGuidesPanel();
}
