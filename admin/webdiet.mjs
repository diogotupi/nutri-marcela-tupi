const clean=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const key=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function parseWebdietPages(pages){
 const result={title:'Plano alimentar',notes:'',meals:[],warnings:[]};let meal=null,option=null,mode='',target=null;
 for(const page of pages){const lines=page.map(clean).flatMap(s=>{const m=s.match(/^(.*\S)\s+(\d{2}:\d{2})$/);return m?[m[1],m[2]]:[s];}).filter(s=>s&&!/^Marcela Tupinambá$/i.test(s)&&!/^CRN\s*-/i.test(s));
  let timeAt=lines.findIndex(s=>/^\d{2}:\d{2}$/.test(s));
  if(timeAt>=1){const heading=lines[timeAt-1];
   if(key(heading)==='orientacoes'){result.title=lines.slice(0,timeAt-1).join(' ')||result.title;mode='global';meal=null;option=null;}
   else {const m=heading.match(/^(.*?)\s+(?:opção|opcao)\s+(.+)$/i),name=m?m[1]:heading,time=lines[timeAt];
    meal=m?result.meals.find(x=>key(x.name)===key(name)&&x.scheduled_time===time):null;
    if(!meal){meal={name,scheduled_time:time,notes:'',options:[]};result.meals.push(meal);}
    option={name:m?`${name} ${m[2]}`:`${name} A`,notes:'',items:[]};meal.options.push(option);mode='food';
   }lines.splice(0,timeAt+1);
  }
  for(let n=0;n<lines.length;n++){const line=lines[n];
   if(/^Observações\s*:/i.test(line)){mode=meal?'notes':'global';continue;}
   const sub=line.match(/^SUBSTITUA O\s+(.+?)\s+POR$/i);
   if(sub&&option){target=option.items.find(i=>key(i.food_name)===key(sub[1]));mode='sub';if(!target)result.warnings.push(`Confira a substituição de ${sub[1]}.`);continue;}
   if(mode==='global'||!option){result.notes+=(result.notes?'\n':'')+line;continue;}
   if(mode==='notes'){option.notes+=(option.notes?'\n':'')+line;continue;}
   if(mode==='sub'){if(target)target.substitutions+=(target.substitutions?'\n':'')+line;else option.notes+=(option.notes?'\n':'')+line;continue;}
   let match=line.match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:g\b|ml\b|[a-zÀ-ÿ].*))$/i);
   if(!match&&n+1<lines.length&&/^\d/.test(lines[n+1]))match=[null,line,lines[++n]];
   if(match&&match[1])option.items.push({food_name:match[1],quantity:match[2],unit:'',notes:'',substitutions:''});
   else {option.notes+=(option.notes?'\n':'')+line;result.warnings.push(`Texto a conferir em ${meal.name}: ${line}`);}
  }
 }
 if(!result.meals.length)throw Error('Não reconheci refeições neste PDF. Use um PDF de texto do Webdiet ou monte a dieta manualmente.');
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
