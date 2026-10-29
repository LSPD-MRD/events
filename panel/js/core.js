const WORKER_URL = 'https://mrd-panel-test.biscuitytb2102.workers.dev';
const KEY = { draft: 'mrdpanel-draft', access: 'mrdpanel-config', theme: 'mrd-theme', token: 'mrdpanel-session', avatar: 'mrdpanel-profile-avatar', activeTab: 'mrdpanel-active-tab' };
const PAGE_LABELS = { edit: 'Événement', publications: 'Publications', portal: 'Portail', logs: 'Logs', access: 'Accès', profile: 'Mon compte', effectif: 'Division' };
const ACCREDITATION_META = {
  'Media Relations': { className: 'accred-media' },
  'Interagency': { className: 'accred-interagency' },
  'Public Information': { className: 'accred-public-info' },
  'Community Affairs': { className: 'accred-community' }
};
const ACCREDITATIONS_BY_GRADE = {
  'Commanding Officer': Object.keys(ACCREDITATION_META),
  'Assistant Commanding Officer': Object.keys(ACCREDITATION_META),
  'Expert Officer': ['Media Relations', 'Community Affairs', 'Interagency'],
  'Certified Officer': ['Media Relations', 'Community Affairs']
};
const accreditationTags = (items = []) => (Array.isArray(items) ? items : []).map(name => {
  const meta = ACCREDITATION_META[name];
  return meta ? '<span class="accreditation-tag ' + meta.className + '">' + esc(name) + '</span>' : '';
}).join('');
let currentUser = null;
let pendingProfileAvatar;
let profileAvatarChanged = false;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
 
/* ── MRD custom select: consistent dropdowns across the entire panel ── */
const mrdSelectClose = () => {
  document.querySelectorAll('.mrd-select-menu:not([hidden])').forEach(menu => {
    menu.hidden = true;
    const trigger = document.querySelector('[aria-controls="' + menu.id + '"]');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
};
let mrdSelectId = 0;
const mrdEnhanceSelect = select => {
  if (!(select instanceof HTMLSelectElement) || select.dataset.mrdSelectEnhanced === 'true' || select.multiple || select.size > 1) return;
  select.dataset.mrdSelectEnhanced = 'true';
  const wrapper = document.createElement('div');
  wrapper.className = 'mrd-select-control';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);
  select.classList.add('mrd-select-native');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mrd-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="mrd-select-value"></span><svg class="mrd-select-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4 4.5-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const menu = document.createElement('div');
  menu.className = 'mrd-select-menu';
  menu.id = 'mrd-select-menu-' + (++mrdSelectId);
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');
  trigger.setAttribute('aria-controls', menu.id);
  const value = trigger.querySelector('.mrd-select-value');
  const refresh = () => {
    const selected = select.options[select.selectedIndex];
    value.textContent = selected ? selected.textContent.trim() : 'Sélectionner…';
    trigger.disabled = select.disabled;
    trigger.classList.toggle('is-placeholder', !selected || selected.value === '');
    menu.replaceChildren();
    [...select.options].forEach((option, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mrd-select-option' + (option.selected ? ' is-selected' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', option.selected ? 'true' : 'false');
      item.disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
      item.textContent = option.textContent.trim();
      item.addEventListener('click', () => {
        if (item.disabled) return;
        select.selectedIndex = index;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus({ preventScroll: true });
      });
      menu.append(item);
    });
  };
  const position = () => {
    const r = trigger.getBoundingClientRect();
    const maxH = Math.min(280, window.innerHeight - 24);
    const below = window.innerHeight - r.bottom - 12;
    const top = below < Math.min(180, maxH) && r.top > below ? Math.max(12, r.top - Math.min(maxH, r.top - 12)) : r.bottom + 6;
    menu.style.left = Math.max(12, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 12)) + 'px';
    menu.style.top = top + 'px';
    menu.style.width = Math.min(Math.max(r.width, 180), window.innerWidth - 24) + 'px';
    menu.style.maxHeight = maxH + 'px';
  };
  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    const opening = menu.hidden;
    mrdSelectClose();
    if (!opening) return;
    refresh();
    document.body.append(menu);
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    const selected = menu.querySelector('.is-selected:not(:disabled)') || menu.querySelector('.mrd-select-option:not(:disabled)');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (menu.hidden) trigger.click();
      else (menu.querySelector('.is-selected') || menu.querySelector('.mrd-select-option:not(:disabled)'))?.focus();
    } else if (event.key === 'Escape') {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
  select.addEventListener('change', refresh);
  wrapper.append(trigger);
  document.body.append(menu);
  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'value', 'selected'] });
  select._mrdSelectRefresh = refresh;
};
const mrdEnhanceSelects = root => {
  if (root instanceof HTMLSelectElement) mrdEnhanceSelect(root);
  root.querySelectorAll?.('select').forEach(mrdEnhanceSelect);
};
document.addEventListener('click', event => {
  if (!event.target.closest('.mrd-select-control') && !event.target.closest('.mrd-select-menu')) mrdSelectClose();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') mrdSelectClose(); });
window.addEventListener('resize', () => document.querySelectorAll('.mrd-select-menu:not([hidden])').forEach(menu => {
  const trigger = document.querySelector('[aria-controls="' + menu.id + '"]');
  if (trigger) { const r = trigger.getBoundingClientRect(); menu.style.left = Math.max(12, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 12)) + 'px'; menu.style.top = r.bottom + 6 + 'px'; }
}));
const mrdSelectObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === 1 && !node.matches?.('.mrd-select-menu')) mrdEnhanceSelects(node);
})));
mrdSelectObserver.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('DOMContentLoaded', () => mrdEnhanceSelects(document));
mrdEnhanceSelects(document);


