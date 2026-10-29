const renderLogs = async () => {
  const root = $('#logs');
  if (!root) return;
  root.innerHTML = `
    <section class="page-intro logs-intro">
      <div><div class="eyebrow">MRD WORKSPACE <span>· SÉCURITÉ</span></div><h1>Journal d’activité</h1><p>Historique des actions récentes effectuées dans le panel.</p></div>
      <button type="button" class="btn" data-action="logs-refresh">Actualiser</button>
    </section>
    <section class="card logs-card">
      <header class="card-head"><h2>Dernières activités</h2><p>Les 200 entrées les plus récentes.</p></header>
      <div class="card-body"><div class="logs-state"><span class="spinner" aria-hidden="true"></span> Chargement du journal…</div></div>
    </section>`;
  try {
    const data = await api.post('/logs/list');
    const logs = Array.isArray(data.logs) ? data.logs : [];
    const body = root.querySelector('.logs-card .card-body');
    if (!body) return;
    if (!logs.length) {
      body.innerHTML =
        '<div class="logs-empty"><strong>Aucune activité enregistrée</strong><span>Les actions apparaîtront ici lorsqu’elles seront effectuées.</span></div>';
      return;
    }
    const formatDate = (value) => {
      const date = new Date(Number(value));
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : 'Date inconnue';
    };
    body.innerHTML =
      '<div class="logs-table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>Compte</th><th>Action</th><th>Cible</th></tr></thead><tbody>' +
      logs
        .map(
          (log) =>
            '<tr><td class="logs-date">' +
            esc(formatDate(log.created_at)) +
            '</td><td><strong>' +
            esc(log.actor_username || 'Système') +
            '</strong><small class="logs-grade">' +
            esc(log.actor_grade || '—') +
            '</small></td><td><span class="logs-action">' +
            esc(log.action || 'Action') +
            '</span></td><td class="logs-target">' +
            esc(log.target || '—') +
            '</td></tr>',
        )
        .join('') +
      '</tbody></table></div><div class="logs-count">' +
      logs.length +
      ' entrée' +
      (logs.length > 1 ? 's' : '') +
      ' affichée' +
      (logs.length > 1 ? 's' : '') +
      '</div>';
  } catch (error) {
    const body = root.querySelector('.logs-card .card-body');
    if (body)
      body.innerHTML =
        '<div class="logs-error"><strong>Impossible de charger les logs</strong><span>' +
        esc(error?.message || 'Une erreur est survenue.') +
        '</span><button type="button" class="btn" data-action="logs-refresh">Réessayer</button></div>';
  }
};

