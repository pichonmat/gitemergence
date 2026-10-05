// Widget Emergence — v52
// --- Configuration ---
const GRIST_BASE_URL = "https://grist.numerique.gouv.fr";
const DOC_ID = "qXWzdtyGgNh2T64Ti1SQfc";
const TABLE_PRINCIPALE = "Emergence";
const TABLE_ACTEURS = "Emergence_Acteurs";
const TABLE_PJ = "Emergence_PJ";
const TABLE_RIDA = "Emergence_Rida";

// Colonne "Date de modification" de la table RIDA (DateTime, epoch en secondes). Horodatée par le
// widget à chaque écriture sur une ligne RIDA ; créée automatiquement dans Grist si absente.
const COLONNE_DATE_MODIF_RIDA = "Date_de_modification";
let colonneDateModifRidaDisponible = false;

// Point d'entrée unique pour toute écriture vers Grist : si l'action ajoute/modifie une ligne
// RIDA, on y joint la date/heure de modification (sans effet si la colonne n'existe pas).
function horodaterActionsRida(actions) {
  if (!colonneDateModifRidaDisponible) return actions;
  const maintenant = Math.floor(Date.now() / 1000);
  actions.forEach(a => {
    if (Array.isArray(a) && a[1] === TABLE_RIDA && (a[0] === "AddRecord" || a[0] === "UpdateRecord") && a[3] && typeof a[3] === "object") {
      a[3][COLONNE_DATE_MODIF_RIDA] = maintenant;
    }
  });
  return actions;
}

function appliquerActions(actions) {
  return grist.docApi.applyUserActions(horodaterActionsRida(actions));
}

const COULEURS_STATUT = {
  "0-Nouveau":      { fond: "#fff8dc", texte: "#8a6d00" },
  "1- En cours":    { fond: "#dbeafe", texte: "#1e40af" },
  "2- En attente":  { fond: "#fde8d6", texte: "#9a4a00" },
  "3- Clôturé":     { fond: "#e5e7eb", texte: "#374151" },
  "4- Transféré":   { fond: "#f3e8ff", texte: "#6b21a8" },
  "5- A qualifier": { fond: "#fee2e2", texte: "#991b1b" }
};

// Choix possibles pour Priorité (colonne Choice)
const CHOIX_PRIORITE = ["P1 - HAUTE", "P2- MOYENNE", "P3- BASSE"];

// Choix possibles pour Typologie de la demande (colonne Choice)
const CHOIX_TYPOLOGIE = [
  "0 - Autre",
  "1 - Hébergement N8N",
  "2 - Accès MIRAI API",
  "3 - Rag",
  "4 - Grist",
  "5 - Accompagnement adoption",
  "6 - Synthèse, analyse et reporting",
  "7 - Instruction des dossiers",
  "8 - Synthèse, analyse et reporting",
  "9 - Priorisation / traitement des mails"
];

let largeursColonnes = {
  "Statut": 110,
  "Date_de_soumission": 100,
  "Organisation": 110,
  "Sponsor": 130,
  "Porteurs": 130,
  "Titre": 230,
  "Typologie_de_la_demande": 150,
  "Parties_prenantes_concernees": 200,
  "Action_ouverte": 110
};

const ORDRE_COLONNES = [
  "Statut", "Date_de_soumission", "Organisation", "Sponsor", "Porteurs",
  "Titre", "Typologie_de_la_demande", "Parties_prenantes_concernees", "Action_ouverte"
];

const LIBELLES_COLONNES = {
  "Statut": "Statut",
  "Date_de_soumission": "Date de soumission",
  "Organisation": "Organisation",
  "Sponsor": "Sponsor",
  "Porteurs": "Porteur",
  "Titre": "Titre",
  "Typologie_de_la_demande": "Typologie de la demande",
  "Parties_prenantes_concernees": "Parties prenantes",
  "Action_ouverte": "RIDA"
};

// Mémorisation du choix de colonnes affichées (localStorage, par navigateur/poste — pas
// partagé entre utilisateurs ni entre postes). On stocke la liste des colonnes MASQUÉES
// (plutôt que celle des colonnes visibles) pour qu'une colonne ajoutée plus tard dans une
// future version du widget soit affichée par défaut sans migration à prévoir.
const CLE_STOCKAGE_COLONNES_MASQUEES = "emergence_colonnes_masquees";

function chargerColonnesMasqueesDepuisStockage() {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE_COLONNES_MASQUEES);
    if (!brut) return [];
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    return liste.filter(c => ORDRE_COLONNES.includes(c));
  } catch (e) {
    return []; // stockage indisponible (navigation privée, quota, etc.) : tout reste visible
  }
}

function sauvegarderColonnesMasqueesDansStockage() {
  try {
    const masquees = ORDRE_COLONNES.filter(c => !colonnesVisibles.has(c));
    window.localStorage.setItem(CLE_STOCKAGE_COLONNES_MASQUEES, JSON.stringify(masquees));
  } catch (e) {
    // stockage indisponible : le choix reste actif pour la session en cours, mais ne sera
    // pas retrouvé à la prochaine ouverture.
  }
}

// Colonnes actuellement affichées dans la liste des demandes (toutes par défaut, sauf
// celles que l'utilisateur a précédemment masquées sur ce navigateur).
const colonnesMasqueesInitiales = chargerColonnesMasqueesDepuisStockage();
let colonnesVisibles = new Set(ORDRE_COLONNES.filter(c => !colonnesMasqueesInitiales.includes(c)));

// --- Même mécanisme (largeur ajustable + colonnes affichables/masquables, mémorisé par
// navigateur) pour le tableau consolidé de la vue "Actions". ---
let largeursColonnesActions = {
  "titre": 220, "sponsor": 130, "organisation": 110, "statut": 110, "RIDA": 70, "Porteur": 130,
  "Pour_le": 100, "Fait_le": 100, "Date_de_modification": 130, "Description": 260
};

const ORDRE_COLONNES_ACTIONS = ["titre", "sponsor", "organisation", "statut", "RIDA", "Porteur", "Pour_le", "Fait_le", "Date_de_modification", "Description"];

const LIBELLES_COLONNES_ACTIONS = {
  "titre": "Demande", "sponsor": "Sponsor", "organisation": "Organisation", "statut": "Statut", "RIDA": "Type",
  "Porteur": "Porteur", "Pour_le": "Pour le", "Fait_le": "Fait le", "Date_de_modification": "Modifié le", "Description": "Description"
};

const CLE_STOCKAGE_COLONNES_MASQUEES_ACTIONS = "emergence_actions_colonnes_masquees";

function chargerColonnesMasqueesActionsDepuisStockage() {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE_COLONNES_MASQUEES_ACTIONS);
    if (!brut) return [];
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    return liste.filter(c => ORDRE_COLONNES_ACTIONS.includes(c));
  } catch (e) {
    return [];
  }
}

function sauvegarderColonnesMasqueesActionsDansStockage() {
  try {
    const masquees = ORDRE_COLONNES_ACTIONS.filter(c => !colonnesVisiblesActions.has(c));
    window.localStorage.setItem(CLE_STOCKAGE_COLONNES_MASQUEES_ACTIONS, JSON.stringify(masquees));
  } catch (e) {
    // stockage indisponible : le choix reste actif pour la session en cours seulement.
  }
}

const colonnesMasqueesActionsInitiales = chargerColonnesMasqueesActionsDepuisStockage();
let colonnesVisiblesActions = new Set(ORDRE_COLONNES_ACTIONS.filter(c => !colonnesMasqueesActionsInitiales.includes(c)));

// Mode de la modale "créer/modifier un acteur" : null = création, sinon id de l'acteur modifié.
let acteurEnEditionId = null;

let lignesEmergence = [];
let acteursParId = {};
let acteursTriesParNom = [];   // [{id, label}] tous les acteurs, triés alphabétiquement
let sponsorsCandidats = [];    // [{id, label}] acteurs SDID uniquement, pour le select Sponsor
let pjToutes = [];
let ridaToutes = [];
let colonneTri = "Date_de_soumission";
let sensTri = "desc";
let ligneSelectionneeId = null;
let triRidaColonne = null;
let triRidaSens = "asc";
let masquerZoneListe = function () {}; // réassignée par initRedimensionnementListe
let dernierClicId = null;
let dernierClicTemps = 0;
let filtreTypologieSelection = new Set();    // vide = toutes les typologies
let filtreOrganisationSelection = new Set(); // vide = toutes les organisations
let filtrePartiePrenanteTexte = ""; // recherche libre par nom (sous-chaîne)
let filtreTitreTexte = "";
// Filtre Statut à sélection multiple : initialisé sur "0-Nouveau" et "1- En cours"
let filtreStatutSelection = new Set(["0-Nouveau", "1- En cours"]);
let ongletActif = "rida";

grist.ready({ requiredAccess: 'full' });

// onRecords sert uniquement de signal "les données ont changé" : on recharge ensuite
// la table principale en données brutes via fetchTable (voir chargerTablePrincipale).
grist.onRecords(async function () {
  await chargerTablePrincipale();
  remplirOptionsFiltres();
  afficherListe();
  if (ligneSelectionneeId) {
    const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);
    if (ligne) afficherFiche(ligne);
  }
});

grist.onRecord(record => {});

// --- Chargement des données (brutes, via fetchTable) ---
async function chargerTablePrincipale() {
  try {
    const table = await grist.docApi.fetchTable(TABLE_PRINCIPALE);
    lignesEmergence = tableVersLignes(table);
  } catch (e) { console.error("Erreur chargement Emergence :", e); }
}

async function chargerTablesAnnexes() {
  try {
    const acteurs = await grist.docApi.fetchTable(TABLE_ACTEURS);
    acteursParId = {};
    const ids = acteurs.id || [];
    for (let i = 0; i < ids.length; i++) {
      acteursParId[ids[i]] = {
        Nom_et_Prenom: acteurs.Nom_et_Prenom ? acteurs.Nom_et_Prenom[i] : "",
        Organisation: acteurs.Organisation ? acteurs.Organisation[i] : "",
        Organisation_Path: acteurs.Organisation_Path ? acteurs.Organisation_Path[i] : "",
        Role: acteurs.Role ? acteurs.Role[i] : "",
        mail: acteurs.mail ? acteurs.mail[i] : ""
      };
    }
    acteursTriesParNom = Object.keys(acteursParId)
      .map(id => ({ id: parseInt(id, 10), label: ligneActeur(parseInt(id, 10)) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Candidats Sponsor / Porteurs : liste complète des acteurs (le filtre "SDID" précédent
    // était trop restrictif et empêchait de choisir la plupart des personnes).
    sponsorsCandidats = acteursTriesParNom.slice();
  } catch (e) { console.error("Erreur chargement acteurs :", e); }

  try {
    const pj = await grist.docApi.fetchTable(TABLE_PJ);
    pjToutes = tableVersLignes(pj);
  } catch (e) { console.error("Erreur chargement PJ :", e); }

  try {
    let rida = await grist.docApi.fetchTable(TABLE_RIDA);
    if (!(COLONNE_DATE_MODIF_RIDA in rida) && await creerColonneDateModifRida()) {
      rida = await grist.docApi.fetchTable(TABLE_RIDA);
    }
    colonneDateModifRidaDisponible = COLONNE_DATE_MODIF_RIDA in rida;
    ridaToutes = tableVersLignes(rida);
  } catch (e) { console.error("Erreur chargement RIDA :", e); }
}

// Crée la colonne "Date de modification" (DateTime) dans la table RIDA si elle n'existe pas.
// Dans la mesure du possible, c'est une colonne à formule déclencheur (NOW() recalculé quand une
// autre colonne de la ligne change), pour que les modifications faites directement dans Grist
// soient elles aussi horodatées ; sinon, seul le widget l'horodate.
async function creerColonneDateModifRida() {
  const infos = { type: "DateTime:Europe/Paris", label: "Date de modification", isFormula: false };
  try {
    const tables = tableVersLignes(await grist.docApi.fetchTable("_grist_Tables"));
    const tableRida = tables.find(t => t.tableId === TABLE_RIDA);
    const colonnes = tableVersLignes(await grist.docApi.fetchTable("_grist_Tables_column"));
    const refs = tableRida ? colonnes
      .filter(c => c.parentId === tableRida.id && !c.isFormula && c.colId !== "manualSort" && c.colId !== COLONNE_DATE_MODIF_RIDA)
      .map(c => c.id) : [];
    if (refs.length > 0) {
      infos.formula = "NOW()";
      infos.recalcWhen = 0;
      infos.recalcDeps = ["L"].concat(refs);
    }
  } catch (e) { /* tables système inaccessibles : colonne simple, horodatée par le widget */ }
  try {
    await grist.docApi.applyUserActions([["AddColumn", TABLE_RIDA, COLONNE_DATE_MODIF_RIDA, infos]]);
    return true;
  } catch (e) {
    console.error("Impossible de créer la colonne " + COLONNE_DATE_MODIF_RIDA + " :", e);
    return false;
  }
}

async function rechargerRidaEtRafraichir(ligneId) {
  try {
    const rida = await grist.docApi.fetchTable(TABLE_RIDA);
    ridaToutes = tableVersLignes(rida);
  } catch (e) { console.error("Erreur rechargement RIDA :", e); }
  const ligneCourante = lignesEmergence.find(l => l.id === ligneId);
  if (ligneCourante) afficherFiche(ligneCourante);
}

async function rechargerPjEtRafraichir(ligneId) {
  try {
    const pj = await grist.docApi.fetchTable(TABLE_PJ);
    pjToutes = tableVersLignes(pj);
  } catch (e) { console.error("Erreur rechargement PJ :", e); }
  const ligneCourante = lignesEmergence.find(l => l.id === ligneId);
  if (ligneCourante) afficherFiche(ligneCourante);
}

async function rechargerEmergenceEtRafraichir(ligneId) {
  await chargerTablePrincipale();
  afficherListe();
  const ligneCourante = lignesEmergence.find(l => l.id === ligneId);
  if (ligneCourante) afficherFiche(ligneCourante);
}

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

// --- Utilitaires ---
function idDepuisRef(valeur) {
  if (Array.isArray(valeur)) {
    return valeur.length > 1 ? valeur[1] : null;
  }
  return valeur;
}

function refListVersIds(valeur) {
  if (!valeur) return [];
  if (Array.isArray(valeur)) {
    return valeur[0] === "L" ? valeur.slice(1) : valeur;
  }
  return [valeur];
}

// Nettoie une liste d'ids d'acteurs (ex. Parties_prenantes_concernees) en ne gardant que des
// entiers positifs correspondant à un acteur qui existe réellement. Sert à la fois à ne plus
// afficher une puce "—" pour une référence orpheline (acteur supprimé, ou entrée corrompue du
// type null/0 historique) ET, surtout, à ne plus jamais renvoyer une telle valeur invalide à
// Grist : une liste contenant un id inexistant (en particulier 0) fait planter l'UpdateRecord
// côté Grist ("AssertionError ... non-existent record #0"), empêchant alors tout nouvel ajout
// tant que la donnée corrompue restait dans le champ. Un simple ajout/retrait purge donc
// désormais définitivement ce genre d'entrée.
function nettoyerIdsActeurs(idsBrut) {
  return idsBrut.filter(id => Number.isInteger(id) && id > 0 && !!acteursParId[id]);
}

function nomActeurParId(id) {
  const a = acteursParId[id];
  if (!a) return "";
  return a.Nom_et_Prenom || "";
}

function ligneActeur(id) {
  const a = acteursParId[id];
  if (!a) return "—";
  const nom = a.Nom_et_Prenom || "—";
  return a.Organisation_Path ? nom + " (" + a.Organisation_Path + ")" : nom;
}

function lignesActeurs(valeur) {
  const ids = refListVersIds(valeur);
  if (ids.length === 0) return "";
  return ids.map(ligneActeur).join("<br>");
}

function nomActeur(valeur) {
  const ids = refListVersIds(valeur);
  if (ids.length === 0) return "";
  return ids.map(nomActeurParId).filter(Boolean).join(", ");
}

// Normalise un texte pour une comparaison de recherche "insensible à la casse et aux
// accents" : minuscules + suppression des diacritiques (é/è/ê/ë -> e, ç -> c, etc.), pour que
// taper "deborah" ou "DEBORAH" retrouve "Déborah", et "ministere" retrouve "ministère".
// Utilisé par TOUS les champs de recherche/filtre textuels de l'application.
function normaliserTexteRecherche(valeur) {
  return String(valeur == null ? "" : valeur)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Texte combiné Sponsor + Porteurs + Parties prenantes d'une demande, utilisé par le filtre
// "Partie prenante" pour que celui-ci cherche aussi parmi le sponsor et le(s) porteur(s), pas
// seulement les parties prenantes au sens strict.
function texteParticipantsRecherche(ligne) {
  return normaliserTexteRecherche([
    nomActeurParId(ligne.Sponsor),
    ligne.Porteurs || "",
    nomActeur(ligne.Parties_prenantes_concernees)
  ].filter(Boolean).join(" | "));
}

function escapeHtml(valeur) {
  return String(valeur == null ? "" : valeur)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(texte) {
  if (!texte) return "";
  let txt = String(texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Gras / italique / liens : appliqués globalement avant le découpage ligne par ligne
  txt = txt.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  txt = txt.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");
  txt = txt.replace(/\[(.+?)\]\((.+?)\)/g, "<a href='$2' target='_blank'>$1</a>");

  const PAS_INDENT = 20; // px par niveau de titre
  const lignes = txt.split("\n");
  let html = "";
  let dansListe = false;
  let indentActuel = 0; // niveau d'indentation courant pour le contenu (paragraphes/listes)

  for (const ligne of lignes) {
    // On teste du plus spécifique (###) au moins spécifique (#)
    const matchH3 = /^###\s+(.+)$/.exec(ligne);
    const matchH2 = !matchH3 ? /^##\s+(.+)$/.exec(ligne) : null;
    const matchH1 = (!matchH3 && !matchH2) ? /^#\s+(.+)$/.exec(ligne) : null;

    if (matchH1 || matchH2 || matchH3) {
      if (dansListe) { html += "</ul>"; dansListe = false; }
      if (matchH1) {
        html += "<div style='font-size:19px; font-weight:bold; margin:8px 0; margin-left:0px;'>" + matchH1[1] + "</div>";
        indentActuel = 1;
      } else if (matchH2) {
        html += "<div style='font-size:16px; font-weight:bold; margin:6px 0; margin-left:" + (PAS_INDENT * 1) + "px;'>" + matchH2[1] + "</div>";
        indentActuel = 2;
      } else {
        html += "<div style='font-size:14px; font-weight:bold; margin:5px 0; margin-left:" + (PAS_INDENT * 2) + "px;'>" + matchH3[1] + "</div>";
        indentActuel = 3;
      }
      continue;
    }

    if (/^\s*[-*]\s+/.test(ligne)) {
      if (!dansListe) {
        html += "<ul style='margin:2px 0; padding-left:" + (18 + indentActuel * PAS_INDENT) + "px;'>";
        dansListe = true;
      }
      const contenu = ligne.replace(/^\s*[-*]\s+/, "");
      html += "<li>" + contenu + "</li>";
    } else {
      if (dansListe) { html += "</ul>"; dansListe = false; }
      if (ligne.trim()) {
        html += "<div style='margin-left:" + (indentActuel * PAS_INDENT) + "px;'>" + ligne + "</div>";
      }
    }
  }
  if (dansListe) html += "</ul>";
  return html;
}

// --- Champ markdown : vue rendue par défaut, bascule vers édition ---
// Sauvegarde toujours automatique (à la perte de focus) : pas de bouton Enregistrer/Annuler ;
// Échap annule la saisie en cours et revient à la valeur enregistrée.
function champMarkdownHtml(idPrefix, valeur, classeTextareaSupp, classeBoiteSupp) {
  const contenuRendu = markdownToHtml(valeur) || "<span style='color:#bbb;'>—</span>";
  const classeTextarea = classeTextareaSupp ? " " + classeTextareaSupp : "";
  const classeBoite = classeBoiteSupp ? " " + classeBoiteSupp : "";
  return (
    "<div class='markdown-vue' id='" + idPrefix + "-vue'>" +
    "<div class='boite-grise cliquable" + classeBoite + "' id='" + idPrefix + "-boite' title='Cliquer pour modifier'>" + contenuRendu + "</div>" +
    "<button type='button' class='btn-modifier' id='" + idPrefix + "-btn-modifier'>✎ Modifier</button>" +
    "</div>" +
    "<div class='markdown-edition' id='" + idPrefix + "-edition' style='display:none;'>" +
    "<textarea id='" + idPrefix + "-textarea' class='" + classeTextarea.trim() + "'>" + escapeHtml(valeur || "") + "</textarea>" +
    "<span class='msg-sauvegarde' id='" + idPrefix + "-msg'></span>" +
    "</div>"
  );
}

function initChampMarkdown(conteneur, idPrefix, champGrist, valeurInitiale, ligneId) {
  const vueDiv = conteneur.querySelector("#" + idPrefix + "-vue");
  const boiteDiv = conteneur.querySelector("#" + idPrefix + "-boite");
  const editionDiv = conteneur.querySelector("#" + idPrefix + "-edition");
  const btnModifier = conteneur.querySelector("#" + idPrefix + "-btn-modifier");
  const textarea = conteneur.querySelector("#" + idPrefix + "-textarea");
  const msgEl = conteneur.querySelector("#" + idPrefix + "-msg");

  function passerEnEdition() {
    // Fixe la hauteur du textarea sur celle de la boîte affichée (height ET min-height,
    // pour neutraliser le min-height plus grand de la classe "textarea-longue").
    const hauteurActuelle = boiteDiv.offsetHeight;
    textarea.style.height = hauteurActuelle + "px";
    textarea.style.minHeight = hauteurActuelle + "px";
    vueDiv.style.display = "none";
    editionDiv.style.display = "block";
    textarea.focus();
  }

  function revenirEnVue() {
    editionDiv.style.display = "none";
    vueDiv.style.display = "block";
  }

  btnModifier.addEventListener("click", passerEnEdition);
  boiteDiv.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // laisse les liens markdown fonctionner normalement
    passerEnEdition();
  });

  async function sauverSiModifie() {
    if (textarea.value === valeurInitiale) {
      revenirEnVue();
      return;
    }
    msgEl.textContent = "";
    msgEl.className = "msg-sauvegarde";
    try {
      await appliquerActions([
        ["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [champGrist]: textarea.value }]
      ]);
      await rechargerEmergenceEtRafraichir(ligneId);
    } catch (err) {
      msgEl.textContent = "Erreur : " + err.message;
      msgEl.className = "msg-sauvegarde erreur";
    }
  }
  textarea.addEventListener("blur", sauverSiModifie);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      textarea.value = valeurInitiale;
      revenirEnVue();
    }
  });
}

function formaterDate(valeur) {
  if (!valeur) return "";
  if (typeof valeur === "number") {
    const d = new Date(valeur * 1000);
    return String(d.getDate()).padStart(2, "0") + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
  }
  return String(valeur);
}

// Convertit un timestamp epoch (secondes) en valeur pour <input type="date"> (YYYY-MM-DD), en UTC
function formaterDateHeure(valeur) {
  if (!valeur || typeof valeur !== "number") return "";
  const d = new Date(valeur * 1000);
  return formaterDate(valeur) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
function dateEpochVersInput(valeur) {
  if (!valeur || typeof valeur !== "number") return "";
  const d = new Date(valeur * 1000);
  const aaaa = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const jj = String(d.getUTCDate()).padStart(2, "0");
  return aaaa + "-" + mm + "-" + jj;
}

// Convertit une valeur d'<input type="date"> (YYYY-MM-DD) en timestamp epoch (secondes, UTC minuit)
function inputVersDateEpoch(valeurInput) {
  if (!valeurInput) return null;
  const [aaaa, mm, jj] = valeurInput.split("-").map(Number);
  return Math.floor(Date.UTC(aaaa, mm - 1, jj) / 1000);
}

// Timestamp epoch (secondes, UTC minuit) du jour courant — même convention que inputVersDateEpoch.
function aujourdHuiEpoch() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000);
}

function badgeStatut(statut) {
  const c = COULEURS_STATUT[statut] || { fond: "#f3f4f6", texte: "#374151" };
  return "<span class='badge-statut' style='background:" + c.fond + "; color:" + c.texte + ";'>" + (statut || "—") + "</span>";
}

function valeurOuTiret(v) {
  return v ? String(v) : "<span style='color:#bbb;'>—</span>";
}

// Ligne RIDA de type "A" (Action) encore ouverte (Fait_le vide) la plus ancienne (date cible
// Pour_le la plus proche) pour une demande donnée. Retourne null s'il n'y en a pas.
function actionOuvertePlusAncienne(ligneId) {
  let plusAncienne = null;
  for (const r of ridaToutes) {
    if (idDepuisRef(r.ID2) !== ligneId) continue;
    if (r.RIDA !== "A") continue;
    if (r.Fait_le) continue;
    if (typeof r.Pour_le !== "number") continue;
    if (plusAncienne === null || r.Pour_le < plusAncienne.Pour_le) plusAncienne = r;
  }
  return plusAncienne;
}

// Date cible (Pour_le) de la plus ancienne ligne RIDA de type "A" encore ouverte. Retourne
// null s'il n'y en a pas. Conservé pour le tri de la colonne "RIDA".
function epochActionOuvertePlusAncienne(ligneId) {
  const r = actionOuvertePlusAncienne(ligneId);
  return r ? r.Pour_le : null;
}

// Ligne RIDA à afficher dans la colonne "RIDA" de la liste des demandes : la plus ancienne
// Action (A) encore ouverte si elle existe, sinon la ligne RIDA la plus récente (I, D ou A,
// quel que soit son état) pour qu'il y ait toujours quelque chose d'affiché. "Plus récente" se
// base sur Fait_le si la ligne est close, sinon sur Pour_le.
function ridaAAfficherDansListe(ligneId) {
  const actionOuverte = actionOuvertePlusAncienne(ligneId);
  if (actionOuverte) return actionOuverte;

  let plusRecente = null;
  let dateRef = null;
  for (const r of ridaToutes) {
    if (idDepuisRef(r.ID2) !== ligneId) continue;
    const date = (typeof r.Fait_le === "number") ? r.Fait_le : r.Pour_le;
    if (typeof date !== "number") continue;
    if (plusRecente === null || date > dateRef || (date === dateRef && r.id > plusRecente.id)) {
      plusRecente = r;
      dateRef = date;
    }
  }
  return plusRecente;
}

// Date de référence de l'élément retourné par ridaAAfficherDansListe (pour le tri de colonne).
function epochRidaAAfficherDansListe(ligneId) {
  const r = ridaAAfficherDansListe(ligneId);
  if (!r) return null;
  return (typeof r.Fait_le === "number") ? r.Fait_le : r.Pour_le;
}

const LIBELLES_TYPE_RIDA = { "I": "Information", "D": "Décision", "A": "Action" };

// --- Filtres ---
// Même mécanisme que pour la liste des Actions : une icône 🔎 par colonne filtrable
// ouvre une petite popup avec le contrôle adapté (texte, ou sélection multiple), et une
// icône ✕ masque directement la colonne. Les deux icônes sont grisées par défaut et la
// loupe passe en couleur vive dès qu'un filtre est actif sur sa colonne.
function remplirOptionsFiltres() {
  const datalistPartiePrenante = document.getElementById("datalist-filtre-pp");

  // Datalist d'autocomplétion pour le filtre "Parties prenantes" (nom seul, sans organisation,
  // pour que la saisie corresponde bien au texte comparé lors du filtrage). Le filtre cherchant
  // aussi parmi le Sponsor et le(s) Porteur(s) de chaque demande, on propose également ces noms
  // à l'autocomplétion, pas seulement les parties prenantes au sens strict.
  const idsUtilises = new Set();
  lignesEmergence.forEach(l => {
    nettoyerIdsActeurs(refListVersIds(l.Parties_prenantes_concernees).map(Number)).forEach(id => idsUtilises.add(id));
    if (l.Sponsor) idsUtilises.add(Number(l.Sponsor));
  });
  const nomsPorteursLibres = [...new Set(lignesEmergence.map(l => l.Porteurs).filter(Boolean))];
  const nomsPourFiltre = [...new Set(
    acteursTriesParNom.filter(a => idsUtilises.has(a.id)).map(a => nomActeurParId(a.id)).filter(Boolean)
      .concat(nomsPorteursLibres)
  )].sort((a, b) => a.localeCompare(b));
  datalistPartiePrenante.innerHTML = nomsPourFiltre.map(nom => "<option value=\"" + escapeHtml(nom) + "\"></option>").join("");

  construirePopupConfigColonnes();
  mettreAJourIconesFiltreListe();
}

function appliquerFiltres(lignes) {
  return lignes.filter(l => {
    if (filtreStatutSelection.size > 0 && !filtreStatutSelection.has(l.Statut)) return false;
    if (filtreTypologieSelection.size > 0 && !filtreTypologieSelection.has(l.Typologie_de_la_demande)) return false;
    if (filtreOrganisationSelection.size > 0 && !filtreOrganisationSelection.has(l.Organisation)) return false;
    if (filtrePartiePrenanteTexte) {
      if (texteParticipantsRecherche(l).indexOf(normaliserTexteRecherche(filtrePartiePrenanteTexte)) === -1) return false;
    }
    if (filtreTitreTexte) {
      if (normaliserTexteRecherche(l.Titre || "").indexOf(normaliserTexteRecherche(filtreTitreTexte)) === -1) return false;
    }
    return true;
  });
}

// --- Config colonnes (afficher/masquer les colonnes de la liste des demandes) ---
function construirePopupConfigColonnes() {
  const popup = document.getElementById("popup-config-colonnes");
  if (!popup) return;
  popup.innerHTML = ORDRE_COLONNES.map(col =>
    "<label><input type='checkbox' class='case-config-colonne' value=\"" + escapeHtml(col) + "\"" +
    (colonnesVisibles.has(col) ? " checked" : "") + ">" + escapeHtml(LIBELLES_COLONNES[col] || col) + "</label>"
  ).join("");

  popup.querySelectorAll(".case-config-colonne").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) colonnesVisibles.add(cb.value);
      else colonnesVisibles.delete(cb.value);
      sauvegarderColonnesMasqueesDansStockage();
      appliquerVisibiliteColonnes();
      appliquerLargeursColonnes();
    });
  });
}