/* ── MRD custom date picker: consistent across every panel form ── */
const mrdDateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const mrdMonthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const mrdDateUTC = value => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d ? date : null;
};
const mrdISODate = date => date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
const mrdDateText = value => { const d=mrdDateUTC(value); return d ? mrdDateFmt.format(d) : 'Choisir une date'; };
const mrdDateToday = () => {
  const now = new Date();
  return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
};
const mrdDateMarkup = input => {
  const wrapper=document.createElement('div');
  wrapper.className='mrd-date-control';
  input.classList.add('mrd-date-native');
  input.setAttribute('aria-hidden','true');
  input.tabIndex=-1;
  input.dataset.originalRequired=input.required?'true':'false';
  input.required=false;
  input.insertAdjacentElement('beforebegin',wrapper);
  wrapper.append(input);
  const trigger=document.createElement('button');
  trigger.type='button';
  trigger.className='mrd-date-trigger'+(input.value?' has-value':'');
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label',input.getAttribute('aria-label')||input.closest('label')?.childNodes[0]?.textContent?.trim()||'Choisir une date');
  trigger.innerHTML='<span class="mrd-date-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m8 14 2 2 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="mrd-date-copy"><small></small><strong></strong></span><span class="mrd-date-chevron" aria-hidden="true">⌄</span>';
  const label=trigger.querySelector('.mrd-date-copy small');
  const value=trigger.querySelector('.mrd-date-copy strong');
  if(!label||!value){wrapper.replaceWith(input);return;}
  label.textContent=input.getAttribute('aria-label')||'DATE';
  value.textContent=mrdDateText(input.value);
  const popup=document.createElement('div');
  popup.className='mrd-date-popover';
  popup.hidden=true;
  popup.setAttribute('role','dialog');
  popup.setAttribute('aria-label','Calendrier de sélection');
  wrapper.append(trigger);
  document.body.append(popup);
  const positionPopup=()=>{if(popup.hidden)return;const r=trigger.getBoundingClientRect(),w=Math.min(272,window.innerWidth-24),h=Math.min(360,window.innerHeight-24);const left=Math.max(12,Math.min(r.left,window.innerWidth-w-12));const top=Math.max(12,Math.min(r.bottom+5,window.innerHeight-h-12));popup.style.left=left+'px';popup.style.top=top+'px';popup.style.width=w+'px';};
  const render=()=>{
    const picked=mrdDateUTC(input.value);
    let month=mrdDateUTC((popup.dataset.month||'')+'-01')||picked||mrdDateUTC(mrdDateToday().slice(0,7)+'-01');
    const y=month.getUTCFullYear(),m=month.getUTCMonth();
    const first=new Date(Date.UTC(y,m,1));
    const offset=(first.getUTCDay()+6)%7;
    const days=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    const min=mrdDateUTC(input.min),max=mrdDateUTC(input.max),today=mrdDateToday();
    const cells=[];
    for(let i=0;i<42;i++){
      const n=i-offset+1;
      if(n<1||n>days){cells.push('<span class="mrd-date-blank" aria-hidden="true"></span>');continue;}
      const date=new Date(Date.UTC(y,m,n)),iso=mrdISODate(date);
      const disabled=(min&&date<min)||(max&&date>max);
      const classes=['mrd-date-day'];
      if(iso===input.value)classes.push('is-selected');
      if(iso===today)classes.push('is-today');
      cells.push('<button type="button" class="'+classes.join(' ')+'" data-mrd-date="'+iso+'" '+(disabled?'disabled':'')+' aria-label="'+mrdDateFmt.format(date)+'" '+(iso===input.value?'aria-pressed="true"':'aria-pressed="false"')+'>'+n+'</button>');
    }
    popup.dataset.month=y+'-'+String(m+1).padStart(2,'0');
    popup.innerHTML='<div class="mrd-date-pop-head"><button type="button" class="mrd-date-nav" data-mrd-date-action="prev" aria-label="Mois précédent">‹</button><div><strong>'+mrdMonthFmt.format(first)+'</strong><small>SÉLECTIONNER UNE DATE</small></div><button type="button" class="mrd-date-nav" data-mrd-date-action="next" aria-label="Mois suivant">›</button></div><div class="mrd-date-year-row"><button type="button" class="mrd-date-year-nav" data-mrd-date-action="prev-year" aria-label="Année précédente">−</button><span>ANNÉE <strong>'+y+'</strong></span><button type="button" class="mrd-date-year-nav" data-mrd-date-action="next-year" aria-label="Année suivante">+</button></div><div class="mrd-date-weekdays"><span>LUN</span><span>MAR</span><span>MER</span><span>JEU</span><span>VEN</span><span>SAM</span><span>DIM</span></div><div class="mrd-date-grid">'+cells.join('')+'</div><div class="mrd-date-pop-foot"><button type="button" class="mrd-date-today" data-mrd-date-action="today">Aujourd’hui</button><button type="button" class="mrd-date-clear" data-mrd-date-action="clear">Effacer</button></div>';
    const prev=popup.querySelector('[data-mrd-date-action="prev"]');
    const next=popup.querySelector('[data-mrd-date-action="next"]');
    const prevYear=popup.querySelector('[data-mrd-date-action="prev-year"]');
    const nextYear=popup.querySelector('[data-mrd-date-action="next-year"]');
    if(min&&new Date(Date.UTC(y,m-1,1))<new Date(Date.UTC(min.getUTCFullYear(),min.getUTCMonth(),1)))prev.disabled=true;
    if(max&&new Date(Date.UTC(y,m+1,1))>new Date(Date.UTC(max.getUTCFullYear(),max.getUTCMonth(),1)))next.disabled=true;
    if(min&&y<=min.getUTCFullYear())prevYear.disabled=true;
    if(max&&y>=max.getUTCFullYear())nextYear.disabled=true;
    const clearButton=popup.querySelector('[data-mrd-date-action="clear"]');
    if(input.dataset.originalRequired==='true')clearButton.disabled=true;
  };
  const setValue=iso=>{
    input.value=iso;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    trigger.classList.toggle('has-value',!!iso);
    value.textContent=mrdDateText(iso);
    close();
  };
  const open=()=>{
    $$('.mrd-date-popover:not([hidden])').forEach(other=>{if(other!==popup){other.hidden=true;other.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.setAttribute('aria-expanded','false');}});
    popup.dataset.month=(input.value||mrdDateToday()).slice(0,7);
    render();popup.hidden=false;popup._mrdDateTrigger=trigger;trigger.setAttribute('aria-expanded','true');wrapper.classList.add('is-open');positionPopup();
    const selected=popup.querySelector('.is-selected:not(:disabled)')||popup.querySelector('[data-mrd-date]:not(:disabled)');
    if(selected)selected.setAttribute('tabindex','0');
  };
  function close(){popup.hidden=true;trigger.setAttribute('aria-expanded','false');wrapper.classList.remove('is-open');popup.style.left='';popup.style.top='';popup.style.width='';}
  trigger.addEventListener('click',()=>popup.hidden?open():close());
  popup.addEventListener('click',e=>{
    const day=e.target.closest('[data-mrd-date]');
    if(day&&!day.disabled){setValue(day.dataset.mrdDate);return;}
    const action=e.target.closest('[data-mrd-date-action]')?.dataset.mrdDateAction;
    if(action==='prev'||action==='next'||action==='prev-year'||action==='next-year'){
      const current=mrdDateUTC(popup.dataset.month+'-01');
      const yearStep=action==='next-year'?1:action==='prev-year'?-1:0;
      const monthStep=action==='next'?1:action==='prev'?-1:0;
      const next=new Date(Date.UTC(current.getUTCFullYear()+yearStep,current.getUTCMonth()+monthStep,1));
      const min=mrdDateUTC(input.min),max=mrdDateUTC(input.max);
      if(min&&next<new Date(Date.UTC(min.getUTCFullYear(),min.getUTCMonth(),1)))return;
      if(max&&next>new Date(Date.UTC(max.getUTCFullYear(),max.getUTCMonth(),1)))return;
      popup.dataset.month=mrdISODate(next).slice(0,7);render();positionPopup();
    }else if(action==='today'){
      const today=mrdDateToday(),d=mrdDateUTC(today);
      if((!input.min||today>=input.min)&&(!input.max||today<=input.max)){setValue(today);}
      else{popup.dataset.month=today.slice(0,7);render();}
    }else if(action==='clear'){if(input.dataset.originalRequired!=='true')setValue('');}
  });
  input.addEventListener('change',()=>{trigger.classList.toggle('has-value',!!input.value);value.textContent=mrdDateText(input.value);});
  input._mrdDateClose=close;
};
const initMrdDatePickers = root => {
  (root||document).querySelectorAll('input[type="date"]:not(.mrd-date-native):not([data-native-date-picker])').forEach(mrdDateMarkup);
};
document.addEventListener('focusin',e=>{if(e.target.matches?.('input[type="date"]:not(.mrd-date-native):not([data-native-date-picker])'))initMrdDatePickers(e.target.parentElement||document);});
const repositionMrdDatePopovers=()=>document.querySelectorAll('.mrd-date-popover:not([hidden])').forEach(p=>{const t=p._mrdDateTrigger;if(!t||!t.isConnected){p.hidden=true;return;}const r=t.getBoundingClientRect(),w=Math.min(272,window.innerWidth-24),h=Math.min(360,window.innerHeight-24);p.style.left=Math.max(12,Math.min(r.left,window.innerWidth-w-12))+'px';p.style.top=Math.max(12,Math.min(r.bottom+5,window.innerHeight-h-12))+'px';});
window.addEventListener('resize',repositionMrdDatePopovers);window.addEventListener('scroll',repositionMrdDatePopovers,true);
document.addEventListener('click',e=>{
  const path=e.composedPath();
  if(!e.target.closest('.mrd-date-control')&&!path.some(node=>node instanceof Element&&node.classList?.contains('mrd-date-popover')))$('.mrd-date-popover:not([hidden])').forEach(p=>{p.hidden=true;p.closest('.mrd-date-control')?.classList.remove('is-open');p.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.setAttribute('aria-expanded','false');});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const p=$$('.mrd-date-popover:not([hidden])').at(-1);if(p){p.hidden=true;p.closest('.mrd-date-control')?.classList.remove('is-open');p.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.setAttribute('aria-expanded','false');p.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.focus();}}
});
document.addEventListener('submit',e=>{
  const missing=[...e.target.querySelectorAll('input.mrd-date-native')].find(input=>input.dataset.originalRequired==='true'&&!input.value);
  if(missing){e.preventDefault();e.stopImmediatePropagation();toast('Choisis une date avant de continuer.','warn');missing.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.focus();}
},true);
const mrdDateObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1){if(node.matches?.('input[type="date"]'))initMrdDatePickers(node.parentElement||document);else initMrdDatePickers(node);}})));
mrdDateObserver.observe(document.documentElement,{childList:true,subtree:true});

