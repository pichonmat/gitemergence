# Guide — Widgets custom Grist (HTML/JS) pour génération assistée par IA

Ce document est un guide de référence technique sur les widgets custom Grist,
à fournir à une IA (avec le fichier `modele-donnees-grist.md` généré par
l'outil d'export) pour produire directement du code HTML/JS fonctionnel,
sans redécouvrir par essais-erreurs les pièges décrits ci-dessous.

---

## 1. Anatomie d'un widget custom Grist

Un widget custom Grist ("Custom Widget Builder") se compose de **deux zones
de code**, éditées séparément dans l'interface Grist :

- **Onglet HTML** : la structure de la page (balises, `<style>` inline). Pas
  de `<html>`/`<head>`/`<body>` à écrire — juste le contenu.
- **Onglet JavaScript** : toute la logique, en JS vanilla (pas de module,
  pas de bundler, pas de framework). La librairie `grist-plugin-api.js` est
  déjà chargée automatiquement par l'environnement.

Il n'y a **aucun accès réseau externe** dans ce widget (sauf vers l'API
Grist elle-même) : pas de CDN, pas de `fetch()` vers un tiers.

---

## 2. Initialisation : `grist.ready()`

Toujours en premier dans le JS :

```javascript
grist.ready({ requiredAccess: 'full' });
```

Niveaux d'accès (`requiredAccess`) :

- `'none'` : aucune donnée. Inutile pour un widget de données.
- `'read table'` : lecture seule, **mais uniquement sur la table liée au
  widget** (celle sélectionnée dans le panneau Grist). Un `fetchTable()`
  sur une **autre** table échoue avec `Access not granted`.
- `'full'` : lecture/écriture sur **toutes** les tables du document, plus
  accès aux tables système (`_grist_Tables`, etc.). **C'est le niveau à
  utiliser dès qu'on doit faire une jointure vers une autre table (acteurs,
  pièces jointes, sous-tables liées) ou écrire des données.** Grist demande
  une confirmation utilisateur à la première utilisation.

---

## 3. Lecture des données — piège critique

Il y a **deux façons de lire les données**, qui ne renvoient PAS le même
format pour les colonnes de type Référence / Liste de références :

### 3.1 `grist.onRecords(callback)` / `grist.onRecord(callback)`

Ces callbacks se déclenchent automatiquement sur la table liée au widget.
**Sans déclaration explicite de `columns` typées dans `grist.ready()`**,
les colonnes de type Référence ou Liste de références sont renvoyées
**déjà formatées en texte d'affichage** (ex. `"Jean Dupont (SDID)"`), pas
en identifiants bruts. C'est utile pour un affichage simple, mais
**inutilisable pour résoudre soi-même une jointure ou pour écrire une
modification** (on n'a plus l'id de la ligne référencée).

```javascript
grist.onRecords(function (records) {
  // records[i].MaColonneRef est une STRING formatée, pas un id.
});
```

### 3.2 `grist.docApi.fetchTable(nomDeTable)`

Renvoie les données **brutes**, colonne par colonne (format "columnar") :

```javascript
const table = await grist.docApi.fetchTable("Emergence");
// table.id -> [1, 2, 3, ...]
// table.MaColonneRef -> [12, null, 45, ...]  (ids bruts, ou objet RefList)
```

**C'est la méthode à privilégier systématiquement**, y compris pour la
table principale liée au widget, dès qu'on doit :
- résoudre une référence vers une autre table,
- éditer un champ,
- trier/filtrer sur une valeur résolue plutôt que sur du texte déjà formaté.

Fonction utilitaire standard pour convertir le format columnar en tableau
de lignes objet :

```javascript
function tableVersLignes(table) {
  const lignes = [];
  const ids = table.id || [];
  for (let i = 0; i < ids.length; i++) {
    const ligne = { id: ids[i] };
    for (const cle in table) {
      if (cle === "id") continue;
      ligne[cle] = table[cle][i];
    }
    lignes.push(ligne);
  }
  return lignes;
}
```

