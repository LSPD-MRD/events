async function signIn(username, password) {
  const c = api.cfg();
  let r;
  try { r = await fetch(c.url.replace(/\/$/, '') + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) }); }
  catch { throw new Error('Connexion au serveur impossible. Vérifie l’URL du Worker, sa disponibilité et le réglage CORS.'); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || ('Connexion refusée (' + r.status + ')'));
  sessionStorage.setItem(KEY.token, data.token);
  currentUser = data.user;
  applyProfileAvatar();
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
  try { if (sessionStorage.getItem(KEY.token)) await api.post('/auth/logout', {}); } catch {}
  sessionStorage.removeItem(KEY.token);
  localStorage.removeItem(KEY.token); currentUser = null;
  $('#login-screen').hidden = false;
  $('#login-pass').value = '';
  closeMenus();
  if (show) toast('Déconnexion effectuée.', 'ok');
}
function applyPermissions() {
  const role = currentUser?.role || 'viewer';
  const canEdit = ['owner','admin','editor'].includes(role);
  const profileName = $('#profile-menu-name');
  if (profileName) profileName.textContent = wsName(currentUser);
  const profileGrade = $('#profile-menu-grade');
  if (profileGrade) profileGrade.textContent = (currentUser?.grade || '') + (currentUser?.role ? ' · ' + currentUser.role : '');
  applyProfileAvatar();
  $$('[data-action="tab"]').forEach(b => {
    if (b.dataset.tab === 'logs') b.hidden = !canViewLogs(currentUser);
    if (b.dataset.tab === 'access') b.hidden = !canManageAccessUser(currentUser);
  });
  if (!canEdit) {
    $('#edit').innerHTML = '<section class="card"><div class="card-body"><h2>Consultation seule</h2><p>Ton compte ne dispose pas des droits de modification.</p></div></section>';
    $('#edit').hidden = false;
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === 'edit'));
    $$('.panel').forEach(p => { if (p.id !== 'edit') p.hidden = true; });
  }
}
async function restoreSession() {
  const token = sessionStorage.getItem(KEY.token);
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
    applyProfileAvatar();
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
// Ignore file drops outside dedicated upload controls; never show a global JSON import overlay.
const preventUnexpectedFileDrop = event => {
  if (event.target instanceof Element && event.target.closest('.file-dropzone')) return;
  if (!Array.from(event.dataTransfer?.items || []).some(item => item.kind === 'file')) return;
  event.preventDefault();
};
document.addEventListener('dragover', preventUnexpectedFileDrop);
document.addEventListener('drop', preventUnexpectedFileDrop);

const avatarInput = $('#avatar-file');
const acceptAvatarFile = async file => {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
    toast('Image invalide : utilise PNG, JPG, WEBP ou GIF de 10 Mo maximum.', 'err'); return;
  }
  try {
    // Préserve l'animation des GIF ; les formats statiques sont optimisés en WebP.
    if (file.type === 'image/gif') {
      pendingProfileAvatar = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
        reader.readAsDataURL(file);
      });
      profileAvatarChanged = true;
      const preview = $('#profile-preview-avatar');
      if (preview) preview.innerHTML = '<img src="' + pendingProfileAvatar + '" alt="Aperçu de la photo de profil">';
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => { URL.revokeObjectURL(objectUrl); resolve(element); };
      element.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image illisible.')); };
      element.src = objectUrl;
    });
    const maxEdge = 320;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Optimisation d’image indisponible.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) throw new Error('Impossible de compresser cette image.');
    pendingProfileAvatar = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
      reader.readAsDataURL(blob);
    });
    profileAvatarChanged = true;
    const preview = $('#profile-preview-avatar');
    if (preview) preview.innerHTML = '<img src="' + pendingProfileAvatar + '" alt="Aperçu de la photo de profil">';
  } catch (error) {
    toast(error.message || 'Impossible de traiter cette image.', 'err');
  }
};
avatarInput.onchange = e => { const file = e.target.files?.[0]; e.target.value = ''; acceptAvatarFile(file); };
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