const isSessionExpiredError = message => /session absente ou expirée|session invalide|reconnecte-toi/i.test(String(message || ''));
const setLoginFieldsVisible = visible => {
  const form = $('#login-form');
  if (!form) return;
  $$('.field, #login-submit', form).forEach(control => { control.hidden = !visible; });
};
const clearLocalSession = (message = '') => {
  localStorage.removeItem(KEY.token);
  currentUser = null;
  setLoginFieldsVisible(true);
  const password = $('#login-pass');
  if (password) password.value = '';
  const screen = $('#login-screen');
  if (screen) screen.hidden = false;
  const error = $('#login-error');
  if (error) error.textContent = message;
};
const get = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const set = (o, p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((a, x) => a[x], o)[l] = v; };
const move = (a, i, d) => { const j = i + d; if (j >= 0 && j < a.length) [a[i], a[j]] = [a[j], a[i]]; };
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const json = o => JSON.stringify(o, (k, v) => k === '_c' ? undefined : v, 2);
const serialize = l => 'const EVENTS = ' + JSON.stringify(l, null, 2) + ';\n';
const parse = t => JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
const markActive = el => $$('button', el.parentElement).forEach(b => b.classList.toggle('active', b === el));

const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const compactToastMessage = (message, kind = 'info') => {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  const rules = [
    [/choisis une date|date .*obligatoire/i, 'Date obligatoire'],
    [/titre et l’adresse sont obligatoires|titre et adresse/i, 'Titre et adresse obligatoires'],
    [/ajoute la date dans la fiche/i, 'Date de l’événement obligatoire'],
    [/enregistré et publié|enregistrée et publiée/i, 'Publication enregistrée'],
    [/modifications enregistrées sans changer/i, 'Modifications enregistrées'],
    [/événements enregistrés/i, 'Événements enregistrés'],
    [/catégories du portail enregistrées/i, 'Catégories enregistrées'],
    [/publication envoyée/i, 'Publication envoyée'],
    [/compte créé/i, 'Compte créé'],
    [/mot de passe mis à jour/i, 'Mot de passe mis à jour'],
    [/déconnexion effectuée/i, 'Déconnexion effectuée'],
    [/serveur accessible/i, 'Serveur accessible'],
    [/accréditations mises à jour/i, 'Accréditations mises à jour'],
    [/compte désactivé/i, 'Compte désactivé'],
    [/a été supprimé/i, 'Compte supprimé'],
    [/inscription confirmée/i, 'Inscription confirmée'],
    [/désinscription enregistrée/i, 'Désinscription enregistrée'],
    [/brouillon chargé/i, 'Brouillon chargé'],
    [/fiche historique importée/i, 'Fiche importée'],
    [/url enregistrée/i, 'URL enregistrée'],
    [/fichier json invalide/i, 'Fichier JSON invalide'],
    [/image invalide/i, 'Image invalide'],
    [/maximum 10 mo|10 mo maximum/i, 'Limite : 10 Mo'],
    [/choisis un fichier/i, 'Fichier obligatoire'],
    [/action réservée au co et à l’aco/i, 'Réservé au CO et à l’ACO'],
    [/réservés au commandant|réservé au commanding officer/i, 'Accès réservé'],
    [/session absente ou expirée|session invalide|reconnecte-toi/i, 'Session expirée · Reconnexion requise'],
    [/impossible de charger le portail/i, 'Chargement du portail impossible'],
    [/impossible d’enregistrer les catégories/i, 'Enregistrement impossible'],
    [/impossible de supprimer la publication/i, 'Suppression impossible'],
    [/échec de publication/i, 'Publication échouée'],
    [/confirmation ne correspond pas/i, 'Confirmation incorrecte'],
    [/au moins 12 caractères/i, '12 caractères minimum'],
    [/saisis une url https valide/i, 'URL HTTPS invalide'],
    [/date manquante/i, 'Date obligatoire']
  ];
  for (const [pattern, label] of rules) if (pattern.test(raw)) return label;
  const firstSentence = raw.split(/(?<=[.!?])\s+/)[0] || raw;
  const cleaned = firstSentence.replace(/\s+(?:le portail sera actualisé|mise à jour en ligne|les prochaines requêtes utiliseront).*$/i, '').trim();
  if (cleaned.length <= 68) return cleaned.replace(/[.!?]+$/, '');
  return cleaned.slice(0, 65).replace(/\s+\S*$/, '') + '…';
};