// Applique l'affichage/masquage des colonnes (en-têtes + cellules) selon colonnesVisibles.
function appliquerVisibiliteColonnes() {
  const table = document.getElementById("table-liste");
  if (!table) return;
  table.querySelectorAll("thead th[data-col]").forEach(th => {
    const nomCol = th.getAttribute("data-col");
    th.style.display = colonnesVisibles.has(nomCol) ? "" : "none";
  });
  table.querySelectorAll("tbody tr[data-id]").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    tds.forEach((td, index) => {
      const nomCol = ORDRE_COLONNES[index];
      td.style.display = colonnesVisibles.has(nomCol) ? "" : "none";
    });
  });
}

const btnConfigColonnes = document.getElementById("btn-config-colonnes");
if (btnConfigColonnes) {
  btnConfigColonnes.addEventListener("click", (e) => {
    e.stopPropagation();
    const popup = document.getElementById("popup-config-colonnes");
    popup.style.display = popup.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    const conteneur = btnConfigColonnes.closest(".filtre-multi-conteneur");
    if (conteneur && !conteneur.contains(e.target)) {
      document.getElementById("popup-config-colonnes").style.display = "none";
    }
  });
}

// --- Filtres par colonne (icône 🔎 dans chaque en-tête de la liste des demandes) ---
// Même mécanisme que pour la vue Actions : une seule popup à la fois, positionnée en
// position: fixed sous l'icône cliquée.
function fermerPopupFiltreListeColonne() {
  const ancienne = document.querySelector(".popup-filtre-liste-colonne");
  if (ancienne) ancienne.remove();
}

function filtreListeColonneEstActif(champ) {
  if (champ === "statut") return filtreStatutSelection.size > 0;
  if (champ === "typologie") return filtreTypologieSelection.size > 0;
  if (champ === "organisation") return filtreOrganisationSelection.size > 0;
  if (champ === "partie-prenante") return !!filtrePartiePrenanteTexte;
  if (champ === "titre") return !!filtreTitreTexte;
  return false;
}

function mettreAJourIconesFiltreListe() {
  document.querySelectorAll("#table-liste thead .icone-filtre-action").forEach(icone => {
    const th = icone.closest("th");
    const champ = th.getAttribute("data-filtre-champ");
    icone.classList.toggle("filtre-actif", filtreListeColonneEstActif(champ));
  });
}

function construireContenuPopupFiltreListeColonne(champ) {
  if (champ === "titre") {
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"titre\" value=\"" +
      escapeHtml(filtreTitreTexte) + "\" placeholder='Filtrer par titre...'>";
  }
  if (champ === "partie-prenante") {
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"partie-prenante\" list='datalist-filtre-pp' value=\"" +
      escapeHtml(filtrePartiePrenanteTexte) + "\" placeholder='Sponsor, porteur ou partie prenante...'>";
  }
  if (champ === "statut") {
    return Object.keys(COULEURS_STATUT).map(s =>
      "<label><input type='checkbox' class='case-filtre-liste-statut' value=\"" + escapeHtml(s) + "\"" +
      (filtreStatutSelection.has(s) ? " checked" : "") + ">" + escapeHtml(s) + "</label>"
    ).join("");
  }
  if (champ === "typologie") {
    const valeurs = [...new Set(lignesEmergence.map(l => l.Typologie_de_la_demande).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (valeurs.length === 0) return "<span style='font-size:12px;color:#888;'>Aucune typologie</span>";
    return valeurs.map(v =>
      "<label><input type='checkbox' class='case-filtre-liste-typologie' value=\"" + escapeHtml(v) + "\"" +
      (filtreTypologieSelection.has(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>"
    ).join("");
  }
  if (champ === "organisation") {
    const valeurs = [...new Set(lignesEmergence.map(l => l.Organisation).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (valeurs.length === 0) return "<span style='font-size:12px;color:#888;'>Aucune organisation</span>";
    return valeurs.map(v =>
      "<label><input type='checkbox' class='case-filtre-liste-organisation' value=\"" + escapeHtml(v) + "\"" +
      (filtreOrganisationSelection.has(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>"
    ).join("");
  }
  return "";
}

function ouvrirPopupFiltreListeColonne(th, icone) {
  const champ = th.getAttribute("data-filtre-champ");
  if (!champ) return;
  const dejaOuvertePourCetteIcone = icone.classList.contains("filtre-popup-ouverte");
  fermerPopupFiltreListeColonne();
  document.querySelectorAll("#table-liste .icone-filtre-action").forEach(i => i.classList.remove("filtre-popup-ouverte"));
  if (dejaOuvertePourCetteIcone) return; // un second clic sur la même icône referme juste la popup

  const popup = document.createElement("div");
  popup.className = "popup-filtre-action-colonne popup-filtre-liste-colonne";
  popup.innerHTML = construireContenuPopupFiltreListeColonne(champ);
  document.body.appendChild(popup);
  icone.classList.add("filtre-popup-ouverte");

  const rectIcone = icone.getBoundingClientRect();
  popup.style.top = (rectIcone.bottom + 4) + "px";
  let gauche = rectIcone.left;
  const largeurMax = popup.offsetWidth || 180;
  if (gauche + largeurMax > window.innerWidth - 8) gauche = Math.max(8, window.innerWidth - 8 - largeurMax);
  popup.style.left = gauche + "px";

  popup.addEventListener("click", (e) => e.stopPropagation());
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());

  const champTexte = popup.querySelector(".champ-filtre-liste-texte");
  if (champTexte) {
    champTexte.addEventListener("input", (e) => {
      const c = e.target.getAttribute("data-champ");
      if (c === "titre") filtreTitreTexte = e.target.value;
      else if (c === "partie-prenante") filtrePartiePrenanteTexte = e.target.value;
      afficherListe();
      mettreAJourIconesFiltreListe();
    });
    champTexte.focus();
  }
  popup.querySelectorAll(".case-filtre-liste-statut").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreStatutSelection.add(cb.value);
      else filtreStatutSelection.delete(cb.value);
      afficherListe();
      mettreAJourIconesFiltreListe();
    });
  });
  popup.querySelectorAll(".case-filtre-liste-typologie").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreTypologieSelection.add(cb.value);
      else filtreTypologieSelection.delete(cb.value);
      afficherListe();
      mettreAJourIconesFiltreListe();
    });
  });
  popup.querySelectorAll(".case-filtre-liste-organisation").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreOrganisationSelection.add(cb.value);
      else filtreOrganisationSelection.delete(cb.value);
      afficherListe();
      mettreAJourIconesFiltreListe();
    });
  });
}

document.querySelectorAll("#table-liste thead .icone-filtre-action").forEach(icone => {
  icone.addEventListener("click", (e) => {
    e.stopPropagation();
    ouvrirPopupFiltreListeColonne(icone.closest("th"), icone);
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".popup-filtre-liste-colonne") && !e.target.closest("#table-liste .icone-filtre-action")) {
    fermerPopupFiltreListeColonne();
    document.querySelectorAll("#table-liste .icone-filtre-action").forEach(i => i.classList.remove("filtre-popup-ouverte"));
  }
});

// Icône "✕" : masquer directement une colonne de la liste des demandes depuis son en-tête,
// sans passer par la popup de configuration (⚙) — équivalent à décocher sa case là-bas, et
// la case correspondante y est tenue à jour si elle est ouverte.
document.querySelectorAll("#table-liste thead .icone-masquer-colonne").forEach(icone => {
  icone.addEventListener("click", (e) => {
    e.stopPropagation();
    const th = icone.closest("th");
    const col = th.getAttribute("data-col");
    colonnesVisibles.delete(col);
    sauvegarderColonnesMasqueesDansStockage();
    appliquerVisibiliteColonnes();
    appliquerLargeursColonnes();
    const popupGear = document.getElementById("popup-config-colonnes");
    if (popupGear) {
      const caseCorrespondante = popupGear.querySelector(".case-config-colonne[value=\"" + col + "\"]");
      if (caseCorrespondante) caseCorrespondante.checked = false;
    }
  });
});

document.getElementById("btn-reset-filtres").addEventListener("click", () => {
  filtreStatutSelection = new Set();
  filtreTypologieSelection = new Set();
  filtreOrganisationSelection = new Set();
  filtrePartiePrenanteTexte = "";
  filtreTitreTexte = "";
  fermerPopupFiltreListeColonne();
  afficherListe();
  mettreAJourIconesFiltreListe();
});

// --- Liste ---
function trierLignes(lignes) {
  const copie = [...lignes];
  copie.sort((a, b) => {
    let vA = a[colonneTri], vB = b[colonneTri];

    // Sponsor est une référence : on trie sur le nom résolu, pas l'id brut
    if (colonneTri === "Sponsor") {
      vA = nomActeur(vA);
      vB = nomActeur(vB);
    }
    // Parties prenantes : trier sur le texte concaténé des noms
    if (colonneTri === "Parties_prenantes_concernees") {
      vA = nomActeur(vA);
      vB = nomActeur(vB);
    }
    // RIDA : colonne calculée, pas une propriété directe de la ligne
    if (colonneTri === "Action_ouverte") {
      vA = epochRidaAAfficherDansListe(a.id);
      vB = epochRidaAAfficherDansListe(b.id);
    }

    if (vA == null) vA = "";
    if (vB == null) vB = "";
    if (typeof vA === "number" && typeof vB === "number") return sensTri === "asc" ? vA - vB : vB - vA;
    vA = String(vA).toLowerCase(); vB = String(vB).toLowerCase();
    if (vA < vB) return sensTri === "asc" ? -1 : 1;
    if (vA > vB) return sensTri === "asc" ? 1 : -1;
    return 0;
  });
  return copie;
}

// Nom de la dernière colonne actuellement visible : on ne lui impose pas de largeur fixe,
// ce qui lui permet (via table-layout: fixed + #table-liste { width: 100% }) d'absorber
// automatiquement tout l'espace restant — plus d'espace vide à droite du tableau, et plus
// besoin de recalculer/étirer les autres largeurs à la main.
function derniereColonneVisible() {
  const visibles = ORDRE_COLONNES.filter(c => colonnesVisibles.has(c));
  return visibles.length ? visibles[visibles.length - 1] : null;
}

function appliquerLargeursColonnes() {
  const table = document.getElementById("table-liste");
  const colonneElastique = derniereColonneVisible();
  const ths = table.querySelectorAll("thead th");
  ths.forEach((th) => {
    const nomCol = th.getAttribute("data-col");
    if (nomCol === colonneElastique) {
      th.style.width = "";
      th.style.minWidth = "120px";
      th.style.maxWidth = "";
      return;
    }
    const largeur = largeursColonnes[nomCol];
    if (largeur) {
      th.style.width = largeur + "px";
      th.style.minWidth = largeur + "px";
      th.style.maxWidth = largeur + "px";
    }
  });
  const lignesTr = table.querySelectorAll("tbody tr");
  lignesTr.forEach(tr => {
    const tds = tr.querySelectorAll("td");
    tds.forEach((td, index) => {
      const nomCol = ORDRE_COLONNES[index];
      if (nomCol === colonneElastique) {
        td.style.width = "";
        td.style.minWidth = "120px";
        td.style.maxWidth = "";
        return;
      }
      const largeur = largeursColonnes[nomCol];
      if (largeur) {
        td.style.width = largeur + "px";
        td.style.minWidth = largeur + "px";
        td.style.maxWidth = largeur + "px";
      }
    });
  });
}