const renderAccess = async () => {
  const c = api.cfg();
  const owner = currentUser?.role === 'owner' && currentUser?.grade === 'Commanding Officer';
  const accessManager = canManageAccessUser(currentUser);
  if (!accessManager) {
    $('#access').innerHTML =
      '<section class="card"><div class="card-body">L’espace Accès est réservé au CO et à l’ACO.</div></section>';
    return;
  }
  $('#access').innerHTML = `
    <section class="page-intro access-intro"><div><div class="eyebrow">MRD WORKSPACE <span>· ADMINISTRATION</span></div><h1>Accès & sécurité</h1><p>Gère les comptes de l’équipe et leurs accréditations.</p></div><div class="intro-mark">⌘</div></section>
    <div class="access-grid">
      ${
        owner
          ? `      <section class="card access-worker">
        <header class="card-head"><span class="access-kicker">CONNEXION API</span><h2>Serveur MRD</h2><p>Adresse du Worker qui traite les demandes du panel.</p></header>
        <div class="card-body">
          <div class="field"><label for="worker-url">URL du Worker</label><input id="worker-url" data-g="url" value="${esc(c.url)}" spellcheck="false" placeholder="https://votre-worker.workers.dev"></div>
          <div class="actions access-worker-actions"><button class="btn primary" data-action="save-access" type="button">Enregistrer l’URL</button><button class="btn" data-action="test-access" type="button"><span aria-hidden="true">↗</span> Tester la connexion</button></div>
        </div>
      </section>`
          : ''
      }
      ${
        accessManager
          ? `<section class="card access-accounts">
        <header class="card-head access-card-head"><div><span class="access-kicker">GESTION DE L’ÉQUIPE</span><h2>Comptes & autorisations</h2></div><span class="access-count-mark">01</span></header>
        <div class="card-body">
          <form id="user-create-form" class="user-create access-create-form">
            <div class="field"><label for="new-username">Identifiant</label><input id="new-username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" placeholder="ex. media.officer"></div>
            <div class="field"><label for="new-grade">Grade</label><div class="select-wrap"><select id="new-grade" name="grade" required><option value="Certified Officer">Certified Officer (CtO)</option><option value="Expert Officer">Expert Officer (EO)</option><option value="Assistant Commanding Officer" ${owner ? '' : 'disabled hidden'}>Assistant Commanding Officer (ACO)</option></select><span class="select-chevron" aria-hidden="true">⌄</span></div></div>
            <div class="field"><label for="new-password">Mot de passe temporaire</label><input id="new-password" name="password" required minlength="12" type="password" autocomplete="new-password" placeholder="12 caractères minimum"><small>Le mot de passe initial doit être communiqué en privé.</small></div>
            <div class="access-create-footer"><button class="btn primary create-account-btn" type="submit"><span aria-hidden="true">＋</span> Créer le compte</button></div>
          </form>
        </div>
        <div class="access-list-head"><div><h3>Comptes existants</h3></div><span id="access-user-count" class="access-user-count">—</span></div>
        <div class="card-body access-users-body"><div id="users-list" class="user-admin"><div class="access-loading"><span class="loading-dot"></span> Chargement des comptes…</div></div></div>
      </section>`
          : `<section class="card access-restricted"><div class="access-restricted-icon">♙</div><div><h2>Gestion des comptes</h2><p>La création et la désactivation des comptes sont réservées au Owner.</p></div></section>`
      }
    </div>`;
  if (accessManager) {
    try {
      const data = await api.post('/users/list', {});
      const users = data.users || [];
      const count = $('#access-user-count');
      if (count) count.textContent = String(users.length).padStart(2, '0');
      $('#users-list').innerHTML =
        users
          .map((u) => {
            const allowed = ACCREDITATIONS_BY_GRADE[u.grade] || [];
            const selected = Array.isArray(u.accreditations)
              ? u.accreditations
              : typeof u.accreditations === 'string'
                ? (() => {
                    try {
                      const parsed = JSON.parse(u.accreditations);
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })()
                : [];
            return `<article class="user-row access-user-row access-user-card">
          <span class="avatar-stack access-avatar-stack"><span class="access-user-avatar small avatar-fallback">${esc((u.displayName || u.username || 'M').slice(0, 1).toUpperCase())}</span>${u.hasAvatar ? '<img class="access-user-avatar small avatar-lazy" data-avatar-user="' + esc(u.id) + '" loading="lazy" decoding="async" alt="">' : ''}</span>
          <div class="access-user-details">
            <b>${esc(u.displayName || u.username)}</b>
            <small>@${esc(u.username)} <span>·</span> ${esc(u.grade)} <span>·</span> ${esc(u.role)} <span>·</span> <i class="${u.active ? 'status-active' : 'status-disabled'}">${u.active ? 'Actif' : 'Désactivé'}</i></small>
            <div class="accreditation-tags">${accreditationTags(selected)}</div>
            <small class="access-last-login">${u.last_login_at ? 'Dernière connexion · ' + esc(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(u.last_login_at)))) : 'Aucune connexion enregistrée'}</small>
            ${
              u.role === 'owner'
                ? '<div class="accreditation-manager"><button type="button" class="accreditation-add is-disabled" disabled aria-label="Les accréditations du Owner ne peuvent pas être modifiées" title="Toutes les accréditations sont déjà disponibles"><span aria-hidden="true">＋</span></button><div class="accreditation-manager-copy"><span>Accréditations</span><small>Toutes disponibles</small></div></div>'
                : `<div class="accreditation-manager"><button type="button" class="accreditation-add" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-expanded="false" aria-label="Ajouter ou modifier les accréditations de ${esc(u.username)}" title="Ajouter ou modifier les accréditations"><span aria-hidden="true">＋</span></button><div class="accreditation-manager-copy"><span>Accréditations</span><small>${selected.length ? selected.length + ' attribuée' + (selected.length > 1 ? 's' : '') : 'Aucune accréditation'}</small></div><div class="accreditation-editor" data-accreditation-editor="${esc(u.id)}" hidden><div class="accreditation-editor-head"><div><strong>Attribuer les accréditations</strong><small>Sélectionne une ou plusieurs accréditations.</small></div><button type="button" class="accreditation-close" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-label="Fermer">×</button></div><div class="accreditation-options">${Object.keys(
                    ACCREDITATION_META,
                  )
                    .map(
                      (name) =>
                        `<label class="accreditation-option ${allowed.includes(name) ? '' : 'is-unavailable'}"><input type="checkbox" data-accreditation-user="${esc(u.id)}" value="${esc(name)}" ${selected.includes(name) ? 'checked' : ''} ${!allowed.includes(name) || !u.active ? 'disabled' : ''}><span>${esc(name)}</span>${!allowed.includes(name) ? '<small>Non accessible à ce grade</small>' : ''}</label>`,
                    )
                    .join(
                      '',
                    )}</div><div class="accreditation-editor-footer"><span>Les changements prennent effet après enregistrement.</span><button type="button" class="btn primary sm" data-action="save-accreditations" data-user-id="${esc(u.id)}" ${!u.active || Number(u.id) === Number(currentUser.id) ? 'disabled' : ''}>Enregistrer</button></div></div></div>`
            }
          </div>
          <button class="btn danger access-user-action ${u.active ? '' : 'access-user-delete'}" data-action="${u.active ? 'user-disable' : 'user-delete-inactive'}" data-user-id="${esc(u.id)}" data-user-name="${esc(u.username)}" ${Number(u.id) === Number(currentUser.id) || u.role === 'owner' ? 'disabled' : ''}>${u.active ? 'Désactiver' : u.role === 'owner' ? 'Compte protégé' : 'Supprimer définitivement'}</button>
        </article>`;
          })
          .join('') || '<p class="empty">Aucun compte n’a été créé.</p>';
      hydrateAvatars($('#users-list'));
    } catch (e) {
      $('#users-list').textContent = e.message;
    }
  }
};