const toast = (message, kind = '') => {
  const container = $('#toasts');
  if (!container) return;
  const type = ['ok', 'err', 'warn', 'info'].includes(kind) ? kind : 'info';
  const duration = type === 'err' ? 5600 : 3900;
  const icons = { ok: '✓', err: '×', warn: '!', info: '·' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.style.setProperty('--toast-duration', duration + 'ms');
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = icons[type];
  const copy = document.createElement('div');
  copy.className = 'toast-copy';
  const text = document.createElement('span');
  text.textContent = compactToastMessage(message, type);
  copy.append(text);
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer la notification');
  close.textContent = '×';
  close.addEventListener('click', () => el.remove());
  const progress = document.createElement('span');
  progress.className = 'toast-progress';
  el.append(icon, copy, close, progress);
  container.append(el);
  setTimeout(() => {
    el.classList.add('toast-leaving');
    setTimeout(() => el.remove(), 220);
  }, duration);
};

const labelForField = field => {
  const label = field.labels?.[0] || field.closest('label');
  const text = label?.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text.replace(/\s*[＊*]\s*$/, '').slice(0, 48);
  return field.getAttribute('aria-label') || field.name || field.id || 'ce champ';
};

const applyCustomFormValidation = root => {
  (root || document).querySelectorAll?.('form').forEach(form => { form.noValidate = true; });
};
applyCustomFormValidation(document);
const formValidationObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === 1) {
    if (node.matches?.('form')) node.noValidate = true;
    applyCustomFormValidation(node);
  }
})));
formValidationObserver.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const invalid = [...form.querySelectorAll('input, select, textarea')].find(field => {
    if (!field.willValidate || field.disabled) return false;
    if (field.classList.contains('mrd-date-native') && field.dataset.originalRequired === 'true') return !field.value;
    return !field.validity.valid;
  });
  if (!invalid) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const label = labelForField(invalid);
  const message = invalid.validity.valueMissing || (invalid.classList.contains('mrd-date-native') && !invalid.value)
    ? 'Champ obligatoire : ' + label
    : invalid.validity.typeMismatch || invalid.validity.patternMismatch
      ? 'Format invalide : ' + label
      : invalid.validity.tooShort || invalid.validity.tooLong
        ? 'Longueur invalide : ' + label
        : 'Valeur invalide : ' + label;
  toast(message, 'warn');
  const focusTarget = invalid.classList.contains('mrd-date-native')
    ? invalid.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')
    : invalid.classList.contains('mrd-select-native')
      ? invalid.closest('.mrd-select-control')?.querySelector('.mrd-select-trigger')
      : invalid;
  focusTarget?.focus({ preventScroll: true });
  invalid.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}, true);

