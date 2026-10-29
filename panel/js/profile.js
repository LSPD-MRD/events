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
        <div class="access-user"><div class="access-user-avatar">${esc(wsName(currentUser).slice(0, 1).toUpperCase())}</div><div class="access-user-meta"><strong>${esc(wsName(currentUser))}</strong><span>@${esc(currentUser?.username || '')} · ${esc(currentUser?.grade || 'Aucun grade')}</span></div><span class="role-pill">${esc(currentUser?.role || '—')}</span></div>
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
          <div class="profile-display-fields"><label>Prénom d’affichage<input name="first" maxlength="40" value="${esc(currentUser?.displayFirstName || '')}" placeholder="Prénom"></label><label>Nom d’affichage<input name="last" maxlength="40" value="${esc(currentUser?.displayLastName || '')}" placeholder="Nom"></label></div>
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
  const src =
    pendingProfileAvatar !== undefined ? pendingProfileAvatar : currentUser?.avatarData || null;
  if (src) {
    preview.innerHTML = '<img src="' + src + '" alt="Photo de profil">';
  } else if (currentUser?.hasAvatar) {
    preview.innerHTML =
      '<span class="profile-avatar-placeholder">♙</span><img class="avatar-lazy" data-avatar-user="' +
      esc(currentUser.id) +
      '" alt="" loading="lazy" decoding="async">';
  } else {
    preview.innerHTML = '<span class="profile-avatar-placeholder">♙</span>';
  }
  hydrateAvatars(preview);
  pendingProfileAvatar = undefined;
  profileAvatarChanged = false;
  applyProfileAvatar();
};
