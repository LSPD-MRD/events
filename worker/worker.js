const json = (o, s = 200, h = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...h,
    },
  });

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));

const RESERVED = ["panel", "public", "worker", "api"];

const okSlug = (s) =>
  typeof s === "string" &&
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) &&
  s.length <= 60 &&
  !RESERVED.includes(s);

const decodeHtmlEntities = (value) =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_, code) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);?/g, (_, code) => {
      try {
        return String.fromCodePoint(Number(code));
      } catch {
        return "";
      }
    })
    .replace(
      /&(tab|newline|colon|lpar|rpar|sol);/gi,
      (entity) =>
        ({
          "&tab;": "\t",
          "&newline;": "\n",
          "&colon;": ":",
          "&lpar;": "(",
          "&rpar;": ")",
          "&sol;": "/",
        })[entity.toLowerCase()] || entity,
    );
const DANGEROUS_TAG =
  /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|meta|base|link|form|svg|math|style|template|noscript)\b/i;
const DANGEROUS_ATTRIBUTE = /<[^>]*[\s"'\/\x60]on[a-z]{3,}\s*=|<[^>]*\ssrcdoc\s*=/i;
const okHtml = (value) => {
  if (typeof value !== "string" || value.length >= 200000) return false;
  const decoded = decodeHtmlEntities(value);
  if (DANGEROUS_TAG.test(decoded) || DANGEROUS_ATTRIBUTE.test(decoded)) return false;
  for (const tag of decoded.match(/<[^>]*>/g) || []) {
    const compact = tag.replace(/[\x00-\x20]+/g, "").toLowerCase();
    if (/=["']?(javascript|vbscript):/.test(compact)) return false;
    if (/=["']?data:(?!image\/(png|jpe?g|webp|gif);base64,)/.test(compact)) return false;
  }
  return true;
};

const okText = (v) =>
  v === undefined || (typeof v === "string" && v.length < 300 && !/[<>]/.test(v));

const okEntry = (entry) =>
  entry &&
  ["live", "soon", "archived"].includes(entry.status) &&
  typeof entry.href === "string" &&
  /^([a-z0-9-]+\/)?$/.test(entry.href) &&
  ["icon", "title", "desc", "date"].every((key) => okText(entry[key]));

const MAX_REQUEST_BODY_BYTES = 15 * 1024 * 1024;
const MAX_PUBLICATION_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 300 * 1024;

/** Validate a real calendar date in strict YYYY-MM-DD format. */
const isValidISODate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Validate a 24-hour time in HH:MM format. */
const isValidTime = (value) =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/**
 * Validate declared file type against its file signature and decoded size.
 * This checks the signature; it is not a full PDF/image parser.
 */
const isValidPublicationFile = (mime, data, maxBytes = MAX_PUBLICATION_BYTES) => {
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    data.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
  ) {
    return false;
  }

  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const decodedSize = (data.length / 4) * 3 - padding;
  if (decodedSize <= 0 || decodedSize > maxBytes) return false;

  let bytes;
  try {
    const prefix = data.slice(0, Math.min(data.length, 64));
    bytes = Uint8Array.from(atob(prefix), (character) => character.charCodeAt(0));
  } catch {
    return false;
  }

  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));

  switch (mime) {
    case "application/pdf":
      return bytes.length >= 5 && ascii(0, 5) === "%PDF-";
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    case "image/jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/webp":
      return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/gif":
      return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    default:
      return false;
  }
};

/** Validate avatar data URLs before placing their bytes into a D1 row. */
const isValidAvatarDataUrl = (value) => {
  if (typeof value !== "string" || value.length > 420000) return false;

  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;

  return isValidPublicationFile("image/" + match[1], match[2], MAX_AVATAR_BYTES);
};

/** Read JSON through a bounded stream; Content-Length alone is not trusted. */
async function readJsonBody(request) {
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_REQUEST_BODY_BYTES
  ) {
    return { ok: false, status: 413 };
  }

  if (!request.body) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.byteLength;
      if (size > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already have been cancelled because it exceeded the limit.
    }
  }
}

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
        "Content-Type": "application/json",
      },
    },
  );
};

async function read(env, path) {
  const r = await gh(env, path);

  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub GET : HTTP " + r.status);

  const f = await r.json();

  return {
    sha: f.sha,
    text: unb64(f.content),
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
      ...(f ? { sha: f.sha } : {}),
    }),
  });

  if (!r.ok) {
    const details = await r.text();
    console.error("GitHub PUT :", path, r.status, details.slice(0, 1000));
    throw new Error("GitHub PUT : HTTP " + r.status);
  }
}

const parse = (t) => JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));

const serialize = (list) => "const EVENTS = " + JSON.stringify(list, null, 2) + ";\n";

const parseContent = (t) => {
  const a = t.indexOf("{");
  const z = t.lastIndexOf("}");

  if (a < 0 || z < a) {
    throw new Error("Format du fichier events-content invalide.");
  }

  return JSON.parse(t.slice(a, z + 1));
};

const serializeContent = (o) => "window.EVENT_CONTENT = " + JSON.stringify(o, null, 2) + ";\n";

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

const enc = (s) => new TextEncoder().encode(s);

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

const hash = async (s) => hex(await crypto.subtle.digest("SHA-256", enc(s)));

const randomToken = (n = 32) => {
  const a = crypto.getRandomValues(new Uint8Array(n));

  return btoa(String.fromCharCode(...a))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc(password), "PBKDF2", false, ["deriveBits"]);

  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}

const normUser = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

const safeEqual = (left, right) => {
  const a = String(left),
    b = String(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
};
const DUMMY_SALT = "mrd-dummy-salt-timing-equalizer";
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

async function isLoginBlocked(env, key, maximum, now) {
  const row = await env.DB.prepare(
    "SELECT attempts, window_until FROM login_attempts WHERE username = ?",
  )
    .bind(key)
    .first();
  return !!(row && row.window_until > now && row.attempts >= maximum);
}
async function recordLoginFailure(env, key, now) {
  await env.DB.prepare(
    `INSERT INTO login_attempts (username, attempts, window_until) VALUES (?, 1, ?)
     ON CONFLICT(username) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_until > ? THEN login_attempts.attempts + 1 ELSE 1 END,
       window_until = CASE WHEN login_attempts.window_until > ? THEN login_attempts.window_until ELSE ? END`,
  )
    .bind(key, now + ATTEMPT_WINDOW_MS, now, now, now + ATTEMPT_WINDOW_MS)
    .run();
}

const ACCREDITATIONS = [
  "Media Relations",
  "Interagency",
  "Public Information",
  "Community Affairs",
];
const gradeAccreditations = (grade) =>
  ({
    "Commanding Officer": ACCREDITATIONS,
    "Assistant Commanding Officer": ACCREDITATIONS,
    "Expert Officer": ["Media Relations", "Community Affairs", "Interagency"],
    "Certified Officer": ["Media Relations", "Community Affairs"],
  })[grade] || [];
const parseAccreditations = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? ACCREDITATIONS.filter((a) => parsed.includes(a)) : [];
  } catch {
    return [];
  }
};
const displayName = (u) =>
  [u.display_first_name, u.display_last_name].filter(Boolean).join(" ").trim() || u.username;
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  displayFirstName: u.display_first_name || "",
  displayLastName: u.display_last_name || "",
  displayName: displayName(u),
  grade: u.grade,
  role: u.role,
  active: !!u.active,
  accreditations: u.role === "owner" ? [...ACCREDITATIONS] : parseAccreditations(u.accreditations),
  hasAvatar: u.has_avatar !== undefined ? !!u.has_avatar : !!u.avatar_data,
});

