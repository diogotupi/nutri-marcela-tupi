import {getLocalDateString} from '../js/app-core.js';
import {addClinical,uploadAttachment} from '../js/clinical.js';
import {preparePhotoUpload} from '../js/media-upload.js';

let active=null;
export function openMealPhotoPicker({patientId,mealId,onSent}){
 if(active?.busy)return;
 active?.dialog.close();
 const dialog=document.createElement('dialog');dialog.className='meal-photo-picker';dialog.setAttribute('aria-labelledby','meal-photo-title');
 dialog.innerHTML=`<header><div><p class="patient-eyebrow">FOTO DA REFEIÇÃO</p><h2 id="meal-photo-title">Como quer enviar?</h2></div><button type="button" class="photo-picker-close" aria-label="Fechar">×</button></header><div class="photo-source-actions"><button type="button" class="app-btn app-btn--ghost" data-photo-camera>▣ Tirar foto</button><button type="button" class="app-btn app-btn--primary" data-photo-gallery>↑ Escolher foto</button></div><input type="file" name="camera" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><input type="file" name="gallery" accept="image/jpeg,image/png,image/webp" hidden><section class="photo-picker-preview" hidden><img alt="Prévia da foto da refeição"><p data-photo-name></p><button type="button" class="app-btn app-btn--primary" data-photo-send>Enviar foto</button></section><p class="photo-share-note">Ao enviar, você compartilha esta foto de forma privada com a equipe da Marcela.</p><p role="status"></p>`;
 document.body.append(dialog);
 const state={dialog,busy:false,alive:true,file:null,url:null};active=state;
 const status=dialog.querySelector('[role=status]'),preview=dialog.querySelector('.photo-picker-preview'),send=dialog.querySelector('[data-photo-send]');
 const controls=()=>dialog.querySelectorAll('button,input');
 const disable=value=>{state.busy=value;controls().forEach(b=>b.disabled=value);};
 dialog.querySelector('.photo-picker-close').onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
 dialog.addEventListener('close',()=>{state.alive=false;if(state.url)URL.revokeObjectURL(state.url);if(active===state)active=null;dialog.remove();});
 dialog.querySelector('[data-photo-camera]').onclick=()=>dialog.querySelector('[name=camera]').click();
 dialog.querySelector('[data-photo-gallery]').onclick=()=>dialog.querySelector('[name=gallery]').click();
 for(const input of dialog.querySelectorAll('input[type=file]'))input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  disable(true);status.textContent='Preparando sua foto…';
  try{const prepared=await preparePhotoUpload(file);if(!state.alive)return;if(state.url)URL.revokeObjectURL(state.url);state.file=prepared;state.url=URL.createObjectURL(prepared);preview.querySelector('img').src=state.url;preview.querySelector('[data-photo-name]').textContent=file.name;preview.hidden=false;status.textContent='Confira a foto e toque em Enviar foto.';}
  catch(error){status.textContent=error.message;}
  finally{input.value='';disable(false);}
 };
 send.onclick=async()=>{
  if(state.busy||!state.file)return;disable(true);status.textContent='Enviando sua foto…';
  try{const day=getLocalDateString();await addClinical(patientId,'consent',{scope:'meal_photo',status:'accepted',policy_version:1});await uploadAttachment(patientId,state.file,{category:'meal',meal_id:mealId,date:day,measured_at:`${day}T12:00:00-03:00`});onSent?.();dialog.close();}
  catch(error){status.textContent=`Não foi enviada: ${error.message}`;}
  finally{disable(false);}
 };
 dialog.showModal();
}
