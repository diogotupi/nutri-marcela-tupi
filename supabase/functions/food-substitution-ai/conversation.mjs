// The browser holds this signed context only in memory. Authenticating it keeps
// a confirmed label or a previous portion from being changed between requests.
const encoder=new TextEncoder(), decoder=new TextDecoder();
const pack=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unpack=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const signingKey=secret=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const signedBytes=payload=>encoder.encode('basiquito-context-v1.'+payload);

export async function readContext(token,patient,secret) {
  if (token==null) return [];
  if (typeof token!=='string'||token.length>90000) throw Error('Contexto inválido.');
  const [payload,signature,...extra]=token.split('.');
  if (extra.length||!payload||!signature||!await crypto.subtle.verify('HMAC',await signingKey(secret),unpack(signature),signedBytes(payload)))
    throw Error('Contexto inválido.');
  const ctx=JSON.parse(decoder.decode(unpack(payload)));
  if (ctx.patient!==patient||ctx.expires<Date.now()||!Array.isArray(ctx.turns)) throw Error('Contexto expirado.');
  return ctx.turns;
}
export async function nextContext(turns,patient,secret,message,answer) {
  // Only the current state needs quantities, label readings and clickable choices.
  const earlier=turns.slice(-11).map(({user_message,reply,intent})=>({user_message,reply,intent}));
  const current={user_message:message,reply:answer.reply,intent:answer.intent,state:answer.state,choices:answer.choices};
  const ctx={patient,expires:Date.now()+24*3600000,turns:[...earlier,current]};
  const payload=pack(encoder.encode(JSON.stringify(ctx)));
  const signature=await crypto.subtle.sign('HMAC',await signingKey(secret),signedBytes(payload));
  return payload+'.'+pack(new Uint8Array(signature));
}