`grist.onRecords()` peut néanmoins être conservé comme **simple signal de
changement** (sans utiliser son contenu), pour déclencher un rechargement
via `fetchTable()` et garder le widget "lié" au système de sélection/curseur
de Grist (nécessaire pour `grist.setCursorPos()`) :

```javascript
grist.onRecords(async function () {
  await chargerTablePrincipale(); // relit via fetchTable
  afficherListe();
});
grist.onRecord(record => {}); // conservé même vide : maintient la liaison
```

---

## 4. Format brut des colonnes Référence / Liste de références

Avec `fetchTable()` :

- **Référence simple** (`Ref:NomTable`) : un entier (l'id de la ligne
  référencée), ou `0`/`null` si vide.
- **Liste de références** (`RefList:NomTable`) : soit un tableau
  `["L", id1, id2, ...]` (avec le marqueur `"L"` en première position),
  soit directement un tableau d'ids selon le contexte. Toujours normaliser
  avec une fonction défensive :

```javascript
function refListVersIds(valeur) {
  if (!valeur) return [];
  if (Array.isArray(valeur)) {
    return valeur[0] === "L" ? valeur.slice(1) : valeur;
  }
  return [valeur]; // référence simple : on l'enveloppe dans un tableau
}
```

**Ne jamais supposer qu'un champ est une Référence sans vérifier son type
réel dans le modèle de données** (voir fichier `modele-donnees-grist.md`).
Deux champs au nom proche peuvent être de nature différente : par exemple
un champ "Porteurs" peut être une **Référence** dans une table et un
simple **Choix unique** (texte) dans une autre — les traiter de la même
façon casse l'affichage silencieusement (aucune erreur, juste un champ vide
ou incorrect).

---

## 5. Résoudre une référence (jointure manuelle)

Charger la table cible une fois, construire un dictionnaire id → objet :

```javascript
let acteursParId = {};

async function chargerActeurs() {
  const acteurs = await grist.docApi.fetchTable("Emergence_Acteurs");
  acteursParId = {};
  const ids = acteurs.id || [];
  for (let i = 0; i < ids.length; i++) {
    acteursParId[ids[i]] = {
      Nom_et_Prenom: acteurs.Nom_et_Prenom[i],
      Organisation_Path: acteurs.Organisation_Path[i]
    };
  }
}
```

Puis résoudre à l'affichage :

```javascript
function nomActeur(idOuListeIds) {
  const ids = refListVersIds(idOuListeIds);
  return ids.map(id => (acteursParId[id] || {}).Nom_et_Prenom || "").filter(Boolean).join(", ");
}
```

---

## 6. Écrire des données : `applyUserActions`

Toutes les écritures passent par `grist.docApi.applyUserActions([...])`,
qui prend un tableau d'actions Grist natives :

```javascript
// Modifier un ou plusieurs champs d'une ligne existante
await grist.docApi.applyUserActions([
  ["UpdateRecord", "NomDeLaTable", idDeLaLigne, { Champ1: "valeur", Champ2: 42 }]
]);

// Ajouter une ligne (id auto, ou null pour laisser Grist l'attribuer)
await grist.docApi.applyUserActions([
  ["AddRecord", "NomDeLaTable", null, { ChampReference: idLigneParente }]
]);

// Supprimer une ligne
await grist.docApi.applyUserActions([
  ["RemoveRecord", "NomDeLaTable", idDeLaLigne]
]);

// Ajout en masse (ex. génération de N lignes)
await grist.docApi.applyUserActions([
  ["BulkAddRecord", "NomDeLaTable", Array(n).fill(null), { Champ: valeursTableauDeLongueurN }]
]);

// Suppression en masse
await grist.docApi.applyUserActions([
  ["BulkRemoveRecord", "NomDeLaTable", tableauIdsASupprimer]
]);
```

