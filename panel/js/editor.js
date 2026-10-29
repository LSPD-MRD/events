const load = (x) => {
  const b = blank();
  ev = {
    ...b,
    ...x,
    meta: { ...b.meta, ...x.meta },
    card: { ...b.card, ...x.card },
    sections: x.sections || [],
  };
  slugTouched = !!x.slug;
  renderEditor();
  refresh();
};

const mutate = (f) => {
  f();
  renderSections();
  refresh();
};

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

const canViewLogs = (user) =>
  ['owner', 'admin'].includes(user?.role) ||
  ['Commanding Officer', 'Assistant Commanding Officer'].includes(user?.grade);

const canManageAccessUser = (user) =>
  (user?.role === 'owner' && user?.grade === 'Commanding Officer') ||
  (user?.role === 'admin' && user?.grade === 'Assistant Commanding Officer');

const setTab = async (name) => {
  if (name === 'access' && !canManageAccessUser(currentUser)) {
    toast(
      'L’espace Accès est réservé au Commanding Officer et à l’Assistant Commanding Officer.',
      'err',
    );
    return setTab('edit');
  }
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach((p) => {
    p.hidden = p.id !== name;
  });
  const label = $('#active-page-label');
  if (label) label.textContent = PAGE_LABELS[name] || 'Espaces';
  localStorage.setItem(KEY.activeTab, name);
  const layout = $('.layout');
  if (layout) layout.dataset.activeTab = name;
  $$('[data-editor-only]').forEach((el) => {
    el.hidden = name !== 'edit' || !['owner', 'admin', 'editor'].includes(currentUser?.role);
  });
  closeMenus();
  setPreview(name === 'edit' && previewPreference, false);
  const logsNav = $('[data-tab="logs"]');
  if (logsNav) logsNav.hidden = !canViewLogs(currentUser);
  if (name === 'logs' && !canViewLogs(currentUser)) {
    toast('Les logs sont réservés aux administrateurs et au Commanding Officer.', 'err');
    return setTab('edit');
  }
  if (name === 'publications') await renderPublications();
  if (name === 'logs') await renderLogs();
  if (name === 'portal') {
    try {
      list = await loadList();
      if (canManagePortalCategories(currentUser)) await loadPortalSettings();
      renderPortal();
    } catch (err) {
      toast('Impossible de charger le portail : ' + err.message, 'err');
    }
  }
  if (name === 'access') await renderAccess();
  if (name === 'profile') renderProfile();
  if (name === 'effectif') {
    try {
      await loadWorkspace();
    } catch (err) {
      $('#effectif').innerHTML =
        '<section class="card"><div class="card-body">Impossible de charger l’espace Effectif : ' +
        esc(err.message) +
        '</div></section>';
    }
  }
};

const saveDraft = async () => {
  if (!ev.slug || !ev.meta.title) return toast('Le titre et l’adresse sont obligatoires.', 'err');
  const button = $('#publish');
  button.disabled = true;
  button.textContent = 'Enregistrement…';
  try {
    localStorage.setItem(KEY.draft, json(ev));
    await api.post('/draft/save', { slug: ev.slug, config: json(ev), card: cardOf(ev) });
    toast('Modifications enregistrées sans changer la page publique.', 'ok');
  } finally {
    button.disabled = false;
    button.textContent = 'Enregistrer';
  }
};

const publish = async () => {
  if (!ev.slug || !ev.meta.title) return toast('Le titre et l’adresse sont obligatoires.', 'err');
  if (!ev.meta.date || !ev.meta.date.trim())
    return toast(
      'Ajoute la date dans la fiche de l’événement avant de publier. La date de la carte du portail est facultative.',
      'warn',
    );
  const button = $('#publish');
  button.disabled = true;
  button.textContent = 'Publication…';
  const menu = $('#save-menu');
  if (menu) menu.hidden = true;
  const menuTrigger = $('#save-menu-trigger');
  if (menuTrigger) menuTrigger.setAttribute('aria-expanded', 'false');
  try {
    await api.post('/publish', {
      slug: ev.slug,
      html: page(ev),
      config: json(ev),
      card: cardOf(ev),
    });
    try {
      await api.post('/draft/save', { slug: ev.slug, config: json(ev), card: cardOf(ev) });
    } catch {}
    toast('Enregistré et publié. Mise à jour en ligne dans environ une minute.', 'ok');
  } finally {
    button.disabled = false;
    button.textContent = 'Enregistrer';
  }
};

const applyTheme = (theme) => {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  localStorage.setItem(KEY.theme, value);
  const b = $('#theme-toggle');
  if (b) {
    b.innerHTML =
      value === 'light'
        ? '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>'
        : '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>';
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
  target.innerHTML = list
    .map((entry, i) => {
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
    })
    .join('');
  if (count) count.textContent = list.length + (list.length > 1 ? ' pages' : ' page');
};