function afficherListe() {
  const corps = document.getElementById("corps-tableau");
  const lignesFiltrees = appliquerFiltres(lignesEmergence);
  const lignesTriees = trierLignes(lignesFiltrees);

  if (lignesTriees.length === 0) {
    corps.innerHTML = "<tr><td colspan='9' class='chargement'>Aucune ligne trouvée.</td></tr>";
    return;
  }
  let html = "";
  for (const ligne of lignesTriees) {
    const sel = ligne.id === ligneSelectionneeId ? "selectionnee" : "";
    const sponsorNom = nomActeur(ligne.Sponsor);
    const porteurTexte = ligne.Porteurs || ""; // Choix unique : valeur texte directe, pas de résolution
    const partiesPrenantesTexte = nomActeur(ligne.Parties_prenantes_concernees);
    // Colonne "RIDA" : la plus ancienne Action encore ouverte, sinon la ligne RIDA la plus
    // récente (quel que soit son type ou son état), avec une icône I/A/D et un repère "Clos"
    // quand l'élément affiché (faute d'action ouverte) est déjà fait.
    const elementRida = ridaAAfficherDansListe(ligne.id);
    let celluleRida;
    if (elementRida) {
      const estClos = !!elementRida.Fait_le;
      const dateRida = formaterDate(elementRida.Pour_le);
      const descriptionRida = elementRida.Description || "";
      const porteurRida = elementRida.Porteur || "";
      // Couleur de l'icône selon l'urgence (pas selon le type) : grise par défaut, orange si
      // l'échéance tombe dans les 7 prochains jours, rouge si elle est dépassée. Une ligne déjà
      // faite (estClos) reste toujours grise, même règle que classeUrgenceAction pour l'onglet Actions.
      const urgenceRida = classeUrgenceAction(elementRida);
      const classeCouleurBadge = urgenceRida === "action-retard" ? "badge-rida-retard" :
        urgenceRida === "action-proche" ? "badge-rida-proche" : "badge-rida-gris";
      const badgeType = "<span class='badge-rida-type " + classeCouleurBadge +
        "' title=\"" + escapeHtml(LIBELLES_TYPE_RIDA[elementRida.RIDA] || "") + "\">" +
        escapeHtml(elementRida.RIDA || "?") + "</span>";
      celluleRida =
        "<div class='cellule-action-ouverte'>" +
        "<div class='ligne-entete-action-ouverte'>" + badgeType +
        "<span class='date-action-ouverte'>" + escapeHtml(dateRida) +
        (porteurRida ? " (" + escapeHtml(porteurRida) + ")" : "") + "</span>" +
        (estClos ? "<span class='etiquette-rida-clos'>Clos</span>" : "") +
        "</div>" +
        (descriptionRida ? "<div class='description-action-ouverte' title=\"" + escapeHtml(descriptionRida) + "\">" + escapeHtml(descriptionRida) + "</div>" : "") +
        "</div>";
    } else {
      celluleRida = "<span style='color:#bbb;'>—</span>";
    }
    html += "<tr class='" + sel + "' data-id='" + ligne.id + "'>" +
      "<td>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td title='" + (formaterDate(ligne.Date_de_soumission) || "") + "'>" + formaterDate(ligne.Date_de_soumission) + "</td>" +
      "<td title='" + (ligne.Organisation || "") + "'>" + (ligne.Organisation || "—") + "</td>" +
      "<td title='" + sponsorNom + "'>" + (sponsorNom || "—") + "</td>" +
      "<td title='" + porteurTexte + "'>" + (porteurTexte || "—") + "</td>" +
      "<td title='" + (ligne.Titre || "") + "'>" + (ligne.Titre || "—") + "</td>" +
      "<td title='" + (ligne.Typologie_de_la_demande || "") + "'>" + (ligne.Typologie_de_la_demande || "—") + "</td>" +
      "<td title='" + partiesPrenantesTexte + "'>" + (partiesPrenantesTexte || "—") + "</td>" +
      "<td>" + celluleRida + "</td>" +
      "</tr>";
  }
  corps.innerHTML = html;
  corps.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", () => {
      const id = parseInt(tr.getAttribute("data-id"), 10);
      const maintenant = Date.now();
      const estDoubleClic = id === dernierClicId && (maintenant - dernierClicTemps) < 400;
      selectionnerLigne(id);
      if (estDoubleClic) {
        masquerZoneListe();
        dernierClicId = null;
      } else {
        dernierClicId = id;
        dernierClicTemps = maintenant;
      }
    });
  });
  mettreAJourFleches();
  appliquerLargeursColonnes();
  appliquerVisibiliteColonnes();
}

function selectionnerLigne(id) {
  ligneSelectionneeId = id;
  const ligne = lignesEmergence.find(l => l.id === id);
  grist.setCursorPos({ rowId: id }).catch(() => {});
  afficherListe();
  if (ligne) afficherFiche(ligne);
}

function mettreAJourFleches() {
  document.querySelectorAll("thead th").forEach(th => {
    const f = th.querySelector(".fleche");
    if (!f) return;
    f.textContent = th.getAttribute("data-col") === colonneTri ? (sensTri === "asc" ? "▲" : "▼") : "";
  });
}

document.querySelectorAll("thead th").forEach(th => {
  th.addEventListener("click", (e) => {
    if (e.target.classList.contains("poignee") || e.target.classList.contains("icone-filtre-action") ||
      e.target.classList.contains("icone-masquer-colonne") || th.dataset.enTrainDeRedimensionner === "1") return;
    const col = th.getAttribute("data-col");
    if (colonneTri === col) sensTri = sensTri === "asc" ? "desc" : "asc";
    else { colonneTri = col; sensTri = "asc"; }
    afficherListe();
  });
});

// --- Redimensionnement des colonnes ---
(function initRedimensionnement() {
  document.querySelectorAll("#table-liste thead .poignee").forEach(poignee => {
    poignee.addEventListener("pointerdown", (e) => {
      const th = poignee.closest("th");
      const colName = th.getAttribute("data-col");
      if (colName === derniereColonneVisible()) return; // colonne élastique : non redimensionnable
      e.preventDefault();
      e.stopPropagation();
      poignee.setPointerCapture(e.pointerId);

      const rectTh = th.getBoundingClientRect();

      th.dataset.enTrainDeRedimensionner = "1";
      poignee.classList.add("active-resize");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      function onPointerMove(ev) {
        const nouvelleLargeur = Math.max(50, Math.round(ev.clientX - rectTh.left));
        largeursColonnes[colName] = nouvelleLargeur;
        appliquerLargeursColonnes();
      }

      function onPointerUp(ev) {
        poignee.releasePointerCapture(ev.pointerId);
        poignee.removeEventListener("pointermove", onPointerMove);
        poignee.removeEventListener("pointerup", onPointerUp);
        poignee.classList.remove("active-resize");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setTimeout(() => { th.dataset.enTrainDeRedimensionner = "0"; }, 50);
      }

      poignee.addEventListener("pointermove", onPointerMove);
      poignee.addEventListener("pointerup", onPointerUp);
    });
  });
})();

// --- Redimensionnement vertical de la liste / masquage-affichage ---
(function initRedimensionnementListe() {
  const zoneListeComplete = document.getElementById("zone-liste-complete");
  const conteneurListe = document.getElementById("conteneur-liste");
  const poigneeToggle = document.getElementById("poignee-toggle");
  const poigneeIcone = document.getElementById("poignee-icone");
  const zonesGlisser = document.querySelectorAll("#barre-redimension .barre-glisser");

  let listeMasquee = false;
  let hauteurAvantMasquage = Math.max(150, window.innerHeight - 110);
  conteneurListe.style.height = hauteurAvantMasquage + "px";

  function masquer() {
    if (listeMasquee) return;
    hauteurAvantMasquage = conteneurListe.offsetHeight;
    zoneListeComplete.style.display = "none";
    poigneeIcone.textContent = "▼";
    listeMasquee = true;
  }

  function afficher() {
    if (!listeMasquee) return;
    zoneListeComplete.style.display = "";
    conteneurListe.style.height = hauteurAvantMasquage + "px";
    poigneeIcone.textContent = "▲";
    listeMasquee = false;
  }

  function basculerAffichageListe() {
    if (listeMasquee) afficher(); else masquer();
  }

  poigneeToggle.addEventListener("click", basculerAffichageListe);

  // Exposée pour permettre au double-clic sur une ligne de la liste de la masquer.
  masquerZoneListe = masquer;

  zonesGlisser.forEach(zone => {
    zone.addEventListener("pointerdown", (e) => {
      if (listeMasquee) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);

      const hauteurDepart = conteneurListe.offsetHeight;
      const yDepart = e.clientY;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";

      function onPointerMove(ev) {
        const hauteurMax = Math.max(200, window.innerHeight - 40);
        const nouvelleHauteur = Math.max(60, Math.min(hauteurMax, hauteurDepart + (ev.clientY - yDepart)));
        conteneurListe.style.height = nouvelleHauteur + "px";
      }

      function onPointerUp(ev) {
        zone.releasePointerCapture(ev.pointerId);
        zone.removeEventListener("pointermove", onPointerMove);
        zone.removeEventListener("pointerup", onPointerUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        hauteurAvantMasquage = conteneurListe.offsetHeight;
      }

      zone.addEventListener("pointermove", onPointerMove);
      zone.addEventListener("pointerup", onPointerUp);
    });
  });
})();

// --- Parties prenantes éditables (puces) ---
function genererPartiesPrenantesHtml(ligne) {
  const idsActuels = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));

  let chipsHtml = "";
  if (idsActuels.length === 0) {
    chipsHtml = "<div class='pp-vide'>Aucune partie prenante</div>";
  } else {
    chipsHtml = "<div class='chips-conteneur' id='pp-chips'>";
    idsActuels.forEach(id => {
      chipsHtml += "<span class='chip' data-acteur-id='" + id + "'>" +
        "<button class='chip-modifier' type='button' data-acteur-id='" + id + "' title='Modifier la fiche de cette personne'>👤</button>" +
        "<span class='chip-texte'>" + escapeHtml(ligneActeur(id)) + "</span>" +
        "<button class='chip-retirer' type='button' data-acteur-id='" + id + "' title='Retirer'>×</button>" +
        "</span>";
    });
    chipsHtml += "</div>";
  }

  const optionsDisponibles = acteursTriesParNom.filter(a => !idsActuels.includes(a.id));
  const datalistOptionsHtml = optionsDisponibles.map(a =>
    "<option value=\"" + escapeHtml(a.label) + "\"></option>"
  ).join("");

  const ajoutHtml =
    "<div class='ajout-pp-conteneur'>" +
    "<input type='text' id='input-ajouter-pp' list='datalist-ajouter-pp' placeholder='Tapez un nom...'>" +
    "<datalist id='datalist-ajouter-pp'>" + datalistOptionsHtml + "</datalist>" +
    "<button id='btn-ajouter-pp' type='button'>Ajouter</button>" +
    "<button id='btn-nouvel-acteur-pp' type='button' title='Créer un nouvel acteur'>+</button>" +
    "</div>" +
    "<span class='msg-sauvegarde' id='msg-pp'></span>";

  return chipsHtml + ajoutHtml;
}

// --- Sponsor (puce unique, Ref vers Emergence_Acteurs) ---
function genererSponsorChipHtml(sponsorId) {
  let interieur;
  if (sponsorId) {
    interieur = "<span class='chip' data-acteur-id='" + sponsorId + "'>" +
      "<button class='chip-modifier' type='button' data-acteur-id='" + sponsorId + "' title='Modifier la fiche de cette personne'>👤</button>" +
      "<span class='chip-texte'>" + escapeHtml(ligneActeur(sponsorId)) + "</span>" +
      "<button class='chip-retirer' type='button' id='btn-effacer-sponsor' title='Retirer le sponsor'>×</button>" +
      "</span>";
  } else {
    interieur = "<span class='pp-vide' style='margin-bottom:0;'>Aucun sponsor</span>";
  }
  const datalistOptionsHtml = sponsorsCandidats.map(a =>
    "<option value=\"" + escapeHtml(a.label) + "\"></option>"
  ).join("");
  return (
    "<div class='chips-conteneur chip-champ-unique' id='sponsor-chip-zone'>" + interieur + "</div>" +
    "<div class='ajout-pp-conteneur'>" +
    "<input type='text' id='sponsor-input' list='datalist-sponsor' placeholder='Tapez un nom...'>" +
    "<datalist id='datalist-sponsor'>" + datalistOptionsHtml + "</datalist>" +
    "<button id='btn-nouvel-acteur-sponsor' type='button' title='Créer un nouvel acteur'>+</button>" +
    "</div>" +
    "<span class='msg-sauvegarde' id='msg-sponsor'></span>"
  );
}

// --- Porteurs (puce unique, Choix texte libre — pas une référence à Emergence_Acteurs) ---
function genererPorteursChipHtml(texteActuel) {
  let interieur;
  if (texteActuel) {
    // Si le texte correspond exactement à un acteur connu, on propose l'icône d'édition.
    const candidat = sponsorsCandidats.find(a => normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texteActuel));
    const idPourEdition = candidat ? candidat.id : null;
    interieur = "<span class='chip'" + (idPourEdition ? " data-acteur-id='" + idPourEdition + "'" : "") + ">" +
      (idPourEdition ? "<button class='chip-modifier' type='button' data-acteur-id='" + idPourEdition + "' title='Modifier la fiche de cette personne'>👤</button>" : "") +
      "<span class='chip-texte'>" + escapeHtml(texteActuel) + "</span>" +
      "<button class='chip-retirer' type='button' id='btn-effacer-porteurs' title='Effacer'>×</button>" +
      "</span>";
  } else {
    interieur = "<span class='pp-vide' style='margin-bottom:0;'>Aucun porteur</span>";
  }
  const datalistOptionsHtml = sponsorsCandidats.map(a =>
    "<option value=\"" + escapeHtml(a.label) + "\"></option>"
  ).join("");
  return (
    "<div class='chips-conteneur chip-champ-unique' id='porteurs-chip-zone'>" + interieur + "</div>" +
    "<div class='ajout-pp-conteneur'>" +
    "<input type='text' id='porteurs-input' list='datalist-porteurs' placeholder='Tapez un nom...'>" +
    "<datalist id='datalist-porteurs'>" + datalistOptionsHtml + "</datalist>" +
    "<button id='btn-nouvel-acteur-porteurs' type='button' title='Créer un nouvel acteur'>+</button>" +
    "</div>" +
    "<span class='msg-sauvegarde' id='msg-porteurs'></span>"
  );
}

// --- RIDA éditable ---
function optionsRidaTypeHtml(valeurActuelle) {
  const choix = ["I", "D", "A"];
  let html = "<option value=''" + (!valeurActuelle ? " selected" : "") + ">—</option>";
  choix.forEach(v => {
    html += "<option value=\"" + v + "\"" + (v === valeurActuelle ? " selected" : "") + ">" + v + "</option>";
  });
  return html;
}

function ajusterHauteurTextarea(textarea) {
  textarea.style.height = "22px";
  const nouvelleHauteur = Math.max(22, textarea.scrollHeight);
  textarea.style.height = nouvelleHauteur + "px";
}

function genererLigneRidaEditable(r) {
  // Pour une ligne RIDA de type "I" (Information), "Fait le" suit toujours "Pour le" : le champ
  // est verrouillé (lecture seule, pas de croix pour l'effacer séparément).
  const estInformation = r.RIDA === "I";
  const valeurFaitLe = estInformation ? r.Pour_le : r.Fait_le;
  return "<tr data-rida-id='" + r.id + "'>" +
    "<td><select class='rida-input' data-field='RIDA'>" + optionsRidaTypeHtml(r.RIDA) + "</select></td>" +
    "<td>" + genererCelluleRidaPorteurHtml(r) + "</td>" +
    "<td><div class='champ-avec-effacer'>" +
    "<input type='date' class='rida-input' data-field='Pour_le' value=\"" + dateEpochVersInput(r.Pour_le) + "\">" +
    "<button type='button' class='btn-effacer-date-rida' data-field='Pour_le' title='Effacer la date'>✕</button>" +
    "</div></td>" +
    "<td><div class='champ-avec-effacer'>" +
    "<input type='date' class='rida-input rida-fait-le' data-field='Fait_le' value=\"" + dateEpochVersInput(valeurFaitLe) + "\"" +
    (estInformation ? " disabled title='Pour un RIDA de type I, Fait le est automatiquement aligné sur Pour le'" : "") + ">" +
    (estInformation ? "" : "<button type='button' class='btn-effacer-date-rida' data-field='Fait_le' title='Effacer la date'>✕</button>") +
    "</div></td>" +
    "<td><textarea class='rida-input rida-description' data-field='Description'>" + escapeHtml(r.Description) + "</textarea></td>" +
    "<td class='rida-actions'>" +
    "<button class='btn-rida-delete' type='button' title='Supprimer cette ligne'>🗑</button>" +
    "</td>" +
    "</tr>";
}

