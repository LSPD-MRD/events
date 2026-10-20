const WORKER_URL = 'https://mrd-panel-test.biscuitytb2102.workers.dev';
const KEY = { draft: 'mrdpanel-draft', access: 'mrdpanel-config', theme: 'mrd-theme', token: 'mrdpanel-session', avatar: 'mrdpanel-profile-avatar', activeTab: 'mrdpanel-active-tab' };
const PAGE_LABELS = { edit: 'Événements', publications: 'Publications', portal: 'Portail', logs: 'Logs', access: 'Accès', profile: 'Mon profil', effectif: 'Effectif' };
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

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── MRD custom date picker: consistent across every panel form ── */
const mrdDateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
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
    popup.innerHTML='<div class="mrd-date-pop-head"><button type="button" class="mrd-date-nav" data-mrd-date-action="prev" aria-label="Mois précédent">‹</button><div><strong>'+mrdMonthFmt.format(first)+'</strong><small>SÉLECTIONNER UNE DATE</small></div><button type="button" class="mrd-date-nav" data-mrd-date-action="next" aria-label="Mois suivant">›</button></div><div class="mrd-date-weekdays"><span>LUN</span><span>MAR</span><span>MER</span><span>JEU</span><span>VEN</span><span>SAM</span><span>DIM</span></div><div class="mrd-date-grid">'+cells.join('')+'</div><div class="mrd-date-pop-foot"><button type="button" class="mrd-date-today" data-mrd-date-action="today">Aujourd’hui</button><button type="button" class="mrd-date-clear" data-mrd-date-action="clear">Effacer</button></div>';
    const prev=popup.querySelector('[data-mrd-date-action="prev"]');
    const next=popup.querySelector('[data-mrd-date-action="next"]');
    if(min&&new Date(Date.UTC(y,m-1,1))<new Date(Date.UTC(min.getUTCFullYear(),min.getUTCMonth(),1)))prev.disabled=true;
    if(max&&new Date(Date.UTC(y,m+1,1))>new Date(Date.UTC(max.getUTCFullYear(),max.getUTCMonth(),1)))next.disabled=true;
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
    if(action==='prev'||action==='next'){
      const current=mrdDateUTC(popup.dataset.month+'-01');
      const next=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+(action==='next'?1:-1),1));
      popup.dataset.month=mrdISODate(next).slice(0,7);render();
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
  if(!e.target.closest('.mrd-date-control')&&!e.target.closest('.mrd-date-popover'))$$('.mrd-date-popover:not([hidden])').forEach(p=>{p.hidden=true;p.closest('.mrd-date-control')?.classList.remove('is-open');p.closest('.mrd-date-control')?.querySelector('.mrd-date-trigger')?.setAttribute('aria-expanded','false');});
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

const toast = (message, kind = '') => {
  const container = $('#toasts');
  if (!container) return;
  const duration = kind === 'err' ? 7000 : 4200;
  const titles = { ok: 'C’est enregistré', err: 'Une erreur est survenue', warn: 'Date manquante', info: 'Information' };
  const icons = { ok: '✓', err: '!', warn: '!', info: 'i' };
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  el.style.setProperty('--toast-duration', duration + 'ms');
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = icons[kind] || icons.info;
  const copy = document.createElement('div');
  copy.className = 'toast-copy';
  const title = document.createElement('strong');
  title.textContent = titles[kind] || titles.info;
  const text = document.createElement('span');
  text.textContent = String(message);
  copy.append(title, text);
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

let ev, list = [], slugTouched = false, lastScroll = 0, previewTimer, draftTimer, previewPreference = true;

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

const loadList = async () => {
  const response = await fetch('../public/events-data.js', { cache: 'no-store' });
  if (!response.ok) throw new Error('Impossible de lire events-data.js (' + response.status + ').');
  return parse(await response.text());
};

const field = (path, label, { rows = 0, placeholder = '', hint = '' } = {}) => {
  const id = 'field-' + path.replace(/[^a-zA-Z0-9_-]/g, '-');
  const control = rows
    ? `<textarea id="${id}" name="${path}" data-p="${path}" rows="${rows}" placeholder="${esc(placeholder)}"></textarea>`
    : `<input id="${id}" name="${path}" data-p="${path}" placeholder="${esc(placeholder)}">`;
  return `<div class="field"><label for="${id}">${label}</label>${control}${hint ? `<small>${hint}</small>` : ''}</div>`;
};

const segment = (action, path, options, current) => `<div class="seg">${Object.entries(options).map(([value, label]) =>
  `<button type="button" class="${value === current ? 'active' : ''}" data-action="${action}" data-path="${path}" data-value="${value}">${label}</button>`).join('')}</div>`;

const toggle = (key, label, on) => `<label class="switch"><input type="checkbox" data-s="${key}"${on ? ' checked' : ''}><span></span>${label}</label>`;

const sectionHtml = (s, i) => `
<details class="sec" data-i="${i}"${s._c ? '' : ' open'}>
  <summary>
    <span class="sec-icon">${esc(s.icon)}</span>
    <span class="sec-title"><b>${esc(s.title) || 'Sans titre'}</b><em>${(TYPES[s.type] || { label: 'Bloc personnalisé' }).label}</em></span>
    <span class="sec-actions">
      <button class="icon" data-action="up" title="Monter">↑</button>
      <button class="icon" data-action="down" title="Descendre">↓</button>
      <button class="icon" data-action="dup" title="Dupliquer">⧉</button>
      <button class="icon danger" data-action="del" title="Supprimer">✕</button>
    </span>
  </summary>
  <div class="sec-body">
    <div class="grid-icon">
      <div class="field"><label>Icône</label><input data-s="icon" value="${esc(s.icon)}"></div>
      <div class="field"><label>Titre</label><input data-s="title" value="${esc(s.title)}"></div>
    </div>
    <div class="field"><label>Type de bloc</label><select data-s="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === s.type ? ' selected' : ''}>${v.label}</option>`).join('')}</select></div>
    <div class="field"><label>Chapeau</label><input data-s="lead" value="${esc(s.lead)}" placeholder="Phrase d'introduction au-dessus du contenu"></div>
    <div class="field"><label>Contenu</label><textarea data-s="body" rows="6">${esc(s.body)}</textarea><small>${esc(TYPES[s.type].hint)}</small></div>
    <div class="field"><label>Encadré vert</label><input data-s="box" value="${esc(s.box)}" placeholder="🧮 | Total = **A + B**"></div>
    <div class="field"><label>Note</label><input data-s="note" value="${esc(s.note)}" placeholder="Remarque affichée sous le contenu"></div>
    ${s.type === 'text' ? `<div>${toggle('italic', 'Texte en italique', s.italic)}</div>` : ''}
    ${s.type === 'list' ? `<div>${toggle('variant', 'Liste d\'interdictions (✕)', s.variant)}</div>` : ''}
  </div>
