// A deliberate choice: replacing removes the previous option; adding preserves both.
export function confirmAdditionalOption(markedCount=1) {
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.className='meal-option-dialog';
  dialog.setAttribute('aria-labelledby','meal-option-dialog-title');
  dialog.innerHTML=`<p class="patient-eyebrow">OPÇÕES DA REFEIÇÃO</p><h2 id="meal-option-dialog-title">Você já marcou ${markedCount>1?'mais de uma opção':'uma opção'} nessa refeição.</h2><p>Deseja marcar outra ou substituir?</p><div class="meal-option-dialog__actions"><button type="button" class="app-btn app-btn--primary" data-resolution="replace">${markedCount>1?'Substituir as anteriores':'Substituir a anterior'}</button><button type="button" class="app-btn app-btn--ghost" data-resolution="add">${markedCount>1?'Manter e marcar outra':'Marcar as duas'}</button></div><p class="meal-option-dialog__hint">Ao manter as opções, o registro mostrará que você comeu mais de uma. Substituir remove as marcações das outras opções desta refeição.</p><button type="button" class="meal-option-dialog__cancel" data-resolution="cancel" autofocus>Cancelar</button>`;
  document.body.append(dialog);
  let result=null;
  dialog.querySelectorAll('[data-resolution]').forEach(b=>b.onclick=()=>{result=b.dataset.resolution==='cancel'?null:b.dataset.resolution;dialog.close();});
  dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});
  dialog.showModal();
 });
}