// Porteur d'une ligne RIDA : puce bleue (comme Sponsor/Porteurs/Parties prenantes) quand
// une valeur est définie, sinon champ de saisie avec autocomplétion. Texte libre accepté
// (Porteur n'est pas une référence vers Emergence_Acteurs), mais si le texte correspond à
// un acteur connu, l'icône 👤 permet d'ouvrir sa fiche.
function genererCelluleRidaPorteurHtml(r) {
  const texteActuel = r.Porteur || "";
  let interieur;
  if (texteActuel) {
    const candidat = acteursTriesParNom.find(a => normaliserTexteRecherche(nomActeurParId(a.id)) === normaliserTexteRecherche(texteActuel));
    const idPourEdition = candidat ? candidat.id : null;
    interieur = "<span class='chip'" + (idPourEdition ? " data-acteur-id='" + idPourEdition + "'" : "") + ">" +
      (idPourEdition ? "<button class='chip-modifier' type='button' data-acteur-id='" + idPourEdition + "' title='Modifier la fiche de cette personne'>👤</button>" : "") +
      "<span class='chip-texte'>" + escapeHtml(texteActuel) + "</span>" +
      "<button class='chip-retirer btn-effacer-rida-porteur' type='button' data-rida-id='" + r.id + "' title='Effacer'>×</button>" +
      "</span>";
  } else {
    interieur = "";
  }
  const datalistId = "datalist-rida-porteur-" + r.id;
  const optionsActeurs = [...new Set(
    acteursTriesParNom.map(a => nomActeurParId(a.id)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b))
    .map(nom => "<option value=\"" + escapeHtml(nom) + "\"></option>")
    .join("");
  const ajoutHtml = texteActuel ? "" : (
    "<div class='ajout-pp-conteneur ajout-pp-conteneur-compact'>" +
    "<input type='text' class='rida-porteur-ajout-input' data-rida-id='" + r.id + "' list='" + datalistId + "' placeholder='Tapez un nom...'>" +
    "<datalist id='" + datalistId + "'>" + optionsActeurs + "</datalist>" +
    "<button type='button' class='btn-nouvel-acteur-rida' data-rida-id='" + r.id + "' title='Créer un nouvel acteur'>+</button>" +
    "</div>"
  );
  return (
    "<div class='chips-conteneur chip-champ-unique chip-champ-compact'>" + interieur + "</div>" +
    ajoutHtml
  );
}

function genererTableauRidaEditable(ridaLies) {
  let lignesHtml = "";
  ridaLies.forEach(r => { lignesHtml += genererLigneRidaEditable(r); });

  return (
    "<table class='tableau-fiche tableau-rida-editable'>" +
    "<thead><tr><th style='width:12%;'>RIDA</th><th style='width:16%;'>Porteur</th>" +
    "<th style='width:12%;' data-col-rida='Pour_le' class='rida-th-triable'>Pour le <span class='fleche-rida'></span></th><th style='width:12%;'>Fait le</th>" +
    "<th>Description</th><th style='width:90px;'></th></tr></thead>" +
    "<tbody id='rida-tbody'>" + lignesHtml + "</tbody>" +
    "</table>" +
    "<button id='btn-ajouter-rida' class='btn-ajouter-rida' type='button'>+ Ajouter une ligne RIDA</button>" +
    "<span class='msg-sauvegarde' id='msg-rida'></span>"
  );
}

// --- Fiche détaillée ---
function afficherFiche(ligne) {
  const conteneur = document.getElementById("fiche-container");

  const sponsorId = ligne.Sponsor || null;
  const partiesPrenantesEditableHtml = genererPartiesPrenantesHtml(ligne);

  const champsRestants = [
    ["Orientation", ligne.Orientation],
    ["Lien vers fiche DS", ligne.Lien_vers_fiche_DS],
    ["Porteurs2", ligne.Porteurs2],
    ["Vecteur de remontée terrain", ligne.Vecteur_de_remontee_terrain],
    ["Nom Prénom demandeurs", ligne.Nom_Prenom_demandeurs],
    ["Territoire", ligne.Territoire],
    ["Problématique transverse", ligne.Problematique_transverse],
    ["ID Note", ligne.ID_Note],
    ["Piste de communs", ligne.Piste_de_communs],
    ["Périmètre d'impact", ligne.Perimetre_d_impact2],
    ["Causes racines de l'irritant", ligne.Causes_racines_de_l_irritant],
    ["Synthèse reformulation", ligne.Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement],
    ["ID", ligne.ID2],
    ["Synthèse de la demande", ligne.Synthese_de_la_demande],
    ["Politique Publique concernée", ligne.Politique_Publique_concernee],
    ["Contributeurs SDID", ligne.Contributeurs_SDID],
    ["Organisation Id", ligne.Organisation_Id]
  ];
  const listeChamps = champsRestants.map(([label, val]) =>
    "<li><b>" + label + " :</b> " + valeurOuTiret(val) + "</li>"
  ).join("");

  const pjLiees = pjToutes.filter(pj => {
    const refId = idDepuisRef(pj.ID2);
    return refId === ligne.id || (ligne.ID_Note && refId === ligne.ID_Note);
  });
  let pjLignesHtml = "";
  pjLiees.forEach(pj => {
    const titre = pj.Titre || "Sans titre";
    const fichiers = refListVersIds(pj.Lien);
    if (fichiers.length === 0) {
      pjLignesHtml += "<tr><td>" + titre + "</td><td>—</td><td>—</td></tr>";
    } else {
      fichiers.forEach(attId => {
        const url = GRIST_BASE_URL + "/api/docs/" + DOC_ID + "/attachments/" + attId + "/download";
        pjLignesHtml += "<tr><td>" + titre + "</td><td>Fichier " + attId + "</td>" +
          "<td><a href='" + url + "' target='_blank'>Télécharger</a></td></tr>";
      });
    }
  });
  const pjContenu = pjLignesHtml
    ? "<table class='tableau-fiche'><thead><tr><th>Titre</th><th>Fichier</th><th>Lien</th></tr></thead><tbody>" + pjLignesHtml + "</tbody></table>"
    : "<span style='color:#bbb;'>Aucune pièce jointe trouvée</span>";
  const pjContenuAvecBouton = pjContenu + "<button id='btn-ajouter-pj' class='btn-ajouter-rida' type='button'>+ Ajouter une pièce jointe</button>";

  const ridaLies = ridaToutes.filter(r => idDepuisRef(r.ID2) === ligne.id);
  if (triRidaColonne === "Pour_le") {
    ridaLies.sort((a, b) => {
      const vA = a.Pour_le || 0, vB = b.Pour_le || 0;
      return triRidaSens === "asc" ? vA - vB : vB - vA;
    });
  }
  const ridaContenu = genererTableauRidaEditable(ridaLies);

  // --- Champ Sponsor (puce bleue, comme Parties prenantes — un seul acteur référencé) ---
  const sponsorChampHtml = genererSponsorChipHtml(sponsorId);

  // --- Champ Porteurs (puce bleue — Choix unique donc valeur texte libre, pas une référence) ---
  const porteursChampHtml = genererPorteursChipHtml(ligne.Porteurs || "");

  // --- Select Statut (coloré) ---
  const optionsStatut = Object.keys(COULEURS_STATUT).map(s =>
    "<option value=\"" + escapeHtml(s) + "\"" + (s === ligne.Statut ? " selected" : "") + ">" + escapeHtml(s) + "</option>"
  ).join("");
  const statutSelectHtml =
    "<select id='statut-select'>" + optionsStatut + "</select>" +
    "<span class='msg-sauvegarde' id='msg-statut'></span>";

  // --- Select Priorité ---
  const optionsPriorite = CHOIX_PRIORITE.map(p =>
    "<option value=\"" + escapeHtml(p) + "\"" + (p === ligne.Priorite ? " selected" : "") + ">" + escapeHtml(p) + "</option>"
  ).join("");
  const prioriteSelectHtml =
    "<select id='priorite-select'>" +
    "<option value=''" + (!ligne.Priorite ? " selected" : "") + ">—</option>" +
    optionsPriorite +
    "</select>" +
    "<span class='msg-sauvegarde' id='msg-priorite'></span>";

  // --- Select Typologie de la demande ---
  let choixTypologie = CHOIX_TYPOLOGIE.slice();
  if (ligne.Typologie_de_la_demande && !choixTypologie.includes(ligne.Typologie_de_la_demande)) {
    choixTypologie = choixTypologie.concat([ligne.Typologie_de_la_demande]);
  }
  const optionsTypologie = choixTypologie.map(v =>
    "<option value=\"" + escapeHtml(v) + "\"" + (v === ligne.Typologie_de_la_demande ? " selected" : "") + ">" + escapeHtml(v) + "</option>"
  ).join("");
  const typologieSelectHtml =
    "<select id='typologie-select'>" +
    "<option value=''" + (!ligne.Typologie_de_la_demande ? " selected" : "") + ">—</option>" +
    optionsTypologie +
    "</select>" +
    "<span class='msg-sauvegarde' id='msg-typologie'></span>";

  conteneur.innerHTML = `
    <div class="bandeau">
      <div class="bandeau-corps">
        <div>
          <div class="zone" style="grid-template-columns: 1fr; border-bottom:none; padding-bottom:0;">
            <div class="champ-editable-inline champ-titre-editable">
              <input type="text" id="titre-input" value="${escapeHtml(ligne.Titre || "")}" placeholder="Titre de la demande">
              <span class="msg-sauvegarde" id="msg-titre"></span>
            </div>
          </div>
          <div class="zone" style="grid-template-columns: 1fr;">
            <div class="champ-editable">
              <div class="champ-label">Objet de la demande</div>
              ${champMarkdownHtml("objet", ligne.Objet_de_la_demande, null, null)}
            </div>
          </div>
          <div class="zone" style="grid-template-columns: repeat(3, 1fr);">
            <div class="champ-editable-inline">
              <div class="champ-label">Organisation qui émet la demande</div>
              <input type="text" id="organisation-input" value="${escapeHtml(ligne.Organisation)}">
              <span class="msg-sauvegarde" id="msg-organisation"></span>
            </div>
            <div class="champ-editable-inline">
              <div class="champ-label">Sponsor</div>
              ${sponsorChampHtml}
            </div>
            <div class="champ-editable-inline">
              <div class="champ-label">Porteurs</div>
              ${porteursChampHtml}
            </div>
          </div>
          <div class="zone" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); border-bottom:none;">
            <div class="champ-editable-inline"><div class="champ-label">Priorité</div>${prioriteSelectHtml}</div>
            <div class="champ-editable-inline">
              <div class="champ-label">Statut</div>
              ${statutSelectHtml}
            </div>
            <div class="champ-editable-inline">
              <div class="champ-label">Date de soumission</div>
              <input type="date" id="date-soumission-input" value="${dateEpochVersInput(ligne.Date_de_soumission)}">
              <span class="msg-sauvegarde" id="msg-date-soumission"></span>
            </div>
            <div class="champ-editable-inline">
              <div class="champ-label">Date de cloture</div>
              <input type="date" id="date-cloture-input" value="${dateEpochVersInput(ligne.Date_de_cloture)}">
              <span class="msg-sauvegarde" id="msg-date-cloture"></span>
            </div>
          </div>
        </div>
        <div class="col-droite">
          <div class="col-droite-entete">
            <div class="champ-label">Parties prenantes concernées</div>
            <button type="button" id="btn-ouvrir-gestion-acteurs" class="btn-icone-gestion" title="Gérer la liste des acteurs">👥</button>
          </div>
          ${partiesPrenantesEditableHtml}
        </div>
      </div>
    </div>

    <div class="tabbar">
      <button class="tab-btn ${ongletActif === 'rida' ? 'active' : ''}" data-tab="rida">RIDA</button>
      <button class="tab-btn ${ongletActif === 'general' ? 'active' : ''}" data-tab="general">Général</button>
      <button class="tab-btn ${ongletActif === 'main-courante' ? 'active' : ''}" data-tab="main-courante">Main courante</button>
      <button class="tab-btn ${ongletActif === 'autres' ? 'active' : ''}" data-tab="autres">Autres champs</button>
      <button class="tab-btn ${ongletActif === 'pj' ? 'active' : ''}" data-tab="pj">Pièces jointes</button>
    </div>
    <div class="tab-panel ${ongletActif === 'rida' ? 'active' : ''}" data-panel="rida">${ridaContenu}</div>
    <div class="tab-panel ${ongletActif === 'general' ? 'active' : ''}" data-panel="general">
      <div class="champ-editable-inline" style="margin-bottom:10px;">
        <div class="champ-label">Typologie de la demande</div>
        ${typologieSelectHtml}
      </div>
      <div class="champ-editable">
        <div class="champ-label">Détail de la demande</div>
        ${champMarkdownHtml("detail", ligne.Detail_de_la_demande, "textarea-pleine-hauteur", "boite-pleine-hauteur")}
      </div>
    </div>
    <div class="tab-panel ${ongletActif === 'main-courante' ? 'active' : ''}" data-panel="main-courante">
      <div class="champ-editable">
        ${champMarkdownHtml("main-courante", ligne.Main_courante, "textarea-longue")}
      </div>
    </div>
    <div class="tab-panel ${ongletActif === 'autres' ? 'active' : ''}" data-panel="autres">
      <ul class="liste-champs">${listeChamps}</ul>
    </div>
    <div class="tab-panel ${ongletActif === 'pj' ? 'active' : ''}" data-panel="pj">${pjContenuAvecBouton}</div>
  `;

  conteneur.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      ongletActif = btn.getAttribute("data-tab");
      conteneur.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      conteneur.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      conteneur.querySelector(".tab-panel[data-panel='" + ongletActif + "']").classList.add("active");
    });
  });

  // --- Sauvegarde générique d'un champ simple de la table Emergence ---
  async function sauverChampEmergence(champ, valeur, msgEl) {
    msgEl.textContent = "";
    msgEl.className = "msg-sauvegarde";
    try {
      await appliquerActions([
        ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { [champ]: valeur }]
      ]);
      await rechargerEmergenceEtRafraichir(ligne.id);
    } catch (err) {
      msgEl.textContent = "Erreur : " + err.message;
      msgEl.className = "msg-sauvegarde erreur";
    }
  }

  // --- Ouverture de la modale "Gérer les acteurs" ---
  const btnOuvrirGestionActeurs = conteneur.querySelector("#btn-ouvrir-gestion-acteurs");
  if (btnOuvrirGestionActeurs) {
    btnOuvrirGestionActeurs.addEventListener("click", ouvrirModaleGestionActeurs);
  }

  // --- Objet / Détail / Main courante : rendu markdown avec bascule "Modifier" ---
  initChampMarkdown(conteneur, "objet", "Objet_de_la_demande", ligne.Objet_de_la_demande || "", ligne.id);
  initChampMarkdown(conteneur, "detail", "Detail_de_la_demande", ligne.Detail_de_la_demande || "", ligne.id);
  initChampMarkdown(conteneur, "main-courante", "Main_courante", ligne.Main_courante || "", ligne.id);

  // --- Édition du Titre (texte court, sauvegarde à la perte de focus) ---
  const titreInput = conteneur.querySelector("#titre-input");
  const msgTitre = conteneur.querySelector("#msg-titre");
  const valeurInitialeTitre = ligne.Titre || "";

  titreInput.addEventListener("blur", () => {
    if (titreInput.value !== valeurInitialeTitre) {
      sauverChampEmergence("Titre", titreInput.value, msgTitre);
    }
  });
  titreInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") titreInput.blur();
  });

  // --- Édition de l'Organisation (texte court, sauvegarde à la perte de focus) ---
  const organisationInput = conteneur.querySelector("#organisation-input");
  const msgOrganisation = conteneur.querySelector("#msg-organisation");
  const valeurInitialeOrganisation = ligne.Organisation || "";

  organisationInput.addEventListener("blur", () => {
    if (organisationInput.value !== valeurInitialeOrganisation) {
      sauverChampEmergence("Organisation", organisationInput.value, msgOrganisation);
    }
  });
  organisationInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") organisationInput.blur();
  });

  // --- Édition du Sponsor (puce bleue + champ d'ajout avec autocomplétion) ---
  const sponsorInput = conteneur.querySelector("#sponsor-input");
  const msgSponsor = conteneur.querySelector("#msg-sponsor");

  sponsorInput.addEventListener("change", () => {
    const texteTape = sponsorInput.value.trim();
    if (!texteTape) return;
    const candidat = acteursTriesParNom.find(a => normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texteTape));
    if (!candidat) {
      if (analyserTexteActeurColle(texteTape)) {
        // Texte au format "NOM Prénom - Organisation <mail>" : on ouvre directement la
        // création d'un nouvel acteur avec les champs pré-remplis plutôt que d'afficher une erreur.
        sponsorInput.value = "";
        ouvrirModaleActeur("sponsor", texteTape);
        return;
      }
      msgSponsor.textContent = "Aucune correspondance pour « " + texteTape + " ».";
      msgSponsor.className = "msg-sauvegarde erreur";
      return;
    }
    sponsorInput.value = "";
    sauverChampEmergence("Sponsor", candidat.id, msgSponsor);
  });
  conteneur.querySelector("#btn-nouvel-acteur-sponsor").addEventListener("click", () => {
    ouvrirModaleActeur("sponsor", sponsorInput.value.trim());
  });
  const sponsorChipZone = conteneur.querySelector("#sponsor-chip-zone");
  sponsorChipZone.addEventListener("click", (e) => {
    if (e.target.id === "btn-effacer-sponsor") {
      sauverChampEmergence("Sponsor", null, msgSponsor);
    } else if (e.target.classList.contains("chip-modifier")) {
      ouvrirModaleEditionActeur(parseInt(e.target.getAttribute("data-acteur-id"), 10));
    }
  });

  // --- Édition des Porteurs (puce bleue + champ d'ajout, valeur texte libre acceptée) ---
  const porteursInput = conteneur.querySelector("#porteurs-input");
  const msgPorteurs = conteneur.querySelector("#msg-porteurs");

  porteursInput.addEventListener("change", () => {
    const texteTape = porteursInput.value.trim();
    if (!texteTape) return;
    // Normalise sur la casse/l'orthographe d'un candidat existant si trouvé, sinon accepte le texte tel quel
    const candidat = sponsorsCandidats.find(a => normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texteTape));
    if (!candidat && analyserTexteActeurColle(texteTape)) {
      // Texte au format "NOM Prénom - Organisation <mail>" : on propose de créer un acteur
      // à part entière plutôt que d'enregistrer le texte brut collé comme Porteur.
      porteursInput.value = "";
      ouvrirModaleActeur("porteurs", texteTape);
      return;
    }
    porteursInput.value = "";
    sauverChampEmergence("Porteurs", candidat ? candidat.label : texteTape, msgPorteurs);
  });
  conteneur.querySelector("#btn-nouvel-acteur-porteurs").addEventListener("click", () => {
    ouvrirModaleActeur("porteurs", porteursInput.value.trim());
  });
  const porteursChipZone = conteneur.querySelector("#porteurs-chip-zone");
  porteursChipZone.addEventListener("click", (e) => {
    if (e.target.id === "btn-effacer-porteurs") {
      sauverChampEmergence("Porteurs", null, msgPorteurs);
    } else if (e.target.classList.contains("chip-modifier")) {
      ouvrirModaleEditionActeur(parseInt(e.target.getAttribute("data-acteur-id"), 10));
    }
  });

  // --- Édition du Statut (select coloré, sauvegarde immédiate) ---
  const statutSelect = conteneur.querySelector("#statut-select");
  const msgStatut = conteneur.querySelector("#msg-statut");
  statutSelect.addEventListener("change", () => {
    sauverChampEmergence("Statut", statutSelect.value, msgStatut);
  });

  // --- Édition de la Priorité (select, sauvegarde immédiate) ---
  const prioriteSelect = conteneur.querySelector("#priorite-select");
  const msgPriorite = conteneur.querySelector("#msg-priorite");
  prioriteSelect.addEventListener("change", () => {
    sauverChampEmergence("Priorite", prioriteSelect.value || null, msgPriorite);
  });

  // --- Édition de la Typologie de la demande (select, sauvegarde immédiate) ---
  const typologieSelect = conteneur.querySelector("#typologie-select");
  const msgTypologie = conteneur.querySelector("#msg-typologie");
  typologieSelect.addEventListener("change", () => {
    sauverChampEmergence("Typologie_de_la_demande", typologieSelect.value || null, msgTypologie);
  });

  // --- Édition des dates de soumission et de clôture (sauvegarde immédiate au changement) ---
  const dateSoumissionInput = conteneur.querySelector("#date-soumission-input");
  const msgDateSoumission = conteneur.querySelector("#msg-date-soumission");
  dateSoumissionInput.addEventListener("change", () => {
    sauverChampEmergence("Date_de_soumission", inputVersDateEpoch(dateSoumissionInput.value), msgDateSoumission);
  });

  const dateClotureInput = conteneur.querySelector("#date-cloture-input");
  const msgDateCloture = conteneur.querySelector("#msg-date-cloture");
  dateClotureInput.addEventListener("change", () => {
    sauverChampEmergence("Date_de_cloture", inputVersDateEpoch(dateClotureInput.value), msgDateCloture);
  });

  // --- Édition des parties prenantes (ajout / retrait) ---
  const msgPp = conteneur.querySelector("#msg-pp");

  async function sauverPartiesPrenantes(nouveauxIds) {
    msgPp.textContent = "";
    msgPp.className = "msg-sauvegarde";
    try {
      await appliquerActions([
        ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Parties_prenantes_concernees: ["L"].concat(nouveauxIds) }]
      ]);
      await rechargerEmergenceEtRafraichir(ligne.id);
    } catch (err) {
      msgPp.textContent = "Erreur : " + err.message;
      msgPp.className = "msg-sauvegarde erreur";
    }
  }

  const inputAjouterPp = conteneur.querySelector("#input-ajouter-pp");
  const btnAjouterPp = conteneur.querySelector("#btn-ajouter-pp");
  if (inputAjouterPp && btnAjouterPp) {
    function tenterAjoutPartiePrenante() {
      const texteTape = inputAjouterPp.value.trim();
      if (!texteTape) return;
      const idsActuels = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));
      const candidat = acteursTriesParNom.find(a =>
        !idsActuels.includes(a.id) && normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texteTape)
      );
      if (!candidat) {
        if (analyserTexteActeurColle(texteTape)) {
          // Texte au format "NOM Prénom - Organisation <mail>" : on ouvre directement la
          // création d'un nouvel acteur avec les champs pré-remplis plutôt que d'afficher une erreur.
          inputAjouterPp.value = "";
          ouvrirModaleActeur("partie-prenante", texteTape);
          return;
        }
        msgPp.textContent = "Aucune correspondance trouvée pour « " + texteTape + " ».";
        msgPp.className = "msg-sauvegarde erreur";
        return;
      }
      inputAjouterPp.value = "";
      sauverPartiesPrenantes(idsActuels.concat([candidat.id]));
    }
    btnAjouterPp.addEventListener("click", tenterAjoutPartiePrenante);
    inputAjouterPp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); tenterAjoutPartiePrenante(); }
    });
  }
  const btnNouvelActeurPp = conteneur.querySelector("#btn-nouvel-acteur-pp");
  if (btnNouvelActeurPp) {
    btnNouvelActeurPp.addEventListener("click", () => {
      ouvrirModaleActeur("partie-prenante", inputAjouterPp ? inputAjouterPp.value.trim() : "");
    });
  }

  const chipsConteneur = conteneur.querySelector("#pp-chips");
  if (chipsConteneur) {
    chipsConteneur.addEventListener("click", (e) => {
      if (e.target.classList.contains("chip-retirer")) {
        const idARetirer = parseInt(e.target.getAttribute("data-acteur-id"), 10);
        const idsActuels = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));
        sauverPartiesPrenantes(idsActuels.filter(id => id !== idARetirer));
      }
      if (e.target.classList.contains("chip-modifier")) {
        ouvrirModaleEditionActeur(parseInt(e.target.getAttribute("data-acteur-id"), 10));
      }
    });
  }

  // --- Tri de la table RIDA sur "Pour le" ---
  const thPourLe = conteneur.querySelector("[data-col-rida='Pour_le']");
  if (thPourLe) {
    const flecheRida = thPourLe.querySelector(".fleche-rida");
    if (flecheRida) {
      flecheRida.textContent = triRidaColonne === "Pour_le" ? (triRidaSens === "asc" ? "▲" : "▼") : "";
    }
    thPourLe.addEventListener("click", () => {
      if (triRidaColonne === "Pour_le") triRidaSens = triRidaSens === "asc" ? "desc" : "asc";
      else { triRidaColonne = "Pour_le"; triRidaSens = "asc"; }
      afficherFiche(ligne);
    });
  }

  // --- Édition des lignes RIDA ---
  const ridaTbody = conteneur.querySelector("#rida-tbody");
  const msgRida = conteneur.querySelector("#msg-rida");

  if (ridaTbody) {
    // Ajuste la hauteur de chaque textarea Description à son contenu actuel au chargement
    ridaTbody.querySelectorAll(".rida-description").forEach(ajusterHauteurTextarea);

    // --- Sauvegarde automatique d'une ligne RIDA (plus de bouton "Enregistrer") ---
    async function sauvegarderLigneRida(tr) {
      const ridaId = parseInt(tr.getAttribute("data-rida-id"), 10);
      const champs = {};
      tr.querySelectorAll(".rida-input").forEach(input => {
        const field = input.getAttribute("data-field");
        if (field === "Pour_le" || field === "Fait_le") {
          champs[field] = inputVersDateEpoch(input.value);
        } else {
          champs[field] = input.value;
        }
      });
      // RIDA de type "I" (Information) : Fait le n'est jamais saisi séparément, il suit
      // toujours Pour le (y compris quand on vient de basculer le type sur "I", ou quand on
      // modifie Pour le alors que le type est déjà "I").
      if (champs.RIDA === "I") {
        champs.Fait_le = champs.Pour_le;
      }
      msgRida.textContent = "";
      msgRida.className = "msg-sauvegarde";
      try {
        await appliquerActions([
          ["UpdateRecord", TABLE_RIDA, ridaId, champs]
        ]);
        await rechargerRidaEtRafraichir(ligne.id);
      } catch (err) {
        msgRida.textContent = "Erreur : " + err.message;
        msgRida.className = "msg-sauvegarde erreur";
      }
    }

    ridaTbody.addEventListener("input", (e) => {
      if (e.target.classList.contains("rida-description")) {
        ajusterHauteurTextarea(e.target);
      }
    });

    // Select (type RIDA) et dates : sauvegarde dès la sélection/le changement.
    ridaTbody.addEventListener("change", (e) => {
      if (e.target.matches("select.rida-input, input[type='date'].rida-input")) {
        sauvegarderLigneRida(e.target.closest("tr"));
      }
    });

    // Texte libre (Porteur) et description : sauvegarde à la perte de focus.
    // "focusout" (contrairement à "blur") remonte jusqu'au tbody, pas besoin de capture.
    ridaTbody.addEventListener("focusout", (e) => {
      if (e.target.matches("input[type='text'].rida-input, textarea.rida-input")) {
        sauvegarderLigneRida(e.target.closest("tr"));
      }
    });

    // Sauvegarde du seul champ Porteur (puce bleue, pas un .rida-input générique)
    async function sauvegarderPorteurRida(ridaId, valeur) {
      msgRida.textContent = "";
      msgRida.className = "msg-sauvegarde";
      try {
        await appliquerActions([
          ["UpdateRecord", TABLE_RIDA, ridaId, { Porteur: valeur }]
        ]);
        await rechargerRidaEtRafraichir(ligne.id);
      } catch (err) {
        msgRida.textContent = "Erreur : " + err.message;
        msgRida.className = "msg-sauvegarde erreur";
      }
    }

    // Champ d'ajout du Porteur (texte + autocomplétion, valeur libre acceptée)
    ridaTbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("rida-porteur-ajout-input")) {
        const ridaId = parseInt(e.target.getAttribute("data-rida-id"), 10);
        const texteTape = e.target.value.trim();
        if (!texteTape) return;
        const candidat = acteursTriesParNom.find(a => normaliserTexteRecherche(nomActeurParId(a.id)) === normaliserTexteRecherche(texteTape));
        sauvegarderPorteurRida(ridaId, candidat ? nomActeurParId(candidat.id) : texteTape);
      }
    });

    ridaTbody.addEventListener("click", async (e) => {
      // Effacer une date (Pour le / Fait le)
      if (e.target.classList.contains("btn-effacer-date-rida")) {
        const tr = e.target.closest("tr");
        const input = e.target.previousElementSibling;
        input.value = "";
        await sauvegarderLigneRida(tr);
        return;
      }

      // Effacer le Porteur (puce)
      if (e.target.classList.contains("btn-effacer-rida-porteur")) {
        const ridaId = parseInt(e.target.getAttribute("data-rida-id"), 10);
        await sauvegarderPorteurRida(ridaId, "");
        return;
      }

      // Modifier la fiche de l'acteur affiché comme Porteur
      if (e.target.classList.contains("chip-modifier")) {
        ouvrirModaleEditionActeur(parseInt(e.target.getAttribute("data-acteur-id"), 10));
        return;
      }

      // Supprimer une ligne RIDA
      if (e.target.classList.contains("btn-rida-delete")) {
        const tr = e.target.closest("tr");
        const ridaId = parseInt(tr.getAttribute("data-rida-id"), 10);
        if (!confirm("Supprimer cette ligne RIDA ?")) return;
        try {
          await appliquerActions([
            ["RemoveRecord", TABLE_RIDA, ridaId]
          ]);
          await rechargerRidaEtRafraichir(ligne.id);
        } catch (err) {
          msgRida.textContent = "Erreur lors de la suppression : " + err.message;
          msgRida.className = "msg-sauvegarde erreur";
        }
      }

      // Créer un nouvel acteur pour le Porteur de cette ligne RIDA
      if (e.target.classList.contains("btn-nouvel-acteur-rida")) {
        const ridaId = parseInt(e.target.getAttribute("data-rida-id"), 10);
        const inputPorteur = e.target.closest("tr").querySelector(".rida-porteur-ajout-input");
        ouvrirModaleActeur({ type: "rida-porteur", ridaId: ridaId }, inputPorteur ? inputPorteur.value.trim() : "");
      }
    });
  }

  const btnAjouterRida = conteneur.querySelector("#btn-ajouter-rida");
  if (btnAjouterRida) {
    btnAjouterRida.addEventListener("click", async () => {
      btnAjouterRida.disabled = true;
      try {
        await appliquerActions([
          ["AddRecord", TABLE_RIDA, null, {
            ID2: ligne.id,
            RIDA: "I",
            Pour_le: aujourdHuiEpoch(),
            Fait_le: aujourdHuiEpoch() // RIDA "I" : Fait le suit toujours Pour le, y compris à la création.
            // Porteur volontairement laissé vide à la création.
          }]
        ]);
        await rechargerRidaEtRafraichir(ligne.id);
      } catch (err) {
        msgRida.textContent = "Erreur lors de l'ajout : " + err.message;
        msgRida.className = "msg-sauvegarde erreur";
      } finally {
        btnAjouterRida.disabled = false;
      }
    });
  }

  // --- Ouverture de la modale "Ajouter une pièce jointe" ---
  const btnAjouterPj = conteneur.querySelector("#btn-ajouter-pj");
  if (btnAjouterPj) {
    btnAjouterPj.addEventListener("click", () => {
      document.getElementById("modale-pj-titre").value = "";
      document.getElementById("modale-pj-fichier").value = "";
      document.getElementById("modale-pj-msg").textContent = "";
      document.getElementById("modale-pj-fond").style.display = "flex";
    });
  }
}

