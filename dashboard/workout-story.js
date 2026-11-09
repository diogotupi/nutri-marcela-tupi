import {readHabits,groupHabits} from '../js/daily-habits.mjs?v=20261109-care';
import {getLocalDateString, getSupabase, showToast} from '../js/app-core.js';
import {createCommunityPhotoDraft} from '../js/community.js?v=20261109-story-mural';
import {weeklyRange} from '../js/weekly-summary.mjs?v=20261109-care';
import {loadPatientWeek, loadStoryWeight} from './weekly-data.js?v=20261109-care';
import {drawWorkoutStory, loadStoryImage, prepareStoryPhoto, storyBadges, storyWeekLabel, weeklyStoryBadges} from './workout-story-art.mjs?v=20261108-club';

const exampleUrl = '/assets/story-fundo-exemplo.jpg';
const logoUrl = '/assets/story-club.png';
let openEditor;

async function readDay(patientId, day, signal) {
  const db = getSupabase();
  const midnight = new Date(day + 'T00:00:00-03:00');
  const nextMidnight = new Date(midnight.getTime() + 86400000);
  const water = db.from('patient_water_logs').select('amount_ml')
    .eq('patient_id', patientId).eq('log_date', day).abortSignal(signal).maybeSingle();
  const flags = readHabits(db,patientId,day,day,signal).then(data=>({data})).catch(error=>({error}));
  const workout = db.from('clinical_records')
    .select('intensity:payload->>intensity')
    .eq('patient_id', patientId).eq('kind', 'exercise').is('archived_at', null)
    .gte('occurred_at', midnight.toISOString()).lt('occurred_at', nextMidnight.toISOString())
    .order('occurred_at', {ascending: false}).order('id', {ascending: false})
    .limit(1).abortSignal(signal).maybeSingle();

  const [hydration, checked, latest] = await Promise.all([water, flags, workout]);
  return {
    waterMl: Number(hydration.data?.amount_ml),
    ...groupHabits(checked.data).get(day),
    intensity: Number(latest.data?.intensity),
    incomplete: Boolean(hydration.error || checked.error || latest.error)
  };
}

const editorMarkup = `
  <header class="story-header">
    <h2 id="workout-story-title">Story do treino</h2>
    <button type="button" class="story-close" data-close aria-label="Fechar editor do Story">×</button>
  </header>
  <div class="story-workspace">
    <figure class="story-frame">
      <canvas data-preview hidden width="1080" height="1920" role="img" aria-label="Prévia do seu Story"></canvas>
      <figcaption data-example-label>Foto de exemplo</figcaption>
    </figure>
    <div class="story-source">
      <fieldset class="story-period">
        <legend>Período do Story</legend>
        <div class="story-choices">
          <label><input type="radio" name="period" value="day">Hoje</label>
          <label><input type="radio" name="period" value="week">Esta semana</label>
          <label><input type="radio" name="period" value="previous">Semana passada</label>
        </div>
      </fieldset>
      <h3>Sua foto</h3>
      <div class="story-source-actions">
        <button type="button" class="app-btn app-btn--primary" data-pick="gallery">Escolher da galeria</button>
        <button type="button" class="app-btn app-btn--ghost" data-pick="camera">Tirar foto</button>
      </div>
      <input type="file" name="gallery" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden>
      <input type="file" name="camera" accept="image/*" capture="user" hidden>
      <p class="story-hint">Escolha uma foto para baixar ou compartilhar seu Story.</p>
      <p class="story-feedback" data-photo-status role="status"></p>
    </div>
    <div class="story-settings">
      <fieldset>
        <legend>O que mostrar na foto?</legend>
        <p class="story-hint">Marque os dados que quer incluir.</p>
        <div class="story-choices" data-badges></div>
        <p class="story-hint story-weight-note" data-weight-note></p>
        <p class="story-feedback" data-stats-status role="status"></p>
        <button type="button" class="story-text-button" data-retry-stats hidden>Recarregar registros</button>
      </fieldset>
      <fieldset data-crop hidden>
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
    <form class="story-wall" data-wall hidden>
      <fieldset class="story-wall-prompt">
        <legend>Deseja postar no mural da comunidade?</legend>
        <div class="story-choices">
          <label><input type="radio" name="wall" value="yes" aria-controls="story-wall-caption">Sim</label>
          <label><input type="radio" name="wall" value="no" aria-controls="story-wall-caption">Não</label>
        </div>
      </fieldset>
      <div class="story-wall-compose" id="story-wall-caption" hidden>
        <label>Legenda <small>(opcional)</small><textarea name="caption" rows="2" maxlength="1000"></textarea></label>
        <button type="submit" class="app-btn app-btn--primary">Publicar no mural</button>
      </div>
      <div class="story-wall-result">
        <p class="story-feedback" data-wall-status role="status"></p>
        <button type="button" class="story-text-button" data-view-wall hidden>Ver no mural</button>
      </div>
    </form>
    <div class="story-export-actions">
      <a class="app-btn app-btn--primary" data-download aria-disabled="true">Baixar imagem</a>
      <button type="button" class="app-btn app-btn--ghost" data-share hidden>Compartilhar</button>
    </div>
  </footer>`;