const confirmDialog = (message, options = {}) => new Promise(resolve => {
  const { title = 'Confirmer cette action', confirmText = 'Confirmer', danger = false } = options;
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  const dialog = document.createElement('section');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');
  dialog.innerHTML = `
    <div class="confirm-symbol" aria-hidden="true">${danger ? '!' : '?'}</div>
    <div class="confirm-copy">
      <h2 id="confirm-dialog-title"></h2>
      <p class="confirm-message"></p>
    </div>
    <div class="confirm-actions">
      <button type="button" class="confirm-cancel">Annuler</button>
      <button type="button" class="confirm-accept"></button>
    </div>`;
  dialog.querySelector('#confirm-dialog-title').textContent = title;
  dialog.querySelector('.confirm-message').textContent = String(message);
  const cancel = dialog.querySelector('.confirm-cancel');
  const accept = dialog.querySelector('.confirm-accept');
  accept.textContent = confirmText;
  if (danger) accept.classList.add('danger');
  overlay.append(dialog);
  document.body.append(overlay);
  let finished = false;
  const finish = value => {
    if (finished) return;
    finished = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    resolve(value);
  };
  const onKey = event => {
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    if (event.key === 'Tab') {
      const controls = [cancel, accept];
      const current = controls.indexOf(document.activeElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); accept.focus(); }
      else if (!event.shiftKey && current === controls.length - 1) { event.preventDefault(); cancel.focus(); }
    }
  };
  cancel.addEventListener('click', () => finish(false));
  accept.addEventListener('click', () => finish(true));
  overlay.addEventListener('click', event => { if (event.target === overlay) finish(false); });
  document.addEventListener('keydown', onKey);
  cancel.focus();
});

