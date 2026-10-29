const blank = () => ({
  slug: '',
  meta: {
    title: '',
    badge: 'Mission Row Police Department · MRD Event',
    date: '',
    divider: '★ RÈGLEMENT ★',
    pageTitle: '',
    logo: '../public/Logo MRD V2.png',
    fl: 'Sergeant Andrea BIANCHI · Commanding Officer MRD',
    fr: 'LSPD · MRPD',
  },
  card: { status: 'soon', icon: '🎉', title: '', desc: '', date: '' },
  sections: [],
});
const newSec = (type) => ({
  type,
  icon: '📋',
  title: 'Nouvelle section',
  body: '',
  lead: '',
  note: '',
  box: '',
  italic: false,
  variant: false,
});

const SAMPLE = {
  slug: 'hide-and-seek',
  meta: { title: 'Hide & Seek\nMRPD', date: '📅 03 juin 2026 · 21h15 (après RC)' },
  card: {
    status: 'live',
    icon: '🔦',
    desc: 'Cache-cache en 3 rounds dans le poste Mission Row.',
    date: 'Mercredi 03/06/26',
  },
  sections: [
    {
      type: 'text',
      icon: '📋',
      title: 'Présentation',
      body: 'Cache-cache organisé par la **Media Relations Division**, en **3 rounds**.',
      lead: '',
      note: '',
      box: '',
      italic: false,
      variant: false,
    },
    {
      type: 'list',
      icon: '🚫',
      title: 'Zones Interdites',
      body: "Se cacher !!à l'air libre!!\nSe cacher !!dans les escaliers!!",
      lead: '',
      note: '⚠️ Cachette invalide = élimination du round.',
      box: '',
      italic: false,
      variant: true,
    },
    {
      type: 'cards',
      icon: '🗺️',
      title: 'Les 3 Rounds',
      body: '🔦 | ROUND 1 | Sous-sol et parking | -1\n🚪 | ROUND 2 | Rez-de-chaussée | 0\n🏢 | ROUND 3 | Premier étage | 1',
      lead: '',
      note: '',
      box: '',
      italic: false,
      variant: false,
    },
    {
      type: 'list',
      icon: '📊',
      title: 'Notation',
      body: 'Un classement par **round**\nClassement final = **moyenne des 3 rounds**',
      lead: '',
      note: '',
      box: '🧮 | Score final = **(R1 + R2 + R3) ÷ 3**',
      italic: false,
      variant: false,
    },
    {
      type: 'prizes',
      icon: '💰',
      title: 'Classement - Top 3',
      body: '🥇 | 1ère place | À définir\n🥈 | 2ème place | À définir\n🥉 | 3ème place | À définir',
      lead: '',
      note: '',
      box: '',
      italic: false,
      variant: false,
    },
  ],
};

const TYPES = {
  text: {
    label: 'Texte',
    hint: 'Paragraphes séparés par une ligne vide. **doré** et !!rouge!! disponibles.',
  },
  list: { label: 'Liste', hint: 'Un point par ligne. **doré** et !!rouge!! disponibles.' },
  cards: { label: 'Cartes', hint: 'emoji | tag | libellé | gros texte (optionnel)' },
  info: { label: 'Infos', hint: 'titre | valeur' },
  timeline: { label: 'Planning', hint: 'horaire | activité | responsable' },
  roles: { label: 'Colonnes', hint: 'Titre puis un point par ligne. Colonnes séparées par ---' },
  choices: {
    label: 'Choix',
    hint: 'emoji | texte | wait (bleu) ou hunt (doré). Sans emoji : texte seul.',
  },
  prizes: { label: 'Podium', hint: 'emoji | rang | gain | gold, silver ou bronze' },
  stands: {
    label: 'Stands',
    hint: 'Nom, puis : jeu | description, ★ bonus | description, score: barème. Stands séparés par ---',
  },
  html: {
    label: 'HTML libre',
    hint: 'HTML inséré tel quel dans la section. Les scripts sont refusés.',
  },
};
const STATUS = { live: 'Actif', soon: 'À venir', archived: 'Archivé' };
const PREVIEW_HOOK =
  '<script>addEventListener("scroll",()=>parent.postMessage(scrollY,"*"));addEventListener("message",e=>scrollTo(0,e.data))<\/script>';

