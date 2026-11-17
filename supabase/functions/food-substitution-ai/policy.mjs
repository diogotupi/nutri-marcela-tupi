export const DEFAULT_MODEL='gpt-6.2-astra';
// Astra and newer Sol models require reasoning and room for reasoning tokens.
export function modelOptions(model,maxOutputTokens,effort='low'){
 const reasoningRequired=/^gpt-6(?:\.\d+)?-astra|^gpt-6\.(?:1|2)-sol/.test(model);
 return {...(model.startsWith('gpt-6')?{reasoning:{effort:reasoningRequired?effort:'none'}}:{}),max_output_tokens:reasoningRequired?Math.max(4096,maxOutputTokens):maxOutputTokens};
}
export const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
