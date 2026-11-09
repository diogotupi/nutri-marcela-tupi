import {escapeHtml as esc, getSupabase} from './app-core.js';
import {preparePhotoUpload} from './media-upload.js';

const bucket = 'community-photos';
const instances = new WeakMap();
const dateFormat = new Intl.DateTimeFormat('pt-BR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const paths = {
  camera: '<path d="m8 6 1.5-2h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><circle cx="12" cy="12.5" r="3.3"/>',
  coffee: '<g class="cup-steam"><path d="M8 6c-1-1.6 1.5-1.8.5-3.6m4 3.6c-1-1.6 1.5-1.8.5-3.6"/></g><g class="cup-body"><path d="M3.5 9h13v4.3a6.5 6.5 0 0 1-13 0zM16.7 10h1.5a2.8 2.8 0 0 1 0 5.6h-1.8"/><path d="M3 21h15"/></g>',
  comment: '<path d="M20.5 11.4a8.4 8.4 0 0 1-8.6 8.4 9.3 9.3 0 0 1-3.5-.7l-4.9 1.2 1.2-4.4a8 8 0 0 1-1.2-4.5 8.5 8.5 0 0 1 17 0Z"/>',
  crown: '<path d="m2.5 7 5.2 3.5L12 4l4.3 6.5L21.5 7l-2.2 11H4.7z" fill="#f3c55f"/><path d="M6 20h12"/>',
  pride: '<path d="M12 2.2 21 5.4v6c0 5.5-4.6 8.6-9 10.7-4.4-2.1-9-5.2-9-10.7v-6z" fill="#416854" stroke="#b28a3c"/><path d="m12 6.4 1.7 3.2 3.6.5-2.6 2.5.6 3.6-3.3-1.7-3.3 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#ffdd89" stroke="none"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6m4-6v6"/>',
  photos: '<rect x="5.5" y="4" width="15.5" height="16" rx="2.5"/><path d="m6 16 4.2-4 3.2 2.8 2-1.9 5 4.6M3 8v11a3.5 3.5 0 0 0 3.5 3.5H16"/><circle cx="15.8" cy="8.7" r="1.4"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function byline(author) {
  const mark = (kind, label) => `<span class="community-seal" role="img" aria-label="${label}" title="${label}">${icon(kind)}</span>`;
  return `<span class="community-handle">@${esc(author.username)}</span>${author.has_pride ? mark('pride','Orgulho da nutri') : ''}${author.is_admin ? mark('crown','Marcela · Administradora') : ''}`;
}
function timestamp(iso) {
  return `<time datetime="${esc(iso)}">${esc(dateFormat.format(new Date(iso)))}</time>`;
}
function unwrap(result) {
  if (result.error) throw result.error;
  return result.data;
}
function errorText(error) {
  return error?.message && !/fetch|network|load failed|json|row|foreign key|constraint/i.test(error.message)
    ? error.message : 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}
function trash(label) {
  return `<button type="button" class="community-icon-button" title="${label}" aria-label="${label}">${icon('trash')}</button>`;
}

export function createCommunityPhotoDraft(profileId, file, options) {
  const db = getSupabase();
  const id = crypto.randomUUID();
  const path = profileId + '/' + id + '.webp';
  let uploaded = false;

  return {
    async publish(caption, onUpload) {
      if (!uploaded) {
        const photo = await preparePhotoUpload(file, options);
        onUpload?.();
        const {error} = await db.storage.from(bucket).upload(path, photo, {upsert:false, contentType:'image/webp'});
        // A retry can find its own file if Storage received it before the connection dropped.
        if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) throw error;
        uploaded = true;
      }
      unwrap(await db.rpc('community_publish', {p_id:id, p_caption:caption.trim()}));
    }
  };
}

