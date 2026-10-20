// Pure domain rules: all totals are derived from entries, never stored counters.
export const VERSION = 1;
export const MEALS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar', 'Bebidas', 'Outro evento ou refeição'];
export const DAY_STATES = ['Não iniciado', 'Parcialmente registrado', 'Registro concluído'];
export const copy = value => structuredClone(value);
export const uid = () => crypto.randomUUID();
export const fmt = value => value == null ? 'Sem meta' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);
export function number(value, allowZero = false) {
  if (value === '' || value == null || typeof value === 'boolean') throw Error('Informe um número válido.');
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0) || n > 1e7) throw Error('Informe um valor positivo e finito, dentro do limite de 10 milhões.');
  return n;
}
const text = (v, max = 300) => typeof v === 'string' && v.length <= max;
function assert(ok, message = 'Estrutura de dados inválida.') { if (!ok) throw Error(message); }
export function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200 && !isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
}
export function today(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(k => p.find(x => x.type === k).value).join('-');
}
export function shift(date, days) {
  assert(validDate(date), 'Data inválida.');
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
export function weekend(date = today()) {
  assert(validDate(date), 'Data inválida.');
  const day = weekday(date);
  return shift(date, day === 0 ? -1 : 6 - day);
}
export const dateLabel = date => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const defaults = name => ({ name, friday: false, fridayStart: '', fridayConfirmed: false, targets: { 5: null, 6: null, 0: null } });
export const emptyState = name => ({ version: VERSION, onboarded: false, settings: defaults(name), periods: [], entries: [], recipes: [], foods: [], favorites: [], recent: [] });
export function validateSettings(s) {
  assert(s && text(s.name, 80) && s.name.trim() && typeof s.friday === 'boolean' && typeof s.fridayConfirmed === 'boolean' && s.targets, 'Configuração inválida.');
  assert(s.fridayStart === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(s.fridayStart), 'Horário inválido.');
  [5, 6, 0].forEach(day => { if (s.targets[day] !== null) number(s.targets[day]); });
  assert(!s.friday || !s.fridayStart || s.targets[5] == null || s.fridayConfirmed, 'Confirme que a meta de sexta corresponde apenas ao intervalo acompanhado.');
  return s;
}
export function newPeriod(id, settings) {
  assert(validDate(id) && weekday(id) === 6, 'Selecione um final de semana válido.');
  validateSettings(settings);
  return { id, settings: copy(settings), dayStatus: {}, reflection: ['', '', ''], closed: false, pendingDecision: '' };
}
export function periodDays(p) { return p.settings.friday ? [shift(p.id, -1), p.id, shift(p.id, 1)] : [p.id, shift(p.id, 1)]; }
export function ensurePeriod(state, id) {
  let p = state.periods.find(x => x.id === id);
  if (!p) { p = newPeriod(id, state.settings); state.periods.push(p); }
  return p;
}
export function entryTotal(entry) { return entry.items.length ? entry.items.reduce((sum, item) => sum + itemPoints(item), 0) : number(entry.amount, true); }
export function itemPoints(item) {
  const q = number(item.quantity);
  const kcal = number(item.kcal, true);
  if (item.basis === 'portion') return kcal * q;
  assert(['g', 'ml'].includes(item.basis) && item.unit === item.basis, 'Não é possível converter ml em gramas.');
  return kcal * q / 100;
}
export function totals(p, entries, date = null) {
  const days = date ? [date] : periodDays(p);
  const targets = days.map(d => p.settings.targets[weekday(d)]);
  const budget = targets.every(t => t != null) ? targets.reduce((a, b) => a + b, 0) : null;
  const filtered = entries.filter(e => e.period === p.id && days.includes(e.date));
  const consumed = filtered.filter(e => e.status === 'consumed').reduce((s, e) => s + entryTotal(e), 0);
  const reserved = filtered.filter(e => e.status === 'planned').reduce((s, e) => s + entryTotal(e), 0);
  return { budget, consumed, reserved, balance: budget == null ? null : budget - consumed, available: budget == null ? null : budget - consumed - reserved, projection: consumed + reserved };
}
export function segments(t) {
  const denominator = Math.max(t.budget || 0, t.projection, 1);
  return [t.consumed, t.reserved, Math.max(0, (t.budget || 0) - t.projection)].map(n => Math.max(0, n / denominator * 100));
}
function validateItem(i) {
  assert(i && text(i.name) && i.name.trim() && text(i.source) && i.source && text(i.version) && i.version && text(i.preparation) && text(i.unit, 40), 'Alimento sem identificação de fonte ou unidade.');
  assert(['portion', 'g', 'ml'].includes(i.basis) && typeof i.estimated === 'boolean' && typeof i.illustrative === 'boolean');
  itemPoints(i);
}
export function validateEntry(e, p) {
  assert(e && text(e.id, 100) && e.id && e.period === p.id && periodDays(p).includes(e.date), 'A data precisa pertencer aos dias acompanhados do final de semana.');
  assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time), 'Informe o horário.');
  assert(!p.settings.friday || e.date !== shift(p.id, -1) || !p.settings.fridayStart || e.time >= p.settings.fridayStart, 'Esse horário é anterior ao início do acompanhamento de sexta-feira.');
  assert(text(e.name) && e.name.trim() && MEALS.includes(e.meal) && text(e.notes, 2000), 'Nome, refeição ou observação inválidos.');
  assert(['planned', 'consumed', 'cancelled'].includes(e.status) && typeof e.estimated === 'boolean' && text(e.source) && e.source, 'Tipo de registro inválido.');
  assert(Array.isArray(e.items) && e.items.length <= 100, 'Limite de 100 alimentos por refeição.');
  e.items.forEach(validateItem);
  if (!e.items.length) number(e.amount);
  number(entryTotal(e), true);
  if (e.originalReserved != null) number(e.originalReserved, true);
  if (e.planId != null) assert(text(e.planId, 100));
  return e;
}
export function putEntry(state, entry) {
  const next = copy(state), p = next.periods.find(x => x.id === entry.period);
  assert(p && !p.closed, 'Reabra o período antes de alterar os registros.');
  validateEntry(entry, p);
  const index = next.entries.findIndex(x => x.id === entry.id);
  if (index < 0) next.entries.push(copy(entry)); else next.entries[index] = copy(entry);
  if (p.dayStatus[entry.date] !== 'Registro concluído' && entry.status === 'consumed') p.dayStatus[entry.date] = 'Parcialmente registrado';
  return next;
}
export function consumePlan(state, planId, actual, remaining = null) {
  const plan = state.entries.find(e => e.id === planId);
  assert(plan?.status === 'planned', 'Esta reserva já foi processada. Atualize o painel.');
  const next = copy(state), p = next.periods.find(x => x.id === plan.period);
  assert(!p.closed, 'Reabra o período primeiro.');
  const originalReserved = plan.originalReserved ?? entryTotal(plan);
  const consumed = { ...copy(actual), id: uid(), period: plan.period, status: 'consumed', planId: plan.id, originalReserved };
  validateEntry(consumed, p);
  const index = next.entries.findIndex(x => x.id === planId);
  if (remaining !== null) {
    number(remaining);
    next.entries[index] = { ...plan, items: [], amount: remaining, estimated: true, source: 'estimativa', originalReserved };
  } else {
    // Keep the plan as an audit record, excluded from both consumption and reservations.
    next.entries[index] = { ...plan, status: 'cancelled', originalReserved };
  }
  next.entries.push(consumed);
  if (p.dayStatus[consumed.date] !== 'Registro concluído') p.dayStatus[consumed.date] = 'Parcialmente registrado';
  return next;
}
export function recipePoints(recipe, quantity, mode) {
  recipe.ingredients.forEach(validateItem);
  const total = recipe.ingredients.reduce((s, i) => s + itemPoints(i), 0);
  if (mode === 'g') return total * number(quantity) / number(recipe.finalWeight);
  assert(mode === 'portion', 'Unidade de receita inválida.');
  return total * number(quantity) / number(recipe.servings);
}
export function validateRecipe(r) {
  assert(r && text(r.id, 100) && r.id && text(r.name) && r.name.trim() && Array.isArray(r.ingredients) && r.ingredients.length > 0 && r.ingredients.length <= 100, 'Receita inválida.');
  r.ingredients.forEach(validateItem);
  assert(r.servings !== null || r.finalWeight !== null, 'Informe rendimento ou peso final pronto.');
  if (r.servings !== null) number(r.servings);
  if (r.finalWeight !== null) number(r.finalWeight);
}
export function validateFood(f) {
  assert(f && text(f.id, 100) && f.id && text(f.name) && f.name && text(f.preparation) && f.preparation && text(f.source) && f.source && text(f.version) && f.version, 'Alimento sem nome, preparo, fonte ou versão.');
  assert(['g', 'ml'].includes(f.basis) && typeof f.illustrative === 'boolean' && typeof f.estimated === 'boolean');
  number(f.kcal, true);
  assert(Array.isArray(f.aliases) && f.aliases.every(a => text(a)) && Array.isArray(f.measures));
  f.measures.forEach(m => { assert(text(m.name) && m.name && m.verified === true && text(m.source) && m.source && f.basis === 'g', 'Medida caseira exige fonte verificada em gramas.'); number(m.grams); });
}
export function importFoods(payload) {
  assert(payload?.schemaVersion === 1 && text(payload.source) && payload.source && text(payload.version) && payload.version && Array.isArray(payload.foods) && payload.foods.length > 0 && payload.foods.length <= 20000, 'Biblioteca inválida: fonte, versão e alimentos são obrigatórios.');
  const foods = payload.foods.map(f => ({ ...f, source: payload.source, version: payload.version }));
  foods.forEach(validateFood);
  assert(new Set(foods.map(f => f.id)).size === foods.length, 'Identificadores de alimentos duplicados.');
  return foods;
}
export function validateState(s) {
  assert(s?.version === VERSION && typeof s.onboarded === 'boolean', 'Backup incompatível: versão não suportada.');
  validateSettings(s.settings);
  ['periods', 'entries', 'recipes', 'foods', 'favorites', 'recent'].forEach(k => assert(Array.isArray(s[k]) && s[k].length <= 20000, 'Backup inválido ou muito grande.'));
  for (const k of ['periods', 'entries', 'recipes', 'foods']) assert(new Set(s[k].map(x => x.id)).size === s[k].length, 'Identificadores duplicados no backup.');
  s.periods.forEach(p => {
    assert(validDate(p.id) && weekday(p.id) === 6 && typeof p.closed === 'boolean' && p.dayStatus && Array.isArray(p.reflection) && p.reflection.length === 3 && p.reflection.every(x => text(x, 2000)) && ['', 'unconfirmed', 'cancelled', 'reviewed'].includes(p.pendingDecision));
    validateSettings(p.settings);
    Object.entries(p.dayStatus).forEach(([d, status]) => assert(periodDays(p).includes(d) && DAY_STATES.includes(status)));
  });
  s.entries.forEach(e => { const p = s.periods.find(p => p.id === e.period); assert(p, 'Registro sem período.'); validateEntry(e, p); });
  s.recipes.forEach(validateRecipe); s.foods.forEach(validateFood);
  assert(s.favorites.every(x => text(x, 100)) && s.recent.every(x => text(x, 100)));
  assert(JSON.stringify(s).length <= 5e6, 'O backup excede 5 MB.');
  return copy(s);
}
export function searchFoods(foods, query, favorites = [], recent = []) {
  const q = normalize(query);
  const score = f => (favorites.includes(f.id) ? 1000 : 0) + Math.max(0, 100 - recent.indexOf(f.id)) * (recent.includes(f.id) ? 1 : 0);
  return foods.filter(f => normalize([f.name, f.preparation, ...f.aliases].join(' ')).includes(q)).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'pt-BR'));
}
