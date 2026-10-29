// LX Music Web v0.4.11 — mobile-only interaction shell.
// The business logic stays in app.js. This module only moves navigation
// into an accessible drawer and keeps channel choices behind one disclosure.
const root=document.documentElement;
const navRail=document.querySelector('.nav-rail');
const nav=document.querySelector('.main-nav');
const header=document.querySelector('.topbar-inner');
const toolbar=document.querySelector('#search-song-view>.sub-toolbar');
const channels=document.getElementById('channel-list');
const mobile=matchMedia('(max-width:740px)');

if(navRail&&nav&&header&&toolbar&&channels){
  // A fixed drawer inside the main layout can be clipped by the layout's
  // stacking/scroll context. Portal the existing nav to <body> on phones.
  // The comment anchor restores the *same nodes* on desktop, so no duplicate
  // navigation handlers or persistent scroll offset are introduced.
  const navDock=document.createComment('mobile-navigation-dock');
  navRail.parentNode.insertBefore(navDock,navRail);
  const placeDrawer=()=>{
    if(mobile.matches){
      if(navRail.parentNode!==document.body)document.body.appendChild(navRail);
    }else if(navRail.parentNode!==navDock.parentNode){
      navDock.parentNode.insertBefore(navRail,navDock.nextSibling);
    }
  };
  placeDrawer();

  const menu=document.createElement('button');
  menu.type='button';menu.className='mobile-menu-button';
  menu.setAttribute('aria-label','打开主导航');
  menu.setAttribute('aria-controls','mobile-navigation');
  menu.setAttribute('aria-expanded','false');
  menu.textContent='☰';
  navRail.id='mobile-navigation';

  const drawerHeading=document.createElement('div');
  drawerHeading.className='mobile-drawer-heading';
  const drawerName=document.createElement('strong');
  drawerName.textContent='LX Music';
  const drawerClose=document.createElement('button');
  drawerClose.type='button';drawerClose.className='mobile-drawer-close';
  drawerClose.setAttribute('aria-label','关闭主导航');
  drawerClose.textContent='×';
  drawerHeading.append(drawerName,drawerClose);
  navRail.prepend(drawerHeading);

  const title=document.createElement('span');
  title.className='mobile-page-title';
  title.setAttribute('aria-live','polite');
  title.textContent='搜索';
  header.prepend(title);
  header.prepend(menu);

  const shade=document.createElement('button');
  shade.type='button';shade.className='mobile-menu-shade';
  shade.setAttribute('aria-label','关闭导航菜单');
  shade.hidden=true;
  document.body.appendChild(shade);

  const sourceButton=document.createElement('button');
  sourceButton.type='button';
  sourceButton.className='mobile-channel-toggle';
  sourceButton.setAttribute('aria-controls','channel-list');
  sourceButton.setAttribute('aria-expanded','false');
  sourceButton.textContent='搜索平台 ▾';
  toolbar.insertBefore(sourceButton,channels);
  const channelsDock=document.createComment('mobile-channel-dock');
  toolbar.insertBefore(channelsDock,channels);

  let drawerOpen=false;
  let pickerOpen=false;

  const refreshActive=()=>{
    const active=nav.querySelector('.nav-item.active');
    const display=active?.querySelector('span:last-child')?.textContent?.trim();
    if(display)title.textContent=display;
    menu.setAttribute('aria-label','打开主导航，当前：'+(display||'搜索'));
  };
  const refreshSource=()=>{
    const active=channels.querySelector('.channel-button.active');
    const display=active?.textContent?.trim()||'网易云音乐';
    sourceButton.textContent=display+'  ▾';
  };
  const setDrawer=(opened,restoreFocus=false)=>{
    drawerOpen=Boolean(opened&&mobile.matches);
    root.classList.toggle('mobile-nav-open',drawerOpen);
    shade.hidden=!drawerOpen;
    navRail.inert=mobile.matches&&!drawerOpen;
    menu.setAttribute('aria-expanded',String(drawerOpen));
    document.body.classList.toggle('mobile-menu-locked',drawerOpen);
    if(drawerOpen)nav.querySelector('.nav-item.active')?.focus({preventScroll:true});
    else if(restoreFocus)menu.focus({preventScroll:true});
  };
  const setPicker=(opened)=>{
    pickerOpen=Boolean(opened&&mobile.matches);
    toolbar.classList.toggle('channel-picker-open',pickerOpen);
    sourceButton.setAttribute('aria-expanded',String(pickerOpen));
    if(pickerOpen){
      // Popover is portaled above the sticky search/player layers, never
      // clipped by the song-list grid or a scroll/animation stacking context.
      if(channels.parentElement!==document.body)document.body.appendChild(channels);
      channels.classList.add('mobile-channel-popover');
      const rect=sourceButton.getBoundingClientRect();
      const roomBelow=innerHeight-rect.bottom;
      const openHeight=176;
      const top=roomBelow<openHeight&&rect.top>openHeight?
        Math.max(8,rect.top-openHeight-7):Math.min(innerHeight-50,rect.bottom+7);
      channels.style.setProperty('--picker-top',Math.round(top)+'px');
      channels.style.setProperty('--picker-left',Math.max(8,Math.round(rect.left))+'px');
      channels.style.setProperty('--picker-width',Math.min(innerWidth-16,Math.max(210,rect.width+148))+'px');
    }else{
      channels.classList.remove('mobile-channel-popover');
      channels.style.removeProperty('--picker-top');
      channels.style.removeProperty('--picker-left');
      channels.style.removeProperty('--picker-width');
      if(channels.parentNode!==toolbar)toolbar.insertBefore(channels,channelsDock.nextSibling);
    }
  };
  menu.addEventListener('click',()=>setDrawer(!drawerOpen));
  shade.addEventListener('click',()=>setDrawer(false,true));
  drawerClose.addEventListener('click',()=>setDrawer(false,true));
  nav.addEventListener('click',ev=>{
    if(ev.target.closest('.nav-item')){setDrawer(false);setPicker(false);}
  });
  sourceButton.addEventListener('click',()=>setPicker(!pickerOpen));
  channels.addEventListener('click',ev=>{
    if(ev.target.closest('.channel-button')){
      setPicker(false);
      refreshSource();
    }
  });
  document.addEventListener('click',ev=>{
    if(pickerOpen&&!toolbar.contains(ev.target)&&!channels.contains(ev.target))setPicker(false);
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){
      if(drawerOpen){ev.preventDefault();setDrawer(false,true);}
      else if(pickerOpen){ev.preventDefault();setPicker(false);sourceButton.focus();}
    }
  });
  nav.addEventListener('keydown',ev=>{
    if(!drawerOpen||ev.key!=='Tab')return;
    const links=[...nav.querySelectorAll('.nav-item:not([hidden])')];
    if(!links.length)return;
    if(ev.shiftKey&&document.activeElement===links[0]){
      ev.preventDefault();links[links.length-1].focus();
    }else if(!ev.shiftKey&&document.activeElement===links[links.length-1]){
      ev.preventDefault();links[0].focus();
    }
  });
  new MutationObserver(refreshActive).observe(nav,{
    attributes:true,subtree:true,attributeFilter:['class']
  });
  new MutationObserver(refreshSource).observe(channels,{
    attributes:true,subtree:true,childList:true,characterData:true,
    attributeFilter:['class']
  });
  window.addEventListener('scroll',()=>{if(pickerOpen)setPicker(false);},{passive:true});
  mobile.addEventListener('change',()=>{
    setDrawer(false);
    placeDrawer();
    setPicker(false);
    navRail.inert=mobile.matches;
    refreshActive();
  });
  refreshActive();
  refreshSource();
  navRail.inert=mobile.matches;
  root.classList.add('mobile-shell-ready');
}
