# Portail MRD — architecture unifiée

Portail statique GitHub Pages : une seule page publique (`index.html`) présente tous les événements. Les fiches détaillées sont stockées dans `public/events-content.js`; les cartes et statuts sont dans `public/events-data.js`. Les anciens dossiers de pages événementielles ne font plus partie de cette architecture.

## Panel

Ouvrir `https://lspd-mrd.github.io/events/panel/`. Le panel permet de créer une fiche, gérer les cartes du portail et publier vers le dépôt via Cloudflare Worker. Les fiches historiques intégrées peuvent être ouvertes depuis l’onglet Portail et leurs blocs HTML sont conservés dans l’éditeur.

## Déploiement

1. Faire une branche ou une sauvegarde du dépôt avant remplacement.
2. Déployer le contenu de ce dossier à la racine du dépôt `LSPD-MRD/events` (ne pas créer un dossier `events/events`).
3. Vérifier que `WORKER_URL` dans `panel/panel.js` conserve l’URL de votre Worker actuel.
4. Le Worker doit utiliser la version `worker/worker.js` fournie avec cette archive si vous activez la publication centralisée. Il écrit désormais les fiches dans `public/events-content.js` et les cartes dans `public/events-data.js`.
5. Conserver les secrets et variables Cloudflare existants : `OWNER`, `REPO`, `BRANCH`, `ALLOWED_ORIGIN`, `GH_TOKEN`, `ACCESS_CODE`. Ne jamais placer `GH_TOKEN` dans les fichiers du site.
6. Tester `/ping`, puis publier une fiche de test avant de considérer la migration terminée.

## Fichiers clés

- `index.html` : portail public unifié
- `public/events-data.js` : cartes, statuts et slugs
- `public/events-content.js` : fiches événementielles intégrées
- `public/script.js` : filtres, navigation de fiche et thème
- `panel/` : administration et générateur
- `worker/worker.js` : relais sécurisé de publication GitHub

Les espaces Rédaction, Médias, Équipe et Archives sont affichés en WIP ; ils ne publient pas encore de contenu.
