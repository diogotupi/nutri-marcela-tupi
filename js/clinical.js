import { getSupabase } from './app-core.js';
import { getProfile } from './auth.js';

const db = () => getSupabase();
async function result(query) { const { data, error } = await query; if (error) throw error; return data; }
async function collectRows(build) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await result(build().range(offset, offset + 499));
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
export const listClinical = (patientId) => collectRows(() => db().from('clinical_records').select('*').eq('patient_id', patientId).order('occurred_at', { ascending: false }).order('id'));
export async function addClinical(patientId, kind, payload, options = {}) {
  const profile = await getProfile();
  return result(db().from('clinical_records').insert({ patient_id: patientId, kind, payload, created_by: profile.id, occurred_at: options.occurredAt || new Date().toISOString(), visibility: options.visibility || 'shared', status: options.status || 'submitted', parent_id: options.parentId || null, version: options.version || 1 }).select().single());
}
export const reviewClinical = (id) => result(db().from('clinical_records').update({ status: 'reviewed' }).eq('id', id).select().single());
export function listAppointments(patientId) { return collectRows(() => { const q = db().from('appointments').select('*').order('starts_at').order('id'); return patientId ? q.eq('patient_id', patientId) : q; }); }
export async function addAppointment(payload) { const p = await getProfile(); return result(db().from('appointments').insert({ ...payload, created_by: p.id }).select().single()); }
export function listTasks(patientId) { return collectRows(() => { const q = db().from('care_tasks').select('*').order('created_at', { ascending: false }).order('id'); return patientId ? q.eq('patient_id', patientId) : q; }); }
export async function addTask(payload) { const p = await getProfile(); return result(db().from('care_tasks').insert({ ...payload, created_by: p.id }).select().single()); }
export const updateTask = (id, changes) => result(db().from('care_tasks').update(changes).eq('id', id).select().single());
export async function getSignedAttachment(path) { const { data, error } = await db().storage.from('clinical-files').createSignedUrl(path, 120); if (error) throw error; return data.signedUrl; }
export async function uploadAttachment(patientId, file, payload = {}) {
  if (!file || file.size > 20 * 1024 * 1024) throw Error('Escolha um arquivo de até 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw Error('Use JPG, PNG, WebP ou PDF.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.type];
  const path = `${patientId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await db().storage.from('clinical-files').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  try { return await addClinical(patientId, 'attachment', { ...payload, path, filename: file.name, mime: file.type, bytes: file.size }, { occurredAt: payload.measured_at || new Date().toISOString(), visibility: payload.visibility || 'shared' }); }
  catch (error) { await db().storage.from('clinical-files').remove([path]); throw error; }
}
