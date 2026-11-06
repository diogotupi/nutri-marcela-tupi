// Progressive enhancement: every value remains visible without animation.
const mounted=new WeakSet();
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function reveal(element) {
  element.classList.add('is-progress-visible');
  if(reduced())return;
  element.querySelectorAll('[data-progress-number]').forEach(number=>{
    const end=Number(number.dataset.progressNumber), digits=Number(number.dataset.digits||0);
    if(!Number.isFinite(end))return;
    const format=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits});
    const start=performance.now();
    const tick=now=>{
      if(!number.isConnected)return;
      const t=Math.min(1,(now-start)/800);
      number.textContent=format.format(end*(1-(1-t)**3));
      if(t<1&&!reduced())requestAnimationFrame(tick);
      else number.textContent=format.format(end);
    };
    requestAnimationFrame(tick);
  });
}

export function enhanceProgress(root) {
  let observer;
  const elements=[...root.querySelectorAll('[data-progress-reveal]')].filter(el=>!mounted.has(el));
  if(!reduced()&&'IntersectionObserver' in window) {
    observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){reveal(entry.target);observer.unobserve(entry.target);}});
    },{threshold:.12});
  }
  elements.forEach(element=>{
    mounted.add(element);
    if(observer){element.classList.add('is-progress-armed');observer.observe(element);}
    else reveal(element);
  });
  root.querySelectorAll('[data-progress-chart]').forEach(chart=>{
    if(chart.dataset.interactive)return;
    chart.dataset.interactive='true';
    const points=[...chart.querySelectorAll('[data-point]')],readout=chart.querySelector('.progress-readout');
    const choose=point=>{
      points.forEach(p=>{p.classList.toggle('is-active',p===point);p.setAttribute('tabindex',p===point?'0':'-1');});
      readout.textContent=point.dataset.detail;
      chart.classList.add('has-selection');
    };
    points.forEach((point,index)=>{
      point.addEventListener('pointerenter',()=>choose(point));
      point.addEventListener('focus',()=>choose(point));
      point.addEventListener('click',()=>choose(point));
      point.addEventListener('keydown',event=>{
        const offset={ArrowRight:1,ArrowLeft:-1,Home:-index,End:points.length-1-index}[event.key];
        if(offset!==undefined){event.preventDefault();points[Math.max(0,Math.min(points.length-1,index+offset))].focus();}
        else if(['Enter',' '].includes(event.key)){event.preventDefault();choose(point);}
      });
    });
  });
  // Call before replacing a view so offscreen charts do not retain observers.
  return ()=>observer?.disconnect();
}