**Pour écrire une Liste de références**, utiliser le même format que la
lecture, avec le marqueur `"L"` :

```javascript
await grist.docApi.applyUserActions([
  ["UpdateRecord", "Emergence", ligneId, {
    Parties_prenantes_concernees: ["L", id1, id2, id3]
  }]
]);
```

**Toujours envelopper dans un `try/catch`** et afficher un message d'erreur
à l'utilisateur (`err.message`) plutôt que de laisser échouer silencieusement.

**Après une écriture réussie**, recharger les données concernées via
`fetchTable()` et redessiner l'UI, plutôt que de modifier l'état local à la
main (évite les désynchronisations).

---

## 7. Dates

Une colonne **Date** ou **Date & Heure** est renvoyée par `fetchTable()`
comme un **timestamp Unix en secondes** (nombre), pas en millisecondes.

Conversion vers `<input type="date">` (format `AAAA-MM-JJ`), **en UTC**
pour éviter les décalages de fuseau horaire liés à l'heure locale du
navigateur :

```javascript
function dateEpochVersInput(valeur) {
  if (!valeur || typeof valeur !== "number") return "";
  const d = new Date(valeur * 1000);
  const aaaa = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const jj = String(d.getUTCDate()).padStart(2, "0");
  return aaaa + "-" + mm + "-" + jj;
}

function inputVersDateEpoch(valeurInput) {
  if (!valeurInput) return null;
  const [aaaa, mm, jj] = valeurInput.split("-").map(Number);
  return Math.floor(Date.UTC(aaaa, mm - 1, jj) / 1000);
}
```

Pour un affichage simple en lecture (format `JJ-MM-AAAA`), une conversion
en heure locale suffit généralement.

---

## 8. Colonnes Choix (Choice / ChoiceList)

Une colonne **Choix unique** renvoie directement une chaîne de texte (la
valeur choisie), sans jointure à faire. Une colonne **Choix multiple**
renvoie un tableau de chaînes.

Les valeurs possibles configurées dans Grist (`widgetOptions.choices`) ne
sont **pas directement accessibles en écriture normale** — seule la table
système `_grist_Tables_column` les expose (voir section 11, export du
modèle de données). En pratique, pour peupler un `<select>` d'édition, on
peut :
- soit lire cette liste depuis le modèle de données exporté et la coder en
  dur dans le widget,
- soit construire dynamiquement les options à partir des valeurs déjà
  utilisées dans les lignes existantes (solution de repli si le modèle de
  données n'est pas disponible, mais n'expose pas les choix jamais encore
  utilisés).

---

## 9. Environnement d'exécution : contraintes de l'iframe

Le widget tourne dans un **iframe sandboxé**. Cela impose plusieurs
contraintes non documentées ailleurs :

### 9.1 Navigation de haut niveau bloquée

Un lien `<a href="..." target="_blank">` ou `target="_top"` vers une page
externe authentifiée (ex. une autre page du même Grist) peut être bloqué
par la protection anti-clickjacking de la page cible (erreur Firefox/Chrome
"ne permettra pas à cette page de s'afficher si elle est intégrée"). **Un
clic droit → "Ouvrir dans un nouvel onglet" ou Ctrl+clic fonctionne**
généralement (navigation initiée par le navigateur, pas par le JS de
la page). Il n'existe pas de solution garantissant un clic simple
fonctionnel dans ce contexte.

### 9.2 Téléchargement de fichier généré : ça fonctionne

Générer un fichier côté client et déclencher son téléchargement via un
`Blob` + `<a download>` fonctionne normalement dans l'iframe (ce n'est pas
une navigation de haut niveau) :

