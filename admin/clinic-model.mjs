import {dateKey,subtractDays,datesInRange} from './metrics.mjs';
export {dateKey,subtractDays,datesInRange};
export const categoryNames={journey:'Journey',legacy:'Legacy',single:'Avulso'};
export function patientState(p,today=dateKey()){
 if(p.enrollment_status==='active'&&p.ends_on<=today)return 'expired';
 if(!p.enrollment_id||p.enrollment_status==='closed'||p.starts_on>today)return 'neutral';
 if(p.pending_on&&p.pending_on<today)return 'late';
 if(p.pending_on===today)return 'due';return 'ok';
}
export const stateNames={expired:'Período vencido',late:'Contato atrasado',due:'Contato hoje',ok:'Em dia',neutral:'Sem acompanhamento atual'};
export function calendarRange(anchor,mode){
 const d=new Date(anchor+'T12:00:00Z');
 if(mode==='month')d.setUTCDate(1);
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 const start=d.toISOString().slice(0,10);
 return {start,end:subtractDays(start,-(mode==='month'?41:6))};
}
export function contactState(c,e,today=dateKey()){
 if(e.status==='active'&&e.ends_on<=today)return 'expired';
 if(c.status==='completed')return 'ok';
 return c.due_on<today?'late':'due';
}
export function mealEntries({reports=[],checks=[],items=[],records=[]},start,end){
 const map=new Map(),ensure=(date,id,name)=>{const key=date+':'+id;if(!map.has(key))map.set(key,{key,date,id,name:name||'Refeição',items:[],photos:[],difficulties:[]});return map.get(key);};
 for(const r of reports)Object.assign(ensure(r.report_date,r.meal_id,r.diet_meals?.name),{status:r.status,comment:r.comment});
 for(const r of checks){const x=ensure(r.check_date,r.meal_id,r.diet_meals?.name);x.status||='done';}
 for(const r of items)ensure(r.check_date,r.diet_items?.meal_id,r.diet_items?.diet_meals?.name).items.push(r);
 for(const r of records){const p=r.payload||{},date=p.date||dateKey(new Date(r.occurred_at));if(!p.meal_id)continue;const x=ensure(date,p.meal_id);
 if(p.category==='meal')x.photos.push(r);if(p.category==='meal_difficulty')x.difficulties.push(r);}
 for(const entry of map.values())entry.extraOptions=new Set(entry.items.filter(i=>i.diet_items).map(i=>i.diet_items.option_name??null)).size>1;
 return [...map.values()].filter(r=>r.id&&r.date>=start&&r.date<=end).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
}
export function auditSentence(r){
 const verb={insert:'cadastrou',update:'alterou',delete:'apagou',opened:'abriu a ficha de',login:'entrou no sistema'};
 const noun={profiles:'o cadastro',crm_enrollments:'o acompanhamento',crm_contacts:'o contato de acompanhamento',clinical_records:'um registro clínico',patient_goals:'a meta de água',diets:'o plano alimentar',diet_meals:'uma refeição da dieta',diet_items:'um alimento da dieta',patient_messages:'uma mensagem no chat',patient_chat_reads:'a leitura do chat',staff_permissions:'o acesso da equipe',staff_tasks:'uma tarefa',appointments:'uma consulta',patient_badges:'uma conquista',patient_water_logs:'a hidratação',meal_reports:'um relato de refeição',patient_item_checks:'um alimento registrado',patient_meal_checks:'uma refeição registrada'};
 if(r.action==='login')return `${r.actor_name} entrou no sistema`;
 if(r.source==='patient_messages'&&r.action==='insert')return `${r.actor_name} respondeu no chat${r.patient_name?' de '+r.patient_name:''}`;
 if(r.source==='crm_contacts'&&r.after_data?.status==='completed')return `${r.actor_name} concluiu o contato${r.patient_name?' com '+r.patient_name:''} previsto para ${r.after_data.due_on}`;
 return `${r.actor_name} ${verb[r.action]||r.action} ${r.action==='opened'?'':noun[r.source]||r.source}${r.patient_name?' · '+r.patient_name:''}`;
}
