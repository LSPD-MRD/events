# MRD Portal — Unified Edition

Portail événementiel et panel d’administration MRD pour GTA V FiveM RP. Les fiches événements sont intégrées dans le portail : plus de dossiers `cache-cache/`, `concert/`, `escape-game/` ou `open-house/` avec un `index.html` indépendant.

## Structure
- `index.html` : portail public unique
- `panel/` : panel d’administration / créateur d’événements
- `public/events-data.js` : cartes et statuts des événements
- `public/events-content.js` : contenu des fiches d’événements intégré au portail
- `public/script.js`, `public/app.css` : interface publique et thème clair/sombre
- `public/style.css` : styles des fiches événements
- `worker/worker.js` : Worker Cloudflare pour publication GitHub

## Déploiement
1. Sauvegarder le dépôt et les valeurs actuelles des secrets Cloudflare.
2. Copier les fichiers de ce dossier dans la racine du dépôt GitHub, sans recopier le dossier `.git`.
3. Déployer le Worker uniquement après validation du nouveau code dans un environnement de test : la route `/publish` écrit maintenant les fiches dans `public/events-content.js` au lieu de créer `<slug>/index.html` et `<slug>/event.json`.
4. Conserver les variables `OWNER`, `REPO`, `BRANCH`, `ALLOWED_ORIGIN`, `GH_TOKEN`, `ACCESS_CODE`. Vérifier que `ALLOWED_ORIGIN` correspond exactement à l’origine du panel.
5. Tester `/ping`, puis une publication de test avant de republier les événements réels.

## Important
Le panel utilise toujours le Worker configuré dans `panel/panel.js`. Les pages d’événements historiques ont été consolidées dans `public/events-content.js`. Si le dépôt contient d’autres événements non présents dans cette archive, il faut les importer avant de remplacer les données publiques.