```javascript
function telechargerFichier(contenu, nomFichier, type) {
  const blob = new Blob([contenu], { type: type || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### 9.3 Glisser-déposer (drag) : utiliser les Pointer Events avec capture

Pour une interaction de type "glisser pour redimensionner", les événements
`mousemove`/`mouseup` classiques attachés à `document` peuvent se
désynchroniser dans l'iframe (le mouvement s'arrête de suivre la souris).
**Utiliser les Pointer Events avec `setPointerCapture`**, qui garantissent
la réception continue des événements sur l'élément cible :

```javascript
element.addEventListener("pointerdown", (e) => {
  element.setPointerCapture(e.pointerId);
  // écouteurs "pointermove"/"pointerup" attachés à `element` lui-même,
  // pas à `document`
});
```

### 9.4 `table-layout: fixed` + `<colgroup>` : peu fiable

Piloter la largeur des colonnes d'un tableau via `<colgroup><col
style="width:...">` peut ne pas se répercuter visuellement dans ce contexte
de rendu, même en modifiant `col.style.width` en JS. **Solution robuste** :
appliquer la largeur directement sur chaque `<th>` **et** chaque `<td>`
correspondant (via `width`/`min-width`/`max-width` ensemble), en la
réappliquant après chaque redessin du tableau :

```javascript
function appliquerLargeursColonnes() {
  document.querySelectorAll("thead th").forEach(th => {
    const largeur = largeursColonnes[th.dataset.col];
    if (largeur) {
      th.style.width = th.style.minWidth = th.style.maxWidth = largeur + "px";
    }
  });
  // même chose sur chaque <td> du <tbody>, colonne par colonne
}
```

---

## 10. Conventions de structure utilisées dans nos widgets

- **Noms de variables et fonctions en français**, cohérents avec le métier
  (ex. `lignesEmergence`, `afficherFiche`, `chargerTablesAnnexes`).
- **Échappement HTML systématique** des valeurs affichées dans du HTML
  généré dynamiquement :

```javascript
function escapeHtml(valeur) {
  return String(valeur == null ? "" : valeur)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- **Mini-conversion Markdown → HTML** maison (pas de librairie externe
  disponible) pour les champs texte enrichi : gère `**gras**`, `*italique*`,
  `[lien](url)`, listes à puces `- item`, titres `### Titre` (rendus en
  gras souligné), retours à la ligne.
- **Onglets internes gérés en JS pur** (classes CSS `.active` togglées au
  clic), pas besoin du bricolage "boutons radio cachés" utilisé dans les
  formules Grist classiques (ici on a du vrai JS exécutable).
- **État "onglet actif" conservé dans une variable globale** pour survivre
  au redessin complet de la fiche lors d'un changement de sélection.
- **Un message de statut par action** (`msg-sauvegarde`, avec classe
  `.erreur` si échec), à côté de chaque bouton d'action, plutôt qu'une
  alerte globale.
- **Confirmation navigateur (`confirm()`)** avant toute suppression.

---

## 11. Utiliser ce guide avec le modèle de données exporté

Un widget dédié (voir `export-modele-donnees.html`/`.js` fourni séparément)
génère un fichier `modele-donnees-grist.md` à partir des tables système
`_grist_Tables` et `_grist_Tables_column`. Il liste, pour chaque table :
colonnes, libellés, types exacts, formules, choix configurés, et tables
cibles des références.

**Prompt type à utiliser avec une IA**, en fournissant ce guide + le fichier
de modèle de données généré :

> Voici un guide technique sur les widgets custom Grist (contraintes,
> pièges, conventions) et le modèle de données complet de mon document
> Grist. Écris-moi un widget custom (HTML + JS) qui [décrire le besoin],
> en respectant strictement les types de colonnes indiqués dans le modèle
> de données (ne pas supposer qu'un champ est une référence sans le
> vérifier dans le modèle).

Cela évite les principales sources d'erreurs rencontrées en pratique :
mauvaise supposition sur le type d'un champ (Choix vs Référence),
mauvais nom de colonne technique, et tentative d'utiliser un pattern
incompatible avec l'environnement sandboxé du widget.