let ev,
  list = [],
  portalSettingsLoaded = false,
  portalSettings = {
    order: ['events', 'documents', 'news'],
    visible: { events: true, news: false, documents: true },
    categories: [
      {
        id: 'events',
        name: 'Événements',
        type: 'events',
        description: 'Fiches et cartes des événements',
      },
      {
        id: 'news',
        name: 'News & actualités',
        type: 'publications',
        description: 'Actualités et communiqués',
      },
      {
        id: 'documents',
        name: 'Communication interne',
        type: 'publications',
        description: 'Documents et communications officielles',
      },
    ],
  },
  slugTouched = false,
  lastScroll = 0,
  previewTimer,
  draftTimer,
  previewPreference = true;
const PORTAL_CATEGORIES = {
  events: 'Événements',
  news: 'News & actualités',
  documents: 'Communication interne',
};
const BUILTIN_PORTAL_CATEGORIES = [
  {
    id: 'events',
    name: 'Événements',
    type: 'events',
    description: 'Fiches et cartes des événements',
  },
  {
    id: 'news',
    name: 'News & actualités',
    type: 'publications',
    description: 'Actualités et communiqués',
  },
  {
    id: 'documents',
    name: 'Communication interne',
    type: 'publications',
    description: 'Documents et communications officielles',
  },
];
const canManagePortalCategories = (user) =>
  !!user &&
  ((user.role === 'owner' && user.grade === 'Commanding Officer') ||
    (user.role === 'admin' && user.grade === 'Assistant Commanding Officer'));
const validPortalCategoryId = (id) =>
  ['events', 'news', 'documents'].includes(id) ||
  (typeof id === 'string' && /^custom-[a-z0-9-]{1,64}$/.test(id));
const loadPortalSettings = async () => {
  if (portalSettingsLoaded) return;
  const response = await fetch('../public/portal-settings.js', { cache: 'no-store' });
  if (!response.ok)
    throw new Error('Impossible de lire les paramètres du portail (' + response.status + ').');
  const source = await response.text();
  const start = source.indexOf('{'),
    end = source.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Format des paramètres du portail invalide.');
  const value = JSON.parse(source.slice(start, end + 1));
  const incoming = Array.isArray(value.categories) ? value.categories : BUILTIN_PORTAL_CATEGORIES;
  const categories = incoming
    .filter(
      (c) =>
        c &&
        validPortalCategoryId(c.id) &&
        typeof c.name === 'string' &&
        c.name.trim() &&
        (c.id === 'events' ? c.type === 'events' : c.type === 'publications'),
    )
    .map((c) => ({
      id: c.id,
      name: c.name.trim().slice(0, 48),
      type: c.id === 'events' ? 'events' : 'publications',
      description: String(c.description || '')
        .trim()
        .slice(0, 100),
    }));
  if (!Array.isArray(value.categories))
    for (const builtin of BUILTIN_PORTAL_CATEGORIES)
      if (!categories.some((c) => c.id === builtin.id)) categories.push({ ...builtin });
  const ids = categories.map((c) => c.id);
  const order = Array.isArray(value.order)
    ? value.order.filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i)
    : [];
  const visible = Object.fromEntries(
    categories.map((c) => [
      c.id,
      typeof value.visible?.[c.id] === 'boolean' ? value.visible[c.id] : c.id !== 'news',
    ]),
  );
  portalSettings = {
    order: [...order, ...ids.filter((id) => !order.includes(id))],
    visible,
    categories,
  };
  Object.assign(PORTAL_CATEGORIES, Object.fromEntries(categories.map((c) => [c.id, c.name])));
  portalSettingsLoaded = true;
};

const api = {
  cfg() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY.access) || '{}');
      return { url: String(saved.url || WORKER_URL).replace(/\/$/, '') };
    } catch {
      return { url: WORKER_URL };
    }
  },

  async post(path, body = {}) {
    const token = sessionStorage.getItem(KEY.token);

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }

    let response;

    try {
      response = await fetch(api.cfg().url.replace(/\/$/, '') + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(
        'Échec de connexion au Worker. Vérifie le CORS et la disponibilité du serveur.',
      );
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && isSessionExpiredError(data.error)) {
        clearLocalSession('Ta session a expiré. Reconnecte-toi.');
      }

      throw new Error(response.status + ' · ' + (data.error || 'Erreur inconnue du serveur'));
    }

    return data;
  },
};

const avatarDataCache = new Map();
const avatarRequestQueue = new Map();
let avatarBatchScheduled = false;
