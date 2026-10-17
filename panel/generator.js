const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="highlight">$1</span>').replace(/!!(.+?)!!/g, '<span class="danger-text">$1</span>');
const strong = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean);
const cols = l => l.split('|').map(c => c.trim());
const blocks = s => s.split(/\n\s*---\s*\n/).map(lines).filter(b => b.length);

const I = '      ';
const R = {
  text: s => {
    const p = s.body.split(/\n\s*\n/).filter(x => x.trim()).map(x => '<p>' + fmt(x.trim()).replace(/\n/g, '<br>') + '</p>').join('\n' + I + '<br>\n' + I);
    return p && s.italic ? '<i>\n' + I + p + '\n    </i>' : p;
  },
  list: s => '<ul' + (s.variant ? ' class="prohib-list"' : '') + '>\n' + lines(s.body).map(l => `${I}<li>${fmt(l)}</li>`).join('\n') + '\n    </ul>',
  cards: s => '<div class="rounds-grid">\n' + lines(s.body).map(l => {
    const [em, t, lb, big] = cols(l);
    return `${I}<div class="round-card">\n${I}  <div class="round-emoji">${esc(em)}</div>\n${I}  <div class="round-num">${esc(t)}</div>\n` + (big ? `${I}  <div class="round-floor">${esc(big)}</div>\n` : '') + `${I}  <div class="round-label">${esc(lb)}</div>\n${I}</div>`;
  }).join('\n') + '\n    </div>',
  info: s => '<div class="info-grid">\n' + lines(s.body).map(l => {
    const [a, b] = cols(l);
    return `${I}<div class="info-cell">\n${I}  <div class="info-label">${esc(a)}</div>\n${I}  <div class="info-value">${fmt(b)}</div>\n${I}</div>`;
  }).join('\n') + '\n    </div>',
  timeline: s => '<div class="timeline">\n' + lines(s.body).map(l => {
    const [a, b, c] = cols(l);
    return `${I}<div class="timeline-item">\n${I}  <div class="timeline-time">${esc(a)}</div>\n${I}  <div class="timeline-body">\n${I}    <div class="timeline-act">${fmt(b)}</div>\n` + (c ? `${I}    <div class="timeline-resp">${esc(c)}</div>\n` : '') + `${I}  </div>\n${I}</div>`;
  }).join('\n') + '\n    </div>',
  roles: s => '<div class="role-grid">\n' + blocks(s.body).map((b, i) =>
    `${I}<div class="role-col ${i ? 'div' : 'mrd'}">\n${I}  <div class="role-head">${esc(b[0])}</div>\n${I}  <ul>\n${b.slice(1).map(l => `${I}    <li>${fmt(l)}</li>`).join('\n')}\n${I}  </ul>\n${I}</div>`
  ).join('\n') + '\n    </div>',
  choices: s => '<div class="choice-grid">\n' + lines(s.body).map(l => {
    const c = cols(l), k = /^(wait|hunt)$/.test(c[2]) ? c[2] : 'wait';
    return `${I}<div class="choice-card ${k}">` + (c.length < 2 ? fmt(c[0]) : `<span class="choice-icon">${esc(c[0])}</span>${fmt(c[1])}`) + '</div>';
  }).join('\n') + '\n    </div>',
  prizes: s => '<div class="prizes-grid">\n' + lines(s.body).map((l, i) => {
    const [m, r, a, t] = cols(l), k = /^(gold|silver|bronze)$/.test(t) ? t : ['gold', 'silver', 'bronze'][i] || 'gold';
    return `${I}<div class="prize-card ${k}">\n${I}  <span class="prize-medal">${esc(m)}</span>\n${I}  <div class="prize-rank">${esc(r)}</div>\n${I}  <div class="prize-amount">${esc(a)}</div>\n${I}</div>`;
  }).join('\n') + '\n    </div>',
  stands: s => blocks(s.body).map((b, i) => {
    const games = b.slice(1).filter(l => !/^score:/i.test(l)).map(l => {
      const bonus = l[0] === '★', [a, d] = cols(bonus ? l.slice(1) : l);
      return `${I}  <div class="game${bonus ? ' bonus' : ''}">` + (d === undefined ? fmt(a) : `<strong>${esc(a)}</strong> — ${fmt(d)}`) + '</div>';
    }).join('\n');
    const sc = b.find(l => /^score:/i.test(l));
    return `<div class="stand">\n${I}<div class="stand-head"><span class="stand-num">${i + 1}</span> ${esc(b[0])}</div>\n${I}<div class="stand-games">\n${games}\n${I}</div>\n` + (sc ? `${I}<div class="stand-score">\n${I}  <span class="score-tag">Scoring</span>\n${I}  ${fmt(sc.replace(/^score:\s*/i, ''))}\n${I}</div>\n` : '') + '    </div>';
  }).join('\n\n    '),
  html: s => s.body
};

const sec = s => {
  if (s.legacyWholeSection) return s.body || '';
  const [ic, ...tx] = cols(s.box || '');
  const box = s.box ? `<div class="scoring-box">\n      <span class="sc-icon">${esc(ic)}</span>\n      <p>${strong(tx.join(' | '))}</p>\n    </div>` : '';
  const parts = [s.lead && `<p class="lead">${fmt(s.lead)}</p>`, R[s.type](s), box, s.note && `<p class="note">${fmt(s.note)}</p>`].filter(Boolean);
  return `  <div class="section reveal">\n    <div class="section-title"><span class="icon">${esc(s.icon)}</span> ${esc(s.title)}</div>\n    ${parts.join('\n    ')}\n  </div>`;
};

const page = e => {
  const m = e.meta;
  const head = [
    `<img src="${esc(m.logo)}" alt="MRD Logo" class="header-logo">`,
    m.badge && `<div class="badge">${esc(m.badge)}</div>`,
    `<h1>${esc(m.title).replace(/\n/g, '<br>')}</h1>`,
    m.date && `<div class="date-banner">${esc(m.date)}</div>`,
    m.divider && `<div class="header-divider"><span>${esc(m.divider)}</span></div>`
  ].filter(Boolean).join('\n    ');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(m.pageTitle || 'Event - ' + m.title.replace(/\n/g, ' '))}</title>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="${esc(m.logo)}">
<link rel="stylesheet" href="../public/style.css">
</head>
<body>
<div class="page">

  <div class="header reveal">
    ${head}
  </div>

${e.sections.map(sec).join('\n\n')}

  <div class="footer">
    <div class="footer-left">
      ${esc(m.fl)}
    </div>
    <div class="footer-right">${esc(m.fr)}</div>
  </div>

</div>
<script src="../public/script.js"><\/script>
</body>
</html>
`;
};

const cardOf = e => {
  const c = e.card, x = { status: c.status, href: e.slug + '/', icon: c.icon, title: c.title || e.meta.title.replace(/\n/g, ' ').toUpperCase(), desc: c.desc };
  if (c.date) x.date = c.date;
  return x;
};