export function openWorkoutStory(patientId, initialPeriod = 'day') {
  if (openEditor?.open) return;
  const day = getLocalDateString();
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
  const wall = find('[data-wall]');
  const wallPrompt = wall.querySelector('fieldset');
  const wallCompose = find('.story-wall-compose');
  const wallStatus = find('[data-wall-status]');
  const publish = wall.querySelector('[type=submit]');
  const viewWall = find('[data-view-wall]');
  const choices = {day: new Map(), week: new Map(), previous: new Map()};
  let period = initialPeriod;
  let week, badges = [];
  let photo, logo, examplePhoto, file, url;
  let loadingPhoto = false;
  let statsRequest;
  let renderVersion = 0, photoVersion = 0, frame, encodeTimer;
  let wallDraft, posting = false, posted = false;

  openEditor = dialog;
  document.body.append(dialog);

  find('[data-close]').onclick = () => dialog.close();

  function showWallChoices() {
    const optedIn = wall.elements.wall.value === 'yes';
    wall.hidden = !file;
    wallPrompt.hidden = posted;
    wallPrompt.disabled = posting;
    wallCompose.hidden = !optedIn || posted;
    wall.elements.caption.readOnly = posting;
    publish.disabled = posting || !file;
    viewWall.hidden = !posted;
    download.textContent = optedIn && !posting && !posted ? 'Baixar e publicar' : 'Baixar imagem';
  }

  function resetWall() {
    wallDraft = null;
    posted = false;
    wall.reset();
    wallStatus.textContent = '';
    publish.textContent = 'Publicar no mural';
    showWallChoices();
  }

  async function publishStory() {
    if (!file || posted || posting || wall.elements.wall.value !== 'yes') return;
    posting = true;
    const workspace = find('.story-workspace');
    workspace.inert = true;
    showWallChoices();
    wallStatus.textContent = 'Publicando seu Story…';
    try {
      wallDraft ??= createCommunityPhotoDraft(patientId, file, {maxEdge:1920});
      await wallDraft.publish(wall.elements.caption.value);
      posted = true;
      wallStatus.textContent = 'Story publicado no mural da comunidade.';
      if (!dialog.open) showToast(wallStatus.textContent);
    } catch {
      wallStatus.textContent = 'Não foi possível confirmar a publicação. Tente novamente.';
      publish.textContent = 'Tentar publicar novamente';
      if (!dialog.open) showToast(wallStatus.textContent, 'error');
    } finally {
      posting = false;
      workspace.inert = false;
      showWallChoices();
    }
  }

  wallPrompt.onchange = () => { wallStatus.textContent = ''; showWallChoices(); };
  wall.onsubmit = event => { event.preventDefault(); publishStory(); };
  // Keep the native download inside the tap, even while the mural request is in flight.
  download.onclick = event => { if (!file) event.preventDefault(); else publishStory(); };
  viewWall.onclick = () => {
    dialog.close();
    const tab = document.querySelector('#dashboard-nav [data-tab=community]');
    tab.click();
    tab.focus({preventScroll:true});
    document.getElementById('panel-community').scrollIntoView({block:'start'});
  };

  function clearExport() {
    file = null;
    download.setAttribute('aria-disabled', 'true');
    download.removeAttribute('href');
    share.disabled = true;
    if (url) URL.revokeObjectURL(url);
    url = null;
    showWallChoices();
  }

  function artError() {
    exportStatus.textContent = 'Não foi possível gerar a imagem. Tente novamente.';
    find('[data-retry-art]').hidden = false;
  }

  function prepareExport(version) {
    canvas.toBlob(blob => {
      if (!dialog.open || renderVersion !== version) return;
      if (!blob) { artError(); return; }
      const filename = 'faz-o-basico-club-' + (week ? 'semana-' + week.start + '_' + week.until : day) + '.jpg';
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
      showWallChoices();
    }, 'image/jpeg', .92);
  }

  function redraw() {
    const version = ++renderVersion;
    cancelAnimationFrame(frame);
    clearTimeout(encodeTimer);
    clearExport();
    if (wallDraft) resetWall();
    find('[data-retry-art]').hidden = true;
    if (loadingPhoto || !dialog.open) return;
    const fit = find('[name=fit]:checked').value;
    const ratio = photo ? photo.width / photo.height : 9 / 16;
    find('[data-position-control]').hidden = fit === 'contain' || Math.abs(ratio - 9 / 16) < .005;
    find('[data-position-label]').textContent = ratio > 9 / 16 ? 'Posição horizontal' : 'Posição vertical';
    exportStatus.textContent = photo?'Preparando imagem…':'';
    frame = requestAnimationFrame(async () => {
      try {
        logo ??= loadStoryImage(logoUrl).catch(error => { logo = null; throw error; });
        if (!photo) examplePhoto ??= loadStoryImage(exampleUrl).catch(error => { examplePhoto=null; throw error; });
        const [wordmark,background] = await Promise.all([logo,photo||examplePhoto]);
        if (!dialog.open || renderVersion !== version) return;
        const included = badges.filter(badge => choices[period].get(badge.key) ?? badge.selected);
        drawWorkoutStory(canvas, {photo:background, logo: wordmark, day, week, badges: included, fit, position: Number(position.value) / 100});
        const periodLabel = week ? 'Minha semana · ' + storyWeekLabel(week) : day;
        canvas.setAttribute('aria-label', ['Prévia do Story Faz o Básico Club', periodLabel, ...included.map(badge => [badge.label, badge.note].filter(Boolean).join(' · '))].join(' · '));
        canvas.hidden = false;
        find('[data-example-label]').hidden = Boolean(photo);
        // Coalesce fast changes to the crop slider before encoding the exact preview.
        if (photo && !statsRequest) encodeTimer = setTimeout(() => prepareExport(version), 100);
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
      checkbox.checked = choices[period].get(badge.key) ?? badge.selected;
      checkbox.dataset.badgeKey = badge.key;
      checkbox.onchange = () => {
        choices[period].set(badge.key, checkbox.checked);
        redraw();
      };
      label.append(checkbox, document.createTextNode(badge.label));
      return label;
    });
    find('[data-badges]').replaceChildren(...labels);
  }

  async function refreshStats() {
    statsRequest?.abort();
    const request = new AbortController();
    statsRequest = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    const offset = period === 'previous' ? -1 : 0;
    week = period === 'day' ? null : weeklyRange(day, offset);
    badges = week ? [] : storyBadges({});
    renderChoices();
    find('#workout-story-title').textContent = week ? 'Story da semana' : 'Story do treino';
    find('[data-weight-note]').textContent = '';
    find('[data-example-label]').hidden = Boolean(photo);
    canvas.hidden = true;
    const status = find('[data-stats-status]');
    status.textContent = week ? 'Buscando os registros da semana…' : 'Buscando seus registros de hoje…';
    find('[data-retry-stats]').hidden = true;
    redraw();
    let nextBadges, weightNote = '', incomplete = false;
    try {
      if (week) {
        const [totals, weight] = await Promise.allSettled([
          loadPatientWeek(patientId, day, offset, request.signal), loadStoryWeight(patientId, week.until, request.signal)
        ]);
        incomplete = totals.status === 'rejected' || weight.status === 'rejected';
        nextBadges = weeklyStoryBadges(totals.value, weight.value);
        if (weight.status === 'fulfilled') {
          weightNote = nextBadges.find(b => b.key === 'weight')?.note || 'O percentual de peso aparece com pesagens em dois dias diferentes.';
        }
      } else {
        const result = await readDay(patientId, day, request.signal);
        nextBadges = storyBadges(result);
        incomplete = result.incomplete;
      }
    } catch { incomplete = true; }
    finally { clearTimeout(timeout); }
    if (!dialog.open || statsRequest !== request) return;
    statsRequest = null;
    if (nextBadges) badges = nextBadges;
    renderChoices();
    find('[data-weight-note]').textContent = weightNote;
    status.textContent = incomplete ? 'Alguns registros não carregaram.' : !badges.length ? 'Ainda não há dados para mostrar neste período.' : '';
    find('[data-retry-stats]').hidden = !incomplete;
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
      resetWall();
      position.value = '50';
      find('.story-settings').hidden = false;
      find('[data-crop]').hidden = false;
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
  dialog.querySelectorAll('[name=period]').forEach(radio => {
    radio.checked = radio.value === period;
    radio.onchange = () => {
      period = radio.value;
      resetWall();
      refreshStats();
    };
  });
  position.oninput = redraw;
  find('[data-retry-art]').onclick = redraw;
  find('[data-retry-stats]').onclick = refreshStats;
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
    statsRequest?.abort();
    cancelAnimationFrame(frame);
    clearTimeout(encodeTimer);
    clearExport();
    if (photo) photo.width = 0;
    canvas.width = 0;
    dialog.remove();
    if (openEditor === dialog) openEditor = null;
  }, {once: true});

  dialog.showModal();
  refreshStats();
  document.fonts?.ready.then(() => { if (dialog.open && !wallDraft) redraw(); });
}
