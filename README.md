# MRD Portal — portail unifié

Le portail public et le panel utilisent la même direction artistique (Inter + Rajdhani, surfaces bleu ardoise, accent or, mode clair/sombre). Les anciennes fiches sont intégrées dans `public/events-content.js` et s'ouvrent dans la page centrale. Les anciens dossiers de pages indépendantes ne sont plus requis.

## Architecture

- `index.html` : portail public unique.
- `public/events-data.js` : liste des cartes et leur statut.
- `public/events-content.js` : contenu HTML intégré des fiches historiques.
- `public/app.css` et `public/script.js` : interface publique unifiée.
- `panel/` : éditeur, aperçu, connexion et gestion des comptes réservée au Owner.
- `worker/worker.js` : API Cloudflare Worker, auth et publication vers GitHub.
- `worker/schema.sql` : schéma Cloudflare D1.

## Rôles

- **Owner** : seul rôle autorisé à lister, créer et désactiver les comptes. Le Owner ne peut pas être désactivé depuis le panel.
- **Admin** : peut publier et modifier le portail, mais ne peut pas gérer les comptes.
- **Editor** : peut créer/publier des événements et modifier la liste du portail.
- **Viewer** : consultation sans publication.

Les mots de passe sont hachés côté Worker avec PBKDF2-SHA-256 (150 000 itérations) et un sel aléatoire. Le navigateur ne conserve le jeton de session que dans `sessionStorage`; le Worker stocke uniquement son SHA-256 dans D1. Les sessions expirent après 12 heures. Les tentatives de connexion échouées sont temporairement limitées par identifiant.

## Déploiement Cloudflare (base gratuite D1)

### 1. Créer la base

Dans Cloudflare Dashboard → **Workers & Pages → D1 SQL Database**, crée une base, par exemple `mrd-accounts`. Ouvre son éditeur SQL et exécute tout le contenu de `worker/schema.sql`.

### 2. Lier D1 au Worker

Dans les paramètres du Worker `mrd-panel` → **Settings → Bindings → Add → D1 database**, crée le binding nommé exactement `DB` et sélectionne `mrd-accounts`.

### 3. Variables et secrets Worker

Conserve le token GitHub existant si ses permissions sont suffisantes. Configure les variables/secrets suivants dans **Settings → Variables and Secrets** :

- `OWNER` : `LSPD-MRD`
- `REPO` : `events`
- `BRANCH` : `main` (ou la branche réellement utilisée)
- `ALLOWED_ORIGIN` : l'origine exacte du portail, sans chemin. Exemple de forme : `https://lspd-mrd.github.io`. Utilise l'origine réelle affichée dans ton navigateur, pas cet exemple si elle diffère.
- `GH_TOKEN` : **secret**, token GitHub autorisé à lire et modifier le contenu du dépôt.
- `OWNER_SETUP_KEY` : **secret temporaire**, une longue valeur aléatoire à usage unique pour créer le compte Owner.

`ACCESS_CODE` n'est plus utilisé par cette version. Ne place jamais le token GitHub, le secret de configuration ou les mots de passe dans les fichiers du dépôt.

### 4. Déployer le Worker

Sauvegarde d'abord le code Worker actuel, puis déploie `worker/worker.js` sur le Worker de test. Une fois les tests passés, déploie-le sur l'URL Worker configurée dans `panel/panel.js`. L'URL actuelle par défaut est `https://mrd-panel.biscuitytb2102.workers.dev`.

### 5. Créer le premier compte Owner

Après avoir déployé le Worker et configuré D1, envoie une requête POST à `https://TON-WORKER.workers.dev/auth/setup-owner` avec le header `X-Setup-Key: VALEUR_DE_OWNER_SETUP_KEY` et un JSON de ce type :

```json
{
  "username": "ton-identifiant",
  "password": "une-phrase-de-passe-unique-de-14-caracteres-minimum",
  "grade": "Owner · Commanding Officer"
}
```

Exemple avec `curl` (remplace toutes les valeurs; n'enregistre pas ces valeurs dans un dépôt public) :

```bash
curl -X POST "https://TON-WORKER.workers.dev/auth/setup-owner"   -H "Content-Type: application/json"   -H "X-Setup-Key: TA_CLE_DE_CONFIGURATION"   --data '{"username":"ton-identifiant","password":"REMPLACE_PAR_UNE_PHRASE_DE_PASSE_LONGUE","grade":"Owner · Commanding Officer"}'
```

Le compte Owner ne peut être créé que si aucun Owner n'existe déjà. Une fois créé, retire `OWNER_SETUP_KEY` des secrets Worker (ou remplace-le par une nouvelle valeur forte). La route de configuration est aussi verrouillée côté serveur dès qu'un Owner existe.

### 6. Publier le site

Le site public reste hébergé sur GitHub Pages : pousse les fichiers du dépôt mis à jour sur la branche configurée. Vérifie l'URL réelle du portail et ajuste `ALLOWED_ORIGIN` à cette origine exacte. Les mises à jour du site public sont déployées par GitHub Pages; le Worker écrit les fichiers `public/events-data.js` et `public/events-content.js` dans le dépôt.

## Ordre de migration conseillé

1. Créer une branche GitHub de test et sauvegarder l'ancien Worker.
2. Créer D1 et exécuter `worker/schema.sql`.
3. Déployer le Worker avec les bindings et secrets requis.
4. Créer le compte Owner via `/auth/setup-owner`, puis retirer le secret temporaire.
5. Se connecter au panel et créer un compte test de rôle `editor` et un de rôle `viewer`.
6. Tester `/ping`, une publication de test et l'affichage de la fiche sur le portail.
7. Fusionner dans `main` uniquement après vérification.

## Important

- Le Worker d'authentification requiert le binding D1 `DB`. Sans lui, les routes renvoient une erreur explicite.
- Les sections Rédaction, Médias et Archives sont toujours WIP.
- Les permissions sont vérifiées côté Worker; masquer un bouton dans l'interface ne constitue pas une protection à lui seul.
- Pour un usage public, ajoute aussi une règle de limitation de débit Cloudflare sur `/auth/login` et surveille les journaux Worker.
- Tester la publication dans une branche dédiée avant d'autoriser l'écriture dans `main`.
