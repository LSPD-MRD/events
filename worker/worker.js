
const json = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...h
    }
  });

const b64 = s => btoa(unescape(encodeURIComponent(s)));

const unb64 = s =>
  decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));

const RESERVED = ["panel", "public", "worker", "api"];

const okSlug = s =>
  typeof s === "string" &&
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) &&
  s.length <= 60 &&
  !RESERVED.includes(s);

const okHtml = h =>
  typeof h === "string" &&
  h.length < 200000 &&
  (h.match(/<script\b/gi) || []).length <= 1 &&
  !/<[^>]+\son[a-z]+\s*=|javascript:|<iframe|<object|<embed/i.test(h);

const okText = v =>
  v === undefined ||
  (typeof v === "string" && v.length < 300 && !/[<>]/.test(v));

const okEntry = e =>
  e &&
  ["live", "soon", "archived"].includes(e.status) &&
  typeof e.href === "string" &&
  /^([a-z0-9-]+\/)?$/.test(e.href) &&
  ["icon", "title", "desc", "date"].every(k => okText(e[k]));

const gh = (env, path, init = {}) => {
  if (!env.OWNER || !env.REPO || !env.BRANCH || !env.GH_TOKEN) {
    throw new Error("Configuration GitHub incomplète.");
  }

  return fetch(
    `https://api.github.com/repos/${env.OWNER}/${env.REPO}/contents/${path}` +
      (init.method ? "" : `?ref=${encodeURIComponent(env.BRANCH)}`),
    {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "mrd-panel",
        "Content-Type": "application/json"
      }
    }
  );
};

async function read(env, path) {
  const r = await gh(env, path);

  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub GET : HTTP " + r.status);

  const f = await r.json();

  return {
    sha: f.sha,
    text: unb64(f.content)
  };
}

async function write(env, path, content, message) {
  const f = await read(env, path);

  const r = await gh(env, path, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: b64(content),
      branch: env.BRANCH,
      ...(f ? { sha: f.sha } : {})
    })
  });

  if (!r.ok) {
    const details = await r.text();
    console.error("GitHub PUT :", path, r.status, details.slice(0, 1000));
    throw new Error("GitHub PUT : HTTP " + r.status);
  }
}

const parse = t =>
  JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));

const serialize = list =>
  "const EVENTS = " + JSON.stringify(list, null, 2) + ";\n";

const parseContent = t => {
  const a = t.indexOf("{");
  const z = t.lastIndexOf("}");

  if (a < 0 || z < a) {
    throw new Error("Format du fichier events-content invalide.");
  }

  return JSON.parse(t.slice(a, z + 1));
};

const serializeContent = o =>
  "window.EVENT_CONTENT = " + JSON.stringify(o, null, 2) + ";\n";

function extractPage(html) {
  const start = html.search(/<div\s+class=["']page["'][^>]*>/i);

  if (start < 0) return null;

  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;

  let depth = 0;
  let m;

  while ((m = tags.exec(html))) {
    if (/^<\s*\//.test(m[0])) {
      depth--;
    } else if (!/\/\s*>$/.test(m[0])) {
      depth++;
    }

    if (depth === 0) return html.slice(start, tags.lastIndex);
  }

  return null;
}

const enc = s => new TextEncoder().encode(s);

const hex = b =>
  [...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

const hash = async s =>
  hex(await crypto.subtle.digest("SHA-256", enc(s)));

const randomToken = (n = 32) => {
  const a = crypto.getRandomValues(new Uint8Array(n));

  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};


async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc(salt),
        iterations: 100000,
        hash: "SHA-256"
      },
      key,
      256
    )
  );
}

const normUser = s => String(s || "").trim().toLowerCase();

const ACCREDITATIONS = ["Media Relations", "Interagency", "Public Information", "Community Affairs"];
const gradeAccreditations = grade => ({
  "Commanding Officer": ACCREDITATIONS,
  "Assistant Commanding Officer": ACCREDITATIONS,
  "Expert Officer": ["Media Relations", "Community Affairs", "Interagency"],
  "Certified Officer": ["Media Relations", "Community Affairs"]
}[grade] || []);
const parseAccreditations = value => {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? ACCREDITATIONS.filter(a => parsed.includes(a)) : []; }
  catch { return []; }
};
const displayName = u => [u.display_first_name, u.display_last_name].filter(Boolean).join(" ").trim() || u.username;
const publicUser = u => ({
  id: u.id, username: u.username, displayFirstName: u.display_first_name || "", displayLastName: u.display_last_name || "",
  displayName: displayName(u), grade: u.grade, role: u.role, active: !!u.active,
  accreditations: u.role === "owner" ? [...ACCREDITATIONS] : parseAccreditations(u.accreditations),
  avatarData: u.avatar_data || null
});

/*
 * Initialise les tables absentes sans supprimer les données existantes.
 * CREATE TABLE IF NOT EXISTS ne corrige pas les colonnes d'une table
 * existante dont le schéma serait incompatible.
 */
