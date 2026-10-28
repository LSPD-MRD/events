(() => {
  const groups = { live: 'EN COURS', soon: 'À VENIR', archived: 'ARCHIVES' };
  const root = document.getElementById('events-root');
  const detail = document.getElementById('event-detail');
  const content = document.getElementById('event-content');
  let filter = localStorage.getItem('mrd-event-filter') || 'all';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatPublicationDate = value => {
    if (!value) return '';
    const raw = String(value).trim();
    let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
    let date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]))) : null;
    if (!date) {
      match = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
      if (match) { let year=Number(match[3]); if(year<100) year+=2000; date=new Date(Date.UTC(year,Number(match[2])-1,Number(match[1]))); }
    }
    if (!date || Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('fr-FR', {weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
  };
  function render() {
    root.innerHTML = '';
    const fallbackEvents = [
      { status:'soon', href:'cache-cache/', icon:'🔦', title:'HIDE & SEEK MRPD', desc:'Cache-cache en 3 rounds dans la nouvelle Vespucci Police Station.' },
      { status:'soon', href:'escape-game/', icon:'🤫', title:'CODE SILENCE', desc:'Escape game immersif au commissariat : retrouver Tuna et démasquer le responsable.' },
      { status:'soon', href:'marathon/', icon:'🏃', title:'MARATHON', desc:'Défi d’endurance organisé par la Media Relations Division. Informations détaillées à venir.' },
      { status:'soon', href:'open-house/', icon:'🎉', title:'OPEN HOUSE', desc:'Portes ouvertes multi-divisions avec mini-jeux, démonstrations et système de points.' },
      { status:'archived', href:'soiree-a-points/', icon:'💯', title:'SOIRÉE À POINTS', desc:'Shift du soir avec système de points et classement des participants.' },
      { status:'archived', href:'concert/', icon:'🎤', title:'FREDDY JOHNS’ LIVE', desc:'Mini-concert karaoké surprise, sans inscription. Rendez-vous au briefing.', date:'Vendredi 12/06/26' }
    ];
    const loaded = typeof EVENTS !== 'undefined' && Array.isArray(EVENTS) ? EVENTS : (Array.isArray(window.EVENTS) ? window.EVENTS : []);
    const data = loaded.length ? loaded : fallbackEvents;
    const visible = data.filter(e => filter === 'all' || e.status === filter);
    ['live','soon','archived'].forEach(status => {
      const items = visible.filter(e => e.status === status); if (!items.length) return;
      const section = document.createElement('section'); section.className = 'event-group';
      section.innerHTML = `<div class="group-label"><span></span>${groups[status]}<small>${items.length.toString().padStart(2,'0')} ENTRÉE(S)</small></div><div class="event-grid-inner"></div>`;
      const grid = section.querySelector('.event-grid-inner');
      items.forEach((ev) => {
        const card = document.createElement('button'); card.type='button'; card.className=`event-card status-${status}`;
        card.innerHTML = `<span class="event-card-icon">${esc(ev.icon || '✦')}</span><span class="event-card-main"><span class="event-status">${groups[status]}</span><strong>${esc(ev.title || 'Événement MRD')}</strong><span class="event-desc">${esc(ev.desc || 'Informations à venir.')}</span>${ev.date ? `<span class="event-date">◷ ${esc(ev.date)}</span>` : ''}</span><span class="event-arrow">↗</span>`;
        card.addEventListener('click', () => openEvent(ev)); grid.appendChild(card);
      }); root.appendChild(section);
    });
    if (!visible.length) root.innerHTML = '<div class="empty-state">Aucun événement dans cette catégorie.</div>';
  }
  function openEvent(ev, updateHistory = true) {
    if (!content || !detail || !root || !ev) return;
    const slug = String(ev.href || '').split('/').filter(Boolean).join('/');
    const eventContent = window.EVENT_CONTENT || (typeof EVENT_CONTENT !== 'undefined' ? EVENT_CONTENT : {});
    let html = eventContent[slug];
    if (!html) {
      const key = Object.keys(eventContent).find(k => k.toLowerCase() === slug.toLowerCase());
      if (key) html = eventContent[key];
    }
    if (!html && ev.content) html = ev.content;
    content.innerHTML = html || `<article class="detail-fallback"><span class="eyebrow">${esc(groups[ev.status] || 'ÉVÉNEMENT')}</span><h2>${esc(ev.title || 'Événement MRD')}</h2><p>${esc(ev.desc || 'Les informations détaillées seront publiées prochainement.')}</p>${ev.date ? `<p class="event-date">◷ ${esc(ev.date)}</p>` : ''}<p class="wip-note">La fiche détaillée complète sera ajoutée prochainement.</p></article>`;
    // Les anciennes fiches utilisaient un observer d'animation absent du portail actuel.
    // Retirer la classe "reveal" empêche leurs sections de rester à opacity: 0.
    content.querySelectorAll('.reveal').forEach(el => {
      el.classList.remove('reveal');
      el.classList.add('visible');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('transform', 'none', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
    });
    content.style.setProperty('display', 'block', 'important');
    content.style.setProperty('visibility', 'visible', 'important');
    root.hidden = true;
    const sectionHead = document.querySelector('.section-head');
    if (sectionHead) sectionHead.hidden = true;
    detail.hidden = false;
    document.body.classList.add('event-view');
    if (updateHistory) history.pushState({ mrdEventView: true }, '', '#event/' + encodeURIComponent(slug || ev.title || 'event'));
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showPortal() { detail.hidden=true; root.hidden=false; document.body.classList.remove('event-view'); const head=document.querySelector('.section-head'); if(head) head.hidden=false; window.scrollTo({top:0,behavior:'smooth'}); }
  function closeEvent() {
    if (location.hash.startsWith('#event/') && history.state?.mrdEventView) { history.back(); return; }
    showPortal();
    if (location.hash.startsWith('#event/')) history.replaceState(null, '', '#home');
  }
  window.addEventListener('popstate', () => {
    if (location.hash.startsWith('#event/')) {
      const slug = decodeURIComponent(location.hash.slice(7));
      const eventList = typeof EVENTS !== 'undefined' && Array.isArray(EVENTS) ? EVENTS : (window.EVENTS || []);
      const ev = eventList.find(x => String(x.href || '').replace(/^\/+|\/+$/g, '') === slug);
      if (ev) openEvent(ev, false);
    } else if (!detail.hidden) {
      showPortal();
    }
  });
  const backButton = document.getElementById('back-events');
  backButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6M9 12h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Retour aux événements</span>';
  backButton.setAttribute('aria-label', 'Retour aux événements');
  backButton.addEventListener('click', closeEvent);
  document.getElementById('filters').addEventListener('click', e => { const b=e.target.closest('[data-filter]'); if(!b)return; filter=b.dataset.filter; localStorage.setItem('mrd-event-filter',filter); document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b)); render(); });
  const kindLabels = { news:'MEDIA RELATIONS', 'compte-rendu':'INTERAGENCY', 'comm-interne':'INTERAGENCY', 'comm-presse':'PUBLIC INFORMATION · PIO' };
  const categoryDefaults = {
    order: ['events','documents','news'], visible: { events: true, news: false, documents: true },
    categories: [
      { id:'events', name:'Événements', type:'events', description:'Fiches et cartes des événements' },
      { id:'news', name:'News & actualités', type:'publications', description:'Actualités et communiqués' },
      { id:'documents', name:'Communication interne', type:'publications', description:'Documents et communications officielles' }
    ]
  };
  const rawPortalSettings = window.MRD_PORTAL_SETTINGS && typeof window.MRD_PORTAL_SETTINGS === 'object' ? window.MRD_PORTAL_SETTINGS : categoryDefaults;
  const builtInCategories = categoryDefaults.categories;
  const incomingCategories = Array.isArray(rawPortalSettings.categories) ? rawPortalSettings.categories : builtInCategories;
  const categories = incomingCategories.filter(c => c && typeof c.id==='string' && typeof c.name==='string' && c.name.trim() &&
    (['events','news','documents'].includes(c.id) || /^custom-[a-z0-9-]{1,64}$/.test(c.id)) &&
    (c.id==='events' ? c.type==='events' : c.type==='publications'))
    .map(c => ({ id:c.id, name:c.name.trim().slice(0,48), type:c.id==='events'?'events':'publications', description:String(c.description||'').trim().slice(0,100) }));
  if (!Array.isArray(rawPortalSettings.categories)) builtInCategories.forEach(c => { if(!categories.some(item=>item.id===c.id)) categories.push({...c}); });
  const categoryIds = categories.map(c=>c.id);
  const orderFromSettings = Array.isArray(rawPortalSettings.order) ? rawPortalSettings.order : [];
  const portalSettings = {
    categories,
    order: [...orderFromSettings.filter((id,i,all)=>categoryIds.includes(id)&&all.indexOf(id)===i), ...categoryIds.filter(id=>!orderFromSettings.includes(id))],
    visible: Object.fromEntries(categories.map(c=>[c.id,typeof rawPortalSettings.visible?.[c.id]==='boolean' ? rawPortalSettings.visible[c.id] : c.id!=='news']))
  };
  const tabsRoot = document.querySelector('.portal-tabs');
  const contentRoot = document.querySelector('.content-wrap');
  const spaces = { events:document.getElementById('space-events'), news:document.getElementById('space-news'), documents:document.getElementById('space-documents') };
  const defaultDescriptions = { events:'Fiches et cartes des événements', news:'Actualités et communiqués', documents:'Documents et communications officielles' };
  const tabsFragment = document.createDocumentFragment();
  const orderedSpaces = document.createDocumentFragment();
  portalSettings.order.map(id => categories.find(category => category.id === id)).filter(Boolean).forEach(category => {
    let button = document.querySelector('[data-space="'+category.id+'"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'portal-tab'; button.dataset.space = category.id; button.setAttribute('role','tab');
    }
    button.textContent = category.name;
    button.hidden = !portalSettings.visible[category.id];
    tabsFragment.appendChild(button);
    let space = spaces[category.id];
    if (!space) {
      space = document.createElement('section');
      space.id = 'space-' + category.id; space.className = 'publication-space'; space.hidden = true;
      space.innerHTML = '<div class="section-head"><div><span class="eyebrow"></span><h2></h2></div></div><div class="publication-grid"></div>';
      spaces[category.id] = space;
    }
    const heading = space.querySelector('.section-head h2'), eyebrow = space.querySelector('.section-head .eyebrow');
    if (heading) heading.textContent = category.name;
    if (eyebrow) eyebrow.textContent = (category.description || defaultDescriptions[category.id] || 'Publications de la division').toLocaleUpperCase('fr');
    space.hidden = true; orderedSpaces.appendChild(space);
  });
  tabsRoot.replaceChildren(tabsFragment);
  contentRoot.appendChild(orderedSpaces);
  function renderPublications() {
    const items = Array.isArray(window.MRD_PUBLICATIONS) ? window.MRD_PUBLICATIONS : [];
    const customIds = categories.filter(c=>c.id.startsWith('custom-')).map(c=>c.id);
    const publicationCards = (pubs, category) => pubs.map(p => {
      const label = customIds.includes(p.kind) ? category.name.toLocaleUpperCase('fr') : (kindLabels[p.kind] || category.name.toLocaleUpperCase('fr'));
      return '<article class="publication-card"><div class="publication-card-top"><div class="publication-label">'+esc(label)+'</div>'+(p.date?'<span class="publication-date-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17"/></svg><span>'+esc(formatPublicationDate(p.date))+'</span></span>':'')+'</div><h3>'+esc(p.title)+'</h3>'+(p.summary?'<p>'+esc(p.summary)+'</p>':'')+'<button type="button" class="publication-thumb publication-preview-trigger" data-preview="'+esc(p.id)+'" aria-label="Agrandir l’aperçu de '+esc(p.title)+'">'+(p.mime==='application/pdf'?'<span class="publication-pdf-thumb"><b>PDF</b><small>Cliquer pour agrandir</small></span>':'<img src="'+encodeURI(p.file)+'" alt="Aperçu de '+esc(p.title)+'" loading="lazy">')+'</button><div class="publication-actions"><a href="'+encodeURI(p.file)+'" target="_blank" rel="noopener">Ouvrir le document ↗</a></div></article>';
    }).join('');
    categories.filter(c=>c.type==='publications').forEach(category => {
      let pubs;
      if (category.id === 'news') pubs = items.filter(p=>p.kind==='news'||p.kind==='comm-presse');
      else if (category.id === 'documents') pubs = items.filter(p=>p.kind==='comm-interne'||p.kind==='compte-rendu');
      else pubs = items.filter(p=>p.kind===category.id);
      const grid = spaces[category.id]?.querySelector('.publication-grid');
      if (grid) grid.innerHTML = publicationCards(pubs,category) || '<div class="empty-state">Aucune publication dans cette catégorie pour le moment.</div>';
    });
    const prior = document.getElementById('publication-preview-modal'); if (prior) prior.remove();
    const shell = document.createElement('div');
    shell.id = 'publication-preview-modal'; shell.className = 'publication-modal'; shell.hidden = true;
    shell.setAttribute('role','dialog'); shell.setAttribute('aria-modal','true'); shell.setAttribute('aria-label','Aperçu de la publication');
    shell.innerHTML = '<div class="publication-modal-backdrop" data-preview-close></div><section class="publication-modal-panel"><header class="publication-modal-head"><div><span class="eyebrow">APERÇU DE LA PUBLICATION</span><h2 id="publication-modal-title"></h2></div><button type="button" class="publication-modal-close" aria-label="Fermer l’aperçu" data-preview-close><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header><div class="publication-modal-content" id="publication-modal-content"></div></section>';
    document.body.appendChild(shell);
    const closePreview = () => { shell.hidden = true; document.body.classList.remove('publication-modal-open'); document.getElementById('publication-modal-content').innerHTML=''; };
    shell.querySelectorAll('[data-preview-close]').forEach(el=>el.addEventListener('click',closePreview));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!shell.hidden)closePreview();});
    document.querySelectorAll('.publication-preview-trigger').forEach(button=>button.addEventListener('click',()=>{
      const pub=items.find(item=>String(item.id)===button.dataset.preview); if(!pub)return;
      document.getElementById('publication-modal-title').textContent=pub.title||'Publication';
      const url=encodeURI(pub.file);
      document.getElementById('publication-modal-content').innerHTML=pub.mime==='application/pdf'
        ? '<iframe class="publication-modal-pdf" title="'+esc(pub.title)+'" src="'+url+'#toolbar=0&navpanes=0"></iframe>'
        : '<img class="publication-modal-image" src="'+url+'" alt="'+esc(pub.title)+'">';
      shell.hidden=false; document.body.classList.add('publication-modal-open');
    }));
  }
  const savedSpaceInitial = localStorage.getItem('mrd-portal-space');
  let savedSpace = categoryIds.includes(savedSpaceInitial) && portalSettings.visible[savedSpaceInitial]
    ? savedSpaceInitial : (portalSettings.order.find(id=>portalSettings.visible[id]) || categories[0]?.id || 'events');
  function activateSpace(space, remember=true) {
    if (!portalSettings.visible[space]) space = portalSettings.order.find(id=>portalSettings.visible[id]) || categories[0]?.id || 'events';
    document.querySelectorAll('[data-space]').forEach(button=>{ button.classList.toggle('active',button.dataset.space===space); button.setAttribute('aria-selected',String(button.dataset.space===space)); });
    categoryIds.forEach(id=>{ if(spaces[id]) spaces[id].hidden = id!==space || !portalSettings.visible[id]; });
    if (remember) localStorage.setItem('mrd-portal-space',space);
    if(space!=='events' && location.hash.startsWith('#event/')) history.replaceState(null,'','#home');
  }
  document.querySelectorAll('[data-space]').forEach(button=>button.addEventListener('click',()=>activateSpace(button.dataset.space)));
  activateSpace(savedSpace, false);
  document.querySelectorAll('[data-filter]').forEach(button=>button.classList.toggle('active',button.dataset.filter===filter));
  renderPublications();
  const theme = document.getElementById('theme-toggle');
  function setTheme(v) { document.documentElement.dataset.theme=v; theme.textContent=v==='light'?'☀':'☾'; localStorage.setItem('mrd-theme',v); }
  setTheme(localStorage.getItem('mrd-theme') || 'dark'); theme.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
  if (location.hash.startsWith('#event/')) {
    const slug = decodeURIComponent(location.hash.slice(7));
    const eventList = typeof EVENTS !== 'undefined' && Array.isArray(EVENTS) ? EVENTS : (window.EVENTS || []);
    const ev = eventList.find(x => String(x.href || '').replace(/^\/+|\/+$/g, '') === slug);
    if (ev) openEvent(ev, false); else render();
  } else render();
})();
