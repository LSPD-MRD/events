const WORKER_URL = 'https://mrd-panel-test.biscuitytb2102.workers.dev';
const KEY = { draft: 'mrdpanel-draft', access: 'mrdpanel-config', theme: 'mrd-theme', token: 'mrdpanel-session', avatar: 'mrdpanel-profile-avatar' };
const PAGE_LABELS = { edit: 'Éditeur', portal: 'Portail', access: 'Accès', team: 'Équipe', profile: 'Mon profil' };
const PORTAL_URL = '../';
let currentUser = null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6500 : 3500);
};

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
    const token = sessionStorage.getItem(KEY.token);

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
      if (response.status === 401) {
        signOut(false);
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

const renderAccess = async () => {
  const c = api.cfg();
  const owner = currentUser?.role === 'owner';
  $('#access').innerHTML = `
    <section class="page-intro access-intro"><div><div class="eyebrow">MRD WORKSPACE <span>· ADMINISTRATION</span></div><h1>Accès & sécurité</h1><p>Gère les connexions au panel, les rôles de l’équipe et la liaison avec le serveur MRD.</p></div><div class="intro-mark">⌘</div></section>
    <div class="access-grid">
      <section class="card access-security">
        <header class="card-head"><span class="access-kicker">SESSION ACTIVE</span><h2>Compte connecté</h2><p>Les autorisations dépendent du rôle associé à ton compte.</p></header>
        <div class="card-body">
          <div class="access-user"><div class="access-user-avatar">${esc((currentUser?.username || 'M').slice(0,1).toUpperCase())}</div><div class="access-user-meta"><strong>${esc(currentUser?.username || 'Non connecté')}</strong><span>${esc(currentUser?.grade || 'Aucun grade')}</span></div><span class="role-pill">${esc(currentUser?.role || '—')}</span></div>
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
            <div class="field"><label for="new-grade">Grade affiché</label><input id="new-grade" name="grade" required maxlength="60" placeholder="ex. Media Officer"></div>
            <div class="field"><label for="new-role">Niveau d’accès</label><div class="select-wrap"><select id="new-role" name="role"><option value="viewer">Lecteur · consultation</option><option value="editor" selected>Éditeur · événements</option><option value="admin">Administrateur · gestion</option></select><span class="select-chevron" aria-hidden="true">⌄</span></div></div>
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
      $('#users-list').innerHTML = users.map(u => `<div class="user-row access-user-row"><div class="access-user-avatar small">${esc((u.username || 'M').slice(0,1).toUpperCase())}</div><div class="access-user-details"><b>${esc(u.username)}</b><small>${esc(u.grade)} <span>·</span> ${esc(u.role)} <span>·</span> <i class="${u.active ? 'status-active' : 'status-disabled'}">${u.active ? 'Actif' : 'Désactivé'}</i></small></div><button class="btn ${u.active ? 'danger' : ''} access-user-action" data-action="user-disable" data-user-id="${esc(u.id)}" ${u.id === currentUser.id || !u.active ? 'disabled' : ''}>${u.active ? 'Désactiver' : 'Désactivé'}</button></div>`).join('') || '<p class="empty">Aucun compte n’a été créé.</p>';
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
      <header class="card-head"><h2>Photo de profil</h2><p>Cette image est enregistrée sur ton compte MRD et reste disponible sur tes autres appareils.</p></header>
      <div class="card-body">
        <div class="profile-edit-row"><div class="profile-preview-avatar" id="profile-preview-avatar"></div><div><strong>${esc(currentUser?.username || 'Compte MRD')}</strong><small>${esc(currentUser?.grade || '')} · ${esc(currentUser?.role || '')}</small></div></div>
        <div class="actions"><button class="btn" type="button" data-action="choose-avatar">Choisir une image</button><button class="btn" type="button" data-action="remove-avatar">Retirer la photo</button></div>
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

const setTab = async name => {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  const label = $('#active-page-label');
  if (label) label.textContent = PAGE_LABELS[name] || 'Espaces';
  const layout = $('.layout');
  if (layout) layout.dataset.activeTab = name;
  closeMenus();
  setPreview(name === 'edit' && previewPreference, false);
  if (name === 'team') renderTeam();
  if (name === 'portal') {
    try { list = await loadList(); renderPortal(); } catch (err) { toast('Impossible de charger le portail : ' + err.message, 'err'); }
  }
  if (name === 'access') await renderAccess();
  if (name === 'profile') renderProfile();
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
  if ((!ev.card.date || !ev.meta.date) && !confirm('Date manquante sur la carte ou sur la page. Publier quand même ?')) return;
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

const WIP = {
  newsroom: { icon: '✎', title: 'Rédaction & actualités', subtitle: 'Un espace éditorial pour préparer, relire et publier les communications de la MRD.', modules: ['Articles et communiqués', 'Brouillons & relecture', 'Calendrier éditorial'], note: 'La rédaction et la publication d’articles ne sont pas encore activées.' },
  media: { icon: '▧', title: 'Bibliothèque média', subtitle: 'Centraliser les visuels, captures, logos et ressources de communication.', modules: ['Galerie de visuels', 'Kit de marque MRD', 'Pièces jointes & crédits'], note: 'L’import et la gestion des fichiers seront ajoutés dans une prochaine version.' },

  archive: { icon: '◷', title: 'Archives & rapports', subtitle: 'Retrouver les anciennes publications et conserver une trace des opérations.', modules: ['Historique des publications', 'Rapports d’événements', 'Recherche & filtres'], note: 'Les archives centralisées ne sont pas encore connectées.' }
};

const renderWip = name => {
  const w = WIP[name];
  if (!w) return;
  const root = $('#' + name);
  root.innerHTML = `<section class="wip-hero"><div class="wip-mark">${w.icon}</div><div><div class="eyebrow">MEDIA RELATIONS DIVISION <span>· EN DÉVELOPPEMENT</span></div><h1>${w.title}</h1><p>${w.subtitle}</p></div><span class="wip-badge">WIP</span></section><section class="wip-grid">${w.modules.map((m, i) => `<article class="wip-module"><span class="module-index">0${i + 1}</span><h3>${m}</h3><p>Module prévu dans le futur espace MRD.</p><span class="module-state">Bientôt disponible</span></article>`).join('')}</section><section class="wip-note"><span class="wip-note-icon">⌁</span><div><strong>Cette section est en préparation</strong><p>${w.note} Les outils déjà disponibles restent accessibles dans Éditeur, Portail et Accès.</p></div></section>`;
};


const renderTeam = async () => {
  const root = $('#team');
  if (currentUser?.role !== 'owner') {
    root.innerHTML = `<section class="wip-hero"><div class="wip-mark">♙</div><div><div class="eyebrow">MEDIA RELATIONS DIVISION · ACCÈS RESTREINT</div><h1>Gestion des comptes</h1><p>La liste des comptes et leur création sont réservées au Owner.</p></div><span class="wip-badge">OWNER</span></section>`;
    return;
  }
  root.innerHTML = `<section class="page-intro"><div><div class="eyebrow">SÉCURITÉ · OWNER</div><h1>Comptes & grades</h1><p>Créer des identifiants individuels et attribuer le niveau d’accès adapté.</p></div></section>
  <section class="card"><header class="card-head"><h2>Créer un compte</h2><p>Le mot de passe initial est transmis à la personne en privé.</p></header><div class="card-body">
  <form id="user-create-form" class="user-create">
    <div class="field"><label>Identifiant</label><input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off"></div>
    <div class="field"><label>Grade affiché</label><input name="grade" required maxlength="60" placeholder="Ex. Media Officer"></div>
    <div class="field"><label>Rôle système</label><select name="role"><option value="viewer">Lecteur — consultation</option><option value="editor" selected>Éditeur — événements</option><option value="admin">Administrateur — gestion opérationnelle</option></select></div>
    <div class="field"><label>Mot de passe temporaire</label><input name="password" required minlength="12" type="password" autocomplete="new-password"></div>
    <div class="actions"><button class="btn primary" type="submit">Créer le compte</button></div>
  </form></div></section><section class="card"><header class="card-head"><h2>Comptes existants</h2><p>Cette liste est visible uniquement par le Owner.</p></header><div class="card-body"><div id="users-list" class="user-admin">Chargement…</div></div></section>`;
  try {
    const data = await api.post('/users/list', {});
    $('#users-list').innerHTML = data.users.map(u => `<div class="user-row"><div><b>${esc(u.username)}</b><small>${esc(u.grade)} · ${esc(u.role)} · ${u.active ? 'Actif' : 'Désactivé'}</small></div><button class="btn danger" data-action="user-disable" data-user-id="${esc(u.id)}" ${u.id === currentUser.id ? 'disabled' : ''}>${u.active ? 'Désactiver' : 'Désactivé'}</button></div>`).join('') || '<p>Aucun compte.</p>';
  } catch (e) { $('#users-list').textContent = e.message; }
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
  'p-del': (el, i) => { if (confirm('Retirer du portail ? Les fichiers de la page restent dans le dépôt.')) { list.splice(i, 1); renderPortal(); } },
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
  'user-disable': async el => { if (!confirm('Désactiver ce compte ?')) return; await api.post('/users/disable', { id: el.dataset.userId }); await renderAccess(); toast('Compte désactivé.', 'ok'); }
};

async function signIn(username, password) {
  const c = api.cfg();
  let r;
  try { r = await fetch(c.url.replace(/\/$/, '') + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) }); }
  catch { throw new Error('Connexion au serveur impossible. Vérifie l’URL du Worker, sa disponibilité et le réglage CORS.'); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || ('Connexion refusée (' + r.status + ')'));
  sessionStorage.setItem(KEY.token, data.token);
  currentUser = data.user;
  $('#login-screen').hidden = true;
  $('#profile-menu-name').textContent = currentUser.username;
  $('#profile-menu-grade').textContent = currentUser.grade + ' · ' + currentUser.role;
  $('#login-error').textContent = '';
  applyProfileAvatar();
  applyPermissions();
}
async function signOut(show = true) {
  try { if (sessionStorage.getItem(KEY.token)) await api.post('/auth/logout', {}); } catch {}
  sessionStorage.removeItem(KEY.token); currentUser = null;
  $('#login-screen').hidden = false;
  $('#login-pass').value = '';
  closeMenus();
  if (show) toast('Déconnexion effectuée.', 'ok');
}
function applyPermissions() {
  const role = currentUser?.role || 'viewer';
  const canEdit = ['owner','admin','editor'].includes(role);
  $('#save-actions').hidden = !canEdit;
  const home = $('.home-icon'); if (home) home.href = publicPortalUrl();
  $('#profile-menu-name').textContent = currentUser?.username || 'Mon compte';
  $('#profile-menu-grade').textContent = (currentUser?.grade || '') + (currentUser?.role ? ' · ' + currentUser.role : '');
  applyProfileAvatar();
  $$('[data-action="tab"]').forEach(b => {
    if (b.dataset.tab === 'team') b.hidden = role !== 'owner';
    if (['newsroom','media','archive'].includes(b.dataset.tab)) b.hidden = true;
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
  const home = $('.home-icon'); if (home) home.href = publicPortalUrl();
  const token = sessionStorage.getItem(KEY.token);
  if (!token) return;
  try {
    const data = await api.post('/auth/me', {});
    currentUser = data.user; $('#login-screen').hidden = true;
    $('#profile-menu-name').textContent = currentUser.username;
    $('#profile-menu-grade').textContent = currentUser.grade + ' · ' + currentUser.role;
    applyProfileAvatar();
    applyPermissions();
  } catch { sessionStorage.removeItem(KEY.token); }
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
$('#avatar-file').onchange = async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 1 * 1024 * 1024) {
    toast('Image invalide : utilise PNG, JPG, WEBP ou GIF de 1 Mo maximum.', 'err'); return;
  }
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

applyTheme(localStorage.getItem(KEY.theme) || 'dark');
try { load(JSON.parse(localStorage.getItem(KEY.draft)) || {}); } catch { load({}); }
$('.layout').dataset.activeTab = 'edit';
setPreview(true);
restoreSession();
