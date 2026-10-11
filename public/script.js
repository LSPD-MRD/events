const GROUPS = [
  { status: 'live', label: '🟢 EVENTS ACTIFS' },
  { status: 'soon', label: '🟡 À VENIR' },
  { status: 'archived', label: '⚫ ARCHIVES' }
];

const STATUS_TEXT = { live: '● Live'};
const ARROW_TEXT = { live: 'Voir le détail ▸', soon: 'Prochainement...', archived: "Revoir l'événement ▸" };

function buildCard(ev) {
  const clickable = ev.href && ev.status !== 'soon';
  const tag = clickable ? 'a' : 'div';
  const el = document.createElement(tag);
  const arrowText =
  !clickable && ev.status === 'archived'
    ? "Événement terminé"
    : ARROW_TEXT[ev.status];
  el.className = 'event-card reveal card-' + ev.status + (clickable ? '' : ' no-link');
  if (clickable) el.href = ev.href;

  let badges;
  if (ev.status === 'live') {
    badges = '<div class="event-badges"><span class="event-status status-live">' + STATUS_TEXT.live + '</span>' +
      (ev.date ? '<br><span class="event-date">📅 ' + ev.date + '</span>' : '') + '</div>';
  } else {
    badges = '';
  }

  el.innerHTML =
    '<div class="event-icon">' + ev.icon + '</div>' +
    badges +
    '<div class="event-title">' + ev.title + '</div>' +
    (ev.desc ? '<div class="event-desc">' + ev.desc + '</div>' : '') +
    '<div class="event-arrow">' + arrowText + '</div>';

  return el;
}

function renderPortal() {
  const root = document.getElementById('events-root');
  if (!root) return;
  GROUPS.forEach(g => {
    const items = EVENTS.filter(e => e.status === g.status);
    if (!items.length) return;
    const label = document.createElement('div');
    label.className = 'section-label reveal';
    label.textContent = g.label;
    root.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'events-grid';
    items.forEach(ev => grid.appendChild(buildCard(ev)));
    root.appendChild(grid);
  });
}

function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach(e => e.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 60);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });
  reveals.forEach(e => obs.observe(e));
}

document.addEventListener('DOMContentLoaded', () => {
  renderPortal();
  initReveal();
});