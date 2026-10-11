# Portail évènementiel MRD

Site statique (GitHub Pages). Les pages d'événements se créent depuis `panel/`.

## Utiliser le panel

1. Ouvrir `https://lspd-mrd.github.io/events/panel/`.
2. Onglet Accès : saisir le code fourni par la MRD et un pseudo, Enregistrer.
3. Onglet Éditeur : remplir, vérifier l'aperçu, Publier. La page est en ligne en environ une minute.

## Installation (une seule fois, administrateur)

1. Créer un token GitHub fine-grained limité au dépôt, permission Contents : Read and write.
2. Cloudflare Workers : créer un Worker, y coller `worker/worker.js`.
3. Variables texte : OWNER, REPO, BRANCH, ALLOWED_ORIGIN (ex. `https://lspd-mrd.github.io`). Secrets : GH_TOKEN, ACCESS_CODE.
4. Renseigner l'URL du Worker dans `const WORKER_URL` de `panel/index.html`, puis commit et push.

Changer ACCESS_CODE révoque l'accès de tout le monde.