// --- Modale : gérer la liste complète des acteurs ---
let filtreGestionActeurNom = "";
let filtreGestionActeurOrg = "";
let triGestionActeurColonne = "Nom_et_Prenom";
let triGestionActeurSens = "asc";

function genererLigneGestionActeur(id) {
  const info = acteursParId[id] || {};
  return "<tr data-acteur-id='" + id + "'>" +
    "<td><input type='text' class='acteur-input' data-field='Nom_et_Prenom' value=\"" + escapeHtml(info.Nom_et_Prenom) + "\"></td>" +
    "<td><input type='text' class='acteur-input' data-field='Organisation' value=\"" + escapeHtml(info.Organisation) + "\"></td>" +
    "<td><input type='text' class='acteur-input' data-field='Organisation_Path' value=\"" + escapeHtml(info.Organisation_Path) + "\"></td>" +
    "<td><input type='text' class='acteur-input' data-field='Role' value=\"" + escapeHtml(info.Role) + "\"></td>" +
    "<td><input type='text' class='acteur-input' data-field='mail' value=\"" + escapeHtml(info.mail) + "\"></td>" +
    "<td class='rida-actions'>" +
    "<button class='btn-rida-delete' type='button' title='Supprimer cet acteur'>🗑</button>" +
    "</td></tr>";
}

function rafraichirTableauGestionActeurs() {
  const tbody = document.getElementById("tbody-gestion-acteurs");
  let ids = Object.keys(acteursParId).map(Number);

  if (filtreGestionActeurNom) {
    const q = normaliserTexteRecherche(filtreGestionActeurNom);
    ids = ids.filter(id => normaliserTexteRecherche((acteursParId[id] && acteursParId[id].Nom_et_Prenom) || "").indexOf(q) !== -1);
  }
  if (filtreGestionActeurOrg) {
    const q = normaliserTexteRecherche(filtreGestionActeurOrg);
    ids = ids.filter(id => normaliserTexteRecherche((acteursParId[id] && acteursParId[id].Organisation) || "").indexOf(q) !== -1);
  }

  ids.sort((a, b) => {
    const vA = ((acteursParId[a] && acteursParId[a][triGestionActeurColonne]) || "").toLowerCase();
    const vB = ((acteursParId[b] && acteursParId[b][triGestionActeurColonne]) || "").toLowerCase();
    const cmp = vA.localeCompare(vB);
    return triGestionActeurSens === "asc" ? cmp : -cmp;
  });

  tbody.innerHTML = ids.length
    ? ids.map(id => genererLigneGestionActeur(id)).join("")
    : "<tr><td colspan='6' class='chargement'>Aucun acteur trouvé.</td></tr>";

  mettreAJourFlechesGestionActeurs();
}

function mettreAJourFlechesGestionActeurs() {
  document.querySelectorAll("#vue-contacts [data-col-acteur]").forEach(th => {
    const f = th.querySelector(".fleche-rida");
    if (!f) return;
    f.textContent = th.getAttribute("data-col-acteur") === triGestionActeurColonne
      ? (triGestionActeurSens === "asc" ? "▲" : "▼") : "";
  });
}

document.querySelectorAll("#vue-contacts [data-col-acteur]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.getAttribute("data-col-acteur");
    if (triGestionActeurColonne === col) triGestionActeurSens = triGestionActeurSens === "asc" ? "desc" : "asc";
    else { triGestionActeurColonne = col; triGestionActeurSens = "asc"; }
    rafraichirTableauGestionActeurs();
  });
});

document.getElementById("recherche-acteur-nom").addEventListener("input", (e) => {
  filtreGestionActeurNom = e.target.value;
  rafraichirTableauGestionActeurs();
});
document.getElementById("recherche-acteur-organisation").addEventListener("input", (e) => {
  filtreGestionActeurOrg = e.target.value;
  rafraichirTableauGestionActeurs();
});

// La gestion des acteurs était auparavant une modale ; c'est désormais l'onglet "Contacts"
// à part entière (voir basculerVue). Le bouton 👥 de la fiche y bascule directement.
function ouvrirModaleGestionActeurs() {
  basculerVue("contacts");
}

function chargerPageContacts() {
  filtreGestionActeurNom = "";
  filtreGestionActeurOrg = "";
  const champNom = document.getElementById("recherche-acteur-nom");
  const champOrg = document.getElementById("recherche-acteur-organisation");
  if (champNom) champNom.value = "";
  if (champOrg) champOrg.value = "";
  rafraichirTableauGestionActeurs();
  const msg = document.getElementById("modale-acteurs-msg");
  if (msg) msg.textContent = "";
}

async function rafraichirApresChangementActeur() {
  await chargerTablesAnnexes();
  rafraichirTableauGestionActeurs();
  const ligneCourante = lignesEmergence.find(l => l.id === ligneSelectionneeId);
  if (ligneCourante) afficherFiche(ligneCourante);
}

// Sauvegarde automatique à la perte de focus : à la sortie de n'importe quel champ de la
// ligne, on compare les valeurs saisies à celles enregistrées et on n'envoie que les champs
// réellement modifiés (pas d'appel si rien n'a changé).
document.getElementById("tbody-gestion-acteurs").addEventListener("focusout", async (e) => {
  if (!e.target.classList.contains("acteur-input")) return;
  const tr = e.target.closest("tr");
  const acteurId = parseInt(tr.getAttribute("data-acteur-id"), 10);
  const infoActuelle = acteursParId[acteurId] || {};
  const champs = {};
  tr.querySelectorAll(".acteur-input").forEach(input => {
    const champ = input.getAttribute("data-field");
    if (input.value !== (infoActuelle[champ] || "")) champs[champ] = input.value;
  });
  if (Object.keys(champs).length === 0) return;
  const msgEl = document.getElementById("modale-acteurs-msg");
  msgEl.textContent = "";
  try {
    await appliquerActions([["UpdateRecord", TABLE_ACTEURS, acteurId, champs]]);
    await rafraichirApresChangementActeur();
  } catch (err) {
    msgEl.textContent = "Erreur : " + err.message;
  }
});

document.getElementById("tbody-gestion-acteurs").addEventListener("click", async (e) => {
  const msgEl = document.getElementById("modale-acteurs-msg");

  if (e.target.classList.contains("btn-rida-delete")) {
    const tr = e.target.closest("tr");
    const acteurId = parseInt(tr.getAttribute("data-acteur-id"), 10);
    if (!confirm("Supprimer cet acteur ? Il sera retiré des fiches où il est référencé.")) return;
    try {
      await appliquerActions([["RemoveRecord", TABLE_ACTEURS, acteurId]]);
      await rafraichirApresChangementActeur();
    } catch (err) {
      msgEl.textContent = "Erreur lors de la suppression : " + err.message;
    }
  }
});

document.getElementById("btn-ajouter-acteur-gestion").addEventListener("click", () => {
  ouvrirModaleActeur("gestion-acteurs", "");
});

// Un "mot" est considéré entièrement en MAJUSCULES s'il contient au moins une lettre et aucune
// lettre minuscule (les chiffres/ponctuation comme "21/DIR" ne comptent pas contre lui).
function motEstMajuscule(mot) {
  return /\p{Lu}/u.test(mot) && !/\p{Ll}/u.test(mot);
}

// Détecte un texte collé au format "NOM Prénom - Organisation <mail>" ou "NOM Prénom
// ORGANISATION <mail>" (annuaire, signature de mail...) et en extrait le nom, l'organisation et
// le mail. Retourne null si le texte ne suit pas ce format (auquel cas on le traite comme un
// simple nom tapé à la main).
//
// Règles :
// - Un tiret isolé (entouré d'espaces) est, s'il est présent, le séparateur Nom/Prénom <-> Organisation.
// - Un tiret collé à l'intérieur d'un mot (ex. "SUD-EST") n'est PAS un séparateur : il fait partie
//   du mot (Nom ou Organisation) auquel il appartient, qu'il y ait ou non un tiret séparateur par ailleurs.
// - En l'absence de tiret séparateur isolé, on se fie à la casse : le(s) premier(s) mot(s) en
//   MAJUSCULES forment le Nom, le(s) mot(s) suivant(s) qui ne sont PAS entièrement en majuscules
//   forment le Prénom, et tout ce qui reste (à nouveau en MAJUSCULES) forme l'Organisation.
function analyserTexteActeurColle(texte) {
  const matchMail = /^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec((texte || "").trim());
  if (!matchMail) return null;
  const avantMail = matchMail[1].trim();
  const mail = matchMail[2].trim();
  if (!avantMail) return null;

  const mots = avantMail.split(/\s+/).filter(Boolean);
  if (mots.length < 2) return null;

  let motsNomPrenom, motsOrganisation;
  const indexSeparateur = mots.findIndex(m => m === "-");

  if (indexSeparateur > 0 && indexSeparateur < mots.length - 1) {
    // Tiret isolé trouvé : séparateur explicite entre Nom Prénom et Organisation.
    motsNomPrenom = mots.slice(0, indexSeparateur);
    motsOrganisation = mots.slice(indexSeparateur + 1);
  } else {
    // Pas de tiret séparateur isolé : on avance tant que les mots sont en MAJUSCULES (le Nom),
    // puis tant qu'ils ne le sont pas (le Prénom) ; le reste (à nouveau en majuscules) est
    // l'Organisation.
    let i = 0;
    while (i < mots.length && motEstMajuscule(mots[i])) i++;
    const finNom = i;
    if (finNom === 0 || finNom >= mots.length) return null; // pas de Nom en majuscules, ou rien après
    while (i < mots.length && !motEstMajuscule(mots[i])) i++;
    if (i === finNom) return null; // pas de Prénom détecté (en minuscules) après le Nom
    motsNomPrenom = mots.slice(0, i);
    motsOrganisation = mots.slice(i);
  }

  const nom = motsNomPrenom.join(" ").trim();
  const organisation = motsOrganisation.join(" ").trim();
  if (!nom || !organisation) return null;
  return { nom, organisation, mail };
}

// --- Modale : créer / modifier un acteur ---
let contexteModaleActeur = null;

function ouvrirModaleActeur(contexte, nomPreRempli) {
  contexteModaleActeur = contexte;
  acteurEnEditionId = null;
  // Si le texte tapé/collé suit le format "NOM Prénom - Organisation <mail>", on pré-remplit
  // directement Nom, Organisation et Mail plutôt que de tout mettre dans le champ Nom.
  const infosExtraites = analyserTexteActeurColle(nomPreRempli);
  document.getElementById("modale-acteur-titre").textContent = "Créer un nouvel acteur";
  document.getElementById("modale-acteur-valider").textContent = "Créer";
  document.getElementById("modale-acteur-nom").value = infosExtraites ? infosExtraites.nom : (nomPreRempli || "");
  document.getElementById("modale-acteur-organisation").value = infosExtraites ? infosExtraites.organisation : "";
  document.getElementById("modale-acteur-organisation-path").value = "";
  document.getElementById("modale-acteur-role").value = "";
  document.getElementById("modale-acteur-mail").value = infosExtraites ? infosExtraites.mail : "";
  document.getElementById("modale-acteur-msg").textContent = "";
  document.getElementById("modale-acteur-fond").style.display = "flex";
}

// Ouvre la même modale en mode "modifier" pour un acteur existant (déclenché par
// l'icône 👤 sur une puce Sponsor/Porteurs/Parties prenantes).
function ouvrirModaleEditionActeur(acteurId) {
  const info = acteursParId[acteurId];
  if (!info) return;
  contexteModaleActeur = null;
  acteurEnEditionId = acteurId;
  document.getElementById("modale-acteur-titre").textContent = "Modifier l'acteur";
  document.getElementById("modale-acteur-valider").textContent = "Enregistrer";
  document.getElementById("modale-acteur-nom").value = info.Nom_et_Prenom || "";
  document.getElementById("modale-acteur-organisation").value = info.Organisation || "";
  document.getElementById("modale-acteur-organisation-path").value = info.Organisation_Path || "";
  document.getElementById("modale-acteur-role").value = info.Role || "";
  document.getElementById("modale-acteur-mail").value = info.mail || "";
  document.getElementById("modale-acteur-msg").textContent = "";
  document.getElementById("modale-acteur-fond").style.display = "flex";
}

document.getElementById("modale-acteur-annuler").addEventListener("click", () => {
  acteurEnEditionId = null;
  document.getElementById("modale-acteur-fond").style.display = "none";
});