</details>`;

const renderSections = () => { $('#secs').innerHTML = ev.sections.map(sectionHtml).join('') || '<p class="empty">Aucune section pour le moment.</p>'; };

const renderEditor = () => {
  $('#edit').innerHTML = `
    <section class="page-intro"><div><div class="eyebrow">MRD WORKSPACE <span>· PUBLICATIONS</span></div><h1>Créateur d’événement</h1><p>Conçois une page claire, ajuste son aperçu et publie-la sur le portail MRD.</p></div><div class="intro-mark">✦</div></section>
    <div class="editor-tools">
      <div class="toolbar">
      <div class="editor-pages-dropdown">
        <button class="btn ghost sm editor-pages-trigger" id="editor-pages-trigger" type="button" data-action="toggle-editor-pages" aria-expanded="false" aria-controls="editor-pages-menu"><span class="editor-pages-icon">▤</span><span>Mes pages</span><span class="editor-pages-chevron">▾</span></button>
        <div class="editor-pages-menu" id="editor-pages-menu" hidden>
          <div class="editor-pages-menu-head"><span>MES ÉVÉNEMENTS</span><small id="editor-pages-count">Chargement…</small></div>
          <div id="editor-pages-list" class="editor-pages-list"><div class="editor-pages-loading">Chargement des pages…</div></div>
          <div class="editor-pages-menu-footer"><button type="button" data-action="editor-new"><span>＋</span> Créer une nouvelle page</button></div>
        </div>
      </div>
      <button class="btn ghost sm" data-action="sample">Exemple</button>
      <button class="btn ghost sm" data-action="import">Importer</button>
      <button class="btn ghost sm" data-action="export">Exporter</button>
      <button class="btn ghost sm" data-action="copy-entry">Copier l'entrée portail</button>
      </div>
      <button class="btn preview-toggle" type="button" data-action="toggle-preview"><span class="preview-toggle-icon">◫</span><span data-preview-label>Masquer l’aperçu</span></button>
    </div>
    <section class="card">
      <header class="card-head"><h2>Page</h2><p>Titre, date et adresse de la page.</p></header>
      <div class="card-body">
        ${field('meta.title', 'Titre', { rows: 2, hint: 'Un retour à la ligne crée un saut de ligne dans le titre.' })}
        ${field('meta.date', 'Bandeau date', { placeholder: '📅 12 juin 2026 · 21h00' })}
        ${field('slug', 'Adresse', { placeholder: 'mon-evenement' })}
      </div>
    </section>
    <details class="card">
      <summary>Personnalisation avancée</summary>
      <div class="card-body">
        <div class="grid2">${field('meta.badge', 'Badge')}${field('meta.divider', 'Séparateur')}</div>
        ${field('meta.pageTitle', 'Titre de l\'onglet', { hint: 'Vide : « Event - » suivi du titre.' })}
        ${field('meta.logo', 'Chemin du logo')}
        <div class="grid2">${field('meta.fl', 'Pied de page gauche')}${field('meta.fr', 'Pied de page droit')}</div>
      </div>
    </details>
    <section class="card">
      <header class="card-head"><h2>Carte du portail</h2><p>Ce qui s'affiche sur la page d'accueil.</p></header>
      <div class="card-body">
        <div class="field"><label>Statut</label>${segment('seg', 'card.status', STATUS, ev.card.status)}</div>
        <div class="grid-icon">
          <div class="field"><label>Icône</label><input data-p="card.icon"></div>
          ${field('card.title', 'Titre', { placeholder: 'Vide : titre de la page' })}
        </div>
        ${field('card.desc', 'Description', { rows: 2 })}
        ${field('card.date', 'Date affichée', { placeholder: 'Vendredi 12/06/26' })}
      </div>
    </section>
    <section class="card">
      <header class="card-head"><h2>Sections</h2><p>Les blocs de contenu, dans l'ordre d'affichage.</p></header>
      <div class="card-body">
        <div id="secs"></div>
        <div>
          <span class="label">Ajouter un bloc</span>
          <div class="add-grid">${Object.entries(TYPES).map(([k, v]) => `<button class="chip" data-action="add" data-type="${k}">+ ${v.label}</button>`).join('')}</div>
        </div>
      </div>
    </section>`;
  $$('[data-p]').forEach(x => { x.value = get(ev, x.dataset.p) ?? ''; });
  renderSections();
};

async function renderPublications() {
  $('#publications').innerHTML = '<section class="page-intro"><div><div class="eyebrow">MRD WORKSPACE · PUBLICATIONS</div><h1>Publications</h1><p>Importe tes créations Canva en PDF ou PNG pour conserver exactement leur mise en page.</p></div></section><section class="card"><header class="card-head"><h2>Nouvelle publication</h2><p>Actualités, comptes rendus et communiqués officiels.</p></header><form class="card-body" id="publication-form"><div class="field"><label for="pub-kind">Catégorie</label><div class="select-wrap"><select id="pub-kind"><option value="news">Media Relations · News classiques</option><option value="comm-presse">Public Information (PIO) · Communiqué de presse</option><option value="comm-interne">Interagency · Communication interne</option></select><span class="select-chevron" aria-hidden="true">⌄</span></div></div><div class="field"><label for="pub-title">Titre</label><input id="pub-title" required maxlength="120" placeholder="Titre de la publication"></div><div class="field"><label for="pub-summary">Description (facultative)</label><textarea id="pub-summary" rows="3" maxlength="500"></textarea></div><div class="field"><label for="pub-date">Date</label><input id="pub-date" type="text" placeholder="Choisir une date" autocomplete="off"></div><div class="field"><label for="pub-file">Fichier PDF ou image (max. 10 Mo)</label><div class="file-dropzone" id="publication-dropzone" role="button" tabindex="0" aria-controls="pub-file"><span class="file-dropzone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></span><strong>Dépose ton fichier ici</strong><span class="file-dropzone-copy">ou <button type="button" class="file-dropzone-browse" data-file-browse="pub-file">parcourir tes fichiers</button></span><small class="file-dropzone-status" id="pub-file-status">PDF, PNG, JPG ou WEBP · 10 Mo maximum</small></div><input id="pub-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required class="visually-hidden-file"></div><div id="pub-preview" class="publication-preview">L’aperçu apparaîtra ici.</div><div class="publication-file-actions"><span class="file-dropzone-status" id="pub-selected-hint">Aucun fichier sélectionné pour le moment.</span><button type="button" class="btn sm publication-file-clear" id="pub-file-clear" hidden>Retirer le fichier</button></div><button class="btn primary" id="pub-submit" type="submit">Publier sur le portail</button></form></section><section class="card"><header class="card-head"><h2>Publications en ligne</h2></header><div class="card-body" id="pub-list">Chargement…</div></section>';
  if (window.flatpickr) window.flatpickr($('#pub-date'), { locale: window.flatpickr.l10ns.fr, dateFormat: 'Y-m-d', altInput: true, altFormat: 'j F Y', allowInput: true, disableMobile: true });
  const fileInput=$('#pub-file'), preview=$('#pub-preview'), dropzone=$('#publication-dropzone'), fileStatus=$('#pub-file-status'), clearFileButton=$('#pub-file-clear'), selectedHint=$('#pub-selected-hint');
  let publicationPreviewUrl = '';
  const clearPublicationFile = () => {
    if (publicationPreviewUrl) URL.revokeObjectURL(publicationPreviewUrl);
    publicationPreviewUrl = '';
    fileInput.value = '';
    preview.textContent = 'L’aperçu apparaîtra ici.';
    fileStatus.textContent = 'PDF, PNG, JPG ou WEBP · 10 Mo maximum';
    selectedHint.textContent = 'Aucun fichier sélectionné pour le moment.';
    dropzone.classList.remove('has-file', 'is-dragging');
    clearFileButton.hidden = true;
  };
  clearFileButton.addEventListener('click', clearPublicationFile);
  const acceptPublicationFile = file => {
    if (!file) return;
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type) || file.size > 10*1024*1024) {
      clearPublicationFile(); fileStatus.textContent='Format invalide ou fichier supérieur à 10 Mo.';
      toast('Choisis un PDF, PNG, JPG ou WEBP de 10 Mo maximum.','err'); return;
    }
    if (publicationPreviewUrl) URL.revokeObjectURL(publicationPreviewUrl);
    const transfer = new DataTransfer(); transfer.items.add(file); fileInput.files = transfer.files;
    fileStatus.textContent = file.name + ' · ' + (file.size / (1024*1024) < 1 ? Math.max(1, Math.round(file.size/1024)) + ' Ko' : (file.size/(1024*1024)).toFixed(1) + ' Mo');
    dropzone.classList.add('has-file');
    publicationPreviewUrl = URL.createObjectURL(file);
    selectedHint.textContent = 'Fichier prêt à être publié : ' + file.name;
    clearFileButton.hidden = false;
    preview.innerHTML=file.type==='application/pdf'?'<iframe title="Aperçu PDF" src="'+publicationPreviewUrl+'"></iframe>':'<img alt="Aperçu" src="'+publicationPreviewUrl+'">';
  };
  fileInput.onchange=()=>acceptPublicationFile(fileInput.files[0]);
  dropzone.addEventListener('click', e => { if (!e.target.closest('[data-file-browse]')) fileInput.click(); });
  dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  ['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('is-dragging'); }));
  ['dragleave','dragend'].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove('is-dragging'); }));
  dropzone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('is-dragging'); acceptPublicationFile(e.dataTransfer?.files?.[0]); });
  try { const r=await fetch('../public/publications-data.js?v='+Date.now()); const t=r.ok?await r.text():''; const a=t.indexOf('['),z=t.lastIndexOf(']'); const data=a>=0&&z>a?JSON.parse(t.slice(a,z+1)):[]; $('#pub-list').innerHTML=data.map(p=>'<div class="row-item"><div class="meta"><b>'+esc(p.title)+'</b><small>'+esc(({news:'Media Relations','comm-presse':'Public Information (PIO)','comm-interne':'Interagency','compte-rendu':'Interagency'})[p.kind]||p.kind)+' · '+esc(p.date||'Sans date')+'</small></div><a class="btn sm" target="_blank" rel="noopener" href="../'+encodeURI(p.file)+'">Ouvrir</a><a class="btn sm" download href="../'+encodeURI(p.file)+'">Télécharger</a><button type="button" class="btn sm danger publication-delete" data-publication-delete="'+esc(p.id)+'">Supprimer</button></div>').join('')||'<p class="empty">Aucune publication en ligne.</p>'; } catch { $('#pub-list').textContent='Impossible de charger les publications.'; }
}
document.addEventListener('click', async e => {
  const button=e.target.closest('[data-publication-delete]');
  if(!button)return;
  const id=button.dataset.publicationDelete;
  if(!id)return;
  const accepted=await confirmDialog('Cette action retirera définitivement la publication du portail et supprimera son fichier associé du dépôt. Cette opération est irréversible.',{title:'Supprimer cette publication ?',confirmText:'Supprimer la publication',danger:true});
  if(!accepted)return;
  button.disabled=true;button.textContent='Suppression…';
  try { await api.post('/publication/delete',{id}); toast('Publication supprimée du portail.','ok'); await renderPublications(); }
  catch(error){toast(error.message||'Impossible de supprimer la publication.','err');button.disabled=false;button.textContent='Supprimer';}
});
document.addEventListener('submit', async e => {
  if(e.target.id!=='publication-form')return; e.preventDefault();
  const f=$('#pub-file').files[0]; if(!f)return toast('Choisis un fichier.','err'); if(f.size>10*1024*1024)return toast('Maximum 10 Mo par fichier.','err');
  const b=$('#pub-submit');b.disabled=true;b.textContent='Publication…';
  try { const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f);}); await api.post('/publication/publish',{kind:$('#pub-kind').value,title:$('#pub-title').value.trim(),summary:$('#pub-summary').value.trim(),date:$('#pub-date').value,mime:f.type,data}); toast('Publication envoyée. Le portail sera actualisé dans environ une minute.','ok'); await renderPublications(); } catch(err){toast(err.message||'Échec de publication.','err');} finally{b.disabled=false;b.textContent='Publier sur le portail';}
});
const renderPortal = () => {
  $('#portal').innerHTML = `
    <section class="card">
      <header class="card-head"><h2>Portail</h2><p>Statut et ordre des cartes de la page d'accueil.</p></header>
      <div class="card-body">${list.map((x, i) => `
        <div class="row-item" data-i="${i}">
          <span class="glyph">${esc(x.icon)}</span>
          <div class="meta"><b>${esc(x.title)}</b><small>${esc(x.href || 'sans lien')}</small></div>
          <div class="seg">${Object.entries(STATUS).map(([v, l]) => `<button class="${v === x.status ? 'active' : ''}" data-action="p-status" data-value="${v}">${l}</button>`).join('')}</div>
          <div class="row-tools">
            <button class="icon" data-action="p-up" title="Monter">↑</button>
            <button class="icon" data-action="p-down" title="Descendre">↓</button>
            <button class="icon" data-action="p-edit" title="Modifier">✎</button>
            <button class="icon danger" data-action="p-del" title="Retirer">✕</button>
          </div>
        </div>`).join('') || '<p class="empty">Aucun événement.</p>'}</div>
    </section>
    <div class="actions">
      <button class="btn primary" data-action="p-save">Enregistrer le portail</button>
      <button class="btn" data-action="p-download">Télécharger events-data.js</button>
    </div>`;
};

const renderLogs = async () => {
  const root = $('#logs');
  if (!["owner", "admin"].includes(currentUser?.role)) {
    root.innerHTML = '<section class="card"><div class="card-body">Accès réservé aux administrateurs et au Commanding Officer.</div></section>';
    return;
  }
  root.innerHTML = '<section class="page-intro"><div><div class="eyebrow">MRD WORKSPACE · SÉCURITÉ</div><h1>Logs d’activité</h1><p>Historique des créations, modifications, publications et désactivations importantes.</p></div><div class="intro-mark">⌁</div></section><section class="card"><header class="card-head"><h2>Dernières opérations</h2><p>Les détails sensibles ne sont pas enregistrés. Les 200 actions les plus récentes sont affichées.</p></header><div class="card-body" id="audit-list"><p class="empty">Chargement des logs…</p></div></section>';
  try {
    const result = await api.post('/logs/list', {});
    const logs = result.logs || [];
    $('#audit-list').innerHTML = logs.map(item => {
      const date = new Date(Number(item.created_at)).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' });
      return '<div class="audit-row"><div class="audit-mark">•</div><div class="audit-copy"><strong>'+esc(item.action)+'</strong><span>'+esc(item.target)+'</span><small>'+esc(item.actor_username)+' · '+esc(item.actor_grade)+'</small></div><time>'+esc(date)+'</time></div>';
    }).join('') || '<p class="empty">Aucune action enregistrée pour le moment.</p>';
  } catch (error) { $('#audit-list').textContent = error.message || 'Impossible de charger les logs.'; }
};

const renderAccess = async () => {
  const c = api.cfg();
  const owner = currentUser?.role === 'owner';
  $('#access').innerHTML = `
    <section class="page-intro access-intro"><div><div class="eyebrow">MRD WORKSPACE <span>· ADMINISTRATION</span></div><h1>Accès & sécurité</h1><p>Gère les connexions au panel, les rôles de l’équipe et la liaison avec le serveur MRD.</p></div><div class="intro-mark">⌘</div></section>
    <div class="access-grid">
      <section class="card access-security">
        <header class="card-head"><span class="access-kicker">SESSION ACTIVE</span><h2>Compte connecté</h2><p>Les autorisations dépendent du rôle associé à ton compte.</p></header>
        <div class="card-body">
          <div class="access-user"><div class="access-user-avatar">${esc(wsName(currentUser).slice(0,1).toUpperCase())}</div><div class="access-user-meta"><strong>${esc(wsName(currentUser))}</strong><span>@${esc(currentUser?.username || '')} · ${esc(currentUser?.grade || 'Aucun grade')}</span></div><span class="role-pill">${esc(currentUser?.role || '—')}</span></div>
          <button class="btn access-logout" data-action="logout" type="button">Se déconnecter</button>
        </div>
      </section>
      <section class="card access-worker">
        <header class="card-head"><span class="access-kicker">CONNEXION API</span><h2>Serveur MRD</h2><p>Adresse du Worker qui traite les demandes du panel.</p></header>
        <div class="card-body">
          <div class="field"><label for="worker-url">URL du Worker</label><input id="worker-url" data-g="url" value="${esc(c.url)}" spellcheck="false" placeholder="https://votre-worker.workers.dev"><small>Ne change cette adresse que si le Worker est déplacé.</small></div>
          <div class="actions access-worker-actions"><button class="btn primary" data-action="save-access" type="button">Enregistrer l’URL</button><button class="btn" data-action="test-access" type="button"><span aria-hidden="true">↗</span> Tester la connexion</button></div>
          <p class="access-security-note"><span aria-hidden="true">◆</span> Les mots de passe et les droits sont gérés côté serveur. Ne partage jamais les secrets Cloudflare.</p>
        </div>
      </section>
      ${owner ? `<section class="card access-accounts">
        <header class="card-head access-card-head"><div><span class="access-kicker">GESTION DE L’ÉQUIPE</span><h2>Comptes & autorisations</h2><p>Crée un compte individuel et attribue uniquement les droits nécessaires.</p></div><span class="access-count-mark">01</span></header>
        <div class="card-body">
          <form id="user-create-form" class="user-create access-create-form">
            <div class="field"><label for="new-username">Identifiant</label><input id="new-username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" placeholder="ex. media.officer"></div>
            <div class="field"><label for="new-grade">Grade</label><div class="select-wrap"><select id="new-grade" name="grade" required><option value="Certified Officer">Certified Officer (CtO)</option><option value="Expert Officer">Expert Officer (EO)</option><option value="Assistant Commanding Officer">Assistant Commanding Officer (ACO)</option></select><span class="select-chevron" aria-hidden="true">⌄</span></div><small>Le niveau d’accès est attribué automatiquement selon le grade.</small></div>
            <div class="field"><label for="new-password">Mot de passe temporaire</label><input id="new-password" name="password" required minlength="12" type="password" autocomplete="new-password" placeholder="12 caractères minimum"></div>
            <div class="access-create-footer"><span>Le mot de passe initial doit être communiqué en privé.</span><button class="btn primary create-account-btn" type="submit"><span aria-hidden="true">＋</span> Créer le compte</button></div>
          </form>
        </div>
        <div class="access-list-head"><div><h3>Comptes existants</h3><p>Les comptes désactivés ne peuvent plus se connecter.</p></div><span id="access-user-count" class="access-user-count">—</span></div>
        <div class="card-body access-users-body"><div id="users-list" class="user-admin"><div class="access-loading"><span class="loading-dot"></span> Chargement des comptes…</div></div></div>
      </section>` : `<section class="card access-restricted"><div class="access-restricted-icon">♙</div><div><h2>Gestion des comptes</h2><p>La création et la désactivation des comptes sont réservées au Owner.</p></div></section>`}
    </div>`;
  if (owner) {
    try {
      const data = await api.post('/users/list', {});
      const users = data.users || [];
      const count = $('#access-user-count');
      if (count) count.textContent = String(users.length).padStart(2, '0');
      $('#users-list').innerHTML = users.map(u => {
        const allowed = ACCREDITATIONS_BY_GRADE[u.grade] || [];
        const selected = Array.isArray(u.accreditations) ? u.accreditations : (typeof u.accreditations === 'string' ? (() => { try { const parsed = JSON.parse(u.accreditations); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })() : []);
        return `<article class="user-row access-user-row access-user-card">
          ${u.avatarData ? `<img class="access-user-avatar small" src="${u.avatarData}" alt="">` : `<div class="access-user-avatar small">${esc((u.displayName || u.username || 'M').slice(0,1).toUpperCase())}</div>`}
          <div class="access-user-details">
            <b>${esc(u.displayName || u.username)}</b>
            <small>@${esc(u.username)} <span>·</span> ${esc(u.grade)} <span>·</span> ${esc(u.role)} <span>·</span> <i class="${u.active ? 'status-active' : 'status-disabled'}">${u.active ? 'Actif' : 'Désactivé'}</i></small>
            <div class="accreditation-tags">${accreditationTags(selected)}</div>
            ${u.role === 'owner' ? '<small class="accreditation-note">Le CO dispose de toutes les accréditations.</small>' : `<div class="accreditation-manager"><button type="button" class="accreditation-add" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-expanded="false" aria-label="Ajouter ou modifier les accréditations de ${esc(u.username)}" title="Ajouter ou modifier les accréditations"><span aria-hidden="true">＋</span></button><div class="accreditation-manager-copy"><span>Accréditations</span><small>${selected.length ? selected.length + ' attribuée' + (selected.length > 1 ? 's' : '') : 'Aucune accréditation'}</small></div><div class="accreditation-editor" data-accreditation-editor="${esc(u.id)}" hidden><div class="accreditation-editor-head"><div><strong>Attribuer les accréditations</strong><small>Sélectionne une ou plusieurs accréditations.</small></div><button type="button" class="accreditation-close" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-label="Fermer">×</button></div><div class="accreditation-options">${Object.keys(ACCREDITATION_META).map(name => `<label class="accreditation-option ${allowed.includes(name) ? '' : 'is-unavailable'}"><input type="checkbox" data-accreditation-user="${esc(u.id)}" value="${esc(name)}" ${selected.includes(name) ? 'checked' : ''} ${!allowed.includes(name) || !u.active ? 'disabled' : ''}><span>${esc(name)}</span>${!allowed.includes(name) ? '<small>Non accessible à ce grade</small>' : ''}</label>`).join('')}</div><div class="accreditation-editor-footer"><span>Les changements prennent effet après enregistrement.</span><button type="button" class="btn primary sm" data-action="save-accreditations" data-user-id="${esc(u.id)}" ${!u.active || Number(u.id) === Number(currentUser.id) ? 'disabled' : ''}>Enregistrer</button></div></div></div>`}
          </div>
          <button class="btn ${u.active ? 'danger' : ''} access-user-action" data-action="user-disable" data-user-id="${esc(u.id)}" ${Number(u.id) === Number(currentUser.id) || !u.active || u.role === 'owner' ? 'disabled' : ''}>${u.active ? 'Désactiver' : 'Désactivé'}</button>
        </article>`;
      }).join('') || '<p class="empty">Aucun compte n’a été créé.</p>';
    } catch (e) { $('#users-list').textContent = e.message; }
  }
};


const applyProfileAvatar = () => {
  const image = $('#profile-avatar');
  const placeholder = $('#profile-avatar-placeholder');
  const src = currentUser?.avatarData || null;
  if (image) { image.hidden = !src; image.src = src || ''; }
  if (placeholder) placeholder.hidden = !!src;
};
const renderProfile = () => {
  const root = $('#profile');
  root.innerHTML = `
    <section class="page-intro"><div><div class="eyebrow">COMPTE PERSONNEL <span>· SÉCURITÉ</span></div><h1>Mon profil</h1><p>Gère ta photo de profil et mets à jour le mot de passe de ton compte MRD.</p></div></section>
    <section class="card">
      <header class="card-head"><h2>Identité & photo de profil</h2><p>Ton nom d’affichage et ta photo sont visibles par les autres membres de la MRD.</p></header>
      <div class="card-body">
        <div class="profile-edit-row"><div class="profile-preview-avatar" id="profile-preview-avatar"></div><div><strong>${esc(wsName(currentUser))}</strong><small>@${esc(currentUser?.username || '')} · ${esc(currentUser?.grade || '')}</small><div class="accreditation-tags profile-accreditation-tags">${accreditationTags(currentUser?.accreditations || [])}</div></div></div>
        <form id="display-profile-form" class="ws-profile-form"><div class="ws-form-grid"><label>Prénom d’affichage<input name="first" maxlength="40" value="${esc(currentUser?.displayFirstName||'')}" placeholder="Prénom"></label><label>Nom d’affichage<input name="last" maxlength="40" value="${esc(currentUser?.displayLastName||'')}" placeholder="Nom"></label></div><small>Le CO peut aussi gérer ces informations depuis l’espace Effectif.</small><button class="btn primary" type="submit">Enregistrer mon nom d’affichage</button></form>
        <div class="file-dropzone file-dropzone-compact" id="avatar-dropzone" role="button" tabindex="0" aria-controls="avatar-file"><span class="file-dropzone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span><strong>Dépose une photo de profil</strong><span class="file-dropzone-copy">ou <button type="button" class="file-dropzone-browse" data-file-browse="avatar-file">parcourir tes fichiers</button></span><small class="file-dropzone-status">PNG, JPG, WEBP ou GIF · 1 Mo maximum</small></div><div class="actions"><button class="btn" type="button" data-action="remove-avatar">Retirer la photo</button></div>
        <small class="hint">Formats acceptés : PNG, JPG, WEBP ou GIF. Taille maximale : 1 Mo.</small>
      </div>
    </section>
    <section class="card">
      <header class="card-head"><h2>Changer le mot de passe</h2><p>Ton mot de passe actuel sera vérifié avant l'enregistrement.</p></header>
      <div class="card-body">
        <form id="change-password-form">
          <div class="field"><label for="current-password">Mot de passe actuel</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required minlength="1" maxlength="128"></div>
          <div class="field"><label for="new-password">Nouveau mot de passe</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"><small>12 caractères minimum.</small></div>
          <div class="field"><label for="confirm-password">Confirmer le nouveau mot de passe</label><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
          <div class="actions"><button class="btn primary" type="submit">Mettre à jour le mot de passe</button></div>
        </form>
      </div>
    </section>`;
  const preview = $('#profile-preview-avatar');
  const src = currentUser?.avatarData || null;
  preview.innerHTML = src ? `<img src="${src}" alt="Photo de profil">` : '<span>♙</span>';
  applyProfileAvatar();
};

const refresh = () => {
  if (!ev) return;
  const frame = $('#pv');
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (!frame) return;
    try {
      const html = page(ev);
      // Mirror the public portal's detail-page wrapper and active color theme.
      // The generated document already loads the same public stylesheets as the portal.
      const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const themed = html
        .replace('<html lang="fr">', '<html lang="fr" data-theme="' + theme + '">')
        .replace('<body>', '<body class="mrd-app"><main id="app-root"><section class="content-wrap"><div class="event-detail">')
        .replace('</body>', '</div></section></main></body>');
      frame.srcdoc = themed.includes('</body>')
        ? themed.replace('</body>', PREVIEW_HOOK + '</body>')
        : themed + PREVIEW_HOOK;
      frame.dataset.previewError = '';
    } catch (error) {
      frame.dataset.previewError = 'true';
      frame.srcdoc = '<!doctype html><html lang="fr"><meta charset="utf-8"><style>body{font:14px system-ui;background:#0b1118;color:#edf3f7;padding:24px}h2{color:#d6b574}pre{white-space:pre-wrap;color:#ff9b9b}</style><h2>Impossible de générer l’aperçu</h2><p>Vérifie les champs et les sections de cette page.</p><pre>' +
        String(error && error.message || error).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) +
        '</pre></html>';
      console.error('MRD preview generation failed:', error);
    }
  }, 120);
  const url = $('#url');
  if (url) url.textContent = `/${ev.slug || '…'}/`;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY.draft, json(ev));
      const draft = $('#draft');
      if (draft) draft.textContent = 'Brouillon enregistré';
    } catch (error) {
      console.warn('Impossible de sauvegarder le brouillon localement:', error);
    }
  }, 600);
};

const load = x => {
  const b = blank();
  ev = { ...b, ...x, meta: { ...b.meta, ...x.meta }, card: { ...b.card, ...x.card }, sections: x.sections || [] };
  slugTouched = !!x.slug;
  renderEditor();
  refresh();
};

const mutate = f => { f(); renderSections(); refresh(); };

const closeMenus = () => {
  $('#pages-menu').hidden = true;
  $('#profile-menu').hidden = true;
  const editorPagesMenu = $('#editor-pages-menu');
  if (editorPagesMenu) editorPagesMenu.hidden = true;
  const editorPagesTrigger = $('#editor-pages-trigger');
  if (editorPagesTrigger) editorPagesTrigger.setAttribute('aria-expanded', 'false');
  const saveMenu = $('#save-menu');
  if (saveMenu) saveMenu.hidden = true;
  const saveTrigger = $('#save-menu-trigger');
  if (saveTrigger) saveTrigger.setAttribute('aria-expanded', 'false');
  $('#pages-trigger').setAttribute('aria-expanded', 'false');
  $('#profile-trigger').setAttribute('aria-expanded', 'false');
};
const setPreview = (show, remember = true) => {
  const preview = $('#preview');
  const layout = $('.layout');
  if (!preview || !layout) return;
  const allowed = layout.dataset.activeTab === 'edit';
  if (allowed && remember) previewPreference = !!show;
  const visible = !!show && allowed;
  preview.hidden = !visible;
  layout.classList.toggle('preview-open', visible);
  const button = $('[data-action="toggle-preview"]');
  if (button) {
    button.classList.toggle('is-open', visible);
    const label = button.querySelector('[data-preview-label]');
    if (label) label.textContent = visible ? 'Masquer l’aperçu' : 'Afficher l’aperçu';
    button.setAttribute('aria-pressed', String(visible));
  }
};

const canViewLogs = user =>
  ['owner', 'admin'].includes(user?.role) ||
  ['Commanding Officer', 'Assistant Commanding Officer'].includes(user?.grade);

const setTab = async name => {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  const label = $('#active-page-label');
  if (label) label.textContent = PAGE_LABELS[name] || 'Espaces';
  localStorage.setItem(KEY.activeTab, name);
  const layout = $('.layout');
  if (layout) layout.dataset.activeTab = name;
  closeMenus();
  setPreview(name === 'edit' && previewPreference, false);
  const logsNav = $('[data-tab="logs"]');
  if (logsNav) logsNav.hidden = !canViewLogs(currentUser);
  if (name === 'logs' && !canViewLogs(currentUser)) {
    toast("Les logs sont réservés aux administrateurs et au Commanding Officer.", "err");
    return setTab("edit");
  }
  if (name === 'publications') await renderPublications();
  if (name === 'logs') await renderLogs();
  if (name === 'portal') {
    try { list = await loadList(); renderPortal(); } catch (err) { toast('Impossible de charger le portail : ' + err.message, 'err'); }
  }
  if (name === 'access') await renderAccess();
  if (name === 'profile') renderProfile();
  if (name === 'effectif') { try { await loadWorkspace(); } catch (err) { $('#effectif').innerHTML = '<section class="card"><div class="card-body">Impossible de charger l’espace Effectif : ' + esc(err.message) + '</div></section>'; } }
};

const saveDraft = async () => {
  if (!ev.slug || !ev.meta.title) return toast('Le titre et l’adresse sont obligatoires.', 'err');
  const button = $('#publish');
  button.disabled = true;
  button.textContent = 'Enregistrement…';
  try {
    localStorage.setItem(KEY.draft, json(ev));
    await api.post('/draft/save', { slug: ev.slug, config: json(ev), card: cardOf(ev) });
    const draft = $('#draft');
    if (draft) draft.textContent = 'Brouillon enregistré';
    toast('Modifications enregistrées sans changer la page publique.', 'ok');
  } finally {
    button.disabled = false;
    button.textContent = 'Enregistrer';
  }
};

const publish = async () => {
  if (!ev.slug || !ev.meta.title) return toast('Le titre et l’adresse sont obligatoires.', 'err');
  if (!ev.meta.date || !ev.meta.date.trim()) return toast('Ajoute la date dans la fiche de l’événement avant de publier. La date de la carte du portail est facultative.', 'warn');
  const button = $('#publish');
  button.disabled = true;
  button.textContent = 'Publication…';
  const menu = $('#save-menu');
  if (menu) menu.hidden = true;
  const menuTrigger = $('#save-menu-trigger');
  if (menuTrigger) menuTrigger.setAttribute('aria-expanded', 'false');
  try {
    await api.post('/publish', { slug: ev.slug, html: page(ev), config: json(ev), card: cardOf(ev) });
    try { await api.post('/draft/save', { slug: ev.slug, config: json(ev), card: cardOf(ev) }); } catch {}
    toast('Enregistré et publié. Mise à jour en ligne dans environ une minute.', 'ok');
  } finally {
    button.disabled = false;
    button.textContent = 'Enregistrer';
  }
};

const applyTheme = theme => {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  localStorage.setItem(KEY.theme, value);
  const b = $('#theme-toggle');
  if (b) {
    b.textContent = value === 'light' ? '☀' : '☾';
    b.setAttribute('aria-label', 'Changer de thème');
    b.setAttribute('title', 'Changer de thème');
  }
};

const renderEditorPageMenu = () => {
  const target = $('#editor-pages-list');
  const count = $('#editor-pages-count');
  if (!target) return;
  if (!list.length) {
    target.innerHTML = '<div class="editor-pages-empty">Aucune page trouvée.</div>';
    if (count) count.textContent = '0 page';
    return;
  }
  const currentSlug = String(ev?.slug || '').replace(/^\/+|\/+$/g, '');
  target.innerHTML = list.map((entry, i) => {
    const slug = String(entry.href || '').replace(/^\/+|\/+$/g, '');
    const isCurrent = slug && slug === currentSlug;
    const title = entry.title || slug || 'Événement sans titre';
    const status = STATUS[entry.status] || 'À venir';
    return `<button type="button" class="editor-page-option${isCurrent ? ' is-current' : ''}" data-action="editor-open" data-index="${i}" title="Ouvrir ${esc(title)}">
      <span class="editor-page-icon">${esc(entry.icon || '✦')}</span>
      <span class="editor-page-copy"><strong>${esc(title)}</strong><small>${esc(slug || 'adresse non définie')}</small></span>
      <span class="editor-page-status status-${esc(entry.status || 'soon')}">${esc(status)}</span>
      ${isCurrent ? '<span class="editor-page-current" aria-label="Page actuellement ouverte">●</span>' : ''}
    </button>`;
  }).join('');
  if (count) count.textContent = list.length + (list.length > 1 ? ' pages' : ' page');
};

const actions = {
  tab: el => setTab(el.dataset.tab),
  'toggle-pages': () => {
    const menu = $('#pages-menu'), next = menu.hidden;
    // Recalculer les droits à l'ouverture pour que Logs reflète la session courante.
    if (currentUser) applyPermissions();
    closeMenus(); menu.hidden = !next;
    $('#pages-trigger').setAttribute('aria-expanded', String(next));
  },
  'toggle-editor-pages': async () => {
    const menu = $('#editor-pages-menu'), next = menu.hidden;
    closeMenus();
    menu.hidden = !next;
    $('#editor-pages-trigger').setAttribute('aria-expanded', String(next));
    if (!next) return;
    const target = $('#editor-pages-list');
    target.innerHTML = '<div class="editor-pages-loading">Chargement des pages…</div>';
    try {
      list = await loadList();
      renderEditorPageMenu();
    } catch (error) {
      target.innerHTML = '<div class="editor-pages-empty">Impossible de charger les pages. Vérifie la connexion au portail.</div>';
      toast('Impossible de charger les pages : ' + error.message, 'err');
    }
  },
  'editor-open': async el => {
    const index = Number(el.dataset.index);
    if (!Number.isInteger(index) || !list[index]) return toast('Cette page n’est plus disponible dans la liste.', 'err');
    $('#editor-pages-menu').hidden = true;
    $('#editor-pages-trigger').setAttribute('aria-expanded', 'false');
    await actions['p-edit'](el, index);
  },
  'editor-new': () => {
    $('#editor-pages-menu').hidden = true;
    $('#editor-pages-trigger').setAttribute('aria-expanded', 'false');
    localStorage.removeItem(KEY.draft);
    load({});
    setTab('edit');
    $('[data-p="meta.title"]')?.focus();
  },
  'toggle-save-menu': () => {
    const menu = $('#save-menu'), next = menu.hidden;
    closeMenus();
    menu.hidden = !next;
    $('#save-menu-trigger').setAttribute('aria-expanded', String(next));
  },
  'toggle-profile': () => {
    const menu = $('#profile-menu'), next = menu.hidden;
    closeMenus(); menu.hidden = !next;
    $('#profile-trigger').setAttribute('aria-expanded', String(next));
  },
  'choose-avatar': () => $('#avatar-file').click(),
  'remove-avatar': async () => { try { await api.post('/auth/profile', { avatarData: null }); if (currentUser) currentUser.avatarData = null; applyProfileAvatar(); renderProfile(); toast('Photo de profil retirée du compte.', 'ok'); } catch (err) { toast(err.message, 'err'); } },

  theme: () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); refresh(); },
  device: el => { $('#device-frame').style.width = el.dataset.width; markActive(el); },
  'toggle-preview': () => setPreview($('#preview').hidden),
  new: () => { localStorage.removeItem(KEY.draft); load({}); },
  sample: () => load(SAMPLE),
  import: () => $('#file').click(),
  export: () => download((ev.slug || 'event') + '.json', json(ev)),
  'copy-entry': async () => { await navigator.clipboard.writeText(JSON.stringify(cardOf(ev), null, 2)); toast('Entrée copiée.', 'ok'); },
  'download-page': () => download('index.html', page(ev)),
  seg: el => { set(ev, el.dataset.path, el.dataset.value); markActive(el); refresh(); },
  add: el => mutate(() => ev.sections.push(newSec(el.dataset.type))),
  up: (el, i) => mutate(() => move(ev.sections, i, -1)),
  down: (el, i) => mutate(() => move(ev.sections, i, 1)),
  dup: (el, i) => mutate(() => ev.sections.splice(i + 1, 0, { ...ev.sections[i] })),
  del: (el, i) => mutate(() => ev.sections.splice(i, 1)),
  publish,
  'save-draft': saveDraft,
  'p-status': (el, i) => { list[i].status = el.dataset.value; renderPortal(); },
  'p-up': (el, i) => { move(list, i, -1); renderPortal(); },
  'p-down': (el, i) => { move(list, i, 1); renderPortal(); },
  'p-del': async (el, i) => { if (await confirmDialog('La carte sera retirée du portail, mais les fichiers de sa page resteront dans le dépôt.', { title: 'Retirer cet événement ?', confirmText: 'Retirer du portail', danger: true })) { list.splice(i, 1); renderPortal(); } },
  'p-edit': async (el, i) => {
    const entry = list[i];
    const slug = String(entry.href || '').replace(/^\/+|\/+$/g, '');
    try {
      const draftResult = await api.post('/draft/load', { slug });
      if (draftResult.found && draftResult.config) {
        const saved = JSON.parse(draftResult.config);
        load({ ...saved, slug });
        setTab('edit');
        toast('Brouillon chargé. La version publique reste inchangée jusqu’à « Enregistrer et publier ».', 'ok');
        return;
      }
    } catch (draftError) {
      console.warn('Lecture du brouillon serveur indisponible:', draftError);
    }
    const r = await fetch('../public/events-content.js', { cache: 'no-store' });
    if (!r.ok) throw new Error('Impossible de charger le contenu central des événements.');
    const source = await r.text();
    const first = source.indexOf('{'), last = source.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('Le fichier de contenu central est invalide.');
    const contents = JSON.parse(source.slice(first, last + 1));
    const html = contents[slug];
    if (!html) {
      load({ slug: slug || slugify(entry.title), meta: { title: entry.title || '', date: entry.date || '' }, card: { ...entry }, sections: [] });
      toast('Fiche ouverte comme nouvelle fiche : aucun ancien contenu détaillé associé.', '');
      setTab('edit');
      return;
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pageRoot = doc.querySelector('.page');
    if (!pageRoot) throw new Error('La fiche historique n’a pas de structure reconnue.');
    const title = doc.querySelector('.header h1')?.textContent?.trim().replace(/\s+/g, ' ') || entry.title || '';
    const date = doc.querySelector('.date-banner')?.textContent?.trim() || entry.date || '';
    const badge = doc.querySelector('.badge')?.textContent?.trim() || 'LSPD · Vespucci Police Station';
    const divider = doc.querySelector('.header-divider span')?.textContent?.trim() || '★ RÈGLEMENT ★';
    const legacySections = [...pageRoot.querySelectorAll(':scope > .section')].map(node => ({
      type: 'html', icon: node.querySelector('.section-title .icon')?.textContent?.trim() || '📄', title: node.querySelector('.section-title')?.textContent?.trim().replace(/\s+/g, ' ') || 'Contenu historique importé', body: node.outerHTML,
      lead: '', note: '', box: '', italic: false, variant: false, legacyWholeSection: true
    }));
    load({
      slug, meta: { title, date, badge, divider, logo: '../public/Logo MRD V2.png', fl: doc.querySelector('.footer-left')?.textContent?.trim() || '', fr: doc.querySelector('.footer-right')?.textContent?.trim() || 'LSPD · MRD' },
      card: { status: entry.status || 'soon', icon: entry.icon || '✦', title: entry.title || title, desc: entry.desc || '', date: entry.date || '' },
      sections: legacySections
    });
    setTab('edit');
    toast('Fiche historique importée dans l’éditeur central. Les blocs HTML restent éditables en mode source.', 'ok');
  },
  'p-save': async () => { await api.post('/portal', { list }); toast('Portail enregistré. Mise à jour dans environ une minute.', 'ok'); },
  'p-download': () => download('events-data.js', serialize(list)),
  'save-access': () => {
    const input = $('[data-g=\"url\"]');
    const url = input?.value.trim().replace(/\/$/, '');
    if (!url || !/^https:\/\//i.test(url)) return toast('Saisis une URL HTTPS valide.', 'err');
    localStorage.setItem(KEY.access, JSON.stringify({ url }));
    toast('URL enregistrée. Les prochaines requêtes utiliseront cette adresse.', 'ok');
  },
  'test-access': async () => { await api.post('/ping', {}); toast('Serveur accessible.', 'ok'); },
  logout: () => signOut(true),
  'user-disable': async el => { if (!(await confirmDialog('Ce compte ne pourra plus se connecter tant qu’il sera désactivé.', { title: 'Désactiver ce compte ?', confirmText: 'Désactiver', danger: true }))) return; await api.post('/users/disable', { id: el.dataset.userId }); await renderAccess(); toast('Compte désactivé.', 'ok'); },
  'toggle-accreditation-editor': el => {
    const id = el.dataset.userId;
    const editor = $$('[data-accreditation-editor]').find(item => item.dataset.accreditationEditor === id);
    if (!editor) return;
    const opening = editor.hidden;
    $$('.accreditation-editor').forEach(item => { item.hidden = true; });
    $$('[data-action="toggle-accreditation-editor"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (opening) {
      editor.hidden = false;
      $$('[data-action="toggle-accreditation-editor"]').filter(button => button.dataset.userId === id).forEach(button => button.setAttribute('aria-expanded', 'true'));
    }
  },
  'save-accreditations': async el => {
    if (currentUser?.grade !== 'Commanding Officer' || currentUser?.role !== 'owner') throw new Error('Seul le Commanding Officer peut attribuer des accréditations.');
    const id = el.dataset.userId;
    const inputs = Array.from(document.querySelectorAll('[data-accreditation-user]')).filter(input => input.dataset.accreditationUser === id);
    const accreditations = inputs.filter(input => input.checked).map(input => input.value);
    const button = el;
    button.disabled = true;
    try { await api.post('/users/accreditations', { id, accreditations }); }
    catch (error) { button.disabled = false; throw error; }
    await renderAccess();
    toast('Accréditations mises à jour.', 'ok');
  }
};

async function signIn(username, password) {
  const c = api.cfg();
  let r;
  try { r = await fetch(c.url.replace(/\/$/, '') + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) }); }
  catch { throw new Error('Connexion au serveur impossible. Vérifie l’URL du Worker, sa disponibilité et le réglage CORS.'); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || ('Connexion refusée (' + r.status + ')'));
  localStorage.setItem(KEY.token, data.token);
  currentUser = data.user;
  setLoginFieldsVisible(true);
  try {
    applyPermissions();
    $('#login-screen').hidden = true;
    $('#login-error').textContent = '';
    await setTab(localStorage.getItem(KEY.activeTab) || 'edit');
  } catch (error) {
    clearLocalSession(error.message || 'Impossible d’initialiser le panel.');
    throw error;
  }
}
async function signOut(show = true) {
  try { if (localStorage.getItem(KEY.token)) await api.post('/auth/logout', {}); } catch {}
  localStorage.removeItem(KEY.token); currentUser = null;
  $('#login-screen').hidden = false;
  $('#login-pass').value = '';
  closeMenus();
  if (show) toast('Déconnexion effectuée.', 'ok');
}
function applyPermissions() {
  const role = currentUser?.role || 'viewer';
  const canEdit = ['owner','admin','editor'].includes(role);
  const saveActions = $('#save-actions');
  if (saveActions) saveActions.hidden = !canEdit;
  const profileName = $('#profile-menu-name');
  if (profileName) profileName.textContent = wsName(currentUser);
  const profileGrade = $('#profile-menu-grade');
  if (profileGrade) profileGrade.textContent = (currentUser?.grade || '') + (currentUser?.role ? ' · ' + currentUser.role : '');
  applyProfileAvatar();
  $$('[data-action="tab"]').forEach(b => {
    if (b.dataset.tab === 'logs') b.hidden = !canViewLogs(currentUser);
    if (b.dataset.tab === 'access') b.hidden = false;
  });
  if (!canEdit) {
    $('#edit').innerHTML = '<section class="card"><div class="card-body"><h2>Consultation seule</h2><p>Ton compte ne dispose pas des droits de modification.</p></div></section>';
    $('#edit').hidden = false;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === 'edit'));
    $$('.panel').forEach(p => { if (p.id !== 'edit') p.hidden = true; });
  }
}
async function restoreSession() {
  const token = localStorage.getItem(KEY.token);
  if (!token) {
    setLoginFieldsVisible(true);
    $('#login-screen').hidden = false;
    document.body.classList.remove('session-checking');
    return;
  }

  setLoginFieldsVisible(false);
  $('#login-error').textContent = 'Vérification de la session précédente…';

  try {
    const data = await api.post('/auth/me', {});
    if (!data.user) throw new Error('Le serveur n’a pas renvoyé les informations du compte.');
    currentUser = data.user;
    applyPermissions();
    setLoginFieldsVisible(true);
    $('#login-screen').hidden = true;
    $('#login-error').textContent = '';
    await setTab(localStorage.getItem(KEY.activeTab) || 'edit');
  } catch (error) {
    setLoginFieldsVisible(true);
    $('#login-screen').hidden = false;
    if (isSessionExpiredError(error.message)) {
      clearLocalSession('Ta session a expiré. Reconnecte-toi.');
    } else {
      // Une erreur réseau ou serveur temporaire ne doit pas supprimer le jeton.
      $('#login-error').textContent = 'Impossible de vérifier la session auprès du serveur. La session locale est conservée ; vérifie la connexion puis recharge le panel.';
    }
  } finally {
    document.body.classList.remove('session-checking');
  }
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = $('#login-submit'), error = $('#login-error');
  button.disabled = true; button.textContent = 'Connexion…'; error.textContent = '';
  try { await signIn($('#login-user').value.trim(), $('#login-pass').value); }
  catch (err) { error.textContent = err.message; }
  finally { button.disabled = false; button.textContent = 'Se connecter'; }
});

document.addEventListener('click', async e => {
  if (!e.target.closest('.pages-dropdown') && !e.target.closest('.profile-dropdown') && !e.target.closest('.save-dropdown') && !e.target.closest('.editor-pages-dropdown')) closeMenus();
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.closest('summary')) e.preventDefault();
  const row = el.closest('[data-i]');
  try { await actions[el.dataset.action]?.(el, row ? +row.dataset.i : -1); } catch (err) { toast(err.message, 'err'); }
});

document.addEventListener('input', e => {
  const t = e.target, value = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset.p) {
    set(ev, t.dataset.p, value);
    if (t.dataset.p === 'slug') slugTouched = true;
    if (t.dataset.p === 'meta.title' && !slugTouched) { ev.slug = slugify(value); $('[data-p="slug"]').value = ev.slug; }
  } else if (t.dataset.s) {
    const box = t.closest('.sec'), s = ev.sections[+box.dataset.i];
    s[t.dataset.s] = value;
    $('.sec-icon', box).textContent = s.icon;
    $('.sec-title b', box).textContent = s.title || 'Sans titre';
  } else return;
  refresh();
});

document.addEventListener('change', e => {
  if (e.target.dataset.s === 'type') {
    const box = e.target.closest('.sec');
    const section = ev.sections[+box.dataset.i];
    if (section && e.target.value !== 'html') section.legacyWholeSection = false;
    renderSections(); refresh();
  }
});

document.addEventListener('toggle', e => {
  const d = e.target;
  if (d.classList.contains('sec') && ev.sections[+d.dataset.i]) ev.sections[+d.dataset.i]._c = !d.open;
}, true);

window.addEventListener('message', e => { if (e.source === $('#pv').contentWindow && typeof e.data === 'number') lastScroll = e.data; });
$('#pv').onload = () => $('#pv').contentWindow.postMessage(lastScroll, '*');

$('#file').onchange = async e => {
  try { if (e.target.files[0]) load(JSON.parse(await e.target.files[0].text())); } catch { toast('Fichier JSON invalide.', 'err'); }
  e.target.value = '';
};
const editorDropTarget = $('.layout');
if (editorDropTarget) {
  ['dragenter','dragover'].forEach(type => editorDropTarget.addEventListener(type, e => {
    const files = Array.from(e.dataTransfer?.items || []).some(item => item.kind === 'file');
    if (!files || e.target.closest('.file-dropzone')) return;
    e.preventDefault(); editorDropTarget.classList.add('file-import-dragging');
  }));
  ['dragleave','dragend'].forEach(type => editorDropTarget.addEventListener(type, e => { if (!editorDropTarget.contains(e.relatedTarget)) editorDropTarget.classList.remove('file-import-dragging'); }));
  editorDropTarget.addEventListener('drop', async e => {
    editorDropTarget.classList.remove('file-import-dragging');
    if (e.target.closest('.file-dropzone')) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\\.json$/i.test(file.name) || file.size > 5*1024*1024) return;
    e.preventDefault();
    try { load(JSON.parse(await file.text())); toast('Événement importé.', 'ok'); } catch { toast('Fichier JSON invalide.', 'err'); }
  });
}
const avatarInput = $('#avatar-file');
const avatarDropzone = $('#avatar-dropzone');
const acceptAvatarFile = file => {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 1 * 1024 * 1024) {
    toast('Image invalide : utilise PNG, JPG, WEBP ou GIF de 1 Mo maximum.', 'err'); return;
  }
  const transfer = new DataTransfer(); transfer.items.add(file); avatarInput.files = transfer.files;
  if (avatarDropzone) { avatarDropzone.classList.add('has-file'); const status = avatarDropzone.querySelector('.file-dropzone-status'); if (status) status.textContent = file.name; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await api.post('/auth/profile', { avatarData: String(reader.result) });
      if (currentUser) currentUser.avatarData = data.avatarData;
      renderProfile();
      toast('Photo de profil enregistrée sur ton compte MRD.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  reader.readAsDataURL(file);
};
avatarInput.onchange = e => { const file = e.target.files?.[0]; e.target.value = ''; acceptAvatarFile(file); };
if (avatarDropzone) {
  avatarDropzone.addEventListener('click', e => { if (!e.target.closest('[data-file-browse]')) avatarInput.click(); });
  avatarDropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatarInput.click(); } });
  ['dragenter','dragover'].forEach(type => avatarDropzone.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); avatarDropzone.classList.add('is-dragging'); }));
  ['dragleave','dragend'].forEach(type => avatarDropzone.addEventListener(type, e => { e.preventDefault(); avatarDropzone.classList.remove('is-dragging'); }));
  avatarDropzone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); avatarDropzone.classList.remove('is-dragging'); acceptAvatarFile(e.dataTransfer?.files?.[0]); });
}
document.addEventListener('click', e => { const button = e.target.closest('[data-file-browse]'); if (button) { e.preventDefault(); e.stopPropagation(); document.getElementById(button.dataset.fileBrowse)?.click(); } });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'change-password-form') return;
  e.preventDefault();
  const form = new FormData(e.target);
  const currentPassword = String(form.get('currentPassword') || '');
  const newPassword = String(form.get('newPassword') || '');
  const confirmPassword = String(form.get('confirmPassword') || '');
  if (newPassword !== confirmPassword) return toast('La confirmation ne correspond pas au nouveau mot de passe.', 'err');
  if (newPassword.length < 12) return toast('Le nouveau mot de passe doit contenir au moins 12 caractères.', 'err');
  const button = e.target.querySelector('button[type="submit"]');
  button.disabled = true; button.textContent = 'Mise à jour…';
  try {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    e.target.reset(); toast('Mot de passe mis à jour. Ta session reste ouverte.', 'ok');
  } catch (err) { toast(err.message, 'err'); }
  finally { button.disabled = false; button.textContent = 'Mettre à jour le mot de passe'; }
});

document.addEventListener('submit', async e => {
  if (e.target.id !== 'user-create-form') return;
  e.preventDefault();
  const form = new FormData(e.target);
  const payload = Object.fromEntries(form.entries());
  try {
    await api.post('/users/create', payload);
    e.target.reset(); toast('Compte créé. Communique les identifiants en privé.', 'ok'); await renderAccess();
  } catch (err) { toast(err.message, 'err'); }
});


// MRD Effectif / calendrier / tâches
let ws={roster:{},calendar:[],tasks:[]}, wsMembers=[], wsPerm={};
let wsSection='roster';
const wsGrades=['Commanding Officer','Assistant Commanding Officer','Expert Officer','Certified Officer'];
const wsShort={'Commanding Officer':'CO','Assistant Commanding Officer':'ACO','Expert Officer':'EO','Certified Officer':'CtO'};
const wsName=u=>[u?.displayFirstName,u?.displayLastName].filter(Boolean).join(' ').trim()||u?.username||'Membre MRD';
const wsMember=id=>wsMembers.find(u=>Number(u.id)===Number(id));
const wsDate=v=>v?new Date(v+'T12:00:00').toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';
const wsToday=()=>new Date().toISOString().slice(0,10);
const wsOwner=()=>currentUser?.role==='owner'&&currentUser?.grade==='Commanding Officer';
const wsAvatar=u=>u?.avatarData?'<img class="ws-avatar" src="'+u.avatarData+'" alt="">':'<span class="ws-avatar ws-avatar-fallback">'+esc(wsName(u).charAt(0).toUpperCase())+'</span>';
async function loadWorkspace(){
 const d=await api.post('/workspace/get',{});
 ws=d.workspace||{roster:{},calendar:[],tasks:[]};wsMembers=d.members||[];
 wsPerm={roster:!!d.canManageRoster,calendar:!!d.canManageCalendar,tasks:!!d.canManageTasks};
 const me=wsMembers.find(u=>Number(u.id)===Number(currentUser?.id));if(me)currentUser={...currentUser,...me};
 applyPermissions();renderWorkspace();
}
function renderWorkspace(){
 const root=$('#effectif');if(!root)return;
 const tabs=[['roster','♙','Effectif'],['calendar','▦','Calendrier'],['tasks','☑','To-do list']];
 root.innerHTML='<section class="page-intro ws-intro"><div><div class="eyebrow">MRD WORKSPACE · VIE DE DIVISION</div><h1>Effectif <span class="ws-title-dot">/</span> Coordination</h1><p>Membres, rendez-vous et suivi des missions réunis au même endroit.</p></div><div class="ws-intro-mark">MRD<small>FIELD OFFICE</small></div></section><div class="ws-tabs">'+tabs.map(([id,ico,label])=>'<button class="ws-tab '+(wsSection===id?'active':'')+'" data-ws-tab="'+id+'"><span>'+ico+'</span>'+label+(id==='roster'?'<small>'+wsMembers.length+'</small>':'')+'</button>').join('')+'</div><div id="ws-content"></div>';
 const c=$('#ws-content');if(wsSection==='roster')c.innerHTML=renderWsRoster();if(wsSection==='calendar')c.innerHTML=renderWsCalendar();if(wsSection==='tasks')c.innerHTML=renderWsTasks();
 initMrdDatePickers(c);
}
function renderWsRoster(){
 const ordered=[...wsMembers].sort((a,b)=>wsGrades.indexOf(a.grade)-wsGrades.indexOf(b.grade)||Number(ws.roster?.[a.id]?.order??9999)-Number(ws.roster?.[b.id]?.order??9999)||wsName(a).localeCompare(wsName(b),'fr'));
 const stats='<div class="ws-stat-grid"><article class="ws-stat"><span>Effectif actif</span><strong>'+wsMembers.length+'</strong><small>Membres enregistrés</small></article><article class="ws-stat"><span>À venir</span><strong>'+ws.calendar.filter(e=>e.date>=wsToday()).length+'</strong><small>Rendez-vous planifiés</small></article><article class="ws-stat"><span>Tâches</span><strong>'+ws.tasks.filter(t=>Object.values(t.progress||{}).some(x=>x.status==='doing')).length+'</strong><small>En cours</small></article></div>';
 const tiers=wsGrades.map((grade,i)=>{
  const people=ordered.filter(u=>u.grade===grade);
  const columnCount=people.length<=1?1:people.length<=3?3:5;
  const memberColumns=people.map((_,index)=>{if(people.length===1)return 1;if(people.length===2)return index===0?1:3;if(people.length===3)return index+1;const center=(columnCount+1)/2;if(people.length>5){return [center,center-1,center+1,center-2,center+2][index%5];}if(people.length%2===0){const offset=Math.floor(index/2);return index%2===0?center-1-offset:center+1+offset;}const offset=Math.ceil(index/2);return index===0?center:index%2===1?center-offset:center+offset;});
  const members=people.map((u,memberIndex)=>{
   const m=ws.roster?.[u.id]||{};
   const dates=(m.arrivalDate||m.promotionDate)?'<div class="ws-member-tags">'+(m.arrivalDate?'<span class="ws-member-tag"><span class="ws-tag-icon">↗</span><span><small>ARRIVÉE</small><strong>'+esc(wsDate(m.arrivalDate))+'</strong></span></span>':'')+(m.promotionDate?'<span class="ws-member-tag promotion"><span class="ws-tag-icon">✦</span><span><small>PROMOTION</small><strong>'+esc(wsDate(m.promotionDate))+'</strong></span></span>':'')+'</div>':'';
   const note=m.publicNotes?'<div class="ws-member-note"><span class="ws-member-note-label">Note de service</span><p>'+esc(m.publicNotes)+'</p></div>':'';
   return '<article class="ws-member-card" data-grade="'+i+'" style="grid-column:'+memberColumns[memberIndex]+'"><div class="ws-member-top">'+wsAvatar(u)+'<div class="ws-member-identity"><strong>'+esc(wsName(u))+'</strong><span>'+wsShort[u.grade]+'</span><small>@'+esc(u.username)+'</small></div>'+(Number(u.id)===Number(currentUser?.id)?'<span class="ws-you">VOUS</span>':'')+'</div>'+(u.accreditations?.length?'<div class="accreditation-tags ws-accreditations">'+accreditationTags(u.accreditations)+'</div>':'')+dates+(wsPerm.roster?'<details class="ws-edit-details"><summary>Gérer la fiche</summary><form class="ws-roster-form" data-id="'+u.id+'"><div class="ws-form-grid"><label>Prénom affiché<input name="first" maxlength="40" value="'+esc(u.displayFirstName||'')+'"></label><label>Nom affiché<input name="last" maxlength="40" value="'+esc(u.displayLastName||'')+'"></label><label>Date d’arrivée<input type="date" name="arrival" value="'+esc(m.arrivalDate||'')+'"></label><label>Date de promotion<input type="date" name="promotion" value="'+esc(m.promotionDate||'')+'"></label><label>Ordre d’affichage<input type="number" name="order" min="0" max="9999" value="'+Number(m.order||0)+'"></label></div><label>Note visible à l’effectif<textarea name="publicNotes" maxlength="500" rows="2">'+esc(m.publicNotes||'')+'</textarea></label><label>Notes internes CO<textarea name="privateNotes" maxlength="1500" rows="3">'+esc(m.privateNotes||'')+'</textarea></label><button class="btn primary" type="submit">Enregistrer la fiche</button></form></details>':'')+note+'</article>';
  }).join('');
  return '<section class="ws-org-tier tier-'+(i+1)+'"><div class="ws-tier-heading"><span class="ws-tier-index">0'+(i+1)+'</span><div><span class="ws-tier-kicker">NIVEAU HIÉRARCHIQUE</span><h3>'+esc(grade)+'</h3><small>'+wsShort[grade]+' <i></i> '+people.length+' membre(s)</small></div><span class="ws-tier-rail" aria-hidden="true"></span></div><div class="ws-tier-members '+(people.length>1?'has-multiple':'single-member')+'" style="--ws-columns:'+columnCount+';--ws-connector-inset:'+100/(2*columnCount)+'%">'+(members||'<div class="ws-empty-grade">Aucun membre à ce grade pour le moment.</div>')+'</div></section>';
 }).join('');
 return stats+'<div class="ws-section-heading"><div><span class="ws-kicker">ORGANISATION</span><h2>Organigramme MRD</h2><p>Une vue hiérarchique des quatre grades, des membres et de leur ancienneté.</p></div></div><section class="ws-org-board"><div class="ws-org-board-head"><span class="ws-org-pulse"></span><div><strong>MRD · STRUCTURE OPÉRATIONNELLE</strong><small>CHAÎNE DE COMMANDEMENT <span>·</span> '+wsMembers.length+' MEMBRES</small></div><span class="ws-org-board-mark">LSPD / MRD</span></div><div class="ws-org-chart">'+tiers+'</div><div class="ws-org-board-foot"><span>MEDIA RELATIONS DIVISION</span><span>ORGANIGRAMME <b>·</b> EFFECTIF ACTIF</span></div></section>';
}
let wsCalendarWeekOffset=0;
function wsCalendarWeekStart(offset=wsCalendarWeekOffset){
 const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+offset*7);return d;
}
function wsCalendarISO(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function renderWsCalendar(){
 const events=[...ws.calendar].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 const start=wsCalendarWeekStart(),end=new Date(start);end.setDate(start.getDate()+6);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const iso=wsCalendarISO(d),items=events.filter(e=>e.date===iso);return '<section class="ws-week-day '+(iso===wsToday()?'is-today':'')+'"><header><span>'+d.toLocaleDateString('fr-FR',{weekday:'short'}).replace('.','')+'</span><strong>'+d.getDate()+'</strong></header><div class="ws-week-events">'+(items.length?items.map(e=>'<article class="ws-week-event" title="'+esc(e.title)+'"><small>'+esc(e.time||'Heure à préciser')+'</small><strong>'+esc(e.title)+'</strong>'+(e.location?'<span>'+esc(e.location)+'</span>':'')+(wsPerm.calendar?'<button type="button" data-ws-action="edit-event" data-id="'+esc(e.id)+'" aria-label="Modifier '+esc(e.title)+'">Modifier</button>':'')+'</article>').join(''):'<span class="ws-week-empty">—</span>')+'</div></section>'}).join('');
 const fmt=d=>d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'});
 return '<div class="ws-section-heading"><div><span class="ws-kicker">PLANIFICATION</span><h2>Calendrier de la division</h2><p>Une vue par semaine pour visualiser les rendez-vous et coordonner la MRD.</p></div>'+(wsPerm.calendar?'<button class="btn primary" data-ws-action="new-event">＋ Nouvel événement</button>':'')+'</div>'+(wsPerm.calendar?wsEventForm():'')+'<section class="ws-week-calendar"><div class="ws-week-toolbar"><div><span class="ws-kicker">VUE HEBDOMADAIRE</span><strong>'+fmt(start)+' – '+fmt(end)+'</strong></div><div class="ws-week-nav"><button type="button" class="btn" data-ws-action="week-prev" aria-label="Semaine précédente">←</button><button type="button" class="btn" data-ws-action="week-today">Aujourd’hui</button><button type="button" class="btn" data-ws-action="week-next" aria-label="Semaine suivante">→</button></div></div><div class="ws-week-grid">'+days+'</div><div class="ws-week-foot">'+events.filter(e=>e.date>=wsCalendarISO(start)&&e.date<=wsCalendarISO(end)).length+' événement(s) cette semaine</div></section><div class="ws-calendar-list-heading"><span class="ws-kicker">TOUS LES RENDEZ-VOUS</span><span>'+events.length+' événement(s)</span></div><div class="ws-calendar-list">'+(events.length?events.map(e=>{
 const signups=Array.isArray(e.signups)?e.signups:[],mine=signups.find(s=>Number(s.userId)===Number(currentUser.id));
 return '<article class="ws-event-card"><div class="ws-event-date"><strong>'+esc(e.date.slice(8,10))+'</strong><span>'+esc(new Date(e.date+'T12:00:00').toLocaleDateString('fr-FR',{month:'short'}))+'</span><small>'+esc(e.time||'—')+'</small></div><div class="ws-event-main"><div class="ws-event-title-row"><h3>'+esc(e.title)+'</h3><span class="ws-status '+(e.date>=wsToday()?'upcoming':'')+'">'+(e.date>=wsToday()?'À VENIR':'TERMINÉ')+'</span></div><p>'+esc(e.description||'')+'</p><div class="ws-event-meta"><span>'+esc(e.location||'Lieu à préciser')+'</span><span>♙ '+signups.length+' inscrit(s)</span></div><div class="ws-signup-avatars">'+signups.map(s=>{const u=wsMember(s.userId);return u?wsAvatar(u):''}).join('')+'</div>'+(mine?'<details class="ws-report"><summary>Mes notes & travail rendu</summary><form class="ws-report-form" data-id="'+esc(e.id)+'"><label>Notes personnelles<textarea name="notes" rows="2" maxlength="1200">'+esc(mine.notes||'')+'</textarea></label><label>Travail réalisé<textarea name="work" rows="3" maxlength="2000" placeholder="Décris concrètement ce que tu as réalisé…">'+esc(mine.work||'')+'</textarea></label><button class="btn primary" type="submit">Enregistrer mon compte rendu</button></form></details>':'')+'<div class="ws-event-actions">'+(mine?'<button class="btn" data-ws-action="leave" data-id="'+esc(e.id)+'">Se désinscrire</button>':'<button class="btn primary" data-ws-action="join" data-id="'+esc(e.id)+'">＋ M’inscrire</button>')+(wsPerm.calendar?'<button class="btn" data-ws-action="edit-event" data-id="'+esc(e.id)+'">Modifier</button><button class="btn ws-danger" data-ws-action="delete-event" data-id="'+esc(e.id)+'">Supprimer</button>':'')+'</div></div></article>';
 }).join(''):'<div class="ws-empty"><strong>Aucun événement planifié</strong><p>Les prochains rendez-vous apparaîtront ici.</p></div>')+'</div>';
}
function wsEventForm(event){
 return '<form class="ws-editor-form" id="ws-event-form" data-id="'+esc(event?.id||'')+'" hidden><div class="ws-form-top"><h3>'+ (event?'Modifier l’événement':'Programmer un événement')+'</h3><button type="button" class="ws-icon-button" data-ws-action="cancel-form">×</button></div><div class="ws-form-grid"><label>Intitulé<input name="title" required maxlength="120" value="'+esc(event?.title||'')+'"></label><label>Date<input name="date" type="date" required value="'+esc(event?.date||wsToday())+'"></label><label>Heure<input name="time" type="time" value="'+esc(event?.time||'')+'"></label><label>Lieu<input name="location" maxlength="160" value="'+esc(event?.location||'')+'"></label></div><label>Description<textarea name="description" rows="3" maxlength="1500">'+esc(event?.description||'')+'</textarea></label><button class="btn primary" type="submit">Enregistrer l’événement</button></form>';
}
function renderWsTasks(){
 const tasks=[...ws.tasks].sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
 const mine=t=>t.progress?.[String(currentUser.id)]||{status:'todo',report:''},done=tasks.filter(t=>mine(t).status==='done').length;
 return '<div class="ws-section-heading"><div><span class="ws-kicker">SUIVI OPÉRATIONNEL</span><h2>To-do list</h2><p>Consignes, responsables et comptes rendus de travail de la MRD.</p></div>'+(wsPerm.tasks?'<button class="btn primary" data-ws-action="new-task">＋ Nouvelle tâche</button>':'')+'</div><div class="ws-task-progress"><div><span>Ma progression</span><strong>'+done+' / '+tasks.length+' terminée(s)</strong></div><div class="ws-progress-track"><span style="width:'+(tasks.length?Math.round(done/tasks.length*100):0)+'%"></span></div></div>'+(wsPerm.tasks?wsTaskForm():'')+'<div class="ws-task-list">'+(tasks.length?tasks.map(t=>{
 const prog=mine(t),assigned=t.assignedTo?wsMember(t.assignedTo):null,canUpdate=!t.assignedTo||Number(t.assignedTo)===Number(currentUser.id)||wsPerm.tasks,labels={todo:'À faire',doing:'En cours',done:'Terminée'};
 return '<article class="ws-task-card status-'+esc(prog.status)+'"><div class="ws-task-check">'+(prog.status==='done'?'✓':prog.status==='doing'?'↻':'·')+'</div><div class="ws-task-main"><div class="ws-task-title-row"><h3>'+esc(t.title)+'</h3><span class="ws-task-status">'+labels[prog.status]+'</span></div><p>'+esc(t.description||'')+'</p><div class="ws-task-meta"><span>Échéance : '+wsDate(t.dueDate)+'</span><span>Responsable : '+esc(assigned?wsName(assigned):'Toute la division')+'</span></div><details class="ws-report"><summary>Mon avancement & travail rendu</summary><form class="ws-task-progress-form" data-id="'+esc(t.id)+'"><label>Statut<select name="status" '+(canUpdate?'':'disabled')+'>'+Object.entries(labels).map(([v,l])=>'<option value="'+v+'" '+(prog.status===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Travail réalisé<textarea name="report" rows="3" maxlength="2000" '+(canUpdate?'':'disabled')+'>'+esc(prog.report||'')+'</textarea></label>'+(canUpdate?'<button class="btn primary" type="submit">Enregistrer mon avancement</button>':'<small>Tâche attribuée à un autre membre.</small>')+'</form></details>'+(wsPerm.tasks?'<div class="ws-event-actions"><button class="btn" data-ws-action="edit-task" data-id="'+esc(t.id)+'">Modifier</button><button class="btn ws-danger" data-ws-action="delete-task" data-id="'+esc(t.id)+'">Supprimer</button></div>':'')+'</div></article>';
 }).join(''):'<div class="ws-empty"><strong>Aucune tâche en cours</strong><p>Les nouvelles consignes apparaîtront ici.</p></div>')+'</div>';
}
function wsTaskForm(task){
 return '<form class="ws-editor-form" id="ws-task-form" data-id="'+esc(task?.id||'')+'" hidden><div class="ws-form-top"><h3>'+(task?'Modifier la tâche':'Créer une tâche')+'</h3><button type="button" class="ws-icon-button" data-ws-action="cancel-form">×</button></div><div class="ws-form-grid"><label>Titre<input name="title" required maxlength="120" value="'+esc(task?.title||'')+'"></label><label>Échéance<input type="date" name="dueDate" value="'+esc(task?.dueDate||'')+'"></label><label>Responsable<select name="assignedTo"><option value="">Toute la division</option>'+wsMembers.map(u=>'<option value="'+u.id+'" '+(Number(task?.assignedTo)===Number(u.id)?'selected':'')+'>'+esc(wsName(u))+'</option>').join('')+'</select></label></div><label>Description<textarea name="description" rows="3" maxlength="1500">'+esc(task?.description||'')+'</textarea></label><button class="btn primary" type="submit">Enregistrer la tâche</button></form>';
}
async function wsReload(section=wsSection){wsSection=section;await loadWorkspace();}
document.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-ws-tab]');if(tab){wsSection=tab.dataset.wsTab;renderWorkspace();return;}
 const b=e.target.closest('[data-ws-action]');if(!b)return;
 const action=b.dataset.wsAction,id=b.dataset.id;
 if(action==='week-prev'||action==='week-next'||action==='week-today'){wsCalendarWeekOffset=action==='week-prev'?wsCalendarWeekOffset-1:action==='week-next'?wsCalendarWeekOffset+1:0;renderWorkspace();return;}
 try{
 if(action==='new-event'){let f=$('#ws-event-form');if(!f){$('#ws-content').insertAdjacentHTML('afterbegin',wsEventForm());f=$('#ws-event-form');if(f)initMrdDatePickers(f);}if(!f){toast('Le formulaire événement ne peut pas être chargé.','err');return;}f.hidden=false;f.scrollIntoView({behavior:'smooth',block:'center'});return;}
 if(action==='new-task'){let f=$('#ws-task-form');if(!f){$('#ws-content').insertAdjacentHTML('afterbegin',wsTaskForm());f=$('#ws-task-form');if(f)initMrdDatePickers(f);}if(!f){toast('Le formulaire de tâche ne peut pas être chargé.','err');return;}f.hidden=false;f.scrollIntoView({behavior:'smooth',block:'center'});return;}
 if(action==='cancel-form'){const f=b.closest('form');if(f)f.hidden=true;return;}
 if(action==='edit-event'){const item=ws.calendar.find(x=>x.id===id);$('#ws-event-form')?.remove();$('#ws-content').insertAdjacentHTML('afterbegin',wsEventForm(item));$('#ws-event-form').hidden=false;return;}
 if(action==='edit-task'){const item=ws.tasks.find(x=>x.id===id);$('#ws-task-form')?.remove();$('#ws-content').insertAdjacentHTML('afterbegin',wsTaskForm(item));$('#ws-task-form').hidden=false;return;}
 if(action==='delete-event'||action==='delete-task'){if(!await confirmDialog('Cette suppression est définitive.',{title:'Confirmer la suppression',confirmText:'Supprimer',danger:true}))return;await api.post('/workspace/save',action==='delete-event'?{action:'event-delete',eventId:id}:{action:'task-delete',taskId:id});await wsReload();return;}
 if(action==='join'||action==='leave'){await api.post('/workspace/save',{action:'signup',eventId:id,join:action==='join'});toast(action==='join'?'Inscription confirmée.':'Désinscription enregistrée.','ok');await wsReload('calendar');}
 }catch(err){toast(err.message,'err');}
});
document.addEventListener('submit',async e=>{
 const f=e.target;
 try{
 if(f.matches('.ws-roster-form')){e.preventDefault();const d=new FormData(f),id=Number(f.dataset.id);await api.post('/users/profile',{id,displayFirstName:d.get('first'),displayLastName:d.get('last')});await api.post('/workspace/save',{action:'roster',userId:id,roster:{order:Number(d.get('order')||0),arrivalDate:d.get('arrival')||'',promotionDate:d.get('promotion')||'',publicNotes:d.get('publicNotes'),privateNotes:d.get('privateNotes')}});toast('Fiche membre enregistrée.','ok');await wsReload('roster');return;}
 if(f.id==='ws-event-form'){e.preventDefault();const d=new FormData(f);await api.post('/workspace/save',{action:'event-upsert',event:{id:f.dataset.id,title:d.get('title'),date:d.get('date'),time:d.get('time'),location:d.get('location'),description:d.get('description')}});toast('Événement enregistré.','ok');await wsReload('calendar');return;}
 if(f.matches('.ws-report-form')){e.preventDefault();const d=new FormData(f);await api.post('/workspace/save',{action:'event-report',eventId:f.dataset.id,notes:d.get('notes'),work:d.get('work')});toast('Compte rendu enregistré.','ok');await wsReload('calendar');return;}
 if(f.id==='ws-task-form'){e.preventDefault();const d=new FormData(f);await api.post('/workspace/save',{action:'task-upsert',task:{id:f.dataset.id,title:d.get('title'),dueDate:d.get('dueDate'),assignedTo:d.get('assignedTo'),description:d.get('description')}});toast('Tâche enregistrée.','ok');await wsReload('tasks');return;}
 if(f.matches('.ws-task-progress-form')){e.preventDefault();const d=new FormData(f);await api.post('/workspace/save',{action:'task-progress',taskId:f.dataset.id,status:d.get('status'),report:d.get('report')});toast('Avancement enregistré.','ok');await wsReload('tasks');return;}
 if(f.id==='display-profile-form'){e.preventDefault();const d=new FormData(f),r=await api.post('/auth/profile',{displayFirstName:d.get('first'),displayLastName:d.get('last')});currentUser={...currentUser,...r.user};applyPermissions();renderProfile();toast('Nom d’affichage enregistré.','ok');return;}
 }catch(err){e.preventDefault();toast(err.message||'Enregistrement impossible.','err');}
});

initMrdDatePickers(document);
const activePageLabel = $('#active-page-label');
if (activePageLabel) activePageLabel.textContent = PAGE_LABELS.edit;
applyTheme(localStorage.getItem(KEY.theme) || 'dark');
try { load(JSON.parse(localStorage.getItem(KEY.draft)) || {}); } catch { load({}); }
$('.layout').dataset.activeTab = 'edit';
setPreview(true);
restoreSession();
