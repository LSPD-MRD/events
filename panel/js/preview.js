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
        .replace(
          '<body>',
          '<body class="mrd-app"><main id="app-root"><section class="content-wrap"><div class="event-detail">',
        )
        .replace('</body>', '</div></section></main></body>');
      frame.srcdoc = themed.includes('</body>')
        ? themed.replace('</body>', PREVIEW_HOOK + '</body>')
        : themed + PREVIEW_HOOK;
      frame.dataset.previewError = '';
    } catch (error) {
      frame.dataset.previewError = 'true';
      frame.srcdoc =
        '<!doctype html><html lang="fr"><meta charset="utf-8"><style>body{font:14px system-ui;background:#0b1118;color:#edf3f7;padding:24px}h2{color:#d6b574}pre{white-space:pre-wrap;color:#ff9b9b}</style><h2>Impossible de générer l’aperçu</h2><p>Vérifie les champs et les sections de cette page.</p><pre>' +
        String((error && error.message) || error).replace(
          /[&<>]/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c],
        ) +
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