export function mountCommunity(root, profile) {
  if (instances.has(root)) {
    // Keep any upload or comment draft when switching tabs.
    return instances.get(root)();
  }
  const db = getSupabase();
  const storage = db.storage.from(bucket);
  const rpc = async (name, args) => unwrap(await db.rpc(name, args));
  root.classList.add('community');
  root.innerHTML = `<div class="community-toolbar">
      <h2>Fotos da comunidade</h2>
      <button class="community-primary" type="button" data-compose aria-expanded="false">${icon('camera')} Publicar foto</button>
    </div>
    <form class="community-compose" hidden>
      <fieldset><legend>Nova publicação</legend>
        <label class="community-picker">${icon('photos')} <span>Escolher foto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label>
        <img class="community-preview" alt="Prévia da foto escolhida" hidden>
        <label>Legenda <small>(opcional)</small><textarea name="caption" rows="2" maxlength="1000"></textarea></label>
        <div class="community-submit"><small>Visível para os membros da comunidade.</small><button class="community-primary" type="submit">Publicar</button></div>
      </fieldset>
    </form>
    <p class="community-status" role="status"></p>
    <div class="community-feed"></div>
    <button class="community-more" type="button" hidden>Ver mais fotos</button>`;
  const feed = root.querySelector('.community-feed');
  const form = root.querySelector('form');
  const photo = form.elements.photo;
  const preview = form.querySelector('img');
  const compose = root.querySelector('[data-compose]');
  const status = root.querySelector('[role=status]');
  const more = root.querySelector('.community-more');
  const posts = new Map();
  let before = null, reading = false, pageAction = 'next', draft, previewUrl;

  function releasePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.removeAttribute('src');
    preview.hidden = true;
  }
  // Revoke after decode. The preview remains displayed and leaving the admin page leaks no blob URL.
  preview.onload = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; };
  compose.onclick = () => {
    form.hidden = !form.hidden;
    compose.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) photo.focus();
  };
  photo.onchange = () => {
    releasePreview();
    draft = null;
    status.textContent = '';
    const selected = photo.files[0];
    if (selected) {
      previewUrl = URL.createObjectURL(selected);
      preview.src = previewUrl;
      preview.hidden = false;
    }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = form.querySelector('fieldset');
    if (fields.disabled || !photo.files[0]) return;
    fields.disabled = compose.disabled = true;
    try {
      draft ??= createCommunityPhotoDraft(profile.id, photo.files[0]);
      status.textContent = 'Preparando sua foto…';
      await draft.publish(form.elements.caption.value, () => {
        status.textContent = 'Enviando foto…';
      });
      form.reset();
      releasePreview();
      draft = null;
      form.hidden = true;
      compose.setAttribute('aria-expanded','false');
      status.textContent = 'Foto publicada.';
      await loadFeed(true);
    } catch (error) { status.textContent = errorText(error); }
    finally { fields.disabled = compose.disabled = false; }
  };

  function commentNode(row, state, article) {
    const entry = document.createElement('li');
    entry.dataset.id = row.id;
    entry.innerHTML = `<div class="community-byline">${byline(row.author)} ${timestamp(row.created_at)}
      ${row.can_delete ? trash('Excluir comentário') : ''}</div><p>${esc(row.body)}</p>`;
    const remove = entry.querySelector('button');
    if (remove) remove.onclick = async () => {
      if (!confirm('Excluir este comentário?')) return;
      remove.disabled = true;
      try {
        await rpc('community_delete_comment',{p_id:row.id});
        entry.remove();
        state.comments = Math.max(0,state.comments-1);
        commentCount(article,state);
      } catch (error) { article.querySelector('[role=status]').textContent = errorText(error); remove.disabled = false; }
    };
    return entry;
  }
  function commentCount(article,state) {
    article.querySelector('[data-count]').textContent = state.comments;
    article.querySelector('[data-discuss]').setAttribute('aria-label','Comentários (' + state.comments + ')');
  }
  function wireComments(article,state) {
    const toggle = article.querySelector('[data-discuss]');
    const section = article.querySelector('.community-thread');
    const list = section.querySelector('ul');
    const older = section.querySelector('[data-older]');
    const input = section.querySelector('textarea');
    const send = section.querySelector('[type=submit]');
    const feedback = article.querySelector('[role=status]');
    let cursor = null, loaded = false, loading = false, operation;
    async function loadComments() {
      if (loading) return;
      loading = older.disabled = true;
      try {
        const rows = await rpc('community_comments_page',{p_post:state.id,p_before:cursor});
        for (const row of rows) {
          if (!list.querySelector(`[data-id="${row.id}"]`)) list.prepend(commentNode(row,state,article));
        }
        if (rows.length) cursor = rows.at(-1).seq;
        older.hidden = rows.length < 20;
        older.textContent = 'Ver comentários anteriores';
        loaded = true;
        feedback.textContent = '';
      } catch (error) {
        feedback.textContent = errorText(error);
        older.hidden = false;
        older.textContent = 'Tentar carregar comentários';
      } finally { loading = older.disabled = false; }
    }
    toggle.onclick = () => {
      section.hidden = !section.hidden;
      toggle.setAttribute('aria-expanded',String(!section.hidden));
      if (!section.hidden && !loaded) loadComments();
    };
    older.onclick = loadComments;
    section.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body || send.disabled) return;
      if (!operation || operation.body !== body) operation = {id:crypto.randomUUID(),body};
      input.readOnly = send.disabled = true;
      try {
        const row = await rpc('community_add_comment',{p_id:operation.id,p_post:state.id,p_body:body});
        if (!list.querySelector(`[data-id="${row.id}"]`)) {
          list.append(commentNode(row,state,article));
          state.comments++;
          commentCount(article,state);
        }
        operation = null;
        input.value = '';
        feedback.textContent = 'Comentário publicado.';
      } catch (error) { feedback.textContent = errorText(error); }
      finally { input.readOnly = send.disabled = false; }
    };
  }

  function renderPost(state, url) {
    const article = document.createElement('article');
    article.className = 'community-post';
    article.dataset.id = state.id;
    const coffeeLabel = () => state.liked ? 'Retirar cafezinho' : 'Dar um cafezinho';
    article.innerHTML = `<header><div class="community-byline">${byline(state.author)}</div>
        ${timestamp(state.created_at)} ${state.can_delete ? trash('Excluir publicação') : ''}</header>
      <div class="community-frame"><img loading="lazy" decoding="async" alt="Foto publicada por @${esc(state.author.username)}"></div>
      ${state.caption ? `<p class="community-caption">${esc(state.caption)}</p>` : ''}
      <div class="community-actions">
        <button type="button" class="community-coffee" aria-pressed="${state.liked}" aria-label="${coffeeLabel()}">${icon('coffee')}<span>Cafezinho</span> <b>${Number(state.coffees)}</b></button>
        <button type="button" data-discuss aria-expanded="false">${icon('comment')} Comentários <b data-count></b></button>
      </div>
      <div class="community-thread" hidden>
        <button type="button" data-older hidden>Ver comentários anteriores</button><ul></ul>
        <form><label>Seu comentário<textarea required maxlength="600" rows="2" placeholder="Escreva um comentário…"></textarea></label><button type="submit" class="community-secondary">Comentar</button></form>
      </div><p class="community-status" role="status"></p>`;
    const img = article.querySelector('.community-frame img');
    let retried = false;
    img.onerror = async () => {
      if (retried) return;
      retried = true;
      try { img.src = unwrap(await storage.createSignedUrl(state.photo_path,3600)).signedUrl; }
      catch { article.querySelector('[role=status]').textContent = 'Não foi possível carregar a foto. Abra a comunidade novamente.'; }
    };
    if (url) img.src = url; else img.onerror();
    const coffee = article.querySelector('.community-coffee');
    function coffeeState(pressed, count) {
      coffee.setAttribute('aria-pressed',String(pressed));
      coffee.querySelector('b').textContent = count;
    }
    coffee.onclick = async () => {
      if (coffee.disabled) return;
      const liked = !state.liked;
      coffee.disabled = true;
      coffeeState(liked,Math.max(0,state.coffees+(liked ? 1 : -1)));
      coffee.classList.toggle('is-brewing',liked);
      try {
        Object.assign(state,await rpc('community_set_coffee',{p_post:state.id,p_liked:liked}));
        article.querySelector('[role=status]').textContent = '';
      } catch (error) { article.querySelector('[role=status]').textContent = errorText(error); }
      finally {
        coffeeState(state.liked,state.coffees);
        coffee.setAttribute('aria-label',coffeeLabel());
        coffee.disabled = false;
      }
    };
    coffee.addEventListener('animationend',() => coffee.classList.remove('is-brewing'));
    const remove = article.querySelector('header button');
    if (remove) remove.onclick = async () => {
      if (!confirm('Excluir esta foto e os comentários dela?')) return;
      remove.disabled = true;
      try {
        const removed = unwrap(await storage.remove([state.photo_path]));
        if (!removed?.length) throw Error('A publicação já foi removida ou você não tem permissão.');
        posts.delete(state.id);
        article.remove();
        if (!posts.size) await loadFeed(true);
        status.textContent = 'Publicação excluída.';
      } catch (error) { article.querySelector('[role=status]').textContent = errorText(error); remove.disabled = false; }
    };
    commentCount(article,state);
    wireComments(article,state);
    return article;
  }
  let refreshRequested = false;
  async function loadFeed(first) {
    if (reading) { if (first) refreshRequested = true; return; }
    reading = more.disabled = true;
    feed.setAttribute('aria-busy','true');
    try {
      const rows = await rpc('community_feed',{p_before:first ? null : before});
      const signed = rows.length ? unwrap(await storage.createSignedUrls(rows.map(row => row.photo_path),3600)) : [];
      const urls = new Map(signed.map(row => [row.path,row.signedUrl]));
      const hasDraft = first && Array.from(feed.querySelectorAll('.community-thread textarea'))
        .some(input => input.value.trim() || input === document.activeElement);
      if (first && !hasDraft) { feed.replaceChildren(); posts.clear(); before = null; }
      for (const row of rows) {
        if (posts.has(row.id)) continue;
        // Keep open threads in place. A new Story (or a page between two loaded pages)
        // can arrive ahead of older posts that still contain a comment draft.
        const last = posts.get(feed.lastElementChild?.dataset.id);
        const next = last && last.seq < row.seq
          ? Array.from(feed.children).find(card => posts.get(card.dataset.id).seq < row.seq)
          : null;
        posts.set(row.id,row);
        feed.insertBefore(renderPost(row,urls.get(row.photo_path)),next);
      }
      if (rows.length) before = rows.at(-1).seq;
      if (!posts.size) feed.innerHTML = `<div class="community-empty">${icon('photos')}<h3>A primeira foto pode ser sua.</h3><p>Compartilhe um momento com a comunidade.</p></div>`;
      more.hidden = rows.length < 12;
      more.textContent = 'Ver mais fotos';
      pageAction = 'next';
    } catch (error) {
      status.textContent = errorText(error);
      more.hidden = false;
      more.textContent = 'Tentar carregar fotos';
      pageAction = first ? 'refresh' : 'next';
    } finally {
      reading = more.disabled = false;
      feed.setAttribute('aria-busy','false');
      if (refreshRequested) { refreshRequested = false; await loadFeed(true); }
    }
  }
  more.onclick = () => loadFeed(pageAction === 'refresh');
  instances.set(root,() => loadFeed(true));
  return loadFeed(true);
}
