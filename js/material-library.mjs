import {getSupabase,escapeHtml as esc} from './app-core.js';

const limit=25*1024*1024, pageSize=30;
const states={draft:'Envio pendente',removing:'Remoção pendente'};
async function materialAction(id,action) {
  const {data,error}=await getSupabase().functions.invoke('patient-material',{body:{id,action}});
  if (error||data?.error) {
    let detail=data?.error;
    if (!detail && error?.context instanceof Response) {
      try {detail=(await error.context.json()).error;} catch { /* non-JSON network response */ }
    }
    throw Error(detail||'Não foi possível acessar o material. Tente novamente.');
  }
  return data;
}

export async function mountMaterialLibrary(root,{staff=false}={}) {
  if (!root) return;
  const db=getSupabase(), renderToken=Symbol();
  root.materialToken=renderToken;
  root.innerHTML=`${staff?`<section class="card"><h2>Adicionar material</h2>
    <form data-upload><label>Título do material<input type="text" maxlength="140" required></label>
    <p><label class="button secondary" tabindex="0" data-file-label>Escolher PDF<input type="file" accept=".pdf,application/pdf" class="sr-only"></label>
    <span data-file-name>Nenhum PDF selecionado · até 25 MB</span></p>
    <button type="submit">Publicar material</button></form><p data-upload-status role="status"></p></section>`:''}
    <section class="${staff?'card':'app-card patient-form'}"><div data-files></div><p data-list-status role="status"></p>
    <button type="button" class="secondary app-btn app-btn--ghost" data-more hidden>Ver mais materiais</button></section>`;
  const files=root.querySelector('[data-files]'), status=root.querySelector('[data-list-status]'), more=root.querySelector('[data-more]');
  let offset=0, listRun=0;
  async function load(reset=false) {
    const run=++listRun;
    if (reset) {offset=0;files.replaceChildren();}
    more.disabled=true;status.textContent='Carregando materiais…';
    try {
      let q=db.from('clinic_materials').select('id,title,state,created_at');
      if (!staff) q=q.eq('state','published');
      const {data,error}=await q.order('created_at',{ascending:false}).order('id').range(offset,offset+pageSize);
      if (error) throw error;
      if (root.materialToken!==renderToken||run!==listRun) return;
      const page=data.slice(0,pageSize);
      for (const file of page) {
        const row=document.createElement('article');
        row.className='material-file';row.dataset.id=file.id;row.dataset.title=file.title;
        row.innerHTML=`<div><strong>${esc(file.title)}</strong><small>PDF${states[file.state]?' · '+states[file.state]:''}</small></div>
          <div>${file.state==='published'?'<button class="button secondary app-btn app-btn--ghost" data-open>Abrir PDF</button>':''}
          ${staff&&file.state==='draft'?'<button class="secondary" data-publish>Concluir publicação</button><button class="text-button" data-resume>Retomar envio</button>':''}
          ${staff?'<button class="text-button danger" data-remove>Remover</button>':''}</div>`;
        files.append(row);
      }
      offset+=page.length;more.hidden=data.length<=pageSize;more.textContent='Ver mais materiais';
      status.textContent=offset?'':staff?'Nenhum material publicado.':'A equipe ainda não publicou materiais.';
    } catch {
      if (root.materialToken!==renderToken||run!==listRun) return;
      status.textContent='Não foi possível carregar os materiais.';more.hidden=false;more.textContent='Tentar novamente';
    } finally {if(run===listRun)more.disabled=false;}
  }
  const transition=(id,action)=>db.rpc('clinic_material_transition',{p_id:id,p_action:action});
  let resumed=null;
  files.onclick=async event=>{
    const button=event.target.closest('button'), row=button?.closest('[data-id]');
    if (!row||button.disabled) return;
    if (button.hasAttribute('data-remove')&&!confirm('Remover “'+row.dataset.title+'” da biblioteca dos pacientes?')) return;
    button.disabled=true;
    let popup;
    try {
      if (button.hasAttribute('data-open')) {
        popup=window.open('about:blank','_blank');
        if (popup) popup.opener=null;
        status.textContent='Abrindo PDF…';
        const {url}=await materialAction(row.dataset.id,'open');
        if (new URL(url).origin!==new URL(window.APP_CONFIG.supabaseUrl).origin) throw Error('Link inválido.');
        if (popup) popup.location.replace(url); else window.location.assign(url);
        status.textContent='';
      } else if (staff && button.hasAttribute('data-resume')) {
        resumed={id:row.dataset.id,title:row.dataset.title};
        const form=root.querySelector('[data-upload]');
        form.querySelector('[type=text]').value=resumed.title;
        form.querySelector('[type=file]').click();
      } else if (staff) {
        if (button.hasAttribute('data-publish')) {
          const {error}=await transition(row.dataset.id,'publish');
          if (error) throw Error('O PDF está pendente. Retome o envio ou remova este rascunho.');
        } else await materialAction(row.dataset.id,'remove');
        await load(true);
      }
    } catch(error) {popup?.close();status.textContent=error.message||'Tente novamente.';}
    finally {button.disabled=false;}
  };
  more.onclick=()=>load();
  if (staff) {
    const form=root.querySelector('[data-upload]'), title=form.querySelector('[type=text]'), picker=form.querySelector('[type=file]');
    const message=root.querySelector('[data-upload-status]'), submit=form.querySelector('[type=submit]');
    let operation=null;
    form.querySelector('[data-file-label]').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();picker.click();}};
    picker.onchange=()=>{
      const file=picker.files[0];operation=resumed?.id||null;resumed=null;
      form.querySelector('[data-file-name]').textContent=file?file.name:'Nenhum PDF selecionado · até 25 MB';
      if (file&&!title.value.trim()) title.value=file.name.replace(/\.pdf$/i,'').slice(0,140);
    };
    title.oninput=()=>{operation=null;resumed=null;};
    form.onsubmit=async event=>{
      event.preventDefault();if(submit.disabled)return;
      const pdf=picker.files[0], name=title.value.trim();
      if (!name||!pdf||!pdf.size||pdf.size>limit) {message.textContent='Informe o título e selecione um PDF de até 25 MB.';return;}
      submit.disabled=picker.disabled=title.disabled=true;
      try {
        if (!(await pdf.slice(0,5).text()).startsWith('%PDF-')) throw Error('Selecione um arquivo PDF válido.');
        operation??=crypto.randomUUID();
        message.textContent='Enviando PDF…';
        const row=await db.from('clinic_materials').insert({id:operation,title:name});
        if (row.error && row.error.code!=='23505') throw Error('Não foi possível iniciar o envio. Tente novamente.');
        // A draft can already contain the file if the previous upload response was lost.
        if (!row.error || (await transition(operation,'publish')).error) {
          const upload=await db.storage.from('patient-materials').upload(operation+'.pdf',pdf,{contentType:'application/pdf',cacheControl:'60',upsert:false});
          if (upload.error && !/duplicate|already exists/i.test(upload.error.message)) throw Error('Falha no envio. Mantenha o PDF selecionado e tente novamente.');
          const {error}=await transition(operation,'publish');
          if (error) throw Error('O envio ficou pendente. Tente concluir a publicação.');
        }
        operation=null;form.reset();form.querySelector('[data-file-name]').textContent='Nenhum PDF selecionado · até 25 MB';
        message.textContent='Material publicado para os pacientes.';
      } catch(error) {message.textContent=error.message;}
      finally {submit.disabled=picker.disabled=title.disabled=false;await load(true);}
    };
  }
  await load(true);
}
