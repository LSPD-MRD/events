# Portail évènementiel MRD

Site statique (GitHub Pages). Les pages d'événements sont générées depuis `panel/`.

## Installation chez soi

1. Forker ou copier ce dépôt sur son compte GitHub.
2. Settings > Pages : branche `main`, dossier `/ (root)`.
3. Créer un token : Settings > Developer settings > Personal access tokens > Fine-grained tokens, limité à ce dépôt, permission Contents : Read and write.
4. Ouvrir `https://<compte>.github.io/<depot>/panel/`, onglet GitHub : compte, dépôt, branche et token se remplissent, puis Enregistrer et Tester.
5. Onglet Éditeur : remplir, vérifier l'aperçu, Publier.

## Sans token

Télécharger `index.html`, le placer dans `<slug>/`, puis coller l'entrée copiée dans `public/events-data.js`.

## Syntaxe des blocs

Voir l'indication sous le champ Contenu de chaque section. `**texte**` met en doré, `!!texte!!` en rouge.
