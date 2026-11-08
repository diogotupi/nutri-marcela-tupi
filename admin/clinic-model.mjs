import {dateKey,subtractDays,datesInRange} from './metrics.mjs';
export {dateKey,subtractDays,datesInRange};
export const categoryNames={journey:'Journey',legacy:'Legacy',single:'Avulso'};
export function isPatientInactive(patient,today=dateKey()){
 return Boolean(patient.enrollment_id&&patient.ends_on&&patient.ends_on<=today);
}
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
export function auditSentence(r){
 const verb={insert:'cadastrou',update:'alterou',delete:'apagou',opened:'abriu a ficha de',login:'entrou no sistema'};
 const noun={patient_daily_habits:'um check de hábito',profiles:'o cadastro',crm_enrollments:'o acompanhamento',crm_contacts:'o contato de acompanhamento',clinical_records:'um registro clínico',patient_goals:'a meta de água',patient_messages:'uma mensagem no chat',patient_chat_reads:'a leitura do chat',staff_permissions:'o acesso da equipe',staff_tasks:'uma tarefa',appointments:'uma consulta',patient_badges:'uma conquista',patient_water_logs:'a hidratação',};
 if(r.action==='login')return `${r.actor_name} entrou no sistema`;
 if(r.source==='patient_messages'&&r.action==='insert')return `${r.actor_name} respondeu no chat${r.patient_name?' de '+r.patient_name:''}`;
 if(r.source==='crm_contacts'&&r.after_data?.status==='completed')return `${r.actor_name} concluiu o contato${r.patient_name?' com '+r.patient_name:''} previsto para ${r.after_data.due_on}`;
 return `${r.actor_name} ${verb[r.action]||r.action} ${r.action==='opened'?'':noun[r.source]||r.source}${r.patient_name?' · '+r.patient_name:''}`;
}
