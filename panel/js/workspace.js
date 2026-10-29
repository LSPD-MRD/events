// MRD Effectif / calendrier / tâches
let ws = { roster: {}, calendar: [], tasks: [] },
  wsMembers = [],
  wsPerm = {},
  wsUpdatedAt = 0;
const WS_SECTION_KEY = 'mrd-division-section-v1';
const WS_CALENDAR_MONTH_KEY = 'mrd-effectif-calendar-month';
let wsSection = (() => {
  const saved = localStorage.getItem(WS_SECTION_KEY);
  return ['home', 'calendar', 'tasks'].includes(saved) ? saved : 'home';
})();
const wsGrades = [
  'Commanding Officer',
  'Assistant Commanding Officer',
  'Expert Officer',
  'Certified Officer',
];
const wsShort = {
  'Commanding Officer': 'CO',
  'Assistant Commanding Officer': 'ACO',
  'Expert Officer': 'EO',
  'Certified Officer': 'CtO',
};
const wsName = (u) =>
  [u?.displayFirstName, u?.displayLastName].filter(Boolean).join(' ').trim() ||
  u?.username ||
  'Membre MRD';
const wsMember = (id) => wsMembers.find((u) => Number(u.id) === Number(id));
const wsDate = (v) =>
  v
    ? new Date(v + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
const wsToday = () => new Date().toISOString().slice(0, 10);
const wsOwner = () => currentUser?.role === 'owner' && currentUser?.grade === 'Commanding Officer';
const wsAvatar = (u) =>
  '<span class="avatar-stack ws-avatar-stack"><span class="ws-avatar ws-avatar-fallback avatar-fallback">' +
  esc(wsName(u).charAt(0).toUpperCase()) +
  '</span>' +
  (u?.hasAvatar
    ? '<img class="ws-avatar avatar-lazy" data-avatar-user="' +
      esc(u.id) +
      '" loading="lazy" decoding="async" alt="">'
    : '') +
  '</span>';
async function saveWorkspace(payload) {
  const result = await api.post('/workspace/save', { ...payload, updatedAt: wsUpdatedAt });
  if (result.workspaceUpdatedAt != null) wsUpdatedAt = Number(result.workspaceUpdatedAt);
  return result;
}
async function loadWorkspace() {
  const d = await api.post('/workspace/get', {});
  wsUpdatedAt = Number(d.workspaceUpdatedAt || 0);
  ws = d.workspace || { roster: {}, calendar: [], tasks: [] };
  wsMembers = d.members || [];
  wsPerm = {
    roster: !!d.canManageRoster,
    calendar: !!d.canManageCalendar,
    tasks: !!d.canManageTasks,
  };
  const me = wsMembers.find((u) => Number(u.id) === Number(currentUser?.id));
  if (me) currentUser = { ...currentUser, ...me };
  applyPermissions();
  renderWorkspace();
}
function renderWorkspace() {
  const root = $('#effectif');
  if (!root) return;
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5.2v-6.3h-4.6v6.3H4.5a1 1 0 0 1-1-1z"/></svg>',
    roster:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a4.8 4.8 0 0 1 3.5 4.6"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h2m4 0h2M8 16.5h2"/></svg>',
    tasks:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="m7.5 9 1.5 1.5L12 7.5M13.5 9H17m-9.5 5 1.5 1.5 3-3M13.5 14H17"/></svg>',
  };
  const tabs = [
    ['home', 'Accueil'],
    ['calendar', 'Calendrier'],
    ['tasks', 'To-do list'],
  ];
  root.innerHTML =
    '<section class="page-intro ws-intro"><div><div class="eyebrow">MRD WORKSPACE</div><h1>Division</h1></div></section><nav class="ws-tabs" aria-label="Navigation de l’effectif">' +
    tabs
      .map(
        ([id, label]) =>
          '<button type="button" class="ws-tab ' +
          (wsSection === id ? 'active' : '') +
          '" data-ws-tab="' +
          id +
          '" aria-label="' +
          label +
          '" title="' +
          label +
          '" ' +
          (wsSection === id ? 'aria-current="page"' : '') +
          '><span class="ws-tab-icon" aria-hidden="true">' +
          icons[id] +
          '</span><span class="ws-tab-label">' +
          label +
          '</span>' +
          '</button>',
      )
      .join('') +
    '</nav><div id="ws-content"></div>';
  const c = $('#ws-content');
  if (wsSection === 'home') c.innerHTML = renderWsHome();
  if (wsSection === 'calendar') c.innerHTML = renderWsCalendar();
  if (wsSection === 'tasks') c.innerHTML = renderWsTasks();
  initMrdDatePickers(c);
  hydrateAvatars(root);
}
function renderWsHome() {
  const today = wsToday(),
    upcoming = [...ws.calendar]
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 3);
  const myProgress = (t) => t.progress?.[String(currentUser?.id)] || { status: 'todo', report: '' };
  const activeTasks = [...ws.tasks]
    .filter((t) => myProgress(t).status !== 'done')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 3);
  const dateLabel = (e) =>
    new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  const stats =
    '<div class="ws-stat-grid ws-home-stats"><article class="ws-stat"><span>Membres actifs</span><strong>' +
    wsMembers.length +
    '</strong><small>Effectif de la division</small></article><article class="ws-stat"><span>Rendez-vous à venir</span><strong>' +
    ws.calendar.filter((e) => e.date >= today).length +
    '</strong><small>Événements planifiés</small></article><article class="ws-stat"><span>Mes tâches en cours</span><strong>' +
    ws.tasks.filter((t) => myProgress(t).status === 'doing').length +
    '</strong><small>À suivre cette semaine</small></article></div>';
  const eventRows = upcoming.length
    ? upcoming
        .map(
          (e) =>
            '<button type="button" class="ws-home-row" data-ws-action="view-event" data-id="' +
            esc(e.id) +
            '"><span class="ws-home-date"><strong>' +
            new Date(e.date + 'T12:00:00').getDate() +
            '</strong><small>' +
            new Date(e.date + 'T12:00:00')
              .toLocaleDateString('fr-FR', { month: 'short' })
              .replace('.', '') +
            '</small></span><span class="ws-home-row-copy"><strong>' +
            esc(e.title) +
            '</strong><small>' +
            esc(dateLabel(e)) +
            ' · ' +
            esc(e.time || 'Heure à préciser') +
            (e.location ? ' · ' + esc(e.location) : '') +
            '</small></span><span class="ws-home-row-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></button>',
        )
        .join('')
    : '<p class="ws-home-empty">Aucun rendez-vous à venir.</p>';
  const taskRows = activeTasks.length
    ? activeTasks
        .map((t) => {
          const p = myProgress(t),
            label = p.status === 'doing' ? 'En cours' : 'À faire';
          return (
            '<div class="ws-home-row ws-home-task"><span class="ws-home-task-icon ' +
            (p.status === 'doing' ? 'is-doing' : '') +
            '"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="ws-home-row-copy"><strong>' +
            esc(t.title) +
            '</strong><small>' +
            label +
            ' · Échéance : ' +
            wsDate(t.dueDate) +
            '</small></span><span class="ws-home-task-status">' +
            label +
            '</span></div>'
          );
        })
        .join('')
    : '<p class="ws-home-empty">Aucune tâche en attente. Tout est à jour.</p>';
  return (
    stats +
    '<div class="ws-home-grid"><section class="ws-home-card"><header class="ws-home-card-head"><div><span class="ws-home-kicker">AGENDA</span><h2>Prochains rendez-vous</h2></div><button type="button" class="ws-home-link" data-ws-tab="calendar">Tout voir <span aria-hidden="true">↗</span></button></header><div class="ws-home-rows">' +
    eventRows +
    '</div></section><section class="ws-home-card"><header class="ws-home-card-head"><div><span class="ws-home-kicker">À SUIVRE</span><h2>Mes tâches</h2></div><button type="button" class="ws-home-link" data-ws-tab="tasks">Tout voir <span aria-hidden="true">↗</span></button></header><div class="ws-home-rows">' +
    taskRows +
    '</div></section></div><section class="ws-home-org-widget"><header class="ws-home-card-head"><div><span class="ws-home-kicker">STRUCTURE DE LA DIVISION</span><h2>Organigramme MRD</h2></div><span class="ws-home-org-count">' +
    wsMembers.length +
    ' membres</span></header>' +
    renderWsRoster() +
    '</section>'
  );
}
function renderWsRoster() {
  const ordered = [...wsMembers].sort(
    (a, b) =>
      wsGrades.indexOf(a.grade) - wsGrades.indexOf(b.grade) ||
      Number(ws.roster?.[a.id]?.order ?? 9999) - Number(ws.roster?.[b.id]?.order ?? 9999) ||
      wsName(a).localeCompare(wsName(b), 'fr'),
  );
  const stats =
    '<div class="ws-stat-grid"><article class="ws-stat"><span>Effectif actif</span><strong>' +
    wsMembers.length +
    '</strong><small>Membres enregistrés</small></article><article class="ws-stat"><span>À venir</span><strong>' +
    ws.calendar.filter((e) => e.date >= wsToday()).length +
    '</strong><small>Rendez-vous planifiés</small></article><article class="ws-stat"><span>Tâches</span><strong>' +
    ws.tasks.filter((t) => Object.values(t.progress || {}).some((x) => x.status === 'doing'))
      .length +
    '</strong><small>En cours</small></article></div>';
  const tiers = wsGrades
    .map((grade, i) => {
      const people = ordered.filter((u) => u.grade === grade);
      const columnCount = people.length <= 1 ? 1 : people.length <= 3 ? 3 : 5;
      const memberColumns = people.map((_, index) => {
        if (people.length === 1) return 1;
        if (people.length === 2) return index === 0 ? 1 : 3;
        if (people.length === 3) return index + 1;
        const center = (columnCount + 1) / 2;
        if (people.length > 5) {
          return [center, center - 1, center + 1, center - 2, center + 2][index % 5];
        }
        if (people.length % 2 === 0) {
          const offset = Math.floor(index / 2);
          return index % 2 === 0 ? center - 1 - offset : center + 1 + offset;
        }
        const offset = Math.ceil(index / 2);
        return index === 0 ? center : index % 2 === 1 ? center - offset : center + offset;
      });
      const members = people
        .map((u, memberIndex) => {
          const m = ws.roster?.[u.id] || {};
          const dates =
            m.arrivalDate || m.promotionDate
              ? '<div class="ws-member-tags">' +
                (m.arrivalDate
                  ? '<span class="ws-member-tag"><span class="ws-tag-icon">↗</span><span><small>ARRIVÉE</small><strong>' +
                    esc(wsDate(m.arrivalDate)) +
                    '</strong></span></span>'
                  : '') +
                (m.promotionDate
                  ? '<span class="ws-member-tag promotion"><span class="ws-tag-icon">✦</span><span><small>PROMOTION</small><strong>' +
                    esc(wsDate(m.promotionDate)) +
                    '</strong></span></span>'
                  : '') +
                '</div>'
              : '';
          const note = m.publicNotes
            ? '<div class="ws-member-note"><span class="ws-member-note-label">Note de service</span><p>' +
              esc(m.publicNotes) +
              '</p></div>'
            : '';
          return (
            '<article class="ws-member-card" data-grade="' +
            i +
            '" style="grid-column:' +
            memberColumns[memberIndex] +
            '"><div class="ws-member-top">' +
            wsAvatar(u) +
            '<div class="ws-member-identity"><strong>' +
            esc(wsName(u)) +
            '</strong><span>' +
            wsShort[u.grade] +
            '</span><small>@' +
            esc(u.username) +
            '</small></div>' +
            (Number(u.id) === Number(currentUser?.id) ? '<span class="ws-you">VOUS</span>' : '') +
            '</div>' +
            (u.accreditations?.length
              ? '<div class="accreditation-tags ws-accreditations">' +
                accreditationTags(u.accreditations) +
                '</div>'
              : '') +
            dates +
            (wsPerm.roster
              ? '<details class="ws-edit-details"><summary>Gérer la fiche</summary><form class="ws-roster-form" data-id="' +
                u.id +
                '"><div class="ws-form-grid"><label>Prénom affiché<input name="first" maxlength="40" value="' +
                esc(u.displayFirstName || '') +
                '"></label><label>Nom affiché<input name="last" maxlength="40" value="' +
                esc(u.displayLastName || '') +
                '"></label><label>Date d’arrivée<input type="date" name="arrival" value="' +
                esc(m.arrivalDate || '') +
                '"></label><label>Date de promotion<input type="date" name="promotion" value="' +
                esc(m.promotionDate || '') +
                '"></label><label>Ordre d’affichage<input type="number" name="order" min="0" max="9999" value="' +
                Number(m.order || 0) +
                '"></label></div><label>Note visible à l’effectif<textarea name="publicNotes" maxlength="500" rows="2">' +
                esc(m.publicNotes || '') +
                '</textarea></label><label>Notes internes CO<textarea name="privateNotes" maxlength="1500" rows="3">' +
                esc(m.privateNotes || '') +
                '</textarea></label><button class="btn primary" type="submit">Enregistrer la fiche</button></form></details>'
              : '') +
            note +
            '</article>'
          );
        })
        .join('');
      return (
        '<section class="ws-org-tier tier-' +
        (i + 1) +
        '"><div class="ws-tier-heading"><span class="ws-tier-index">0' +
        (i + 1) +
        '</span><div><span class="ws-tier-kicker">NIVEAU HIÉRARCHIQUE</span><h3>' +
        esc(grade) +
        '</h3><small>' +
        wsShort[grade] +
        ' <i></i> ' +
        people.length +
        ' membre(s)</small></div><span class="ws-tier-rail" aria-hidden="true"></span></div><div class="ws-tier-members ' +
        (people.length > 1 ? 'has-multiple' : 'single-member') +
        '" style="--ws-columns:' +
        columnCount +
        ';--ws-connector-inset:' +
        100 / (2 * columnCount) +
        '%">' +
        (members || '<div class="ws-empty-grade">Aucun membre à ce grade pour le moment.</div>') +
        '</div></section>'
      );
    })
    .join('');
  return (
    '<section class="ws-org-board"><div class="ws-org-board-head"><span class="ws-org-pulse"></span><div><strong>MRD · STRUCTURE OPÉRATIONNELLE</strong><small>CHAÎNE DE COMMANDEMENT <span>·</span> ' +
    wsMembers.length +
    ' MEMBRES</small></div><span class="ws-org-board-mark">LSPD / MRD</span></div><div class="ws-org-chart">' +
    tiers +
    '</div><div class="ws-org-board-foot"><span>MEDIA RELATIONS DIVISION</span><span>ORGANIGRAMME <b>·</b> EFFECTIF ACTIF</span></div></section>'
  );
}
let wsCalendarMonth = (() => {
  const saved = localStorage.getItem(WS_CALENDAR_MONTH_KEY);
  const d = /^\d{4}-\d{2}$/.test(saved || '') ? new Date(saved + '-01T12:00:00') : new Date();
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  return d;
})();
function wsCalendarISO(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
function wsCalendarMonthLabel(d) {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function wsCalendarSetMonth(delta) {
  if (delta === null) {
    wsCalendarMonth = new Date();
  } else {
    wsCalendarMonth = new Date(
      wsCalendarMonth.getFullYear(),
      wsCalendarMonth.getMonth() + delta,
      1,
      12,
    );
  }
  wsCalendarMonth.setDate(1);
  localStorage.setItem(WS_CALENDAR_MONTH_KEY, wsCalendarISO(wsCalendarMonth).slice(0, 7));
}
function wsEventParticipants(event) {
  const signups = Array.isArray(event.signups) ? event.signups : [];
  return signups
    .map((s) => {
      const u = wsMember(s.userId);
      return u
        ? '<span class="ws-month-avatar" title="' + esc(wsName(u)) + '">' + wsAvatar(u) + '</span>'
        : '';
    })
    .join('');
}
function renderWsCalendar() {
  const events = [...ws.calendar].sort((a, b) =>
    (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')),
  );
  const year = wsCalendarMonth.getFullYear(),
    month = wsCalendarMonth.getMonth(),
    first = new Date(year, month, 1, 12),
    daysInMonth = new Date(year, month + 1, 0, 12).getDate(),
    offset = (first.getDay() + 6) % 7,
    total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const byDate = new Map();
  events.forEach((event) => {
    if (!byDate.has(event.date)) byDate.set(event.date, []);
    byDate.get(event.date).push(event);
  });
  const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    .map((d) => '<div class="ws-month-weekday">' + d + '</div>')
    .join('');
  const cells = Array.from({ length: total }, (_, i) => {
    const day = i - offset + 1;
    if (day < 1 || day > daysInMonth)
      return '<div class="ws-month-day is-outside" aria-hidden="true"></div>';
    const date = new Date(year, month, day, 12),
      iso = wsCalendarISO(date),
      items = byDate.get(iso) || [];
    const eventCards = items
      .map((event) => {
        const signups = Array.isArray(event.signups) ? event.signups : [];
        return (
          '<button type="button" class="ws-month-event" data-ws-action="view-event" data-id="' +
          esc(event.id) +
          '" aria-label="Voir les détails de ' +
          esc(event.title) +
          '"><span class="ws-month-event-time">' +
          esc(event.time || '—') +
          '</span><strong>' +
          esc(event.title) +
          '</strong>' +
          (event.location
            ? '<span class="ws-month-event-location">' + esc(event.location) + '</span>'
            : '') +
          '<span class="ws-month-event-bottom"><span class="ws-month-event-avatars">' +
          wsEventParticipants(event) +
          '</span><span class="ws-month-event-count">♙ ' +
          signups.length +
          '</span></span></button>'
        );
      })
      .join('');
    return (
      '<section class="ws-month-day ' +
      (iso === wsToday() ? 'is-today' : '') +
      (items.length ? ' has-events' : '') +
      '"><header><span>' +
      day +
      '</span>' +
      (items.length ? '<small>' + items.length + '</small>' : '') +
      '</header><div class="ws-month-day-events">' +
      eventCards +
      '</div></section>'
    );
  }).join('');
  const fmtDate = (e) => {
    const d = new Date(e.date + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const dropdown = events.length
    ? events
        .map(
          (event) =>
            '<div class="ws-calendar-menu-row"><div><strong>' +
            esc(event.title) +
            '</strong><small>' +
            esc(fmtDate(event)) +
            ' · ' +
            esc(event.time || 'Heure à préciser') +
            ' · ' +
            (Array.isArray(event.signups) ? event.signups.length : 0) +
            ' inscrit(s)</small></div><button type="button" class="btn" data-ws-action="view-event" data-id="' +
            esc(event.id) +
            '">Détails</button></div>',
        )
        .join('')
    : '<div class="ws-calendar-menu-empty">Aucun rendez-vous programmé.</div>';
  return (
    '<div class="ws-section-heading"><div><h2>Calendrier de la division</h2></div>' +
    (wsPerm.calendar
      ? '<button class="btn primary" data-ws-action="new-event">＋ Nouvel événement</button>'
      : '') +
    '</div>' +
    (wsPerm.calendar ? wsEventForm() : '') +
    '<section class="ws-month-calendar"><div class="ws-month-toolbar"><div class="ws-month-heading"><strong>' +
    esc(wsCalendarMonthLabel(wsCalendarMonth)) +
    '</strong><span>' +
    events.filter((e) => e.date.startsWith(wsCalendarISO(first).slice(0, 7))).length +
    ' rendez-vous</span></div><div class="ws-month-controls"><button type="button" class="btn" data-ws-action="month-prev" aria-label="Mois précédent">‹</button><button type="button" class="btn" data-ws-action="month-today">Aujourd’hui</button><button type="button" class="btn" data-ws-action="month-next" aria-label="Mois suivant">›</button></div></div><div class="ws-month-grid" role="grid" aria-label="Calendrier mensuel"><div class="ws-month-weekdays">' +
    weekdays +
    '</div><div class="ws-month-days">' +
    cells +
    '</div></div><div class="ws-month-footer"><span><i></i> Aujourd’hui</span><span>Clique sur un rendez-vous pour consulter les détails et les participants</span></div></section><details class="ws-calendar-dropdown"><summary><span>Liste des rendez-vous</span><small>' +
    events.length +
    ' rendez-vous</small><span class="ws-calendar-dropdown-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6.5 9 5.5 5.5L17.5 9"/></svg></span></summary><div class="ws-calendar-menu">' +
    dropdown +
    '</div></details>'
  );
}
function wsEventDetailsMarkup(event) {
  const signups = Array.isArray(event.signups) ? event.signups : [],
    mine = signups.find((s) => Number(s.userId) === Number(currentUser?.id)),
    status = event.date >= wsToday() ? 'À venir' : 'Terminé';
  const dateLabel = new Date(event.date + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const people = signups
    .map((s) => {
      const u = wsMember(s.userId);
      return u
        ? '<div class="ws-event-person">' +
            wsAvatar(u) +
            '<span>' +
            esc(wsName(u)) +
            '</span>' +
            (Number(u.id) === Number(currentUser?.id) ? '<small>VOUS</small>' : '') +
            '</div>'
        : '<div class="ws-event-person"><span>Membre MRD</span></div>';
    })
    .join('');
  return (
    '<div class="ws-event-modal-backdrop" data-ws-action="close-event-details" id="ws-event-details"><section class="ws-event-modal" role="dialog" aria-modal="true" aria-labelledby="ws-event-modal-title" data-ws-modal-content><header class="ws-event-modal-head"><div><span class="ws-event-modal-kicker">RENDEZ-VOUS MRD</span><h2 id="ws-event-modal-title">' +
    esc(event.title) +
    '</h2></div><button type="button" class="ws-icon-button" data-ws-action="close-event-details" aria-label="Fermer">×</button></header><div class="ws-event-modal-body"><div class="ws-event-modal-status ' +
    (status === 'À venir' ? 'upcoming' : '') +
    '">' +
    status.toUpperCase() +
    '</div><div class="ws-event-modal-meta"><div><small>DATE</small><strong>' +
    esc(dateLabel) +
    '</strong></div><div><small>HEURE</small><strong>' +
    esc(event.time || 'À préciser') +
    '</strong></div><div><small>LIEU</small><strong>' +
    esc(event.location || 'À préciser') +
    '</strong></div></div><section class="ws-event-modal-section"><h3>Description</h3><p class="ws-event-modal-description">' +
    esc(event.description || 'Aucune description renseignée.') +
    '</p></section><section class="ws-event-modal-section"><div class="ws-event-modal-section-head"><h3>Participants</h3><span>' +
    signups.length +
    ' inscrit(s)</span></div><div class="ws-event-people">' +
    (people || '<p class="ws-event-no-people">Aucun participant inscrit pour le moment.</p>') +
    '</div></section>' +
    (mine
      ? '<details class="ws-report" open><summary>Mes notes & travail rendu</summary><form class="ws-report-form" data-id="' +
        esc(event.id) +
        '"><label>Notes personnelles<textarea name="notes" rows="2" maxlength="1200">' +
        esc(mine.notes || '') +
        '</textarea></label><label>Travail réalisé<textarea name="work" rows="3" maxlength="2000" placeholder="Décris concrètement ce que tu as réalisé…">' +
        esc(mine.work || '') +
        '</textarea></label><button class="btn primary" type="submit">Enregistrer mon compte rendu</button></form></details>'
      : '') +
    '</div><footer class="ws-event-modal-actions">' +
    (mine
      ? '<button class="btn" data-ws-action="leave" data-id="' +
        esc(event.id) +
        '">Se désinscrire</button>'
      : '<button class="btn primary" data-ws-action="join" data-id="' +
        esc(event.id) +
        '">＋ M’inscrire</button>') +
    (wsPerm.calendar
      ? '<button class="btn" data-ws-action="edit-event" data-id="' +
        esc(event.id) +
        '">Modifier</button><button class="btn ws-danger" data-ws-action="delete-event" data-id="' +
        esc(event.id) +
        '">Supprimer</button>'
      : '') +
    '</footer></section></div>'
  );
}
function openWsEventDetails(id) {
  const event = ws.calendar.find((item) => String(item.id) === String(id));
  if (!event) return;
  $('#ws-event-details')?.remove();
  $('#ws-content')?.insertAdjacentHTML('beforeend', wsEventDetailsMarkup(event));
}
function wsEventForm(event) {
  return (
    '<form class="ws-editor-form" id="ws-event-form" data-id="' +
    esc(event?.id || '') +
    '" hidden><div class="ws-form-top"><h3>' +
    (event ? 'Modifier l’événement' : 'Programmer un événement') +
    '</h3><button type="button" class="ws-icon-button" data-ws-action="cancel-form">×</button></div><div class="ws-form-grid"><label>Intitulé<input name="title" required maxlength="120" value="' +
    esc(event?.title || '') +
    '"></label><label>Date<input name="date" type="date" required value="' +
    esc(event?.date || wsToday()) +
    '"></label><label>Heure<input name="time" type="time" value="' +
    esc(event?.time || '') +
    '"></label><label>Lieu<input name="location" maxlength="160" value="' +
    esc(event?.location || '') +
    '"></label></div><label>Description<textarea name="description" rows="3" maxlength="1500">' +
    esc(event?.description || '') +
    '</textarea></label><button class="btn primary" type="submit">Enregistrer l’événement</button></form>'
  );
}
function renderWsTasks() {
  const tasks = [...ws.tasks].sort((a, b) =>
    (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
  );
  const mine = (t) => t.progress?.[String(currentUser.id)] || { status: 'todo', report: '' },
    done = tasks.filter((t) => mine(t).status === 'done').length;
  return (
    '<div class="ws-section-heading"><div><span class="ws-kicker">SUIVI OPÉRATIONNEL</span><h2>To-do list</h2><p>Consignes, responsables et comptes rendus de travail de la MRD.</p></div>' +
    (wsPerm.tasks
      ? '<button class="btn primary" data-ws-action="new-task">＋ Nouvelle tâche</button>'
      : '') +
    '</div><div class="ws-task-progress"><div><span>Ma progression</span><strong>' +
    done +
    ' / ' +
    tasks.length +
    ' terminée(s)</strong></div><div class="ws-progress-track"><span style="width:' +
    (tasks.length ? Math.round((done / tasks.length) * 100) : 0) +
    '%"></span></div></div>' +
    (wsPerm.tasks ? wsTaskForm() : '') +
    '<div class="ws-task-list">' +
    (tasks.length
      ? tasks
          .map((t) => {
            const prog = mine(t),
              assigned = t.assignedTo ? wsMember(t.assignedTo) : null,
              canUpdate =
                !t.assignedTo || Number(t.assignedTo) === Number(currentUser.id) || wsPerm.tasks,
              labels = { todo: 'À faire', doing: 'En cours', done: 'Terminée' };
            return (
              '<article class="ws-task-card status-' +
              esc(prog.status) +
              '"><div class="ws-task-check">' +
              (prog.status === 'done' ? '✓' : prog.status === 'doing' ? '↻' : '·') +
              '</div><div class="ws-task-main"><div class="ws-task-title-row"><h3>' +
              esc(t.title) +
              '</h3><span class="ws-task-status">' +
              labels[prog.status] +
              '</span></div><p>' +
              esc(t.description || '') +
              '</p><div class="ws-task-meta"><span>Échéance : ' +
              wsDate(t.dueDate) +
              '</span><span>Responsable : ' +
              esc(assigned ? wsName(assigned) : 'Toute la division') +
              '</span></div><details class="ws-report"><summary>Mon avancement & travail rendu</summary><form class="ws-task-progress-form" data-id="' +
              esc(t.id) +
              '"><label>Statut<select name="status" ' +
              (canUpdate ? '' : 'disabled') +
              '>' +
              Object.entries(labels)
                .map(
                  ([v, l]) =>
                    '<option value="' +
                    v +
                    '" ' +
                    (prog.status === v ? 'selected' : '') +
                    '>' +
                    l +
                    '</option>',
                )
                .join('') +
              '</select></label><label>Travail réalisé<textarea name="report" rows="3" maxlength="2000" ' +
              (canUpdate ? '' : 'disabled') +
              '>' +
              esc(prog.report || '') +
              '</textarea></label>' +
              (canUpdate
                ? '<button class="btn primary" type="submit">Enregistrer mon avancement</button>'
                : '<small>Tâche attribuée à un autre membre.</small>') +
              '</form></details>' +
              (wsPerm.tasks
                ? '<div class="ws-event-actions"><button class="btn" data-ws-action="edit-task" data-id="' +
                  esc(t.id) +
                  '">Modifier</button><button class="btn ws-danger" data-ws-action="delete-task" data-id="' +
                  esc(t.id) +
                  '">Supprimer</button></div>'
                : '') +
              '</div></article>'
            );
          })
          .join('')
      : '<div class="ws-empty"><strong>Aucune tâche en cours</strong><p>Les nouvelles consignes apparaîtront ici.</p></div>') +
    '</div>'
  );
}
function wsTaskForm(task) {
  return (
    '<form class="ws-editor-form" id="ws-task-form" data-id="' +
    esc(task?.id || '') +
    '" hidden><div class="ws-form-top"><h3>' +
    (task ? 'Modifier la tâche' : 'Créer une tâche') +
    '</h3><button type="button" class="ws-icon-button" data-ws-action="cancel-form">×</button></div><div class="ws-form-grid"><label>Titre<input name="title" required maxlength="120" value="' +
    esc(task?.title || '') +
    '"></label><label>Échéance<input type="date" name="dueDate" value="' +
    esc(task?.dueDate || '') +
    '"></label><label>Responsable<select name="assignedTo"><option value="">Toute la division</option>' +
    wsMembers
      .map(
        (u) =>
          '<option value="' +
          u.id +
          '" ' +
          (Number(task?.assignedTo) === Number(u.id) ? 'selected' : '') +
          '>' +
          esc(wsName(u)) +
          '</option>',
      )
      .join('') +
    '</select></label></div><label>Description<textarea name="description" rows="3" maxlength="1500">' +
    esc(task?.description || '') +
    '</textarea></label><button class="btn primary" type="submit">Enregistrer la tâche</button></form>'
  );
}
async function wsReload(section = wsSection) {
  wsSection = section;
  localStorage.setItem(WS_SECTION_KEY, wsSection);
  await loadWorkspace();
}
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-ws-tab]');
  if (tab) {
    wsSection = tab.dataset.wsTab;
    localStorage.setItem(WS_SECTION_KEY, wsSection);
    renderWorkspace();
    return;
  }
  const b = e.target.closest('[data-ws-action]');
  if (!b) return;
  const action = b.dataset.wsAction,
    id = b.dataset.id;
  if (action === 'month-prev' || action === 'month-next' || action === 'month-today') {
    wsCalendarSetMonth(action === 'month-prev' ? -1 : action === 'month-next' ? 1 : null);
    renderWorkspace();
    return;
  }
  if (action === 'view-event') {
    openWsEventDetails(id);
    return;
  }
  if (action === 'close-event-details') {
    if (e.target === b || b.matches('.ws-icon-button')) $('#ws-event-details')?.remove();
    return;
  }
  try {
    if (action === 'new-event') {
      let f = $('#ws-event-form');
      if (!f) {
        $('#ws-content').insertAdjacentHTML('afterbegin', wsEventForm());
        f = $('#ws-event-form');
        if (f) initMrdDatePickers(f);
      }
      if (!f) {
        toast('Le formulaire événement ne peut pas être chargé.', 'err');
        return;
      }
      f.hidden = false;
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (action === 'new-task') {
      let f = $('#ws-task-form');
      if (!f) {
        $('#ws-content').insertAdjacentHTML('afterbegin', wsTaskForm());
        f = $('#ws-task-form');
        if (f) initMrdDatePickers(f);
      }
      if (!f) {
        toast('Le formulaire de tâche ne peut pas être chargé.', 'err');
        return;
      }
      f.hidden = false;
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (action === 'cancel-form') {
      const f = b.closest('form');
      if (f) f.hidden = true;
      return;
    }
    if (action === 'edit-event') {
      const item = ws.calendar.find((x) => String(x.id) === String(id));
      $('#ws-event-details')?.remove();
      $('#ws-event-form')?.remove();
      $('#ws-content').insertAdjacentHTML('afterbegin', wsEventForm(item));
      $('#ws-event-form').hidden = false;
      initMrdDatePickers($('#ws-event-form'));
      $('#ws-event-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (action === 'edit-task') {
      const item = ws.tasks.find((x) => x.id === id);
      $('#ws-task-form')?.remove();
      $('#ws-content').insertAdjacentHTML('afterbegin', wsTaskForm(item));
      $('#ws-task-form').hidden = false;
      return;
    }
    if (action === 'delete-event' || action === 'delete-task') {
      if (
        !(await confirmDialog('Cette suppression est définitive.', {
          title: 'Confirmer la suppression',
          confirmText: 'Supprimer',
          danger: true,
        }))
      )
        return;
      await saveWorkspace(
        action === 'delete-event'
          ? { action: 'event-delete', eventId: id }
          : { action: 'task-delete', taskId: id },
      );
      await wsReload();
      return;
    }
    if (action === 'join' || action === 'leave') {
      await saveWorkspace({ action: 'signup', eventId: id, join: action === 'join' });
      toast(action === 'join' ? 'Inscription confirmée.' : 'Désinscription enregistrée.', 'ok');
      await wsReload('calendar');
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});
document.addEventListener('submit', async (e) => {
  const f = e.target;
  try {
    if (f.matches('.ws-roster-form')) {
      e.preventDefault();
      const d = new FormData(f),
        id = Number(f.dataset.id);
      await api.post('/users/profile', {
        id,
        displayFirstName: d.get('first'),
        displayLastName: d.get('last'),
      });
      await saveWorkspace({
        action: 'roster',
        userId: id,
        roster: {
          order: Number(d.get('order') || 0),
          arrivalDate: d.get('arrival') || '',
          promotionDate: d.get('promotion') || '',
          publicNotes: d.get('publicNotes'),
          privateNotes: d.get('privateNotes'),
        },
      });
      toast('Fiche membre enregistrée.', 'ok');
      await wsReload('roster');
      return;
    }
    if (f.id === 'ws-event-form') {
      e.preventDefault();
      const d = new FormData(f);
      await saveWorkspace({
        action: 'event-upsert',
        event: {
          id: f.dataset.id,
          title: d.get('title'),
          date: d.get('date'),
          time: d.get('time'),
          location: d.get('location'),
          description: d.get('description'),
        },
      });
      toast('Événement enregistré.', 'ok');
      await wsReload('calendar');
      return;
    }
    if (f.matches('.ws-report-form')) {
      e.preventDefault();
      const d = new FormData(f);
      await saveWorkspace({
        action: 'event-report',
        eventId: f.dataset.id,
        notes: d.get('notes'),
        work: d.get('work'),
      });
      toast('Compte rendu enregistré.', 'ok');
      await wsReload('calendar');
      return;
    }
    if (f.id === 'ws-task-form') {
      e.preventDefault();
      const d = new FormData(f);
      await saveWorkspace({
        action: 'task-upsert',
        task: {
          id: f.dataset.id,
          title: d.get('title'),
          dueDate: d.get('dueDate'),
          assignedTo: d.get('assignedTo'),
          description: d.get('description'),
        },
      });
      toast('Tâche enregistrée.', 'ok');
      await wsReload('tasks');
      return;
    }
    if (f.matches('.ws-task-progress-form')) {
      e.preventDefault();
      const d = new FormData(f);
      await saveWorkspace({
        action: 'task-progress',
        taskId: f.dataset.id,
        status: d.get('status'),
        report: d.get('report'),
      });
      toast('Avancement enregistré.', 'ok');
      await wsReload('tasks');
      return;
    }
    if (f.id === 'display-profile-form') {
      e.preventDefault();
      const d = new FormData(f),
        payload = { displayFirstName: d.get('first'), displayLastName: d.get('last') };
      if (profileAvatarChanged) payload.avatarData = pendingProfileAvatar;
      const r = await api.post('/auth/profile', payload);
      currentUser = {
        ...currentUser,
        ...r.user,
        avatarData: r.avatarData || null,
        hasAvatar: !!r.avatarData,
      };
      avatarDataCache.set(String(currentUser.id), Promise.resolve(r.avatarData || null));
      pendingProfileAvatar = undefined;
      profileAvatarChanged = false;
      applyPermissions();
      renderProfile();
      toast('Profil enregistré.', 'ok');
      return;
    }
  } catch (err) {
    e.preventDefault();
    toast(err.message || 'Enregistrement impossible.', 'err');
  }
});

initMrdDatePickers(document);
const activePageLabel = $('#active-page-label');
if (activePageLabel) activePageLabel.textContent = PAGE_LABELS.edit;
applyTheme(localStorage.getItem(KEY.theme) || 'dark');
try {
  load(JSON.parse(localStorage.getItem(KEY.draft)) || {});
} catch {
  load({});
}
$('.layout').dataset.activeTab = 'edit';
setPreview(true);
restoreSession();
