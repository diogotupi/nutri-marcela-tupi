import { emptyState, validateState } from './model.mjs';

// A single version-checked row makes plan -> consumption one atomic transaction.
// No patient records are cached in localStorage on shared devices.
export function cloudStore(client, userId, name, readOnly = false) {
  let revision = null;
  return {
    isSynced: true,
    async approvals() {
      const { data, error } = await client.from('bank_target_requests').select('id, period, snapshot, status, requested_at, reviewed_at').eq('user_id', userId).order('requested_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async requestTargets(period) {
      if (readOnly) throw Error('Somente o paciente pode solicitar validação.');
      const { error } = await client.rpc('request_bank_targets', { p_period: period });
      if (error) throw error;
    },
    async reviewTargets(requestId, approve) {
      if (!readOnly) throw Error('Validação exclusiva da nutricionista.');
      const { error } = await client.rpc('review_bank_targets', { p_request: requestId, p_approve: approve });
      if (error) throw error;
    },
    async load() {
      const { data, error } = await client.from('weekend_banks').select('payload, revision, updated_at').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      revision = data?.revision ?? null;
      return data ? validateState(data.payload) : emptyState(name);
    },
    async save(value) {
      if (readOnly) throw Error('Acompanhamento em modo de leitura.');
      const payload = validateState(value);
      const table = client.from('weekend_banks');
      const query = revision === null
        ? table.insert({ user_id: userId, payload })
        : table.update({ payload }).eq('user_id', userId).eq('revision', revision);
      const { data, error } = await query.select('revision').maybeSingle();
      if (error || !data) {
        if (!data && (!error || error.code === '23505')) throw Error('Os dados mudaram em outro dispositivo. Feche este formulário, toque em Atualizar e refaça a alteração. Nada foi sobrescrito.');
        throw Error('Não foi possível sincronizar. Sua alteração não foi salva; mantenha este formulário aberto e tente novamente. ' + (error?.message || ''));
      }
      revision = data.revision;
    },
  };
}
