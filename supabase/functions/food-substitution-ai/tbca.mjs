const ROOT='https://tbca.net.br/base-dados/';
const decode=value=>String(value).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const plain=value=>decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const cells=row=>[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>m[1]);
export function parseTBCASearch(html){
 const found=[];
 for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const c=cells(row[1]),code=plain(c[0]||''),href=c[1]?.match(/href=['"]([^'"]+)['"]/i)?.[1];
  if(!/^BR[A-Z]\d{4}[A-Z]$/.test(code)||!href)continue;
  const url=new URL(decode(href),ROOT);if(url.hostname!=='tbca.net.br'||!url.pathname.startsWith('/base-dados/int_composicao_alimentos'))continue;
  found.push({id:code,name:plain(c[1]),category:plain(c[3]||'Leguminosas e derivados'),url:url.href});
 }
 return found;
}
export function parseTBCAEnergy(html,code){
 if(!plain(html).includes(code))throw Error('Referência de alimento divergente.');
 for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const c=cells(row[1]).map(plain);
  if(/^(?:Energia|Energy)$/i.test(c[0])&&c[1]==='kcal'){
   const value=Number(c[2]?.replace(',','.'));
   if(Number.isFinite(value)&&value>0&&value<=1000)return value;
  }
 }
 throw Error('Energia da porção não encontrada.');
}
async function page(fetchImpl,url,options={}){
 const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Consulta de alimentos indisponível.');
 const text=await r.text();if(text.length>2000000)throw Error('Resposta de alimentos inválida.');return text;
}
export async function searchTBCA(query,fetchImpl=fetch){
 const html=await page(fetchImpl,ROOT+'composicao_alimentos_calculaveis.php',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({guarda:'tomo1',produto:query,cmb_grupo:'',cmb_tipo_alimento:''}).toString()});
 return parseTBCASearch(html);
}
export async function readTBCA(candidate,fetchImpl=fetch){
 const html=await page(fetchImpl,candidate.url);
 return {...candidate,kcal_per_100g:parseTBCAEnergy(html,candidate.id),reference_source:'tbca',reference_code:candidate.id,reference_url:candidate.url};
}