const blank = () => ({
  slug: '',
  meta: { title: '', badge: 'Mission Row Police Department · MRD Event', date: '', divider: '★ RÈGLEMENT ★', pageTitle: '', logo: '../public/Logo MRD V2.png', fl: 'Sergeant Andrea BIANCHI · Commanding Officer MRD', fr: 'LSPD · MRPD' },
  card: { status: 'soon', icon: '🎉', title: '', desc: '', date: '' },
  sections: []
});
const newSec = type => ({ type, icon: '📋', title: 'Nouvelle section', body: '', lead: '', note: '', box: '', italic: false, variant: false });

const SAMPLE = {
  slug: 'hide-and-seek',
  meta: { title: 'Hide & Seek\nMRPD', date: '📅 03 juin 2026 · 21h15 (après RC)' },
  card: { status: 'live', icon: '🔦', desc: 'Cache-cache en 3 rounds dans le poste Mission Row.', date: 'Mercredi 03/06/26' },
  sections: [
    { type: 'text', icon: '📋', title: 'Présentation', body: 'Cache-cache organisé par la **Media Relations Division**, en **3 rounds**.', lead: '', note: '', box: '', italic: false, variant: false },
    { type: 'list', icon: '🚫', title: 'Zones Interdites', body: 'Se cacher !!à l\'air libre!!\nSe cacher !!dans les escaliers!!', lead: '', note: '⚠️ Cachette invalide = élimination du round.', box: '', italic: false, variant: true },
    { type: 'cards', icon: '🗺️', title: 'Les 3 Rounds', body: '🔦 | ROUND 1 | Sous-sol et parking | -1\n🚪 | ROUND 2 | Rez-de-chaussée | 0\n🏢 | ROUND 3 | Premier étage | 1', lead: '', note: '', box: '', italic: false, variant: false },
    { type: 'list', icon: '📊', title: 'Notation', body: 'Un classement par **round**\nClassement final = **moyenne des 3 rounds**', lead: '', note: '', box: '🧮 | Score final = **(R1 + R2 + R3) ÷ 3**', italic: false, variant: false },
    { type: 'prizes', icon: '💰', title: 'Classement - Top 3', body: '🥇 | 1ère place | À définir\n🥈 | 2ème place | À définir\n🥉 | 3ème place | À définir', lead: '', note: '', box: '', italic: false, variant: false }
  ]
};

