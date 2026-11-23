const storageKey='basiquito-launcher-position-v1';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export function makeBasiquitoDraggable(launcher) {
  let position=null, gesture=null, suppressClick=false, frame=0;
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if (saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)) {
      position={x:clamp(saved.x,0,1),y:clamp(saved.y,0,1)};
    }
  } catch { /* Moving the launcher also works without browser storage. */ }

  function bounds() {
    const viewport=window.visualViewport;
    const left=viewport?.offsetLeft||0, top=viewport?.offsetTop||0;
    const width=viewport?.width||document.documentElement.clientWidth;
    const height=viewport?.height||window.innerHeight;
    const rect=launcher.getBoundingClientRect(), style=getComputedStyle(launcher);
    const inset=edge=>Math.max(8,parseFloat(style.getPropertyValue('--basiquito-safe-'+edge))||0);
    const minX=left+inset('left'), minY=top+inset('top');
    let bottom=top+height-inset('bottom');
    const nav=document.getElementById('dashboard-nav');
    if (nav&&getComputedStyle(nav).position==='fixed') {
      const navRect=nav.getBoundingClientRect();
      if (navRect.height&&navRect.top>=minY+rect.height+8&&navRect.top<bottom) bottom=navRect.top-8;
    }
    return {minX,minY,maxX:Math.max(minX,left+width-inset('right')-rect.width),maxY:Math.max(minY,bottom-rect.height)};
  }

  function move(left,top,limits=bounds()) {
    launcher.style.left=clamp(left,limits.minX,limits.maxX)+'px';
    launcher.style.top=clamp(top,limits.minY,limits.maxY)+'px';
    launcher.style.right='auto';
    launcher.style.bottom='auto';
  }

  function place() {
    frame=0;
    if (gesture) return;
    if (position) {
      const limits=bounds();
      move(limits.minX+position.x*(limits.maxX-limits.minX),limits.minY+position.y*(limits.maxY-limits.minY),limits);
    } else {
      for (const prop of ['left','top','right','bottom']) launcher.style.removeProperty(prop);
      const rect=launcher.getBoundingClientRect(), limits=bounds();
      if (rect.left<limits.minX||rect.left>limits.maxX||rect.top<limits.minY||rect.top>limits.maxY) move(rect.left,rect.top,limits);
    }
  }

  function save() {
    const rect=launcher.getBoundingClientRect(), limits=bounds();
    position={
      x:clamp((rect.left-limits.minX)/(limits.maxX-limits.minX||1),0,1),
      y:clamp((rect.top-limits.minY)/(limits.maxY-limits.minY||1),0,1)
    };
    try { localStorage.setItem(storageKey,JSON.stringify(position)); } catch { /* Keep it for this page. */ }
  }

  function finish(cancelled=false) {
    if (!gesture) return;
    const previous=gesture;
    gesture=null;
    launcher.classList.remove('is-dragging');
    if (launcher.hasPointerCapture(previous.id)) launcher.releasePointerCapture(previous.id);
    if (previous.moved&&!cancelled) save();
    // Virtual keyboard/rotation changes never overwrite the preferred position.
    place();
  }

  launcher.addEventListener('pointerdown',event=>{
    if (gesture||event.isPrimary===false||event.button!==0) return;
    const rect=launcher.getBoundingClientRect();
    suppressClick=false;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false,limits:bounds()};
  });
  window.addEventListener('pointermove',event=>{
    if (!gesture||gesture.id!==event.pointerId) return;
    const dx=event.clientX-gesture.x, dy=event.clientY-gesture.y;
    if (!gesture.moved&&Math.hypot(dx,dy)<7) return;
    // Leave taps on the avatar's original target so mobile browsers still emit
    // their native click. Capture only once this gesture has become a drag.
    if (!gesture.moved) launcher.setPointerCapture(event.pointerId);
    gesture.moved=true;
    suppressClick=true;
    launcher.classList.add('is-dragging');
    move(gesture.left+dx,gesture.top+dy,gesture.limits);
  });
  window.addEventListener('pointerup',event=>{
    if (gesture?.id===event.pointerId) finish();
  });
  window.addEventListener('pointercancel',event=>{
    if (gesture?.id===event.pointerId) finish(true);
  });
  launcher.addEventListener('lostpointercapture',event=>{
    if (event.target===launcher&&gesture?.id===event.pointerId) finish(true);
  });
  launcher.addEventListener('click',event=>{
    // The browser dispatches a click after pointerup, including a completed drag.
    // Keyboard/assistive activation has detail=0 and must still open the chat.
    if (suppressClick&&(event.detail!==0||event.pointerType)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick=false;
    }
  },true);
  launcher.addEventListener('dragstart',event=>event.preventDefault());
  launcher.addEventListener('contextmenu',event=>event.preventDefault());
  launcher.addEventListener('keydown',event=>{
    if (event.key==='Home') {
      event.preventDefault();
      finish(true);
      position=null;
      try { localStorage.removeItem(storageKey); } catch { /* Optional preference only. */ }
      place();
    } else if (event.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault();
      finish(true);
      const rect=launcher.getBoundingClientRect(), step=event.shiftKey?40:16;
      move(rect.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),rect.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));
      save();
    }
  });

  function resized() {
    finish(true);
    if (!frame) frame=requestAnimationFrame(place);
  }
  window.addEventListener('blur',()=>finish(true));
  window.addEventListener('resize',resized);
  window.visualViewport?.addEventListener('resize',resized);
  window.visualViewport?.addEventListener('scroll',resized);
  const observer=new ResizeObserver(resized);
  observer.observe(launcher);
  const nav=document.getElementById('dashboard-nav');
  if (nav) observer.observe(nav);
  place();
}