document.getElementById("modale-acteur-valider").addEventListener("click", async () => {
  const nom = document.getElementById("modale-acteur-nom").value.trim();
  const organisation = document.getElementById("modale-acteur-organisation").value.trim();
  const organisationPath = document.getElementById("modale-acteur-organisation-path").value.trim();
  const role = document.getElementById("modale-acteur-role").value.trim();
  const mail = document.getElementById("modale-acteur-mail").value.trim();
  const msgEl = document.getElementById("modale-acteur-msg");
  const btnValider = document.getElementById("modale-acteur-valider");

  if (!nom) {
    msgEl.textContent = "Le nom est obligatoire.";
    return;
  }

  btnValider.disabled = true;
  msgEl.textContent = "";

  // --- Mode édition d'un acteur existant (icône 👤 sur une puce) ---
  if (acteurEnEditionId) {
    try {
      await appliquerActions([
        ["UpdateRecord", TABLE_ACTEURS, acteurEnEditionId, {
          Nom_et_Prenom: nom,
          Organisation: organisation,
          Organisation_Path: organisationPath,
          Role: role,
          mail: mail
        }]
      ]);
      await rafraichirApresChangementActeur();
      acteurEnEditionId = null;
      document.getElementById("modale-acteur-fond").style.display = "none";
    } catch (err) {
      msgEl.textContent = "Erreur : " + err.message;
    } finally {
      btnValider.disabled = false;
    }
    return;
  }

  try {
    // Si un acteur avec exactement ce Nom Prénom existe déjà, on complète sa fiche (en ne
    // remplissant que les champs encore vides, sans écraser ce qui est déjà renseigné) plutôt
    // que de créer un doublon.
    const nomNormalise = normaliserTexteRecherche(nom);
    const acteurExistant = acteursTriesParNom.find(a => {
      const infos = acteursParId[a.id];
      return infos && normaliserTexteRecherche((infos.Nom_et_Prenom || "").trim()) === nomNormalise;
    });

    let nouvelId;
    if (acteurExistant) {
      const infosActuelles = acteursParId[acteurExistant.id];
      const champsACompleter = {};
      if (!infosActuelles.Organisation && organisation) champsACompleter.Organisation = organisation;
      if (!infosActuelles.Organisation_Path && organisationPath) champsACompleter.Organisation_Path = organisationPath;
      if (!infosActuelles.Role && role) champsACompleter.Role = role;
      if (!infosActuelles.mail && mail) champsACompleter.mail = mail;
      if (Object.keys(champsACompleter).length > 0) {
        await appliquerActions([
          ["UpdateRecord", TABLE_ACTEURS, acteurExistant.id, champsACompleter]
        ]);
      }
      nouvelId = acteurExistant.id;
    } else {
      const resultat = await appliquerActions([
        ["AddRecord", TABLE_ACTEURS, null, {
          Nom_et_Prenom: nom,
          Organisation: organisation,
          Organisation_Path: organisationPath,
          Role: role,
          mail: mail
        }]
      ]);
      nouvelId = resultat && resultat.retValues ? resultat.retValues[0] : null;
    }

    // Recharge la table Acteurs pour connaître localement les infos à jour
    await chargerTablesAnnexes();

    const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);

    if (contexteModaleActeur && typeof contexteModaleActeur === "object" && contexteModaleActeur.type === "rida-porteur") {
      if (nouvelId) {
        const nomSeul = nomActeurParId(nouvelId);
        await appliquerActions([
          ["UpdateRecord", TABLE_RIDA, contexteModaleActeur.ridaId, { Porteur: nomSeul }]
        ]);
        await rechargerRidaEtRafraichir(ligneSelectionneeId);
      }
    } else if (contexteModaleActeur === "gestion-acteurs") {
      // Ajout depuis la modale "Gérer les acteurs" : rien à assigner à une fiche,
      // on rafraîchit juste le tableau (chargerTablesAnnexes() ci-dessus l'a déjà mis à jour).
      rafraichirTableauGestionActeurs();
    } else if (ligne && nouvelId) {
      if (contexteModaleActeur === "sponsor") {
        await appliquerActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Sponsor: nouvelId }]
        ]);
      } else if (contexteModaleActeur === "porteurs") {
        const label = ligneActeur(nouvelId);
        await appliquerActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Porteurs: label }]
        ]);
      } else if (contexteModaleActeur === "partie-prenante") {
        const idsActuels = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));
        await appliquerActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, {
            Parties_prenantes_concernees: ["L"].concat(idsActuels.concat([nouvelId]))
          }]
        ]);
      }
      await rechargerEmergenceEtRafraichir(ligne.id);
    }

    document.getElementById("modale-acteur-fond").style.display = "none";
  } catch (err) {
    msgEl.textContent = "Erreur : " + err.message;
  } finally {
    btnValider.disabled = false;
  }
});

// --- Modale : ajouter une pièce jointe ---
document.getElementById("modale-pj-annuler").addEventListener("click", () => {
  document.getElementById("modale-pj-fond").style.display = "none";
});

document.getElementById("modale-pj-valider").addEventListener("click", async () => {
  const titre = document.getElementById("modale-pj-titre").value.trim();
  const fichierInput = document.getElementById("modale-pj-fichier");
  const fichier = fichierInput.files && fichierInput.files[0];
  const msgEl = document.getElementById("modale-pj-msg");
  const btnValider = document.getElementById("modale-pj-valider");

  if (!titre) {
    msgEl.textContent = "Le titre est obligatoire.";
    return;
  }
  if (!fichier) {
    msgEl.textContent = "Sélectionne un fichier.";
    return;
  }

  btnValider.disabled = true;
  msgEl.textContent = "";
  try {
    const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);
    if (!ligne) throw new Error("Aucune fiche sélectionnée.");

    // NOTE : uploadAttachment est la méthode documentée de l'API Grist pour envoyer
    // un fichier et récupérer son identifiant de pièce jointe. Si ta version de Grist
    // expose une méthode différente, le message d'erreur ci-dessous le révélera.
    const attachmentId = await grist.docApi.uploadAttachment(fichier);

    await appliquerActions([
      ["AddRecord", TABLE_PJ, null, {
        Titre: titre,
        Lien: ["L", attachmentId],
        ID2: ligne.id
      }]
    ]);

    await rechargerPjEtRafraichir(ligne.id);
    document.getElementById("modale-pj-fond").style.display = "none";
  } catch (err) {
    msgEl.textContent = "Erreur : " + err.message;
  } finally {
    btnValider.disabled = false;
  }
});

// --- Supprimer la fiche sélectionnée ---
document.getElementById("btn-supprimer-demande").addEventListener("click", () => {
  if (!ligneSelectionneeId) return;
  const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);
  document.getElementById("modale-suppr-texte").textContent =
    "Voulez-vous vraiment supprimer la fiche « " + (ligne && ligne.Titre ? ligne.Titre : "Sans titre") + " » ? Cette action est irréversible.";
  document.getElementById("modale-suppr-msg").textContent = "";
  document.getElementById("modale-suppr-fond").style.display = "flex";
});

document.getElementById("modale-suppr-annuler").addEventListener("click", () => {
  document.getElementById("modale-suppr-fond").style.display = "none";
});

document.getElementById("modale-suppr-valider").addEventListener("click", async () => {
  if (!ligneSelectionneeId) {
    document.getElementById("modale-suppr-fond").style.display = "none";
    return;
  }
  const btn = document.getElementById("modale-suppr-valider");
  const msgEl = document.getElementById("modale-suppr-msg");
  btn.disabled = true;
  msgEl.textContent = "";
  try {
    // Supprime d'abord les lignes RIDA (Risque/Décision/Information/Action) associées à cette
    // demande, pour ne pas laisser d'enregistrements orphelins dans Emergence_Rida.
    const idsRidaASupprimer = ridaToutes
      .filter(r => idDepuisRef(r.ID2) === ligneSelectionneeId)
      .map(r => r.id);
    const actionsSuppression = idsRidaASupprimer.length
      ? [["BulkRemoveRecord", TABLE_RIDA, idsRidaASupprimer], ["RemoveRecord", TABLE_PRINCIPALE, ligneSelectionneeId]]
      : [["RemoveRecord", TABLE_PRINCIPALE, ligneSelectionneeId]];
    await appliquerActions(actionsSuppression);
    ligneSelectionneeId = null;
    document.getElementById("fiche-container").innerHTML = "";
    await chargerTablePrincipale();
    remplirOptionsFiltres();
    afficherListe();
    document.getElementById("modale-suppr-fond").style.display = "none";
  } catch (err) {
    msgEl.textContent = "Erreur : " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// --- Créer une nouvelle demande vide ---
document.getElementById("btn-creer-demande").addEventListener("click", async () => {
  const btn = document.getElementById("btn-creer-demande");
  btn.disabled = true;
  try {
    const resultat = await appliquerActions([
      ["AddRecord", TABLE_PRINCIPALE, null, { Statut: "0-Nouveau" }]
    ]);
    const nouvelId = resultat && resultat.retValues ? resultat.retValues[0] : null;

    // Ligne RIDA "Information" automatique à la création de la demande, datée d'aujourd'hui.
    if (nouvelId) {
      await appliquerActions([
        ["AddRecord", TABLE_RIDA, null, {
          ID2: nouvelId,
          RIDA: "I",
          Pour_le: aujourdHuiEpoch(),
          Fait_le: aujourdHuiEpoch(), // RIDA "I" : Fait le suit toujours Pour le
          Description: "Création"
        }]
      ]);
    }

    await chargerTablePrincipale();
    await chargerTablesAnnexes();
    remplirOptionsFiltres();
    afficherListe();
    if (nouvelId) selectionnerLigne(nouvelId);
  } catch (err) {
    alert("Erreur lors de la création de la demande : " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// --- Vue Actions (tableau consolidé, tous dossiers confondus) ---
let filtreActionType = new Set(["I", "D", "A"]);           // vide ou taille 3 = pas de filtre
let filtreActionStatutSelection = new Set(["0-Nouveau", "1- En cours"]); // défaut : nouveau + en cours
let filtreActionOrganisationSelection = new Set();           // vide = toutes les organisations
let filtreActionFaitLe = "tout";                             // "tout" | "vide"
let filtreActionSponsor = "";
let filtreActionPorteur = "";
let filtreActionTitre = "";
let filtreActionDescription = "";
let triActionColonne = "Pour_le";
let triActionSens = "desc";
let lignesActionsAffichees = []; // dernières lignes filtrées/triées rendues, pour l'export CSV

function nomDemandeParId2(valeurId2) {
  const id = idDepuisRef(valeurId2);
  const ligne = lignesEmergence.find(l => l.id === id);
  return {
    id: id,
    titre: ligne ? (ligne.Titre || "Sans titre") : "—",
    sponsor: ligne ? nomActeur(ligne.Sponsor) : "",
    sponsorId: ligne ? (ligne.Sponsor || null) : null,
    organisation: ligne ? (ligne.Organisation || "") : "",
    statut: ligne ? (ligne.Statut || "") : ""
  };
}

// Détermine si une ligne d'action est en retard (rouge) ou prévue dans la semaine (bleu).
// Une action déjà réalisée (Fait_le renseigné) n'est jamais mise en avant.
function classeUrgenceAction(r) {
  if (r.Fait_le) return "";
  if (!r.Pour_le || typeof r.Pour_le !== "number") return "";
  const maintenant = Math.floor(Date.now() / 1000);
  const uneSemaine = 7 * 24 * 3600;
  if (r.Pour_le < maintenant) return "action-retard";
  if (r.Pour_le <= maintenant + uneSemaine) return "action-proche";
  return "";
}

// --- Config colonnes (afficher/masquer les colonnes du tableau Actions) ---
function construirePopupConfigColonnesActions() {
  const popup = document.getElementById("popup-config-colonnes-actions");
  if (!popup) return;
  popup.innerHTML = ORDRE_COLONNES_ACTIONS.map(col =>
    "<label><input type='checkbox' class='case-config-colonne-actions' value=\"" + escapeHtml(col) + "\"" +
    (colonnesVisiblesActions.has(col) ? " checked" : "") + ">" + escapeHtml(LIBELLES_COLONNES_ACTIONS[col] || col) + "</label>"
  ).join("");
  popup.querySelectorAll(".case-config-colonne-actions").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) colonnesVisiblesActions.add(cb.value);
      else colonnesVisiblesActions.delete(cb.value);
      sauvegarderColonnesMasqueesActionsDansStockage();
      appliquerVisibiliteColonnesActions();
    });
  });
}

function appliquerVisibiliteColonnesActions() {
  const table = document.getElementById("table-actions");
  if (!table) return;
  table.querySelectorAll("thead th[data-col-action]").forEach(th => {
    const nomCol = th.getAttribute("data-col-action");
    th.style.display = colonnesVisiblesActions.has(nomCol) ? "" : "none";
  });
  table.querySelectorAll("tbody tr[data-demande-id]").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    tds.forEach((td, index) => {
      const nomCol = ORDRE_COLONNES_ACTIONS[index];
      td.style.display = colonnesVisiblesActions.has(nomCol) ? "" : "none";
    });
  });
}

function appliquerLargeursColonnesActions() {
  const table = document.getElementById("table-actions");
  if (!table) return;
  table.querySelectorAll("thead th[data-col-action]").forEach(th => {
    const nomCol = th.getAttribute("data-col-action");
    const largeur = largeursColonnesActions[nomCol];
    if (largeur) {
      th.style.width = largeur + "px";
      th.style.minWidth = largeur + "px";
      th.style.maxWidth = largeur + "px";
    }
  });
  table.querySelectorAll("tbody tr").forEach(tr => {
    const tds = tr.querySelectorAll("td");
    tds.forEach((td, index) => {
      const nomCol = ORDRE_COLONNES_ACTIONS[index];
      const largeur = largeursColonnesActions[nomCol];
      if (largeur) {
        td.style.width = largeur + "px";
        td.style.minWidth = largeur + "px";
        td.style.maxWidth = largeur + "px";
      }
    });
  });
}

const btnConfigColonnesActions = document.getElementById("btn-config-colonnes-actions");
if (btnConfigColonnesActions) {
  btnConfigColonnesActions.addEventListener("click", (e) => {
    e.stopPropagation();
    const popup = document.getElementById("popup-config-colonnes-actions");
    popup.style.display = popup.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    const conteneur = btnConfigColonnesActions.closest(".filtre-multi-conteneur");
    if (conteneur && !conteneur.contains(e.target)) {
      document.getElementById("popup-config-colonnes-actions").style.display = "none";
    }
  });
}

// --- Filtres par colonne (icône 🔎 dans chaque en-tête du tableau Actions) ---
// Une seule popup à la fois, positionnée en absolu (position: fixed) sous l'icône cliquée,
// pour ne pas être rognée par l'overflow: hidden de l'en-tête (comme le serait un enfant du <th>).
function fermerPopupFiltreActionColonne() {
  const ancienne = document.querySelector(".popup-filtre-action-colonne");
  if (ancienne) ancienne.remove();
}

// Libellé/état "actif" affiché sur l'icône de filtre de chaque colonne, pour voir en un coup
// d'œil quelles colonnes ont un filtre appliqué.
function filtreActionColonneEstActif(champ) {
  if (champ === "titre") return !!filtreActionTitre;
  if (champ === "sponsor") return !!filtreActionSponsor;
  if (champ === "organisation") return filtreActionOrganisationSelection.size > 0;
  if (champ === "statut") return filtreActionStatutSelection.size > 0;
  if (champ === "RIDA") return filtreActionType.size > 0 && filtreActionType.size < 3;
  if (champ === "Porteur") return !!filtreActionPorteur;
  if (champ === "Fait_le") return filtreActionFaitLe !== "tout";
  if (champ === "Description") return !!filtreActionDescription;
  return false;
}

function mettreAJourIconesFiltreActions() {
  document.querySelectorAll("#table-actions thead .icone-filtre-action").forEach(icone => {
    const th = icone.closest("th");
    const champ = th.getAttribute("data-filtre-champ");
    icone.classList.toggle("filtre-actif", filtreActionColonneEstActif(champ));
  });
}

function construireContenuPopupFiltreActionColonne(champ) {
  if (champ === "titre" || champ === "sponsor" || champ === "Porteur" || champ === "Description") {
    const valeurs = { titre: filtreActionTitre, sponsor: filtreActionSponsor, Porteur: filtreActionPorteur, Description: filtreActionDescription };
    return "<input type='text' class='champ-filtre-action-texte' data-champ=\"" + champ + "\" value=\"" +
      escapeHtml(valeurs[champ]) + "\" placeholder='Filtrer...'>";
  }
  if (champ === "RIDA") {
    return ["I", "D", "A"].map(v =>
      "<label><input type='checkbox' class='case-filtre-action-type' value=\"" + v + "\"" +
      (filtreActionType.has(v) ? " checked" : "") + ">" + v + "</label>"
    ).join("");
  }
  if (champ === "statut") {
    return Object.keys(COULEURS_STATUT).map(s =>
      "<label><input type='checkbox' class='case-filtre-action-statut' value=\"" + escapeHtml(s) + "\"" +
      (filtreActionStatutSelection.has(s) ? " checked" : "") + ">" + escapeHtml(s) + "</label>"
    ).join("");
  }
  if (champ === "organisation") {
    const organisations = [...new Set(lignesEmergence.map(l => l.Organisation).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (organisations.length === 0) return "<span style='font-size:12px;color:#888;'>Aucune organisation</span>";
    return organisations.map(o =>
      "<label><input type='checkbox' class='case-filtre-action-organisation' value=\"" + escapeHtml(o) + "\"" +
      (filtreActionOrganisationSelection.has(o) ? " checked" : "") + ">" + escapeHtml(o) + "</label>"
    ).join("");
  }
  if (champ === "Fait_le") {
    return "<select class='select-filtre-action-fait-le'>" +
      "<option value='tout'" + (filtreActionFaitLe === "tout" ? " selected" : "") + ">Tout</option>" +
      "<option value='vide'" + (filtreActionFaitLe === "vide" ? " selected" : "") + ">Vide (non fait)</option>" +
      "</select>";
  }
  return "";
}

function ouvrirPopupFiltreActionColonne(th, icone) {
  const champ = th.getAttribute("data-filtre-champ");
  if (!champ) return;
  const dejaOuvertePourCetteIcone = icone.classList.contains("filtre-popup-ouverte");
  fermerPopupFiltreActionColonne();
  document.querySelectorAll("#table-actions .icone-filtre-action").forEach(i => i.classList.remove("filtre-popup-ouverte"));
  if (dejaOuvertePourCetteIcone) return; // un second clic sur la même icône referme juste la popup

  const popup = document.createElement("div");
  popup.className = "popup-filtre-action-colonne";
  popup.innerHTML = construireContenuPopupFiltreActionColonne(champ);
  document.body.appendChild(popup);
  icone.classList.add("filtre-popup-ouverte");

  const rectIcone = icone.getBoundingClientRect();
  popup.style.top = (rectIcone.bottom + 4) + "px";
  let gauche = rectIcone.left;
  const largeurMax = popup.offsetWidth || 180;
  if (gauche + largeurMax > window.innerWidth - 8) gauche = Math.max(8, window.innerWidth - 8 - largeurMax);
  popup.style.left = gauche + "px";

  popup.addEventListener("click", (e) => e.stopPropagation());
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());

  const champTexte = popup.querySelector(".champ-filtre-action-texte");
  if (champTexte) {
    champTexte.addEventListener("input", (e) => {
      const c = e.target.getAttribute("data-champ");
      if (c === "titre") filtreActionTitre = e.target.value;
      else if (c === "sponsor") filtreActionSponsor = e.target.value;
      else if (c === "Porteur") filtreActionPorteur = e.target.value;
      else if (c === "Description") filtreActionDescription = e.target.value;
      afficherTableauActions();
      mettreAJourIconesFiltreActions();
    });
    champTexte.focus();
  }
  popup.querySelectorAll(".case-filtre-action-type").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreActionType.add(cb.value);
      else filtreActionType.delete(cb.value);
      afficherTableauActions();
      mettreAJourIconesFiltreActions();
    });
  });
  popup.querySelectorAll(".case-filtre-action-statut").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreActionStatutSelection.add(cb.value);
      else filtreActionStatutSelection.delete(cb.value);
      afficherTableauActions();
      mettreAJourIconesFiltreActions();
    });
  });
  popup.querySelectorAll(".case-filtre-action-organisation").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreActionOrganisationSelection.add(cb.value);
      else filtreActionOrganisationSelection.delete(cb.value);
      afficherTableauActions();
      mettreAJourIconesFiltreActions();
    });
  });
  const selectFaitLe = popup.querySelector(".select-filtre-action-fait-le");
  if (selectFaitLe) {
    selectFaitLe.addEventListener("change", (e) => {
      filtreActionFaitLe = e.target.value;
      afficherTableauActions();
      mettreAJourIconesFiltreActions();
    });
  }
}

