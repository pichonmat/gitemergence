// Widget Emergence — v76
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
let dateModifRidaRefusee = false;

// --- Taille du texte (boutons A− / A+ dans les menus ⚙) : coefficient appliqué à toutes les
// tailles de police via la variable CSS --echelle-texte, mémorisé par navigateur. ---
const ECHELLES_TEXTE = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
const CLE_STOCKAGE_ECHELLE_TEXTE = "emergence_echelle_texte";
let indexEchelleTexte = (function () {
  try {
    const i = ECHELLES_TEXTE.indexOf(parseFloat(window.localStorage.getItem(CLE_STOCKAGE_ECHELLE_TEXTE)));
    if (i !== -1) return i;
  } catch (e) { /* stockage indisponible : taille par défaut */ }
  return ECHELLES_TEXTE.indexOf(1);
})();

function appliquerEchelleTexte() {
  const echelle = ECHELLES_TEXTE[indexEchelleTexte];
  document.documentElement.style.setProperty("--echelle-texte", String(echelle));
  document.querySelectorAll(".valeur-taille-texte").forEach(el => { el.textContent = Math.round(echelle * 100) + " %"; });
  document.querySelectorAll(".btn-taille-texte").forEach(btn => {
    const sens = parseInt(btn.getAttribute("data-sens"), 10);
    btn.disabled = (sens < 0 && indexEchelleTexte === 0) || (sens > 0 && indexEchelleTexte === ECHELLES_TEXTE.length - 1);
  });
}

function changerEchelleTexte(sens) {
  const nouvel = Math.min(ECHELLES_TEXTE.length - 1, Math.max(0, indexEchelleTexte + sens));
  if (nouvel === indexEchelleTexte) return;
  indexEchelleTexte = nouvel;
  try { window.localStorage.setItem(CLE_STOCKAGE_ECHELLE_TEXTE, String(ECHELLES_TEXTE[indexEchelleTexte])); } catch (e) { /* non mémorisé */ }
  appliquerEchelleTexte();
}

function blocTailleTexteHtml() {
  return "<div class='bloc-taille-texte'><span class='libelle-taille-texte'>Taille du texte</span>" +
    "<button type='button' class='btn-taille-texte' data-sens='-1' title='Réduire le texte'>A−</button>" +
    "<span class='valeur-taille-texte'></span>" +
    "<button type='button' class='btn-taille-texte' data-sens='1' title='Agrandir le texte'>A+</button></div>";
}

function brancherBoutonsTailleTexte(popup) {
  popup.querySelectorAll(".btn-taille-texte").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      changerEchelleTexte(parseInt(btn.getAttribute("data-sens"), 10));
    });
  });
  appliquerEchelleTexte();
}

// Date affichée (et utilisée pour le tri) quand une ligne RIDA n'a encore jamais été horodatée.
const DATE_MODIF_RIDA_PAR_DEFAUT = Math.floor(new Date(2026, 8, 30).getTime() / 1000); // 30/09/2026
function formaterDateModifRida(r) {
  return (r.__dateModifParDefaut || !r[COLONNE_DATE_MODIF_RIDA]) ? formaterDate(DATE_MODIF_RIDA_PAR_DEFAUT) : formaterDateHeure(r[COLONNE_DATE_MODIF_RIDA]);
}
appliquerEchelleTexte(); // applique tout de suite la taille de texte mémorisée

// Point d'entrée unique pour toute écriture vers Grist : si l'action ajoute/modifie une ligne
// RIDA, on y joint la date/heure de modification (sans effet si la colonne n'existe pas).
function horodaterActionsRida(actions) {
  const maintenant = Math.floor(Date.now() / 1000);
  actions.forEach(a => {
    if (Array.isArray(a) && a[1] === TABLE_RIDA && (a[0] === "AddRecord" || a[0] === "UpdateRecord") && a[3] && typeof a[3] === "object") {
      if (colonneDateModifRidaDisponible) a[3][COLONNE_DATE_MODIF_RIDA] = maintenant;
      else delete a[3][COLONNE_DATE_MODIF_RIDA]; // colonne absente de la base : jamais envoyée
    }
  });
  return actions;
}

// Colonne "Téléphone" de la table Emergence_Acteurs (Text) : créée automatiquement dans Grist
// si elle n'existe pas encore. Tant qu'elle n'est pas disponible, le champ n'est jamais envoyé.
const COLONNE_TELEPHONE_ACTEURS = "Telephone";
let colonneTelephoneActeursDisponible = false;
let creationColonneTelephoneRefusee = false;
let telephoneActeursRefuse = false;

function retirerTelephoneSiIndisponible(actions) {
  if (colonneTelephoneActeursDisponible) return actions;
  actions.forEach(a => {
    if (Array.isArray(a) && a[1] === TABLE_ACTEURS && (a[0] === "AddRecord" || a[0] === "UpdateRecord") && a[3] && typeof a[3] === "object") {
      delete a[3][COLONNE_TELEPHONE_ACTEURS];
    }
  });
  return actions;
}

