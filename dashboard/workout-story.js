import {getLocalDateString, showToast} from '../js/app-core.js';
import {getRecordDate,formatRecordDate} from './record-date.js?v=20261118-historico';
import {createCommunityPhotoDraft} from '../js/community.js?v=20261112-fotos';
import {weeklyRange} from '../js/weekly-summary.mjs?v=20261114-story-weight';
import {loadPatientWeek} from './weekly-data.js?v=20261114-story-weight';
import {DEFAULT_STORY_POSITION, drawWorkoutStory, loadStoryImage, prepareStoryPhoto, storyWeekLabel, weeklyStoryBadges} from './workout-story-art.mjs?v=20261124-weekly-stamp';

const exampleUrl = '/assets/story-fundo-exemplo.jpg';
let openEditor;

const editorMarkup = `
  <header class="story-header">
    <h2 id="workout-story-title">Story da semana</h2>
    <button type="button" class="story-close" data-close aria-label="Fechar editor do Story">×</button>
  </header>
  <div class="story-workspace">
    <div class="story-preview">
      <figure class="story-frame">
        <canvas data-preview hidden width="1080" height="1920" role="img" aria-label="Prévia do seu Story"></canvas>
        <div data-story-drag hidden tabindex="0" role="group" aria-label="Posição da arte"
          aria-describedby="story-drag-hint story-key-help" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"></div>
        <figcaption data-example-label>Foto de exemplo</figcaption>
      </figure>
      <p class="story-hint story-move-help">
        <span id="story-drag-hint">Arraste a arte para posicioná-la na foto.</span>
        <span id="story-key-help">Mova com as setas. Home restaura a posição.</span>
      </p>
      <span class="story-sr-only" data-position-status role="status"></span>
    </div>
    <div class="story-source">
      <fieldset class="story-period">
        <legend>Período do Story</legend>
        <div class="story-choices">
          <label><input type="radio" name="period" value="week"><span>Esta semana</span></label>
          <label><input type="radio" name="period" value="previous"><span>Semana passada</span></label>
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
      <a class="app-btn app-btn--ghost" data-sticker aria-disabled="true">Baixar arte sem fundo (PNG)</a>
      <p class="story-hint">Só a marca e seus números da semana, para colocar sobre outra foto.</p>
      <p class="story-feedback" data-sticker-status role="status"></p>
    </div>
    <div class="story-settings">
      <fieldset>
        <legend>O que mostrar na foto?</legend>
        <p class="story-hint">Treino X/7 conta os dias em que você treinou. Cardio soma os minutos registrados na semana.</p>
        <div class="story-choices" data-badges></div>
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
    <div class="story-export-actions">
      <button type="button" class="app-btn app-btn--primary" data-share aria-describedby="story-instagram-hint" hidden>Compartilhar</button>
      <a class="app-btn app-btn--ghost" data-download aria-disabled="true">Salvar</a>
    </div>
    <p class="story-hint" id="story-instagram-hint" hidden></p>
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
  </footer>`;

