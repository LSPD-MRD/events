async function renderPublications() {
  try {
    await loadPortalSettings();
  } catch (error) {
    console.warn('Paramètres des catégories indisponibles', error);
  }
  $('#publications').innerHTML =
    `<section class="page-intro"><div><div class="eyebrow">MRD WORKSPACE · PUBLICATIONS</div><h1>Publications</h1><p>Importe tes créations Canva en PDF ou PNG pour conserver exactement leur mise en page.</p></div></section><section class="card"><header class="card-head"><h2>Nouvelle publication</h2><p>Actualités, comptes rendus et communiqués officiels.</p></header><form class="card-body" id="publication-form"><div class="field"><label for="pub-kind">Catégorie</label><div class="select-wrap"><select id="pub-kind">${portalSettings.categories
      .filter((c) => c.id !== 'events')
      .map((c) => {
        if (c.id === 'news')
          return (
            '<option value="news">Media Relations · ' +
            esc(c.name) +
            '</option><option value="comm-presse">Public Information (PIO) · Communiqué de presse</option>'
          );
        if (c.id === 'documents')
          return '<option value="comm-interne">Interagency · ' + esc(c.name) + '</option>';
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      })
      .join(
        '',
      )}</select><span class="select-chevron" aria-hidden="true">⌄</span></div></div><div class="field"><label for="pub-title">Titre</label><input id="pub-title" required maxlength="120" placeholder="Titre de la publication"></div><div class="field"><label for="pub-summary">Description (facultative)</label><textarea id="pub-summary" rows="3" maxlength="500"></textarea></div><div class="field"><label for="pub-date">Date</label><input id="pub-date" type="date" autocomplete="off" aria-label="Date de publication"></div><div class="field"><label for="pub-file">Fichier PDF ou image (max. 10 Mo)</label><div class="file-dropzone" id="publication-dropzone" role="button" tabindex="0" aria-controls="pub-file"><span class="file-dropzone-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3"/></svg></span><strong>Dépose ton fichier ici</strong><span class="file-dropzone-copy">ou <button type="button" class="file-dropzone-browse" data-file-browse="pub-file">parcourir tes fichiers</button></span><small class="file-dropzone-status" id="pub-file-status">PDF, PNG, JPG ou WEBP · 10 Mo maximum</small></div><input id="pub-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required class="visually-hidden-file"></div><div id="pub-preview" class="publication-preview">L'aperçu apparaîtra ici.</div><div class="publication-file-actions"><span class="file-dropzone-status" id="pub-selected-hint">Aucun fichier sélectionné...</span><button type="button" class="btn sm publication-file-clear" id="pub-file-clear" hidden>Retirer le fichier</button></div><button class="btn primary" id="pub-submit" type="submit">Publier sur le portail</button></form></section><section class="card"><header class="card-head"><h2>Publications en ligne</h2></header><div class="card-body" id="pub-list">Chargement…</div></section>`;
  const fileInput = $('#pub-file'),
    preview = $('#pub-preview'),
    dropzone = $('#publication-dropzone'),
    fileStatus = $('#pub-file-status'),
    clearFileButton = $('#pub-file-clear'),
    selectedHint = $('#pub-selected-hint');
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
  const acceptPublicationFile = (file) => {
    if (!file) return;
    if (
      !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      clearPublicationFile();
      fileStatus.textContent = 'Format invalide ou fichier supérieur à 10 Mo.';
      toast('Choisis un PDF, PNG, JPG ou WEBP de 10 Mo maximum.', 'err');
      return;
    }
    if (publicationPreviewUrl) URL.revokeObjectURL(publicationPreviewUrl);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileStatus.textContent =
      file.name +
      ' · ' +
      (file.size / (1024 * 1024) < 1
        ? Math.max(1, Math.round(file.size / 1024)) + ' Ko'
        : (file.size / (1024 * 1024)).toFixed(1) + ' Mo');
    dropzone.classList.add('has-file');
    publicationPreviewUrl = URL.createObjectURL(file);
    selectedHint.textContent = 'Fichier prêt à être publié : ' + file.name;
    clearFileButton.hidden = false;
    preview.innerHTML =
      file.type === 'application/pdf'
        ? '<iframe title="Aperçu PDF" src="' + publicationPreviewUrl + '"></iframe>'
        : '<img alt="Aperçu" src="' + publicationPreviewUrl + '">';
  };
  fileInput.onchange = () => acceptPublicationFile(fileInput.files[0]);
  dropzone.addEventListener('click', (e) => {
    if (!e.target.closest('[data-file-browse]')) fileInput.click();
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach((type) =>
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('is-dragging');
    }),
  );
  ['dragleave', 'dragend'].forEach((type) =>
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragging');
    }),
  );
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('is-dragging');
    acceptPublicationFile(e.dataTransfer?.files?.[0]);
  });
  try {
    const r = await fetch('../public/publications-data.js?v=' + Date.now());
    const t = r.ok ? await r.text() : '';
    const a = t.indexOf('['),
      z = t.lastIndexOf(']');
    const data = a >= 0 && z > a ? JSON.parse(t.slice(a, z + 1)) : [];
    $('#pub-list').innerHTML =
      data
        .map(
          (p) =>
            '<div class="row-item"><div class="meta"><b>' +
            esc(p.title) +
            '</b><small>' +
            esc(
              portalSettings.categories.find((c) => c.id === p.kind)?.name ||
                {
                  news: 'Media Relations',
                  'comm-presse': 'Public Information (PIO)',
                  'comm-interne': 'Interagency',
                  'compte-rendu': 'Interagency',
                }[p.kind] ||
                p.kind,
            ) +
            ' · ' +
            esc(
              (mrdDateUTC(p.date) ? mrdDateFmt.format(mrdDateUTC(p.date)) : p.date) || 'Sans date',
            ) +
            '</small></div><a class="btn sm" target="_blank" rel="noopener" href="../' +
            encodeURI(p.file) +
            '">Ouvrir</a><a class="btn sm" download href="../' +
            encodeURI(p.file) +
            '">Télécharger</a><button type="button" class="btn sm danger publication-delete" data-publication-delete="' +
            esc(p.id) +
            '">Supprimer</button></div>',
        )
        .join('') || '<p class="empty">Aucune publication en ligne.</p>';
  } catch {
    $('#pub-list').textContent = 'Impossible de charger les publications.';
  }
}
document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-publication-delete]');
  if (!button) return;
  const id = button.dataset.publicationDelete;
  if (!id) return;
  const accepted = await confirmDialog(
    'Cette action retirera définitivement la publication du portail et supprimera son fichier associé du dépôt. Cette opération est irréversible.',
    {
      title: 'Supprimer cette publication ?',
      confirmText: 'Supprimer la publication',
      danger: true,
    },
  );
  if (!accepted) return;
  button.disabled = true;
  button.textContent = 'Suppression…';
  try {
    await api.post('/publication/delete', { id });
    toast('Publication supprimée du portail.', 'ok');
    await renderPublications();
  } catch (error) {
    toast(error.message || 'Impossible de supprimer la publication.', 'err');
    button.disabled = false;
    button.textContent = 'Supprimer';
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'publication-form') return;
  e.preventDefault();
  const f = $('#pub-file').files[0];
  if (!f) return toast('Choisis un fichier.', 'err');
  if (f.size > 10 * 1024 * 1024) return toast('Maximum 10 Mo par fichier.', 'err');
  const b = $('#pub-submit');
  b.disabled = true;
  b.textContent = 'Publication…';
  try {
    const data = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.onerror = no;
      r.readAsDataURL(f);
    });
    await api.post('/publication/publish', {
      kind: $('#pub-kind').value,
      title: $('#pub-title').value.trim(),
      summary: $('#pub-summary').value.trim(),
      date: $('#pub-date').value,
      mime: f.type,
      data,
    });
    toast('Publication envoyée. Le portail sera actualisé dans environ une minute.', 'ok');
    await renderPublications();
  } catch (err) {
    toast(err.message || 'Échec de publication.', 'err');
  } finally {
    b.disabled = false;
    b.textContent = 'Publier sur le portail';
  }
});