document.querySelectorAll("#table-actions thead .icone-filtre-action").forEach(icone => {
  icone.addEventListener("click", (e) => {
    e.stopPropagation();
    ouvrirPopupFiltreActionColonne(icone.closest("th"), icone);
  });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".popup-filtre-action-colonne") && !e.target.closest(".icone-filtre-action")) {
    fermerPopupFiltreActionColonne();
    document.querySelectorAll("#table-actions .icone-filtre-action").forEach(i => i.classList.remove("filtre-popup-ouverte"));
  }
});

// --- Icône "✕" : masquer directement une colonne du tableau Actions depuis son en-tête,
// sans passer par la popup de configuration (⚙) — équivalent à décocher sa case là-bas, et
// la case correspondante y est tenue à jour si elle est ouverte.
document.querySelectorAll("#table-actions thead .icone-masquer-colonne").forEach(icone => {
  icone.addEventListener("click", (e) => {
    e.stopPropagation();
    const th = icone.closest("th");
    const col = th.getAttribute("data-col-action");
    colonnesVisiblesActions.delete(col);
    sauvegarderColonnesMasqueesActionsDansStockage();
    appliquerVisibiliteColonnesActions();
    const popupGear = document.getElementById("popup-config-colonnes-actions");
    if (popupGear) {
      const caseCorrespondante = popupGear.querySelector(".case-config-colonne-actions[value=\"" + col + "\"]");
      if (caseCorrespondante) caseCorrespondante.checked = false;
    }
  });
});

document.getElementById("btn-reset-filtres-actions").addEventListener("click", () => {
  filtreActionType = new Set(["I", "D", "A"]);
  filtreActionStatutSelection = new Set(["0-Nouveau", "1- En cours"]);
  filtreActionOrganisationSelection = new Set();
  filtreActionFaitLe = "tout";
  filtreActionSponsor = "";
  filtreActionPorteur = "";
  filtreActionTitre = "";
  filtreActionDescription = "";
  triActionColonne = "Pour_le";
  triActionSens = "desc";
  fermerPopupFiltreActionColonne();
  afficherTableauActions();
  mettreAJourIconesFiltreActions();
});

document.querySelectorAll("#table-actions thead [data-col-action]").forEach(th => {
  th.addEventListener("click", (e) => {
    if (e.target.classList.contains("poignee") || e.target.classList.contains("icone-filtre-action") ||
      e.target.classList.contains("icone-masquer-colonne") || th.dataset.enTrainDeRedimensionner === "1") return;
    const col = th.getAttribute("data-col-action");
    if (triActionColonne === col) triActionSens = triActionSens === "asc" ? "desc" : "asc";
    else { triActionColonne = col; triActionSens = "asc"; }
    afficherTableauActions();
  });
});

function mettreAJourFlechesTableauActions() {
  document.querySelectorAll("#table-actions thead [data-col-action]").forEach(th => {
    const f = th.querySelector(".fleche-rida");
    if (!f) return;
    f.textContent = th.getAttribute("data-col-action") === triActionColonne
      ? (triActionSens === "asc" ? "▲" : "▼") : "";
  });
}

// --- Redimensionnement des colonnes (générique, réutilisé pour la liste des demandes et le
// tableau Actions) ---
function initRedimensionnementColonnes(selecteurPoignees, attributCol, largeursObj, fnAppliquer) {
  document.querySelectorAll(selecteurPoignees).forEach(poignee => {
    poignee.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      poignee.setPointerCapture(e.pointerId);

      const th = poignee.closest("th");
      const colName = th.getAttribute(attributCol);
      const rectTh = th.getBoundingClientRect();

      th.dataset.enTrainDeRedimensionner = "1";
      poignee.classList.add("active-resize");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      function onPointerMove(ev) {
        const nouvelleLargeur = Math.max(50, Math.round(ev.clientX - rectTh.left));
        largeursObj[colName] = nouvelleLargeur;
        fnAppliquer();
      }

      function onPointerUp(ev) {
        poignee.releasePointerCapture(ev.pointerId);
        poignee.removeEventListener("pointermove", onPointerMove);
        poignee.removeEventListener("pointerup", onPointerUp);
        poignee.classList.remove("active-resize");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setTimeout(() => { th.dataset.enTrainDeRedimensionner = "0"; }, 50);
      }

      poignee.addEventListener("pointermove", onPointerMove);
      poignee.addEventListener("pointerup", onPointerUp);
    });
  });
}
initRedimensionnementColonnes("#table-actions thead .poignee", "data-col-action", largeursColonnesActions, appliquerLargeursColonnesActions);

function afficherTableauActions() {
  const corps = document.getElementById("corps-tableau-actions");
  let lignes = ridaToutes.map(r => {
    const demande = nomDemandeParId2(r.ID2);
    return Object.assign({}, r, {
      __titre: demande.titre,
      __demandeId: demande.id,
      __sponsor: demande.sponsor,
      __sponsorId: demande.sponsorId,
      __organisation: demande.organisation,
      __statut: demande.statut
    });
  });

  if (filtreActionType.size > 0 && filtreActionType.size < 3) {
    lignes = lignes.filter(r => filtreActionType.has(r.RIDA));
  }
  if (filtreActionStatutSelection.size > 0) {
    lignes = lignes.filter(r => filtreActionStatutSelection.has(r.__statut));
  }
  if (filtreActionFaitLe === "vide") {
    lignes = lignes.filter(r => !r.Fait_le);
  }
  if (filtreActionSponsor) {
    const q = normaliserTexteRecherche(filtreActionSponsor);
    lignes = lignes.filter(r => normaliserTexteRecherche(r.__sponsor || "").indexOf(q) !== -1);
  }
  if (filtreActionPorteur) {
    const q = normaliserTexteRecherche(filtreActionPorteur);
    lignes = lignes.filter(r => normaliserTexteRecherche(r.Porteur || "").indexOf(q) !== -1);
  }
  if (filtreActionTitre) {
    const q = normaliserTexteRecherche(filtreActionTitre);
    lignes = lignes.filter(r => normaliserTexteRecherche(r.__titre).indexOf(q) !== -1);
  }
  if (filtreActionDescription) {
    const q = normaliserTexteRecherche(filtreActionDescription);
    lignes = lignes.filter(r => normaliserTexteRecherche(r.Description || "").indexOf(q) !== -1);
  }
  if (filtreActionOrganisationSelection.size > 0) {
    lignes = lignes.filter(r => filtreActionOrganisationSelection.has(r.__organisation));
  }

  lignes.sort((a, b) => {
    let vA, vB;
    if (triActionColonne === "titre") { vA = a.__titre; vB = b.__titre; }
    else if (triActionColonne === "sponsor") { vA = a.__sponsor; vB = b.__sponsor; }
    else if (triActionColonne === "organisation") { vA = a.__organisation; vB = b.__organisation; }
    else if (triActionColonne === "statut") { vA = a.__statut; vB = b.__statut; }
    else { vA = a[triActionColonne]; vB = b[triActionColonne]; }
    if (vA == null) vA = "";
    if (vB == null) vB = "";
    if (typeof vA === "number" && typeof vB === "number") {
      return triActionSens === "asc" ? vA - vB : vB - vA;
    }
    vA = String(vA).toLowerCase(); vB = String(vB).toLowerCase();
    if (vA < vB) return triActionSens === "asc" ? -1 : 1;
    if (vA > vB) return triActionSens === "asc" ? 1 : -1;
    return 0;
  });

  lignesActionsAffichees = lignes; // mémorisé pour l'export CSV (reflète filtres + tri actuels)

  if (lignes.length === 0) {
    corps.innerHTML = "<tr><td colspan='10' class='chargement'>Aucune action trouvée.</td></tr>";
  } else {
    corps.innerHTML = lignes.map(r => {
      const classeUrgence = classeUrgenceAction(r);
      const estInformation = r.RIDA === "I";
      return "<tr data-demande-id='" + (r.__demandeId || "") + "'" + (classeUrgence ? " class='" + classeUrgence + "'" : "") + ">" +
        "<td title=\"" + escapeHtml(r.__titre) + "\">" + escapeHtml(r.__titre) + "</td>" +
        "<td class='editable-action-cell sponsor-action-editable' data-demande-id=\"" + (r.__demandeId || "") + "\" title=\"" + escapeHtml(r.__sponsor) + " (cliquer pour modifier)\">" + (r.__sponsor ? escapeHtml(r.__sponsor) : "—") + "</td>" +
        "<td title=\"" + escapeHtml(r.__organisation) + "\">" + (r.__organisation ? escapeHtml(r.__organisation) : "—") + "</td>" +
        "<td>" + (r.__statut ? badgeStatut(r.__statut) : "—") + "</td>" +
        "<td>" + escapeHtml(r.RIDA || "—") + "</td>" +
        "<td class='editable-action-cell porteur-action-editable' data-rida-id=\"" + r.id + "\" title=\"" + escapeHtml(r.Porteur || "") + " (cliquer pour modifier)\">" + (r.Porteur ? escapeHtml(r.Porteur) : "—") + "</td>" +
        "<td class='editable-action-cell date-action-editable' data-rida-id=\"" + r.id + "\" data-champ=\"Pour_le\" title=\"Cliquer pour modifier\">" + formaterDate(r.Pour_le) + "</td>" +
        "<td class='editable-action-cell date-action-editable" + (estInformation ? " date-action-non-editable" : "") + "' data-rida-id=\"" + r.id + "\" data-champ=\"Fait_le\" title=\"" +
          (estInformation ? "Fait le suit automatiquement Pour le pour une ligne de type Information" : "Cliquer pour modifier") + "\">" + formaterDate(r.Fait_le) + "</td>" +
        "<td title=\"Date de dernière modification de la ligne (automatique)\">" + (r[COLONNE_DATE_MODIF_RIDA] ? formaterDateHeure(r[COLONNE_DATE_MODIF_RIDA]) : "—") + "</td>" +
        "<td class='editable-action-cell desc-action-editable' data-rida-id=\"" + r.id + "\" title=\"" + escapeHtml(r.Description || "") + " (cliquer pour modifier)\">" + escapeHtml(r.Description || "") + "</td>" +
        "</tr>";
    }).join("");

    corps.querySelectorAll("tr[data-demande-id]").forEach(tr => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest(".editable-action-cell")) return; // géré séparément (édition)
        const id = parseInt(tr.getAttribute("data-demande-id"), 10);
        if (!id) return;
        basculerVue("demandes");
        selectionnerLigne(id);
      });
    });

    // --- Édition en place de la Description (zone de texte multi-lignes) ---
    corps.querySelectorAll(".desc-action-editable").forEach(td => {
      td.addEventListener("click", (e) => {
        e.stopPropagation();
        if (td.querySelector("textarea, input")) return; // déjà en cours d'édition
        const ridaId = parseInt(td.getAttribute("data-rida-id"), 10);
        const valeurActuelle = td.textContent === "—" ? "" : td.textContent;
        td.textContent = "";
        // Le td masque normalement son contenu en une ligne tronquée (overflow: hidden ;
        // white-space: nowrap) : on l'assouplit le temps de l'édition pour que la zone de
        // texte (multi-lignes) ne soit pas rognée.
        td.style.overflow = "visible";
        td.style.whiteSpace = "normal";
        const textarea = document.createElement("textarea");
        textarea.className = "desc-action-textarea";
        textarea.value = valeurActuelle;
        td.appendChild(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        textarea.addEventListener("click", (ev) => ev.stopPropagation());
        textarea.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape") {
            ev.stopPropagation();
            afficherTableauActions(); // annule : redessine sans enregistrer
          }
        });
        textarea.addEventListener("focusout", () => {
          sauvegarderChampRidaListe(ridaId, "Description", textarea.value);
        });
      });
    });

    // --- Édition en place du Porteur (texte libre, avec suggestions des acteurs connus) ---
    corps.querySelectorAll(".porteur-action-editable").forEach(td => {
      td.addEventListener("click", (e) => {
        e.stopPropagation();
        if (td.querySelector("input")) return;
        const ridaId = parseInt(td.getAttribute("data-rida-id"), 10);
        const valeurActuelle = td.textContent === "—" ? "" : td.textContent;
        td.textContent = "";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "action-edit-input";
        input.value = valeurActuelle;
        input.setAttribute("list", "datalist-actions-acteurs");
        td.appendChild(input);
        input.focus();

        input.addEventListener("click", (ev) => ev.stopPropagation());
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape") { ev.stopPropagation(); afficherTableauActions(); }
          if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        });
        input.addEventListener("focusout", () => {
          sauvegarderChampRidaListe(ridaId, "Porteur", input.value.trim());
        });
      });
    });

    // --- Édition en place du Sponsor (référence vers un acteur existant, par nom exact) ---
    corps.querySelectorAll(".sponsor-action-editable").forEach(td => {
      td.addEventListener("click", (e) => {
        e.stopPropagation();
        if (td.querySelector("input")) return;
        const demandeId = parseInt(td.getAttribute("data-demande-id"), 10);
        const valeurActuelle = td.textContent === "—" ? "" : td.textContent;
        td.textContent = "";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "action-edit-input";
        input.value = valeurActuelle;
        input.setAttribute("list", "datalist-actions-acteurs");
        td.appendChild(input);
        input.focus();

        input.addEventListener("click", (ev) => ev.stopPropagation());
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape") { ev.stopPropagation(); afficherTableauActions(); }
          if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        });
        input.addEventListener("focusout", () => {
          const texte = input.value.trim();
          if (!texte) { sauvegarderSponsorActionListe(demandeId, null); return; }
          const candidat = acteursTriesParNom.find(a => normaliserTexteRecherche(nomActeurParId(a.id)) === normaliserTexteRecherche(texte));
          if (candidat) {
            sauvegarderSponsorActionListe(demandeId, candidat.id);
          } else {
            afficherTableauActions(); // aucune correspondance : on abandonne la saisie, sans enregistrer
          }
        });
      });
    });

    // --- Édition en place de Pour le / Fait le (sélecteur de date) ---
    corps.querySelectorAll(".date-action-editable:not(.date-action-non-editable)").forEach(td => {
      td.addEventListener("click", (e) => {
        e.stopPropagation();
        if (td.querySelector("input")) return;
        const ridaId = parseInt(td.getAttribute("data-rida-id"), 10);
        const champ = td.getAttribute("data-champ");
        const ligneRida = ridaToutes.find(r => r.id === ridaId);
        const input = document.createElement("input");
        input.type = "date";
        input.className = "action-edit-input";
        input.value = dateEpochVersInput(ligneRida ? ligneRida[champ] : null);
        td.textContent = "";
        td.appendChild(input);
        input.focus();

        input.addEventListener("click", (ev) => ev.stopPropagation());
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape") { ev.stopPropagation(); afficherTableauActions(); }
        });
        input.addEventListener("change", () => {
          sauvegarderChampRidaListe(ridaId, champ, inputVersDateEpoch(input.value));
        });
        input.addEventListener("focusout", () => {
          // Sortie sans changement de date (pas d'évènement "change") : on redessine simplement
          // pour revenir à l'affichage normal, sans appel réseau superflu.
          if (document.body.contains(input)) afficherTableauActions();
        });
      });
    });
  }

  mettreAJourFlechesTableauActions();
  mettreAJourIconesFiltreActions();
  appliquerLargeursColonnesActions();
  appliquerVisibiliteColonnesActions();
}

// Sauvegarde un champ d'une ligne RIDA modifié depuis la liste Actions (édition en place :
// Description, Porteur, Pour le, Fait le). Mise à jour optimiste de ridaToutes pour un
// réaffichage immédiat, sans attendre un rechargement complet depuis Grist.
async function sauvegarderChampRidaListe(ridaId, champ, valeur) {
  const ligneRida = ridaToutes.find(r => r.id === ridaId);
  const champs = {};
  champs[champ] = valeur;
  // RIDA de type "I" (Information) : Fait le suit toujours Pour le (même règle qu'en fiche).
  if (champ === "Pour_le" && ligneRida && ligneRida.RIDA === "I") {
    champs.Fait_le = valeur;
  }
  if (ligneRida && Object.keys(champs).every(k => ligneRida[k] === champs[k])) {
    afficherTableauActions(); // rien n'a changé : on sort simplement du mode édition
    return;
  }
  try {
    await appliquerActions([
      ["UpdateRecord", TABLE_RIDA, ridaId, champs]
    ]);
    if (ligneRida) Object.assign(ligneRida, champs);
  } catch (err) {
    console.error("Erreur sauvegarde (liste Actions) :", err);
  }
  afficherTableauActions();
}

// Sauvegarde le Sponsor (référence vers Emergence_Acteurs) de la demande liée à une ligne
// d'action, modifié depuis la liste Actions.
async function sauvegarderSponsorActionListe(demandeId, nouvelId) {
  const ligneDemande = lignesEmergence.find(l => l.id === demandeId);
  const valeurActuelle = ligneDemande ? (ligneDemande.Sponsor || null) : null;
  if (valeurActuelle === nouvelId) {
    afficherTableauActions();
    return;
  }
  try {
    await appliquerActions([
      ["UpdateRecord", TABLE_PRINCIPALE, demandeId, { Sponsor: nouvelId }]
    ]);
    if (ligneDemande) ligneDemande.Sponsor = nouvelId;
  } catch (err) {
    console.error("Erreur sauvegarde Sponsor (liste Actions) :", err);
  }
  afficherTableauActions();
}

