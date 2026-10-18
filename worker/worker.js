
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
  (h.match(/<script/gi) || []).length === 1 &&
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

const publicUser = u => ({
  id: u.id,
  username: u.username,
  grade: u.grade,
  role: u.role,
  active: !!u.active,
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
      avatar_data TEXT
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
    )`
  ];

  for (const sql of statements) {
    await env.DB.prepare(sql).run();
  }
  const columns = await env.DB.prepare("PRAGMA table_info(users)").all();
  if (!(columns.results || []).some(column => column.name === "avatar_data")) {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN avatar_data TEXT").run();
  }
}

async function getUser(req, env) {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const th = await hash(token);

  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.grade, u.role, u.active, u.avatar_data,
            s.expires_at
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

  return row;
}

const isOwner = u => u && u.role === "owner";

const canPublish = u =>
  u && ["owner", "admin", "editor"].includes(u.role);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";

    const cors = {
      "Access-Control-Allow-Origin":
        allowed === "*" ? "*" : allowed,
      "Vary": "Origin",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Setup-Key",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    };

    if (origin && allowed !== "*" && origin !== allowed) {
      return json({ error: "Origine non autorisée." }, 403, cors);
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

    try {
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

        // Prépare les tables d'authentification si elles sont absentes.
        await ensureAuthSchema(env);

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
        const expires = Date.now() + 12 * 60 * 60 * 1000;

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
        const avatarData = b.avatarData === null ? null : String(b.avatarData || "");
        if (avatarData !== null && (
          avatarData.length > 1500000 ||
          !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarData)
        )) {
          return json({ error: "Image invalide ou trop volumineuse (1 Mo maximum)." }, 400, cors);
        }
        await env.DB.prepare(
          "UPDATE users SET avatar_data = ? WHERE id = ?"
        ).bind(avatarData, user.id).run();
        return json({ ok: true, avatarData }, 200, cors);
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
          `SELECT id, username, grade, role, active, created_at
           FROM users ORDER BY created_at DESC`
        ).all();

        return json({ users: result.results || [] }, 200, cors);
      }

      if (route === "/users/create") {
        if (!isOwner(user)) {
          return json({ error: "Réservé au Owner." }, 403, cors);
        }

        const username = normUser(b.username);
        const password = String(b.password || "");
        const grade = String(b.grade || "").trim();
        const role = String(b.role || "editor");

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

        if (!["admin", "editor", "viewer"].includes(role)) {
          return json({ error: "Rôle non autorisé." }, 400, cors);
        }

        if (!grade || grade.length > 60) {
          return json({ error: "Grade invalide." }, 400, cors);
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

        await env.DB.prepare(
          "UPDATE users SET active = 0 WHERE id = ? AND role <> ?"
        ).bind(id, "owner").run();

        await env.DB.prepare(
          "DELETE FROM sessions WHERE user_id = ?"
        ).bind(id).run();

        return json({ ok: true }, 200, cors);
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

        contents[b.slug] = extracted;

        await write(
          env,
          "public/events-content.js",
          serializeContent(contents),
          `Contenu événement ${b.slug} (${user.username})`
        );

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

        await write(
          env,
          "public/events-data.js",
          serialize(list),
          `Portail : ${b.slug} (${user.username})`
        );

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

        await write(
          env,
          "public/events-data.js",
          serialize(b.list),
          `Portail mis à jour (${user.username})`
        );

        return json({ ok: true }, 200, cors);
      }

      return json({ error: "Route inconnue." }, 404, cors);
    } catch (e) {
      // Le détail reste dans les logs Cloudflare, pas dans la réponse HTTP.
      console.error("MRD Worker exception", {
        route,
        name: e?.name || "Error",
        message: e?.message || String(e),
        stack: e?.stack || null
      });

      return json(
        { error: "Erreur interne du serveur. Consulte les logs du Worker." },
        500,
        cors
      );
    }
  }
};