const TYPES = {
  text: { label: 'Texte', hint: 'Paragraphes séparés par une ligne vide. **doré** et !!rouge!! disponibles.' },
  list: { label: 'Liste', hint: 'Un point par ligne. **doré** et !!rouge!! disponibles.' },
  cards: { label: 'Cartes', hint: 'emoji | tag | libellé | gros texte (optionnel)' },
  info: { label: 'Infos', hint: 'titre | valeur' },
  timeline: { label: 'Planning', hint: 'horaire | activité | responsable' },
  roles: { label: 'Colonnes', hint: 'Titre puis un point par ligne. Colonnes séparées par ---' },
  choices: { label: 'Choix', hint: 'emoji | texte | wait (bleu) ou hunt (doré). Sans emoji : texte seul.' },
  prizes: { label: 'Podium', hint: 'emoji | rang | gain | gold, silver ou bronze' },
  stands: { label: 'Stands', hint: 'Nom, puis : jeu | description, ★ bonus | description, score: barème. Stands séparés par ---' },
  html: { label: 'HTML libre', hint: 'HTML inséré tel quel dans la section. Les scripts sont refusés.' }
};
const STATUS = { live: 'Actif', soon: 'À venir', archived: 'Archivé' };
const PREVIEW_HOOK = '<script>addEventListener("scroll",()=>parent.postMessage(scrollY,"*"));addEventListener("message",e=>scrollTo(0,e.data))<\/script>';

