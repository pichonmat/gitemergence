# Émergence — Grist Custom Widget

Dépôt de sauvegarde pour le widget Grist custom qui remplace la fiche "Émergence" (gestion des demandes, acteurs, RIDA, pièces jointes) de l'équipe Émergence (Ministère de l'Intérieur / SDID).

## Structure

- `widget-emergence/widget-emergence.html` + `.js` — version courante du widget principal (dernière version livrée), à coller dans l'onglet HTML / JS du Custom Widget Builder de Grist.
- `widget-emergence/history/` — tout l'historique des versions livrées (`widget-emergence-vN.html/.js`), conservé pour pouvoir revenir en arrière si besoin.
- `export-modele-donnees/export-modele-donnees.html` + `.js` — petit widget utilitaire séparé qui exporte le schéma du document Grist (tables/colonnes sélectionnées) en Markdown, pour documenter le modèle de données et nourrir les prompts IA.
- `export-modele-donnees/history/` — historique de ce widget utilitaire.
- `docs/grist-custom-widget-guide.md` — guide de référence sur l'API Custom Widget de Grist (pièges rencontrés, conventions retenues) : à utiliser avec un assistant IA pour reprendre le développement du widget.
- `docs/modele-donnees-grist.md` — export du modèle de données (tables `Emergence`, `Emergence_Acteurs`, `Emergence_PJ`, `Emergence_Rida`) généré avec `export-modele-donnees`.

## Utilisation

1. Dans Grist, ouvrir le Custom Widget Builder sur la vue concernée.
2. Coller le contenu de `widget-emergence/widget-emergence.html` dans l'onglet HTML et `widget-emergence/widget-emergence.js` dans l'onglet JS.
3. Donner l'accès `full` au widget lorsque Grist le demande (nécessaire pour lire/écrire les tables liées : Acteurs, PJ, RIDA).

Pour reprendre le développement avec une IA : fournir `docs/grist-custom-widget-guide.md` + `docs/modele-donnees-grist.md` en contexte, en plus de la dernière version du widget.
