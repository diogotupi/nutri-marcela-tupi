// Preserve the prescribed text and quantities; never infer recipe portions.
export function preparationChoices(text='') {
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n');
 const starts=[];
 for(let i=0;i<lines.length;i++){const m=lines[i].trim().match(/^op[cç][aã]o\s+([\da-z]+)\s*:?[ \t]*$/i);if(m)starts.push({line:i,code:m[1]});}
 if(starts.length<2)return null;
 const choices=starts.map((start,i)=>{const body=lines.slice(start.line+1,starts[i+1]?.line??lines.length).map(s=>s.trim()).filter(Boolean);return {code:start.code,title:body[0]||'',notes:body.slice(1).join('\n')};});
 if(choices.some(c=>!c.title)||new Set(choices.map(c=>c.code.toLowerCase())).size!==choices.length)return null;
 return {intro:lines.slice(0,starts[0].line).join('\n').trim(),choices};
}
export function expandPreparationChoices(meal) {
 if(meal.options?.length!==1)return meal;
 const previous=meal.options[0],parsed=preparationChoices(previous.notes);
 if(!parsed)return meal;
 return {...meal,notes:[meal.notes,parsed.intro].filter(Boolean).join('\n'),shared_items:[...(meal.shared_items||[]),...(previous.items||[])],options:parsed.choices.map(c=>({name:`${meal.name} ${c.code}`,notes:c.notes,items:[{food_name:c.title,quantity:'',unit:'',notes:'',substitutions:''}]}))};
}
export function splitDietNotes(text='') {
 const value=String(text),match=/^Anexos do PDF\s*$/im.exec(value);
 return match?{general:value.slice(0,match.index).trim(),appendix:value.slice(match.index+match[0].length).trim()}:{general:value.trim(),appendix:''};
}