// Écriture vers Grist. Les colonnes "optionnelles" ajoutées par le widget (Date_de_modification,
// Telephone) peuvent être déclarées dans les métadonnées de Grist sans exister réellement dans la
// base ("no column named X" à l'insertion, "no such column: X" à la mise à jour/au recalcul).
// Dans ce cas : on désactive la colonne pour la session et on rejoue l'écriture sans elle ; si
// Grist échoue encore sur cette colonne (recalcul interne), on propose de la supprimer puis de la
// recréer proprement, puis on rejoue l'écriture.
const REGEX_COLONNE_ABSENTE = /no column named\s+["'`]?(\w+)|no such column:?\s+["'`]?(?:\w+\.)?(\w+)/i;

function colonneAbsenteDansErreur(err) {
  const m = REGEX_COLONNE_ABSENTE.exec((err && err.message) || "");
  return m ? (m[1] || m[2]) : null;
}

const COLONNES_OPTIONNELLES = {
  [COLONNE_DATE_MODIF_RIDA]: {
    table: TABLE_RIDA, type: "DateTime:Europe/Paris", label: "Date de modification",
    desactiver() { colonneDateModifRidaDisponible = false; dateModifRidaRefusee = true; },
    reactiver() { colonneDateModifRidaDisponible = true; dateModifRidaRefusee = false; },
    estActive() { return colonneDateModifRidaDisponible; }
  },
  [COLONNE_TELEPHONE_ACTEURS]: {
    table: TABLE_ACTEURS, type: "Text", label: "Téléphone",
    desactiver() { colonneTelephoneActeursDisponible = false; telephoneActeursRefuse = true; },
    reactiver() { colonneTelephoneActeursDisponible = true; telephoneActeursRefuse = false; },
    estActive() { return colonneTelephoneActeursDisponible; }
  }
};

// --- Journal automatique des modifications d'une demande ---
// Chaque modification d'un champ d'une demande (fiche, statut depuis la liste, sponsor depuis la
// liste Actions...) tient à jour, dans le même appel à Grist, UNE ligne RIDA de type "I" (Information)
// par jour, datée d'aujourd'hui : « Champ « Titre » modifié » / « Champs « Titre », « Statut » modifiés ».
// Pas de journal le jour de la création de la demande (sa ligne « Création » en tient lieu).
const LIBELLES_CHAMPS_JOURNAL = {
  Titre: "Titre", Objet_de_la_demande: "Objet de la demande", Detail_de_la_demande: "Détail de la demande",
  Main_courante: "Main courante", Statut: "Statut", Priorite: "Priorité", Sponsor: "Sponsor", Porteurs: "Porteur",
  Parties_prenantes_concernees: "Parties prenantes", Organisation: "Organisation",
  Typologie_de_la_demande: "Typologie de la demande", Date_de_soumission: "Date de soumission",
  Date_de_cloture: "Date de clôture", Orientation: "Orientation", Lien_vers_fiche_DS: "Lien vers fiche DS",
  Porteurs2: "Porteurs2", Vecteur_de_remontee_terrain: "Vecteur de remontée terrain",
  Nom_Prenom_demandeurs: "Nom Prénom demandeurs", Territoire: "Territoire",
  Problematique_transverse: "Problématique transverse", ID_Note: "ID Note", Piste_de_communs: "Piste de communs",
  Perimetre_d_impact2: "Périmètre d'impact", Causes_racines_de_l_irritant: "Causes racines de l'irritant",
  Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement: "Synthèse reformulation", ID2: "ID",
  Synthese_de_la_demande: "Synthèse de la demande", Politique_Publique_concernee: "Politique publique concernée",
  Contributeurs_SDID: "Contributeurs SDID", Organisation_Id: "Organisation Id"
};
let journalModificationsActif = true;

function libelleChampJournal(cle) {
  return LIBELLES_CHAMPS_JOURNAL[cle] || String(cle).replace(/_/g, " ");
}

// Au plus UNE ligne de journal par demande et par jour : la première modification du jour crée la
// ligne ; les suivantes la mettent à jour (liste des champs modifiés, sans doublon, + date/heure de
// dernière modification). La ligne du jour est reconnue à son texte « Champ(s) « … » modifié(s) » ;
// le Porteur reste celui de la première modification.
const REGEX_LIGNE_JOURNAL = /^Champs? « .+ » modifiés?$/;

function champsDeLigneJournal(description) {
  return [...String(description || "").matchAll(/« ([^»]+) »/g)].map(m => m[1]);
}

function descriptionJournalDepuisLibelles(libelles) {
  const noms = libelles.map(l => "« " + l + " »");
  return libelles.length === 1 ? "Champ " + noms[0] + " modifié" : "Champs " + noms.join(", ") + " modifiés";
}

function actionsJournalModifications(actions) {
  if (!journalModificationsActif) return [];
  const aujourdhui = aujourdHuiEpoch();
  // Regroupe par demande tous les champs modifiés dans ce lot d'actions.
  const parDemande = new Map();
  actions.forEach(a => {
    if (!Array.isArray(a) || a[0] !== "UpdateRecord" || a[1] !== TABLE_PRINCIPALE || !a[3] || typeof a[3] !== "object") return;
    const demandeId = a[2];
    if (!demandeId) return;
    const libelles = Object.keys(a[3]).filter(c => !c.startsWith("gristHelper_")).map(libelleChampJournal);
    if (libelles.length === 0) return;
    if (!parDemande.has(demandeId)) parDemande.set(demandeId, []);
    libelles.forEach(l => { if (!parDemande.get(demandeId).includes(l)) parDemande.get(demandeId).push(l); });
  });
  const extras = [];
  parDemande.forEach((nouveaux, demandeId) => {
    const ridaDemande = ridaToutes.filter(r => idDepuisRef(r.ID2) === demandeId);
    if (ridaDemande.some(r => r.Description === "Création" && r.Pour_le === aujourdhui)) return; // créée aujourd'hui
    const existante = ridaDemande
      .filter(r => r.RIDA === "I" && r.Pour_le === aujourdhui && REGEX_LIGNE_JOURNAL.test(r.Description || ""))
      .sort((x, y) => x.id - y.id)[0];
    if (existante) {
      const libelles = champsDeLigneJournal(existante.Description);
      nouveaux.forEach(l => { if (!libelles.includes(l)) libelles.push(l); });
      // UpdateRecord même sans nouveau champ : rafraîchit la date/heure de dernière modification.
      extras.push(["UpdateRecord", TABLE_RIDA, existante.id, { Description: descriptionJournalDepuisLibelles(libelles) }]);
    } else {
      extras.push(["AddRecord", TABLE_RIDA, null, {
        ID2: demandeId, RIDA: "I", Pour_le: aujourdhui, Fait_le: aujourdhui, Description: descriptionJournalDepuisLibelles(nouveaux)
      }]);
    }
  });
  return extras;
}

// --- Porteur par défaut des lignes RIDA = utilisateur connecté ---
// L'API des widgets Grist n'expose pas l'e-mail de l'utilisateur. Contournement : une petite table
// technique « Emergence_Session » dont la colonne Email a pour formule de déclenchement
// `user.Email` ; on y ajoute une ligne, on lit l'e-mail calculé par Grist, puis on supprime la
// ligne. Une seule fois par ouverture du widget, au premier enregistrement. L'e-mail est ensuite
// rapproché de la colonne « mail » des acteurs : le nom de l'acteur devient le Porteur par défaut
// des lignes RIDA ajoutées. E-mail non trouvé (ou table impossible à créer) : Porteur laissé vide.
const TABLE_SESSION = "Emergence_Session";
let porteurParDefautRida = "";
let promessePorteurParDefaut = null;

async function lireEmailUtilisateurConnecte() {
  let reponse;
  try {
    reponse = await grist.docApi.applyUserActions([["AddRecord", TABLE_SESSION, null, {}]]);
  } catch (e) {
    await grist.docApi.applyUserActions([["AddTable", TABLE_SESSION, [
      { id: "Email", type: "Text", isFormula: false, formula: "user.Email" }
    ]]]);
    reponse = await grist.docApi.applyUserActions([["AddRecord", TABLE_SESSION, null, {}]]);
  }
  const idLigne = reponse && reponse.retValues && reponse.retValues[0];
  let email = "";
  try {
    const table = await grist.docApi.fetchTable(TABLE_SESSION);
    const i = (table.id || []).indexOf(idLigne);
    if (i >= 0 && table.Email) email = table.Email[i] || "";
  } finally {
    try { await grist.docApi.applyUserActions([["RemoveRecord", TABLE_SESSION, idLigne]]); }
    catch (e) { console.error("Suppression de la ligne technique " + TABLE_SESSION + " impossible :", e); }
  }
  return String(email || "").trim();
}

function nomActeurParEmail(email) {
  const cible = String(email || "").trim().toLowerCase();
  if (!cible) return "";
  for (const id in acteursParId) {
    const a = acteursParId[id];
    if (a.mail && String(a.mail).trim().toLowerCase() === cible) return a.Nom_et_Prenom || "";
  }
  return "";
}

function initialiserPorteurParDefaut() {
  if (!promessePorteurParDefaut) {
    promessePorteurParDefaut = (async () => {
      try {
        porteurParDefautRida = nomActeurParEmail(await lireEmailUtilisateurConnecte());
      } catch (e) {
        console.error("E-mail de l'utilisateur indisponible : Porteur RIDA laissé vide.", e);
        porteurParDefautRida = "";
      }
    })();
  }
  return promessePorteurParDefaut;
}

function appliquerPorteurParDefaut(actions) {
  if (!porteurParDefautRida) return actions;
  actions.forEach(a => {
    if (Array.isArray(a) && a[0] === "AddRecord" && a[1] === TABLE_RIDA && a[3] && typeof a[3] === "object" && !("Porteur" in a[3])) {
      a[3].Porteur = porteurParDefautRida;
    }
  });
  return actions;
}

function preparerActions(actions) {
  const complet = actions.concat(actionsJournalModifications(actions));
  return retirerTelephoneSiIndisponible(horodaterActionsRida(appliquerPorteurParDefaut(complet)));
}

// Supprime la colonne défectueuse puis la recrée à l'identique (colonne simple, sans formule).
async function reparerColonneOptionnelle(nomColonne) {
  const c = COLONNES_OPTIONNELLES[nomColonne];
  await grist.docApi.applyUserActions([["RemoveColumn", c.table, nomColonne]]);
  await grist.docApi.applyUserActions([["AddColumn", c.table, nomColonne, { type: c.type, label: c.label, isFormula: false }]]);
  c.reactiver();
}

// Écritures exécutées l'une après l'autre : le journal du jour se lit dans la table RIDA rechargée
// après l'écriture précédente (sinon deux enregistrements rapprochés créeraient deux lignes).
let fileEcritures = Promise.resolve();
function appliquerActions(actions) {
  const p = fileEcritures.then(() => appliquerActionsSerie(actions));
  fileEcritures = p.catch(() => {});
  return p;
}

async function appliquerActionsSerie(actions) {
  const journalise = actions.some(a => Array.isArray(a) && a[0] === "UpdateRecord" && a[1] === TABLE_PRINCIPALE);
  if (journalise || actions.some(a => Array.isArray(a) && a[0] === "AddRecord" && a[1] === TABLE_RIDA)) {
    await initialiserPorteurParDefaut(); // une seule fois ; jamais bloquant en cas d'échec
  }
  const resultat = await appliquerActionsBrut(actions);
  if (journalise) {
    // Une ligne RIDA de journal a pu être ajoutée : on relit la table RIDA (liste, colonne « Modifié le », fiche).
    try { ridaToutes = tableVersLignes(await grist.docApi.fetchTable(TABLE_RIDA)); } catch (e) { console.error("Rechargement RIDA :", e); }
  }
  return resultat;
}

async function appliquerActionsBrut(actions) {
  try {
    return await grist.docApi.applyUserActions(preparerActions(actions));
  } catch (err) {
    const nom = colonneAbsenteDansErreur(err);
    const c = nom && COLONNES_OPTIONNELLES[nom];
    if (!c || !c.estActive()) throw err;
    c.desactiver();
    console.error("Colonne " + nom + " inutilisable dans Grist : désactivée pour cette session.", err);
    try {
      return await grist.docApi.applyUserActions(preparerActions(actions));
    } catch (err2) {
      if (colonneAbsenteDansErreur(err2) !== nom) throw err2;
      // Grist échoue toujours sur cette colonne (ex. recalcul interne) : réparation proposée.
      const ok = confirm("La colonne « " + c.label + " » de la table " + c.table + " est défectueuse dans Grist " +
        "(" + err2.message + ").\n\nLa supprimer et la recréer maintenant ? (elle ne contient aucune donnée exploitable)");
      if (!ok) throw err2;
      await reparerColonneOptionnelle(nom);
      return grist.docApi.applyUserActions(preparerActions(actions));
    }
  }
}

const COULEURS_STATUT = {
  "0-Nouveau":      { fond: "#fff8dc", texte: "#8a6d00" },
  "1 - Collecter":  { fond: "#e0f2fe", texte: "#075985" },
  "2 - Qualifier":  { fond: "#fee2e2", texte: "#991b1b" },
  "3 - Approfondir": { fond: "#ede9fe", texte: "#5b21b6" },
  "4 - En cours":   { fond: "#dbeafe", texte: "#1e40af" },
  "5 - Transférer": { fond: "#f3e8ff", texte: "#6b21a8" },
  "6 - En attente": { fond: "#fde8d6", texte: "#9a4a00" },
  "7 - Clôturer":   { fond: "#e5e7eb", texte: "#374151" }
};
const STATUT_NOUVEAU = "0-Nouveau";
// Statuts "actifs" (0 à 4) : seuls cochés par défaut dans les filtres Statut, et après « Réinitialiser ».
const STATUTS_ACTIFS_PAR_DEFAUT = ["0-Nouveau", "1 - Collecter", "2 - Qualifier", "3 - Approfondir", "4 - En cours"];
const STATUT_EN_COURS = "4 - En cours";

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
  "Date_de_derniere_modification": 120,
  "Priorite": 84,
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
  "Priorite", "Statut", "Date_de_derniere_modification", "Date_de_soumission", "Organisation", "Sponsor", "Porteurs",
  "Titre", "Typologie_de_la_demande", "Parties_prenantes_concernees", "Action_ouverte"
];

