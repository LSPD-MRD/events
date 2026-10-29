const actions = {
  tab: el => setTab(el.dataset.tab),
  'logs-refresh': () => renderLogs(),
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
  'p-save': async () => { await api.post('/portal', { list }); toast('Événements enregistrés. Mise à jour dans environ une minute.', 'ok'); },
  'p-category-toggle': el => { if (!canManagePortalCategories(currentUser)) return toast('Action réservée au CO et à l’ACO.', 'err'); const key = el.dataset.categoryKey; if (!Object.hasOwn(portalSettings.visible, key)) return; portalSettings.visible[key] = !portalSettings.visible[key]; renderPortal(); },
  'p-category-add': el => {
    if (!canManagePortalCategories(currentUser)) return toast('Action réservée au CO et à l’ACO.', 'err');
    const input = $('#p-category-name'), description = $('#p-category-description'), name = String(input?.value || '').trim();
    if (!name) { input?.focus(); return toast('Nom de catégorie obligatoire', 'warn'); }
    if (portalSettings.categories.length >= 24) { input?.focus(); return toast('Maximum 24 catégories', 'warn'); }
    if (portalSettings.categories.some(c => c.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) { input?.focus(); return toast('Cette catégorie existe déjà', 'warn'); }
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'publication';
    let id = 'custom-' + slug;
    if (portalSettings.categories.some(c => c.id === id)) id += '-' + Date.now().toString(36);
    portalSettings.categories.push({ id, name: name.slice(0,48), type: 'publications', description: String(description?.value || '').trim().slice(0,100) });
    portalSettings.order.push(id); portalSettings.visible[id] = true;
    renderPortal(); toast('Catégorie ajoutée · Pense à enregistrer', 'ok');
  },
  'p-category-delete': async el => {
    if (!canManagePortalCategories(currentUser)) return toast('Action réservée au CO et à l’ACO.', 'err');
    const id = el.dataset.categoryKey, category = portalSettings.categories.find(c => c.id === id);
    if (!category || id === 'events') return toast('Catégorie système protégée', 'err');
    if (!(await confirmDialog('Toutes les publications de « ' + category.name + ' » et leurs fichiers seront supprimés définitivement.', { title: 'Supprimer cette catégorie ?', confirmText: 'Supprimer la catégorie', danger: true }))) return;
    el.disabled = true;
    try {
      const result = await api.post('/portal/category/delete', { id });
      portalSettings.categories = portalSettings.categories.filter(c => c.id !== id);
      portalSettings.order = portalSettings.order.filter(key => key !== id);
      delete portalSettings.visible[id];
      toast(result.cleanupWarning ? 'Catégorie supprimée · Nettoyage incomplet' : 'Catégorie et publications supprimées', result.cleanupWarning ? 'warn' : 'ok');
      renderPortal();
    } catch (error) { toast(error.message || 'Suppression impossible', 'err'); el.disabled = false; }
  },
  'p-categories-save': async el => { if (!canManagePortalCategories(currentUser)) return toast('Action réservée au CO et à l’ACO.', 'err'); el.disabled = true; try { await api.post('/portal/settings', { settings: portalSettings }); toast('Catégories enregistrées', 'ok'); } catch (error) { toast(error.message || 'Impossible d’enregistrer les catégories.', 'err'); } finally { el.disabled = false; } },
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
  'user-delete-inactive': async el => { if (currentUser?.role !== 'owner') throw new Error('Réservé au Owner.'); const username = el.dataset.userName || 'ce compte'; if (!(await confirmDialog('La suppression de @' + username + ' est définitive. Le compte, ses sessions et ses références dans l’effectif, le calendrier et les tâches seront supprimés.', { title: 'Supprimer définitivement ce compte ?', confirmText: 'Supprimer le compte', danger: true }))) return; el.disabled = true; try { await api.post('/users/delete-inactive', { id: el.dataset.userId }); } catch (error) { el.disabled = false; throw error; } await renderAccess(); toast('Le compte @' + username + ' a été supprimé.', 'ok'); },
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
    if (!canManageAccessUser(currentUser)) throw new Error('La gestion des accréditations est réservée au CO et à l’ACO.');
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