let ev, list = [], portalSettingsLoaded = false, portalSettings = { order: ['events', 'documents', 'news'], visible: { events: true, news: false, documents: true }, categories: [
  { id: 'events', name: 'Événements', type: 'events', description: 'Fiches et cartes des événements' },
  { id: 'news', name: 'News & actualités', type: 'publications', description: 'Actualités et communiqués' },
  { id: 'documents', name: 'Communication interne', type: 'publications', description: 'Documents et communications officielles' }
] }, slugTouched = false, lastScroll = 0, previewTimer, draftTimer, previewPreference = true;
const PORTAL_CATEGORIES = { events: 'Événements', news: 'News & actualités', documents: 'Communication interne' };
const BUILTIN_PORTAL_CATEGORIES = [
  { id: 'events', name: 'Événements', type: 'events', description: 'Fiches et cartes des événements' },
  { id: 'news', name: 'News & actualités', type: 'publications', description: 'Actualités et communiqués' },
  { id: 'documents', name: 'Communication interne', type: 'publications', description: 'Documents et communications officielles' }
];
const canManagePortalCategories = user => !!user && ((user.role === 'owner' && user.grade === 'Commanding Officer') || (user.role === 'admin' && user.grade === 'Assistant Commanding Officer'));
const validPortalCategoryId = id => ['events','news','documents'].includes(id) || (typeof id === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(id));
const loadPortalSettings = async () => {
  if (portalSettingsLoaded) return;
  const response = await fetch('../public/portal-settings.js', { cache: 'no-store' });
  if (!response.ok) throw new Error('Impossible de lire les paramètres du portail (' + response.status + ').');
  const source = await response.text();
  const start = source.indexOf('{'), end = source.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Format des paramètres du portail invalide.');
  const value = JSON.parse(source.slice(start, end + 1));
  const incoming = Array.isArray(value.categories) ? value.categories : BUILTIN_PORTAL_CATEGORIES;
  const categories = incoming.filter(c => c && validPortalCategoryId(c.id) && typeof c.name === 'string' && c.name.trim() && (c.id === 'events' ? c.type === 'events' : c.type === 'publications'))
    .map(c => ({ id: c.id, name: c.name.trim().slice(0, 48), type: c.id === 'events' ? 'events' : 'publications', description: String(c.description || '').trim().slice(0, 100) }));
  if (!Array.isArray(value.categories)) for (const builtin of BUILTIN_PORTAL_CATEGORIES) if (!categories.some(c => c.id === builtin.id)) categories.push({ ...builtin });
  const ids = categories.map(c => c.id);
  const order = Array.isArray(value.order) ? value.order.filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i) : [];
  const visible = Object.fromEntries(categories.map(c => [c.id, typeof value.visible?.[c.id] === 'boolean' ? value.visible[c.id] : c.id !== 'news']));
  portalSettings = { order: [...order, ...ids.filter(id => !order.includes(id))], visible, categories };
  Object.assign(PORTAL_CATEGORIES, Object.fromEntries(categories.map(c => [c.id, c.name])));
  portalSettingsLoaded = true;
};

const api = {
  cfg() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY.access) || '{}');
      return { url: String(saved.url || WORKER_URL).replace(/\/$/, '') };
    } catch { return { url: WORKER_URL }; }
  },

  async post(path, body = {}) {
    const token = localStorage.getItem(KEY.token);

    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    let response;

    try {
      response = await fetch(
        api.cfg().url.replace(/\/$/, '') + path,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        }
      );
    } catch (error) {
      throw new Error(
        'Échec de connexion au Worker. Vérifie le CORS et la disponibilité du serveur.'
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && isSessionExpiredError(data.error)) {
        clearLocalSession('Ta session a expiré. Reconnecte-toi.');
      }

      throw new Error(
        response.status + ' · ' +
        (data.error || 'Erreur inconnue du serveur')
      );
    }

    return data;
  }
};

const avatarDataCache = new Map();
const avatarRequestQueue = new Map();
let avatarBatchScheduled = false;