const LIBELLES_COLONNES = {
  "Priorite": "Priorité",
  "Statut": "Statut",
  "Date_de_derniere_modification": "Dernière modification (RIDA)",
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
let filtrePrioriteSelection = new Set();      // vide = toutes les priorités (valeur "" = sans priorité)
let filtreTypologieSelection = new Set();    // vide = toutes les typologies
let filtreOrganisationSelection = new Set(); // vide = toutes les organisations
let filtreSponsorTexte = "";          // recherche libre dans le Sponsor
let filtrePorteurTexte = "";          // recherche libre dans le(s) Porteur(s)
let filtrePartiePrenanteTexte = "";   // recherche libre dans les Parties prenantes
let filtreTitreTexte = "";
// Filtre Statut à sélection multiple : initialisé sur les statuts 0 à 4
let filtreStatutSelection = new Set(STATUTS_ACTIFS_PAR_DEFAUT);
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
    let acteurs = await grist.docApi.fetchTable(TABLE_ACTEURS);
    if (!(COLONNE_TELEPHONE_ACTEURS in acteurs) && !creationColonneTelephoneRefusee) {
      try {
        await grist.docApi.applyUserActions([["AddColumn", TABLE_ACTEURS, COLONNE_TELEPHONE_ACTEURS, { type: "Text", label: "Téléphone" }]]);
        acteurs = await grist.docApi.fetchTable(TABLE_ACTEURS);
      } catch (e) {
        creationColonneTelephoneRefusee = true; // on n'insiste pas à chaque rechargement
        console.error("Impossible de créer la colonne " + COLONNE_TELEPHONE_ACTEURS + " :", e);
      }
    }
    if (!telephoneActeursRefuse) colonneTelephoneActeursDisponible = COLONNE_TELEPHONE_ACTEURS in acteurs;
    acteursParId = {};
    const ids = acteurs.id || [];
    for (let i = 0; i < ids.length; i++) {
      acteursParId[ids[i]] = {
        Nom_et_Prenom: acteurs.Nom_et_Prenom ? acteurs.Nom_et_Prenom[i] : "",
        Organisation: acteurs.Organisation ? acteurs.Organisation[i] : "",
        Organisation_Path: acteurs.Organisation_Path ? acteurs.Organisation_Path[i] : "",
        Role: acteurs.Role ? acteurs.Role[i] : "",
        mail: acteurs.mail ? acteurs.mail[i] : "",
        Telephone: acteurs.Telephone ? acteurs.Telephone[i] : ""
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
    if (!dateModifRidaRefusee) colonneDateModifRidaDisponible = COLONNE_DATE_MODIF_RIDA in rida;
    ridaToutes = tableVersLignes(rida);
  } catch (e) { console.error("Erreur chargement RIDA :", e); }
}

// Crée la colonne "Date de modification" (DateTime) dans la table RIDA si elle n'existe pas.
async function creerColonneDateModifRida() {
  // Colonne simple (DateTime), horodatée par le widget à chaque écriture RIDA. Pas de formule
  // déclencheur : plus fragile côté Grist (voir appliquerActions).
  const infos = { type: "DateTime:Europe/Paris", label: "Date de modification", isFormula: false };
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

function escapeHtml(valeur) {
  return String(valeur == null ? "" : valeur)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Tableaux markdown : | A | B | puis ligne de séparation |---|:--:| (alignements : :--- gauche,
// :---: centre, ---: droite) ---
function mdDecouperLigneTableau(ligne) {
  let t = ligne.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, "|").trim());
}
function mdEstLigneTableau(ligne) { return ligne.includes("|") && ligne.trim() !== ""; }
function mdEstSeparateurTableau(ligne) {
  if (!ligne.includes("|") && !/^\s*:?-{3,}:?\s*$/.test(ligne)) return false;
  const cellules = mdDecouperLigneTableau(ligne);
  return cellules.length >= 1 && cellules.every(c => /^:?-+:?$/.test(c)) && ligne.includes("|");
}
function mdTableauHtml(entete, alignements, lignesCorps, indentPx) {
  const style = (i) => alignements[i] ? " style='text-align:" + alignements[i] + ";'" : "";
  let h = "<div class='md-tableau-conteneur' style='margin-left:" + indentPx + "px;'><table class='md-tableau'><thead><tr>";
  entete.forEach((c, i) => { h += "<th" + style(i) + ">" + c + "</th>"; });
  h += "</tr></thead><tbody>";
  lignesCorps.forEach(cells => {
    h += "<tr>";
    for (let i = 0; i < entete.length; i++) h += "<td" + style(i) + ">" + (cells[i] || "") + "</td>";
    h += "</tr>";
  });
  return h + "</tbody></table></div>";
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

  for (let idx = 0; idx < lignes.length; idx++) {
    const ligne = lignes[idx];
    // Tableau : ligne d'en-tête + ligne de séparation, puis les lignes suivantes contenant "|"
    if (mdEstLigneTableau(ligne) && idx + 1 < lignes.length && mdEstSeparateurTableau(lignes[idx + 1])) {
      const entete = mdDecouperLigneTableau(ligne);
      const alignements = mdDecouperLigneTableau(lignes[idx + 1]).map(c =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "");
      const corps = [];
      let j = idx + 2;
      while (j < lignes.length && mdEstLigneTableau(lignes[j])) { corps.push(mdDecouperLigneTableau(lignes[j])); j++; }
      if (dansListe) { html += "</ul>"; dansListe = false; }
      html += mdTableauHtml(entete, alignements, corps, indentActuel * PAS_INDENT);
      idx = j - 1;
      continue;
    }
    // On teste du plus spécifique (###) au moins spécifique (#)
    const matchH3 = /^###\s+(.+)$/.exec(ligne);
    const matchH2 = !matchH3 ? /^##\s+(.+)$/.exec(ligne) : null;
    const matchH1 = (!matchH3 && !matchH2) ? /^#\s+(.+)$/.exec(ligne) : null;

    if (matchH1 || matchH2 || matchH3) {
      if (dansListe) { html += "</ul>"; dansListe = false; }
      if (matchH1) {
        html += "<div style='font-size:calc(19px * var(--echelle-texte)); font-weight:bold; margin:8px 0; margin-left:0px;'>" + matchH1[1] + "</div>";
        indentActuel = 1;
      } else if (matchH2) {
        html += "<div style='font-size:calc(16px * var(--echelle-texte)); font-weight:bold; margin:6px 0; margin-left:" + (PAS_INDENT * 1) + "px;'>" + matchH2[1] + "</div>";
        indentActuel = 2;
      } else {
        html += "<div style='font-size:calc(14px * var(--echelle-texte)); font-weight:bold; margin:5px 0; margin-left:" + (PAS_INDENT * 2) + "px;'>" + matchH3[1] + "</div>";
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

// --- Recherche "tout azimut" (champ à côté de ⚙) ---
// Cherche (sans casse ni accents) dans TOUS les champs de la demande (noms des acteurs résolus
// pour Sponsor / Parties prenantes, dates lisibles) et dans toutes les lignes RIDA associées
// (type, porteur, dates, description). Plusieurs mots = tous doivent être présents (ET), dans
// n'importe quel champ. Se déclenche à partir de 3 caractères.
const RECHERCHE_GLOBALE_MIN_CAR = 3;
let rechercheGlobaleTexte = "";
let indexRechercheGlobale = { lignes: null, rida: null, acteurs: null, textes: new Map() };

function rechercheGlobaleEstActive() {
  return rechercheGlobaleTexte.trim().length >= RECHERCHE_GLOBALE_MIN_CAR;
}

function valeurVersTexteRecherche(cle, valeur) {
  if (valeur === null || valeur === undefined || valeur === "" || typeof valeur === "boolean") return "";
  if (cle === "Sponsor" || cle === "Parties_prenantes_concernees") {
    const ids = refListVersIds(valeur).filter(id => Number.isInteger(id) && acteursParId[id]);
    return ids.map(ligneActeur).join(" ");
  }
  if (typeof valeur === "number") {
    return /date|_le$/i.test(cle) ? formaterDate(valeur) + " " + formaterDateHeure(valeur) : String(valeur);
  }
  if (Array.isArray(valeur)) return valeur.filter(v => v !== "L" && v !== null && typeof v !== "object").join(" ");
  if (typeof valeur === "object") return "";
  return String(valeur);
}

function cleIgnoreeRecherche(cle) {
  return cle === "id" || cle === "manualSort" || cle.startsWith("gristHelper_") || cle.startsWith("__");
}

function texteRechercheLigne(ligne, ridaDeLaLigne) {
  const morceaux = [];
  for (const cle in ligne) {
    if (cleIgnoreeRecherche(cle)) continue;
    const t = valeurVersTexteRecherche(cle, ligne[cle]);
    if (t) morceaux.push(t);
  }
  ridaDeLaLigne.forEach(r => {
    morceaux.push(LIBELLES_TYPE_RIDA[r.RIDA] || "");
    for (const cle in r) {
      if (cleIgnoreeRecherche(cle) || cle === "ID2") continue;
      const t = valeurVersTexteRecherche(cle, r[cle]);
      if (t) morceaux.push(t);
    }
  });
  return normaliserTexteRecherche(morceaux.join(" | "));
}

function indexRechercheGlobaleAJour() {
  const idx = indexRechercheGlobale;
  if (idx.lignes === lignesEmergence && idx.rida === ridaToutes && idx.acteurs === acteursParId) return idx.textes;
  const ridaParDemande = new Map();
  ridaToutes.forEach(r => {
    const id = idDepuisRef(r.ID2);
    if (!ridaParDemande.has(id)) ridaParDemande.set(id, []);
    ridaParDemande.get(id).push(r);
  });
  const textes = new Map();
  lignesEmergence.forEach(l => textes.set(l.id, texteRechercheLigne(l, ridaParDemande.get(l.id) || [])));
  indexRechercheGlobale = { lignes: lignesEmergence, rida: ridaToutes, acteurs: acteursParId, textes };
  return textes;
}

function ligneCorrespondALaRechercheGlobale(ligne, textes, mots) {
  const texte = textes.get(ligne.id) || "";
  return mots.every(m => texte.indexOf(m) !== -1);
}

function motsRechercheGlobale() {
  return normaliserTexteRecherche(rechercheGlobaleTexte).split(/\s+/).filter(Boolean);
}

function mettreAJourCompteurRechercheGlobale(nbAffichees) {
  const compteur = document.getElementById("compteur-recherche-globale");
  const badgeMasques = document.getElementById("compteur-masques-recherche-globale");
  const btnEffacer = document.getElementById("btn-effacer-recherche-globale");
  if (!compteur) return;
  const saisie = rechercheGlobaleTexte.trim();
  if (btnEffacer) btnEffacer.style.display = saisie ? "" : "none";
  if (badgeMasques) { badgeMasques.style.display = "none"; badgeMasques.textContent = ""; }
  if (!saisie) { compteur.textContent = ""; return; }
  if (!rechercheGlobaleEstActive()) {
    compteur.textContent = RECHERCHE_GLOBALE_MIN_CAR + " caractères minimum";
    return;
  }
  const textes = indexRechercheGlobaleAJour();
  const mots = motsRechercheGlobale();
  const totalTrouvees = lignesEmergence.filter(l => ligneCorrespondALaRechercheGlobale(l, textes, mots)).length;
  const masquees = totalTrouvees - nbAffichees;
  compteur.textContent = nbAffichees + " résultat" + (nbAffichees > 1 ? "s" : "");
  // Résultats de la recherche écartés par les autres filtres (statut, priorité, ...) : affichés
  // à droite du champ uniquement s'il y en a.
  if (badgeMasques && masquees > 0) {
    badgeMasques.textContent = "+" + masquees + " masqué" + (masquees > 1 ? "s" : "") + " par les filtres";
    badgeMasques.title = masquees + " résultat" + (masquees > 1 ? "s" : "") + " de la recherche " + (masquees > 1 ? "sont écartés" : "est écarté") + " par les autres filtres actifs (statut, priorité, etc.) : ajuste-les pour les voir.";
    badgeMasques.style.display = "";
  }
}

function appliquerFiltres(lignes) {
  const textesRecherche = rechercheGlobaleEstActive() ? indexRechercheGlobaleAJour() : null;
  const motsRecherche = textesRecherche ? motsRechercheGlobale() : null;
  return lignes.filter(l => {
    if (textesRecherche && !ligneCorrespondALaRechercheGlobale(l, textesRecherche, motsRecherche)) return false;
    if (filtreStatutSelection.size > 0 && !filtreStatutSelection.has(l.Statut)) return false;
    if (filtrePrioriteSelection.size > 0 && !filtrePrioriteSelection.has(l.Priorite || "")) return false;
    if (filtreTypologieSelection.size > 0 && !filtreTypologieSelection.has(l.Typologie_de_la_demande)) return false;
    if (filtreOrganisationSelection.size > 0 && !filtreOrganisationSelection.has(l.Organisation)) return false;
    if (filtreSponsorTexte) {
      if (normaliserTexteRecherche(nomActeurParId(l.Sponsor)).indexOf(normaliserTexteRecherche(filtreSponsorTexte)) === -1) return false;
    }
    if (filtrePorteurTexte) {
      if (normaliserTexteRecherche(l.Porteurs || "").indexOf(normaliserTexteRecherche(filtrePorteurTexte)) === -1) return false;
    }
    if (filtrePartiePrenanteTexte) {
      if (normaliserTexteRecherche(nomActeur(l.Parties_prenantes_concernees)).indexOf(normaliserTexteRecherche(filtrePartiePrenanteTexte)) === -1) return false;
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
  popup.innerHTML = blocTailleTexteHtml() + ORDRE_COLONNES.map(col =>
    "<label><input type='checkbox' class='case-config-colonne' value=\"" + escapeHtml(col) + "\"" +
    (colonnesVisibles.has(col) ? " checked" : "") + ">" + escapeHtml(LIBELLES_COLONNES[col] || col) + "</label>"
  ).join("") +
    "<div class='bloc-export-excel'><button type='button' id='btn-export-excel-zip' title='Un fichier Excel par table Emergence, dans une archive .zip'>📦 Exporter toutes les tables (Excel, .zip)</button>" +
    "<div id='msg-export-excel' class='msg-export-excel'></div></div>";

  brancherBoutonsTailleTexte(popup);
  const btnExcel = popup.querySelector("#btn-export-excel-zip");
  if (btnExcel) btnExcel.addEventListener("click", (e) => { e.stopPropagation(); exporterExcelZip(); });
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
  if (champ === "priorite") return filtrePrioriteSelection.size > 0;
  if (champ === "typologie") return filtreTypologieSelection.size > 0;
  if (champ === "organisation") return filtreOrganisationSelection.size > 0;
  if (champ === "sponsor") return !!filtreSponsorTexte;
  if (champ === "porteur") return !!filtrePorteurTexte;
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

function effacerFiltreListeColonne(champ) {
  if (champ === "statut") filtreStatutSelection.clear();
  else if (champ === "priorite") filtrePrioriteSelection.clear();
  else if (champ === "typologie") filtreTypologieSelection.clear();
  else if (champ === "organisation") filtreOrganisationSelection.clear();
  else if (champ === "sponsor") filtreSponsorTexte = "";
  else if (champ === "porteur") filtrePorteurTexte = "";
  else if (champ === "partie-prenante") filtrePartiePrenanteTexte = "";
  else if (champ === "titre") filtreTitreTexte = "";
}

// Petite croix en tête de popup (visible seulement quand le filtre est actif) : supprime le
// filtre de la colonne ; elle se masque d'elle-même une fois le filtre retiré.
function ajouterCroixSuppressionFiltre(popup, estActif, effacer, rafraichir) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-supprimer-filtre";
  btn.title = "Supprimer le filtre";
  btn.innerHTML = "✕ <span>Supprimer le filtre</span>";
  btn.style.display = estActif() ? "" : "none";
  btn.addEventListener("click", () => {
    popup.querySelectorAll("input[type='checkbox']").forEach(cb => { cb.checked = false; });
    popup.querySelectorAll("input[type='text']").forEach(inp => { inp.value = ""; });
    popup.querySelectorAll("select").forEach(sel => { sel.value = "tout"; });
    effacer(); // après le nettoyage générique (le type RIDA recoche I/D/A)
    rafraichir();
    btn.style.display = "none";
  });
  popup.insertBefore(btn, popup.firstChild);
  return btn;
}

function construireContenuPopupFiltreListeColonne(champ) {
  if (champ === "titre") {
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"titre\" value=\"" +
      escapeHtml(filtreTitreTexte) + "\" placeholder='Filtrer par titre...'>";
  }
  if (champ === "sponsor" || champ === "porteur" || champ === "partie-prenante") {
    const valeur = champ === "sponsor" ? filtreSponsorTexte : champ === "porteur" ? filtrePorteurTexte : filtrePartiePrenanteTexte;
    const invite = champ === "sponsor" ? "Filtrer par sponsor..." : champ === "porteur" ? "Filtrer par porteur..." : "Filtrer par partie prenante...";
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"" + champ + "\" list='datalist-filtre-pp' value=\"" +
      escapeHtml(valeur) + "\" placeholder='" + invite + "'>";
  }
  if (champ === "statut") {
    return Object.keys(COULEURS_STATUT).map(s =>
      "<label><input type='checkbox' class='case-filtre-liste-statut' value=\"" + escapeHtml(s) + "\"" +
      (filtreStatutSelection.has(s) ? " checked" : "") + ">" + escapeHtml(s) + "</label>"
    ).join("");
  }
  if (champ === "priorite") {
    const options = CHOIX_PRIORITE.concat([""]);
    return options.map(v =>
      "<label><input type='checkbox' class='case-filtre-liste-priorite' value=\"" + escapeHtml(v) + "\"" +
      (filtrePrioriteSelection.has(v) ? " checked" : "") + ">" + (v ? escapeHtml(v) : "Sans priorité") + "</label>"
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

  const croixListe = ajouterCroixSuppressionFiltre(popup,
    () => filtreListeColonneEstActif(champ),
    () => effacerFiltreListeColonne(champ),
    () => { afficherListe(); mettreAJourIconesFiltreListe(); });
  popup.addEventListener("input", () => { croixListe.style.display = filtreListeColonneEstActif(champ) ? "" : "none"; });
  popup.addEventListener("change", () => { croixListe.style.display = filtreListeColonneEstActif(champ) ? "" : "none"; });

  const champTexte = popup.querySelector(".champ-filtre-liste-texte");
  if (champTexte) {
    champTexte.addEventListener("input", (e) => {
      const c = e.target.getAttribute("data-champ");
      if (c === "titre") filtreTitreTexte = e.target.value;
      else if (c === "sponsor") filtreSponsorTexte = e.target.value;
      else if (c === "porteur") filtrePorteurTexte = e.target.value;
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
  popup.querySelectorAll(".case-filtre-liste-priorite").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtrePrioriteSelection.add(cb.value);
      else filtrePrioriteSelection.delete(cb.value);
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
  filtreStatutSelection = new Set(STATUTS_ACTIFS_PAR_DEFAUT);
  filtrePrioriteSelection = new Set();
  filtreTypologieSelection = new Set();
  filtreOrganisationSelection = new Set();
  filtreSponsorTexte = "";
  filtrePorteurTexte = "";
  filtrePartiePrenanteTexte = "";
  filtreTitreTexte = "";
  rechercheGlobaleTexte = "";
  const champRechercheGlobale = document.getElementById("champ-recherche-globale");
  if (champRechercheGlobale) champRechercheGlobale.value = "";
  fermerPopupFiltreListeColonne();
  afficherListe();
  mettreAJourIconesFiltreListe();
});

// Champ de recherche globale : déclenché à partir de 3 caractères (légère temporisation pour ne pas
// recalculer à chaque frappe), Échap ou ✕ pour effacer.
(function initRechercheGlobale() {
  const champ = document.getElementById("champ-recherche-globale");
  const btn = document.getElementById("btn-effacer-recherche-globale");
  if (!champ) return;
  let minuteur = null;
  const appliquer = () => {
    const etaitActive = rechercheGlobaleEstActive();
    rechercheGlobaleTexte = champ.value;
    if (etaitActive || rechercheGlobaleEstActive()) afficherListe(); // en dessous du seuil : liste inchangée
    else mettreAJourCompteurRechercheGlobale(0);
  };
  champ.addEventListener("input", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(appliquer, 150);
  });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && champ.value) { champ.value = ""; clearTimeout(minuteur); appliquer(); e.stopPropagation(); }
  });
  if (btn) btn.addEventListener("click", () => { champ.value = ""; clearTimeout(minuteur); appliquer(); champ.focus(); });
})();

// --- Liste ---
// Dernière modification d'une demande = la plus récente date de modification parmi ses lignes
// RIDA (une ligne RIDA jamais horodatée compte pour la date par défaut). Index recalculé
// seulement quand la table RIDA est rechargée.
let indexDerniereModifDemande = { rida: null, map: new Map() };
function epochDerniereModifDemande(ligneId) {
  if (indexDerniereModifDemande.rida !== ridaToutes) {
    const map = new Map();
    ridaToutes.forEach(r => {
      const id = idDepuisRef(r.ID2);
      const t = (typeof r[COLONNE_DATE_MODIF_RIDA] === "number" && r[COLONNE_DATE_MODIF_RIDA]) || DATE_MODIF_RIDA_PAR_DEFAUT;
      if (!map.has(id) || t > map.get(id)) map.set(id, t);
    });
    indexDerniereModifDemande = { rida: ridaToutes, map };
  }
  return indexDerniereModifDemande.map.has(ligneId) ? indexDerniereModifDemande.map.get(ligneId) : null;
}

function formaterDerniereModifDemande(ligneId) {
  const t = epochDerniereModifDemande(ligneId);
  if (t === null) return "";
  return t === DATE_MODIF_RIDA_PAR_DEFAUT ? formaterDate(t) : formaterDateHeure(t);
}

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
    // Priorité : une demande sans priorité passe après P3 (équivaut à "P9") pour le tri
    if (colonneTri === "Priorite") {
      vA = a.Priorite ? String(a.Priorite).trim() : "P9";
      vB = b.Priorite ? String(b.Priorite).trim() : "P9";
    }
    if (colonneTri === "Date_de_derniere_modification") {
      vA = epochDerniereModifDemande(a.id);
      vB = epochDerniereModifDemande(b.id);
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

// Icône de priorité pour la liste des demandes (colonne "Priorité") : pastille de couleur,
// avec le libellé complet en info-bulle. Valeurs : P1 - HAUTE, P2- MOYENNE, P3- BASSE.
function iconePriorite(priorite) {
  if (!priorite) return "<span style='color:#bbb;'>—</span>";
  const code = String(priorite).trim().substring(0, 2).toUpperCase();
  const pastille = { P1: "🔴", P2: "🟠", P3: "🟢" }[code] || "⚪";
  return "<span class='icone-priorite' title=\"" + escapeHtml(priorite) + "\">" + pastille + "</span>";
}

function afficherListe() {
  const corps = document.getElementById("corps-tableau");
  const lignesFiltrees = appliquerFiltres(lignesEmergence);
  const lignesTriees = trierLignes(lignesFiltrees);
  mettreAJourCompteurRechercheGlobale(lignesTriees.length);

  if (lignesTriees.length === 0) {
    corps.innerHTML = "<tr><td colspan='11' class='chargement'>Aucune ligne trouvée.</td></tr>";
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
      const estClos = elementRida.RIDA === "A" && !!elementRida.Fait_le; // « Clos » ne concerne que les Actions
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
      "<td class='cellule-priorite'>" + iconePriorite(ligne.Priorite) + "</td>" +
      "<td class='cellule-statut-modifiable' title='Cliquer pour changer le statut'>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td class='cellule-derniere-modif' title='Dernière modification des lignes RIDA de cette demande'>" + (formaterDerniereModifDemande(ligne.id) || "—") + "</td>" +
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
  // Clic sur le statut : liste déroulante pour le modifier directement depuis la liste.
  corps.querySelectorAll("tr[data-id] td.cellule-statut-modifiable").forEach(td => {
    td.addEventListener("click", (e) => {
      e.stopPropagation(); // ne change pas la fiche sélectionnée
      ouvrirPopupStatutListe(td, parseInt(td.closest("tr").getAttribute("data-id"), 10));
    });
  });
  mettreAJourFleches();
  appliquerLargeursColonnes();
  appliquerVisibiliteColonnes();
}

// Popup de choix du statut d'une demande, ouverte depuis la liste. Un second clic sur la même
// cellule la referme ; un clic ailleurs aussi (même mécanisme que les filtres de colonnes).
function ouvrirPopupStatutListe(cellule, ligneId) {
  const dejaOuverte = cellule.classList.contains("statut-popup-ouvert");
  fermerPopupFiltreListeColonne();
  document.querySelectorAll("#table-liste .statut-popup-ouvert").forEach(c => c.classList.remove("statut-popup-ouvert"));
  document.querySelectorAll("#table-liste .icone-filtre-action").forEach(i => i.classList.remove("filtre-popup-ouverte"));
  if (dejaOuverte) return;
  const ligne = lignesEmergence.find(l => l.id === ligneId);
  if (!ligne) return;

  const popup = document.createElement("div");
  popup.className = "popup-filtre-action-colonne popup-filtre-liste-colonne popup-statut-liste";
  popup.innerHTML = Object.keys(COULEURS_STATUT).map(st =>
    "<button type='button' class='option-statut-liste" + (st === ligne.Statut ? " option-courante" : "") +
    "' data-statut=\"" + escapeHtml(st) + "\">" + badgeStatut(st) + (st === ligne.Statut ? " ✓" : "") + "</button>"
  ).join("");
  document.body.appendChild(popup);
  cellule.classList.add("statut-popup-ouvert");

  const rect = cellule.getBoundingClientRect();
  popup.style.top = (rect.bottom + 2) + "px";
  let gauche = rect.left;
  const largeur = popup.offsetWidth || 180;
  if (gauche + largeur > window.innerWidth - 8) gauche = Math.max(8, window.innerWidth - 8 - largeur);
  popup.style.left = gauche + "px";
  popup.addEventListener("click", (e) => e.stopPropagation());
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());

  popup.querySelectorAll(".option-statut-liste").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nouveau = btn.getAttribute("data-statut");
      fermerPopupFiltreListeColonne();
      cellule.classList.remove("statut-popup-ouvert");
      if (nouveau === ligne.Statut) return;
      try {
        await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { Statut: nouveau }]]);
        await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
      } catch (err) {
        alert("Erreur lors du changement de statut : " + err.message);
      }
    });
  });
}

// --- Navigation clavier entre les fiches (onglet Demandes) : ↑/← fiche précédente, ↓/→ fiche
// suivante, dans l'ordre de la liste affichée (filtres et tri actuels). Sans effet quand le focus
// est dans un champ de saisie, quand une fenêtre modale est ouverte, ou hors de l'onglet Demandes.
function naviguerFicheClavier(sens) {
  const lignes = trierLignes(appliquerFiltres(lignesEmergence));
  if (lignes.length === 0) return;
  const index = lignes.findIndex(l => l.id === ligneSelectionneeId);
  let cible;
  if (index === -1) cible = sens > 0 ? lignes[0] : lignes[lignes.length - 1];
  else cible = lignes[index + sens]; // aux extrémités : on reste sur place (pas de bouclage)
  if (!cible || cible.id === ligneSelectionneeId) return;
  selectionnerLigne(cible.id);
  const tr = document.querySelector('#corps-tableau tr[data-id="' + cible.id + '"]');
  if (tr && typeof tr.scrollIntoView === "function") tr.scrollIntoView({ block: "nearest" });
}

document.addEventListener("keydown", (e) => {
  if (vueActuelle !== "demandes") return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const touches = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
  if (!(e.key in touches)) return;
  const cible = e.target;
  if (cible && cible.closest && cible.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
  const modaleOuverte = [...document.querySelectorAll(".modale-fond")].some(m => m.style.display !== "none");
  if (modaleOuverte || document.querySelector(".popup-filtre-liste-colonne, .popup-filtre-action-colonne")) return;
  e.preventDefault();
  naviguerFicheClavier(touches[e.key]);
});

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
    "<td class='rida-date-modif'>" + escapeHtml(formaterDateModifRida(r)) + "</td>" +
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

// Largeurs (px) des colonnes du tableau RIDA de la fiche ; "Description" prend le reste.
const CLE_STOCKAGE_LARGEURS_RIDA_FICHE = "emergence_largeurs_rida_fiche";
const LARGEURS_RIDA_FICHE_DEFAUT = { RIDA: 80, Porteur: 150, Pour_le: 140, Fait_le: 140, Date_de_modification: 120 };
let largeursRidaFiche = Object.assign({}, LARGEURS_RIDA_FICHE_DEFAUT);
try {
  const brut = window.localStorage.getItem(CLE_STOCKAGE_LARGEURS_RIDA_FICHE);
  if (brut) {
    const o = JSON.parse(brut);
    Object.keys(LARGEURS_RIDA_FICHE_DEFAUT).forEach(k => { if (Number.isFinite(o[k]) && o[k] >= 50) largeursRidaFiche[k] = o[k]; });
  }
} catch (e) { /* valeurs par défaut */ }

function appliquerLargeursRidaFiche() {
  document.querySelectorAll("col[data-col-rida-w]").forEach(col => {
    const l = largeursRidaFiche[col.getAttribute("data-col-rida-w")];
    if (l) col.style.width = l + "px";
  });
}

function sauvegarderLargeursRidaFiche() {
  try { window.localStorage.setItem(CLE_STOCKAGE_LARGEURS_RIDA_FICHE, JSON.stringify(largeursRidaFiche)); } catch (e) { /* non mémorisé */ }
}

function genererTableauRidaEditable(ridaLies) {
  let lignesHtml = "";
  ridaLies.forEach(r => { lignesHtml += genererLigneRidaEditable(r); });
  const col = (k) => "<col data-col-rida-w='" + k + "' style='width:" + largeursRidaFiche[k] + "px;'>";
  const poignee = "<span class='poignee-rida'></span>";

  return (
    "<table class='tableau-fiche tableau-rida-editable'>" +
    "<colgroup>" + col("RIDA") + col("Porteur") + col("Pour_le") + col("Fait_le") + col("Date_de_modification") + "<col><col style='width:60px;'></colgroup>" +
    "<thead><tr><th data-col-rida-w='RIDA'>RIDA" + poignee + "</th><th data-col-rida-w='Porteur'>Porteur" + poignee + "</th>" +
    "<th data-col-rida='Pour_le' data-col-rida-w='Pour_le' class='rida-th-triable'>Pour le <span class='fleche-rida'></span>" + poignee + "</th>" +
    "<th data-col-rida-w='Fait_le'>Fait le" + poignee + "</th>" +
    "<th data-col-rida-w='Date_de_modification'>Modifié le" + poignee + "</th>" +
    "<th>Description</th><th></th></tr></thead>" +
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

  // --- Largeur des colonnes du tableau RIDA (poignées dans les en-têtes) ---
  conteneur.querySelectorAll(".tableau-rida-editable .poignee-rida").forEach(poignee => {
    poignee.addEventListener("click", (e) => e.stopPropagation()); // ne déclenche pas le tri
    poignee.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      poignee.setPointerCapture(e.pointerId);
      const th = poignee.closest("th");
      const cle = th.getAttribute("data-col-rida-w");
      const gauche = th.getBoundingClientRect().left;
      poignee.classList.add("active-resize");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      const onMove = (ev) => {
        largeursRidaFiche[cle] = Math.max(50, Math.round(ev.clientX - gauche));
        appliquerLargeursRidaFiche();
      };
      const onUp = (ev) => {
        try { poignee.releasePointerCapture(ev.pointerId); } catch (err) { /* ignoré */ }
        poignee.removeEventListener("pointermove", onMove);
        poignee.removeEventListener("pointerup", onUp);
        poignee.classList.remove("active-resize");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        sauvegarderLargeursRidaFiche();
      };
      poignee.addEventListener("pointermove", onMove);
      poignee.addEventListener("pointerup", onUp);
    });
  });

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
    "<td><input type='text' class='acteur-input' data-field='Telephone' value=\"" + escapeHtml(info.Telephone) + "\"" +
      (colonneTelephoneActeursDisponible ? "" : " disabled title=\"Colonne Téléphone indisponible dans Grist\"") + "></td>" +
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
    : "<tr><td colspan='7' class='chargement'>Aucun acteur trouvé.</td></tr>";

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
  document.getElementById("modale-acteur-telephone").value = "";
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
  document.getElementById("modale-acteur-telephone").value = info.Telephone || "";
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
  const telephone = document.getElementById("modale-acteur-telephone").value.trim();
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
          mail: mail,
          Telephone: telephone
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
      if (!infosActuelles.Telephone && telephone) champsACompleter.Telephone = telephone;
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
          mail: mail,
          Telephone: telephone
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
    const idsAvant = new Set(lignesEmergence.map(l => l.id));
    const resultat = await appliquerActions([
      ["AddRecord", TABLE_PRINCIPALE, null, { Statut: STATUT_NOUVEAU }]
    ]);
    let nouvelId = resultat && resultat.retValues ? resultat.retValues[0] : null;
    if (Array.isArray(nouvelId)) nouvelId = nouvelId[0];
    if (typeof nouvelId !== "number") nouvelId = null;

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
    // Si l'identifiant n'a pas été renvoyé par Grist, on retrouve la ligne ajoutée : c'est
    // celle dont l'id n'existait pas avant la création.
    if (!nouvelId) {
      const nouvelles = lignesEmergence.filter(l => !idsAvant.has(l.id));
      if (nouvelles.length) nouvelId = nouvelles[nouvelles.length - 1].id;
    }
    afficherListe();
    if (nouvelId) {
      if (vueActuelle !== "demandes") basculerVue("demandes");
      selectionnerLigne(nouvelId); // ouvre la fiche
      const ficheNouvelle = lignesEmergence.find(l => l.id === nouvelId);
      const conteneurFiche = document.getElementById("fiche-container");
      if (ficheNouvelle && conteneurFiche && !conteneurFiche.innerHTML.trim()) afficherFiche(ficheNouvelle);
      // La fiche s'affiche sous la liste : on l'amène à l'écran pour qu'elle soit bien visible
      // (sans cela, avec une longue liste, elle s'ouvre hors de la zone visible).
      const tr = document.querySelector('#corps-tableau tr[data-id="' + nouvelId + '"]');
      if (tr && typeof tr.scrollIntoView === "function") tr.scrollIntoView({ block: "nearest" });
      if (conteneurFiche && typeof conteneurFiche.scrollIntoView === "function") conteneurFiche.scrollIntoView({ block: "start" });
    }
  } catch (err) {
    alert("Erreur lors de la création de la demande : " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// --- Vue Actions (tableau consolidé, tous dossiers confondus) ---
let filtreActionType = new Set(["I", "D", "A"]);           // vide ou taille 3 = pas de filtre
let filtreActionStatutSelection = new Set(STATUTS_ACTIFS_PAR_DEFAUT); // défaut : statuts 0 à 4
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
  popup.innerHTML = blocTailleTexteHtml() + ORDRE_COLONNES_ACTIONS.map(col =>
    "<label><input type='checkbox' class='case-config-colonne-actions' value=\"" + escapeHtml(col) + "\"" +
    (colonnesVisiblesActions.has(col) ? " checked" : "") + ">" + escapeHtml(LIBELLES_COLONNES_ACTIONS[col] || col) + "</label>"
  ).join("");
  brancherBoutonsTailleTexte(popup);
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

function effacerFiltreActionColonne(champ) {
  if (champ === "titre") filtreActionTitre = "";
  else if (champ === "sponsor") filtreActionSponsor = "";
  else if (champ === "organisation") filtreActionOrganisationSelection.clear();
  else if (champ === "statut") filtreActionStatutSelection.clear();
  else if (champ === "RIDA") ["I", "D", "A"].forEach(v => filtreActionType.add(v));
  else if (champ === "Porteur") filtreActionPorteur = "";
  else if (champ === "Fait_le") filtreActionFaitLe = "tout";
  else if (champ === "Description") filtreActionDescription = "";
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

  const croixAction = ajouterCroixSuppressionFiltre(popup,
    () => filtreActionColonneEstActif(champ),
    () => {
      effacerFiltreActionColonne(champ);
      if (champ === "RIDA") popup.querySelectorAll(".case-filtre-action-type").forEach(cb => { cb.checked = true; });
    },
    () => { afficherTableauActions(); mettreAJourIconesFiltreActions(); });
  popup.addEventListener("input", () => { croixAction.style.display = filtreActionColonneEstActif(champ) ? "" : "none"; });
  popup.addEventListener("change", () => { croixAction.style.display = filtreActionColonneEstActif(champ) ? "" : "none"; });

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
  filtreActionStatutSelection = new Set(STATUTS_ACTIFS_PAR_DEFAUT);
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
      __statut: demande.statut,
      // Ligne jamais horodatée : on affiche (et trie sur) la date par défaut du 30/09/2026.
      [COLONNE_DATE_MODIF_RIDA]: r[COLONNE_DATE_MODIF_RIDA] || DATE_MODIF_RIDA_PAR_DEFAUT,
      __dateModifParDefaut: !r[COLONNE_DATE_MODIF_RIDA]
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
        "<td title=\"Date de dernière modification de la ligne (automatique)\">" + formaterDateModifRida(r) + "</td>" +
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
    if (c === "Date_de_modification") return formaterDateModifRida(r);
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

  // 3/ Demandes "0-Nouveau" ou "4 - En cours" sans aucune ligne RIDA de type Action (A).
  const demandesSansAction = lignesEmergence.filter(l =>
    (l.Statut === STATUT_NOUVEAU || l.Statut === STATUT_EN_COURS) &&
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

  const kanban = document.getElementById("kanban-activite");
  if (kanban) kanban.innerHTML = construireKanban();
}

// Kanban des demandes : une colonne par statut (dans l'ordre de COULEURS_STATUT), une carte par
// demande (titre + porteur et organisation en petit), colorée selon la priorité.
function classePrioriteKanban(priorite) {
  const code = String(priorite || "").trim().substring(0, 2).toUpperCase();
  return { P1: "kanban-p1", P2: "kanban-p2", P3: "kanban-p3" }[code] || "kanban-p0";
}

function construireKanban() {
  const statuts = Object.keys(COULEURS_STATUT);
  const connus = new Set(statuts);
  const colonnes = statuts.map(st => ({ statut: st, lignes: [] }));
  const autres = { statut: "Autre / sans statut", lignes: [] };
  lignesEmergence.forEach(l => {
    const col = colonnes.find(c => c.statut === l.Statut);
    (col || autres).lignes.push(l);
  });
  if (autres.lignes.length) colonnes.push(autres);
  const rang = (l) => l.Priorite ? String(l.Priorite).trim() : "P9";
  return colonnes.map(col => {
    col.lignes.sort((a, b) => rang(a).localeCompare(rang(b)) || String(a.Titre || "").localeCompare(String(b.Titre || "")));
    const c = COULEURS_STATUT[col.statut] || { fond: "#f3f4f6", texte: "#374151" };
    const cartes = col.lignes.map(l => {
      const detail = [l.Porteurs, l.Organisation].filter(Boolean).join(" · ");
      return "<div class='kanban-carte " + classePrioriteKanban(l.Priorite) + "' data-id='" + l.id + "' title=\"" + escapeHtml((l.Titre || "Sans titre") + (l.Priorite ? " — " + l.Priorite : "")) + "\">" +
        "<div class='kanban-carte-titre'>" + escapeHtml(l.Titre || "Sans titre") + "</div>" +
        (detail ? "<div class='kanban-carte-detail'>" + escapeHtml(detail) + "</div>" : "") +
        "</div>";
    }).join("");
    return "<div class='kanban-colonne'>" +
      "<div class='kanban-colonne-titre' style='background:" + c.fond + "; color:" + c.texte + ";'><span>" + escapeHtml(col.statut) + "</span><span>" + col.lignes.length + "</span></div>" +
      "<div class='kanban-cartes'>" + (cartes || "<div class='kanban-carte-detail' style='padding:4px;'>—</div>") + "</div></div>";
  }).join("");
}

// ===================== Export PDF de l'activité =====================
// PDF généré sans bibliothèque externe : écrivain PDF minimal (texte Helvetica, rectangles, lignes),
// en vectoriel (texte sélectionnable, net à l'impression). Format A4 paysage.
const LARGEURS_HELVETICA = {"h": [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 761, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 761, 611, 761, 761, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500], "b": [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 761, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 761, 611, 761, 761, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 761, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556]};
const CORRESPONDANCE_WINANSI = {
  "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138,
  "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151,
  "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159, " ": 32, " ": 32
};

function codeWinAnsi(caractere) {
  const c = caractere.charCodeAt(0);
  if (CORRESPONDANCE_WINANSI[caractere] !== undefined) return CORRESPONDANCE_WINANSI[caractere];
  if (c >= 32 && c <= 126) return c;
  if (c >= 160 && c <= 255) return c;
  if (c < 32) return 32;
  return 63; // caractère hors Latin-1 (emoji, etc.) : "?"
}

function creerEcrivainPdf() {
  const LARGEUR = 842, HAUTEUR = 595;
  const pages = [];
  let ops = null;

  const rvb = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "#000000");
    const v = parseInt(m ? m[1] : "000000", 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255].map(n => n.toFixed(3)).join(" ");
  };
  const nb = (n) => (Math.round(n * 100) / 100).toString();

  function largeurTexte(texte, taille, gras) {
    const table = LARGEURS_HELVETICA[gras ? "b" : "h"];
    let total = 0;
    for (const ch of String(texte)) total += (table[codeWinAnsi(ch) - 32] || 500);
    return total * taille / 1000;
  }

  function echapper(texte) {
    let s = "";
    for (const ch of String(texte)) {
      const c = codeWinAnsi(ch);
      if (c === 40 || c === 41 || c === 92) s += "\\" + String.fromCharCode(c);
      else if (c < 32 || c > 126) s += "\\" + ("00" + c.toString(8)).slice(-3);
      else s += String.fromCharCode(c);
    }
    return s;
  }

  // Découpe un texte en lignes qui tiennent dans largeurMax (retour à la ligne sur les espaces,
  // coupure des mots trop longs). Au-delà de maxLignes, la dernière ligne est tronquée par « … ».
  function decouper(texte, largeurMax, taille, gras, maxLignes) {
    const mots = String(texte == null ? "" : texte).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lignes = [];
    let courante = "";
    const pousser = () => { if (courante) lignes.push(courante); courante = ""; };
    mots.forEach(mot => {
      let morceau = mot;
      while (largeurTexte(morceau, taille, gras) > largeurMax) {
        let coupe = morceau.length - 1;
        while (coupe > 1 && largeurTexte(morceau.slice(0, coupe), taille, gras) > largeurMax) coupe--;
        pousser();
        lignes.push(morceau.slice(0, coupe));
        morceau = morceau.slice(coupe);
      }
      const essai = courante ? courante + " " + morceau : morceau;
      if (largeurTexte(essai, taille, gras) <= largeurMax) courante = essai;
      else { pousser(); courante = morceau; }
    });
    pousser();
    if (maxLignes && lignes.length > maxLignes) {
      lignes.length = maxLignes;
      let derniere = lignes[maxLignes - 1];
      while (derniere.length > 1 && largeurTexte(derniere + "…", taille, gras) > largeurMax) derniere = derniere.slice(0, -1);
      lignes[maxLignes - 1] = derniere + "…";
    }
    return lignes;
  }

  const api = {
    LARGEUR, HAUTEUR, largeurTexte, decouper,
    nouvellePage() { ops = []; pages.push(ops); },
    nombrePages() { return pages.length; },
    surPage(i) { ops = pages[i]; },
    rect(x, y, w, h, opt) {
      opt = opt || {};
      const yp = HAUTEUR - y - h;
      let o = "q ";
      if (opt.fill) o += rvb(opt.fill) + " rg ";
      if (opt.stroke) o += rvb(opt.stroke) + " RG " + nb(opt.lw || 0.5) + " w ";
      o += nb(x) + " " + nb(yp) + " " + nb(w) + " " + nb(h) + " re " + (opt.fill && opt.stroke ? "B" : opt.fill ? "f" : "S") + " Q";
      ops.push(o);
    },
    ligne(x1, y1, x2, y2, opt) {
      opt = opt || {};
      ops.push("q " + rvb(opt.couleur || "#cccccc") + " RG " + nb(opt.lw || 0.5) + " w " +
        (opt.tirets ? "[3 2] 0 d " : "") +
        nb(x1) + " " + nb(HAUTEUR - y1) + " m " + nb(x2) + " " + nb(HAUTEUR - y2) + " l S Q");
    },
    // (x, y) = point de départ de la ligne de base du texte, y mesuré depuis le haut de la page.
    texte(x, y, texte, opt) {
      opt = opt || {};
      const taille = opt.taille || 10;
      let xx = x;
      const l = largeurTexte(texte, taille, opt.gras);
      if (opt.align === "center") xx = x - l / 2;
      else if (opt.align === "right") xx = x - l;
      ops.push("BT " + rvb(opt.couleur || "#222222") + " rg /" + (opt.gras ? "F2" : "F1") + " " + nb(taille) + " Tf " +
        nb(xx) + " " + nb(HAUTEUR - y) + " Td (" + echapper(texte) + ") Tj ET");
    },
    finir(titre) {
      const objets = [];
      objets[1] = "<< /Type /Catalog /Pages 2 0 R >>";
      objets[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
      objets[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
      const kids = [];
      pages.forEach((contenu, i) => {
        const idPage = 5 + i * 2, idContenu = 6 + i * 2;
        kids.push(idPage + " 0 R");
        const flux = contenu.join("\n");
        objets[idPage] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + LARGEUR + " " + HAUTEUR + "] " +
          "/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + idContenu + " 0 R >>";
        objets[idContenu] = "<< /Length " + flux.length + " >>\nstream\n" + flux + "\nendstream";
      });
      objets[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>";
      const idInfo = 5 + pages.length * 2;
      objets[idInfo] = "<< /Title (" + echapper(titre || "") + ") /Creator (Widget Emergence) >>";
      let sortie = "%PDF-1.4\n";
      const offsets = [];
      for (let i = 1; i < objets.length; i++) {
        offsets[i] = sortie.length;
        sortie += i + " 0 obj\n" + objets[i] + "\nendobj\n";
      }
      const debutXref = sortie.length;
      sortie += "xref\n0 " + objets.length + "\n0000000000 65535 f \n";
      for (let i = 1; i < objets.length; i++) sortie += ("0000000000" + offsets[i]).slice(-10) + " 00000 n \n";
      sortie += "trailer\n<< /Size " + objets.length + " /Root 1 0 R /Info " + idInfo + " 0 R >>\nstartxref\n" + debutXref + "\n%%EOF\n";
      const octets = new Uint8Array(sortie.length);
      for (let i = 0; i < sortie.length; i++) octets[i] = sortie.charCodeAt(i) & 255;
      return octets;
    }
  };
  return api;
}

const COULEURS_PRIORITE_PDF = {
  "kanban-p1": { barre: "#dc2626", fond: "#fef2f2" },
  "kanban-p2": { barre: "#ea8a1a", fond: "#fff7ed" },
  "kanban-p3": { barre: "#16a34a", fond: "#f0fdf4" },
  "kanban-p0": { barre: "#9ca3af", fond: "#ffffff" }
};

function construirePdfActivite() {
  const pdf = creerEcrivainPdf();
  const L = pdf.LARGEUR, H = pdf.HAUTEUR, MARGE = 28, BAS = H - 30;
  const donnees = calculerDonneesActivite();
  const maintenant = new Date();
  const dateTexte = String(maintenant.getDate()).padStart(2, "0") + "/" + String(maintenant.getMonth() + 1).padStart(2, "0") + "/" + maintenant.getFullYear();
  const BLEU = "#1a3a6b", GRIS = "#6b7280";

  function enTete(sousTitre) {
    pdf.rect(0, 0, L, 50, { fill: BLEU });
    pdf.texte(MARGE, 31, "Émergence — Activité", { taille: 19, gras: true, couleur: "#ffffff" });
    pdf.texte(L - MARGE, 22, "Édité le " + dateTexte, { taille: 9, couleur: "#dbe4f5", align: "right" });
    if (sousTitre) pdf.texte(L - MARGE, 36, sousTitre, { taille: 9, couleur: "#dbe4f5", align: "right" });
  }
  function carte(x, y, w, h, titre) {
    pdf.rect(x, y, w, h, { fill: "#ffffff", stroke: "#d9dee7", lw: 0.7 });
    pdf.texte(x + 10, y + 16, titre, { taille: 9.5, gras: true, couleur: BLEU });
  }

  // ---------- Page 1 : indicateurs et graphiques ----------
  pdf.nouvellePage();
  const actives = lignesEmergence.filter(l => STATUTS_ACTIFS_PAR_DEFAUT.includes(l.Statut)).length;
  const actionsAFaire = donnees.porteursNonRetard.reduce((a, b) => a + b, 0) + donnees.porteursRetard.reduce((a, b) => a + b, 0);
  const actionsRetard = donnees.porteursRetard.reduce((a, b) => a + b, 0);
  enTete(lignesEmergence.length + " demandes · " + ridaToutes.length + " lignes RIDA");

  const kpis = [
    ["Demandes", lignesEmergence.length, BLEU],
    ["Demandes actives (statuts 0 à 4)", actives, "#1e40af"],
    ["Actions à faire", actionsAFaire, "#e07b1f"],
    ["dont en retard", actionsRetard, "#d64545"],
    ["Nouvelles / en cours sans action", donnees.demandesSansAction, "#9d4de0"]
  ];
  const largeurKpi = (L - 2 * MARGE - 4 * 10) / 5;
  kpis.forEach(([nom, valeur, couleur], i) => {
    const x = MARGE + i * (largeurKpi + 10);
    pdf.rect(x, 62, largeurKpi, 52, { fill: "#f8fafc", stroke: "#d9dee7", lw: 0.7 });
    pdf.rect(x, 62, 4, 52, { fill: couleur });
    pdf.texte(x + 14, 90, String(valeur), { taille: 22, gras: true, couleur });
    const lignes = pdf.decouper(nom, largeurKpi - 20, 7.5, false, 2);
    lignes.forEach((t, k) => pdf.texte(x + 14, 102 + k * 9, t, { taille: 7.5, couleur: GRIS }));
  });

  // Demandes par statut (barres verticales)
  const yG = 126, hG = 190;
  const largeurStatuts = 440;
  carte(MARGE, yG, largeurStatuts, hG, "Demandes par statut");
  {
    const n = donnees.statuts.length;
    const zoneX = MARGE + 14, zoneL = largeurStatuts - 28;
    const base = yG + hG - 40, haut = yG + 40;
    const maxV = Math.max(1, ...donnees.comptagesStatuts);
    const pas = zoneL / n, lb = Math.min(34, pas - 10);
    pdf.ligne(zoneX, base, zoneX + zoneL, base, { couleur: "#d9dee7" });
    donnees.statuts.forEach((st, i) => {
      const v = donnees.comptagesStatuts[i];
      const h = Math.round((v / maxV) * (base - haut));
      const cx = zoneX + pas * i + pas / 2;
      const c = (COULEURS_STATUT[st] && COULEURS_STATUT[st].texte) || "#3b5bdb";
      if (h > 0) pdf.rect(cx - lb / 2, base - h, lb, h, { fill: c });
      pdf.texte(cx, base - h - 4, String(v), { taille: 8.5, gras: true, align: "center" });
      pdf.decouper(st, pas - 4, 6.8, false, 3).forEach((t, k) => pdf.texte(cx, base + 11 + k * 8, t, { taille: 6.8, align: "center", couleur: "#374151" }));
    });
  }

  // Actions à faire par porteur (barres horizontales empilées)
  const xP = MARGE + largeurStatuts + 12, wP = L - MARGE - xP;
  carte(xP, yG, wP, hG, "Actions à faire par porteur");
  {
    pdf.rect(xP + 10, yG + 24, 7, 7, { fill: "#e07b1f" });
    pdf.texte(xP + 20, yG + 30, "À faire", { taille: 7, couleur: GRIS });
    pdf.rect(xP + 58, yG + 24, 7, 7, { fill: "#d64545" });
    pdf.texte(xP + 68, yG + 30, "En retard", { taille: 7, couleur: GRIS });
    const MAXP = 9;
    let liste = donnees.porteurs.map((p, i) => ({ nom: p, ok: donnees.porteursNonRetard[i], retard: donnees.porteursRetard[i] }));
    if (liste.length > MAXP) {
      const reste = liste.slice(MAXP - 1);
      liste = liste.slice(0, MAXP - 1).concat([{ nom: "Autres (" + reste.length + ")", ok: reste.reduce((a, r) => a + r.ok, 0), retard: reste.reduce((a, r) => a + r.retard, 0) }]);
    }
    if (!liste.length) pdf.texte(xP + 10, yG + 60, "Aucune action à faire.", { taille: 8, couleur: GRIS });
    const maxT = Math.max(1, ...liste.map(r => r.ok + r.retard));
    const labelW = 112, zoneBarre = wP - 20 - labelW - 24;
    liste.forEach((r, i) => {
      const y = yG + 42 + i * 15;
      pdf.texte(xP + 10 + labelW - 4, y + 8, pdf.decouper(r.nom, labelW - 6, 7.5, false, 1)[0] || "", { taille: 7.5, align: "right", couleur: "#374151" });
      const wOk = Math.round(r.ok / maxT * zoneBarre), wRe = Math.round(r.retard / maxT * zoneBarre);
      if (wOk > 0) pdf.rect(xP + 10 + labelW, y, wOk, 10, { fill: "#e07b1f" });
      if (wRe > 0) pdf.rect(xP + 10 + labelW + wOk, y, wRe, 10, { fill: "#d64545" });
      pdf.texte(xP + 10 + labelW + wOk + wRe + 4, y + 8, String(r.ok + r.retard), { taille: 7.5, gras: true });
    });
  }

  // Actions faites / à faire par semaine
  const yS = yG + hG + 12, hS = BAS - yS - 4;
  carte(MARGE, yS, L - 2 * MARGE, hS, "Actions faites / à faire par semaine");
  {
    const leg = [["Faites", "#1f9d5f"], ["En retard", "#d64545"], ["Cette semaine", "#e07b1f"], ["Plus tard", "#3b5bdb"]];
    let xl = MARGE + 190;
    leg.forEach(([nom, c]) => {
      pdf.rect(xl, yS + 9, 7, 7, { fill: c });
      pdf.texte(xl + 10, yS + 15, nom, { taille: 7, couleur: GRIS });
      xl += 14 + pdf.largeurTexte(nom, 7, false) + 14;
    });
    const n = donnees.semaines.length;
    if (!n) pdf.texte(MARGE + 10, yS + 40, "Aucune donnée disponible.", { taille: 8, couleur: GRIS });
    else {
      const zoneX = MARGE + 14, zoneL = L - 2 * MARGE - 28;
      const base = yS + hS - 24, haut = yS + 34;
      const pas = zoneL / n, lb = Math.min(22, pas - 3);
      const maxV = Math.max(1, ...donnees.semaines.map((_, i) => donnees.semainesFaites[i] + donnees.semainesNonFaites[i]));
      pdf.ligne(zoneX, base, zoneX + zoneL, base, { couleur: "#d9dee7" });
      const chaque = Math.max(1, Math.ceil(24 / pas));
      let xAuj = null;
      donnees.semaines.forEach((s, i) => {
        const cx = zoneX + pas * i + pas / 2;
        const hF = Math.round(donnees.semainesFaites[i] / maxV * (base - haut));
        const hN = Math.round(donnees.semainesNonFaites[i] / maxV * (base - haut));
        if (hF > 0) pdf.rect(cx - lb / 2, base - hF, lb, hF, { fill: "#1f9d5f" });
        if (hN > 0) pdf.rect(cx - lb / 2, base - hF - hN, lb, hN, { fill: couleurUrgenceSemaine(s, donnees.semaineAujourdhui) });
        const total = donnees.semainesFaites[i] + donnees.semainesNonFaites[i];
        if (total > 0) pdf.texte(cx, base - hF - hN - 3, String(total), { taille: 6.5, gras: true, align: "center" });
        if (i % chaque === 0) pdf.texte(cx, base + 9, donnees.semainesLabels[i], { taille: 6, align: "center", couleur: GRIS });
        if (s === donnees.semaineAujourdhui) xAuj = cx;
      });
      if (xAuj !== null) {
        pdf.ligne(xAuj, haut - 4, xAuj, base, { couleur: "#d64545", lw: 1, tirets: true });
        pdf.texte(xAuj, haut - 13, "Aujourd'hui", { taille: 6.5, gras: true, align: "center", couleur: "#d64545" });
      }
    }
  }

  // ---------- Pages suivantes : kanban ----------
  const statuts = Object.keys(COULEURS_STATUT);
  const colonnes = statuts.map(st => ({ statut: st, lignes: [] }));
  const autres = { statut: "Autre / sans statut", lignes: [] };
  lignesEmergence.forEach(l => { (colonnes.find(c => c.statut === l.Statut) || autres).lignes.push(l); });
  if (autres.lignes.length) colonnes.push(autres);
  const rang = (l) => l.Priorite ? String(l.Priorite).trim() : "P9";
  colonnes.forEach(c => c.lignes.sort((a, b) => rang(a).localeCompare(rang(b)) || String(a.Titre || "").localeCompare(String(b.Titre || ""))));
  colonnes.forEach(c => { c.suivant = 0; });

  const nbCol = colonnes.length, ecart = 6;
  const largeurCol = (L - 2 * MARGE - (nbCol - 1) * ecart) / nbCol;
  let premierePage = true;
  while (premierePage || colonnes.some(c => c.suivant < c.lignes.length)) {
    pdf.nouvellePage();
    enTete(premierePage ? "Kanban des demandes par statut" : "Kanban des demandes par statut (suite)");
    // légende des priorités
    let xl = MARGE;
    [["P1", "kanban-p1"], ["P2", "kanban-p2"], ["P3", "kanban-p3"], ["Sans priorité", "kanban-p0"]].forEach(([nom, cl]) => {
      pdf.rect(xl, 60, 8, 8, { fill: COULEURS_PRIORITE_PDF[cl].barre });
      pdf.texte(xl + 12, 67, nom, { taille: 7.5, couleur: GRIS });
      xl += 20 + pdf.largeurTexte(nom, 7.5, false) + 10;
    });
    const yTop = 76;
    colonnes.forEach((col, ci) => {
      const x = MARGE + ci * (largeurCol + ecart);
      const c = COULEURS_STATUT[col.statut] || { fond: "#f3f4f6", texte: "#374151" };
      pdf.rect(x, yTop, largeurCol, BAS - yTop, { fill: "#f3f4f6" });
      pdf.rect(x, yTop, largeurCol, 22, { fill: c.fond });
      const titreCol = pdf.decouper(col.statut, largeurCol - 26, 7.5, true, 1)[0];
      pdf.texte(x + 5, yTop + 14, titreCol, { taille: 7.5, gras: true, couleur: c.texte });
      pdf.texte(x + largeurCol - 5, yTop + 14, String(col.lignes.length), { taille: 7.5, gras: true, couleur: c.texte, align: "right" });
      let y = yTop + 28;
      while (col.suivant < col.lignes.length) {
        const l = col.lignes[col.suivant];
        const titreL = pdf.decouper(l.Titre || "Sans titre", largeurCol - 18, 7.2, true, 4);
        const detail = pdf.decouper([l.Porteurs, l.Organisation].filter(Boolean).join(" · "), largeurCol - 18, 6.3, false, 2);
        const hC = 8 + titreL.length * 8.6 + (detail.length ? 2 + detail.length * 7.4 : 0);
        if (y + hC > BAS - 4) break;
        const coul = COULEURS_PRIORITE_PDF[classePrioriteKanban(l.Priorite)];
        pdf.rect(x + 4, y, largeurCol - 8, hC, { fill: coul.fond, stroke: "#e2e5ea", lw: 0.4 });
        pdf.rect(x + 4, y, 3, hC, { fill: coul.barre });
        titreL.forEach((t, k) => pdf.texte(x + 11, y + 9 + k * 8.6, t, { taille: 7.2, gras: true }));
        detail.forEach((t, k) => pdf.texte(x + 11, y + 9 + titreL.length * 8.6 + 2 + k * 7.4 - 1, t, { taille: 6.3, couleur: GRIS }));
        y += hC + 4;
        col.suivant++;
      }
    });
    premierePage = false;
  }

  // Pieds de page : numérotation, ajoutée une fois le nombre de pages connu.
  const total = pdf.nombrePages();
  for (let i = 0; i < total; i++) {
    pdf.surPage(i);
    pdf.ligne(MARGE, H - 22, L - MARGE, H - 22, { couleur: "#d9dee7" });
    pdf.texte(MARGE, H - 11, "Équipe Émergence", { taille: 7.5, couleur: GRIS });
    pdf.texte(L - MARGE, H - 11, "Page " + (i + 1) + " / " + total, { taille: 7.5, couleur: GRIS, align: "right" });
  }
  return { pdf, dateTexte };
}

function genererOctetsPdfActivite() {
  const { pdf, dateTexte } = construirePdfActivite();
  return pdf.finir("Émergence — Activité (" + dateTexte + ")");
}

async function exporterPdfActivite() {
  const btn = document.getElementById("btn-export-pdf-activite");
  const msg = document.getElementById("msg-export-pdf-activite");
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "Génération du PDF…";
  try {
    const octets = genererOctetsPdfActivite();
    telechargerBlob(new Blob([octets], { type: "application/pdf" }), "activite_emergence_" + new Date().toISOString().slice(0, 10) + ".pdf");
    if (msg) msg.textContent = "PDF généré.";
  } catch (e) {
    console.error("Export PDF :", e);
    if (msg) msg.textContent = "Erreur : " + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function telechargerBlob(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const btnExportPdfActivite = document.getElementById("btn-export-pdf-activite");
if (btnExportPdfActivite) btnExportPdfActivite.addEventListener("click", exporterPdfActivite);

// ===================== Export Excel (zip) de toutes les tables Emergence =====================
// Fichiers .xlsx et archive .zip générés sans bibliothèque externe (zip en mode « stocké »).
const TABLE_CRC32 = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC32[(c ^ octets[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function versUtf8(texte) {
  const sortie = [];
  for (const ch of String(texte)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) sortie.push(c);
    else if (c < 0x800) sortie.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) sortie.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else sortie.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(sortie);
}

// fichiers : [{ nom, octets }] -> Uint8Array de l'archive zip.
function creerZip(fichiers) {
  const maintenant = new Date();
  const heureDos = (maintenant.getHours() << 11) | (maintenant.getMinutes() << 5) | (maintenant.getSeconds() >> 1);
  const dateDos = ((maintenant.getFullYear() - 1980) << 9) | ((maintenant.getMonth() + 1) << 5) | maintenant.getDate();
  const morceaux = [];
  const centrale = [];
  let decalage = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  fichiers.forEach(f => {
    const nom = versUtf8(f.nom);
    const crc = crc32(f.octets);
    const taille = f.octets.length;
    const entete = Uint8Array.from([].concat(
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(heureDos), u16(dateDos),
      u32(crc), u32(taille), u32(taille), u16(nom.length), u16(0)));
    morceaux.push(entete, nom, f.octets);
    centrale.push(Uint8Array.from([].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(heureDos), u16(dateDos),
      u32(crc), u32(taille), u32(taille), u16(nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(decalage))), nom);
    decalage += entete.length + nom.length + taille;
  });
  const tailleCentrale = centrale.reduce((a, b) => a + b.length, 0);
  const fin = Uint8Array.from([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(fichiers.length), u16(fichiers.length), u32(tailleCentrale), u32(decalage), u16(0)));
  const tout = morceaux.concat(centrale, [fin]);
  const resultat = new Uint8Array(tout.reduce((a, b) => a + b.length, 0));
  let pos = 0;
  tout.forEach(m => { resultat.set(m, pos); pos += m.length; });
  return resultat;
}

function echapperXml(texte) {
  return String(texte)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function lettreColonneExcel(index) {
  let n = index + 1, s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// colonnes : [{ titre, largeur }], lignes : tableaux de cellules { v, t } avec t = "s" (texte),
// "n" (nombre), "d" (date), "dt" (date et heure), "b" (booléen) ; v = null pour une cellule vide.
function construireXlsx(nomFeuille, colonnes, lignes) {
  let xmlLignes = "";
  const cellEntete = (c, i) => '<c r="' + lettreColonneExcel(i) + '1" t="inlineStr" s="1"><is><t xml:space="preserve">' + echapperXml(c.titre) + "</t></is></c>";
  xmlLignes += '<row r="1" ht="22" customHeight="1">' + colonnes.map(cellEntete).join("") + "</row>";
  lignes.forEach((ligne, r) => {
    let xml = '<row r="' + (r + 2) + '">';
    ligne.forEach((cell, i) => {
      if (!cell || cell.v === null || cell.v === undefined || cell.v === "") return;
      const ref = lettreColonneExcel(i) + (r + 2);
      if (cell.t === "n") xml += '<c r="' + ref + '"><v>' + cell.v + "</v></c>";
      else if (cell.t === "b") xml += '<c r="' + ref + '" t="b"><v>' + (cell.v ? 1 : 0) + "</v></c>";
      else if (cell.t === "d") xml += '<c r="' + ref + '" s="2"><v>' + cell.v + "</v></c>";
      else if (cell.t === "dt") xml += '<c r="' + ref + '" s="3"><v>' + cell.v + "</v></c>";
      else xml += '<c r="' + ref + '" t="inlineStr" s="4"><is><t xml:space="preserve">' + echapperXml(String(cell.v).slice(0, 32000)) + "</t></is></c>";
    });
    xmlLignes += xml + "</row>";
  });
  const derniereCol = lettreColonneExcel(Math.max(0, colonnes.length - 1));
  const feuille = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    "<cols>" + colonnes.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.largeur || 18) + '" customWidth="1"/>').join("") + "</cols>" +
    "<sheetData>" + xmlLignes + "</sheetData>" +
    '<autoFilter ref="A1:' + derniereCol + (lignes.length + 1) + '"/>' +
    "</worksheet>";
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
    '<fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1A3A6B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" horizontal="left"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const nomSafe = echapperXml(String(nomFeuille).replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 31));
  const fichiers = [
    { nom: "[Content_Types].xml", octets: versUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
    { nom: "_rels/.rels", octets: versUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { nom: "xl/workbook.xml", octets: versUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + nomSafe + '" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { nom: "xl/_rels/workbook.xml.rels", octets: versUtf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { nom: "xl/styles.xml", octets: versUtf8(styles) },
    { nom: "xl/worksheets/sheet1.xml", octets: versUtf8(feuille) }
  ];
  return creerZip(fichiers);
}

// Valeur brute Grist (fetchTable) -> texte lisible.
function texteValeurGrist(v, resoudreRef) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) {
    const code = v[0];
    if (code === "L") return v.slice(1).map(x => texteValeurGrist(x, resoudreRef)).join(", ");
    if (code === "E") return "#ERREUR";
    if (code === "U" || code === "P") return String(v[1] == null ? "" : v[1]);
    return v.map(x => texteValeurGrist(x, resoudreRef)).join(", ");
  }
  if (typeof v === "object") { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}

const COLONNES_EXCLUES_EXPORT = new Set(["manualSort", "html_fiche"]);
const LIBELLES_REFERENCES = ["Complet", "Nom_et_Prenom", "Titre", "Objet_de_la_demande"];

async function construireExportExcelZip(progression) {
  const tablesMeta = await grist.docApi.fetchTable("_grist_Tables");
  const colonnesMeta = await grist.docApi.fetchTable("_grist_Tables_column");
  const nomParIdTable = {};
  tablesMeta.id.forEach((id, i) => { nomParIdTable[id] = tablesMeta.tableId[i]; });
  const noms = tablesMeta.tableId.filter(n => /^Emergence/.test(n)).sort();
  if (!noms.length) throw new Error("aucune table Emergence trouvée");

  const donnees = {};
  const colonnes = {};
  for (const nom of noms) {
    if (progression) progression("Lecture de " + nom + "…");
    donnees[nom] = await grist.docApi.fetchTable(nom);
    colonnes[nom] = [];
    colonnesMeta.id.forEach((id, i) => {
      if (nomParIdTable[colonnesMeta.parentId[i]] !== nom) return;
      const colId = colonnesMeta.colId[i];
      if (COLONNES_EXCLUES_EXPORT.has(colId) || /^gristHelper_/.test(colId)) return;
      if (!(colId in donnees[nom])) return;
      colonnes[nom].push({ colId, label: colonnesMeta.label[i] || colId, type: String(colonnesMeta.type[i] || "Any") });
    });
  }

  // Libellé lisible d'une ligne d'une table cible (pour les colonnes Référence).
  const libelleLigne = (table, id) => {
    const d = donnees[table];
    if (!d) return String(id);
    const idx = d.id.indexOf(id);
    if (idx === -1) return id ? String(id) : "";
    for (const cle of LIBELLES_REFERENCES) {
      if (cle in d && d[cle][idx]) return String(d[cle][idx]);
    }
    return String(id);
  };
  const aujourdhui = new Date();
  const fichiers = [];
  for (const nom of noms) {
    if (progression) progression("Création de " + nom + ".xlsx…");
    const d = donnees[nom];
    const cols = colonnes[nom];
    const entetes = cols.map(c => ({ titre: c.label, largeur: /^(Text|Any)/.test(c.type) ? 36 : /^(Date|DateTime)/.test(c.type) ? 18 : /^Ref/.test(c.type) ? 28 : 20 }));
    const lignes = d.id.map((idLigne, r) => cols.map(c => {
      const v = d[c.colId][r];
      if (v === null || v === undefined || v === "") return null;
      const type = c.type;
      if (/^Date:/.test(type) || type === "Date") {
        return typeof v === "number" ? { t: "d", v: v / 86400 + 25569 } : { t: "s", v: texteValeurGrist(v) };
      }
      if (/^DateTime/.test(type)) {
        return typeof v === "number" ? { t: "dt", v: (v * 1000 - new Date(v * 1000).getTimezoneOffset() * 60000) / 86400000 + 25569 } : { t: "s", v: texteValeurGrist(v) };
      }
      if (type === "Int" || type === "Numeric" || type === "Id") return typeof v === "number" ? { t: "n", v } : { t: "s", v: texteValeurGrist(v) };
      if (type === "Bool") return typeof v === "boolean" ? { t: "b", v } : { t: "s", v: texteValeurGrist(v) };
      const refm = /^Ref(List)?:(\w+)/.exec(type);
      if (refm) {
        const ids = Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v];
        return { t: "s", v: ids.filter(x => x).map(x => libelleLigne(refm[2], x)).join(" ; ") };
      }
      if (type === "Attachments") {
        const ids = Array.isArray(v) ? (v[0] === "L" ? v.slice(1) : v) : [v];
        return { t: "s", v: ids.map(x => "Fichier " + x).join(", ") };
      }
      return { t: "s", v: texteValeurGrist(v) };
    }));
    fichiers.push({ nom: nom + ".xlsx", octets: construireXlsx(nom, entetes, lignes) });
  }
  return creerZip(fichiers);
}

async function exporterExcelZip() {
  const btn = document.getElementById("btn-export-excel-zip");
  const msg = document.getElementById("msg-export-excel");
  if (btn) btn.disabled = true;
  const dire = (t, erreur) => { if (msg) { msg.textContent = t; msg.style.color = erreur ? "#b91c1c" : "#555"; } };
  try {
    dire("Préparation de l'export…");
    const octets = await construireExportExcelZip(dire);
    telechargerBlob(new Blob([octets], { type: "application/zip" }), "export_emergence_" + new Date().toISOString().slice(0, 10) + ".zip");
    dire("Export terminé.");
  } catch (e) {
    console.error("Export Excel :", e);
    dire("Erreur : " + e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Clic sur une tuile du kanban : ouvre la fiche de la demande dans l'onglet Demandes.
const kanbanConteneur = document.getElementById("kanban-activite");
if (kanbanConteneur) {
  kanbanConteneur.addEventListener("click", (e) => {
    const carte = e.target.closest(".kanban-carte[data-id]");
    if (!carte) return;
    const id = parseInt(carte.getAttribute("data-id"), 10);
    basculerVue("demandes");
    selectionnerLigne(id);
    const tr = document.querySelector('#corps-tableau tr[data-id="' + id + '"]');
    if (tr && typeof tr.scrollIntoView === "function") tr.scrollIntoView({ block: "nearest" });
    const fiche = document.getElementById("fiche-container");
    if (fiche && typeof fiche.scrollIntoView === "function") fiche.scrollIntoView({ block: "start" });
  });
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
