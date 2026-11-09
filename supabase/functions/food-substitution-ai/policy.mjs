export const DEFAULT_MODEL='gpt-6.1-sol';
// Sol 6.1 requires reasoning; Luna still supports none for explicit overrides.
export function modelOptions(model,maxOutputTokens){
 const sol=model.startsWith('gpt-6.1-sol');
 return {...(model.startsWith('gpt-6')?{reasoning:{effort:sol?'low':'none'}}:{}),max_output_tokens:sol?Math.max(4096,maxOutputTokens):maxOutputTokens};
}
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
