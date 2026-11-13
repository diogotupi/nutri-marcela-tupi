import {escapeHtml, getSupabase, showToast} from '../js/app-core.js';

const pageSize = 12;
const stamp = new Intl.DateTimeFormat('pt-BR', {
  day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo'
});

export function mountPatientStars(root, patientId) {
  const db = getSupabase();
  const list = root.querySelector('ul');
  const count = root.querySelector('[data-star-total]');
  const older = root.querySelector('[data-older-stars]');
  const status = root.querySelector('[data-star-status]');
  let limit = pageSize, revision = 0, newestId, pendingRead = null, visibleList;
  const filter = query => query.eq('patient_id', patientId).like('source_key','activity-star:%');

  async function refresh() {
    const request = ++revision;
    const [page, unread] = await Promise.all([
      filter(db.from('care_notifications').select('id,body,created_at,read_at'))
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1),
      filter(db.from('care_notifications').select('id',{head:true,count:'exact'})).is('read_at',null),
    ]);
    if (request !== revision || pendingRead) return;
    if (page.error || unread.error) throw Error('Não foi possível carregar suas estrelinhas.');
    const rows = page.data.slice(0,limit);
    if (newestId !== undefined && rows[0] && rows[0].id !== newestId && !rows[0].read_at) showToast(rows[0].body);
    newestId = rows[0]?.id || null;
    root.hidden = !rows.length;
    if (!rows.length) return;
    count.hidden = !unread.count;
    count.textContent = unread.count===1 ? '1 nova' : unread.count+' novas';
    const markup = rows.map(row => `<li><p>${escapeHtml(row.body)}</p>
      <div><time datetime="${escapeHtml(row.created_at)}">${stamp.format(new Date(row.created_at))}</time>
      ${row.read_at ? '' : `<button type="button" data-read-star="${escapeHtml(row.id)}">Marcar como lida</button>`}</div></li>`).join('');
    if (markup !== visibleList) {
      list.innerHTML = markup;
      visibleList = markup;
    }
    older.hidden = page.data.length <= limit;
    status.textContent = '';
  }

  function update() {
    if (document.hidden) return;
    refresh().catch(() => { status.textContent = 'Não foi possível carregar suas estrelinhas. Tente novamente.'; });
  }
  older.onclick = () => { limit += pageSize; update(); };
  list.onclick = async event => {
    const button = event.target.closest('button[data-read-star]');
    if (!button || pendingRead) return;
    pendingRead = button.dataset.readStar;
    button.disabled = true;
    try {
      const {error} = await db.rpc('mark_notification_read',{p_id:pendingRead});
      if (error) throw error;
      pendingRead = null;
      await refresh();
      if (!button.isConnected) root.querySelector('summary').focus({preventScroll:true});
    } catch {
      status.textContent = 'Não foi possível confirmar a leitura. Tente novamente.';
    } finally { pendingRead = null; button.disabled = false; }
  };
  update();
  const timer = setInterval(update, 45000);
  document.addEventListener('visibilitychange',update);
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      clearInterval(timer);
      document.removeEventListener('visibilitychange',update);
    }
  });
}