export function openWorkoutStory(patientId, initialPeriod = 'week', day = getRecordDate()) {
  if (openEditor?.open) return;
  const today = getLocalDateString();
  const baseWeekOffset = Math.round((Date.parse(weeklyRange(day).start)-Date.parse(weeklyRange(today).start))/604800000);
  const dialog = document.createElement('dialog');
  dialog.className = 'workout-story-dialog';
  dialog.setAttribute('aria-labelledby', 'workout-story-title');
  dialog.innerHTML = editorMarkup;
  const find = selector => dialog.querySelector(selector);
  if (baseWeekOffset < 0) {
    find('[name=period][value=week]').nextElementSibling.textContent = 'Semana de '+formatRecordDate(weeklyRange(day).start);
    find('[name=period][value=previous]').nextElementSibling.textContent = 'Semana anterior';
  }
  const canvas = find('[data-preview]');
  const dragTarget = find('[data-story-drag]');
  const download = find('[data-download]');
  const sticker = find('[data-sticker]');
  const share = find('[data-share]');
  const instagramHint = find('#story-instagram-hint');
  const position = find('[name=position]');
  const photoStatus = find('[data-photo-status]');
  const exportStatus = find('[data-export-status]');
  const wall = find('[data-wall]');
  const wallPrompt = wall.querySelector('fieldset');
  const wallCompose = find('.story-wall-compose');
  const wallStatus = find('[data-wall-status]');
  const publish = wall.querySelector('[type=submit]');
  const viewWall = find('[data-view-wall]');
  const choices = {week: new Map(), previous: new Map()};
  let period = initialPeriod === 'previous' ? 'previous' : 'week';
  let week, badges = [];
  let photo, examplePhoto, file, url, stickerUrl;
  let overlayPosition = DEFAULT_STORY_POSITION, cardBounds, drag;
  let loadingPhoto = false;
  let statsRequest;
  let renderVersion = 0, photoVersion = 0, frame, encodeTimer;
  let wallDraft, posting = false, posted = false;

  openEditor = dialog;
  document.body.append(dialog);

  find('[data-close]').onclick = () => dialog.close();

  function showWallChoices() {
    const optedIn = wall.elements.wall.value === 'yes';
    wall.hidden = !photo;
    wallPrompt.hidden = posted;
    wallPrompt.disabled = posting;
    wallCompose.hidden = !optedIn || posted;
    wall.elements.caption.readOnly = posting;
    publish.disabled = posting || !file;
    viewWall.hidden = !posted;
    download.textContent = optedIn && !posting && !posted ? 'Salvar e publicar' : 'Salvar';
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
      wallDraft ??= createCommunityPhotoDraft(patientId, file, {renderedStory:true});
      await wallDraft.publish(wall.elements.caption.value, () => {
        wallStatus.textContent = 'Enviando a imagem ao mural…';
      });
      posted = true;
      wallStatus.textContent = 'Story publicado no mural da comunidade.';
      if (!dialog.open) showToast(wallStatus.textContent);
    } catch (error) {
      wallStatus.textContent = error.message || 'Não foi possível preparar a publicação. Tente novamente.';
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
  sticker.onclick = event => { if (!stickerUrl) event.preventDefault(); };
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
    if (stickerUrl) URL.revokeObjectURL(stickerUrl);
    stickerUrl = null;
    sticker.removeAttribute('href');
    sticker.setAttribute('aria-disabled', 'true');
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
      download.classList.toggle('app-btn--primary', share.hidden);
      download.classList.toggle('app-btn--ghost', !share.hidden);
      instagramHint.textContent = share.hidden
        ? 'Salve a imagem e abra o Instagram para postar nos Stories.'
        : 'Toque em Compartilhar e escolha o Instagram para postar nos Stories.';
      instagramHint.hidden = false;
      share.disabled = false;
      showWallChoices();
    }, 'image/jpeg', .92);
  }

  function prepareSticker(version, included) {
    const art = document.createElement('canvas');
    const bounds = drawWorkoutStory(art, {badges:included, transparent:true});
    const cropped = document.createElement('canvas');
    cropped.width = Math.ceil(bounds.width);
    cropped.height = Math.ceil(bounds.height);
    cropped.getContext('2d').drawImage(art, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    art.width = 0;
    cropped.toBlob(blob => {
      cropped.width = 0;
      if (!dialog.open || renderVersion !== version) return;
      if (!blob) { find('[data-sticker-status]').textContent = 'Não foi possível gerar a arte sem fundo. Tente novamente.'; return; }
      stickerUrl = URL.createObjectURL(blob);
      sticker.href = stickerUrl;
      sticker.download = 'faz-o-basico-club-arte-' + week.start + '_' + week.until + '.png';
      sticker.setAttribute('aria-disabled', 'false');
      find('[data-sticker-status]').textContent = '';
    }, 'image/png');
  }

  function redraw({moving = false} = {}) {
    const version = ++renderVersion;
    cancelAnimationFrame(frame);
    clearTimeout(encodeTimer);
    clearExport();
    if (posted) resetWall();
    else if (wallDraft) {
      wallDraft = null;
      wallStatus.textContent = '';
      publish.textContent = 'Publicar no mural';
    }
    find('[data-retry-art]').hidden = true;
    if (loadingPhoto || !dialog.open) {
      dragTarget.hidden = true;
      return;
    }
    const fit = find('[name=fit]:checked').value;
    const ratio = photo ? photo.width / photo.height : 9 / 16;
    find('[data-position-control]').hidden = fit === 'contain' || Math.abs(ratio - 9 / 16) < .005;
    find('[data-position-label]').textContent = ratio > 9 / 16 ? 'Posição horizontal' : 'Posição vertical';
    const progress = photo && !drag && !moving ? 'Preparando imagem…' : '';
    if (exportStatus.textContent !== progress) exportStatus.textContent = progress;
    frame = requestAnimationFrame(async () => {
      try {
        if (!photo) examplePhoto ??= loadStoryImage(exampleUrl).catch(error => { examplePhoto=null; throw error; });
        const background = photo || await examplePhoto;
        if (!dialog.open || renderVersion !== version) return;
        const included = badges.filter(badge => choices[period].get(badge.key) ?? badge.selected);
        cardBounds = drawWorkoutStory(canvas, {photo:background, day, week, badges: included, fit, position: Number(position.value) / 100, overlayPosition});
        dragTarget.style.left = 100 * cardBounds.x / canvas.width + '%';
        dragTarget.style.top = 100 * cardBounds.y / canvas.height + '%';
        dragTarget.style.width = 100 * cardBounds.width / canvas.width + '%';
        dragTarget.style.height = 100 * cardBounds.height / canvas.height + '%';
        dragTarget.hidden = false;
        const periodLabel = week ? 'Minha semana · ' + storyWeekLabel(week) : day;
        canvas.setAttribute('aria-label', ['Prévia do Story Faz o Básico Club', periodLabel, ...included.map(badge => [badge.label, badge.note].filter(Boolean).join(' · '))].join(' · '));
        canvas.hidden = false;
        find('[data-example-label]').hidden = Boolean(photo);
        // Coalesce fast changes to the crop slider before encoding the exact preview.
        if (!statsRequest && !drag?.moved) encodeTimer = setTimeout(() => {
          if (photo) prepareExport(version);
          prepareSticker(version, included);
        }, 100);
      } catch {
        if (dialog.open && renderVersion === version) {
          dragTarget.hidden = true;
          artError();
        }
      }
    });
  }

  const within = value => Math.max(0, Math.min(1, value));
  function setOverlayPosition(x, y) {
    x = within(x); y = within(y);
    if (x === overlayPosition.x && y === overlayPosition.y) return;
    overlayPosition = {x,y};
    redraw({moving:true});
  }

  dragTarget.onpointerdown = event => {
    if (posting || drag || !cardBounds || !event.isPrimary || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    drag = {
      id:event.pointerId, startX:event.clientX, startY:event.clientY, moved:false,
      grabX:(event.clientX - rect.left) * canvas.width / rect.width - cardBounds.x,
      grabY:(event.clientY - rect.top) * canvas.height / rect.height - cardBounds.y
    };
    dragTarget.setPointerCapture(event.pointerId);
    dragTarget.classList.add('is-dragging');
  };
  function moveCard(event) {
    if (posting || drag?.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 2) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    drag.moved = true;
    const x = (event.clientX - rect.left) * canvas.width / rect.width - drag.grabX;
    const y = (event.clientY - rect.top) * canvas.height / rect.height - drag.grabY;
    const {minX,minY,maxX,maxY} = cardBounds;
    setOverlayPosition((x - minX) / (maxX - minX || 1), (y - minY) / (maxY - minY || 1));
  }
  function finishDrag(event) {
    if (drag?.id !== event.pointerId) return;
    if (event.type === 'pointerup') moveCard(event);
    const {moved,id} = drag;
    drag = null;
    dragTarget.classList.remove('is-dragging');
    if (dragTarget.hasPointerCapture(id)) dragTarget.releasePointerCapture(id);
    if (moved) redraw({moving:true});
  }
  dragTarget.onpointermove = moveCard;
  dragTarget.onpointerup = finishDrag;
  dragTarget.onpointercancel = finishDrag;
  dragTarget.onlostpointercapture = finishDrag;
  dragTarget.onkeydown = event => {
    if (posting || drag) return;
    const step = event.shiftKey ? .08 : .015;
    let {x,y} = overlayPosition;
    switch (event.key) {
      case 'ArrowLeft': x -= step; break;
      case 'ArrowRight': x += step; break;
      case 'ArrowUp': y -= step; break;
      case 'ArrowDown': y += step; break;
      case 'Home': ({x,y} = DEFAULT_STORY_POSITION); break;
      default: return;
    }
    event.preventDefault();
    setOverlayPosition(x,y);
    find('[data-position-status]').textContent = 'Horizontal ' + Math.round(overlayPosition.x * 100) + '%, vertical ' + Math.round(overlayPosition.y * 100) + '%.';
  };

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
    const offset = baseWeekOffset + (period === 'previous' ? -1 : 0);
    week = weeklyRange(today, offset);
    badges = [];
    renderChoices();
    find('#workout-story-title').textContent = 'Story da semana';
    find('[data-example-label]').hidden = Boolean(photo);
    canvas.hidden = true;
    const status = find('[data-stats-status]');
    status.textContent = 'Buscando os registros da semana…';
    find('[data-retry-stats]').hidden = true;
    redraw();
    let nextBadges, incomplete = false;
    try {
      nextBadges = weeklyStoryBadges(await loadPatientWeek(patientId,today,offset,request.signal));
    } catch { incomplete = true; }
    finally { clearTimeout(timeout); }
    if (!dialog.open || statsRequest !== request) return;
    statsRequest = null;
    if (nextBadges) badges = nextBadges;
    renderChoices();
    status.textContent = incomplete ? 'Não foi possível carregar os registros da semana. Tente novamente.' : storyWeekLabel(week) + ' · Cada dia de treino conta uma vez, mesmo com força e cardio.';
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
      if (dialog.open && error.name !== 'AbortError') exportStatus.textContent = 'O compartilhamento não abriu. Você pode salvar a imagem e postar pelo Instagram.';
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
