import {getLocalDateString} from '../js/app-core.js';

let selectedDate=getLocalDateString(), locks=0, followsToday=true, navigatorRoot;
export const getRecordDate=()=>selectedDate;
export const formatRecordDate=date=>new Date(date+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC'});
const shifted=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);

function render() {
  if (!navigatorRoot) return;
  const today=getLocalDateString(), input=navigatorRoot.querySelector('input');
  input.value=selectedDate; input.max=today;
  for (const control of navigatorRoot.querySelectorAll('input,button')) control.disabled=locks>0;
  navigatorRoot.querySelector('[data-next-day]').disabled=locks>0||selectedDate>=today;
  navigatorRoot.querySelector('[data-record-today]').hidden=selectedDate===today;
  navigatorRoot.querySelector('[role=status]').textContent=selectedDate===today
    ? 'Registre o que fez hoje. Para completar outro dia, escolha a data.'
    : 'Você está atualizando os registros de '+formatRecordDate(selectedDate)+'.';
  navigatorRoot.classList.toggle('is-past-day',selectedDate!==today);
}

export function setRecordDate(date) {
  const today=getLocalDateString();
  if (locks||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||shifted(date,0)!==date||date>today) {
    render(); return false;
  }
  followsToday=date===today;
  if (date===selectedDate) {render();return true;}
  const previous=selectedDate;
  selectedDate=date;
  render();
  dispatchEvent(new CustomEvent('patient:date-changed',{detail:{date,previous}}));
  return true;
}

export function lockRecordDate() {
  let released=false;
  locks++; render();
  dispatchEvent(new CustomEvent('patient:date-lock',{detail:{locked:true}}));
  return ()=>{
    if (released) return;
    released=true;locks--;render();
    dispatchEvent(new CustomEvent('patient:date-lock',{detail:{locked:locks>0}}));
  };
}

export function mountRecordDate(root) {
  navigatorRoot=root;
  const input=root.querySelector('input');
  input.onchange=()=>setRecordDate(input.value);
  root.querySelector('[data-previous-day]').onclick=()=>setRecordDate(shifted(selectedDate,-1));
  root.querySelector('[data-next-day]').onclick=()=>setRecordDate(shifted(selectedDate,1));
  root.querySelector('[data-record-today]').onclick=()=>setRecordDate(getLocalDateString());
  const refresh=()=>{
    if (document.hidden) return;
    if (followsToday&&!locks&&selectedDate!==getLocalDateString()) setRecordDate(getLocalDateString());
    else render();
  };
  addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,60000);
  render();
}
