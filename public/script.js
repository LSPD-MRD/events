(() => {
  const groups = { live: 'EN COURS', soon: 'À VENIR', archived: 'ARCHIVES' };
  const root = document.getElementById('events-root');
  const detail = document.getElementById('event-detail');
  const content = document.getElementById('event-content');
  let filter = localStorage.getItem('mrd-event-filter') || 'all';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  function renderPublications() {
    const items = Array.isArray(window.MRD_PUBLICATIONS) ? window.MRD_PUBLICATIONS : [];
    const card = p => '<article class="publication-card"><div class="publication-label">'+esc(kindLabels[p.kind]||'PUBLICATION MRD')+'</div><h3>'+esc(p.title)+'</h3>'+(p.date?'<div class="publication-date">'+esc(p.date)+'</div>':'')+(p.summary?'<p>'+esc(p.summary)+'</p>':'')+'<button type="button" class="publication-thumb publication-preview-trigger" data-preview="'+esc(p.id)+'" aria-label="Agrandir l’aperçu de '+esc(p.title)+'">'+(p.mime==='application/pdf'?'<span class="publication-pdf-thumb"><b>PDF</b><small>Cliquer pour agrandir</small></span>':'<img src="'+encodeURI(p.file)+'" alt="Aperçu de '+esc(p.title)+'" loading="lazy">')+'</button><div class="publication-actions"><a href="'+encodeURI(p.file)+'" target="_blank" rel="noopener">Ouvrir le document ↗</a></div></article>';
    const news=items.filter(p=>p.kind==='news'||p.kind==='comm-presse'), docs=items.filter(p=>p.kind!=='news'&&p.kind!=='comm-presse');
    document.getElementById('news-list').innerHTML=news.map(card).join('')||'<div class="empty-state">Aucune actualité publiée pour le moment.</div>';
    document.getElementById('documents-list').innerHTML=docs.map(card).join('')||'<div class="empty-state">Aucun document officiel publié pour le moment.</div>';
    const modal = document.getElementById('publication-preview-modal');
    if (modal) modal.remove();
    const shell = document.createElement('div');
    shell.id = 'publication-preview-modal';
    shell.className = 'publication-modal';
    shell.hidden = true;
    shell.setAttribute('role','dialog');
    shell.setAttribute('aria-modal','true');
    shell.setAttribute('aria-label','Aperçu de la publication');
    shell.innerHTML = '<div class="publication-modal-backdrop" data-preview-close></div><section class="publication-modal-panel"><header class="publication-modal-head"><div><span class="eyebrow">APERÇU DE LA PUBLICATION</span><h2 id="publication-modal-title"></h2></div><button type="button" class="publication-modal-close" aria-label="Fermer l’aperçu" data-preview-close><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header><div class="publication-modal-content" id="publication-modal-content"></div></section>';
    document.body.appendChild(shell);
    const closePreview = () => { shell.hidden = true; document.body.classList.remove('publication-modal-open'); document.getElementById('publication-modal-content').innerHTML=''; };
    shell.querySelectorAll('[data-preview-close]').forEach(el=>el.addEventListener('click',closePreview));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!shell.hidden)closePreview();});
    document.querySelectorAll('.publication-preview-trigger').forEach(button=>button.addEventListener('click',()=>{
      const pub=items.find(item=>String(item.id)===button.dataset.preview);
      if(!pub)return;
      document.getElementById('publication-modal-title').textContent=pub.title||'Publication';
      const url=encodeURI(pub.file);
      document.getElementById('publication-modal-content').innerHTML=pub.mime==='application/pdf'
        ? '<iframe class="publication-modal-pdf" title="'+esc(pub.title)+'" src="'+url+'#toolbar=0&navpanes=0"></iframe>'
        : '<img class="publication-modal-image" src="'+url+'" alt="'+esc(pub.title)+'">';
      shell.hidden=false; document.body.classList.add('publication-modal-open');
    }));
  }
  document.querySelectorAll('[data-space]').forEach(button=>button.addEventListener('click',()=>{
    const space=button.dataset.space; document.querySelectorAll('[data-space]').forEach(b=>b.classList.toggle('active',b===button));
    document.getElementById('space-events').hidden=space!=='events'; document.getElementById('space-news').hidden=space!=='news'; document.getElementById('space-documents').hidden=space!=='documents';
    document.getElementById('space-news').hidden=space!=='news'; document.getElementById('space-documents').hidden=space!=='documents';
    localStorage.setItem('mrd-portal-space',space); if(space!=='events' && location.hash.startsWith('#event/')) history.replaceState(null,'','#home');
  }));
  const savedSpace = ['events','news','documents'].includes(localStorage.getItem('mrd-portal-space')) ? localStorage.getItem('mrd-portal-space') : 'events';
  document.querySelectorAll('[data-space]').forEach(button=>{const active=button.dataset.space===savedSpace;button.classList.toggle('active',active);document.getElementById('space-'+(button.dataset.space==='events'?'events':button.dataset.space==='news'?'news':'documents')).hidden=!active;});
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
