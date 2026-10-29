const renderPortal = () => {
  const categoryControls = canManagePortalCategories(currentUser)
    ? `
    <section class="card portal-category-card">
      <header class="card-head"><h2>Catégories du portail public</h2><p>Glisse les poignées pour réorganiser. Les suppressions retirent aussi les publications associées.</p></header>
      <div class="card-body portal-category-list" id="portal-category-list">${portalSettings.order
        .map((key) => {
          const category = portalSettings.categories.find((c) => c.id === key);
          if (!category) return '';
          const builtIn = !key.startsWith('custom-');
          return `
        <div class="portal-category-row" data-category-row="${esc(key)}">
          <button type="button" class="portal-category-grip" draggable="true" data-category-grip="${esc(key)}" aria-label="Déplacer ${esc(category.name)}" title="Attraper pour déplacer">⠿</button>
          <div class="meta"><b>${esc(category.name)}</b><small>${esc(category.description || (category.type === 'events' ? 'Fiches d’événements' : 'Publications classiques'))}</small></div>
          <span class="portal-visibility ${portalSettings.visible[key] ? 'is-visible' : 'is-hidden'}">${portalSettings.visible[key] ? 'Affichée' : 'Masquée'}</span>
          <div class="row-tools">
            <button type="button" class="btn sm ${portalSettings.visible[key] ? '' : 'primary'}" data-action="p-category-toggle" data-category-key="${esc(key)}">${portalSettings.visible[key] ? 'Masquer' : 'Afficher'}</button>
            ${builtIn && key === 'events' ? '<button type="button" class="icon danger portal-category-delete-disabled" disabled aria-label="La catégorie Événements ne peut pas être supprimée" title="Catégorie protégée">✕</button>' : `<button type="button" class="icon danger" data-action="p-category-delete" data-category-key="${esc(key)}" title="Supprimer la catégorie">✕</button>`}
          </div>
        </div>`;
        })
        .join('')}</div>
      <div class="portal-category-add">
        <div class="portal-category-add-fields">
          <label>Nouvelle catégorie<input id="p-category-name" maxlength="48" placeholder="Ex. Communiqués, Partenariats…" autocomplete="off"></label>
          <label>Description courte <span>(facultatif)</span><input id="p-category-description" maxlength="100" placeholder="Ex. Informations et annonces de la division" autocomplete="off"></label>
        </div>
        <button type="button" class="btn" data-action="p-category-add"><span aria-hidden="true">＋</span> Ajouter</button>
      </div>
      <div class="card-body portal-category-footer"><small>Les catégories personnalisées accueillent les publications classiques (PDF et images).</small><button type="button" class="btn primary" data-action="p-categories-save">Enregistrer les catégories</button></div>
    </section>`
    : '';
  $('#portal').innerHTML = `
    ${categoryControls}
    <section class="card">
      <header class="card-head"><h2>Événements</h2><p>Statut et ordre des cartes d’événements sur le portail.</p></header>
      <div class="card-body">${
        list
          .map(
            (x, i) => `
        <div class="row-item" data-i="${i}">
          <span class="glyph">${esc(x.icon)}</span>
          <div class="meta"><b>${esc(x.title)}</b><small>${esc(x.href || 'sans lien')}</small></div>
          <div class="seg">${Object.entries(STATUS)
            .map(
              ([v, l]) =>
                `<button class="${v === x.status ? 'active' : ''}" data-action="p-status" data-value="${v}">${l}</button>`,
            )
            .join('')}</div>
          <div class="row-tools">
            <button class="icon" data-action="p-up" title="Monter">↑</button>
            <button class="icon" data-action="p-down" title="Descendre">↓</button>
            <button class="icon" data-action="p-edit" title="Modifier">✎</button>
            <button class="icon danger" data-action="p-del" title="Retirer">✕</button>
          </div>
        </div>`,
          )
          .join('') || '<p class="empty">Aucun événement.</p>'
      }</div>
    </section>
    <div class="actions">
      <button class="btn primary" data-action="p-save">Enregistrer les événements</button>
      <button class="btn" data-action="p-download">Télécharger events-data.js</button>
    </div>`;
  const categoryList = $('#portal-category-list');
  if (categoryList) {
    let dragged = null;
    categoryList.querySelectorAll('[data-category-grip]').forEach((grip) => {
      grip.addEventListener('dragstart', (event) => {
        dragged = grip.dataset.categoryGrip;
        event.dataTransfer?.setData('text/plain', dragged);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        grip.closest('.portal-category-row')?.classList.add('is-dragging');
      });
      grip.addEventListener('dragend', () => {
        categoryList
          .querySelectorAll('.portal-category-row')
          .forEach((row) => row.classList.remove('is-dragging', 'is-drop-target'));
        dragged = null;
      });
    });
    categoryList.querySelectorAll('[data-category-row]').forEach((row) => {
      row.addEventListener('dragover', (event) => {
        if (!dragged || dragged === row.dataset.categoryRow) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        categoryList
          .querySelectorAll('.portal-category-row')
          .forEach((item) => item.classList.toggle('is-drop-target', item === row));
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = dragged || event.dataTransfer?.getData('text/plain'),
          to = row.dataset.categoryRow;
        if (!from || !to || from === to) return;
        const fromIndex = portalSettings.order.indexOf(from),
          toIndex = portalSettings.order.indexOf(to);
        if (fromIndex < 0 || toIndex < 0) return;
        const insertionIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        portalSettings.order.splice(fromIndex, 1);
        portalSettings.order.splice(insertionIndex, 0, from);
        renderPortal();
      });
    });
  }
};