/*
 * Initialise les tables absentes sans supprimer les données existantes.
 * CREATE TABLE IF NOT EXISTS ne corrige pas les colonnes d'une table
 * existante dont le schéma serait incompatible.
 */
let authSchemaPromise = null;

async function ensureAuthSchema(env) {
  if (!authSchemaPromise) {
    authSchemaPromise = ensureAuthSchemaOnce(env).catch((error) => {
      authSchemaPromise = null;
      throw error;
    });
  }

  return authSchemaPromise;
}

async function ensureAuthSchemaOnce(env) {
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
    )`,
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
  const columns = await env.DB.prepare("PRAGMA table_info(users)").all();
  if (!(columns.results || []).some((column) => column.name === "avatar_data")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_data TEXT").run();
  }
  if (!(columns.results || []).some((column) => column.name === "accreditations")) {
    await env.DB.prepare(
      "ALTER TABLE users ADD COLUMN accreditations TEXT NOT NULL DEFAULT '[]'",
    ).run();
  }
  if (!(columns.results || []).some((column) => column.name === "display_first_name")) {
    await env.DB.prepare(
      "ALTER TABLE users ADD COLUMN display_first_name TEXT NOT NULL DEFAULT ''",
    ).run();
  }
  if (!(columns.results || []).some((column) => column.name === "display_last_name")) {
    await env.DB.prepare(
      "ALTER TABLE users ADD COLUMN display_last_name TEXT NOT NULL DEFAULT ''",
    ).run();
  }
  if (!(columns.results || []).some((column) => column.name === "last_login_at")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN last_login_at INTEGER").run();
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO mrd_workspace (workspace_key, workspace_json, updated_by, updated_at) VALUES ('main', ?, 'system', ?)",
  )
    .bind(JSON.stringify({ roster: {}, calendar: [], tasks: [] }), Date.now())
    .run();
  // Migration douce vers les quatre grades officiels.
  await env.DB.prepare(
    "UPDATE users SET grade = 'Commanding Officer' WHERE role = 'owner' AND grade <> 'Commanding Officer'",
  ).run();
  await env.DB.prepare(
    "UPDATE users SET grade = 'Assistant Commanding Officer' WHERE role = 'admin' AND grade <> 'Assistant Commanding Officer'",
  ).run();
  await env.DB.prepare(
    "UPDATE users SET role = 'editor', grade = CASE WHEN grade = 'Expert Officer' THEN 'Expert Officer' ELSE 'Certified Officer' END WHERE role = 'viewer' OR (role = 'editor' AND grade NOT IN ('Certified Officer', 'Expert Officer'))",
  ).run();
}

const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const SESSION_REFRESH_BELOW_MS = 20 * 60 * 1000;

async function getUser(req, env) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const th = await hash(token);

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.grade, u.role, u.active, CASE WHEN u.avatar_data IS NOT NULL AND length(u.avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar, u.accreditations, u.display_first_name, u.display_last_name, s.expires_at, s.created_at AS session_created_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(th)
    .first();

  const now = Date.now();
  if (
    !row ||
    !row.active ||
    row.expires_at < now ||
    now - Number(row.session_created_at || now) > SESSION_MAX_MS
  ) {
    if (row) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(th).run();
    }

    return null;
  }

  // Expiration glissante, plafonnée à 12 h depuis la connexion. On limite les écritures D1.
  if (row.expires_at - now < SESSION_REFRESH_BELOW_MS) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
      .bind(now + 30 * 60 * 1000, th)
      .run();
  }
  return row;
}

const isOwner = (u) => u && u.role === "owner";
const isCommandingOfficer = (u) => u && u.role === "owner" && u.grade === "Commanding Officer";
const isAssistantCommandingOfficer = (u) =>
  u && u.role === "admin" && u.grade === "Assistant Commanding Officer";
const canManageAccounts = (u) => isCommandingOfficer(u) || isAssistantCommandingOfficer(u);
const isAdmin = (u) => u && ["owner", "admin"].includes(u.role);
const canPublish = (u) => u && ["owner", "admin", "editor"].includes(u.role);

async function audit(env, user, action, target) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (actor_username, actor_grade, action, target, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(
        String(user?.username || "système").slice(0, 64),
        String(user?.grade || "—").slice(0, 60),
        String(action || "Action").slice(0, 80),
        String(target || "—").slice(0, 160),
        Date.now(),
      )
      .run();
    await env.DB.prepare(
      "DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY id DESC LIMIT 1000)",
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
    const trustedOrigins = ["https://lspd-mrd.github.io", configuredOrigin].filter(Boolean);
    const originAllowed = !origin || configuredOrigin === "*" || trustedOrigins.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin":
        configuredOrigin === "*"
          ? "*"
          : origin && originAllowed
            ? origin
            : configuredOrigin || "https://lspd-mrd.github.io",
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Setup-Key",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
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
    const parsedBody = await readJsonBody(req);

    if (!parsedBody.ok) {
      const status = parsedBody.status;
      return json(
        {
          error:
            status === 413
              ? "Requête trop volumineuse (limite de 15 Mio)."
              : "Requête JSON illisible.",
        },
        status,
        cors,
      );
    }

    const b = parsedBody.value;
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      return json({ error: "Le corps de la requête doit être un objet JSON." }, 400, cors);
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
          !safeEqual(req.headers.get("X-Setup-Key") || "", env.OWNER_SETUP_KEY)
        ) {
          return json({ error: "Clé de configuration invalide." }, 403, cors);
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
                "Identifiant invalide, grade trop long ou mot de passe invalide (14 à 128 caractères).",
            },
            400,
            cors,
          );
        }

        const count = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM users WHERE role = 'owner'",
        ).first();

        if (count && count.n > 0) {
          return json(
            {
              error: "Le compte Owner existe déjà. Configuration verrouillée.",
            },
            409,
            cors,
          );
        }

        const salt = randomToken(16);
        const ph = await passwordHash(password, salt);

        await env.DB.prepare(
          `INSERT INTO users
           (username, password_hash, salt, grade, role, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(username, ph, salt, grade, "owner", 1, Date.now())
          .run();

        return json(
          {
            ok: true,
            message: "Compte Owner créé. Supprime le secret OWNER_SETUP_KEY après configuration.",
          },
          201,
          cors,
        );
      }

      /*
       * CONNEXION
       */
      if (route === "/auth/login") {
        const username = normUser(b.username);
        const password = String(b.password || "");

        if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length > 128) {
          return json({ error: "Identifiant ou mot de passe incorrect." }, 401, cors);
        }

        const now = Date.now();

        const ip = (req.headers.get("CF-Connecting-IP") || "unknown").slice(0, 64);
        const limits = [
          ["u:" + username + "|" + ip, 8],
          ["ip:" + ip, 40],
          ["u:" + username, 60],
        ];
        await env.DB.prepare("DELETE FROM login_attempts WHERE window_until < ?").bind(now).run();
        for (const [key, maximum] of limits) {
          if (await isLoginBlocked(env, key, maximum, now)) {
            return json(
              { error: "Trop de tentatives. Réessaie dans quelques minutes." },
              429,
              cors,
            );
          }
        }

        const u = await env.DB.prepare(
          "SELECT id, username, password_hash, salt, grade, role, active, created_at, accreditations, display_first_name, display_last_name, CASE WHEN avatar_data IS NOT NULL AND length(avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar FROM users WHERE username = ?",
        )
          .bind(username)
          .first();

        // Calcul de hash aussi pour un identifiant inconnu afin de réduire l'énumération temporelle.
        const candidate = await passwordHash(password, u ? u.salt : DUMMY_SALT);
        if (!u || !u.active || !safeEqual(candidate, u.password_hash)) {
          for (const [key] of limits) await recordLoginFailure(env, key, now);
          return json({ error: "Identifiant ou mot de passe incorrect." }, 401, cors);
        }

        for (const [key] of limits) {
          await env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(key).run();
        }

        await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
          .bind(now, u.id)
          .run();

        const token = randomToken(32);
        const expires = Date.now() + 30 * 60 * 1000;

        await env.DB.prepare(
          `INSERT INTO sessions
           (token_hash, user_id, expires_at, created_at)
           VALUES (?, ?, ?, ?)`,
        )
          .bind(await hash(token), u.id, expires, Date.now())
          .run();

        return json(
          {
            token,
            expiresAt: expires,
            user: publicUser(u),
          },
          200,
          cors,
        );
      }

      /*
       * DÉCONNEXION
       * Elle est traitée avant l'authentification pour rester utilisable
       * même si la session est déjà expirée.
       */
      if (route === "/auth/logout") {
        const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

        if (token) {
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
            .bind(await hash(token))
            .run();
        }

        return json({ ok: true }, 200, cors);
      }

      /*
       * ROUTES AUTHENTIFIÉES
       */
      const user = await getUser(req, env);

      if (!user) {
        return json({ error: "Session absente ou expirée. Reconnecte-toi." }, 401, cors);
      }

      if (route === "/users/avatars") {
        const ids = Array.isArray(b.ids)
          ? [...new Set(b.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(
              0,
              50,
            )
          : [];
        if (!ids.length) return json({ avatars: {} }, 200, cors);
        const placeholders = ids.map(() => "?").join(",");
        const result = await env.DB.prepare(
          "SELECT id, avatar_data FROM users WHERE active = 1 AND id IN (" + placeholders + ")",
        )
          .bind(...ids)
          .all();
        const avatars = Object.fromEntries(
          (result.results || []).map((row) => [String(row.id), row.avatar_data || null]),
        );
        return json({ avatars }, 200, cors);
      }

      if (route === "/users/avatar") {
        const id = Number(b.id || user.id);
        if (!Number.isInteger(id) || id <= 0) return json({ error: "Membre invalide." }, 400, cors);
        const result = await env.DB.prepare(
          "SELECT avatar_data FROM users WHERE id = ? AND active = 1",
        )
          .bind(id)
          .first();
        return json({ avatarData: result?.avatar_data || null }, 200, cors);
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
          return json(
            { error: "Le prénom et le nom doivent contenir 40 caractères maximum." },
            400,
            cors,
          );
        }
        if (hasAvatar && avatarData !== null && !isValidAvatarDataUrl(avatarData)) {
          return json({ error: "Image invalide ou trop volumineuse (300 Ko maximum)." }, 400, cors);
        }

        if (hasAvatar)
          await env.DB.prepare("UPDATE users SET avatar_data = ? WHERE id = ?")
            .bind(avatarData, user.id)
            .run();
        if (hasFirst || hasLast)
          await env.DB.prepare(
            "UPDATE users SET display_first_name = ?, display_last_name = ? WHERE id = ?",
          )
            .bind(first, last, user.id)
            .run();
        const updated = await env.DB.prepare(
          "SELECT id, username, grade, role, active, avatar_data, accreditations, display_first_name, display_last_name FROM users WHERE id = ?",
        )
          .bind(user.id)
          .first();
        return json(
          { ok: true, user: publicUser(updated), avatarData: updated.avatar_data || null },
          200,
          cors,
        );
      }

      if (route === "/users/profile") {
        if (!isOwner(user) || user.grade !== "Commanding Officer")
          return json(
            { error: "La gestion des profils est réservée au Commanding Officer." },
            403,
            cors,
          );
        const id = Number(b.id),
          first = String(b.displayFirstName || "").trim(),
          last = String(b.displayLastName || "").trim();
        if (
          !Number.isInteger(id) ||
          first.length > 40 ||
          last.length > 40 ||
          /[<>]/.test(first + last)
        )
          return json({ error: "Profil invalide. 40 caractères maximum par champ." }, 400, cors);
        const target = await env.DB.prepare("SELECT id, username, active FROM users WHERE id = ?")
          .bind(id)
          .first();
        if (!target || !target.active)
          return json({ error: "Compte cible introuvable ou désactivé." }, 404, cors);
        await env.DB.prepare(
          "UPDATE users SET display_first_name = ?, display_last_name = ? WHERE id = ?",
        )
          .bind(first, last, id)
          .run();
        await audit(
          env,
          user,
          "Nom d’affichage modifié",
          target.username + " · " + ([first, last].filter(Boolean).join(" ") || target.username),
        );
        const updated = await env.DB.prepare(
          "SELECT id, username, grade, role, active, CASE WHEN avatar_data IS NOT NULL AND length(avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar, accreditations, display_first_name, display_last_name FROM users WHERE id = ?",
        )
          .bind(id)
          .first();
        return json({ ok: true, user: publicUser(updated) }, 200, cors);
      }

      if (route === "/workspace/get") {
        const row = await env.DB.prepare(
          "SELECT workspace_json, updated_at FROM mrd_workspace WHERE workspace_key = 'main'",
        ).first();
        let workspace = { roster: {}, calendar: [], tasks: [] };
        try {
          workspace = { ...workspace, ...JSON.parse(row?.workspace_json || "{}") };
        } catch {}
        const usersResult = await env.DB.prepare(
          "SELECT id, username, grade, role, active, CASE WHEN avatar_data IS NOT NULL AND length(avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar, accreditations, display_first_name, display_last_name, created_at FROM users WHERE active = 1 ORDER BY created_at ASC",
        ).all();
        const members = (usersResult.results || []).map((u) => ({
          ...publicUser(u),
          createdAt: u.created_at,
        }));
        if (!isOwner(user)) {
          for (const entry of Object.values(workspace.roster || {}))
            if (entry && typeof entry === "object") delete entry.privateNotes;
        }
        if (!isAdmin(user)) {
          for (const event of workspace.calendar || []) {
            event.signups = (event.signups || []).map((signup) =>
              Number(signup.userId) === Number(user.id) ? signup : { userId: signup.userId },
            );
          }
          for (const task of workspace.tasks || []) {
            task.progress = Object.fromEntries(
              Object.entries(task.progress || {}).filter(([id]) => Number(id) === Number(user.id)),
            );
          }
        }
        return json(
          {
            workspace,
            workspaceUpdatedAt: Number(row?.updated_at || 0),
            members,
            canManageRoster: isOwner(user),
            canManageCalendar: isAdmin(user),
            canManageTasks: isAdmin(user),
          },
          200,
          cors,
        );
      }

      if (route === "/workspace/save") {
        const action = String(b.action || "");
        const row = await env.DB.prepare(
          "SELECT workspace_json, updated_at FROM mrd_workspace WHERE workspace_key = 'main'",
        ).first();
        const expectedUpdatedAt = Number(b.updatedAt);
        const currentUpdatedAt = Number(row?.updated_at || 0);
        if (!Number.isFinite(expectedUpdatedAt) || expectedUpdatedAt !== currentUpdatedAt) {
          return json(
            {
              error:
                "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
            },
            409,
            cors,
          );
        }
        let ws = { roster: {}, calendar: [], tasks: [] };
        try {
          ws = { ...ws, ...JSON.parse(row?.workspace_json || "{}") };
        } catch {}
        let savedUpdatedAt = currentUpdatedAt;
        const saveWs = async (target) => {
          const nextUpdatedAt = Math.max(Date.now(), expectedUpdatedAt + 1);
          const result = await env.DB.prepare(
            "UPDATE mrd_workspace SET workspace_json = ?, updated_by = ?, updated_at = ? WHERE workspace_key = 'main' AND updated_at = ?",
          )
            .bind(JSON.stringify(target), user.username, nextUpdatedAt, expectedUpdatedAt)
            .run();
          if (!result.meta || Number(result.meta.changes || 0) !== 1) return false;
          savedUpdatedAt = nextUpdatedAt;
          return true;
        };
        const safeText = (value, max = 1000) =>
          String(value || "")
            .trim()
            .slice(0, max);
        if (action === "roster") {
          if (!isOwner(user) || user.grade !== "Commanding Officer")
            return json({ error: "La gestion de l’effectif est réservée au CO." }, 403, cors);
          const memberId = String(b.userId || "");
          const target = await env.DB.prepare("SELECT id, username, active FROM users WHERE id = ?")
            .bind(Number(memberId))
            .first();
          if (!target || !target.active) return json({ error: "Membre introuvable." }, 404, cors);
          const data = b.roster || {};
          ws.roster[memberId] = {
            order: Math.max(0, Math.min(9999, Number(data.order) || 0)),
            arrivalDate: safeText(data.arrivalDate, 10),
            promotionDate: safeText(data.promotionDate, 10),
            publicNotes: safeText(data.publicNotes, 500),
            privateNotes: safeText(data.privateNotes, 1500),
          };
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
          await audit(env, user, "Fiche effectif modifiée", target.username);
        } else if (action === "event-upsert") {
          if (!isAdmin(user))
            return json({ error: "Seuls le CO et l’ACO peuvent gérer le calendrier." }, 403, cors);
          const e = b.event || {};
          const id = safeText(e.id, 80) || randomToken(8);
          const title = safeText(e.title, 120);
          const date = typeof e.date === "string" ? e.date.trim() : "";
          const time = typeof e.time === "string" ? e.time.trim() : "";

          if (!title || !isValidISODate(date)) {
            return json({ error: "Un titre et une date valide sont obligatoires." }, 400, cors);
          }
          if (time && !isValidTime(time)) {
            return json({ error: "L’heure doit être au format HH:MM." }, 400, cors);
          }

          const item = {
            id,
            title,
            date,
            time,
            description: safeText(e.description, 1500),
            location: safeText(e.location, 160),
            createdBy: user.id,
            signups: Array.isArray(e.signups) ? e.signups : [],
          };
          const index = ws.calendar.findIndex((x) => x.id === id);
          if (index >= 0)
            ws.calendar[index] = {
              ...ws.calendar[index],
              ...item,
              signups: ws.calendar[index].signups || [],
            };
          else ws.calendar.push(item);
          ws.calendar.sort((a, z) => (a.date + a.time).localeCompare(z.date + z.time));
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
          await audit(env, user, "Calendrier modifié", title);
        } else if (action === "event-delete") {
          if (!isAdmin(user))
            return json({ error: "Seuls le CO et l’ACO peuvent gérer le calendrier." }, 403, cors);
          ws.calendar = ws.calendar.filter((x) => x.id !== String(b.eventId));
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
        } else if (action === "signup") {
          const event = ws.calendar.find((x) => x.id === String(b.eventId));
          if (!event) return json({ error: "Événement introuvable." }, 404, cors);
          event.signups = Array.isArray(event.signups) ? event.signups : [];
          const found = event.signups.find((x) => Number(x.userId) === Number(user.id));
          if (b.join && !found) event.signups.push({ userId: user.id, notes: "", work: "" });
          if (!b.join && found)
            event.signups = event.signups.filter((x) => Number(x.userId) !== Number(user.id));
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
        } else if (action === "event-report") {
          const event = ws.calendar.find((x) => x.id === String(b.eventId));
          if (!event) return json({ error: "Événement introuvable." }, 404, cors);
          const signup = (event.signups || []).find((x) => Number(x.userId) === Number(user.id));
          if (!signup)
            return json(
              { error: "Inscris-toi à l’événement avant d’ajouter tes notes." },
              403,
              cors,
            );
          signup.notes = safeText(b.notes, 1200);
          signup.work = safeText(b.work, 2000);
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
        } else if (action === "task-upsert") {
          if (!isAdmin(user))
            return json({ error: "Seuls le CO et l’ACO peuvent gérer les tâches." }, 403, cors);
          const t = b.task || {};
          const id = safeText(t.id, 80) || randomToken(8);
          const title = safeText(t.title, 120);
          const dueDate =
            t.dueDate == null || t.dueDate === ""
              ? ""
              : typeof t.dueDate === "string"
                ? t.dueDate.trim()
                : null;

          if (!title) return json({ error: "Le titre de la tâche est obligatoire." }, 400, cors);
          if (dueDate === null || (dueDate && !isValidISODate(dueDate))) {
            return json({ error: "La date d’échéance doit être une date valide." }, 400, cors);
          }

          const assignedTo =
            t.assignedTo === "" || t.assignedTo == null ? null : Number(t.assignedTo);
          if (assignedTo !== null) {
            if (!Number.isInteger(assignedTo))
              return json({ error: "Responsable invalide." }, 400, cors);
            const assignee = await env.DB.prepare("SELECT id, active FROM users WHERE id = ?")
              .bind(assignedTo)
              .first();
            if (!assignee || !assignee.active)
              return json({ error: "Le responsable doit être un compte actif." }, 400, cors);
          }
          const item = {
            id,
            title,
            description: safeText(t.description, 1500),
            dueDate,
            assignedTo,
            createdBy: user.id,
            progress: (ws.tasks.find((x) => x.id === id) || {}).progress || {},
          };
          const index = ws.tasks.findIndex((x) => x.id === id);
          if (index >= 0) ws.tasks[index] = { ...ws.tasks[index], ...item };
          else ws.tasks.push(item);
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
          await audit(env, user, "Tâche modifiée", title);
        } else if (action === "task-delete") {
          if (!isAdmin(user))
            return json({ error: "Seuls le CO et l’ACO peuvent gérer les tâches." }, 403, cors);
          ws.tasks = ws.tasks.filter((x) => x.id !== String(b.taskId));
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
        } else if (action === "task-progress") {
          const task = ws.tasks.find((x) => x.id === String(b.taskId));
          if (!task) return json({ error: "Tâche introuvable." }, 404, cors);
          if (task.assignedTo && Number(task.assignedTo) !== Number(user.id) && !isAdmin(user))
            return json({ error: "Cette tâche est attribuée à un autre membre." }, 403, cors);
          task.progress = task.progress || {};
          task.progress[String(user.id)] = {
            status: ["todo", "doing", "done"].includes(b.status) ? b.status : "todo",
            report: safeText(b.report, 2000),
            updatedAt: Date.now(),
          };
          if (!(await saveWs(ws)))
            return json(
              {
                error:
                  "L’espace de travail a été modifié ailleurs. Recharge les données puis réessaie.",
              },
              409,
              cors,
            );
        } else {
          return json({ error: "Action d’espace de travail inconnue." }, 400, cors);
        }
        return json({ ok: true, workspaceUpdatedAt: savedUpdatedAt }, 200, cors);
      }

      if (route === "/auth/change-password") {
        const currentPassword = String(b.currentPassword || "");
        const newPassword = String(b.newPassword || "");
        if (!currentPassword || newPassword.length < 12 || newPassword.length > 128) {
          return json(
            {
              error:
                "Le mot de passe actuel est obligatoire et le nouveau doit contenir 12 à 128 caractères.",
            },
            400,
            cors,
          );
        }
        const account = await env.DB.prepare(
          "SELECT id, password_hash, salt FROM users WHERE id = ? AND active = 1",
        )
          .bind(user.id)
          .first();
        if (!account) return json({ error: "Compte introuvable ou désactivé." }, 401, cors);
        const candidate = await passwordHash(currentPassword, account.salt);
        if (candidate !== account.password_hash) {
          return json({ error: "Le mot de passe actuel est incorrect." }, 403, cors);
        }
        const salt = randomToken(16);
        const password_hash = await passwordHash(newPassword, salt);
        await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
          .bind(password_hash, salt, user.id)
          .run();
        const currentToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        if (currentToken) {
          await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
            .bind(user.id, await hash(currentToken))
            .run();
        }
        await audit(env, user, "Mot de passe modifié", user.username);
        return json({ ok: true, message: "Mot de passe modifié." }, 200, cors);
      }

      if (route === "/users/list") {
        if (!canManageAccounts(user)) {
          return json({ error: "Réservé au CO et à l’ACO." }, 403, cors);
        }

        const result = await env.DB.prepare(
          `SELECT id, username, grade, role, active, created_at, last_login_at, accreditations, display_first_name, display_last_name, CASE WHEN avatar_data IS NOT NULL AND length(avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar FROM users ORDER BY created_at DESC`,
        ).all();
        return json(
          {
            users: (result.results || []).map((u) => ({
              ...publicUser(u),
              created_at: u.created_at,
              last_login_at: u.last_login_at ?? null,
              active: !!u.active,
              accreditations:
                u.role === "owner" ? [...ACCREDITATIONS] : parseAccreditations(u.accreditations),
            })),
          },
          200,
          cors,
        );
      }

      if (route === "/users/accreditations") {
        if (!canManageAccounts(user))
          return json(
            { error: "L’attribution des accréditations est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        const id = Number(b.id),
          requested = b.accreditations;
        if (
          !Number.isInteger(id) ||
          id === user.id ||
          !Array.isArray(requested) ||
          requested.some((a) => typeof a !== "string" || !ACCREDITATIONS.includes(a))
        )
          return json({ error: "Données d’accréditation invalides." }, 400, cors);
        const target = await env.DB.prepare(
          "SELECT id, username, grade, role, active FROM users WHERE id = ?",
        )
          .bind(id)
          .first();
        if (!target || !target.active || target.role === "owner")
          return json({ error: "Compte cible introuvable ou non modifiable." }, 404, cors);
        const allowed = gradeAccreditations(target.grade),
          unique = [...new Set(requested)];
        const forbidden = unique.filter((a) => !allowed.includes(a));
        if (forbidden.length)
          return json(
            {
              error:
                "Accréditation non accessible pour le grade " +
                target.grade +
                " : " +
                forbidden.join(", "),
            },
            400,
            cors,
          );
        await env.DB.prepare("UPDATE users SET accreditations = ? WHERE id = ?")
          .bind(JSON.stringify(unique), id)
          .run();
        await audit(
          env,
          user,
          "Accréditations modifiées",
          target.username + " · " + (unique.join(", ") || "aucune"),
        );
        const updated = await env.DB.prepare(
          "SELECT id, username, grade, role, active, CASE WHEN avatar_data IS NOT NULL AND length(avatar_data) > 0 THEN 1 ELSE 0 END AS has_avatar, accreditations FROM users WHERE id = ?",
        )
          .bind(id)
          .first();
        return json({ ok: true, user: publicUser(updated) }, 200, cors);
      }

      if (route === "/users/create") {
        if (!canManageAccounts(user)) {
          return json(
            { error: "La création de comptes est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        }

        const username = normUser(b.username);
        const password = String(b.password || "");
        const grade = String(b.grade || "").trim();
        const roleByGrade = {
          "Certified Officer": "editor",
          "Expert Officer": "editor",
          "Assistant Commanding Officer": "admin",
        };
        const role = roleByGrade[grade];

        if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
          return json(
            {
              error:
                "Identifiant : 3 à 32 caractères (lettres, chiffres, point, tiret, underscore).",
            },
            400,
            cors,
          );
        }

        if (password.length < 12 || password.length > 128) {
          return json(
            {
              error: "Le mot de passe doit contenir au moins 12 caractères.",
            },
            400,
            cors,
          );
        }

        const allowedGrades = isCommandingOfficer(user)
          ? ["Certified Officer", "Expert Officer", "Assistant Commanding Officer"]
          : ["Certified Officer", "Expert Officer"];
        if (!role || !allowedGrades.includes(grade)) {
          return json(
            {
              error: isAssistantCommandingOfficer(user)
                ? "L’ACO peut créer des comptes CtO et EO. La création d’un compte ACO est réservée au CO."
                : "Choisis un grade autorisé. Le Commanding Officer est réservé au compte Owner.",
            },
            400,
            cors,
          );
        }

        const salt = randomToken(16);
        const ph = await passwordHash(password, salt);

        try {
          const r = await env.DB.prepare(
            `INSERT INTO users
             (username, password_hash, salt, grade, role, active, created_at)
             VALUES (?, ?, ?, ?, ?, 1, ?)`,
          )
            .bind(username, ph, salt, grade, role, Date.now())
            .run();

          await audit(env, user, "Compte créé", username + " · " + grade);
          return json({ ok: true, id: r.meta?.last_row_id }, 201, cors);
        } catch (e) {
          // Ne transforme pas toutes les erreurs SQL en doublon.
          if (/unique constraint failed/i.test(e.message || "")) {
            return json({ error: "Cet identifiant existe déjà." }, 409, cors);
          }
          throw e;
        }
      }

      if (route === "/users/disable") {
        if (!canManageAccounts(user)) {
          return json(
            { error: "La désactivation des comptes est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        }

        const id = Number(b.id);
        if (!Number.isInteger(id) || id === user.id) {
          return json({ error: "Compte invalide." }, 400, cors);
        }
        const targetUser = await env.DB.prepare(
          "SELECT username, role, active FROM users WHERE id = ?",
        )
          .bind(id)
          .first();
        if (!targetUser || targetUser.role === "owner" || !targetUser.active) {
          return json({ error: "Compte introuvable ou déjà désactivé." }, 400, cors);
        }
        await env.DB.prepare("UPDATE users SET active = 0 WHERE id = ? AND role <> ?")
          .bind(id, "owner")
          .run();

        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();

        await audit(env, user, "Compte désactivé", targetUser.username);
        return json({ ok: true }, 200, cors);
      }

      if (route === "/users/delete-inactive") {
        if (!canManageAccounts(user)) {
          return json(
            { error: "La suppression des comptes est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        }

        const id = Number(b.id);
        if (!Number.isInteger(id) || id <= 0 || id === Number(user.id)) {
          return json({ error: "Compte invalide." }, 400, cors);
        }

        const targetUser = await env.DB.prepare(
          "SELECT id, username, role, active FROM users WHERE id = ?",
        )
          .bind(id)
          .first();

        // La suppression définitive est réservée aux comptes déjà désactivés.
        if (!targetUser || targetUser.role === "owner" || targetUser.active) {
          return json(
            {
              error:
                "Seuls les comptes déjà désactivés peuvent être supprimés définitivement. Les comptes Owner sont protégés.",
            },
            400,
            cors,
          );
        }

        const workspaceRow = await env.DB.prepare(
          "SELECT workspace_json FROM mrd_workspace WHERE workspace_key = 'main'",
        ).first();
        let workspace = { roster: {}, calendar: [], tasks: [] };
        try {
          workspace = { ...workspace, ...JSON.parse(workspaceRow?.workspace_json || "{}") };
        } catch {
          return json(
            {
              error:
                "L’espace Effectif n’a pas pu être lu en sécurité ; aucune suppression effectuée.",
            },
            500,
            cors,
          );
        }

        workspace.roster =
          workspace.roster && typeof workspace.roster === "object" ? workspace.roster : {};
        delete workspace.roster[String(id)];

        workspace.calendar = Array.isArray(workspace.calendar) ? workspace.calendar : [];
        for (const event of workspace.calendar) {
          if (!event || typeof event !== "object") continue;
          if (Array.isArray(event.signups)) {
            event.signups = event.signups.filter((signup) => Number(signup?.userId) !== id);
          }
          if (Number(event.createdBy) === id) event.createdBy = null;
        }

        workspace.tasks = Array.isArray(workspace.tasks) ? workspace.tasks : [];
        for (const task of workspace.tasks) {
          if (!task || typeof task !== "object") continue;
          if (Number(task.assignedTo) === id) task.assignedTo = null;
          if (Number(task.createdBy) === id) task.createdBy = null;
          if (task.progress && typeof task.progress === "object") {
            delete task.progress[String(id)];
          }
        }

        const now = Date.now();
        const results = await env.DB.batch([
          env.DB.prepare(
            "UPDATE mrd_workspace SET workspace_json = ?, updated_by = ?, updated_at = ? WHERE workspace_key = 'main'",
          ).bind(JSON.stringify(workspace), user.username, now),
          env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
          env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(targetUser.username),
          env.DB.prepare("DELETE FROM users WHERE id = ? AND active = 0 AND role <> 'owner'").bind(
            id,
          ),
        ]);

        const deleted = Number(results?.[3]?.meta?.changes || 0);
        if (!deleted) {
          return json(
            {
              error:
                "Le compte n’est plus éligible à la suppression. Recharge la liste des comptes.",
            },
            409,
            cors,
          );
        }

        await audit(env, user, "Compte désactivé supprimé", targetUser.username);
        return json({ ok: true, deleted: true }, 200, cors);
      }

      if (route === "/logs/list") {
        if (!isAdmin(user))
          return json(
            { error: "Réservé aux administrateurs et au Commanding Officer." },
            403,
            cors,
          );
        const result = await env.DB.prepare(
          "SELECT id, actor_username, actor_grade, action, target, created_at FROM audit_logs ORDER BY id DESC LIMIT 200",
        ).all();
        return json({ logs: result.results || [] }, 200, cors);
      }

      if (route === "/ping") {
        return json(
          {
            ok: true,
            architecture: "unified-portal-auth",
            user: publicUser(user),
          },
          200,
          cors,
        );
      }

      /*
       * BROUILLONS PRIVÉS D'ÉVÉNEMENTS (D1 uniquement, non publiés sur GitHub Pages)
       */
      if (route === "/draft/save") {
        if (!canPublish(user))
          return json({ error: "Ton grade ne permet pas d’enregistrer un brouillon." }, 403, cors);
        if (
          !okSlug(b.slug) ||
          typeof b.config !== "string" ||
          b.config.length > 200000 ||
          !okEntry(b.card) ||
          b.card.href !== b.slug + "/"
        ) {
          return json({ error: "Données de brouillon refusées." }, 400, cors);
        }
        let config;
        try {
          config = JSON.parse(b.config);
        } catch {
          return json({ error: "Configuration de brouillon invalide." }, 400, cors);
        }
        if (
          config.slug !== b.slug ||
          !config.meta ||
          typeof config.meta.title !== "string" ||
          !config.meta.title.trim()
        ) {
          return json(
            { error: "Le titre et l’adresse du brouillon sont obligatoires." },
            400,
            cors,
          );
        }
        const priorDraft = await env.DB.prepare("SELECT slug FROM event_drafts WHERE slug = ?")
          .bind(b.slug)
          .first();
        await env.DB.prepare(
          `INSERT INTO event_drafts (slug, config, card, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             config = excluded.config,
             card = excluded.card,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
          .bind(b.slug, b.config, JSON.stringify(b.card), user.username, Date.now())
          .run();
        await audit(
          env,
          user,
          priorDraft ? "Brouillon modifié" : "Brouillon créé",
          b.card.title || b.slug,
        );
        return json({ ok: true, message: "Brouillon enregistré sans publication." }, 200, cors);
      }

      if (route === "/draft/load") {
        if (!canPublish(user))
          return json({ error: "Ton grade ne permet pas de consulter les brouillons." }, 403, cors);
        if (!okSlug(b.slug)) return json({ error: "Adresse de brouillon invalide." }, 400, cors);
        const draft = await env.DB.prepare(
          "SELECT config, card, updated_by, updated_at FROM event_drafts WHERE slug = ?",
        )
          .bind(b.slug)
          .first();
        return draft
          ? json(
              {
                found: true,
                config: draft.config,
                card: JSON.parse(draft.card),
                updatedBy: draft.updated_by,
                updatedAt: draft.updated_at,
              },
              200,
              cors,
            )
          : json({ found: false }, 200, cors);
      }

      /*
       * PUBLICATION D'UN ÉVÉNEMENT VIA GITHUB
       */
      if (route === "/publish") {
        if (!canPublish(user)) {
          return json({ error: "Ton grade ne permet pas de publier." }, 403, cors);
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
          return json({ error: "Structure de page invalide." }, 400, cors);
        }

        const priorCardFile = await read(env, "public/events-data.js");
        const priorCards = priorCardFile ? parse(priorCardFile.text) : [];
        const priorEvent = priorCards.find((x) => x.href === b.card.href);
        contents[b.slug] = extracted;

        operation = "écriture du contenu de l’événement (public/events-content.js)";
        await write(
          env,
          "public/events-content.js",
          serializeContent(contents),
          `Contenu événement ${b.slug} (${user.username})`,
        );

        operation = "lecture du portail (public/events-data.js)";
        const f = await read(env, "public/events-data.js");

        if (!f) {
          throw new Error("Fichier public/events-data.js introuvable.");
        }

        const list = parse(f.text);
        const i = list.findIndex((x) => x.href === b.card.href);

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
          `Portail : ${b.slug} (${user.username})`,
        );

        await audit(
          env,
          user,
          priorEvent ? "Événement modifié et publié" : "Événement créé et publié",
          b.card.title || b.slug,
        );
        return json(
          {
            ok: true,
            mode: "integrated",
            message: "Événement publié dans le portail centralisé.",
          },
          200,
          cors,
        );
      }

      /* Suppression sécurisée d'une publication et de son fichier associé. */
      if (route === "/publication/delete") {
        if (!canPublish(user))
          return json(
            { error: "Ton grade ne permet pas de supprimer une publication." },
            403,
            cors,
          );
        if (
          typeof b.id !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.id) ||
          b.id.length > 100
        ) {
          return json({ error: "Identifiant de publication invalide." }, 400, cors);
        }
        const listFile = await read(env, "public/publications-data.js");
        if (!listFile) return json({ error: "Catalogue des publications introuvable." }, 404, cors);
        const start = listFile.text.indexOf("[");
        const end = listFile.text.lastIndexOf("]");
        if (start < 0 || end <= start)
          return json({ error: "Catalogue des publications invalide." }, 500, cors);
        const list = JSON.parse(listFile.text.slice(start, end + 1));
        const publication = list.find((item) => item.id === b.id);
        if (!publication) return json({ error: "Cette publication n’existe plus." }, 404, cors);
        if (
          typeof publication.file !== "string" ||
          !/^public\/uploads\/[a-z0-9-]+\.(?:pdf|png|jpg|webp)$/.test(publication.file)
        ) {
          return json({ error: "Chemin du fichier refusé par sécurité." }, 400, cors);
        }
        const next = list.filter((item) => item.id !== b.id);
        await write(
          env,
          "public/publications-data.js",
          "window.MRD_PUBLICATIONS = " + JSON.stringify(next, null, 2) + ";\n",
          "Suppression publication " + b.id + " (" + user.username + ")",
        );
        const asset = await gh(env, publication.file);
        if (asset.ok) {
          const assetInfo = await asset.json();
          const deletion = await gh(env, publication.file, {
            method: "DELETE",
            body: JSON.stringify({
              message: "Suppression fichier publication " + b.id + " (" + user.username + ")",
              sha: assetInfo.sha,
              branch: env.BRANCH,
            }),
          });
          if (!deletion.ok)
            throw new Error(
              "Publication retirée du catalogue, mais suppression du fichier échouée (GitHub HTTP " +
                deletion.status +
                ").",
            );
        } else if (asset.status !== 404) {
          throw new Error(
            "Publication retirée du catalogue, mais lecture du fichier impossible (GitHub HTTP " +
              asset.status +
              ").",
          );
        }
        await audit(
          env,
          user,
          "Publication supprimée",
          String(publication.title || b.id).slice(0, 120),
        );
        return json({ ok: true, message: "Publication supprimée." }, 200, cors);
      }

      /* Publication de documents et actualités (PDF / images) */
      if (route === "/publication/publish") {
        if (!canPublish(user))
          return json({ error: "Ton grade ne permet pas de publier." }, 403, cors);
        const kinds = ["news", "comm-interne", "comm-presse", "compte-rendu"];
        const settingsFile = await read(env, "public/portal-settings.js");
        let categorySettings = null;
        if (settingsFile) {
          const a = settingsFile.text.indexOf("{"),
            z = settingsFile.text.lastIndexOf("}");
          if (a >= 0 && z > a) categorySettings = JSON.parse(settingsFile.text.slice(a, z + 1));
        }
        const customKind =
          typeof b.kind === "string" &&
          /^custom-[a-z0-9-]{1,64}$/.test(b.kind) &&
          Array.isArray(categorySettings?.categories) &&
          categorySettings.categories.some((c) => c.id === b.kind && c.type === "publications");
        const extByMime = {
          "application/pdf": "pdf",
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
        };
        const title = typeof b.title === "string" ? b.title.trim() : "";
        const summary = b.summary == null ? "" : b.summary;
        const date = b.date == null ? "" : b.date;
        const validKind = kinds.includes(b.kind) || customKind;

        if (
          !validKind ||
          !title ||
          title.length > 120 ||
          /[<>]/.test(title) ||
          typeof summary !== "string" ||
          summary.length > 500 ||
          /[<>]/.test(summary) ||
          typeof date !== "string" ||
          (date !== "" && !isValidISODate(date)) ||
          !extByMime[b.mime] ||
          !isValidPublicationFile(b.mime, b.data)
        ) {
          return json(
            { error: "Métadonnées invalides ou fichier non conforme (10 Mo maximum)." },
            400,
            cors,
          );
        }

        const slug =
          (
            title
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "") || "publication"
          ).slice(0, 60) +
          "-" +
          Date.now().toString(36);
        const path = "public/uploads/" + slug + "." + extByMime[b.mime];
        const upload = await gh(env, path, {
          method: "PUT",
          body: JSON.stringify({
            message: "Publication MRD : " + b.title.slice(0, 100),
            content: b.data,
            branch: env.BRANCH,
          }),
        });
        if (!upload.ok) throw new Error("Échec du dépôt du fichier : GitHub HTTP " + upload.status);
        const listFile = await read(env, "public/publications-data.js");
        let list = [];
        if (listFile) {
          const start = listFile.text.indexOf("[");
          const end = listFile.text.lastIndexOf("]");
          if (start >= 0 && end > start) list = JSON.parse(listFile.text.slice(start, end + 1));
        }
        list.unshift({ id: slug, kind: b.kind, title, summary, date, mime: b.mime, file: path });
        await write(
          env,
          "public/publications-data.js",
          "window.MRD_PUBLICATIONS = " + JSON.stringify(list, null, 2) + ";\n",
          "Publication MRD " + slug + " (" + user.username + ")",
        );
        await audit(env, user, "Publication créée", b.title.trim().slice(0, 120) + " · " + b.kind);
        return json({ ok: true, file: path }, 200, cors);
      }

      /*
       * PARAMÈTRES DES CATÉGORIES DU PORTAIL — CO / ACO uniquement
       */
      if (route === "/portal/category/delete") {
        if (!canManageAccounts(user))
          return json(
            { error: "La gestion des catégories est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        const id = String(b.id || "");
        if (!/^(?:news|documents|custom-[a-z0-9-]{1,64})$/.test(id))
          return json({ error: "Cette catégorie ne peut pas être supprimée." }, 400, cors);
        const settingsFile = await read(env, "public/portal-settings.js");
        if (!settingsFile) return json({ error: "Paramètres du portail introuvables." }, 404, cors);
        const settingsStart = settingsFile.text.indexOf("{"),
          settingsEnd = settingsFile.text.lastIndexOf("}");
        if (settingsStart < 0 || settingsEnd <= settingsStart)
          return json({ error: "Paramètres du portail invalides." }, 500, cors);
        const current = JSON.parse(settingsFile.text.slice(settingsStart, settingsEnd + 1));
        const currentCategories = Array.isArray(current.categories)
          ? current.categories
          : [
              {
                id: "events",
                name: "Événements",
                type: "events",
                description: "Fiches et cartes des événements",
              },
              {
                id: "news",
                name: "News & actualités",
                type: "publications",
                description: "Actualités et communiqués",
              },
              {
                id: "documents",
                name: "Communication interne",
                type: "publications",
                description: "Documents et communications officielles",
              },
            ];
        const category = currentCategories.find((c) => c.id === id);
        if (!category) return json({ error: "Cette catégorie n’existe plus." }, 404, cors);
        const listFile = await read(env, "public/publications-data.js");
        let list = [];
        if (listFile) {
          const a = listFile.text.indexOf("["),
            z = listFile.text.lastIndexOf("]");
          if (a < 0 || z <= a)
            return json({ error: "Catalogue des publications invalide." }, 500, cors);
          list = JSON.parse(listFile.text.slice(a, z + 1));
        }
        const matches = (item) =>
          id === "news"
            ? ["news", "comm-presse"].includes(item.kind)
            : id === "documents"
              ? ["comm-interne", "compte-rendu"].includes(item.kind)
              : item.kind === id;
        const removed = list.filter(matches);
        for (const item of removed) {
          if (
            typeof item.file !== "string" ||
            !/^public\/uploads\/[a-z0-9-]+\.(?:pdf|png|jpg|webp)$/.test(item.file)
          ) {
            return json(
              {
                error:
                  "Un fichier associé à une publication n’a pas un chemin valide. Suppression interrompue.",
              },
              400,
              cors,
            );
          }
        }
        const next = list.filter((item) => !matches(item));
        await write(
          env,
          "public/publications-data.js",
          "window.MRD_PUBLICATIONS = " + JSON.stringify(next, null, 2) + ";\n",
          "Suppression catégorie " + id + " (" + user.username + ")",
        );
        const remainingCategories = currentCategories.filter((c) => c.id !== id);
        const ids = remainingCategories.map((c) => c.id);
        const nextOrder = (
          Array.isArray(current.order) ? current.order : ["events", "news", "documents"]
        ).filter((key) => ids.includes(key));
        for (const key of ids) if (!nextOrder.includes(key)) nextOrder.push(key);
        const nextSettings = {
          order: nextOrder,
          visible: Object.fromEntries(
            remainingCategories.map((c) => [
              c.id,
              typeof current.visible?.[c.id] === "boolean"
                ? current.visible[c.id]
                : c.id !== "news",
            ]),
          ),
          categories: remainingCategories,
        };
        await write(
          env,
          "public/portal-settings.js",
          "window.MRD_PORTAL_SETTINGS = " + JSON.stringify(nextSettings, null, 2) + ";\n",
          "Suppression catégorie portail " + id + " (" + user.username + ")",
        );
        const failedFiles = [];
        for (const item of removed) {
          const asset = await gh(env, item.file);
          if (asset.ok) {
            const info = await asset.json();
            const deletion = await gh(env, item.file, {
              method: "DELETE",
              body: JSON.stringify({
                message: "Suppression publication " + item.id + " avec catégorie " + id,
                sha: info.sha,
                branch: env.BRANCH,
              }),
            });
            if (!deletion.ok) failedFiles.push(item.file);
          } else if (asset.status !== 404) failedFiles.push(item.file);
        }
        await audit(
          env,
          user,
          "Catégorie supprimée",
          category.name + " · " + removed.length + " publication(s)",
        );
        return json(
          {
            ok: true,
            deletedPublications: removed.length,
            cleanupWarning: failedFiles.length,
            settings: nextSettings,
          },
          200,
          cors,
        );
      }

      if (route === "/portal/settings") {
        if (!canManageAccounts(user))
          return json(
            { error: "La gestion des catégories du portail est réservée au CO et à l’ACO." },
            403,
            cors,
          );
        const settings = b.settings;
        const validId = (id) =>
          ["events", "news", "documents"].includes(id) ||
          (typeof id === "string" && /^custom-[a-z0-9-]{1,64}$/.test(id));
        const categories = Array.isArray(settings?.categories)
          ? settings.categories
          : [
              {
                id: "events",
                name: "Événements",
                type: "events",
                description: "Fiches et cartes des événements",
              },
              {
                id: "news",
                name: "News & actualités",
                type: "publications",
                description: "Actualités et communiqués",
              },
              {
                id: "documents",
                name: "Communication interne",
                type: "publications",
                description: "Documents et communications officielles",
              },
            ];
        const safeCategories = categories.map((c) => ({
          id: c?.id,
          name: typeof c?.name === "string" ? c.name.trim() : "",
          type: c?.id === "events" ? "events" : "publications",
          description: typeof c?.description === "string" ? c.description.trim() : "",
        }));
        const ids = safeCategories.map((c) => c.id);
        if (
          !settings ||
          !Array.isArray(settings.order) ||
          safeCategories.length < 1 ||
          safeCategories.length > 24 ||
          new Set(ids).size !== ids.length ||
          !ids.every(validId) ||
          !ids.includes("events") ||
          !safeCategories.every(
            (c) =>
              c.name.length >= 1 &&
              c.name.length <= 48 &&
              !/[<>]/.test(c.name) &&
              c.description.length <= 100 &&
              !/[<>]/.test(c.description) &&
              (c.id === "events" ? c.type === "events" : c.type === "publications"),
          ) ||
          settings.order.length !== ids.length ||
          new Set(settings.order).size !== ids.length ||
          !settings.order.every((id) => ids.includes(id)) ||
          !settings.visible ||
          !ids.every((id) => typeof settings.visible[id] === "boolean") ||
          !ids.some((id) => settings.visible[id])
        ) {
          return json(
            {
              error:
                "Configuration des catégories invalide. Vérifie les noms, l’ordre et la visibilité.",
            },
            400,
            cors,
          );
        }
        const safeSettings = {
          order: settings.order,
          visible: Object.fromEntries(ids.map((id) => [id, settings.visible[id]])),
          categories: safeCategories,
        };
        await write(
          env,
          "public/portal-settings.js",
          "window.MRD_PORTAL_SETTINGS = " + JSON.stringify(safeSettings, null, 2) + ";\n",
          "Catégories du portail modifiées (" + user.username + ")",
        );
        await audit(
          env,
          user,
          "Catégories du portail modifiées",
          safeSettings.order
            .map(
              (id) =>
                safeCategories.find((c) => c.id === id).name +
                (safeSettings.visible[id] ? " affichée" : " masquée"),
            )
            .join(", "),
        );
        return json({ ok: true, settings: safeSettings }, 200, cors);
      }

      /*
       * MISE À JOUR DU PORTAIL
       */
      if (route === "/portal") {
        if (!canPublish(user)) {
          return json({ error: "Ton grade ne permet pas de modifier le portail." }, 403, cors);
        }

        if (!Array.isArray(b.list) || b.list.length > 200 || !b.list.every(okEntry)) {
          return json({ error: "Données refusées." }, 400, cors);
        }

        const beforeFile = await read(env, "public/events-data.js");
        const beforeList = beforeFile ? parse(beforeFile.text) : [];
        const beforeMap = new Map(beforeList.map((item) => [item.href, item]));
        const afterMap = new Map(b.list.map((item) => [item.href, item]));
        const auditEntries = [];
        for (const [href, item] of afterMap) {
          const old = beforeMap.get(href);
          if (!old) auditEntries.push(["Événement ajouté au portail", item.title || href]);
          else if (JSON.stringify(old) !== JSON.stringify(item))
            auditEntries.push(["Événement modifié dans le portail", item.title || href]);
        }
        for (const [href, item] of beforeMap) {
          if (!afterMap.has(href))
            auditEntries.push(["Événement retiré du portail", item.title || href]);
        }
        await write(
          env,
          "public/events-data.js",
          serialize(b.list),
          `Portail mis à jour (${user.username})`,
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
        stack: e?.stack || null,
      });

      const publishFailure = route === "/publish" && operation !== "initialisation";
      const detail = String(e?.message || "Erreur inconnue")
        .replace(/[\\r\\n]+/g, " ")
        .slice(0, 180);
      return json(
        {
          error: publishFailure
            ? "Échec pendant " + operation + " : " + detail
            : "Erreur interne du serveur. Consulte les logs du Worker.",
        },
        500,
        cors,
      );
    }
  },
};

