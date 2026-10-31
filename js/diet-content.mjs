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
 const originalItems=[...(meal.shared_items||[]),...(previous.items||[])];
 return normalizeMealOptions({...meal,notes:[meal.notes,parsed.intro].filter(Boolean).join('\n'),shared_items:[],options:[...(originalItems.length?[{...previous,notes:'',items:originalItems}]:[]),...parsed.choices.map(c=>({notes:c.notes,items:[{food_name:c.title,quantity:'',unit:'',notes:'',substitutions:''}]}))]});
}
// Legacy ungrouped foods are their own first option, never ingredients shared by every recipe.
// Keep the original item IDs so existing patient checks remain attached to the same foods.
export function mealOptionsFromRows(meal) {
 const items=(meal.diet_items||[]).filter(i=>i.food_name);
 const options=[];
 const ungrouped=items.filter(i=>!i.option_name);
 if(ungrouped.length)options.push({name:null,notes:ungrouped.length===items.length&&meal.options?.length===1?meal.options[0].notes||'':'',items:ungrouped});
 for(const o of meal.options||[]){const group=items.filter(i=>i.option_name===o.name);if(group.length||!items.length)options.push({...o,items:group});}
 // Preserve historical rows even when their option metadata is missing.
 for(const item of items){if(item.option_name&&!options.some(o=>o.name===item.option_name))options.push({name:item.option_name,notes:'',items:items.filter(i=>i.option_name===item.option_name)});}
 return options.map((o,index)=>({...o,label:`Opção ${index+1}`}));
}
export function normalizeMealOptions(meal) {
 const options=[...(meal.shared_items?.length?[{notes:'',items:meal.shared_items}]:[]),...(meal.options||[])];
 if(!options.length)options.push({notes:'',items:meal.items||[]});
 const {shared_items,items,...rest}=meal;
 return {...rest,options:options.map((o,index)=>({...o,name:`Opção ${index+1}`}))};
}
export function selectedMealOptions(meal,itemIds) {
 return mealOptionsFromRows(meal).filter(o=>o.items.some(i=>itemIds.has(i.id)));
}
export function splitDietNotes(text='') {
 const value=String(text),match=/^Anexos do PDF\s*$/im.exec(value);
 return match?{general:value.slice(0,match.index).trim(),appendix:value.slice(match.index+match[0].length).trim()}:{general:value.trim(),appendix:''};
}