async function ensureAuthSchema(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      grade TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      avatar_data TEXT,
      accreditations TEXT NOT NULL DEFAULT '[]',
      display_first_name TEXT NOT NULL DEFAULT '',
      display_last_name TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      username TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_until INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS event_drafts (
      slug TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      card TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_username TEXT NOT NULL,
      actor_grade TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mrd_workspace (
      workspace_key TEXT PRIMARY KEY,
      workspace_json TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    )`
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
  const columns = await env.DB.prepare("PRAGMA table_info(users)").all();
  if (!(columns.results || []).some(column => column.name === "avatar_data")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_data TEXT").run();
  }
  if (!(columns.results || []).some(column => column.name === "accreditations")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN accreditations TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!(columns.results || []).some(column => column.name === "display_first_name")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN display_first_name TEXT NOT NULL DEFAULT ''").run();
  }
  if (!(columns.results || []).some(column => column.name === "display_last_name")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN display_last_name TEXT NOT NULL DEFAULT ''").run();
  }
  await env.DB.prepare("INSERT OR IGNORE INTO mrd_workspace (workspace_key, workspace_json, updated_by, updated_at) VALUES ('main', ?, 'system', ?)").bind(JSON.stringify({ roster: {}, calendar: [], tasks: [] }), Date.now()).run();
  // Migration douce vers les quatre grades officiels.
  await env.DB.prepare("UPDATE users SET grade = 'Commanding Officer' WHERE role = 'owner' AND grade <> 'Commanding Officer'").run();
  await env.DB.prepare("UPDATE users SET grade = 'Assistant Commanding Officer' WHERE role = 'admin' AND grade <> 'Assistant Commanding Officer'").run();
  await env.DB.prepare("UPDATE users SET role = 'editor', grade = CASE WHEN grade = 'Expert Officer' THEN 'Expert Officer' ELSE 'Certified Officer' END WHERE role = 'viewer' OR (role = 'editor' AND grade NOT IN ('Certified Officer', 'Expert Officer'))").run();
}

async function getUser(req, env) {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const th = await hash(token);

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.grade, u.role, u.active, u.avatar_data, u.accreditations,
            u.display_first_name, u.display_last_name, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  ).bind(th).first();

  if (!row || !row.active || row.expires_at < Date.now()) {
    if (row) {
      await env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash = ?"
      ).bind(th).run();
    }

    return null;
  }

  // Expiration glissante : 30 minutes depuis la dernière requête authentifiée.
  await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(Date.now() + 30 * 60 * 1000, th).run();
  return row;
}

const isOwner = u => u && u.role === "owner";
const isAdmin = u => u && ["owner", "admin"].includes(u.role);
const canPublish = u => u && ["owner", "admin", "editor"].includes(u.role);

async function audit(env, user, action, target) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (actor_username, actor_grade, action, target, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      String(user?.username || "système").slice(0, 64),
      String(user?.grade || "—").slice(0, 60),
      String(action || "Action").slice(0, 80),
      String(target || "—").slice(0, 160),
      Date.now()
    ).run();
    await env.DB.prepare(
      "DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY id DESC LIMIT 1000)"
    ).run();
  } catch (error) {
    console.error("MRD audit log failed", String(error?.message || error));
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const configuredOrigin = String(env.ALLOWED_ORIGIN || "").trim();
    // GitHub Pages sert le panneau depuis l'origine du site, sans le chemin /events/panel.
    const trustedOrigins = [
      "https://lspd-mrd.github.io",
      configuredOrigin
    ].filter(Boolean);
    const originAllowed = !origin || configuredOrigin === "*" || trustedOrigins.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin":
        configuredOrigin === "*" ? "*" :
        (origin && originAllowed ? origin : (configuredOrigin || "https://lspd-mrd.github.io")),
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Setup-Key",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    };

    if (origin && !originAllowed) {
      return json({ error: "Origine non autorisée : " + origin }, 403, cors);
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== "POST") {
      return json({ error: "Méthode refusée." }, 405, cors);
    }

    if (!env.DB) {
      return json({ error: "Base D1 non configurée." }, 503, cors);
    }

    const route = new URL(req.url).pathname;
    let b = {};

    try {
      b = await req.json();
    } catch {
      return json({ error: "Requête illisible." }, 400, cors);
    }

    let operation = "initialisation";
    try {
      // Crée les tables absentes et applique les migrations compatibles.
      await ensureAuthSchema(env);

      /*
       * CONFIGURATION INITIALE DU PROPRIÉTAIRE
       */
      if (route === "/auth/setup-owner") {
        if (
          !env.OWNER_SETUP_KEY ||
          req.headers.get("X-Setup-Key") !== env.OWNER_SETUP_KEY
        ) {
          return json(
            { error: "Clé de configuration invalide." },
            403,
            cors
          );
        }

        const username = normUser(b.username);
        const password = String(b.password || "");
        const grade = String(b.grade || "Owner");

        if (
          !/^[a-z0-9._-]{3,32}$/.test(username) ||
          password.length < 14 ||
          password.length > 128 ||
          grade.length > 60
        ) {
          return json(
            {
              error:
                "Identifiant invalide, grade trop long ou mot de passe invalide (14 à 128 caractères)."
            },
            400,
            cors
          );
        }

        const count = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM users WHERE role = 'owner'"
        ).first();

        if (count && count.n > 0) {
          return json(
            {
              error:
                "Le compte Owner existe déjà. Configuration verrouillée."
            },
            409,
            cors
          );
        }

        const salt = randomToken(16);
        const ph = await passwordHash(password, salt);

        await env.DB.prepare(
          `INSERT INTO users
           (username, password_hash, salt, grade, role, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          username,
          ph,
          salt,
          grade,
          "owner",
          1,
          Date.now()
        ).run();

        return json(
          {
            ok: true,
            message:
              "Compte Owner créé. Supprime le secret OWNER_SETUP_KEY après configuration."
          },
          201,
          cors
        );
      }

      /*
       * CONNEXION
       */
      if (route === "/auth/login") {
        const username = normUser(b.username);
        const password = String(b.password || "");

        if (
          !/^[a-z0-9._-]{3,32}$/.test(username) ||
          password.length > 128
        ) {
          return json(
            { error: "Identifiant ou mot de passe incorrect." },
            401,
            cors
          );
        }

        const now = Date.now();

        const attempts = await env.DB.prepare(
          `SELECT attempts, window_until
           FROM login_attempts WHERE username = ?`
        ).bind(username).first();

        if (
          attempts &&
          attempts.window_until > now &&
          attempts.attempts >= 8
        ) {
          return json(
            {
              error:
                "Trop de tentatives. Réessaie dans quelques minutes."
            },
            429,
            cors
          );
        }

        const u = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ?"
        ).bind(username).first();

        const candidate = u
          ? await passwordHash(password, u.salt)
          : "";

        if (!u || !u.active || candidate !== u.password_hash) {
          const next =
            attempts && attempts.window_until > now
              ? attempts.attempts + 1
              : 1;

          const until =
            attempts && attempts.window_until > now
              ? attempts.window_until
              : now + 10 * 60 * 1000;

          await env.DB.prepare(
            `INSERT INTO login_attempts
             (username, attempts, window_until)
             VALUES (?, ?, ?)
             ON CONFLICT(username) DO UPDATE SET
               attempts = excluded.attempts,
               window_until = excluded.window_until`
          ).bind(username, next, until).run();

          return json(
            { error: "Identifiant ou mot de passe incorrect." },
            401,
            cors
          );
        }

        await env.DB.prepare(
          "DELETE FROM login_attempts WHERE username = ?"
        ).bind(username).run();

        const token = randomToken(32);
        const expires = Date.now() + 30 * 60 * 1000;

        await env.DB.prepare(
          `INSERT INTO sessions
           (token_hash, user_id, expires_at, created_at)
           VALUES (?, ?, ?, ?)`
        ).bind(
          await hash(token),
          u.id,
          expires,
          Date.now()
        ).run();

        return json(
          {
            token,
            expiresAt: expires,
            user: publicUser(u)
          },
          200,
          cors
        );
      }

      /*
       * DÉCONNEXION
       * Elle est traitée avant l'authentification pour rester utilisable
       * même si la session est déjà expirée.
       */
      if (route === "/auth/logout") {
        const token = (req.headers.get("Authorization") || "")
          .replace(/^Bearer\s+/i, "");

        if (token) {
          await env.DB.prepare(
            "DELETE FROM sessions WHERE token_hash = ?"
          ).bind(await hash(token)).run();
        }

        return json({ ok: true }, 200, cors);
      }

      /*
       * ROUTES AUTHENTIFIÉES
       */
      const user = await getUser(req, env);

      if (!user) {
        return json(
          { error: "Session absente ou expirée. Reconnecte-toi." },
          401,
          cors
        );
      }

      if (route === "/auth/me") {
        return json({ user: publicUser(user) }, 200, cors);
      }

      if (route === "/auth/profile") {
        const hasAvatar = Object.prototype.hasOwnProperty.call(b, "avatarData");
        const hasFirst = Object.prototype.hasOwnProperty.call(b, "displayFirstName");
        const hasLast = Object.prototype.hasOwnProperty.call(b, "displayLastName");
        const avatarData = b.avatarData === null ? null : String(b.avatarData || "");
        const first = String(b.displayFirstName ?? user.display_first_name ?? "").trim();
        const last = String(b.displayLastName ?? user.display_last_name ?? "").trim();
        if (first.length > 40 || last.length > 40 || /[<>]/.test(first + last)) {
          return json({ error: "Le prénom et le nom doivent contenir 40 caractères maximum." }, 400, cors);
        }
        if (hasAvatar && avatarData !== null && (
          avatarData.length > 1500000 ||
          !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarData)
        )) {
          return json({ error: "Image invalide ou trop volumineuse (1 Mo maximum)." }, 400, cors);
        }
        if (hasAvatar) await env.DB.prepare("UPDATE users SET avatar_data = ? WHERE id = ?").bind(avatarData, user.id).run();
        if (hasFirst || hasLast) await env.DB.prepare("UPDATE users SET display_first_name = ?, display_last_name = ? WHERE id = ?").bind(first, last, user.id).run();
        const updated = await env.DB.prepare("SELECT id, username, grade, role, active, avatar_data, accreditations, display_first_name, display_last_name FROM users WHERE id = ?").bind(user.id).first();
        return json({ ok: true, user: publicUser(updated), avatarData: updated.avatar_data || null }, 200, cors);
      }

      if (route === "/users/profile") {
        if (!isOwner(user) || user.grade !== "Commanding Officer") return json({ error: "La gestion des profils est réservée au Commanding Officer." }, 403, cors);
        const id = Number(b.id), first = String(b.displayFirstName || "").trim(), last = String(b.displayLastName || "").trim();
        if (!Number.isInteger(id) || first.length > 40 || last.length > 40 || /[<>]/.test(first + last)) return json({ error: "Profil invalide. 40 caractères maximum par champ." }, 400, cors);
        const target = await env.DB.prepare("SELECT id, username, active FROM users WHERE id = ?").bind(id).first();
        if (!target || !target.active) return json({ error: "Compte cible introuvable ou désactivé." }, 404, cors);
        await env.DB.prepare("UPDATE users SET display_first_name = ?, display_last_name = ? WHERE id = ?").bind(first, last, id).run();
        await audit(env, user, "Nom d’affichage modifié", target.username + " · " + ([first, last].filter(Boolean).join(" ") || target.username));
        const updated = await env.DB.prepare("SELECT id, username, grade, role, active, avatar_data, accreditations, display_first_name, display_last_name FROM users WHERE id = ?").bind(id).first();
        return json({ ok: true, user: publicUser(updated) }, 200, cors);
      }

      if (route === "/workspace/get") {
        const row = await env.DB.prepare("SELECT workspace_json FROM mrd_workspace WHERE workspace_key = 'main'").first();
        let workspace = { roster: {}, calendar: [], tasks: [] };
        try { workspace = { ...workspace, ...JSON.parse(row?.workspace_json || "{}") }; } catch {}
        const usersResult = await env.DB.prepare("SELECT id, username, grade, role, active, avatar_data, accreditations, display_first_name, display_last_name, created_at FROM users WHERE active = 1 ORDER BY created_at ASC").all();
        const members = (usersResult.results || []).map(u => ({ ...publicUser(u), createdAt: u.created_at }));
        if (!isOwner(user)) {
          for (const entry of Object.values(workspace.roster || {})) if (entry && typeof entry === "object") delete entry.privateNotes;
        }
        if (!isAdmin(user)) {
          for (const event of workspace.calendar || []) {
            event.signups = (event.signups || []).map(signup => Number(signup.userId) === Number(user.id) ? signup : { userId: signup.userId });
          }
          for (const task of workspace.tasks || []) {
            task.progress = Object.fromEntries(Object.entries(task.progress || {}).filter(([id]) => Number(id) === Number(user.id)));
          }
        }
        return json({ workspace, members, canManageRoster: isOwner(user), canManageCalendar: isAdmin(user), canManageTasks: isAdmin(user) }, 200, cors);
      }

      if (route === "/workspace/save") {
        const action = String(b.action || "");
        const row = await env.DB.prepare("SELECT workspace_json FROM mrd_workspace WHERE workspace_key = 'main'").first();
        let ws = { roster: {}, calendar: [], tasks: [] };
        try { ws = { ...ws, ...JSON.parse(row?.workspace_json || "{}") }; } catch {}
        const saveWs = async target => {
          await env.DB.prepare("UPDATE mrd_workspace SET workspace_json = ?, updated_by = ?, updated_at = ? WHERE workspace_key = 'main'")
            .bind(JSON.stringify(target), user.username, Date.now()).run();
        };
        const safeText = (value, max = 1000) => String(value || "").trim().slice(0, max);
        if (action === "roster") {
          if (!isOwner(user) || user.grade !== "Commanding Officer") return json({ error: "La gestion de l’effectif est réservée au CO." }, 403, cors);
          const memberId = String(b.userId || "");
          const target = await env.DB.prepare("SELECT id, username, active FROM users WHERE id = ?").bind(Number(memberId)).first();
          if (!target || !target.active) return json({ error: "Membre introuvable." }, 404, cors);
          const data = b.roster || {};
          ws.roster[memberId] = {
            order: Math.max(0, Math.min(9999, Number(data.order) || 0)),
            arrivalDate: safeText(data.arrivalDate, 10),
            promotionDate: safeText(data.promotionDate, 10),
            publicNotes: safeText(data.publicNotes, 500),
            privateNotes: safeText(data.privateNotes, 1500)
          };
          await saveWs(ws); await audit(env, user, "Fiche effectif modifiée", target.username);
        } else if (action === "event-upsert") {
          if (!isAdmin(user)) return json({ error: "Seuls le CO et l’ACO peuvent gérer le calendrier." }, 403, cors);
          const e = b.event || {}, id = safeText(e.id, 80) || randomToken(8);
          const title = safeText(e.title, 120), date = safeText(e.date, 10);
          if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Un titre et une date valide sont obligatoires." }, 400, cors);
          const item = { id, title, date, time: safeText(e.time, 10), description: safeText(e.description, 1500), location: safeText(e.location, 160), createdBy: user.id, signups: Array.isArray(e.signups) ? e.signups : [] };
          const index = ws.calendar.findIndex(x => x.id === id);
          if (index >= 0) ws.calendar[index] = { ...ws.calendar[index], ...item, signups: ws.calendar[index].signups || [] }; else ws.calendar.push(item);
          ws.calendar.sort((a, z) => (a.date + a.time).localeCompare(z.date + z.time));
          await saveWs(ws); await audit(env, user, "Calendrier modifié", title);
        } else if (action === "event-delete") {
          if (!isAdmin(user)) return json({ error: "Seuls le CO et l’ACO peuvent gérer le calendrier." }, 403, cors);
          ws.calendar = ws.calendar.filter(x => x.id !== String(b.eventId)); await saveWs(ws);
        } else if (action === "signup") {
          const event = ws.calendar.find(x => x.id === String(b.eventId));
          if (!event) return json({ error: "Événement introuvable." }, 404, cors);
          event.signups = Array.isArray(event.signups) ? event.signups : [];
          const found = event.signups.find(x => Number(x.userId) === Number(user.id));
          if (b.join && !found) event.signups.push({ userId: user.id, notes: "", work: "" });
          if (!b.join && found) event.signups = event.signups.filter(x => Number(x.userId) !== Number(user.id));
          await saveWs(ws);
        } else if (action === "event-report") {
          const event = ws.calendar.find(x => x.id === String(b.eventId));
          if (!event) return json({ error: "Événement introuvable." }, 404, cors);
          const signup = (event.signups || []).find(x => Number(x.userId) === Number(user.id));
          if (!signup) return json({ error: "Inscris-toi à l’événement avant d’ajouter tes notes." }, 403, cors);
          signup.notes = safeText(b.notes, 1200); signup.work = safeText(b.work, 2000);
          await saveWs(ws);
        } else if (action === "task-upsert") {
          if (!isAdmin(user)) return json({ error: "Seuls le CO et l’ACO peuvent gérer les tâches." }, 403, cors);
          const t = b.task || {}, id = safeText(t.id, 80) || randomToken(8), title = safeText(t.title, 120);
          if (!title) return json({ error: "Le titre de la tâche est obligatoire." }, 400, cors);
          const assignedTo = t.assignedTo === "" || t.assignedTo == null ? null : Number(t.assignedTo);
          if (assignedTo !== null) {
            if (!Number.isInteger(assignedTo)) return json({ error: "Responsable invalide." }, 400, cors);
            const assignee = await env.DB.prepare("SELECT id, active FROM users WHERE id = ?").bind(assignedTo).first();
            if (!assignee || !assignee.active) return json({ error: "Le responsable doit être un compte actif." }, 400, cors);
          }
          const item = { id, title, description: safeText(t.description, 1500), dueDate: safeText(t.dueDate, 10), assignedTo, createdBy: user.id, progress: (ws.tasks.find(x => x.id === id) || {}).progress || {} };
          const index = ws.tasks.findIndex(x => x.id === id);
          if (index >= 0) ws.tasks[index] = { ...ws.tasks[index], ...item }; else ws.tasks.push(item);
          await saveWs(ws); await audit(env, user, "Tâche modifiée", title);
        } else if (action === "task-delete") {
          if (!isAdmin(user)) return json({ error: "Seuls le CO et l’ACO peuvent gérer les tâches." }, 403, cors);
          ws.tasks = ws.tasks.filter(x => x.id !== String(b.taskId)); await saveWs(ws);
        } else if (action === "task-progress") {
          const task = ws.tasks.find(x => x.id === String(b.taskId));
          if (!task) return json({ error: "Tâche introuvable." }, 404, cors);
          if (task.assignedTo && Number(task.assignedTo) !== Number(user.id) && !isAdmin(user)) return json({ error: "Cette tâche est attribuée à un autre membre." }, 403, cors);
          task.progress = task.progress || {};
          task.progress[String(user.id)] = { status: ["todo", "doing", "done"].includes(b.status) ? b.status : "todo", report: safeText(b.report, 2000), updatedAt: Date.now() };
          await saveWs(ws);
        } else {
          return json({ error: "Action d’espace de travail inconnue." }, 400, cors);
        }
        return json({ ok: true }, 200, cors);
      }

      if (route === "/auth/change-password") {
        const currentPassword = String(b.currentPassword || "");
        const newPassword = String(b.newPassword || "");
        if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
          return json({ error: "Le mot de passe actuel est obligatoire et le nouveau doit contenir 12 à 128 caractères." }, 400, cors);
        }
        const account = await env.DB.prepare(
          "SELECT id, password_hash, salt FROM users WHERE id = ? AND active = 1"
        ).bind(user.id).first();
        if (!account) return json({ error: "Compte introuvable ou désactivé." }, 401, cors);
        const candidate = await passwordHash(currentPassword, account.salt);
        if (candidate !== account.password_hash) {
          return json({ error: "Le mot de passe actuel est incorrect." }, 403, cors);
        }
        const salt = randomToken(16);
        const password_hash = await passwordHash(newPassword, salt);
        await env.DB.prepare(
          "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?"
        ).bind(password_hash, salt, user.id).run();
        return json({ ok: true, message: "Mot de passe modifié." }, 200, cors);
      }

      if (route === "/users/list") {
        if (!isOwner(user)) {
          return json({ error: "Réservé au Owner." }, 403, cors);
        }

        const result = await env.DB.prepare(
          `SELECT id, username, grade, role, active, created_at, accreditations, display_first_name, display_last_name
           FROM users ORDER BY created_at DESC`
        ).all();
        return json({ users: (result.results || []).map(u => ({
          ...publicUser(u), created_at: u.created_at, active: !!u.active,
          accreditations: u.role === "owner" ? [...ACCREDITATIONS] : parseAccreditations(u.accreditations)
        })) }, 200, cors);
      }

      if (route === "/users/accreditations") {
        if (!isOwner(user) || user.grade !== "Commanding Officer") return json({ error: "L’attribution des accréditations est réservée au Commanding Officer." }, 403, cors);
        const id = Number(b.id), requested = b.accreditations;
        if (!Number.isInteger(id) || id === user.id || !Array.isArray(requested) || requested.some(a => typeof a !== "string" || !ACCREDITATIONS.includes(a))) return json({ error: "Données d’accréditation invalides." }, 400, cors);
        const target = await env.DB.prepare("SELECT id, username, grade, role, active FROM users WHERE id = ?").bind(id).first();
        if (!target || !target.active || target.role === "owner") return json({ error: "Compte cible introuvable ou non modifiable." }, 404, cors);
        const allowed = gradeAccreditations(target.grade), unique = [...new Set(requested)];
        const forbidden = unique.filter(a => !allowed.includes(a));
        if (forbidden.length) return json({ error: "Accréditation non accessible pour le grade " + target.grade + " : " + forbidden.join(", ") }, 400, cors);
        await env.DB.prepare("UPDATE users SET accreditations = ? WHERE id = ?").bind(JSON.stringify(unique), id).run();
        await audit(env, user, "Accréditations modifiées", target.username + " · " + (unique.join(", ") || "aucune"));
        const updated = await env.DB.prepare("SELECT id, username, grade, role, active, avatar_data, accreditations FROM users WHERE id = ?").bind(id).first();
        return json({ ok: true, user: publicUser(updated) }, 200, cors);
      }

      if (route === "/users/create") {
        if (!isOwner(user)) {
          return json({ error: "Réservé au Owner." }, 403, cors);
        }

        const username = normUser(b.username);
        const password = String(b.password || "");
        const grade = String(b.grade || "").trim();
        const roleByGrade = {
          "Certified Officer": "editor",
          "Expert Officer": "editor",
          "Assistant Commanding Officer": "admin"
        };
        const role = roleByGrade[grade];

        if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
          return json(
            {
              error:
                "Identifiant : 3 à 32 caractères (lettres, chiffres, point, tiret, underscore)."
            },
            400,
            cors
          );
        }

        if (password.length < 12 || password.length > 128) {
          return json(
            {
              error:
                "Le mot de passe doit contenir au moins 12 caractères."
            },
            400,
            cors
          );
        }

        if (!role || !["Certified Officer", "Expert Officer", "Assistant Commanding Officer"].includes(grade)) {
          return json({ error: "Choisis un des grades autorisés. Le Commanding Officer est réservé au compte Owner." }, 400, cors);
        }

        const salt = randomToken(16);
        const ph = await passwordHash(password, salt);

        try {
          const r = await env.DB.prepare(
            `INSERT INTO users
             (username, password_hash, salt, grade, role, active, created_at)
             VALUES (?, ?, ?, ?, ?, 1, ?)`
          ).bind(
            username,
            ph,
            salt,
            grade,
            role,
            Date.now()
          ).run();

          await audit(env, user, "Compte créé", username + " · " + grade);
          return json(
            { ok: true, id: r.meta?.last_row_id },
            201,
            cors
          );
        } catch (e) {
          // Ne transforme pas toutes les erreurs SQL en doublon.
          if (/unique constraint failed/i.test(e.message || "")) {
            return json(
              { error: "Cet identifiant existe déjà." },
              409,
              cors
            );
          }
          throw e;
        }
      }

      if (route === "/users/disable") {
        if (!isOwner(user)) {
          return json({ error: "Réservé au Owner." }, 403, cors);
        }

        const id = Number(b.id);
        if (!Number.isInteger(id) || id === user.id) {
          return json({ error: "Compte invalide." }, 400, cors);
        }
        const targetUser = await env.DB.prepare("SELECT username, role, active FROM users WHERE id = ?").bind(id).first();
        if (!targetUser || targetUser.role === "owner" || !targetUser.active) {
          return json({ error: "Compte introuvable ou déjà désactivé." }, 400, cors);
        }
        await env.DB.prepare(
          "UPDATE users SET active = 0 WHERE id = ? AND role <> ?"
        ).bind(id, "owner").run();

        await env.DB.prepare(
          "DELETE FROM sessions WHERE user_id = ?"
        ).bind(id).run();

        await audit(env, user, "Compte désactivé", targetUser.username);
        return json({ ok: true }, 200, cors);
      }

      if (route === "/logs/list") {
        if (!isAdmin(user)) return json({ error: "Réservé aux administrateurs et au Commanding Officer." }, 403, cors);
        const result = await env.DB.prepare(
          "SELECT id, actor_username, actor_grade, action, target, created_at FROM audit_logs ORDER BY id DESC LIMIT 200"
        ).all();
        return json({ logs: result.results || [] }, 200, cors);
      }

      if (route === "/ping") {
        return json(
          {
            ok: true,
            architecture: "unified-portal-auth",
            user: publicUser(user)
          },
          200,
          cors
        );
      }

      /*
       * BROUILLONS PRIVÉS D'ÉVÉNEMENTS (D1 uniquement, non publiés sur GitHub Pages)
       */
      if (route === "/draft/save") {
        if (!canPublish(user)) return json({ error: "Ton grade ne permet pas d’enregistrer un brouillon." }, 403, cors);
        if (!okSlug(b.slug) || typeof b.config !== "string" || b.config.length > 200000 || !okEntry(b.card) || b.card.href !== b.slug + "/") {
          return json({ error: "Données de brouillon refusées." }, 400, cors);
        }
        let config;
        try { config = JSON.parse(b.config); } catch { return json({ error: "Configuration de brouillon invalide." }, 400, cors); }
        if (config.slug !== b.slug || !config.meta || typeof config.meta.title !== "string" || !config.meta.title.trim()) {
          return json({ error: "Le titre et l’adresse du brouillon sont obligatoires." }, 400, cors);
        }
        const priorDraft = await env.DB.prepare("SELECT slug FROM event_drafts WHERE slug = ?").bind(b.slug).first();
        await env.DB.prepare(
          `INSERT INTO event_drafts (slug, config, card, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             config = excluded.config,
             card = excluded.card,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`
        ).bind(b.slug, b.config, JSON.stringify(b.card), user.username, Date.now()).run();
        await audit(env, user, priorDraft ? "Brouillon modifié" : "Brouillon créé", b.card.title || b.slug);
        return json({ ok: true, message: "Brouillon enregistré sans publication." }, 200, cors);
      }

      if (route === "/draft/load") {
        if (!canPublish(user)) return json({ error: "Ton grade ne permet pas de consulter les brouillons." }, 403, cors);
        if (!okSlug(b.slug)) return json({ error: "Adresse de brouillon invalide." }, 400, cors);
        const draft = await env.DB.prepare(
          "SELECT config, card, updated_by, updated_at FROM event_drafts WHERE slug = ?"
        ).bind(b.slug).first();
        return draft
          ? json({ found: true, config: draft.config, card: JSON.parse(draft.card), updatedBy: draft.updated_by, updatedAt: draft.updated_at }, 200, cors)
          : json({ found: false }, 200, cors);
      }

      /*
       * PUBLICATION D'UN ÉVÉNEMENT VIA GITHUB
       */
      if (route === "/publish") {
        if (!canPublish(user)) {
          return json(
            { error: "Ton grade ne permet pas de publier." },
            403,
            cors
          );
        }

        if (
          !okSlug(b.slug) ||
          !okHtml(b.html) ||
          !okEntry(b.card) ||
          b.card.href !== b.slug + "/" ||
          typeof b.config !== "string" ||
          b.config.length > 200000
        ) {
          return json({ error: "Données refusées." }, 400, cors);
        }

        JSON.parse(b.config);

        operation = "lecture du contenu des événements (public/events-content.js)";
        const cf = await read(env, "public/events-content.js");
        const contents = cf ? parseContent(cf.text) : {};

        const full = b.html
          .replace(/\.\.\/public\//g, "./public/")
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

        const extracted = extractPage(full);

        if (!extracted) {
          return json(
            { error: "Structure de page invalide." },
            400,
            cors
          );
        }

        const priorCardFile = await read(env, "public/events-data.js");
        const priorCards = priorCardFile ? parse(priorCardFile.text) : [];
        const priorEvent = priorCards.find(x => x.href === b.card.href);
        contents[b.slug] = extracted;

        operation = "écriture du contenu de l’événement (public/events-content.js)";
        await write(
          env,
          "public/events-content.js",
          serializeContent(contents),
          `Contenu événement ${b.slug} (${user.username})`
        );

        operation = "lecture du portail (public/events-data.js)";
        const f = await read(env, "public/events-data.js");

        if (!f) {
          throw new Error("Fichier public/events-data.js introuvable.");
        }

        const list = parse(f.text);
        const i = list.findIndex(x => x.href === b.card.href);

        if (i < 0) {
          list.unshift(b.card);
        } else {
          list[i] = b.card;
        }

        operation = "mise à jour du portail (public/events-data.js)";
        await write(
          env,
          "public/events-data.js",
          serialize(list),
          `Portail : ${b.slug} (${user.username})`
        );

        await audit(env, user, priorEvent ? "Événement modifié et publié" : "Événement créé et publié", b.card.title || b.slug);
        return json(
          {
            ok: true,
            mode: "integrated",
            message: "Événement publié dans le portail centralisé."
          },
          200,
          cors
        );
      }

      /* Suppression sécurisée d'une publication et de son fichier associé. */
      if (route === "/publication/delete") {
        if (!canPublish(user)) return json({ error: "Ton grade ne permet pas de supprimer une publication." }, 403, cors);
        if (typeof b.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.id) || b.id.length > 100) {
          return json({ error: "Identifiant de publication invalide." }, 400, cors);
        }
        const listFile = await read(env, "public/publications-data.js");
        if (!listFile) return json({ error: "Catalogue des publications introuvable." }, 404, cors);
        const start = listFile.text.indexOf("[");
        const end = listFile.text.lastIndexOf("]");
        if (start < 0 || end <= start) return json({ error: "Catalogue des publications invalide." }, 500, cors);
        const list = JSON.parse(listFile.text.slice(start, end + 1));
        const publication = list.find(item => item.id === b.id);
        if (!publication) return json({ error: "Cette publication n’existe plus." }, 404, cors);
        if (typeof publication.file !== "string" || !/^public\/uploads\/[a-z0-9-]+\.(?:pdf|png|jpg|webp)$/.test(publication.file)) {
          return json({ error: "Chemin du fichier refusé par sécurité." }, 400, cors);
        }
        const next = list.filter(item => item.id !== b.id);
        await write(env, "public/publications-data.js", "window.MRD_PUBLICATIONS = " + JSON.stringify(next, null, 2) + ";\n", "Suppression publication " + b.id + " (" + user.username + ")");
        const asset = await gh(env, publication.file);
        if (asset.ok) {
          const assetInfo = await asset.json();
          const deletion = await gh(env, publication.file, { method: "DELETE", body: JSON.stringify({ message: "Suppression fichier publication " + b.id + " (" + user.username + ")", sha: assetInfo.sha, branch: env.BRANCH }) });
          if (!deletion.ok) throw new Error("Publication retirée du catalogue, mais suppression du fichier échouée (GitHub HTTP " + deletion.status + ").");
        } else if (asset.status !== 404) {
          throw new Error("Publication retirée du catalogue, mais lecture du fichier impossible (GitHub HTTP " + asset.status + ").");
        }
        await audit(env, user, "Publication supprimée", String(publication.title || b.id).slice(0, 120));
        return json({ ok: true, message: "Publication supprimée." }, 200, cors);
      }

      /* Publication de documents et actualités (PDF / images) */
      if (route === "/publication/publish") {
        if (!canPublish(user)) return json({ error: "Ton grade ne permet pas de publier." }, 403, cors);
        const kinds = ["news", "comm-interne", "comm-presse", "compte-rendu"];
        const extByMime = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
        if (!kinds.includes(b.kind) || !okText(b.title) || !b.title.trim() || !extByMime[b.mime] || typeof b.data !== "string" || b.data.length > 14200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)) return json({ error: "Fichier ou données invalides (maximum 10 Mo)." }, 400, cors);
        const slug = (b.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "publication").slice(0, 60) + "-" + Date.now().toString(36);
        const path = "public/uploads/" + slug + "." + extByMime[b.mime];
        const upload = await gh(env, path, { method: "PUT", body: JSON.stringify({ message: "Publication MRD : " + b.title.slice(0, 100), content: b.data, branch: env.BRANCH }) });
        if (!upload.ok) throw new Error("Échec du dépôt du fichier : GitHub HTTP " + upload.status);
        const listFile = await read(env, "public/publications-data.js");
        let list = []; if (listFile) { const start=listFile.text.indexOf("["); const end=listFile.text.lastIndexOf("]"); if(start>=0&&end>start) list=JSON.parse(listFile.text.slice(start,end+1)); }
        list.unshift({ id: slug, kind: b.kind, title: b.title.trim().slice(0,120), summary: String(b.summary||"").slice(0,500), date: String(b.date||"").slice(0,20), mime: b.mime, file: path });
        await write(env, "public/publications-data.js", "window.MRD_PUBLICATIONS = " + JSON.stringify(list, null, 2) + ";\n", "Publication MRD " + slug + " (" + user.username + ")");
        await audit(env, user, "Publication créée", b.title.trim().slice(0, 120) + " · " + b.kind);
        return json({ ok: true, file: path }, 200, cors);
      }

      /*
       * MISE À JOUR DU PORTAIL
       */
      if (route === "/portal") {
        if (!canPublish(user)) {
          return json(
            { error: "Ton grade ne permet pas de modifier le portail." },
            403,
            cors
          );
        }

        if (
          !Array.isArray(b.list) ||
          b.list.length > 200 ||
          !b.list.every(okEntry)
        ) {
          return json({ error: "Données refusées." }, 400, cors);
        }

        const beforeFile = await read(env, "public/events-data.js");
        const beforeList = beforeFile ? parse(beforeFile.text) : [];
        const beforeMap = new Map(beforeList.map(item => [item.href, item]));
        const afterMap = new Map(b.list.map(item => [item.href, item]));
        const auditEntries = [];
        for (const [href, item] of afterMap) {
          const old = beforeMap.get(href);
          if (!old) auditEntries.push(["Événement ajouté au portail", item.title || href]);
          else if (JSON.stringify(old) !== JSON.stringify(item)) auditEntries.push(["Événement modifié dans le portail", item.title || href]);
        }
        for (const [href, item] of beforeMap) {
          if (!afterMap.has(href)) auditEntries.push(["Événement retiré du portail", item.title || href]);
        }
        await write(
          env,
          "public/events-data.js",
          serialize(b.list),
          `Portail mis à jour (${user.username})`
        );
        for (const [action, target] of auditEntries) await audit(env, user, action, target);
        return json({ ok: true }, 200, cors);
      }

      return json({ error: "Route inconnue." }, 404, cors);
    } catch (e) {
      console.error("MRD Worker exception", {
        route,
        name: e?.name || "Error",
        message: e?.message || String(e),
        stack: e?.stack || null
      });

      const publishFailure = route === "/publish" && operation !== "initialisation";
      const detail = String(e?.message || "Erreur inconnue").replace(/[\\r\\n]+/g, " ").slice(0, 180);
      return json(
        {
          error: publishFailure
            ? "Échec pendant " + operation + " : " + detail
            : "Erreur interne du serveur. Consulte les logs du Worker."
        },
        500,
        cors
      );
    }
  }
};
