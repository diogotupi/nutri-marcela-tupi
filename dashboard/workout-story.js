import {getLocalDateString, getSupabase} from '../js/app-core.js';
import {drawWorkoutStory, loadStoryImage, prepareStoryPhoto, storyBadges} from './workout-story-art.mjs';

const exampleUrl = '/assets/story-treino-exemplo.jpg';
const logoUrl = '/assets/logo-horizontal.png';
let openEditor;

async function readDay(patientId, day, signal) {
  const db = getSupabase();
  const midnight = new Date(day + 'T00:00:00-03:00');
  const nextMidnight = new Date(midnight.getTime() + 86400000);
  const water = db.from('patient_water_logs').select('amount_ml')
    .eq('patient_id', patientId).eq('log_date', day).abortSignal(signal).maybeSingle();
  const meals = db.from('patient_meal_checks').select('meal_id', {count: 'exact', head: true})
    .eq('patient_id', patientId).eq('check_date', day).abortSignal(signal);
  const workout = db.from('clinical_records')
    .select('intensity:payload->>intensity')
    .eq('patient_id', patientId).eq('kind', 'exercise').is('archived_at', null)
    .gte('occurred_at', midnight.toISOString()).lt('occurred_at', nextMidnight.toISOString())
    .order('occurred_at', {ascending: false}).order('id', {ascending: false})
    .limit(1).abortSignal(signal).maybeSingle();

  const [hydration, completed, latest] = await Promise.all([water, meals, workout]);
  return {
    waterMl: Number(hydration.data?.amount_ml),
    mealCount: completed.count,
    intensity: Number(latest.data?.intensity),
    incomplete: Boolean(hydration.error || completed.error || latest.error)
  };
}

const editorMarkup = `
  <header class="story-header">
    <h2 id="workout-story-title">Story do treino</h2>
    <button type="button" class="story-close" data-close aria-label="Fechar editor do Story">×</button>
  </header>
  <div class="story-workspace">
    <figure class="story-frame">
      <img data-example alt="Exemplo de Story com a marca da Marcela e os selos do dia">
      <canvas data-preview hidden width="1080" height="1920" role="img" aria-label="Prévia do seu Story"></canvas>
      <figcaption data-example-label>Exemplo</figcaption>
    </figure>
    <div class="story-source">
      <h3>Sua foto</h3>
      <div class="story-source-actions">
        <button type="button" class="app-btn app-btn--primary" data-pick="gallery">Escolher da galeria</button>
        <button type="button" class="app-btn app-btn--ghost" data-pick="camera">Tirar foto</button>
      </div>
      <input type="file" name="gallery" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden>
      <input type="file" name="camera" accept="image/*" capture="user" hidden>
      <p class="story-hint">A foto é preparada no seu aparelho.</p>
      <p class="story-feedback" data-photo-status role="status"></p>
    </div>
    <div class="story-settings" hidden>
      <fieldset>
        <legend>O que você fez hoje?</legend>
        <p class="story-hint">Marque os selos que quer mostrar na foto.</p>
        <div class="story-choices" data-badges></div>
        <p class="story-feedback" data-day-status role="status"></p>
        <button type="button" class="story-text-button" data-retry-day hidden>Recarregar registros</button>
      </fieldset>
      <fieldset>
        <legend>Enquadramento</legend>
        <div class="story-choices story-fit">
          <label><input name="fit" type="radio" value="cover" checked>Preencher</label>
          <label><input name="fit" type="radio" value="contain">Foto inteira</label>
        </div>
        <label class="story-position" data-position-control hidden>
          <span data-position-label>Posição da foto</span>
          <input type="range" name="position" min="0" max="100" value="50">
        </label>
      </fieldset>
    </div>
  </div>
  <footer class="story-footer" hidden>
    <p class="story-feedback" data-export-status role="status"></p>
    <button type="button" class="story-text-button" data-retry-art hidden>Gerar imagem novamente</button>
    <div class="story-export-actions">
      <a class="app-btn app-btn--primary" data-download aria-disabled="true">Baixar imagem</a>
      <button type="button" class="app-btn app-btn--ghost" data-share hidden>Compartilhar</button>
    </div>
  </footer>`;

