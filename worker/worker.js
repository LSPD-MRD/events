const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', ...h } });
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
const RESERVED = ['panel', 'public', 'worker', 'api'];
const okSlug = s => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 60 && !RESERVED.includes(s);
const okHtml = h => typeof h === 'string' && h.length < 200000 && (h.match(/<script/gi) || []).length === 1 && !/<[^>]+\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i.test(h);
const okText = v => v === undefined || (typeof v === 'string' && v.length < 300 && !/[<>]/.test(v));
const okEntry = e => e && ['live', 'soon', 'archived'].includes(e.status) && typeof e.href === 'string' && /^([a-z0-9-]+\/)?$/.test(e.href) && ['icon', 'title', 'desc', 'date'].every(k => okText(e[k]));
const gh = (env, path, init = {}) => fetch(`https://api.github.com/repos/${env.OWNER}/${env.REPO}/contents/${path}` + (init.method ? '' : `?ref=${env.BRANCH}`), { ...init, headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mrd-panel' } });
async function read(env, path) { const r = await gh(env, path); if (r.status === 404) return null; if (!r.ok) throw new Error('GitHub ' + r.status); const f = await r.json(); return { sha: f.sha, text: unb64(f.content) }; }
async function write(env, path, text, message) { const f = await read(env, path); const r = await gh(env, path, { method: 'PUT', body: JSON.stringify({ message, content: b64(text), branch: env.BRANCH, sha: f && f.sha }) }); if (!r.ok) throw new Error('GitHub ' + r.status); }
const parse = t => JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
const serialize = l => 'const EVENTS = ' + JSON.stringify(l, null, 2) + ';\n';
const parseContent = t => { const a=t.indexOf('{'), z=t.lastIndexOf('}'); return JSON.parse(t.slice(a,z+1)); };
const serializeContent = o => 'window.EVENT_CONTENT = ' + JSON.stringify(o, null, 2) + ';\n';
function extractPage(html) {
  const start = html.search(/<div\s+class=[\"']page[\"'][^>]*>/i);
  if (start < 0) return null;
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = start; let depth = 0, m;
  while ((m = tags.exec(html))) {
    if (/^<\s*\//.test(m[0])) depth--;
    else if (!/\/\s*>$/.test(m[0])) depth++;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  return null;
}
export default {
 async fetch(req, env) {
  const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'méthode refusée' }, 405, cors);
  if (req.headers.get('X-Access-Code') !== env.ACCESS_CODE) return json({ error: 'code invalide' }, 401, cors);
  let b; try { b = await req.json(); } catch { return json({ error: 'requête illisible' }, 400, cors); }
  const who = String(b.author || 'anonyme').replace(/[^\w .-]/g, '').slice(0, 30) || 'anonyme';
  const route = new URL(req.url).pathname;
  try {
   if (route === '/ping') return json({ ok: true, architecture: 'unified-portal' }, 200, cors);
   if (route === '/publish') {
    if (!okSlug(b.slug) || !okHtml(b.html) || !okEntry(b.card) || b.card.href !== b.slug + '/' || typeof b.config !== 'string' || b.config.length > 200000) return json({ error: 'données refusées' }, 400, cors);
    JSON.parse(b.config);
    const cf = await read(env, 'public/events-content.js');
    const contents = cf ? parseContent(cf.text) : {};
    const full = b.html.replace(/\.\.\/public\//g, './public/').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const extracted = extractPage(full);
    if (!extracted) return json({ error: 'structure de page invalide' }, 400, cors);
    contents[b.slug] = extracted;
    await write(env, 'public/events-content.js', serializeContent(contents), `Contenu événement ${b.slug} (${who})`);
    const f = await read(env, 'public/events-data.js');
    const list = parse(f.text), i = list.findIndex(x => x.href === b.card.href);
    if (i < 0) list.unshift(b.card); else list[i] = b.card;
    await write(env, 'public/events-data.js', serialize(list), `Portail : ${b.slug} (${who})`);
    return json({ ok: true, mode: 'integrated', message: 'Événement publié dans le portail centralisé.' }, 200, cors);
   }
   if (route === '/portal') {
    if (!Array.isArray(b.list) || b.list.length > 200 || !b.list.every(okEntry)) return json({ error: 'données refusées' }, 400, cors);
    await write(env, 'public/events-data.js', serialize(b.list), `Portail mis à jour (${who})`);
    return json({ ok: true }, 200, cors);
   }
   return json({ error: 'route inconnue' }, 404, cors);
  } catch (e) { return json({ error: e.message }, 500, cors); }
 }
};