// --- Bascule entre la vue "Demandes" et la vue "Actions" ---
// Datalist partagée par l'édition en place du Sponsor et du Porteur dans la liste Actions
// (suggestions des acteurs connus, sans forcer une correspondance exacte pour le Porteur).
function remplirDatalistActeursActions() {
  const datalist = document.getElementById("datalist-actions-acteurs");
  if (!datalist) return;
  const noms = [...new Set(acteursTriesParNom.map(a => nomActeurParId(a.id)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  datalist.innerHTML = noms.map(nom => "<option value=\"" + escapeHtml(nom) + "\"></option>").join("");
}

// --- Export CSV de la liste Actions : exactement ce qui est affiché (filtres + tri +
// colonnes visibles actuels), pas la table RIDA complète. ---
function construireCsvActions() {
  const colonnes = ORDRE_COLONNES_ACTIONS.filter(c => colonnesVisiblesActions.has(c));
  const echapperCsv = (valeur) => {
    const s = valeur == null ? "" : String(valeur);
    if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const valeurColonne = (r, c) => {
    if (c === "titre") return r.__titre;
    if (c === "sponsor") return r.__sponsor;
    if (c === "organisation") return r.__organisation;
    if (c === "statut") return r.__statut;
    if (c === "RIDA") return r.RIDA || "";
    if (c === "Porteur") return r.Porteur || "";
    if (c === "Pour_le") return formaterDate(r.Pour_le);
    if (c === "Fait_le") return formaterDate(r.Fait_le);
    if (c === "Date_de_modification") return formaterDateHeure(r[COLONNE_DATE_MODIF_RIDA]);
    if (c === "Description") return r.Description || "";
    return "";
  };
  const entetes = colonnes.map(c => echapperCsv(LIBELLES_COLONNES_ACTIONS[c] || c)).join(";");
  const lignesCsv = lignesActionsAffichees.map(r => colonnes.map(c => echapperCsv(valeurColonne(r, c))).join(";"));
  return [entetes].concat(lignesCsv).join("\r\n");
}

function exporterCsvActions() {
  const csv = construireCsvActions();
  try {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const horodatage = new Date().toISOString().slice(0, 10);
    a.download = "actions_emergence_" + horodatage + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error("Erreur export CSV :", e);
  }
}

const btnExportCsvActions = document.getElementById("btn-export-csv-actions");
if (btnExportCsvActions) {
  btnExportCsvActions.addEventListener("click", exporterCsvActions);
}

let vueActuelle = "demandes";

function basculerVue(mode) {
  vueActuelle = mode;
  const vues = {
    demandes: document.getElementById("vue-demandes"),
    actions: document.getElementById("vue-actions"),
    contacts: document.getElementById("vue-contacts"),
    activite: document.getElementById("vue-activite")
  };
  const tags = {
    demandes: document.getElementById("tag-demandes"),
    actions: document.getElementById("tag-actions"),
    contacts: document.getElementById("tag-contacts"),
    activite: document.getElementById("tag-activite")
  };

  Object.keys(vues).forEach(cle => {
    if (!vues[cle]) return;
    vues[cle].style.display = cle === mode ? (cle === "demandes" ? "" : "block") : "none";
    if (tags[cle]) tags[cle].classList.toggle("active", cle === mode);
  });

  if (mode === "actions") {
    construirePopupConfigColonnesActions();
    remplirDatalistActeursActions();
    afficherTableauActions();
  } else if (mode === "contacts") {
    chargerPageContacts();
  } else if (mode === "activite") {
    afficherActivite();
  }
}

document.getElementById("tag-demandes").addEventListener("click", () => basculerVue("demandes"));
document.getElementById("tag-actions").addEventListener("click", () => basculerVue("actions"));
document.getElementById("tag-contacts").addEventListener("click", () => basculerVue("contacts"));
document.getElementById("tag-activite").addEventListener("click", () => basculerVue("activite"));

// --- Onglet Activité : indicateurs et graphiques de synthèse ---

// Lundi 00:00 (UTC) de la semaine contenant l'epoch (secondes) donné.
function lundiDeSemaineEpoch(epochSecondes) {
  const d = new Date(epochSecondes * 1000);
  const jourSemaine = d.getUTCDay(); // 0 = dimanche, 1 = lundi, ...
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  const lundi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - decalage);
  return Math.floor(lundi / 1000);
}

function libelleSemaine(epochLundi) {
  const d = new Date(epochLundi * 1000);
  return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

const UNE_SEMAINE_SECONDES = 7 * 24 * 3600;
const NB_SEMAINES_MAX_GRAPHIQUE = 26; // fenêtre glissante pour garder le graphique lisible

// Calcule la fenêtre (continue, sans trou) de semaines à afficher sur le graphique
// hebdomadaire : toutes les semaines concernées par des données, mais toujours en gardant
// la semaine en cours dans la fenêtre (pour que la ligne "Aujourd'hui" soit toujours
// affichable), le tout limité à NB_SEMAINES_MAX_GRAPHIQUE semaines.
function calculerFenetreSemaines(semainesAvecDonnees, semaineAujourdhui) {
  let debut, fin;
  if (semainesAvecDonnees.length === 0) {
    debut = semaineAujourdhui;
    fin = semaineAujourdhui;
  } else {
    debut = Math.min(semainesAvecDonnees[0], semaineAujourdhui);
    fin = Math.max(semainesAvecDonnees[semainesAvecDonnees.length - 1], semaineAujourdhui);
  }
  const nbSemaines = Math.round((fin - debut) / UNE_SEMAINE_SECONDES) + 1;
  if (nbSemaines > NB_SEMAINES_MAX_GRAPHIQUE) {
    // Fenêtre de NB_SEMAINES_MAX_GRAPHIQUE semaines, centrée autant que possible sur la
    // semaine en cours, sans jamais déborder des bornes [debut, fin] d'origine.
    let nouveauDebut = semaineAujourdhui - Math.floor(NB_SEMAINES_MAX_GRAPHIQUE / 2) * UNE_SEMAINE_SECONDES;
    let nouveauFin = nouveauDebut + (NB_SEMAINES_MAX_GRAPHIQUE - 1) * UNE_SEMAINE_SECONDES;
    if (nouveauDebut < debut) { nouveauDebut = debut; nouveauFin = debut + (NB_SEMAINES_MAX_GRAPHIQUE - 1) * UNE_SEMAINE_SECONDES; }
    if (nouveauFin > fin) { nouveauFin = fin; nouveauDebut = fin - (NB_SEMAINES_MAX_GRAPHIQUE - 1) * UNE_SEMAINE_SECONDES; }
    debut = nouveauDebut;
    fin = nouveauFin;
  }
  const semaines = [];
  for (let s = debut; s <= fin; s += UNE_SEMAINE_SECONDES) semaines.push(s);
  return semaines;
}

function calculerDonneesActivite() {
  const semaineAujourdhui = lundiDeSemaineEpoch(Math.floor(Date.now() / 1000));

  // 1/ Nombre de demandes par statut (dans l'ordre d'affichage habituel des statuts).
  const statuts = Object.keys(COULEURS_STATUT);
  const comptagesStatuts = statuts.map(s => lignesEmergence.filter(l => l.Statut === s).length);

  // 2/ Une seule barre par semaine (toutes les lignes RIDA, comme dans l'onglet Actions),
  // empilant : en bas, les lignes déjà faites cette semaine-là (Fait_le dans la semaine) ;
  // au-dessus, les lignes encore à faire prévues cette semaine-là (Pour_le dans la semaine,
  // Fait_le vide) — colorées selon que leur semaine est déjà passée (retard), en cours, ou
  // à venir par rapport à aujourd'hui.
  const faitesParSemaine = {};
  const nonFaitesParSemaine = {};
  ridaToutes.forEach(r => {
    if (typeof r.Fait_le === "number") {
      const s = lundiDeSemaineEpoch(r.Fait_le);
      faitesParSemaine[s] = (faitesParSemaine[s] || 0) + 1;
    } else if (typeof r.Pour_le === "number") {
      const s = lundiDeSemaineEpoch(r.Pour_le);
      nonFaitesParSemaine[s] = (nonFaitesParSemaine[s] || 0) + 1;
    }
  });
  const semainesAvecDonnees = [...new Set([...Object.keys(faitesParSemaine), ...Object.keys(nonFaitesParSemaine)])]
    .map(Number).sort((a, b) => a - b);
  const semaines = calculerFenetreSemaines(semainesAvecDonnees, semaineAujourdhui);
  const semainesLabels = semaines.map(libelleSemaine);
  const semainesFaites = semaines.map(s => faitesParSemaine[s] || 0);
  const semainesNonFaites = semaines.map(s => nonFaitesParSemaine[s] || 0);

  // 3/ Demandes "0-Nouveau" ou "1- En cours" sans aucune ligne RIDA de type Action (A).
  const demandesSansAction = lignesEmergence.filter(l =>
    (l.Statut === "0-Nouveau" || l.Statut === "1- En cours") &&
    !ridaToutes.some(r => idDepuisRef(r.ID2) === l.id && r.RIDA === "A")
  ).length;

  // 4/ Nombre d'actions (RIDA de type "A") à faire, peu importe la date, par porteur —
  // en distinguant celles en retard (Pour_le dépassé, même définition que classeUrgenceAction)
  // de celles qui ne le sont pas (pas de date, ou date pas encore dépassée).
  const maintenantPorteurs = Math.floor(Date.now() / 1000);
  const parPorteurRetard = {};
  const parPorteurNonRetard = {};
  ridaToutes.forEach(r => {
    if (r.RIDA === "A" && !r.Fait_le) {
      const nom = (r.Porteur && String(r.Porteur).trim()) ? String(r.Porteur).trim() : "Non assigné";
      const enRetard = typeof r.Pour_le === "number" && r.Pour_le < maintenantPorteurs;
      if (enRetard) parPorteurRetard[nom] = (parPorteurRetard[nom] || 0) + 1;
      else parPorteurNonRetard[nom] = (parPorteurNonRetard[nom] || 0) + 1;
    }
  });
  const porteurs = Object.keys({ ...parPorteurRetard, ...parPorteurNonRetard })
    .sort((a, b) => {
      const totalA = (parPorteurRetard[a] || 0) + (parPorteurNonRetard[a] || 0);
      const totalB = (parPorteurRetard[b] || 0) + (parPorteurNonRetard[b] || 0);
      return totalB - totalA;
    });
  const comptagesPorteurs = porteurs.map(p => (parPorteurRetard[p] || 0) + (parPorteurNonRetard[p] || 0));
  const porteursRetard = porteurs.map(p => parPorteurRetard[p] || 0);
  const porteursNonRetard = porteurs.map(p => parPorteurNonRetard[p] || 0);

  return {
    statuts, comptagesStatuts,
    semaines, semainesLabels, semainesFaites, semainesNonFaites, semaineAujourdhui,
    demandesSansAction,
    porteurs, comptagesPorteurs, porteursRetard, porteursNonRetard
  };
}

function echapperSvg(texte) {
  return String(texte == null ? "" : texte)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Graphique en barres (une seule série), rendu en SVG inline, sans dépendance externe.
function construireGraphiqueBarresSimple(categories, valeurs, couleurs) {
  if (categories.length === 0) {
    return "<p style='font-size:12px;color:#888;margin:0;'>Aucune donnée disponible.</p>";
  }
  const largeurBarre = 46, espacement = 18, margeGauche = 34, margeBas = 36, margeHaut = 14;
  const hauteur = 190;
  const maxValeur = Math.max(1, ...valeurs);
  const largeur = margeGauche + categories.length * (largeurBarre + espacement) + espacement;
  const hauteurUtile = hauteur - margeHaut - margeBas;

  let svg = "<svg viewBox='0 0 " + largeur + " " + hauteur + "' width='" + largeur + "' height='" + hauteur + "' xmlns='http://www.w3.org/2000/svg'>";
  svg += "<line x1='" + margeGauche + "' y1='" + (hauteur - margeBas) + "' x2='" + largeur + "' y2='" + (hauteur - margeBas) + "' stroke='#ddd'/>";
  categories.forEach((cat, i) => {
    const v = valeurs[i];
    const h = Math.round((v / maxValeur) * hauteurUtile);
    const x = margeGauche + espacement + i * (largeurBarre + espacement);
    const y = hauteur - margeBas - h;
    svg += "<rect x='" + x + "' y='" + y + "' width='" + largeurBarre + "' height='" + h +
      "' rx='3' fill='" + (couleurs[i] || "#3b5bdb") + "'><title>" + echapperSvg(cat) + " : " + v + "</title></rect>";
    svg += "<text class='barre-svg-valeur' x='" + (x + largeurBarre / 2) + "' y='" + (y - 4) + "' text-anchor='middle'>" + v + "</text>";
    svg += "<text class='barre-svg-label' x='" + (x + largeurBarre / 2) + "' y='" + (hauteur - margeBas + 14) + "' text-anchor='middle'>" + echapperSvg(cat) + "</text>";
  });
  svg += "</svg>";
  return svg;
}

// Graphique en barres empilées à deux séries (une barre par catégorie : série du bas, puis
// série du haut), avec légende. Réutilisé pour "Actions à faire par porteur" (bas = à faire
// pas encore en retard, haut = en retard, en rouge).
function construireGraphiqueBarresEmpileesDeuxSeries(categories, serieBas, serieHaut, couleurBas, couleurHaut, labelBas, labelHaut) {
  if (categories.length === 0) {
    return "<p style='font-size:12px;color:#888;margin:0;'>Aucune donnée disponible.</p>";
  }
  const largeurBarre = 46, espacement = 18, margeGauche = 34, margeBas = 36, margeHaut = 30;
  const hauteur = 200;
  const maxValeur = Math.max(1, ...categories.map((_, i) => serieBas[i] + serieHaut[i]));
  const largeur = margeGauche + categories.length * (largeurBarre + espacement) + espacement;
  const hauteurUtile = hauteur - margeHaut - margeBas;

  let svg = "<svg viewBox='0 0 " + largeur + " " + hauteur + "' width='" + largeur + "' height='" + hauteur + "' xmlns='http://www.w3.org/2000/svg'>";
  const legende = [[labelBas, couleurBas], [labelHaut, couleurHaut]];
  let xLegende = margeGauche;
  legende.forEach(([nom, couleur]) => {
    svg += "<rect x='" + xLegende + "' y='4' width='10' height='10' fill='" + couleur + "'/>";
    svg += "<text class='barre-svg-legende' x='" + (xLegende + 14) + "' y='13'>" + echapperSvg(nom) + "</text>";
    xLegende += 14 + nom.length * 6 + 18;
  });
  svg += "<line x1='" + margeGauche + "' y1='" + (hauteur - margeBas) + "' x2='" + largeur + "' y2='" + (hauteur - margeBas) + "' stroke='#ddd'/>";

  categories.forEach((cat, i) => {
    const x = margeGauche + espacement + i * (largeurBarre + espacement);
    const vBas = serieBas[i], vHaut = serieHaut[i];
    const hBas = Math.round((vBas / maxValeur) * hauteurUtile);
    const hHaut = Math.round((vHaut / maxValeur) * hauteurUtile);
    const yBase = hauteur - margeBas;
    const yBasHaut = yBase - hBas;
    const yHautHaut = yBasHaut - hHaut;

    if (vBas > 0) {
      svg += "<rect x='" + x + "' y='" + yBasHaut + "' width='" + largeurBarre + "' height='" + hBas +
        "' rx='3' fill='" + couleurBas + "'><title>" + echapperSvg(cat) + " — " + echapperSvg(labelBas) + " : " + vBas + "</title></rect>";
    }
    if (vHaut > 0) {
      svg += "<rect x='" + x + "' y='" + yHautHaut + "' width='" + largeurBarre + "' height='" + hHaut +
        "' rx='3' fill='" + couleurHaut + "'><title>" + echapperSvg(cat) + " — " + echapperSvg(labelHaut) + " : " + vHaut + "</title></rect>";
    }
    const total = vBas + vHaut;
    if (total > 0) {
      svg += "<text class='barre-svg-valeur' x='" + (x + largeurBarre / 2) + "' y='" + (yHautHaut - 4) + "' text-anchor='middle'>" + total + "</text>";
    }
    svg += "<text class='barre-svg-label' x='" + (x + largeurBarre / 2) + "' y='" + (hauteur - margeBas + 14) + "' text-anchor='middle'>" + echapperSvg(cat) + "</text>";
  });
  svg += "</svg>";
  return svg;
}

// Couleur de la portion "pas faite" d'une semaine, selon sa position par rapport à la
// semaine en cours : en retard (rouge), à faire cette semaine (orange), ou plus tard (bleu).
function couleurUrgenceSemaine(semaineEpoch, semaineAujourdhuiEpoch) {
  if (semaineEpoch < semaineAujourdhuiEpoch) return "#d64545";
  if (semaineEpoch === semaineAujourdhuiEpoch) return "#e07b1f";
  return "#3b5bdb";
}

// Graphique en barres empilées (une seule barre par semaine) : en bas, les lignes RIDA déjà
// faites cette semaine-là ; au-dessus, celles encore à faire prévues cette semaine-là,
// colorées selon l'urgence. Une ligne pointillée rouge marque la semaine en cours.
// Retourne { svg, xAujourdhui, largeurTotale } pour permettre de centrer le défilement
// horizontal sur "Aujourd'hui" à l'ouverture.
function construireGraphiqueBarresEmpileesSemaines(categories, semaines, faites, nonFaites, semaineAujourdhuiEpoch) {
  if (categories.length === 0) {
    return { svg: "<p style='font-size:12px;color:#888;margin:0;'>Aucune donnée disponible.</p>", xAujourdhui: null, largeurTotale: 0 };
  }
  const largeurBarre = 30, espacement = 16, margeGauche = 34, margeBas = 36, margeHaut = 34;
  const hauteur = 220;
  const maxValeur = Math.max(1, ...categories.map((_, i) => faites[i] + nonFaites[i]));
  const largeur = margeGauche + categories.length * (largeurBarre + espacement) + espacement;
  const hauteurUtile = hauteur - margeHaut - margeBas;

  let svg = "<svg viewBox='0 0 " + largeur + " " + hauteur + "' width='" + largeur + "' height='" + hauteur + "' xmlns='http://www.w3.org/2000/svg'>";
  // Légende
  const legende = [["Faites", "#1f9d5f"], ["En retard", "#d64545"], ["Cette semaine", "#e07b1f"], ["Plus tard", "#3b5bdb"]];
  let xLegende = margeGauche;
  legende.forEach(([nom, couleur]) => {
    svg += "<rect x='" + xLegende + "' y='4' width='10' height='10' fill='" + couleur + "'/>";
    svg += "<text class='barre-svg-legende' x='" + (xLegende + 14) + "' y='13'>" + echapperSvg(nom) + "</text>";
    xLegende += 14 + nom.length * 6 + 18;
  });
  svg += "<line x1='" + margeGauche + "' y1='" + (hauteur - margeBas) + "' x2='" + largeur + "' y2='" + (hauteur - margeBas) + "' stroke='#ddd'/>";

  let xAujourdhui = null;
  categories.forEach((cat, i) => {
    const x = margeGauche + espacement + i * (largeurBarre + espacement);
    const vFaites = faites[i], vNonFaites = nonFaites[i];
    const hFaites = Math.round((vFaites / maxValeur) * hauteurUtile);
    const hNonFaites = Math.round((vNonFaites / maxValeur) * hauteurUtile);
    const yBase = hauteur - margeBas;
    const yFaitesHaut = yBase - hFaites;
    const yNonFaitesHaut = yFaitesHaut - hNonFaites;
    const couleurNonFaites = couleurUrgenceSemaine(semaines[i], semaineAujourdhuiEpoch);

    if (vFaites > 0) {
      svg += "<rect x='" + x + "' y='" + yFaitesHaut + "' width='" + largeurBarre + "' height='" + hFaites +
        "' fill='#1f9d5f'><title>Semaine du " + echapperSvg(cat) + " — Faites : " + vFaites + "</title></rect>";
    }
    if (vNonFaites > 0) {
      svg += "<rect x='" + x + "' y='" + yNonFaitesHaut + "' width='" + largeurBarre + "' height='" + hNonFaites +
        "' fill='" + couleurNonFaites + "'><title>Semaine du " + echapperSvg(cat) + " — À faire : " + vNonFaites + "</title></rect>";
    }
    const total = vFaites + vNonFaites;
    if (total > 0) {
      svg += "<text class='barre-svg-valeur' x='" + (x + largeurBarre / 2) + "' y='" + (yNonFaitesHaut - 4) + "' text-anchor='middle'>" + total + "</text>";
    }
    svg += "<text class='barre-svg-label' x='" + (x + largeurBarre / 2) + "' y='" + (hauteur - margeBas + 14) + "' text-anchor='middle'>" + echapperSvg(cat) + "</text>";

    if (semaines[i] === semaineAujourdhuiEpoch) xAujourdhui = x + largeurBarre / 2;
  });

  if (xAujourdhui !== null) {
    svg += "<line x1='" + xAujourdhui + "' y1='" + margeHaut + "' x2='" + xAujourdhui + "' y2='" + (hauteur - margeBas) +
      "' stroke='#d64545' stroke-width='2' stroke-dasharray='4,3'/>";
    svg += "<text class='barre-svg-legende' x='" + xAujourdhui + "' y='" + (margeHaut - 6) + "' text-anchor='middle' fill='#d64545'>Aujourd'hui</text>";
  }
  svg += "</svg>";
  return { svg, xAujourdhui, largeurTotale: largeur };
}

function afficherActivite() {
  const conteneurStatuts = document.getElementById("graphique-activite-statuts");
  const conteneurSemaines = document.getElementById("graphique-activite-semaines");
  const conteneurPorteurs = document.getElementById("graphique-activite-porteurs");
  const indicateur = document.getElementById("indicateur-activite-sans-action");
  if (!conteneurStatuts || !conteneurSemaines || !conteneurPorteurs || !indicateur) return;

  const donnees = calculerDonneesActivite();

  const couleursStatuts = donnees.statuts.map(s => (COULEURS_STATUT[s] && COULEURS_STATUT[s].texte) || "#3b5bdb");
  conteneurStatuts.innerHTML = construireGraphiqueBarresSimple(donnees.statuts, donnees.comptagesStatuts, couleursStatuts);

  const resultatSemaines = construireGraphiqueBarresEmpileesSemaines(
    donnees.semainesLabels, donnees.semaines, donnees.semainesFaites, donnees.semainesNonFaites, donnees.semaineAujourdhui
  );
  conteneurSemaines.innerHTML = resultatSemaines.svg;
  // Positionne le défilement horizontal pour que "Aujourd'hui" soit visible dès l'ouverture.
  if (resultatSemaines.xAujourdhui != null) {
    conteneurSemaines.scrollLeft = Math.max(0, resultatSemaines.xAujourdhui - conteneurSemaines.clientWidth / 2);
  }

  conteneurPorteurs.innerHTML = construireGraphiqueBarresEmpileesDeuxSeries(
    donnees.porteurs, donnees.porteursNonRetard, donnees.porteursRetard,
    "#e07b1f", "#d64545", "À faire", "En retard"
  );

  indicateur.textContent = String(donnees.demandesSansAction);
}

// Initialisation
(async function init() {
  await chargerTablesAnnexes();
  await chargerTablePrincipale();
  remplirOptionsFiltres();
  afficherListe();

  // Sélectionne automatiquement la première ligne à l'ouverture
  const premiereLigneTr = document.querySelector("#corps-tableau tr[data-id]");
  if (premiereLigneTr) {
    selectionnerLigne(parseInt(premiereLigneTr.getAttribute("data-id"), 10));
  }
})();
