import {expandPreparationChoices,normalizeMealOptions} from '../js/diet-content.mjs?v=20261031-options';
const clean=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const key=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const append=(object,field,text)=>{object[field]+=(object[field]?'\n':'')+text;};
const isTime=s=>/^\d{2}:\d{2}$/.test(s);
const isMetadata=s=>/^Marcela Tupinambá$/i.test(s)||/^CRN\s*-/i.test(s)||/^Acesse o app e veja o conte[uú]do completo da sua consulta\.?/i.test(s)||/^P[aá]gina\s+\d+\s*\/\s*\d+\s*\|/i.test(s);

export function parseWebdietPages(pages){
 const result={title:'Plano alimentar',notes:'',meals:[],warnings:[]};
 let meal=null,option=null,mode='',target=null,preamble=[],appendices=[];
 function useTitle(){
  const lines=preamble.filter(s=>!/^Planejamento alimentar$/i.test(s));
  if(lines.length&&result.title==='Plano alimentar')result.title=lines.shift();
  for(const line of lines)append(result,'notes',line);
  preamble=[];
 }
 function startMeal(heading,time){
  useTitle();target=null;
  if(key(heading)==='orientacoes'){meal=null;option=null;mode='global';return;}
  const match=heading.match(/^(.*?)\s+op[cç][aã]o\s+(.+)$/i),name=match?match[1]:heading;
  meal=match?result.meals.find(m=>key(m.name)===key(name)&&m.scheduled_time===time):null;
  if(!meal){meal={name,scheduled_time:time,notes:'',options:[]};result.meals.push(meal);}
  option={name:match?`${meal.name} ${match[2]}`:`${name} A`,notes:'',items:[]};
  meal.options.push(option);mode='food';
 }
 for(const page of pages){
  const lines=page.map(clean).flatMap(s=>{
   // Some exports place the clock to the right of the title, others on the next row.
   const m=s.match(/^(.*\S)\s+(\d{2}:\d{2})$/);
   return m?[m[1],m[2]]:[s];
  }).filter(s=>s&&!isMetadata(s));
  for(let n=0;n<lines.length;n++){
   const line=lines[n],timed=line.match(/^(\d{2}:\d{2})\s*[-–—]\s*(\S.*)$/);
   if(timed){startMeal(timed[2],timed[1]);continue;}
   if(n+1<lines.length&&isTime(lines[n+1])){startMeal(line,lines[++n]);continue;}
   if(/^Lista de (?:substitui[cç][aã]o|compras)$/i.test(line)||key(lines[n+1]||'')==='receita culinaria'){
    useTitle();mode='appendix';meal=null;option=null;target=null;
   }
   // Reference lists and recipes are kept in general notes, never as extra foods.
   if(mode==='appendix'){appendices.push(line);continue;}
   if(/^Observa[cç][oõ]es\s*:/i.test(line)){mode=option?'notes':'global';continue;}
   if(!option){if(mode==='global')append(result,'notes',line);else preamble.push(line);continue;}
   if(mode==='notes'){append(option,'notes',line);continue;}
   const sub=line.match(/^SUBSTITUA O\s+(.+?)\s+POR$/i);
   if(sub){
    target=option.items.find(i=>key(i.food_name)===key(sub[1]));mode='sub';
    if(!target){append(option,'notes',line);result.warnings.push(`Confira a substituição de ${sub[1]}.`);}
    continue;
   }
   if(/^(?:Ou\s+|Alternativa\s*:)/i.test(line)){
    target=option.items.at(-1);mode='sub';
    if(target)append(target,'substitutions',line);else{append(option,'notes',line);result.warnings.push(`Confira a alternativa em ${meal.name}.`);}
    continue;
   }
   const bullet=/^[•●▪]\s*/.test(line);
   if(bullet)mode='food';
   if(mode==='sub'){append(target||option,target?'substitutions':'notes',line);continue;}
   const body=line.replace(/^[•●▪]\s*/,'');
   let match=bullet?body.match(/^(.*?)\s+[-–—]\s+(.+)$/):null;
   match||=body.match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:g\b|ml\b|[a-zÀ-ÿ].*))$/i);
   if(!match&&n+1<lines.length&&/^\d/.test(lines[n+1]))match=[null,body,lines[++n]];
   if(match&&match[1]){
    option.items.push({food_name:match[1],quantity:match[2],unit:'',notes:'',substitutions:''});
   }else{
    append(option,'notes',line);result.warnings.push(`Texto a conferir em ${meal.name}: ${line}`);
   }
  }
  if(mode==='appendix')appendices.push('');
 }
 if(!result.meals.length)throw Error('Não reconheci refeições neste PDF. Use um PDF de texto do Webdiet ou monte a dieta manualmente.');
 if(appendices.length)result.notes+=(result.notes?'\n\n':'')+'Anexos do PDF\n'+appendices.join('\n').trim();
 result.meals=result.meals.map(expandPreparationChoices).map(normalizeMealOptions);
 return result;
}
export async function readWebdiet(file){
 if(!file||file.size>20*1024*1024||!(/\.pdf$/i.test(file.name)))throw Error('Selecione um PDF de até 20 MB.');
 const pdfjs=await import('/vendor/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});const doc=await task.promise;
 try{if(doc.numPages>100)throw Error('Use um PDF de até 100 páginas.');const pages=[];
 for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),text=await p.getTextContent(),rows=[];
  for(const t of text.items){if(!t.str?.trim())continue;const y=t.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<2);if(!row){row={y,items:[]};rows.push(row);}row.items.push(t);}
  pages.push(rows.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(x=>x.str).join(' ')));}
 return parseWebdietPages(pages);
 }finally{await task.destroy();}
}
