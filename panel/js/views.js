async function renderPublications() {
  try { await loadPortalSettings(); } catch (error) { console.warn('Paramètres des catégories indisponibles', error); }
  $('#publications').innerHTML = `<section class="page-intro"><div><div class="eyebrow">MRD WORKSPACE · PUBLICATIONS</div><h1>Publications</h1><p>Importe tes créations Canva en PDF ou PNG pour conserver exactement leur mise en page.</p></div></section><section class="card"><header class="card-head"><h2>Nouvelle publication</h2><p>Actualités, comptes rendus et communiqués officiels.</p></header><form class="card-body" id="publication-form"><div class="field"><label for="pub-kind">Catégorie</label><div class="select-wrap"><select id="pub-kind">${portalSettings.categories.filter(c => c.id !== 'events').map(c => {
    if (c.id === 'news') return '<option value="news">Media Relations · ' + esc(c.name) + '</option><option value="comm-presse">Public Information (PIO) · Communiqué de presse</option>';
    if (c.id === 'documents') return '<option value="comm-interne">Interagency · ' + esc(c.name) + '</option>';
    return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
  }).join('')}</select><span class="select-chevron" aria-hidden="true">⌄</span></div></div><div class="field"><label for="pub-title">Titre</label><input id="pub-title" required maxlength="120" placeholder="Titre de la publication"></div><div class="field"><label for="pub-summary">Description (facultative)</label><textarea id="pub-summary" rows="3" maxlength="500"></textarea></div><div class="field"><label for="pub-date">Date</label><input id="pub-date" type="date" autocomplete="off" aria-label="Date de publication"></div><div class="field"><label for="pub-file">Fichier PDF ou image (max. 10 Mo)</label><div class="file-dropzone" id="publication-dropzone" role="button" tabindex="0" aria-controls="pub-file"><span class="file-dropzone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></span><strong>Dépose ton fichier ici</strong><span class="file-dropzone-copy">ou <button type="button" class="file-dropzone-browse" data-file-browse="pub-file">parcourir tes fichiers</button></span><small class="file-dropzone-status" id="pub-file-status">PDF, PNG, JPG ou WEBP · 10 Mo maximum</small></div><input id="pub-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required class="visually-hidden-file"></div><div id="pub-preview" class="publication-preview">L'aperçu apparaîtra ici.</div><div class="publication-file-actions"><span class="file-dropzone-status" id="pub-selected-hint">Aucun fichier sélectionné...</span><button type="button" class="btn sm publication-file-clear" id="pub-file-clear" hidden>Retirer le fichier</button></div><button class="btn primary" id="pub-submit" type="submit">Publier sur le portail</button></form></section><section class="card"><header class="card-head"><h2>Publications en ligne</h2></header><div class="card-body" id="pub-list">Chargement…</div></section>`;
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
  try { const r=await fetch('../public/publications-data.js?v='+Date.now()); const t=r.ok?await r.text():''; const a=t.indexOf('['),z=t.lastIndexOf(']'); const data=a>=0&&z>a?JSON.parse(t.slice(a,z+1)):[]; $('#pub-list').innerHTML=data.map(p=>'<div class="row-item"><div class="meta"><b>'+esc(p.title)+'</b><small>'+esc(portalSettings.categories.find(c => c.id === p.kind)?.name || ({news:'Media Relations','comm-presse':'Public Information (PIO)','comm-interne':'Interagency','compte-rendu':'Interagency'})[p.kind] || p.kind)+' · '+esc((mrdDateUTC(p.date) ? mrdDateFmt.format(mrdDateUTC(p.date)) : p.date) || 'Sans date')+'</small></div><a class="btn sm" target="_blank" rel="noopener" href="../'+encodeURI(p.file)+'">Ouvrir</a><a class="btn sm" download href="../'+encodeURI(p.file)+'">Télécharger</a><button type="button" class="btn sm danger publication-delete" data-publication-delete="'+esc(p.id)+'">Supprimer</button></div>').join('')||'<p class="empty">Aucune publication en ligne.</p>'; } catch { $('#pub-list').textContent='Impossible de charger les publications.'; }
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
  const categoryControls = canManagePortalCategories(currentUser) ? `
    <section class="card portal-category-card">
      <header class="card-head"><h2>Catégories du portail public</h2><p>Glisse les poignées pour réorganiser. Les suppressions retirent aussi les publications associées.</p></header>
      <div class="card-body portal-category-list" id="portal-category-list">${portalSettings.order.map(key => {
        const category = portalSettings.categories.find(c => c.id === key);
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
      }).join('')}</div>
      <div class="portal-category-add">
        <div class="portal-category-add-fields">
          <label>Nouvelle catégorie<input id="p-category-name" maxlength="48" placeholder="Ex. Communiqués, Partenariats…" autocomplete="off"></label>
          <label>Description courte <span>(facultatif)</span><input id="p-category-description" maxlength="100" placeholder="Ex. Informations et annonces de la division" autocomplete="off"></label>
        </div>
        <button type="button" class="btn" data-action="p-category-add"><span aria-hidden="true">＋</span> Ajouter</button>
      </div>
      <div class="card-body portal-category-footer"><small>Les catégories personnalisées accueillent les publications classiques (PDF et images).</small><button type="button" class="btn primary" data-action="p-categories-save">Enregistrer les catégories</button></div>
    </section>` : '';
  $('#portal').innerHTML = `
    ${categoryControls}
    <section class="card">
      <header class="card-head"><h2>Événements</h2><p>Statut et ordre des cartes d’événements sur le portail.</p></header>
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
      <button class="btn primary" data-action="p-save">Enregistrer les événements</button>
      <button class="btn" data-action="p-download">Télécharger events-data.js</button>
    </div>`;
  const categoryList = $('#portal-category-list');
  if (categoryList) {
    let dragged = null;
    categoryList.querySelectorAll('[data-category-grip]').forEach(grip => {
      grip.addEventListener('dragstart', event => {
        dragged = grip.dataset.categoryGrip;
        event.dataTransfer?.setData('text/plain', dragged);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        grip.closest('.portal-category-row')?.classList.add('is-dragging');
      });
      grip.addEventListener('dragend', () => {
        categoryList.querySelectorAll('.portal-category-row').forEach(row => row.classList.remove('is-dragging','is-drop-target'));
        dragged = null;
      });
    });
    categoryList.querySelectorAll('[data-category-row]').forEach(row => {
      row.addEventListener('dragover', event => {
        if (!dragged || dragged === row.dataset.categoryRow) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        categoryList.querySelectorAll('.portal-category-row').forEach(item => item.classList.toggle('is-drop-target', item === row));
      });
      row.addEventListener('drop', event => {
        event.preventDefault();
        const from = dragged || event.dataTransfer?.getData('text/plain'), to = row.dataset.categoryRow;
        if (!from || !to || from === to) return;
        const fromIndex = portalSettings.order.indexOf(from), toIndex = portalSettings.order.indexOf(to);
        if (fromIndex < 0 || toIndex < 0) return;
        const insertionIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        portalSettings.order.splice(fromIndex, 1);
        portalSettings.order.splice(insertionIndex, 0, from);
        renderPortal();
      });
    });
  }
};

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
      body.innerHTML = '<div class="logs-empty"><strong>Aucune activité enregistrée</strong><span>Les actions apparaîtront ici lorsqu’elles seront effectuées.</span></div>';
      return;
    }
    const formatDate = value => {
      const date = new Date(Number(value));
      return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Date inconnue';
    };
    body.innerHTML = '<div class="logs-table-wrap"><table class="logs-table"><thead><tr><th>Date</th><th>Compte</th><th>Action</th><th>Cible</th></tr></thead><tbody>' +
      logs.map(log => '<tr><td class="logs-date">' + esc(formatDate(log.created_at)) + '</td><td><strong>' + esc(log.actor_username || 'Système') + '</strong><small class="logs-grade">' + esc(log.actor_grade || '—') + '</small></td><td><span class="logs-action">' + esc(log.action || 'Action') + '</span></td><td class="logs-target">' + esc(log.target || '—') + '</td></tr>').join('') +
      '</tbody></table></div><div class="logs-count">' + logs.length + ' entrée' + (logs.length > 1 ? 's' : '') + ' affichée' + (logs.length > 1 ? 's' : '') + '</div>';
  } catch (error) {
    const body = root.querySelector('.logs-card .card-body');
    if (body) body.innerHTML = '<div class="logs-error"><strong>Impossible de charger les logs</strong><span>' + esc(error?.message || 'Une erreur est survenue.') + '</span><button type="button" class="btn" data-action="logs-refresh">Réessayer</button></div>';
  }
};

