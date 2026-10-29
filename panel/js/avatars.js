async function flushAvatarQueue() {
  avatarBatchScheduled = false;
  const entries = [...avatarRequestQueue.entries()];
  avatarRequestQueue.clear();
  for (let offset = 0; offset < entries.length; offset += 50) {
    const batch = entries.slice(offset, offset + 50);
    try {
      const result = await api.post('/users/avatars', { ids: batch.map(([id]) => Number(id)) });
      const avatars = result.avatars || {};
      batch.forEach(([id, resolve]) => resolve(avatars[id] || null));
    } catch {
      batch.forEach(([, resolve]) => resolve(null));
    }
  }
  if (avatarRequestQueue.size && !avatarBatchScheduled) {
    avatarBatchScheduled = true;
    queueMicrotask(flushAvatarQueue);
  }
}

function fetchAvatarData(id) {
  const key = String(id || '');
  if (!key) return Promise.resolve(null);
  if (avatarDataCache.has(key)) return avatarDataCache.get(key);
  const promise = new Promise((resolve) => {
    avatarRequestQueue.set(key, resolve);
    if (!avatarBatchScheduled) {
      avatarBatchScheduled = true;
      queueMicrotask(flushAvatarQueue);
    }
  });
  avatarDataCache.set(key, promise);
  return promise;
}

function revealLoadedAvatar(image) {
  image.classList.add('is-loaded');
  image.hidden = false;
  if (image.id === 'profile-avatar') {
    const placeholder = $('#profile-avatar-placeholder');
    if (placeholder) placeholder.hidden = true;
    return;
  }
  const previous = image.previousElementSibling;
  if (
    previous?.classList.contains('avatar-fallback') ||
    previous?.classList.contains('profile-avatar-placeholder')
  ) {
    previous.classList.add('is-hidden');
  }
  const next = image.nextElementSibling;
  if (next?.classList.contains('profile-avatar-placeholder')) next.hidden = true;
}

async function loadDeferredAvatar(image) {
  const src = await fetchAvatarData(image.dataset.avatarUser);
  if (!image.isConnected) return;
  if (!src) {
    image.classList.add('is-missing');
    if (image.id === 'profile-avatar') {
      image.hidden = true;
      const placeholder = $('#profile-avatar-placeholder');
      if (placeholder) placeholder.hidden = false;
    }
    return;
  }
  image.addEventListener('load', () => revealLoadedAvatar(image), { once: true });
  image.addEventListener(
    'error',
    () => {
      image.classList.add('is-missing');
      image.removeAttribute('src');
      if (image.id === 'profile-avatar') {
        image.hidden = true;
        const placeholder = $('#profile-avatar-placeholder');
        if (placeholder) placeholder.hidden = false;
      }
    },
    { once: true },
  );
  image.src = src;
  if (image.complete && image.naturalWidth) revealLoadedAvatar(image);
}

const avatarObserver =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            avatarObserver.unobserve(entry.target);
            loadDeferredAvatar(entry.target);
          });
        },
        { rootMargin: '160px' },
      )
    : null;

function hydrateAvatars(root = document) {
  if (!root?.querySelectorAll) return;
  const images = [
    ...(root.matches?.('img[data-avatar-user]') ? [root] : []),
    ...root.querySelectorAll('img[data-avatar-user]'),
  ];
  images.forEach((image) => {
    if (image.dataset.avatarReady === 'true') return;
    image.dataset.avatarReady = 'true';
    if (avatarObserver) avatarObserver.observe(image);
    else loadDeferredAvatar(image);
  });
}

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

const segment = (action, path, options, current) =>
  `<div class="seg">${Object.entries(options)
    .map(
      ([value, label]) =>
        `<button type="button" class="${value === current ? 'active' : ''}" data-action="${action}" data-path="${path}" data-value="${value}">${label}</button>`,
    )
    .join('')}</div>`;

const toggle = (key, label, on) =>
  `<label class="switch"><input type="checkbox" data-s="${key}"${on ? ' checked' : ''}><span></span>${label}</label>`;

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
    <div class="field"><label>Type de bloc</label><select data-s="type">${Object.entries(TYPES)
      .map(([k, v]) => `<option value="${k}"${k === s.type ? ' selected' : ''}>${v.label}</option>`)
      .join('')}</select></div>
    <div class="field"><label>Chapeau</label><input data-s="lead" value="${esc(s.lead)}" placeholder="Phrase d'introduction au-dessus du contenu"></div>
    <div class="field"><label>Contenu</label><textarea data-s="body" rows="6">${esc(s.body)}</textarea><small>${esc(TYPES[s.type].hint)}</small></div>
    <div class="field"><label>Encadré vert</label><input data-s="box" value="${esc(s.box)}" placeholder="🧮 | Total = **A + B**"></div>
    <div class="field"><label>Note</label><input data-s="note" value="${esc(s.note)}" placeholder="Remarque affichée sous le contenu"></div>
    ${s.type === 'text' ? `<div>${toggle('italic', 'Texte en italique', s.italic)}</div>` : ''}
    ${s.type === 'list' ? `<div>${toggle('variant', "Liste d'interdictions (✕)", s.variant)}</div>` : ''}
  </div>
</details>`;

const renderSections = () => {
  $('#secs').innerHTML =
    ev.sections.map(sectionHtml).join('') || '<p class="empty">Aucune section pour le moment.</p>';
};

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
        ${field('meta.pageTitle', "Titre de l'onglet", { hint: 'Vide : « Event - » suivi du titre.' })}
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
          <div class="add-grid">${Object.entries(TYPES)
            .map(
              ([k, v]) =>
                `<button class="chip" data-action="add" data-type="${k}">+ ${v.label}</button>`,
            )
            .join('')}</div>
        </div>
      </div>
    </section>`;
  $$('[data-p]').forEach((x) => {
    x.value = get(ev, x.dataset.p) ?? '';
  });
  renderSections();
};
