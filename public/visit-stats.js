/* Visiteur anonyme : aucun cookie, aucune adresse IP enregistrée. */
(() => {
  const endpoint = 'https://mrd-panel-test.biscuitytb2102.workers.dev/stats/visit';
  let id;
  try {
    id = localStorage.getItem('mrd-portal-visitor');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) {
      id = crypto.randomUUID();
      localStorage.setItem('mrd-portal-visitor', id);
    }
  } catch { return; }
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitor: id }),
    keepalive: true
  }).catch(() => {});
})();