const renderAccess = async () => {
  const c = api.cfg();
  const owner = currentUser?.role === 'owner' && currentUser?.grade === 'Commanding Officer';
  const accessManager = canManageAccessUser(currentUser);
  if (!accessManager) {
    $('#access').innerHTML = '<section class="card"><div class="card-body">L’espace Accès est réservé au CO et à l’ACO.</div></section>';
    return;
  }
  $('#access').innerHTML = `
    <section class="page-intro access-intro"><div><div class="eyebrow">MRD WORKSPACE <span>· ADMINISTRATION</span></div><h1>Accès & sécurité</h1><p>Gère les comptes de l’équipe et leurs accréditations.</p></div><div class="intro-mark">⌘</div></section>
    <div class="access-grid">
      ${owner ? `      <section class="card access-worker">
        <header class="card-head"><span class="access-kicker">CONNEXION API</span><h2>Serveur MRD</h2><p>Adresse du Worker qui traite les demandes du panel.</p></header>
        <div class="card-body">
          <div class="field"><label for="worker-url">URL du Worker</label><input id="worker-url" data-g="url" value="${esc(c.url)}" spellcheck="false" placeholder="https://votre-worker.workers.dev"></div>
          <div class="actions access-worker-actions"><button class="btn primary" data-action="save-access" type="button">Enregistrer l’URL</button><button class="btn" data-action="test-access" type="button"><span aria-hidden="true">↗</span> Tester la connexion</button></div>
        </div>
      </section>` : ''}
      ${accessManager ? `<section class="card access-accounts">
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
      </section>` : `<section class="card access-restricted"><div class="access-restricted-icon">♙</div><div><h2>Gestion des comptes</h2><p>La création et la désactivation des comptes sont réservées au Owner.</p></div></section>`}
    </div>`;
  if (accessManager) {
    try {
      const data = await api.post('/users/list', {});
      const users = data.users || [];
      const count = $('#access-user-count');
      if (count) count.textContent = String(users.length).padStart(2, '0');
      $('#users-list').innerHTML = users.map(u => {
        const allowed = ACCREDITATIONS_BY_GRADE[u.grade] || [];
        const selected = Array.isArray(u.accreditations) ? u.accreditations : (typeof u.accreditations === 'string' ? (() => { try { const parsed = JSON.parse(u.accreditations); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })() : []);
        return `<article class="user-row access-user-row access-user-card">
          <span class="avatar-stack access-avatar-stack"><span class="access-user-avatar small avatar-fallback">${esc((u.displayName || u.username || 'M').slice(0,1).toUpperCase())}</span>${u.hasAvatar ? '<img class="access-user-avatar small avatar-lazy" data-avatar-user="' + esc(u.id) + '" loading="lazy" decoding="async" alt="">' : ''}</span>
          <div class="access-user-details">
            <b>${esc(u.displayName || u.username)}</b>
            <small>@${esc(u.username)} <span>·</span> ${esc(u.grade)} <span>·</span> ${esc(u.role)} <span>·</span> <i class="${u.active ? 'status-active' : 'status-disabled'}">${u.active ? 'Actif' : 'Désactivé'}</i></small>
            <div class="accreditation-tags">${accreditationTags(selected)}</div>
            <small class="access-last-login">${u.last_login_at ? 'Dernière connexion · ' + esc(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(u.last_login_at)))) : 'Aucune connexion enregistrée'}</small>
            ${u.role === 'owner' ? '<div class="accreditation-manager"><button type="button" class="accreditation-add is-disabled" disabled aria-label="Les accréditations du Owner ne peuvent pas être modifiées" title="Toutes les accréditations sont déjà disponibles"><span aria-hidden="true">＋</span></button><div class="accreditation-manager-copy"><span>Accréditations</span><small>Toutes disponibles</small></div></div>' : `<div class="accreditation-manager"><button type="button" class="accreditation-add" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-expanded="false" aria-label="Ajouter ou modifier les accréditations de ${esc(u.username)}" title="Ajouter ou modifier les accréditations"><span aria-hidden="true">＋</span></button><div class="accreditation-manager-copy"><span>Accréditations</span><small>${selected.length ? selected.length + ' attribuée' + (selected.length > 1 ? 's' : '') : 'Aucune accréditation'}</small></div><div class="accreditation-editor" data-accreditation-editor="${esc(u.id)}" hidden><div class="accreditation-editor-head"><div><strong>Attribuer les accréditations</strong><small>Sélectionne une ou plusieurs accréditations.</small></div><button type="button" class="accreditation-close" data-action="toggle-accreditation-editor" data-user-id="${esc(u.id)}" aria-label="Fermer">×</button></div><div class="accreditation-options">${Object.keys(ACCREDITATION_META).map(name => `<label class="accreditation-option ${allowed.includes(name) ? '' : 'is-unavailable'}"><input type="checkbox" data-accreditation-user="${esc(u.id)}" value="${esc(name)}" ${selected.includes(name) ? 'checked' : ''} ${!allowed.includes(name) || !u.active ? 'disabled' : ''}><span>${esc(name)}</span>${!allowed.includes(name) ? '<small>Non accessible à ce grade</small>' : ''}</label>`).join('')}</div><div class="accreditation-editor-footer"><span>Les changements prennent effet après enregistrement.</span><button type="button" class="btn primary sm" data-action="save-accreditations" data-user-id="${esc(u.id)}" ${!u.active || Number(u.id) === Number(currentUser.id) ? 'disabled' : ''}>Enregistrer</button></div></div></div>`}
          </div>
          <button class="btn danger access-user-action ${u.active ? '' : 'access-user-delete'}" data-action="${u.active ? 'user-disable' : 'user-delete-inactive'}" data-user-id="${esc(u.id)}" data-user-name="${esc(u.username)}" ${Number(u.id) === Number(currentUser.id) || u.role === 'owner' ? 'disabled' : ''}>${u.active ? 'Désactiver' : (u.role === 'owner' ? 'Compte protégé' : 'Supprimer définitivement')}</button>
        </article>`;
      }).join('') || '<p class="empty">Aucun compte n’a été créé.</p>';
      hydrateAvatars($('#users-list'));
    } catch (e) { $('#users-list').textContent = e.message; }
  }
};


const applyProfileAvatar = () => {
  const image = $('#profile-avatar');
  const placeholder = $('#profile-avatar-placeholder');
  const src = currentUser?.avatarData || null;
  const hasAvatar = !!(src || currentUser?.hasAvatar);
  if (image) {
    image.style.display = hasAvatar ? 'block' : 'none';
    image.hidden = !hasAvatar;
    if (src) {
      image.removeAttribute('data-avatar-user');
      image.dataset.avatarReady = 'true';
      image.src = src;
      image.classList.add('is-loaded');
    } else if (hasAvatar && currentUser?.id) {
      image.removeAttribute('src');
      image.classList.remove('is-loaded', 'is-missing');
      image.dataset.avatarUser = String(currentUser.id);
      delete image.dataset.avatarReady;
      hydrateAvatars(image.parentElement);
    } else {
      image.removeAttribute('src');
      image.classList.remove('is-loaded');
      delete image.dataset.avatarUser;
      delete image.dataset.avatarReady;
    }
  }
  if (placeholder) {
    // The fallback icon must be hidden as soon as an avatar exists,
    // not only after its image data has finished loading.
    placeholder.style.display = hasAvatar ? 'none' : 'block';
    placeholder.hidden = hasAvatar;
  }
};
const renderProfile = () => {
  const root = $('#profile');
  root.innerHTML = `
    <section class="page-intro"><div><div class="eyebrow">COMPTE PERSONNEL <span>· SÉCURITÉ</span></div><h1>Mon compte</h1><p>Gère tes informations personnelles et la sécurité de ton compte MRD.</p></div></section>
    <section class="card profile-session-card">
      <header class="card-head"><h2>Compte connecté</h2><p>Informations de ta session actuelle.</p></header>
      <div class="card-body">
        <div class="access-user"><div class="access-user-avatar">${esc(wsName(currentUser).slice(0,1).toUpperCase())}</div><div class="access-user-meta"><strong>${esc(wsName(currentUser))}</strong><span>@${esc(currentUser?.username || '')} · ${esc(currentUser?.grade || 'Aucun grade')}</span></div><span class="role-pill">${esc(currentUser?.role || '—')}</span></div>
        <button class="btn access-logout" data-action="logout" type="button">Se déconnecter</button>
      </div>
    </section>
    <section class="card">
      <header class="card-head"><h2>Identité & photo de profil</h2><p>Ton nom d’affichage et ta photo sont visibles par les autres membres de la MRD.</p></header>
      <div class="card-body">
        <form id="display-profile-form" class="ws-profile-form">
          <div class="profile-edit-row">
            <div class="profile-avatar-control"><button type="button" class="profile-preview-avatar profile-avatar-edit" id="profile-preview-avatar" data-action="choose-avatar" aria-label="Choisir une photo de profil" title="Choisir une photo de profil"><span class="profile-avatar-placeholder">♙</span></button><button type="button" class="profile-avatar-pencil" data-action="choose-avatar" aria-label="Modifier la photo de profil" title="Modifier la photo de profil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/></svg></button></div>
            <div class="profile-edit-identity"><strong>${esc(wsName(currentUser))}</strong><small>@${esc(currentUser?.username || '')} · ${esc(currentUser?.grade || '')}</small><div class="accreditation-tags profile-accreditation-tags">${accreditationTags(currentUser?.accreditations || [])}</div><small class="profile-avatar-hint">La photo est optimisée automatiquement avant son envoi.</small></div>
          </div>
          <div class="profile-display-fields"><label>Prénom d’affichage<input name="first" maxlength="40" value="${esc(currentUser?.displayFirstName||'')}" placeholder="Prénom"></label><label>Nom d’affichage<input name="last" maxlength="40" value="${esc(currentUser?.displayLastName||'')}" placeholder="Nom"></label></div>
          <small>Le CO peut aussi gérer ces informations depuis l’espace Effectif.</small>
          <button class="btn primary profile-save-button" type="submit">Enregistrer le profil</button>
        </form>
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
  const src = pendingProfileAvatar !== undefined ? pendingProfileAvatar : (currentUser?.avatarData || null);
  if (src) {
    preview.innerHTML = '<img src="' + src + '" alt="Photo de profil">';
  } else if (currentUser?.hasAvatar) {
    preview.innerHTML = '<span class="profile-avatar-placeholder">♙</span><img class="avatar-lazy" data-avatar-user="' + esc(currentUser.id) + '" alt="" loading="lazy" decoding="async">';
  } else {
    preview.innerHTML = '<span class="profile-avatar-placeholder">♙</span>';
  }
  hydrateAvatars(preview);
  pendingProfileAvatar = undefined;
  profileAvatarChanged = false;
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

const canManageAccessUser = user =>
  (user?.role === 'owner' && user?.grade === 'Commanding Officer') ||
  (user?.role === 'admin' && user?.grade === 'Assistant Commanding Officer');

const setTab = async name => {
  if (name === 'access' && !canManageAccessUser(currentUser)) {
    toast('L’espace Accès est réservé au Commanding Officer et à l’Assistant Commanding Officer.', 'err');
    return setTab('edit');
  }
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  const label = $('#active-page-label');
  if (label) label.textContent = PAGE_LABELS[name] || 'Espaces';
  localStorage.setItem(KEY.activeTab, name);
  const layout = $('.layout');
  if (layout) layout.dataset.activeTab = name;
  $$('[data-editor-only]').forEach(el => { el.hidden = name !== 'edit' || !['owner','admin','editor'].includes(currentUser?.role); });
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
    try { list = await loadList(); if (canManagePortalCategories(currentUser)) await loadPortalSettings(); renderPortal(); } catch (err) { toast('Impossible de charger le portail : ' + err.message, 'err'); }
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
    b.innerHTML = value === 'light'
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