export function openWorkoutStory(patientId) {
  if (openEditor?.open) return;
  const day = getLocalDateString();
  const filename = 'faz-o-basico-club-' + day + '.jpg';
  const dialog = document.createElement('dialog');
  dialog.className = 'workout-story-dialog';
  dialog.setAttribute('aria-labelledby', 'workout-story-title');
  dialog.innerHTML = editorMarkup;
  const find = selector => dialog.querySelector(selector);
  const canvas = find('[data-preview]');
  const download = find('[data-download]');
  const share = find('[data-share]');
  const position = find('[name=position]');
  const photoStatus = find('[data-photo-status]');
  const exportStatus = find('[data-export-status]');
  const choices = new Map();
  let badges = storyBadges({});
  let photo, logo, file, url;
  let loadingPhoto = false;
  let dayRequest;
  let renderVersion = 0, photoVersion = 0, frame, encodeTimer;

  openEditor = dialog;
  document.body.append(dialog);
  find('[data-example]').src = exampleUrl;
  find('[data-close]').onclick = () => dialog.close();

  function clearExport() {
    file = null;
    download.setAttribute('aria-disabled', 'true');
    download.removeAttribute('href');
    share.disabled = true;
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  function artError() {
    exportStatus.textContent = 'Não foi possível gerar a imagem. Tente novamente.';
    find('[data-retry-art]').hidden = false;
  }

  function prepareExport(version) {
    canvas.toBlob(blob => {
      if (!dialog.open || renderVersion !== version) return;
      if (!blob) { artError(); return; }
      file = new File([blob], filename, {type: blob.type});
      url = URL.createObjectURL(file);
      download.href = url;
      download.download = file.name;
      download.setAttribute('aria-disabled', 'false');
      exportStatus.textContent = '';
      try {
        share.hidden = !(navigator.share && navigator.canShare?.({files: [file]}));
      } catch { share.hidden = true; }
      share.disabled = false;
    }, 'image/jpeg', .92);
  }

  function redraw() {
    const version = ++renderVersion;
    cancelAnimationFrame(frame);
    clearTimeout(encodeTimer);
    clearExport();
    find('[data-retry-art]').hidden = true;
    if (!photo || loadingPhoto || !dialog.open) return;
    const fit = find('[name=fit]:checked').value;
    const ratio = photo.width / photo.height;
    find('[data-position-control]').hidden = fit === 'contain' || Math.abs(ratio - 9 / 16) < .005;
    find('[data-position-label]').textContent = ratio > 9 / 16 ? 'Posição horizontal' : 'Posição vertical';
    exportStatus.textContent = 'Preparando imagem…';
    frame = requestAnimationFrame(async () => {
      try {
        logo ??= loadStoryImage(logoUrl).catch(error => { logo = null; throw error; });
        const wordmark = await logo;
        if (!dialog.open || renderVersion !== version) return;
        const included = badges.filter(badge => choices.get(badge.key) ?? badge.selected);
        drawWorkoutStory(canvas, {photo, logo: wordmark, day, badges: included, fit, position: Number(position.value) / 100});
        canvas.setAttribute('aria-label', ['Prévia do Story Faz o Básico Club', day, ...included.map(badge => badge.label)].join(' · '));
        canvas.hidden = false;
        find('[data-example]').hidden = true;
        find('[data-example-label]').hidden = true;
        // Coalesce fast changes to the crop slider before encoding the exact preview.
        if (!dayRequest) encodeTimer = setTimeout(() => prepareExport(version), 100);
      } catch {
        if (dialog.open && renderVersion === version) artError();
      }
    });
  }

  function renderChoices() {
    const labels = badges.map(badge => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = choices.get(badge.key) ?? badge.selected;
      checkbox.dataset.badgeKey = badge.key;
      checkbox.onchange = () => {
        choices.set(badge.key, checkbox.checked);
        redraw();
      };
      label.append(checkbox, document.createTextNode(badge.label));
      return label;
    });
    find('[data-badges]').replaceChildren(...labels);
  }

  async function refreshDay() {
    dayRequest?.abort();
    const request = new AbortController();
    dayRequest = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    find('[data-day-status]').textContent = 'Buscando seus registros de hoje…';
    find('[data-retry-day]').hidden = true;
    redraw();
    let result;
    try { result = await readDay(patientId, day, request.signal); }
    catch { result = {incomplete: true}; }
    finally { clearTimeout(timeout); }
    if (!dialog.open || dayRequest !== request) return;
    dayRequest = null;
    badges = storyBadges(result);
    renderChoices();
    find('[data-day-status]').textContent = result.incomplete ? 'Alguns registros de hoje não carregaram.' : '';
    find('[data-retry-day]').hidden = !result.incomplete;
    redraw();
  }

  async function choosePhoto(input) {
    const selected = input.files[0];
    input.value = '';
    if (!selected) return;
    const version = ++photoVersion;
    loadingPhoto = true;
    redraw();
    photoStatus.textContent = 'Abrindo sua foto…';
    try {
      const prepared = await prepareStoryPhoto(selected);
      if (!dialog.open || version !== photoVersion) { prepared.width = 0; return; }
      if (photo) photo.width = 0;
      photo = prepared;
      position.value = '50';
      find('.story-settings').hidden = false;
      find('.story-footer').hidden = false;
      photoStatus.textContent = '';
    } catch (error) {
      if (dialog.open && version === photoVersion) photoStatus.textContent = error.message;
    } finally {
      if (dialog.open && version === photoVersion) {
        loadingPhoto = false;
        redraw();
      }
    }
  }

  dialog.querySelectorAll('[data-pick]').forEach(button => {
    const input = find('input[name=' + button.dataset.pick + ']');
    button.onclick = () => input.click();
    input.onchange = () => choosePhoto(input);
  });
  dialog.querySelectorAll('[name=fit]').forEach(radio => radio.onchange = redraw);
  position.oninput = redraw;
  find('[data-retry-art]').onclick = redraw;
  find('[data-retry-day]').onclick = refreshDay;
  share.onclick = async () => {
    if (!file) return;
    try {
      await navigator.share({files: [file]});
    } catch (error) {
      if (dialog.open && error.name !== 'AbortError') exportStatus.textContent = 'Use Baixar imagem para salvar seu Story e postar.';
    }
  };
  dialog.addEventListener('close', () => {
    ++renderVersion;
    ++photoVersion;
    dayRequest?.abort();
    cancelAnimationFrame(frame);
    clearTimeout(encodeTimer);
    clearExport();
    if (photo) photo.width = 0;
    canvas.width = 0;
    dialog.remove();
    if (openEditor === dialog) openEditor = null;
  }, {once: true});

  dialog.showModal();
  renderChoices();
  refreshDay();
  document.fonts?.ready.then(() => { if (dialog.open && photo) redraw(); });
}
