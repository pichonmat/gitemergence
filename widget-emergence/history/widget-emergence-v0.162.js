// Widget Emergence — v0.162
// Numéro de release : <majeure>.<build> (0.162 = release majeure 0, build 162).
const VERSION_WIDGET = "0.162";
// --- Configuration ---
const GRIST_BASE_URL = "https://grist.numerique.gouv.fr";
const DOC_ID = "qXWzdtyGgNh2T64Ti1SQfc";
const TABLE_PRINCIPALE = "Emergence";
const TABLE_ACTEURS = "Emergence_Acteurs";
const TABLE_TEMPLATES = "Emergence_Templates"; // modèle(s) PowerPoint en pièce jointe (colonne Fichier)
const TABLE_IMAGES = "Emergence_Images"; // images collées (base64), créée par l'outil creation-table-images
const TABLE_RIDA = "Emergence_Rida";

// Colonne "Date de modification" de la table RIDA (Date, epoch en secondes, jamais d'heure). Horodatée par le
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
const DATE_MODIF_RIDA_PAR_DEFAUT = Math.floor(Date.UTC(2026, 8, 30) / 1000); // 30/09/2026
function formaterDateModifRida(r) {
  return (r.__dateModifParDefaut || !r[COLONNE_DATE_MODIF_RIDA]) ? formaterDate(DATE_MODIF_RIDA_PAR_DEFAUT) : formaterDateHeure(r[COLONNE_DATE_MODIF_RIDA]);
}
appliquerEchelleTexte(); // applique tout de suite la taille de texte mémorisée

// Point d'entrée unique pour toute écriture vers Grist : si l'action ajoute/modifie une ligne
// RIDA, on y joint la date/heure de modification (sans effet si la colonne n'existe pas).
function horodaterActionsRida(actions) {
  const maintenant = epochDateDuJour();
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
    table: TABLE_RIDA, type: "Date", label: "Date de modification",
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
  Typologie_de_la_demande: "Typologie de la demande", Date_de_soumission: "Date d'entrée",
  Date_Go_NoGo_SDID: "Go/noGo SDID", Date_MVP_previsionnelle: "Mise à disposition du MVP (prévisionnel)", Date_MVP_realisee: "Mise à disposition du MVP (réalisé)",
  Date_de_cloture: "Date de clôture", Orientation: "Orientation", Lien_vers_fiche_DS: "Lien vers fiche DS",
  Porteurs2: "Porteurs2", Vecteur_de_remontee_terrain: "Vecteur de remontée terrain",
  Nom_Prenom_demandeurs: "Nom Prénom demandeurs", Territoire: "Territoire",
  Problematique_transverse: "Problématique transverse", ID_Note: "ID Note", Piste_de_communs: "Piste de communs",
  Perimetre_d_impact2: "Périmètre d'impact", Causes_racines_de_l_irritant: "Causes racines de l'irritant",
  Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement: "Synthèse reformulation", ID2: "ID",
  Synthese_de_la_demande: "Synthèse de la demande", Politique_Publique_concernee: "Politique publique concernée",
  Contributeurs_SDID: "Contributeurs SDID", Organisation_Id: "Organisation Id",
  Ref_BRM: "Ref BRM", RefBRM: "Ref BRM", ref_brm: "Ref BRM"
};
// Options générales (⚙ Paramètres généraux), mémorisées par navigateur. Le journal automatique des
// modifications (ligne RIDA « Champ … modifié ») est DÉSACTIVÉ par défaut (v0.99) : la date de
// dernière modification est portée par la colonne « Date de modification » de la table Emergence.
const CLE_STOCKAGE_OPTIONS = "emergence_options_generales_v1";
function chargerOptionsGenerales() {
  try { return Object.assign({ journalRida: false }, JSON.parse(window.localStorage.getItem(CLE_STOCKAGE_OPTIONS) || "{}")); }
  catch (e) { return { journalRida: false }; }
}
function sauverOptionsGenerales(opts) {
  try { window.localStorage.setItem(CLE_STOCKAGE_OPTIONS, JSON.stringify(opts)); return true; } catch (e) { return false; }
}
let journalModificationsActif = chargerOptionsGenerales().journalRida === true;

// Colonne « Date de modification » de la table Emergence (ajoutée par l'utilisateur dans Grist) :
// horodatée à chaque modification de la fiche (champs de la demande, ajout / modification /
// suppression d'une ligne RIDA de la demande). Utilisée seulement si la colonne existe.
const COLONNE_DATE_MODIF_EMERGENCE = "Date_de_modification";
let colonneDateModifEmergenceDisponible = false;
let dateModifEmergenceRefusee = false; // Grist a refusé l'écriture (ex. colonne à formule) : désactivée pour la session

function horodaterActionsEmergence(actions) {
  if (!colonneDateModifEmergenceDisponible) return actions;
  const maintenant = epochDateDuJour();
  const demandesTouchees = new Set();
  const demandesDejaHorodatees = new Set();
  actions.forEach(a => {
    if (!Array.isArray(a)) return;
    if (a[1] === TABLE_PRINCIPALE && (a[0] === "AddRecord" || a[0] === "UpdateRecord") && a[3] && typeof a[3] === "object") {
      a[3][COLONNE_DATE_MODIF_EMERGENCE] = maintenant;
      if (a[2]) demandesDejaHorodatees.add(a[2]);
    } else if (a[1] === TABLE_RIDA) {
      let id = null;
      if ((a[0] === "AddRecord") && a[3] && a[3].ID2 !== undefined) id = idDepuisRef(a[3].ID2);
      else if ((a[0] === "UpdateRecord" || a[0] === "RemoveRecord") && a[2]) {
        const r = ridaToutes.find(x => x.id === a[2]);
        id = r ? idDepuisRef(r.ID2) : (a[3] && a[3].ID2 !== undefined ? idDepuisRef(a[3].ID2) : null);
      }
      if (id) demandesTouchees.add(id);
    }
  });
  const extras = [];
  demandesTouchees.forEach(id => {
    if (!demandesDejaHorodatees.has(id) && lignesEmergence.some(l => l.id === id)) {
      extras.push(["UpdateRecord", TABLE_PRINCIPALE, id, { [COLONNE_DATE_MODIF_EMERGENCE]: maintenant }]);
    }
  });
  return actions.concat(extras);
}

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

// --- Utilisateur connecté : affichage de l'e-mail + contact créé automatiquement s'il n'existe pas ---
let emailUtilisateurConnecte = "";
let contactUtilisateurCree = false;

function afficherEmailUtilisateur(nomContact) {
  const el = document.getElementById("utilisateur-connecte");
  if (!el) return;
  if (!emailUtilisateurConnecte) { el.style.display = "none"; el.textContent = ""; return; }
  el.textContent = "👤 " + emailUtilisateurConnecte;
  el.title = "Connecté : " + emailUtilisateurConnecte +
    (nomContact ? "\nContact : " + nomContact + (contactUtilisateurCree ? " (créé automatiquement)" : "") : "");
  el.style.display = "";
}

function majusculePremiere(mot) {
  return mot ? mot.charAt(0).toLocaleUpperCase("fr") + mot.slice(1).toLocaleLowerCase("fr") : "";
}

// « dupont.jean@... » -> { nom: "DUPONT", prenom: "Jean", nomEtPrenom: "DUPONT Jean" }.
// Noms composés : « le-gall.jean-pierre » -> « LE-GALL Jean-Pierre ». Chiffres de fin d'homonyme
// retirés. Sans point avant le @ (« dupont@... »), tout est considéré comme le NOM : « DUPONT ».
// Rien avant le @ : null.
function nomPrenomDepuisEmail(email) {
  const local = String(email || "").split("@")[0];
  const parties = local.split(".").map(x => x.replace(/\d+$/, "").trim()).filter(Boolean);
  if (parties.length === 0) return null;
  const nom = parties[0].toLocaleUpperCase("fr");
  const prenom = parties.slice(1).map(p => p.split("-").map(majusculePremiere).join("-")).join(" ");
  return { nom, prenom, nomEtPrenom: prenom ? nom + " " + prenom : nom };
}

// Aucun contact ne porte cet e-mail : on complète l'homonyme sans e-mail s'il y en a un (évite un
// doublon), sinon on crée le contact. Un homonyme qui a déjà un autre e-mail n'est pas touché.
// N'est tenté que si la table des acteurs a bien été lue (sinon on risquerait un doublon).
async function creerOuCompleterContactPourEmail(email) {
  if (!acteursChargesOk) return "";
  const p = nomPrenomDepuisEmail(email);
  if (!p) return "";
  const cibles = [normaliserTexteRecherche(p.nomEtPrenom), normaliserTexteRecherche((p.prenom + " " + p.nom).trim())];
  const homonymes = Object.keys(acteursParId).filter(id => cibles.includes(normaliserTexteRecherche(nomActeurParId(id))));
  if (homonymes.length > 1) return "";
  if (homonymes.length === 1) {
    const h = acteursParId[homonymes[0]];
    if (h.mail) return "";
    await grist.docApi.applyUserActions([["UpdateRecord", TABLE_ACTEURS, parseInt(homonymes[0], 10), { mail: email }]]);
    await chargerTablesAnnexes();
    return nomActeurParEmail(email);
  }
  await grist.docApi.applyUserActions([["AddRecord", TABLE_ACTEURS, null, { Nom_et_Prenom: p.nomEtPrenom, mail: email }]]);
  contactUtilisateurCree = true;
  await chargerTablesAnnexes();
  return nomActeurParEmail(email);
}

function initialiserPorteurParDefaut() {
  if (!promessePorteurParDefaut) {
    promessePorteurParDefaut = (async () => {
      try {
        emailUtilisateurConnecte = await lireEmailUtilisateurConnecte();
        let nom = nomActeurParEmail(emailUtilisateurConnecte);
        if (!nom && emailUtilisateurConnecte) {
          try { nom = await creerOuCompleterContactPourEmail(emailUtilisateurConnecte); }
          catch (e) { console.error("Création du contact de l'utilisateur impossible :", e); nom = ""; }
        }
        porteurParDefautRida = nom;
        afficherEmailUtilisateur(nom);
      } catch (e) {
        console.error("E-mail de l'utilisateur indisponible : Porteur RIDA laissé vide.", e);
        porteurParDefautRida = "";
        emailUtilisateurConnecte = "";
        afficherEmailUtilisateur("");
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

// --- Journal des changements d'état (v0.162) ---
// Chaque changement de Statut d'une demande ajoute une ligne RIDA « Changement d'état : XXX → YYY » (type I, datée
// d'aujourd'hui, non modifiable mais supprimable depuis le widget). Toujours actif, quel que soit le réglage du
// journal des modifications. Le Reporting « Cette semaine » s'appuie sur ces lignes pour afficher les mouvements.
const REGEX_CHANGEMENT_ETAT = /^Changement d'état : (.+) → (.+)$/;
function estLigneChangementEtat(r) {
  return !!r && REGEX_CHANGEMENT_ETAT.test(String(r.Description || ""));
}
function actionsChangementEtat(actions) {
  const extras = [];
  const aujourdhui = aujourdHuiEpoch();
  const dernierStatut = new Map(); // plusieurs écritures sur la même demande dans un même lot
  actions.forEach(a => {
    if (!Array.isArray(a) || a[0] !== "UpdateRecord" || a[1] !== TABLE_PRINCIPALE || !a[3] || typeof a[3] !== "object" || !("Statut" in a[3])) return;
    const demandeId = a[2];
    const ligne = lignesEmergence.find(l => l.id === demandeId);
    if (!ligne) return;
    const avant = normaliserStatut(dernierStatut.has(demandeId) ? dernierStatut.get(demandeId) : ligne.Statut);
    const apres = normaliserStatut(a[3].Statut);
    dernierStatut.set(demandeId, a[3].Statut);
    if (!avant || !apres || avant === apres) return;
    extras.push(["AddRecord", TABLE_RIDA, null, {
      ID2: demandeId, RIDA: "I", Pour_le: aujourdhui, Fait_le: aujourdhui,
      Description: "Changement d'état : " + avant + " → " + apres
    }]);
  });
  return extras;
}

function preparerActions(actions) {
  const complet = actions.concat(actionsJournalModifications(actions), actionsChangementEtat(actions));
  return retirerTelephoneSiIndisponible(horodaterActionsRida(appliquerPorteurParDefaut(horodaterActionsEmergence(complet))));
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
    if (colonneDateModifEmergenceDisponible && /Date_de_modification/.test((err && err.message) || "") && !COLONNES_OPTIONNELLES[colonneAbsenteDansErreur(err)]) {
      // Colonne « Date de modification » de la table Emergence inutilisable (ex. colonne à formule) : on rejoue sans elle.
      colonneDateModifEmergenceDisponible = false;
      dateModifEmergenceRefusee = true;
      console.error("Colonne « Date de modification » (Emergence) refusée par Grist : horodatage désactivé pour cette session.", err);
      actions.forEach(x => { if (Array.isArray(x) && x[1] === TABLE_PRINCIPALE && x[3] && typeof x[3] === "object") delete x[3][COLONNE_DATE_MODIF_EMERGENCE]; });
      return grist.docApi.applyUserActions(preparerActions(actions));
    }
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

// Statuts des demandes, dans l'ordre du flux (v85). `actif` : coché par défaut dans les filtres.
// `description` : infobulle affichée partout où le statut apparaît.
const STATUTS = [
  { nom: "Nouveau", fond: "#fff8dc", texte: "#8a6d00", actif: true,
    description: "La fiche est créée (c'est tout)." },
  { nom: "Contacter", fond: "#e0f2fe", texte: "#075985", actif: true,
    description: "On entre en contact pour avoir un minimum d'info et valider qu'il y a bien une demande." },
  { nom: "Qualifier", fond: "#fee2e2", texte: "#991b1b", actif: true,
    description: "On prend le temps de comprendre la demande et de mettre en place un plan d'action court terme." },
  { nom: "Accompagnement", fond: "#dbeafe", texte: "#1e40af", actif: true,
    description: "On met à disposition les outils sur étagère et on aide à la résolution. Quand la demande est en attente, on agit seulement si on est contacté." },
  { nom: "Support", fond: "#dcfce7", texte: "#166534", actif: true,
    description: "Pour les clients ayant souscrit une offre MIRAI ou RPA." },
  { nom: "En cours de transfert", fond: "#f3e8ff", texte: "#6b21a8", actif: false,
    description: "On accompagne le transfert de la demande vers un autre service du MI." },
  { nom: "Clôturer", fond: "#e5e7eb", texte: "#374151", actif: false,
    description: "La demande est clôturée." }
];
const COULEURS_STATUT = {};
STATUTS.forEach(st => { COULEURS_STATUT[st.nom] = { fond: st.fond, texte: st.texte }; });
const DESCRIPTIONS_STATUT = {};
STATUTS.forEach(st => { DESCRIPTIONS_STATUT[st.nom] = st.description; });
const STATUT_NOUVEAU = "Nouveau";
// Statuts "actifs" : seuls cochés par défaut dans les filtres Statut, et après « Réinitialiser ».
const STATUTS_ACTIFS_PAR_DEFAUT = STATUTS.filter(st => st.actif).map(st => st.nom);
const STATUT_EN_COURS = "Accompagnement";

// Anciens libellés (avant la migration de v85) : lus comme les nouveaux, pour que le widget
// fonctionne avant, pendant et après la migration de la table.
const ANCIENS_LIBELLES_STATUT = {
  "0-Nouveau": "Nouveau", "1 - Collecter": "Contacter", "2 - Qualifier": "Qualifier",
  "3 - Approfondir": "Qualifier", "4 - En cours": "Accompagnement",
  "5 - Transférer": "En cours de transfert", "6 - En attente": "Accompagnement", "7 - Clôturer": "Clôturer",
  "1- En cours": "Accompagnement", "2- En attente": "Accompagnement", "3- Clôturé": "Clôturer",
  "4- Transféré": "En cours de transfert", "5- A qualifier": "Qualifier", "9 - A qualifier": "Qualifier",
  // v0.162 : statuts supprimés (relus comme les nouveaux jusqu'à la migration des données)
  "Roadmap produit": "Nouveau", "Initialisation projet": "Nouveau", "Recherche cause racine": "Qualifier"
};
function normaliserStatut(statut) {
  return Object.prototype.hasOwnProperty.call(ANCIENS_LIBELLES_STATUT, statut) ? ANCIENS_LIBELLES_STATUT[statut] : statut;
}
function rangStatut(statut) {
  const i = STATUTS.findIndex(st => st.nom === normaliserStatut(statut));
  return i === -1 ? STATUTS.length : i;
}
function descriptionStatut(statut) {
  return DESCRIPTIONS_STATUT[normaliserStatut(statut)] || "";
}

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

// --- Typologie de la demande : valeur unique (Choice) ou multiple (ChoiceList), liste de choix lue dans Grist ---
const COLONNE_TYPOLOGIE = "Typologie_de_la_demande";
const MAX_CAR_PUCE_TYPOLOGIE = 20;  // longueur max d'une puce dans le bandeau (texte complet au survol)
const MAX_PUCES_TYPOLOGIE = 3;      // au-delà : puce « +N »
let typologieMeta = null;           // { type, choices, options } lus dans _grist_Tables_column ; null si illisible

function typologiesDeValeur(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.filter((x, i) => !(i === 0 && x === "L") && x !== null && x !== "" && typeof x !== "object").map(String);
  return [String(v)];
}
function typologiesDeLigne(ligne) { return typologiesDeValeur(ligne && ligne[COLONNE_TYPOLOGIE]); }
function typologieMultiple() {
  if (typologieMeta) return typologieMeta.type === "ChoiceList";
  return lignesEmergence.some(l => Array.isArray(l[COLONNE_TYPOLOGIE]));
}
function choixTypologieActuels() {
  return typologieMeta && typologieMeta.choices && typologieMeta.choices.length ? typologieMeta.choices.slice() : CHOIX_TYPOLOGIE.slice();
}
function valeurTypologiePourEcriture(liste) {
  if (!liste.length) return null;
  return typologieMultiple() ? ["L"].concat(liste) : liste[0];
}
function tronquerTexte(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

async function chargerMetaTypologie() {
  try {
    const tables = await grist.docApi.fetchTable("_grist_Tables");
    const iT = (tables.tableId || []).indexOf(TABLE_PRINCIPALE);
    if (iT < 0) throw new Error("table " + TABLE_PRINCIPALE + " introuvable");
    const tableRef = tables.id[iT];
    const cols = await grist.docApi.fetchTable("_grist_Tables_column");
    let idx = -1;
    (cols.id || []).forEach((id, i) => { if (cols.parentId[i] === tableRef && cols.colId[i] === COLONNE_TYPOLOGIE) idx = i; });
    if (idx < 0) throw new Error("colonne " + COLONNE_TYPOLOGIE + " introuvable");
    let options = {};
    try { options = JSON.parse(cols.widgetOptions[idx] || "{}") || {}; } catch (e) { options = {}; }
    typologieMeta = { type: cols.type[idx], choices: Array.isArray(options.choices) ? options.choices.map(String) : null, options };
  } catch (e) {
    typologieMeta = null;
    console.error("Lecture des choix de la typologie impossible (liste intégrée utilisée) :", e);
  }
}

let largeursColonnes = {
  "Ppt": 44,
  "Statut": 110,
  "Date_de_derniere_modification": 120,
  "Activite_rida": 90,
  "Priorite": 84,
  "Date_de_soumission": 100,
  "Date_Go_NoGo_SDID": 100,
  "Date_1er_atelier": 100,
  "Date_MVP_previsionnelle": 110,
  "Date_MVP_realisee": 110,
  "Organisation": 110,
  "Sponsor": 130,
  "Porteurs": 130,
  "Titre": 230,
  "Ref_BRM": 110,
  "Ref_Emergence": 90,
  "Typologie_de_la_demande": 150,
  "Tag": 130,
  "Parties_prenantes_concernees": 200,
  "Action_ouverte": 110
};

const ORDRE_COLONNES = [
  "Ppt", "Ref_Emergence", "Priorite", "Statut", "Date_de_derniere_modification", "Activite_rida", "Date_de_soumission", "Date_Go_NoGo_SDID", "Date_1er_atelier", "Date_MVP_previsionnelle", "Date_MVP_realisee", "Organisation", "Sponsor", "Porteurs",
  "Titre", "Ref_BRM", "Typologie_de_la_demande", "Tag", "Parties_prenantes_concernees", "Action_ouverte"
];

// Ordre d'affichage des colonnes de la liste : modifiable en faisant glisser les en-têtes, mémorisé
// dans le navigateur. ORDRE_COLONNES_DEFAUT = ordre dans lequel les cellules sont générées.
const ORDRE_COLONNES_DEFAUT = ORDRE_COLONNES.slice();
const CLE_STOCKAGE_ORDRE_COLONNES = "emergence_ordre_colonnes";
(function chargerOrdreColonnes() {
  try {
    const brut = window.localStorage.getItem(CLE_STOCKAGE_ORDRE_COLONNES);
    if (!brut) return;
    const saisi = JSON.parse(brut);
    if (!Array.isArray(saisi)) return;
    const valides = [];
    saisi.forEach(c => { if (ORDRE_COLONNES_DEFAUT.includes(c) && !valides.includes(c)) valides.push(c); });
    ORDRE_COLONNES_DEFAUT.forEach((c, i) => {
      if (valides.includes(c)) return; // colonne ajoutée depuis : placée après sa voisine de gauche par défaut
      let pos = 0;
      for (let k = i - 1; k >= 0; k--) { const idx = valides.indexOf(ORDRE_COLONNES_DEFAUT[k]); if (idx >= 0) { pos = idx + 1; break; } }
      valides.splice(pos, 0, c);
    });
    ORDRE_COLONNES.splice(0, ORDRE_COLONNES.length, ...valides);
  } catch (e) { /* ordre par défaut */ }
})();
function sauvegarderOrdreColonnes() {
  try { window.localStorage.setItem(CLE_STOCKAGE_ORDRE_COLONNES, JSON.stringify(ORDRE_COLONNES)); } catch (e) { /* non mémorisé */ }
}

// Référence BRM (colonne texte facultative de la table Emergence, libellé « Ref BRM ») : lue sous
// son identifiant Grist quel qu'il soit (Ref_BRM, RefBRM, ref_brm...) ; chaîne vide si la colonne
// n'existe pas ou n'est pas renseignée.
// Référence d'une demande (v0.162) : « EMG- » + id de ligne Grist sur 4 chiffres (ex. EMG-0123). Calculée ici à partir de
// l'id, comme la colonne formule Emergence.Ref_Emergence créée par l'outil de migration ("EMG-%04d" % $id) : le widget
// n'a donc pas besoin que cette colonne existe. La référence est réversible (EMG-0123 ↔ ligne 123).
const PREFIXE_REF_DEMANDE = "EMG-";
function refDemande(id) { return PREFIXE_REF_DEMANDE + String(id).padStart(4, "0"); }
function idDepuisRefDemande(texte) {
  const m = new RegExp("^\\s*(?:" + PREFIXE_REF_DEMANDE + ")?0*(\\d+)\\s*$", "i").exec(String(texte || ""));
  return m ? parseInt(m[1], 10) : null;
}
// Lien direct vers une fiche : base saisie dans les Paramètres (lien d'ancre Grist d'une ligne de cette vue,
// « #a1.s7.r12.c5 ») dont on remplace le numéro de ligne.
const PARAM_LIEN_BASE = "lien_base";
function lienDemande(id) {
  const base = String(lireParametreJson(PARAM_LIEN_BASE, "") || "").trim();
  const m = /^(.*?)#(a\d+\.s\d+)/.exec(base);
  return m ? m[1] + "#" + m[2] + ".r" + id : "";
}
function copierTexteSecours(texte) {
  const ta = document.createElement("textarea"); ta.value = texte; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove();
}
function refBrm(ligne) {
  if (!ligne) return "";
  const cle = Object.keys(ligne).find(k => k.replace(/_/g, "").toLowerCase() === "refbrm");
  const v = cle ? ligne[cle] : null;
  return v == null ? "" : String(v).trim();
}

// Identifiant Grist réel de la colonne « Ref BRM » dans la table Emergence (null si la colonne n'existe pas).
function cleRefBrm(ligne) {
  if (!ligne) return null;
  return Object.keys(ligne).find(k => k.replace(/_/g, "").toLowerCase() === "refbrm") || null;
}

const LIBELLES_COLONNES = {
  "Ppt": "Icône PowerPoint",
  "Priorite": "Priorité",
  "Statut": "Statut",
  "Date_de_derniere_modification": "Dernière modification",
  "Activite_rida": "Activité RIDA",
  "Date_de_soumission": "Date d'entrée",
  "Date_Go_NoGo_SDID": "Go/noGo SDID",
  "Date_1er_atelier": "1er atelier",
  "Date_MVP_previsionnelle": "MVP prévisionnel",
  "Date_MVP_realisee": "MVP réalisé",
  "Organisation": "Organisation",
  "Sponsor": "Sponsor",
  "Porteurs": "Porteur",
  "Titre": "Titre",
  "Ref_BRM": "Ref BRM",
  "Ref_Emergence": "Réf.",
  "Typologie_de_la_demande": "Typologie de la demande",
  "Tag": "Tag",
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
  "titre": 220, "objet": 260, "sponsor": 130, "organisation": 110, "statut": 110, "RIDA": 70, "Porteur": 130,
  "Pour_le": 100, "Fait_le": 100, "Date_de_modification": 130, "Description": 260
};

const ORDRE_COLONNES_ACTIONS = ["titre", "objet", "sponsor", "organisation", "statut", "RIDA", "Porteur", "Pour_le", "Fait_le", "Date_de_modification", "Description"];

const LIBELLES_COLONNES_ACTIONS = {
  "titre": "Titre", "objet": "Demande", "sponsor": "Sponsor", "organisation": "Organisation", "statut": "Statut", "RIDA": "Type",
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

// Colonnes masquées tant que l'utilisateur n'a pas choisi de les afficher (v84 : « Demande » = objet de la demande).
const COLONNES_MASQUEES_PAR_DEFAUT_ACTIONS = ["objet"];
const CLE_STOCKAGE_COLONNES_ACTIONS_CONNUES = "emergence_actions_colonnes_connues";
function colonnesMasqueesActionsAuDemarrage() {
  const masquees = chargerColonnesMasqueesActionsDepuisStockage();
  let connues = [];
  try { connues = JSON.parse(window.localStorage.getItem(CLE_STOCKAGE_COLONNES_ACTIONS_CONNUES) || "[]"); } catch (e) { connues = []; }
  if (!Array.isArray(connues)) connues = [];
  // Une colonne que le navigateur ne connaissait pas encore prend son état par défaut.
  COLONNES_MASQUEES_PAR_DEFAUT_ACTIONS.forEach(c => { if (!connues.includes(c) && !masquees.includes(c)) masquees.push(c); });
  try {
    window.localStorage.setItem(CLE_STOCKAGE_COLONNES_ACTIONS_CONNUES, JSON.stringify(ORDRE_COLONNES_ACTIONS));
    window.localStorage.setItem(CLE_STOCKAGE_COLONNES_MASQUEES_ACTIONS, JSON.stringify(masquees));
  } catch (e) { /* stockage indisponible */ }
  return masquees;
}
const colonnesMasqueesActionsInitiales = colonnesMasqueesActionsAuDemarrage();
let colonnesVisiblesActions = new Set(ORDRE_COLONNES_ACTIONS.filter(c => !colonnesMasqueesActionsInitiales.includes(c)));

// Mode de la modale "créer/modifier un acteur" : null = création, sinon id de l'acteur modifié.
let acteurEnEditionId = null;

let lignesEmergence = [];
let acteursParId = {};
let acteursChargesOk = false; // true une fois la table des acteurs lue avec succès
let acteursTriesParNom = [];   // [{id, label}] tous les acteurs, triés alphabétiquement
let sponsorsCandidats = [];    // [{id, label}] acteurs SDID uniquement, pour le select Sponsor
let ridaToutes = [];
let colonneTri = "Date_de_soumission";
let sensTri = "desc";
let ligneSelectionneeId = null;
let triRidaColonne = null;
let triRidaSens = "asc";
let masquerZoneListe = function () {}; // réassignée par initRedimensionnementListe
let dernierClicId = null;
let dernierClicTemps = 0;
const DELAI_DOUBLE_CLIC_MS = 400;
let timerEditionListe = null; // édition en place différée : annulée si un double clic suit
let filtrePrioriteSelection = new Set();      // vide = toutes les priorités (valeur "" = sans priorité)
let filtreTypologieSelection = new Set();    // vide = toutes les typologies
let filtreTagSelection = new Set();          // vide = tous les tags (v0.162)
let filtreOrganisationSelection = new Set(); // vide = toutes les organisations
let filtreSponsorTexte = "";          // recherche libre dans le Sponsor
let filtrePorteurTexte = "";          // recherche libre dans le(s) Porteur(s)
let filtrePartiePrenanteTexte = "";   // recherche libre dans les Parties prenantes
let filtreTitreTexte = "";
let filtreModifDu = null;                     // « Dernière modification » : borne basse (ms, minuit local) ou null
let filtreModifAu = null;                     // borne haute incluse (ms, minuit local du dernier jour) ou null
let filtreRefBrmRenseigne = false;            // true = masque les demandes sans Ref BRM
// Filtre Statut à sélection multiple : initialisé sur les statuts 0 à 4
let filtreStatutSelection = new Set(STATUTS_ACTIFS_PAR_DEFAUT);
let ongletActif = "rida";

grist.ready({ requiredAccess: 'full' });

// onRecords sert uniquement de signal "les données ont changé" : on recharge ensuite
// la table principale en données brutes via fetchTable (voir chargerTablePrincipale).
let premierIdVueGrist = null, premierSignalCurseurTraite = false, idCurseurEnAttente = null, premierCurseurTranche = false;
grist.onRecords(async function (records) {
  if (premierIdVueGrist === null && records && records.length) premierIdVueGrist = records[0].id; // curseur par défaut (lien direct, plus bas)
  await chargerTablePrincipale();
  remplirOptionsFiltres();
  afficherListe();
  if (ligneSelectionneeId) {
    const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);
    if (ligne) afficherFiche(ligne);
  }
  if (idCurseurEnAttente !== null) { // signal de curseur reçu avant les données
    const id = idCurseurEnAttente; idCurseurEnAttente = null;
    if (!(premierIdVueGrist !== null && id === premierIdVueGrist && !premierCurseurTranche)) ouvrirDepuisCurseurGrist(id);
    premierCurseurTranche = true;
  }
});

// Lien direct (v0.162) : un lien Grist « …#a1.sX.r123 » place le curseur sur la ligne 123 ; on ouvre alors sa fiche.
// Au tout premier signal, le curseur par défaut (première ligne de la vue) n'est pas considéré comme un lien.
function ouvrirDepuisCurseurGrist(id) {
  if (!id || id === ligneSelectionneeId) return;
  if (!lignesEmergence.some(l => l.id === id)) { idCurseurEnAttente = id; return; }
  idCurseurEnAttente = null;
  if (vueActuelle !== "demandes") basculerVue("demandes");
  selectionnerLigne(id);
}
grist.onRecord(record => {
  const id = record && record.id;
  if (!premierSignalCurseurTraite) {
    premierSignalCurseurTraite = true;
    if (id && premierIdVueGrist !== null && id === premierIdVueGrist) { premierCurseurTranche = true; return; } // curseur par défaut
    if (id && (premierIdVueGrist === null || !lignesEmergence.length)) { idCurseurEnAttente = id; return; } // données pas encore là : tranché au chargement
  }
  ouvrirDepuisCurseurGrist(id);
});

// --- Chargement des données (brutes, via fetchTable) ---
async function chargerTablePrincipale() {
  try {
    const table = await grist.docApi.fetchTable(TABLE_PRINCIPALE);
    lignesEmergence = tableVersLignes(table);
    lignesEmergence.forEach(l => { l.Statut = normaliserStatut(l.Statut); });
    if (!dateModifEmergenceRefusee) colonneDateModifEmergenceDisponible = COLONNE_DATE_MODIF_EMERGENCE in table;
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
        Notes: acteurs.Notes ? acteurs.Notes[i] : "",
        mail: acteurs.mail ? acteurs.mail[i] : "",
        Telephone: acteurs.Telephone ? acteurs.Telephone[i] : ""
      };
    }
    acteursChargesOk = true;
    acteursTriesParNom = Object.keys(acteursParId)
      .map(id => ({ id: parseInt(id, 10), label: ligneActeur(parseInt(id, 10)) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    // Candidats Sponsor / Porteurs : liste complète des acteurs (le filtre "SDID" précédent
    // était trop restrictif et empêchait de choisir la plupart des personnes).
    sponsorsCandidats = acteursTriesParNom.slice();
  } catch (e) { console.error("Erreur chargement acteurs :", e); }

  await chargerMetaTypologie();
  await chargerParametres();

  try {
    let rida = await grist.docApi.fetchTable(TABLE_RIDA);
    if (!(COLONNE_DATE_MODIF_RIDA in rida) && await creerColonneDateModifRida()) {
      rida = await grist.docApi.fetchTable(TABLE_RIDA);
    }
    if (!dateModifRidaRefusee) colonneDateModifRidaDisponible = COLONNE_DATE_MODIF_RIDA in rida;
    ridaToutes = tableVersLignes(rida);
  } catch (e) { console.error("Erreur chargement RIDA :", e); }
}

// Crée la colonne "Date de modification" (Date) dans la table RIDA si elle n'existe pas.
async function creerColonneDateModifRida() {
  // Colonne simple (Date), horodatée par le widget à chaque écriture RIDA. Pas de formule
  // déclencheur : plus fragile côté Grist (voir appliquerActions).
  const infos = { type: "Date", label: "Date de modification", isFormula: false };
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

  // Images : ![texte](attachment:ID) = pièce jointe du document Grist (résolue après affichage, voir
  // resoudreImagesAttachments) ; ![texte](data:image/...;base64,...) = image intégrée au texte.
  txt = txt.replace(/!\[([^\]]*)\]\((?:attachment:(\d+)|image:(\d+)|(data:image\/[a-z+.-]+;base64,[A-Za-z0-9+\/=]+))\)/g, (m, alt, att, imgId, data) => {
    const a = alt.replace(/'/g, "&#39;");
    if (att) return "<img class='img-md' data-att='" + att + "' alt='" + a + "' title='Cliquer pour agrandir'>";
    if (imgId) return "<img class='img-md' data-img='" + imgId + "' alt='" + a + "' title='Cliquer pour agrandir'>"; // table Emergence_Images
    return "<img class='img-md' src='" + data + "' alt='" + a + "' title='Cliquer pour agrandir'>";
  });
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
    if (e.target.closest("img.img-md")) { agrandirImageMarkdown(e.target.closest("img.img-md")); return; } // clic sur une image : agrandir
    passerEnEdition();
  });
  brancherCollageImage(textarea, ligneId, msgEl);

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
// Les dates de modification sont des dates (jamais d'heure) : on n'affiche que le jour.
function formaterDateHeure(valeur) {
  if (!valeur || typeof valeur !== "number") return "";
  return formaterDate(valeur);
}
// Date du jour au format des colonnes Date de Grist (epoch en secondes, minuit UTC du jour local).
function epochDateDuJour() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000);
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
  const desc = descriptionStatut(statut);
  return "<span class='badge-statut' style='background:" + c.fond + "; color:" + c.texte + ";'" +
    (desc ? " title=\"" + escapeHtml(desc) + "\"" : "") + ">" + (statut || "—") + "</span>";
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
    return /date|_le$/i.test(cle) ? formaterDate(valeur) : String(valeur);
  }
  if (Array.isArray(valeur)) return valeur.filter(v => v !== "L" && v !== null && typeof v !== "object").join(" ");
  if (typeof valeur === "object") return "";
  return String(valeur);
}

function cleIgnoreeRecherche(cle) {
  return cle === "id" || cle === "manualSort" || cle.startsWith("gristHelper_") || cle.startsWith("__");
}

function texteRechercheLigne(ligne, ridaDeLaLigne) {
  const morceaux = [normaliserTexteRecherche(refDemande(ligne.id))];
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
    if (filtreTypologieSelection.size > 0 && !typologiesDeLigne(l).some(t => filtreTypologieSelection.has(t))) return false;
    if (filtreTagSelection.size > 0 && !tagsDeLigne(l).some(t => filtreTagSelection.has(t))) return false;
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
    if (filtreRefBrmRenseigne && !String(refBrm(l) || "").trim()) return false;
    if (filtreModifDu !== null || filtreModifAu !== null) {
      const t = epochDerniereModifDemande(l.id);
      if (t === null) return false;
      if (filtreModifDu !== null && t * 1000 < filtreModifDu) return false;
      if (filtreModifAu !== null && t * 1000 >= filtreModifAu + 86400000) return false;
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
    "<div class='bloc-export-excel'><button type='button' id='btn-reinit-ordre-colonnes' title='Remet les colonnes dans leur ordre d&#39;origine (elles se déplacent en glissant leur en-tête)'>↺ Réinitialiser l'ordre des colonnes</button></div>" +
    "<div class='bloc-export-excel'><button type='button' id='btn-export-excel-zip' title='Un fichier Excel par table Emergence, dans une archive .zip'>📦 Exporter toutes les tables (Excel, .zip)</button>" +
    "<div id='msg-export-excel' class='msg-export-excel'></div></div>" +
    "<div class='bloc-export-excel'><button type='button' id='btn-export-md-base' title='Toute la base (demandes, RIDA, messages, acteurs) dans un fichier Markdown prêt pour un LLM externe'>📄 Exporter toute la base (Markdown, pour LLM)</button>" +
    "<div id='msg-export-md' class='msg-export-excel'></div></div>";

  brancherBoutonsTailleTexte(popup);
  const btnOrdre = popup.querySelector("#btn-reinit-ordre-colonnes");
  if (btnOrdre) btnOrdre.addEventListener("click", (e) => { e.stopPropagation(); reinitialiserOrdreColonnes(); });
  const btnMd = popup.querySelector("#btn-export-md-base");
  if (btnMd) btnMd.addEventListener("click", async (e) => { e.stopPropagation(); btnMd.disabled = true; try { await telechargerBaseMarkdown("msg-export-md"); } finally { btnMd.disabled = false; } });
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
      const nomCol = td.getAttribute("data-col") || ORDRE_COLONNES[index];
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
  if (champ === "tag") return filtreTagSelection.size > 0;
  if (champ === "organisation") return filtreOrganisationSelection.size > 0;
  if (champ === "sponsor") return !!filtreSponsorTexte;
  if (champ === "porteur") return !!filtrePorteurTexte;
  if (champ === "partie-prenante") return !!filtrePartiePrenanteTexte;
  if (champ === "titre") return !!filtreTitreTexte;
  if (champ === "ref-brm") return filtreRefBrmRenseigne;
  if (champ === "derniere-modif") return filtreModifDu !== null || filtreModifAu !== null;
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
  else if (champ === "tag") filtreTagSelection.clear();
  else if (champ === "organisation") filtreOrganisationSelection.clear();
  else if (champ === "sponsor") filtreSponsorTexte = "";
  else if (champ === "porteur") filtrePorteurTexte = "";
  else if (champ === "partie-prenante") filtrePartiePrenanteTexte = "";
  else if (champ === "titre") filtreTitreTexte = "";
  else if (champ === "ref-brm") filtreRefBrmRenseigne = false;
  else if (champ === "derniere-modif") { filtreModifDu = null; filtreModifAu = null; }
}

// « YYYY-MM-DD » (champ date) -> ms au minuit LOCAL de ce jour ; null si vide / invalide.
function minuitLocalDepuisInput(valeur) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valeur || ""));
  return m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)).getTime() : null;
}
function inputDepuisMs(ms) {
  if (ms === null) return "";
  const d = new Date(ms);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
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
    popup.querySelectorAll("input[type='text'], input[type='date']").forEach(inp => { inp.value = ""; });
    popup.querySelectorAll("select").forEach(sel => { sel.value = "tout"; });
    effacer(); // après le nettoyage générique (le type RIDA recoche I/D/A)
    rafraichir();
    btn.style.display = "none";
  });
  popup.insertBefore(btn, popup.firstChild);
  return btn;
}

// Valeurs proposées sous le champ de saisie des filtres Sponsor / Porteur / Parties prenantes.
function valeursPossiblesFiltreListe(champ) {
  const noms = new Set();
  lignesEmergence.forEach(l => {
    if (champ === "porteur") { const v = String(l.Porteurs || "").trim(); if (v) noms.add(v); }
    else if (champ === "sponsor") { const v = nomActeur(l.Sponsor); if (v) noms.add(v); }
    else nettoyerIdsActeurs(refListVersIds(l.Parties_prenantes_concernees).map(Number)).forEach(id => { const v = nomActeurParId(id); if (v) noms.add(v); });
  });
  return [...noms].sort((a, b) => a.localeCompare(b));
}

function construireContenuPopupFiltreListeColonne(champ) {
  if (champ === "titre") {
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"titre\" value=\"" +
      escapeHtml(filtreTitreTexte) + "\" placeholder='Filtrer par titre...'>";
  }
  if (champ === "derniere-modif") {
    return "<div class='filtre-modif-presets'>" +
      "<button type='button' class='btn-preset-modif' data-jours='1'>Aujourd'hui</button>" +
      "<button type='button' class='btn-preset-modif' data-jours='7'>7 derniers jours</button>" +
      "<button type='button' class='btn-preset-modif' data-jours='30'>30 derniers jours</button></div>" +
      "<label>Du <input type='date' class='champ-filtre-modif-date' data-bord='du' value=\"" + inputDepuisMs(filtreModifDu) + "\"></label>" +
      "<label>Au <input type='date' class='champ-filtre-modif-date' data-bord='au' value=\"" + inputDepuisMs(filtreModifAu) + "\"></label>";
  }
  if (champ === "ref-brm") {
    return "<label><input type='checkbox' class='case-filtre-liste-refbrm'" + (filtreRefBrmRenseigne ? " checked" : "") +
      ">Masquer les demandes sans Ref BRM</label>";
  }
  if (champ === "sponsor" || champ === "porteur" || champ === "partie-prenante") {
    const valeur = champ === "sponsor" ? filtreSponsorTexte : champ === "porteur" ? filtrePorteurTexte : filtrePartiePrenanteTexte;
    const invite = champ === "sponsor" ? "Filtrer par sponsor..." : champ === "porteur" ? "Filtrer par porteur..." : "Filtrer par partie prenante...";
    return "<input type='text' class='champ-filtre-liste-texte' data-champ=\"" + champ + "\" autocomplete='off' value=\"" +
      escapeHtml(valeur) + "\" placeholder='" + invite + "'>" +
      "<div class='liste-valeurs-filtre' data-champ=\"" + champ + "\"></div>";
  }
  if (champ === "statut") {
    return Object.keys(COULEURS_STATUT).map(s =>
      "<label title=\"" + escapeHtml(descriptionStatut(s)) + "\"><input type='checkbox' class='case-filtre-liste-statut' value=\"" + escapeHtml(s) + "\"" +
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
    const valeurs = [...new Set(lignesEmergence.flatMap(l => typologiesDeLigne(l)))].sort((a, b) => a.localeCompare(b));
    if (valeurs.length === 0) return "<span style='font-size:12px;color:#888;'>Aucune typologie</span>";
    return valeurs.map(v =>
      "<label><input type='checkbox' class='case-filtre-liste-typologie' value=\"" + escapeHtml(v) + "\"" +
      (filtreTypologieSelection.has(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>"
    ).join("");
  }
  if (champ === "tag") {
    const valeurs = [...new Set([...listeTagsDefinis(), ...lignesEmergence.flatMap(l => tagsDeLigne(l))])].sort((a, b) => a.localeCompare(b));
    if (valeurs.length === 0) return "<span style='font-size:12px;color:#888;'>Aucun tag</span>";
    return valeurs.map(v =>
      "<label><input type='checkbox' class='case-filtre-liste-tag' value=\"" + escapeHtml(v) + "\"" +
      (filtreTagSelection.has(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>"
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
  const zoneValeurs = popup.querySelector(".liste-valeurs-filtre");
  if (champTexte && zoneValeurs) {
    // Liste des valeurs possibles, affichée dès l'ouverture et réduite au fil de la saisie ; un clic applique la valeur.
    const toutes = valeursPossiblesFiltreListe(champ);
    const rendre = () => {
      const q = normaliserTexteRecherche(champTexte.value);
      const items = toutes.filter(v => !q || normaliserTexteRecherche(v).indexOf(q) !== -1);
      zoneValeurs.innerHTML = items.length
        ? items.map(v => "<div class='valeur-filtre-liste" + (normaliserTexteRecherche(v) === q ? " valeur-courante" : "") + "' data-v=\"" + escapeHtml(v) + "\">" + escapeHtml(v) + "</div>").join("")
        : "<div class='valeur-filtre-vide'>Aucune valeur</div>";
    };
    rendre();
    champTexte.addEventListener("input", rendre);
    zoneValeurs.addEventListener("click", (e) => {
      const el = e.target.closest(".valeur-filtre-liste");
      if (!el) return;
      champTexte.value = el.getAttribute("data-v");
      champTexte.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
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
  const majFiltreModif = () => {
    filtreModifDu = minuitLocalDepuisInput((popup.querySelector("[data-bord='du']") || {}).value);
    filtreModifAu = minuitLocalDepuisInput((popup.querySelector("[data-bord='au']") || {}).value);
    afficherListe();
    mettreAJourIconesFiltreListe();
  };
  popup.querySelectorAll(".champ-filtre-modif-date").forEach(inp => inp.addEventListener("change", majFiltreModif));
  popup.querySelectorAll(".btn-preset-modif").forEach(btn => btn.addEventListener("click", () => {
    const n = parseInt(btn.getAttribute("data-jours"), 10);
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const du = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - (n - 1)).getTime();
    popup.querySelector("[data-bord='du']").value = inputDepuisMs(du);
    popup.querySelector("[data-bord='au']").value = "";
    majFiltreModif();
    croixListe.style.display = "";
  }));
  popup.querySelectorAll(".case-filtre-liste-refbrm").forEach(cb => {
    cb.addEventListener("change", () => {
      filtreRefBrmRenseigne = cb.checked;
      afficherListe();
      mettreAJourIconesFiltreListe();
    });
  });
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
  popup.querySelectorAll(".case-filtre-liste-tag").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreTagSelection.add(cb.value);
      else filtreTagSelection.delete(cb.value);
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
  filtreTagSelection = new Set();
  filtreOrganisationSelection = new Set();
  filtreSponsorTexte = "";
  filtrePorteurTexte = "";
  filtrePartiePrenanteTexte = "";
  filtreTitreTexte = "";
  filtreRefBrmRenseigne = false;
  filtreModifDu = null;
  filtreModifAu = null;
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
  const tRida = indexDerniereModifDemande.map.has(ligneId) ? indexDerniereModifDemande.map.get(ligneId) : null;
  // Date de modification de la fiche elle-même (colonne de la table Emergence), si renseignée.
  const l = lignesEmergence.find(x => x.id === ligneId);
  const tFiche = l && typeof l[COLONNE_DATE_MODIF_EMERGENCE] === "number" && l[COLONNE_DATE_MODIF_EMERGENCE] ? l[COLONNE_DATE_MODIF_EMERGENCE] : null;
  if (tRida === null) return tFiche;
  return tFiche !== null && tFiche > tRida ? tFiche : tRida;
}

function formaterDerniereModifDemande(ligneId) {
  const t = epochDerniereModifDemande(ligneId);
  if (t === null) return "";
  return t === DATE_MODIF_RIDA_PAR_DEFAUT ? formaterDate(t) : formaterDateHeure(t);
}

function trierLignes(lignes) {
  const copie = [...lignes];
  if (colonneTri === "Activite_rida") activiteRidaCache = activiteRidaParDemande();
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
    if (colonneTri === "Activite_rida") {
      const x = activiteRidaCache.get(a.id) || { sem: 0, mois: 0, avant: 0 }, y = activiteRidaCache.get(b.id) || { sem: 0, mois: 0, avant: 0 };
      vA = x.sem * 1e6 + x.mois * 1e3 + x.avant;
      vB = y.sem * 1e6 + y.mois * 1e3 + y.avant;
    }
    if (colonneTri === "Date_1er_atelier") {
      vA = datePremierAtelier(a.id);
      vB = datePremierAtelier(b.id);
    }
    if (colonneTri === "Date_de_derniere_modification") {
      vA = epochDerniereModifDemande(a.id);
      vB = epochDerniereModifDemande(b.id);
    }
    if (colonneTri === COLONNE_TYPOLOGIE) {
      vA = typologiesDeLigne(a).join(", ");
      vB = typologiesDeLigne(b).join(", ");
    }
    if (colonneTri === COLONNE_TAG) {
      vA = tagsDeLigne(a).join(", ");
      vB = tagsDeLigne(b).join(", ");
    }
    if (colonneTri === "Statut") {
      vA = rangStatut(a.Statut);
      vB = rangStatut(b.Statut);
    }
    if (colonneTri === "Ref_Emergence") {
      vA = a.id;
      vB = b.id;
    }
    if (colonneTri === "Ref_BRM") {
      vA = refBrm(a);
      vB = refBrm(b);
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
      const nomCol = td.getAttribute("data-col") || ORDRE_COLONNES[index];
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

// Infobulle (survol) de la liste des demandes : l'objet de la demande, sinon le titre.
function infobulleObjetDemande(ligne) {
  const objet = String(ligne.Objet_de_la_demande || "").trim();
  return objet ? "Objet de la demande :\n" + objet : (ligne.Titre || "");
}

let activiteRidaCache = new Map();
function afficherListe() {
  clearTimeout(timerEditionListe);
  const corps = document.getElementById("corps-tableau");
  const lignesFiltrees = appliquerFiltres(lignesEmergence);
  activiteRidaCache = activiteRidaParDemande();
  const lignesTriees = trierLignes(lignesFiltrees);
  mettreAJourCompteurRechercheGlobale(lignesTriees.length);

  if (lignesTriees.length === 0) {
    corps.innerHTML = "<tr><td colspan='19' class='chargement'>Aucune ligne trouvée.</td></tr>";
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
      "<td class='cellule-ppt'><button type='button' class='btn-ppt-ligne' title='Générer la diapo PowerPoint de cette fiche'>PPT</button></td>" +
      "<td class='cellule-ref-emergence' title=\"" + escapeHtml(refDemande(ligne.id)) + "\">" + escapeHtml(refDemande(ligne.id)) + "</td>" +
      "<td class='cellule-priorite cellule-liste-editable' data-edit='priorite' title='Cliquer sur l\'icône pour modifier la priorité'><span class='texte-cellule-edit'>" + iconePriorite(ligne.Priorite) + "</span></td>" +
      "<td class='cellule-statut-modifiable' title='Cliquer pour changer le statut'>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td class='cellule-derniere-modif' title='Dernière modification de la demande (fiche ou lignes RIDA)'>" + (formaterDerniereModifDemande(ligne.id) || "—") + "</td>" +
      "<td class='cellule-activite'>" + activiteRidaHtml(activiteRidaCache.get(ligne.id)) + "</td>" +
      "<td class='cellule-liste-editable' data-edit='date' data-champ='Date_de_soumission' title=\"" + escapeHtml(formaterDate(ligne.Date_de_soumission) || "") + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (formaterDate(ligne.Date_de_soumission) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='date' data-champ='Date_Go_NoGo_SDID' title=\"" + escapeHtml(formaterDate(ligne.Date_Go_NoGo_SDID) || "") + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (formaterDate(ligne.Date_Go_NoGo_SDID) || "—") + "</span></td>" +
      "<td class='cellule-derniere-modif' title='Date du premier atelier (première ligne RIDA de type atelier)'>" + (formaterDate(datePremierAtelier(ligne.id)) || "—") + "</td>" +
      "<td class='cellule-liste-editable' data-edit='date' data-champ='Date_MVP_previsionnelle' title=\"" + escapeHtml(formaterDate(ligne.Date_MVP_previsionnelle) || "") + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (formaterDate(ligne.Date_MVP_previsionnelle) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='date' data-champ='Date_MVP_realisee' title=\"" + escapeHtml(formaterDate(ligne.Date_MVP_realisee) || "") + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (formaterDate(ligne.Date_MVP_realisee) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='organisation' title=\"" + escapeHtml(ligne.Organisation || "") + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + escapeHtml(ligne.Organisation || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='sponsor' title=\"" + escapeHtml(sponsorNom) + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (escapeHtml(sponsorNom) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='porteur' title=\"" + escapeHtml(porteurTexte) + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (escapeHtml(porteurTexte) || "—") + "</span></td>" +
      "<td class='cellule-titre-objet cellule-liste-editable' data-edit='titre' title=\"" + escapeHtml(infobulleObjetDemande(ligne)) + "\"><span class='texte-cellule-edit'>" + escapeHtml(ligne.Titre || "—") + "</span></td>" +
      "<td class='cellule-ref-brm-editable' title=\"" + escapeHtml(refBrm(ligne)) + (cleRefBrm(ligne) ? " (cliquer pour modifier)" : "") + "\">" + (escapeHtml(refBrm(ligne)) || "—") + "</td>" +
      "<td class='cellule-liste-editable' data-edit='typologie' title=\"" + escapeHtml(typologiesDeLigne(ligne).join(", ")) + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (escapeHtml(typologiesDeLigne(ligne).join(", ")) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='tag' title=\"" + escapeHtml(tagsDeLigne(ligne).join(", ")) + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (escapeHtml(tagsDeLigne(ligne).join(", ")) || "—") + "</span></td>" +
      "<td class='cellule-liste-editable' data-edit='pp' title=\"" + escapeHtml(partiesPrenantesTexte) + " (cliquer pour modifier)\"><span class='texte-cellule-edit'>" + (escapeHtml(partiesPrenantesTexte) || "—") + "</span></td>" +
      "<td>" + celluleRida + "</td>" +
      "</tr>";
  }
  corps.innerHTML = html;
  corps.querySelectorAll(".btn-ppt-ligne").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation(); // ne change pas la fiche sélectionnée
      ouvrirModalePpt(parseInt(b.closest("tr").getAttribute("data-id"), 10));
    });
  });
  corps.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", () => {
      const id = parseInt(tr.getAttribute("data-id"), 10);
      const maintenant = Date.now();
      const estDoubleClic = id === dernierClicId && (maintenant - dernierClicTemps) < DELAI_DOUBLE_CLIC_MS;
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
  // Clic sur la Ref BRM : champ de saisie dans la cellule (Entrée / perte de focus = enregistre, Échap = annule).
  corps.querySelectorAll("tr[data-id] td.cellule-ref-brm-editable").forEach(td => {
    td.addEventListener("click", (e) => {
      e.stopPropagation(); // ne change pas la fiche sélectionnée
      if (td.querySelector("input")) return;
      const ligneId = parseInt(td.closest("tr").getAttribute("data-id"), 10);
      const ligne = lignesEmergence.find(l => l.id === ligneId);
      const cle = cleRefBrm(ligne);
      if (!cle) return; // colonne absente de la table Emergence
      const valeurInitiale = refBrm(ligne);
      td.innerHTML = "<input type='text' class='input-ref-brm-liste' value=\"" + escapeHtml(valeurInitiale) + "\" placeholder='Ref BRM'>";
      const input = td.querySelector("input");
      input.focus();
      input.select();
      let termine = false;
      const terminer = async (enregistrer) => {
        if (termine) return;
        termine = true;
        const valeur = input.value.trim();
        if (!enregistrer || valeur === valeurInitiale) { afficherListe(); return; }
        try {
          await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [cle]: valeur }]]);
          await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
        } catch (err) {
          alert("Erreur lors de l'enregistrement de la Ref BRM : " + err.message);
          afficherListe();
        }
      };
      input.addEventListener("click", (ev) => ev.stopPropagation());
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") terminer(true);
        else if (ev.key === "Escape") terminer(false);
      });
      input.addEventListener("blur", () => terminer(true));
    });
  });
  // Clic sur le statut : liste déroulante pour le modifier directement depuis la liste.
  corps.querySelectorAll("tr[data-id] td.cellule-statut-modifiable").forEach(td => {
    td.addEventListener("click", (e) => {
      e.stopPropagation(); // ne change pas la fiche sélectionnée
      ouvrirPopupStatutListe(td, parseInt(td.closest("tr").getAttribute("data-id"), 10));
    });
  });
  activerEditionCellulesListe(corps);
  mettreAJourFleches();
  reordonnerColonnesListe();
  appliquerLargeursColonnes();
  appliquerVisibiliteColonnes();
}

// Réordonne en-têtes et cellules selon ORDRE_COLONNES (les cellules sont générées dans l'ordre par défaut ;
// on les repère par data-col pour pouvoir les replacer).
function reordonnerColonnesListe() {
  const table = document.getElementById("table-liste");
  if (!table) return;
  const rangEntete = table.querySelector("thead tr");
  if (rangEntete) {
    const parCol = {};
    [...rangEntete.children].forEach(th => { const c = th.getAttribute("data-col"); if (c) parCol[c] = th; });
    ORDRE_COLONNES.forEach(c => { if (parCol[c]) rangEntete.appendChild(parCol[c]); });
  }
  table.querySelectorAll("tbody tr[data-id]").forEach(tr => {
    const tds = [...tr.children];
    if (tds.length !== ORDRE_COLONNES_DEFAUT.length) return;
    tds.forEach((td, i) => { if (!td.hasAttribute("data-col")) td.setAttribute("data-col", ORDRE_COLONNES_DEFAUT[i]); });
    const parCol = {};
    tds.forEach(td => { parCol[td.getAttribute("data-col")] = td; });
    ORDRE_COLONNES.forEach(c => { if (parCol[c]) tr.appendChild(parCol[c]); });
  });
}

// Glisser-déposer des en-têtes pour changer l'ordre des colonnes.
(function initDeplacementColonnes() {
  const ths = document.querySelectorAll("#table-liste thead th[data-col]");
  let colDeplacee = null;
  const nettoyer = () => ths.forEach(t => t.classList.remove("th-deplace", "th-cible-gauche", "th-cible-droite"));
  ths.forEach(th => {
    th.setAttribute("draggable", "true");
    th.addEventListener("dragstart", (e) => {
      if (th.dataset.enTrainDeRedimensionner === "1" || (e.target && e.target.classList && e.target.classList.contains("poignee"))) { e.preventDefault(); return; }
      colDeplacee = th.getAttribute("data-col");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", colDeplacee); } catch (err) { /* ignoré */ }
      th.classList.add("th-deplace");
    });
    th.addEventListener("dragend", () => { colDeplacee = null; nettoyer(); });
    th.addEventListener("dragover", (e) => {
      if (!colDeplacee || colDeplacee === th.getAttribute("data-col")) return;
      e.preventDefault();
      const r = th.getBoundingClientRect(), gauche = e.clientX < r.left + r.width / 2;
      th.classList.toggle("th-cible-gauche", gauche);
      th.classList.toggle("th-cible-droite", !gauche);
    });
    th.addEventListener("dragleave", () => th.classList.remove("th-cible-gauche", "th-cible-droite"));
    th.addEventListener("drop", (e) => {
      e.preventDefault();
      const cible = th.getAttribute("data-col");
      if (!colDeplacee || colDeplacee === cible) { nettoyer(); return; }
      const r = th.getBoundingClientRect(), avant = e.clientX < r.left + r.width / 2;
      deplacerColonneListe(colDeplacee, cible, avant);
      colDeplacee = null; nettoyer();
    });
  });
})();
function deplacerColonneListe(col, cible, avant) {
  const i = ORDRE_COLONNES.indexOf(col);
  if (i < 0 || ORDRE_COLONNES.indexOf(cible) < 0) return;
  ORDRE_COLONNES.splice(i, 1);
  let j = ORDRE_COLONNES.indexOf(cible);
  if (!avant) j++;
  ORDRE_COLONNES.splice(j, 0, col);
  sauvegarderOrdreColonnes();
  reordonnerColonnesListe();
  appliquerLargeursColonnes();
  appliquerVisibiliteColonnes();
  construirePopupConfigColonnes();
}
function reinitialiserOrdreColonnes() {
  ORDRE_COLONNES.splice(0, ORDRE_COLONNES.length, ...ORDRE_COLONNES_DEFAUT);
  sauvegarderOrdreColonnes();
  reordonnerColonnesListe();
  appliquerLargeursColonnes();
  appliquerVisibiliteColonnes();
  construirePopupConfigColonnes();
}

// ---------- Édition en place des cellules de la liste des demandes ----------
// Un clic sur une cellule éditable fait apparaître le champ de saisie (liste déroulante, date,
// texte avec suggestions) ; Entrée / perte de focus / choix = enregistre, Échap = annule.
// Statut et Ref BRM ont leur propre éditeur ; « Dernière modif » et « RIDA » sont calculées
// (issues des lignes RIDA) et ne sont donc pas éditables ici.
async function enregistrerTypologie(ligneId, liste) {
  try {
    await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [COLONNE_TYPOLOGIE]: valeurTypologiePourEcriture(liste) }]]);
    await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
  } catch (err) {
    alert("Erreur lors de l'enregistrement de la typologie : " + err.message);
  }
}

function fermerPopupTypologie() {
  const p = document.getElementById("popup-typologie");
  if (p) p.remove();
}

// Popup de choix de la typologie (cases à cocher si la colonne est une Choice List, sinon choix unique).
function ouvrirPopupTypologie(ancre, ligneId) {
  fermerPopupTypologie();
  const ligne = lignesEmergence.find(l => l.id === ligneId);
  if (!ligne) return;
  const multiple = typologieMultiple();
  let selection = typologiesDeLigne(ligne);
  const choix = choixTypologieActuels();
  selection.forEach(t => { if (!choix.includes(t)) choix.push(t); });
  const popup = document.createElement("div");
  popup.id = "popup-typologie";
  popup.className = "popup-typologie";
  popup.innerHTML = choix.map(v =>
    "<label><input type='" + (multiple ? "checkbox" : "radio") + "' name='typologie-popup' value=\"" + escapeHtml(v) + "\"" +
    (selection.includes(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>").join("") +
    (multiple ? "" : "<label><input type='radio' name='typologie-popup' value=''>—</label>" +
      "<div class='popup-typologie-note'>Colonne à valeur unique : passez-la en « Choice List » dans Grist pour cumuler plusieurs typologies.</div>");
  document.body.appendChild(popup);
  const r = ancre.getBoundingClientRect();
  const largeur = popup.offsetWidth, hauteur = popup.offsetHeight;
  popup.style.left = Math.max(4, Math.min(r.left, window.innerWidth - largeur - 8)) + "px";
  const dessous = r.bottom + 4;
  popup.style.top = (dessous + hauteur > window.innerHeight - 8 ? Math.max(4, r.top - hauteur - 4) : dessous) + "px";
  popup.addEventListener("change", async () => {
    const cochees = [...popup.querySelectorAll("input:checked")].map(i => i.value).filter(Boolean);
    selection = cochees;
    if (!multiple) fermerPopupTypologie();
    await enregistrerTypologie(ligneId, selection);
  });
  const fermer = (e) => {
    if (e.type === "keydown" ? e.key === "Escape" : !popup.contains(e.target) && e.target !== ancre) {
      fermerPopupTypologie();
      document.removeEventListener("mousedown", fermer, true);
      document.removeEventListener("keydown", fermer, true);
    }
  };
  setTimeout(() => { document.addEventListener("mousedown", fermer, true); document.addEventListener("keydown", fermer, true); }, 0);
}

async function enregistrerChampListe(ligneId, champ, valeur) {
  try {
    await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [champ]: valeur }]]);
    await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
  } catch (err) {
    alert("Erreur lors de l'enregistrement : " + err.message);
    afficherListe();
  }
}

function assurerDatalistActeursListe() {
  let dl = document.getElementById("datalist-liste-acteurs");
  if (!dl) { dl = document.createElement("datalist"); dl.id = "datalist-liste-acteurs"; document.body.appendChild(dl); }
  dl.innerHTML = acteursTriesParNom.map(a => "<option value=\"" + escapeHtml(a.label) + "\"></option>").join("");
}

function activerEditionCellulesListe(corps) {
  corps.querySelectorAll("tr[data-id] td[data-edit]").forEach(td => {
    const demarrerEdition = () => {
      if (!td.isConnected || td.querySelector("input, select")) return;
      const type = td.getAttribute("data-edit");
      const ligneId = parseInt(td.closest("tr").getAttribute("data-id"), 10);
      const ligne = lignesEmergence.find(l => l.id === ligneId);
      if (!ligne) return;
      if (type === "pp") { ouvrirPopupPartiesPrenantesListe(td, ligneId); return; }
      if (type === "typologie") { ouvrirPopupTypologie(td, ligneId); return; }
      if (type === "tag") { ouvrirPopupTags(td, ligneId); return; }
      let champ, valeurInitiale, element;
      let termine = false;
      const finir = (valeurEnregistree, aChange) => {
        if (termine) return;
        termine = true;
        if (!aChange) { afficherListe(); return; }
        enregistrerChampListe(ligneId, champ, valeurEnregistree);
      };
      if (type === "priorite") {
        champ = "Priorite";
        valeurInitiale = ligne[champ] || "";
        let choix = CHOIX_PRIORITE.slice();
        if (valeurInitiale && !choix.includes(valeurInitiale)) choix.push(valeurInitiale);
        element = document.createElement("select");
        element.className = "select-liste-edition";
        element.innerHTML = "<option value=''>—</option>" + choix.map(v =>
          "<option value=\"" + escapeHtml(v) + "\"" + (v === valeurInitiale ? " selected" : "") + ">" + escapeHtml(v) + "</option>").join("");
        element.addEventListener("change", () => finir(element.value || null, element.value !== valeurInitiale));
        element.addEventListener("blur", () => finir(null, false));
      } else if (type === "date") {
        champ = td.getAttribute("data-champ") || "Date_de_soumission";
        valeurInitiale = dateEpochVersInput(ligne[champ]);
        element = document.createElement("input");
        element.type = "date";
        element.className = "input-ref-brm-liste";
        element.value = valeurInitiale;
        element.addEventListener("change", () => finir(inputVersDateEpoch(element.value), element.value !== valeurInitiale));
        element.addEventListener("blur", () => finir(null, false));
      } else {
        // texte : Titre, Organisation ; texte avec suggestions : Sponsor (référence), Porteur (choix libre)
        champ = { titre: "Titre", organisation: "Organisation", sponsor: "Sponsor", porteur: "Porteurs" }[type];
        valeurInitiale = type === "sponsor" ? nomActeur(ligne.Sponsor) : String(ligne[champ] || "");
        element = document.createElement("input");
        element.type = "text";
        element.className = "input-ref-brm-liste";
        element.value = valeurInitiale;
        if (type === "sponsor" || type === "porteur") { assurerDatalistActeursListe(); element.setAttribute("list", "datalist-liste-acteurs"); }
        const valider = () => {
          const texte = element.value.trim();
          if (texte === valeurInitiale) { finir(null, false); return; }
          if (type === "sponsor") {
            if (!texte) { finir(null, true); return; }
            const cand = acteursTriesParNom.find(a => normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texte));
            if (!cand) { termine = true; alert("Aucun acteur ne correspond à « " + texte + " »."); afficherListe(); return; }
            finir(cand.id, true);
          } else if (type === "porteur") {
            const cand = acteursTriesParNom.find(a => normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texte));
            finir(texte ? (cand ? cand.label : texte) : null, true);
          } else {
            finir(texte, true);
          }
        };
        element.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") valider();
          else if (ev.key === "Escape") finir(null, false);
        });
        element.addEventListener("blur", valider);
      }
      element.addEventListener("click", (ev) => ev.stopPropagation());
      if (element.tagName === "SELECT") element.addEventListener("keydown", (ev) => { if (ev.key === "Escape") finir(null, false); });
      td.textContent = "";
      td.appendChild(element);
      element.focus();
      if (element.tagName === "INPUT" && element.type === "text") element.select();
    };
    // Clic sur le TEXTE de la cellule : édition en place (après un court délai, pour laisser le temps
    // d'un double clic). Clic ailleurs dans la cellule : comportement normal de la ligne (sélection,
    // double clic = ouverture de la fiche). Double clic sur le texte : ouvre la fiche, sans édition.
    td.addEventListener("click", (e) => {
      if (td.querySelector("input, select")) { e.stopPropagation(); return; }
      if (!(e.target.closest && e.target.closest(".texte-cellule-edit"))) return;
      e.stopPropagation(); // ne change pas la fiche sélectionnée
      clearTimeout(timerEditionListe);
      timerEditionListe = setTimeout(demarrerEdition, DELAI_DOUBLE_CLIC_MS);
    });
    td.addEventListener("dblclick", (e) => {
      if (!(e.target.closest && e.target.closest(".texte-cellule-edit"))) return;
      clearTimeout(timerEditionListe);
      fermerPopupFiltreListeColonne();
      const id = parseInt(td.closest("tr").getAttribute("data-id"), 10);
      dernierClicId = null;
      selectionnerLigne(id);
      masquerZoneListe();
    });
  });
}

// Popup « Parties prenantes » d'une demande : retirer une personne (✕) ou en ajouter une.
function ouvrirPopupPartiesPrenantesListe(cellule, ligneId) {
  const dejaOuverte = document.querySelector(".popup-pp-liste");
  fermerPopupFiltreListeColonne();
  if (dejaOuverte && dejaOuverte.getAttribute("data-ligne-id") === String(ligneId)) return;
  const ligne = lignesEmergence.find(l => l.id === ligneId);
  if (!ligne) return;
  assurerDatalistActeursListe();
  const ids = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));
  const popup = document.createElement("div");
  popup.className = "popup-filtre-action-colonne popup-filtre-liste-colonne popup-pp-liste";
  popup.setAttribute("data-ligne-id", String(ligneId));
  popup.innerHTML =
    "<div class='pp-liste-chips'>" + (ids.length ? ids.map(id =>
      "<span class='chip-pp-liste'>" + escapeHtml(nomActeurParId(id)) + " <button type='button' class='pp-liste-retirer' data-id='" + id + "' title='Retirer'>✕</button></span>").join("")
      : "<em style='color:#888;'>Aucune partie prenante</em>") + "</div>" +
    "<input type='text' class='pp-liste-ajout' list='datalist-liste-acteurs' placeholder='Ajouter (tapez un nom, Entrée)'>";
  document.body.appendChild(popup);
  const rect = cellule.getBoundingClientRect();
  popup.style.top = (rect.bottom + 2) + "px";
  let gauche = rect.left;
  const largeur = popup.offsetWidth || 260;
  if (gauche + largeur > window.innerWidth - 8) gauche = Math.max(8, window.innerWidth - 8 - largeur);
  popup.style.left = gauche + "px";
  popup.addEventListener("click", (e) => e.stopPropagation());
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  const sauver = async (nouveauxIds) => {
    try {
      await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { Parties_prenantes_concernees: ["L"].concat(nouveauxIds) }]]);
      await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
      const td = document.querySelector('#corps-tableau tr[data-id="' + ligneId + '"] td[data-edit="pp"]');
      if (td) ouvrirPopupPartiesPrenantesListe(td, ligneId); // rouvre avec la liste à jour
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    }
  };
  popup.querySelectorAll(".pp-liste-retirer").forEach(b => b.addEventListener("click", () => {
    const idARetirer = parseInt(b.getAttribute("data-id"), 10);
    fermerPopupFiltreListeColonne();
    sauver(ids.filter(i => i !== idARetirer));
  }));
  const champ = popup.querySelector(".pp-liste-ajout");
  champ.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const texte = champ.value.trim();
    if (!texte) return;
    const cand = acteursTriesParNom.find(a => !ids.includes(a.id) && normaliserTexteRecherche(a.label) === normaliserTexteRecherche(texte));
    if (!cand) { alert("Aucun acteur (non déjà présent) ne correspond à « " + texte + " »."); return; }
    fermerPopupFiltreListeColonne();
    sauver(ids.concat([cand.id]));
  });
  champ.focus();
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
    if (th.hasAttribute("data-non-triable")) return;
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

      const etaitDeplacable = th.getAttribute("draggable") === "true"; // un glisser-déposer natif supprimerait « pointerup »

      if (etaitDeplacable) th.setAttribute("draggable", "false");

      let termine = false;
      poignee.classList.add("active-resize");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      function onPointerMove(ev) {
        if (ev.buttons === 0) { onPointerUp(ev); return; } // bouton relâché sans évènement de fin
        const nouvelleLargeur = Math.max(50, Math.round(ev.clientX - rectTh.left));
        largeursColonnes[colName] = nouvelleLargeur;
        appliquerLargeursColonnes();
      }

      function onPointerUp(ev) {
        if (termine) return; termine = true;
        try { poignee.releasePointerCapture(ev.pointerId); } catch (err) { /* ignoré */ }
        poignee.removeEventListener("pointermove", onPointerMove);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.removeEventListener(n, onPointerUp));
        document.removeEventListener("pointerup", onPointerUp);
        if (etaitDeplacable) th.setAttribute("draggable", "true");
        poignee.classList.remove("active-resize");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setTimeout(() => { th.dataset.enTrainDeRedimensionner = "0"; }, 50);
      }

      poignee.addEventListener("pointermove", onPointerMove);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.addEventListener(n, onPointerUp));
      document.addEventListener("pointerup", onPointerUp);
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
        if (ev.buttons === 0) { onPointerUp(ev); return; } // bouton relâché sans évènement de fin
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
// Au-delà de SEUIL_REPLI_PP puces, on n'en montre que PP_VISIBLES_REPLIEES + une puce « +N autres ».
const SEUIL_REPLI_PP = 6;
const PP_VISIBLES_REPLIEES = 5;
let ppDeplieesBandeau = false;
function genererPartiesPrenantesHtml(ligne) {
  const idsActuels = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number));

  let chipsHtml = "";
  if (idsActuels.length === 0) {
    chipsHtml = "<div class='pp-vide'>Aucune partie prenante</div>";
  } else {
    const replier = idsActuels.length > SEUIL_REPLI_PP;
    chipsHtml = "<div class='chips-conteneur" + (replier && !ppDeplieesBandeau ? " pp-replie" : "") + "' id='pp-chips'>";
    idsActuels.forEach((id, i) => {
      chipsHtml += "<span class='chip" + (replier && i >= PP_VISIBLES_REPLIEES ? " chip-replie" : "") + "' data-acteur-id='" + id + "'>" +
        "<button class='chip-modifier' type='button' data-acteur-id='" + id + "' title='Modifier la fiche de cette personne'>👤</button>" +
        "<span class='chip-texte'>" + escapeHtml(ligneActeur(id)) + "</span>" +
        "<button class='chip-retirer' type='button' data-acteur-id='" + id + "' title='Retirer'>×</button>" +
        "</span>";
    });
    if (replier) {
      chipsHtml += "<button type='button' class='chip-plus-autres' id='pp-plus-autres' data-nb='" + (idsActuels.length - PP_VISIBLES_REPLIEES) + "'>" +
        (ppDeplieesBandeau ? "réduire" : "+" + (idsActuels.length - PP_VISIBLES_REPLIEES) + " autres") + "</button>";
    }
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
  if (estLigneChangementEtat(r)) return genererLigneRidaVerrouillee(r);
  // Pour une ligne RIDA de type "I" (Information), "Fait le" suit toujours "Pour le" : le champ
  // est verrouillé (lecture seule, pas de croix pour l'effacer séparément).
  const estInformation = r.RIDA === "I";
  const valeurFaitLe = estInformation ? r.Pour_le : r.Fait_le;
  return "<tr data-rida-id='" + r.id + "'>" +
    "<td><select class='rida-input' data-field='RIDA'>" + optionsRidaTypeHtml(r.RIDA) + "</select></td>" +
    "<td>" + genererCelluleRidaPorteurHtml(r) + "</td>" +
    "<td class='rida-impliques'>" + boutonParticipantsRidaHtml(r) + "</td>" +
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

// Ligne RIDA de changement d'état : lecture seule, mais supprimable (🗑).
function genererLigneRidaVerrouillee(r) {
  return "<tr data-rida-id='" + r.id + "' class='rida-verrouillee' title='Ligne automatique : non modifiable (suppression possible)'>" +
    "<td>I</td>" +
    "<td>" + escapeHtml(r.Porteur || "") + "</td>" +
    "<td></td>" +
    "<td>" + escapeHtml(formaterDate(r.Pour_le)) + "</td>" +
    "<td>" + escapeHtml(formaterDate(r.Pour_le)) + "</td>" +
    "<td class='rida-date-modif'>" + escapeHtml(formaterDateModifRida(r)) + "</td>" +
    "<td><span class='rida-description-verrou'>🔒 " + escapeHtml(r.Description || "") + "</span></td>" +
    "<td class='rida-actions'><button class='btn-rida-delete' type='button' title='Supprimer cette ligne'>🗑</button></td></tr>";
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
const LARGEURS_RIDA_FICHE_DEFAUT = { RIDA: 80, Porteur: 150, Impliques: 90, Pour_le: 140, Fait_le: 140, Date_de_modification: 120 };
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
  // Liseré rouge entre le réalisé (« Fait le » renseigné ; les informations le sont d'office) et ce qui reste à faire.
  // Chaque groupe garde l'ordre courant (tri sur « Pour le » compris) ; pas de liseré si l'un des groupes est vide.
  const faites = ridaLies.filter(r => r.Fait_le || r.RIDA === "I"), aFaire = ridaLies.filter(r => !(r.Fait_le || r.RIDA === "I"));
  const ordonnees = (faites.length && aFaire.length) ? faites.concat(aFaire) : ridaLies;
  ordonnees.forEach((r, i) => {
    if (faites.length && aFaire.length && i === faites.length) {
      lignesHtml += "<tr class='rida-separateur' aria-hidden='true'><td colspan='8'><span>▼ à faire</span></td></tr>";
    }
    lignesHtml += genererLigneRidaEditable(r);
  });
  const col = (k) => "<col data-col-rida-w='" + k + "' style='width:" + largeursRidaFiche[k] + "px;'>";
  const poignee = "<span class='poignee-rida'></span>";

  return (
    "<table class='tableau-fiche tableau-rida-editable'>" +
    "<colgroup>" + col("RIDA") + col("Porteur") + col("Impliques") + col("Pour_le") + col("Fait_le") + col("Date_de_modification") + "<col><col style='width:60px;'></colgroup>" +
    "<thead><tr><th data-col-rida-w='RIDA'>RIDA" + poignee + "</th><th data-col-rida-w='Porteur'>Porteur" + poignee + "</th>" +
    "<th data-col-rida-w='Impliques' title='Personnes impliquées par la ligne'>Impliqués" + poignee + "</th>" +
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
  const nbPartiesPrenantes = nettoyerIdsActeurs(refListVersIds(ligne.Parties_prenantes_concernees).map(Number)).length;

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

  const ridaLies = ridaToutes.filter(r => idDepuisRef(r.ID2) === ligne.id);
  if (triRidaColonne === "Pour_le") {
    ridaLies.sort((a, b) => {
      const vA = a.Pour_le || 0, vB = b.Pour_le || 0;
      return triRidaSens === "asc" ? vA - vB : vB - vA;
    });
  }
  const ridaContenu = genererFriseRidaHtml(ligne, ridaLies) + genererTableauRidaEditable(ridaLies);

  // --- Champ Sponsor (puce bleue, comme Parties prenantes — un seul acteur référencé) ---
  const sponsorChampHtml = genererSponsorChipHtml(sponsorId);

  // --- Champ Porteurs (puce bleue — Choix unique donc valeur texte libre, pas une référence) ---
  const porteursChampHtml = genererPorteursChipHtml(ligne.Porteurs || "");

  // --- Select Statut (coloré) ---
  const optionsStatut = Object.keys(COULEURS_STATUT).map(s =>
    "<option value=\"" + escapeHtml(s) + "\" title=\"" + escapeHtml(descriptionStatut(s)) + "\"" + (s === ligne.Statut ? " selected" : "") + ">" + escapeHtml(s) + "</option>"
  ).join("");
  const statutSelectHtml =
    "<select id='statut-select' title=\"" + escapeHtml(descriptionStatut(ligne.Statut)) + "\">" + optionsStatut + "</select>" +
    "<span class='info-statut' id='info-statut' title=\"" + escapeHtml(descriptionStatut(ligne.Statut)) + "\">ⓘ</span>" +
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

  // --- Typologie de la demande (puces du bandeau, multi-sélection par popup) ---
  const typologiesLigne = typologiesDeLigne(ligne);
  let typologieChampHtml = "<span class='chips-conteneur chips-typologie'>" +
    typologiesLigne.slice(0, MAX_PUCES_TYPOLOGIE).map(t =>
      "<span class='chip chip-typologie' title=\"" + escapeHtml(t) + "\"><span class='chip-texte'>" + escapeHtml(tronquerTexte(t, MAX_CAR_PUCE_TYPOLOGIE)) + "</span>" +
      "<button class='chip-retirer' type='button' data-typologie=\"" + escapeHtml(t) + "\" title='Retirer'>×</button></span>").join("");
  if (typologiesLigne.length > MAX_PUCES_TYPOLOGIE) {
    typologieChampHtml += "<span class='chip chip-typologie' title=\"" + escapeHtml(typologiesLigne.slice(MAX_PUCES_TYPOLOGIE).join(", ")) + "\"><span class='chip-texte'>+" +
      (typologiesLigne.length - MAX_PUCES_TYPOLOGIE) + "</span></span>";
  }
  typologieChampHtml += "</span><button type='button' id='btn-typologie' class='btn-ajout-replie" + (typologiesLigne.length ? "" : " champ-vide") + "' title='Choisir les typologies'>" +
    (typologiesLigne.length ? "+" : "+ Typologie") + "</button><span class='msg-sauvegarde' id='msg-typologie'></span>";

  const tagsLigne = tagsDeLigne(ligne);
  const tagChampHtml = "<span class='chips-conteneur chips-tag'>" +
    tagsLigne.map(t => "<span class='chip chip-tag' title=\"" + escapeHtml(t) + "\"><span class='chip-texte'>" + escapeHtml(tronquerTexte(t, MAX_CAR_PUCE_TYPOLOGIE)) + "</span>" +
      "<button class='chip-retirer' type='button' data-tag=\"" + escapeHtml(t) + "\" title='Retirer'>×</button></span>").join("") +
    "</span><button type='button' id='btn-tag' class='btn-ajout-replie" + (tagsLigne.length ? "" : " champ-vide") + "' title='Choisir les tags'>" +
    (tagsLigne.length ? "+" : "+ Tag") + "</button>";

  conteneur.innerHTML = `
    <div class="bandeau bandeau-compact">
      <div class="bandeau-ligne bandeau-ligne-titre">
        <div class="champ-editable-inline champ-titre-editable">
          <div class="titre-et-ref-brm">
            <span class="ref-emergence-bandeau" id="ref-emergence-bandeau" title="Référence de la demande — cliquer pour copier le lien direct vers cette fiche">${escapeHtml(refDemande(ligne.id))} 🔗</span>
            <input type="text" id="titre-input" value="${escapeHtml(ligne.Titre || "")}" placeholder="Titre de la demande">
            ${cleRefBrm(ligne) ? `<input type="text" id="ref-brm-input" class="ref-brm-bandeau" title="Référence BRM" placeholder="Ref BRM" value="${escapeHtml(refBrm(ligne))}">` : ""}
          </div>
          <span class="msg-sauvegarde" id="msg-titre"></span>
        </div>
      </div>
      <div class="bandeau-ligne bandeau-ligne-meta">
        <div class="champ-editable-inline champ-meta" title="Statut"><span class="champ-label">Statut</span>${statutSelectHtml}</div>
        <div class="champ-editable-inline champ-meta" title="Priorité"><span class="champ-label">Priorité</span>${prioriteSelectHtml}</div>
        <div class="champ-editable-inline champ-meta" title="Organisation qui émet la demande">
          <span class="champ-label">Organisation</span>
          <input type="text" id="organisation-input" class="input-organisation" placeholder="—" value="${escapeHtml(ligne.Organisation)}">
          <span class="msg-sauvegarde" id="msg-organisation"></span>
        </div>
        <div class="champ-editable-inline champ-meta" title="Date d'entrée de la demande">
          <span class="champ-label">Date d'entrée</span>
          <input type="date" id="date-soumission-input" value="${dateEpochVersInput(ligne.Date_de_soumission)}">
          <span class="msg-sauvegarde" id="msg-date-soumission"></span>
        </div>
        <div class="champ-editable-inline champ-meta" title="Date du Go/noGo SDID">
          <span class="champ-label">Go/noGo SDID</span>
          <input type="date" id="date-gonogo-input" value="${dateEpochVersInput(ligne.Date_Go_NoGo_SDID)}">
          <span class="msg-sauvegarde" id="msg-date-gonogo"></span>
        </div>
        <div class="champ-editable-inline champ-meta" title="Date du premier atelier (calculée d'après les lignes RIDA « tenue d'un atelier »)">
          <span class="champ-label">1er atelier</span>
          <input type="date" id="date-1er-atelier-input" value="${dateEpochVersInput(datePremierAtelier(ligne.id))}" disabled>
        </div>
        <div class="champ-editable-inline champ-meta" title="Mise à disposition du MVP (prévisionnelle)">
          <span class="champ-label">MVP prévu</span>
          <input type="date" id="date-mvp-prev-input" value="${dateEpochVersInput(ligne.Date_MVP_previsionnelle)}">
          <span class="msg-sauvegarde" id="msg-date-mvp-prev"></span>
        </div>
        <div class="champ-editable-inline champ-meta" title="Mise à disposition du MVP (réalisée)">
          <span class="champ-label">MVP réalisé</span>
          <input type="date" id="date-mvp-reel-input" value="${dateEpochVersInput(ligne.Date_MVP_realisee)}">
          <span class="msg-sauvegarde" id="msg-date-mvp-reel"></span>
        </div>
        <div class="champ-editable-inline champ-meta" title="Date de clôture">
          <span class="champ-label">Clôture</span>
          <input type="date" id="date-cloture-input" value="${dateEpochVersInput(ligne.Date_de_cloture)}">
          <span class="msg-sauvegarde" id="msg-date-cloture"></span>
        </div>
      </div>
      <div class="bandeau-ligne bandeau-ligne-personnes">
        <div class="champ-editable-inline champ-personnes" data-libelle-ajout="+ Sponsor">
          <span class="champ-label">Sponsor</span>
          ${sponsorChampHtml}
        </div>
        <div class="champ-editable-inline champ-personnes" data-libelle-ajout="+ Porteur">
          <span class="champ-label">Porteurs</span>
          ${porteursChampHtml}
        </div>
        <div class="champ-editable-inline champ-tag">
          <span class="champ-label">Tag</span>
          ${tagChampHtml}
        </div>
        <div class="champ-editable-inline champ-typologie">
          <span class="champ-label">Typologie</span>
          ${typologieChampHtml}
        </div>
      </div>
      <div class="bandeau-ligne bandeau-ligne-pp">
        <div class="champ-editable-inline champ-personnes champ-pp" data-libelle-ajout="+ Partie prenante">
          <span class="champ-label">Parties prenantes${nbPartiesPrenantes ? " (" + nbPartiesPrenantes + ")" : ""}</span>
          ${partiesPrenantesEditableHtml}
          <button type="button" id="btn-ouvrir-gestion-acteurs" class="btn-icone-gestion" title="Gérer la liste des acteurs">👥</button>
        </div>
      </div>
      <div class="bandeau-ligne bandeau-ligne-objet">
        <div class="champ-editable">
          <div class="champ-label">Objet de la demande</div>
          ${champMarkdownHtml("objet", ligne.Objet_de_la_demande, null, null)}
        </div>
      </div>
    </div>

    <div class="tabbar">
      <button class="tab-btn ${ongletActif === 'rida' ? 'active' : ''}" data-tab="rida">RIDA</button>
      <button class="tab-btn ${ongletActif === 'general' ? 'active' : ''}" data-tab="general">Général</button>
      <button class="tab-btn ${ongletActif === 'main-courante' ? 'active' : ''}" data-tab="main-courante">Main courante</button>
      <button class="tab-btn ${ongletActif === 'autres' ? 'active' : ''}" data-tab="autres">Autres champs</button>
      <button class="tab-btn ${ongletActif === 'messages' ? 'active' : ''}" data-tab="messages" id="tab-btn-messages-fiche">Messages</button>
    </div>
    <div class="tab-panel ${ongletActif === 'rida' ? 'active' : ''}" data-panel="rida">${ridaContenu}</div>
    <div class="tab-panel ${ongletActif === 'general' ? 'active' : ''}" data-panel="general">
      ${genererKpiFicheHtml(ligne)}
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
    <div class="tab-panel ${ongletActif === 'messages' ? 'active' : ''}" data-panel="messages"><div id="fiche-messages"></div></div>
  `;
  rafraichirOngletMessagesFiche();

  conteneur.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      ongletActif = btn.getAttribute("data-tab");
      conteneur.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      conteneur.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      conteneur.querySelector(".tab-panel[data-panel='" + ongletActif + "']").classList.add("active");
    });
  });

  // --- Bandeau compact : champs d'ajout repliés derrière un bouton « + », repli des parties prenantes ---
  conteneur.querySelectorAll(".bandeau-compact .champ-personnes").forEach(bloc => {
    const ajout = bloc.querySelector(".ajout-pp-conteneur");
    if (!ajout) return;
    const vide = !!bloc.querySelector(".pp-vide");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-ajout-replie" + (vide ? " champ-vide" : "");
    btn.textContent = vide ? (bloc.getAttribute("data-libelle-ajout") || "+") : "+";
    btn.title = vide ? "Ajouter" : "Ajouter / remplacer";
    ajout.classList.add("ajout-replie");
    ajout.parentNode.insertBefore(btn, ajout);
    const input = ajout.querySelector("input[type='text']");
    btn.addEventListener("click", () => {
      ajout.classList.remove("ajout-replie");
      btn.style.display = "none";
      if (input) input.focus();
    });
    if (input) input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { input.value = ""; ajout.classList.add("ajout-replie"); btn.style.display = ""; }
    });
  });
  const btnPlusAutresPp = conteneur.querySelector("#pp-plus-autres");
  if (btnPlusAutresPp) {
    btnPlusAutresPp.addEventListener("click", () => {
      ppDeplieesBandeau = !ppDeplieesBandeau;
      const zone = conteneur.querySelector("#pp-chips");
      zone.classList.toggle("pp-replie", !ppDeplieesBandeau);
      btnPlusAutresPp.textContent = ppDeplieesBandeau ? "réduire" : "+" + btnPlusAutresPp.getAttribute("data-nb") + " autres";
    });
  }

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

  // --- Édition de la Ref BRM (bandeau : petit champ à côté du titre, sauvegarde à la perte de focus) ---
  const refEmgBandeau = conteneur.querySelector("#ref-emergence-bandeau");
  if (refEmgBandeau) refEmgBandeau.addEventListener("click", () => {
    const lien = lienDemande(ligne.id), texte = lien || refDemande(ligne.id);
    const ok = () => { refEmgBandeau.textContent = (lien ? "Lien copié ✓" : "Référence copiée ✓ (lien direct : renseigner la base du lien dans les Paramètres)"); setTimeout(() => { refEmgBandeau.textContent = refDemande(ligne.id) + " 🔗"; }, 2500); };
    try { navigator.clipboard.writeText(texte).then(ok, () => { copierTexteSecours(texte); ok(); }); } catch (e) { copierTexteSecours(texte); ok(); }
  });
  const refBrmInput = conteneur.querySelector("#ref-brm-input");
  if (refBrmInput) {
    const valeurInitialeRefBrm = refBrm(ligne);
    refBrmInput.addEventListener("blur", () => {
      if (refBrmInput.value.trim() !== valeurInitialeRefBrm) {
        sauverChampEmergence(cleRefBrm(ligne), refBrmInput.value.trim(), msgTitre);
      }
    });
    refBrmInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") refBrmInput.blur();
      else if (e.key === "Escape") { refBrmInput.value = valeurInitialeRefBrm; refBrmInput.blur(); }
    });
  }

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
  const infoStatut = conteneur.querySelector("#info-statut");
  statutSelect.addEventListener("change", () => {
    statutSelect.title = descriptionStatut(statutSelect.value);
    if (infoStatut) infoStatut.title = descriptionStatut(statutSelect.value);
    sauverChampEmergence("Statut", statutSelect.value, msgStatut);
  });

  // --- Édition de la Priorité (select, sauvegarde immédiate) ---
  const prioriteSelect = conteneur.querySelector("#priorite-select");
  const msgPriorite = conteneur.querySelector("#msg-priorite");
  prioriteSelect.addEventListener("change", () => {
    sauverChampEmergence("Priorite", prioriteSelect.value || null, msgPriorite);
  });

  // --- Édition de la Typologie de la demande (popup de choix multiple, retrait par ×) ---
  conteneur.querySelector("#btn-typologie").addEventListener("click", (e) => ouvrirPopupTypologie(e.currentTarget, ligne.id));
  conteneur.querySelectorAll(".chip-typologie .chip-retirer").forEach(b => b.addEventListener("click", () => {
    const t = b.getAttribute("data-typologie");
    enregistrerTypologie(ligne.id, typologiesDeLigne(ligne).filter(x => x !== t));
  }));

  // --- Édition des Tags (liste gérée dans les paramètres, retrait par ×) ---
  conteneur.querySelector("#btn-tag").addEventListener("click", (e) => ouvrirPopupTags(e.currentTarget, ligne.id));
  conteneur.querySelectorAll(".chip-tag .chip-retirer").forEach(b => b.addEventListener("click", () => {
    const t = b.getAttribute("data-tag");
    enregistrerTags(ligne.id, tagsDeLigne(ligne).filter(x => x !== t));
  }));

  // --- Édition des dates de soumission et de clôture (sauvegarde immédiate au changement) ---
  const dateSoumissionInput = conteneur.querySelector("#date-soumission-input");
  const msgDateSoumission = conteneur.querySelector("#msg-date-soumission");
  dateSoumissionInput.addEventListener("change", () => {
    sauverChampEmergence("Date_de_soumission", inputVersDateEpoch(dateSoumissionInput.value), msgDateSoumission);
  });

  [["#date-gonogo-input", "Date_Go_NoGo_SDID", "#msg-date-gonogo"], ["#date-mvp-prev-input", "Date_MVP_previsionnelle", "#msg-date-mvp-prev"],
    ["#date-mvp-reel-input", "Date_MVP_realisee", "#msg-date-mvp-reel"]].forEach(([sel, champ, selMsg]) => {
    const inp = conteneur.querySelector(sel), msg = conteneur.querySelector(selMsg);
    inp.addEventListener("change", () => sauverChampEmergence(champ, inputVersDateEpoch(inp.value), msg));
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
    ridaTbody.addEventListener("click", (e) => {
      const b = e.target.closest(".btn-rida-participants");
      if (b) ouvrirModaleParticipants(parseInt(b.getAttribute("data-rida-id"), 10), ligne.id);
    });
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

// ===== Import / export CSV des contacts (v0.162) =====
// Format compatible avec le fichier annuaire SDID :
// « Prénom;Nom;Nom affiché;Email;Email 2;Tél. bureau;Mobile;Organisation;Fonction;Notes;Divers 1;Divers 2;Divers 3;Divers 4 »
// (séparateur « ; », première ligne = en-têtes). « Divers 1..4 » reçoit à l'export les demandes liées au contact
// (sponsor, partie prenante ou porteur), au format « EMERGENCE-<ID>-<TITRE> », les 4 plus récemment modifiées.
const ENTETES_CSV_CONTACTS = ["Prénom", "Nom", "Nom affiché", "Email", "Email 2", "Tél. bureau", "Mobile", "Organisation", "Fonction", "Notes", "Divers 1", "Divers 2", "Divers 3", "Divers 4"];
const MAX_DEMANDES_CSV_CONTACT = 4;

// « NOM Prénom » -> { nom, prenom } : les premiers mots entièrement en majuscules forment le nom, le reste le prénom.
function separerNomPrenomActeur(nomEtPrenom) {
  const mots = String(nomEtPrenom || "").trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < mots.length && motEstMajuscule(mots[i])) i++;
  if (i === 0) return { nom: "", prenom: mots.join(" ") };
  return { nom: mots.slice(0, i).join(" "), prenom: mots.slice(i).join(" ") };
}

function cleTriMotsNom(texte) {
  return normaliserTexteRecherche(texte).split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
}

// Demandes liées à un contact : sponsor, partie prenante concernée, ou porteur (texte libre, comparé sans tenir compte de l'ordre des mots).
function demandesDuContact(acteurId) {
  const cle = cleTriMotsNom(nomActeurParId(acteurId));
  return lignesEmergence.filter(l => {
    if (refListVersIds(l.Sponsor).map(Number).includes(Number(acteurId)) || Number(l.Sponsor) === Number(acteurId)) return true;
    if (refListVersIds(l.Parties_prenantes_concernees).map(Number).includes(Number(acteurId))) return true;
    if (!cle) return false;
    return String(l.Porteurs || "").split(/[;,]/).some(p => p.trim() && cleTriMotsNom(p) === cle);
  });
}

function libelleDemandeCsvContact(ligne) {
  const titre = String(ligne.Titre || "Sans titre").replace(/\s+/g, " ").trim();
  return "EMERGENCE-" + String(ligne.id).padStart(4, "0") + "-" + titre;
}

function quatreDemandesRecentes(acteurId) {
  const cle = l => { const t = epochDerniereModifDemande(l.id); return typeof t === "number" ? t : (typeof l.Date_de_soumission === "number" ? l.Date_de_soumission : 0); };
  return demandesDuContact(acteurId).sort((a, b) => cle(b) - cle(a) || b.id - a.id).slice(0, MAX_DEMANDES_CSV_CONTACT).map(libelleDemandeCsvContact);
}

function telephonesCsvActeur(tel) {
  const brut = String(tel || "").trim();
  if (!brut) return { bureau: "", mobile: "" };
  const parts = brut.split(/\s+\/\s+|\s*;\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { bureau: parts[0], mobile: parts[1] };
  const chiffres = brut.replace(/[\s.\-]/g, "").replace(/^(\+33|0033)/, "0");
  return /^0[67]/.test(chiffres) ? { bureau: "", mobile: brut } : { bureau: brut, mobile: "" };
}

function idsActeursAffichesContacts() {
  let ids = Object.keys(acteursParId).map(Number);
  if (filtreGestionActeurNom) { const q = normaliserTexteRecherche(filtreGestionActeurNom); ids = ids.filter(id => normaliserTexteRecherche((acteursParId[id] && acteursParId[id].Nom_et_Prenom) || "").indexOf(q) !== -1); }
  if (filtreGestionActeurOrg) { const q = normaliserTexteRecherche(filtreGestionActeurOrg); ids = ids.filter(id => normaliserTexteRecherche((acteursParId[id] && acteursParId[id].Organisation) || "").indexOf(q) !== -1); }
  ids.sort((a, b) => String((acteursParId[a] && acteursParId[a].Nom_et_Prenom) || "").localeCompare(String((acteursParId[b] && acteursParId[b].Nom_et_Prenom) || ""), "fr"));
  return ids;
}

function construireCsvContacts() {
  const ids = idsActeursAffichesContacts();
  const rows = [ENTETES_CSV_CONTACTS.map(echapperCsv).join(";")];
  ids.forEach(id => {
    const a = acteursParId[id] || {};
    const { nom, prenom } = separerNomPrenomActeur(a.Nom_et_Prenom);
    const org = a.Organisation_Path || a.Organisation || "";
    const affiche = [a.Nom_et_Prenom || "", org.replace(/\//g, " ")].filter(Boolean).join(" ");
    const tel = telephonesCsvActeur(a.Telephone);
    const dem = quatreDemandesRecentes(id);
    const cells = [prenom, nom, affiche, a.mail || "", "", tel.bureau, tel.mobile, org, a.Role || "", a.Notes || "", dem[0] || "", dem[1] || "", dem[2] || "", dem[3] || ""];
    rows.push(cells.map(echapperCsv).join(";"));
  });
  return { texte: "﻿" + rows.join("\r\n"), nb: ids.length };
}

function exporterContactsCsv() {
  const msg = document.getElementById("modale-acteurs-msg");
  const { texte, nb } = construireCsvContacts();
  const d = new Date();
  const dateTxt = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  telechargerBlob(new Blob([texte], { type: "text/csv;charset=utf-8" }), "contacts_emergence_" + dateTxt + ".csv");
  if (msg) msg.textContent = nb + " contact(s) exporté(s).";
}

// Analyse un CSV (séparateur « ; », « , » ou tabulation, détecté sur la 1re ligne ; guillemets doublés gérés).
function analyserCsvTexte(texte) {
  let t = String(texte || "").replace(/^﻿/, "");
  const premiere = t.split(/\r?\n/, 1)[0] || "";
  const compte = c => (premiere.match(new RegExp(c === "\t" ? "\\t" : "\\" + c, "g")) || []).length;
  const sep = [";", "\t", ","].map(c => [c, compte(c)]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let ligne = [], cell = "", entre = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entre) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else entre = false; } else cell += c;
    } else if (c === '"') entre = true;
    else if (c === sep) { ligne.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; ligne.push(cell); cell = ""; lignes.push(ligne); ligne = []; }
    else cell += c;
  }
  if (cell !== "" || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes.filter(l => l.some(x => String(x).trim() !== ""));
}

function lireFichierTexteAvecEncodage(buffer) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch (e) { return new TextDecoder("windows-1252").decode(buffer); }
}

// Transforme les lignes CSV en contacts { Nom_et_Prenom, Organisation, Organisation_Path, Role, mail, Telephone, Notes }.
// Une cellule qui répète son propre en-tête (ex. « Fonction » dans la colonne « Fonction ») est un gabarit : ignorée.
function contactsDepuisCsv(lignes) {
  if (lignes.length < 2) return [];
  const norm = x => normaliserTexteRecherche(x).replace(/[^a-z0-9]+/g, " ").trim();
  const idx = {}; lignes[0].forEach((h, i) => { idx[norm(h)] = i; });
  const col = (ligne, nom) => { const i = idx[norm(nom)]; if (i === undefined) return ""; const v = String(ligne[i] === undefined ? "" : ligne[i]).trim(); return norm(v) === norm(nom) ? "" : v; };
  const contacts = [];
  lignes.slice(1).forEach(ligne => {
    const nom = col(ligne, "Nom"), prenom = col(ligne, "Prénom"), affiche = col(ligne, "Nom affiché");
    let nomEtPrenom = [nom, prenom].filter(Boolean).join(" ");
    if (!nomEtPrenom) nomEtPrenom = affiche;
    const mail = col(ligne, "Email") || col(ligne, "Email 2");
    if (!nomEtPrenom && !mail) return;
    const org = col(ligne, "Organisation");
    const bureau = col(ligne, "Tél. bureau"), mobile = col(ligne, "Mobile");
    const c = { Nom_et_Prenom: nomEtPrenom || (nomPrenomDepuisEmail(mail) || {}).nomEtPrenom || mail };
    if (mail) c.mail = mail;
    if (org) { c.Organisation_Path = org; c.Organisation = org.split("/").pop().trim(); }
    if (col(ligne, "Fonction")) c.Role = col(ligne, "Fonction");
    if (bureau || mobile) c.Telephone = [bureau, mobile].filter(Boolean).join(" / ");
    if (col(ligne, "Notes")) c.Notes = col(ligne, "Notes");
    contacts.push(c);
  });
  return contacts;
}

// Rapproche un contact importé d'un contact existant : par e-mail, sinon par nom (ordre des mots indifférent).
function trouverActeurExistant(c) {
  const mail = String(c.mail || "").trim().toLowerCase();
  const ids = Object.keys(acteursParId);
  if (mail) { const id = ids.find(i => String(acteursParId[i].mail || "").trim().toLowerCase() === mail); if (id) return Number(id); }
  const cle = cleTriMotsNom(c.Nom_et_Prenom);
  if (cle) { const id = ids.find(i => cleTriMotsNom(acteursParId[i].Nom_et_Prenom) === cle); if (id) return Number(id); }
  return null;
}

// Import non destructif : un contact existant n'est que complété (champs vides), jamais écrasé.
function planImportContacts(contacts) {
  const creations = [], completions = []; let inchanges = 0;
  const dejaVus = new Set();
  contacts.forEach(c => {
    const cleDoublon = (String(c.mail || "").toLowerCase()) || cleTriMotsNom(c.Nom_et_Prenom);
    if (dejaVus.has(cleDoublon)) return; dejaVus.add(cleDoublon);
    const id = trouverActeurExistant(c);
    if (id === null) { creations.push(c); return; }
    const a = acteursParId[id], maj = {};
    Object.keys(c).forEach(k => { if (k !== "Nom_et_Prenom" && !String(a[k] || "").trim()) maj[k] = c[k]; });
    if (Object.keys(maj).length) completions.push({ id, maj }); else inchanges++;
  });
  return { creations, completions, inchanges };
}

async function importerContactsCsv(fichier) {
  const msg = document.getElementById("modale-acteurs-msg");
  try {
    const texte = lireFichierTexteAvecEncodage(await fichier.arrayBuffer());
    const contacts = contactsDepuisCsv(analyserCsvTexte(texte));
    if (!contacts.length) { if (msg) msg.textContent = "Import : aucun contact exploitable dans ce fichier (en-têtes attendus : Prénom;Nom;…;Email;…)."; return; }
    const plan = planImportContacts(contacts);
    const resume = plan.creations.length + " création(s), " + plan.completions.length + " contact(s) complété(s), " + plan.inchanges + " inchangé(s)";
    if (!plan.creations.length && !plan.completions.length) { if (msg) msg.textContent = "Import : rien à faire (" + resume + ")."; return; }
    if (!confirm("Importer " + contacts.length + " contact(s) ?\n" + resume + ".\nLes contacts existants sont seulement complétés (champs vides), jamais écrasés.")) return;
    const actions = plan.creations.map(c => ["AddRecord", TABLE_ACTEURS, null, c]).concat(plan.completions.map(x => ["UpdateRecord", TABLE_ACTEURS, x.id, x.maj]));
    for (let i = 0; i < actions.length; i += 100) await appliquerActions(actions.slice(i, i + 100));
    await chargerTablesAnnexes();
    rafraichirTableauGestionActeurs();
    if (msg) msg.textContent = "Import terminé : " + resume + ".";
  } catch (err) {
    console.error("Import CSV contacts :", err);
    if (msg) msg.textContent = "Erreur d'import : " + err.message;
  }
}

const btnExportContactsCsv = document.getElementById("btn-export-contacts-csv");
if (btnExportContactsCsv) btnExportContactsCsv.addEventListener("click", exporterContactsCsv);
const btnImportContactsCsv = document.getElementById("btn-import-contacts-csv");
const inputImportContactsCsv = document.getElementById("input-import-contacts-csv");
if (btnImportContactsCsv && inputImportContactsCsv) {
  btnImportContactsCsv.addEventListener("click", () => inputImportContactsCsv.click());
  inputImportContactsCsv.addEventListener("change", async () => {
    const f = inputImportContactsCsv.files && inputImportContactsCsv.files[0];
    inputImportContactsCsv.value = "";
    if (f) await importerContactsCsv(f);
  });
}

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
    objet: ligne ? String(ligne.Objet_de_la_demande || "").replace(/\s+/g, " ").trim() : "",
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
  const maintenant = epochDateDuJour();
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
  table.querySelectorAll("tbody tr[data-demande-id]").forEach(tr => {
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
      "<label title=\"" + escapeHtml(descriptionStatut(s)) + "\"><input type='checkbox' class='case-filtre-action-statut' value=\"" + escapeHtml(s) + "\"" +
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
  rechercheActionsTexte = "";
  const champRechercheActions = document.getElementById("champ-recherche-actions");
  if (champRechercheActions) champRechercheActions.value = "";
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

      const etaitDeplacable = th.getAttribute("draggable") === "true"; // un glisser-déposer natif supprimerait « pointerup »

      if (etaitDeplacable) th.setAttribute("draggable", "false");

      let termine = false;
      poignee.classList.add("active-resize");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      function onPointerMove(ev) {
        if (ev.buttons === 0) { onPointerUp(ev); return; } // bouton relâché sans évènement de fin
        const nouvelleLargeur = Math.max(50, Math.round(ev.clientX - rectTh.left));
        largeursObj[colName] = nouvelleLargeur;
        fnAppliquer();
      }

      function onPointerUp(ev) {
        if (termine) return; termine = true;
        try { poignee.releasePointerCapture(ev.pointerId); } catch (err) { /* ignoré */ }
        poignee.removeEventListener("pointermove", onPointerMove);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.removeEventListener(n, onPointerUp));
        document.removeEventListener("pointerup", onPointerUp);
        if (etaitDeplacable) th.setAttribute("draggable", "true");
        poignee.classList.remove("active-resize");
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setTimeout(() => { th.dataset.enTrainDeRedimensionner = "0"; }, 50);
      }

      poignee.addEventListener("pointermove", onPointerMove);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.addEventListener(n, onPointerUp));
      document.addEventListener("pointerup", onPointerUp);
    });
  });
}
initRedimensionnementColonnes("#table-actions thead .poignee", "data-col-action", largeursColonnesActions, appliquerLargeursColonnesActions);

// --- Onglet Rida : recherche globale et regroupement par demande (v86) ---
// La recherche porte sur tous les champs de la ligne RIDA (type, porteur, dates, description) ET de
// la demande liée (titre, objet, sponsor, parties prenantes, ...). Plusieurs mots = ET.
let rechercheActionsTexte = "";
let grouperActionsParDemande = false;
try { grouperActionsParDemande = window.localStorage.getItem("emergence_actions_grouper") === "1"; } catch (e) { /* stockage indisponible */ }
const groupesActionsReplies = new Set(); // ids de demandes dont le groupe est replié (session)
let cacheTexteDemandesActions = { lignes: null, acteurs: null, map: new Map() };

function rechercheActionsEstActive() {
  return rechercheActionsTexte.trim().length >= RECHERCHE_GLOBALE_MIN_CAR;
}

function texteRechercheDemandeSeule(demandeId) {
  const c = cacheTexteDemandesActions;
  if (c.lignes !== lignesEmergence || c.acteurs !== acteursParId) {
    cacheTexteDemandesActions = { lignes: lignesEmergence, acteurs: acteursParId, map: new Map() };
  }
  const map = cacheTexteDemandesActions.map;
  if (!map.has(demandeId)) {
    const l = lignesEmergence.find(x => x.id === demandeId);
    map.set(demandeId, l ? texteRechercheLigne(l, []) : "");
  }
  return map.get(demandeId);
}

function texteRechercheActionRida(r) {
  const morceaux = [LIBELLES_TYPE_RIDA[r.RIDA] || ""];
  for (const cle in r) {
    if (cleIgnoreeRecherche(cle) || cle === "ID2") continue;
    const t = valeurVersTexteRecherche(cle, r[cle]);
    if (t) morceaux.push(t);
  }
  return normaliserTexteRecherche(morceaux.join(" | ")) + " | " + texteRechercheDemandeSeule(idDepuisRef(r.ID2));
}

function mettreAJourCompteursRechercheActions(totalTrouvees, nbAffichees) {
  const compteur = document.getElementById("compteur-recherche-actions");
  const badge = document.getElementById("compteur-masques-recherche-actions");
  const btnEffacer = document.getElementById("btn-effacer-recherche-actions");
  if (!compteur) return;
  const saisie = rechercheActionsTexte.trim();
  if (btnEffacer) btnEffacer.style.display = saisie ? "" : "none";
  if (badge) { badge.style.display = "none"; badge.textContent = ""; }
  if (!saisie) { compteur.textContent = ""; return; }
  if (!rechercheActionsEstActive()) { compteur.textContent = RECHERCHE_GLOBALE_MIN_CAR + " caractères minimum"; return; }
  compteur.textContent = nbAffichees + " résultat" + (nbAffichees > 1 ? "s" : "");
  const masquees = totalTrouvees - nbAffichees;
  if (badge && masquees > 0) {
    badge.textContent = "+" + masquees + " masqué" + (masquees > 1 ? "s" : "") + " par les filtres";
    badge.title = masquees + " ligne" + (masquees > 1 ? "s" : "") + " de la recherche " + (masquees > 1 ? "sont écartées" : "est écartée") + " par les autres filtres actifs (type, statut, etc.) : ajuste-les pour les voir.";
    badge.style.display = "";
  }
}

function afficherTableauActions() {
  const corps = document.getElementById("corps-tableau-actions");
  let lignes = ridaToutes.map(r => {
    const demande = nomDemandeParId2(r.ID2);
    return Object.assign({}, r, {
      __titre: demande.titre,
      __objet: demande.objet,
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

  let totalTrouveesRecherche = lignes.length;
  if (rechercheActionsEstActive()) {
    const mots = normaliserTexteRecherche(rechercheActionsTexte).split(/\s+/).filter(Boolean);
    lignes = lignes.filter(r => {
      const texte = texteRechercheActionRida(r);
      return mots.every(m => texte.indexOf(m) !== -1);
    });
    totalTrouveesRecherche = lignes.length;
  }
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
    else if (triActionColonne === "objet") { vA = a.__objet; vB = b.__objet; }
    else if (triActionColonne === "sponsor") { vA = a.__sponsor; vB = b.__sponsor; }
    else if (triActionColonne === "organisation") { vA = a.__organisation; vB = b.__organisation; }
    else if (triActionColonne === "statut") { vA = rangStatut(a.__statut); vB = rangStatut(b.__statut); }
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
  mettreAJourCompteursRechercheActions(totalTrouveesRecherche, lignes.length);

  if (lignes.length === 0) {
    corps.innerHTML = "<tr><td colspan='11' class='chargement'>Aucune action trouvée.</td></tr>";
  } else {
    const htmlLigne = (r, groupe) => {
      const classeUrgence = classeUrgenceAction(r);
      const estInformation = r.RIDA === "I";
      return "<tr data-demande-id='" + (r.__demandeId || "") + "'" + (classeUrgence ? " class='" + classeUrgence + "'" : "") + ">" +
        // En mode groupé, les informations de la demande sont dans l'en-tête du groupe : on ne les répète pas.
        (groupe ? "<td></td><td></td><td></td><td></td><td></td>" :
        "<td title=\"" + escapeHtml(r.__titre) + "\">" + escapeHtml(r.__titre) + "</td>" +
        "<td title=\"" + escapeHtml(r.__objet) + "\">" + (r.__objet ? escapeHtml(r.__objet) : "—") + "</td>" +
        "<td class='editable-action-cell sponsor-action-editable' data-demande-id=\"" + (r.__demandeId || "") + "\" title=\"" + escapeHtml(r.__sponsor) + " (cliquer pour modifier)\">" + (r.__sponsor ? escapeHtml(r.__sponsor) : "—") + "</td>" +
        "<td title=\"" + escapeHtml(r.__organisation) + "\">" + (r.__organisation ? escapeHtml(r.__organisation) : "—") + "</td>" +
        "<td>" + (r.__statut ? badgeStatut(r.__statut) : "—") + "</td>") +
        "<td>" + escapeHtml(r.RIDA || "—") + "</td>" +
        "<td class='editable-action-cell porteur-action-editable' data-rida-id=\"" + r.id + "\" title=\"" + escapeHtml(r.Porteur || "") + " (cliquer pour modifier)\">" + (r.Porteur ? escapeHtml(r.Porteur) : "—") + "</td>" +
        "<td class='editable-action-cell date-action-editable' data-rida-id=\"" + r.id + "\" data-champ=\"Pour_le\" title=\"Cliquer pour modifier\">" + formaterDate(r.Pour_le) + "</td>" +
        "<td class='editable-action-cell date-action-editable" + (estInformation ? " date-action-non-editable" : "") + "' data-rida-id=\"" + r.id + "\" data-champ=\"Fait_le\" title=\"" +
          (estInformation ? "Fait le suit automatiquement Pour le pour une ligne de type Information" : "Cliquer pour modifier") + "\">" + formaterDate(r.Fait_le) + "</td>" +
        "<td title=\"Date de dernière modification de la ligne (automatique)\">" + formaterDateModifRida(r) + "</td>" +
        "<td class='editable-action-cell desc-action-editable' data-rida-id=\"" + r.id + "\" title=\"" + escapeHtml(r.Description || "") + " (cliquer pour modifier)\">" + escapeHtml(r.Description || "") + "</td>" +
        "</tr>";
    };
    if (grouperActionsParDemande) {
      // Un en-tête par demande (dans l'ordre d'apparition du tri courant), lignes dessous.
      const ordre = [];
      const parDemande = new Map();
      lignes.forEach(r => {
        const k = r.__demandeId || 0;
        if (!parDemande.has(k)) { parDemande.set(k, []); ordre.push(k); }
        parDemande.get(k).push(r);
      });
      const nbCol = Math.max(1, colonnesVisiblesActions.size);
      corps.innerHTML = ordre.map(k => {
        const rows = parDemande.get(k);
        const replie = groupesActionsReplies.has(k);
        const premiere = rows[0];
        // Informations de la demande (colonnes visibles) affichées une seule fois, sous l'en-tête.
        const infos = [];
        if (colonnesVisiblesActions.has("objet") && premiere.__objet) infos.push("<span class='rida-groupe-objet'>" + escapeHtml(premiere.__objet) + "</span>");
        if (colonnesVisiblesActions.has("sponsor") && premiere.__sponsor) infos.push("<span><i>Sponsor</i> " + escapeHtml(premiere.__sponsor) + "</span>");
        if (colonnesVisiblesActions.has("organisation") && premiere.__organisation) infos.push("<span><i>Organisation</i> " + escapeHtml(premiere.__organisation) + "</span>");
        const ligneInfos = (!replie && infos.length)
          ? "<tr class='rida-groupe-info' data-groupe-id='" + k + "'><td colspan='" + nbCol + "'>" + infos.join("") + "</td></tr>" : "";
        return "<tr class='rida-groupe' data-groupe-id='" + k + "'><td colspan='" + nbCol + "'>" +
          "<span class='rida-groupe-fleche'>" + (replie ? "▸" : "▾") + "</span> " +
          "<b>" + escapeHtml(premiere.__titre) + "</b> " +
          (premiere.__statut && colonnesVisiblesActions.has("statut") ? badgeStatut(premiere.__statut) + " " : "") +
          "<span class='rida-groupe-nb'>" + rows.length + " ligne" + (rows.length > 1 ? "s" : "") + "</span>" +
          (k ? " <a class='rida-groupe-ouvrir' data-demande-id='" + k + "' title='Ouvrir la fiche de la demande'>↗ ouvrir</a>" : "") +
          "</td></tr>" + ligneInfos + (replie ? "" : rows.map(r => htmlLigne(r, true)).join(""));
      }).join("");
      corps.querySelectorAll("tr.rida-groupe").forEach(tr => {
        tr.addEventListener("click", (e) => {
          const lien = e.target.closest(".rida-groupe-ouvrir");
          if (lien) {
            basculerVue("demandes");
            selectionnerLigne(parseInt(lien.getAttribute("data-demande-id"), 10));
            return;
          }
          const k = parseInt(tr.getAttribute("data-groupe-id"), 10);
          if (groupesActionsReplies.has(k)) groupesActionsReplies.delete(k); else groupesActionsReplies.add(k);
          afficherTableauActions();
        });
      });
    } else {
      corps.innerHTML = lignes.map(r => htmlLigne(r, false)).join("");
    }

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
  if (estLigneChangementEtat(ligneRida)) { afficherTableauActions(); return; } // ligne automatique : non modifiable
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
    if (c === "objet") return r.__objet;
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

// Champ de recherche globale + option « Grouper par demande » de l'onglet Rida.
(function initRechercheEtGroupeActions() {
  const champ = document.getElementById("champ-recherche-actions");
  const btn = document.getElementById("btn-effacer-recherche-actions");
  if (champ) {
    let minuteur = null;
    const appliquer = () => {
      rechercheActionsTexte = champ.value;
      afficherTableauActions();
    };
    champ.addEventListener("input", () => { clearTimeout(minuteur); minuteur = setTimeout(appliquer, 150); });
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && champ.value) { champ.value = ""; clearTimeout(minuteur); appliquer(); e.stopPropagation(); }
    });
    if (btn) btn.addEventListener("click", () => { champ.value = ""; clearTimeout(minuteur); appliquer(); champ.focus(); });
  }
  const chk = document.getElementById("chk-grouper-actions");
  const btnReplier = document.getElementById("btn-replier-groupes-actions");
  const majBoutonReplier = () => { if (btnReplier) btnReplier.style.display = grouperActionsParDemande ? "" : "none"; };
  if (chk) {
    chk.checked = grouperActionsParDemande;
    chk.addEventListener("change", () => {
      grouperActionsParDemande = chk.checked;
      try { window.localStorage.setItem("emergence_actions_grouper", grouperActionsParDemande ? "1" : "0"); } catch (e) { /* ignoré */ }
      majBoutonReplier();
      afficherTableauActions();
    });
  }
  if (btnReplier) {
    btnReplier.addEventListener("click", () => {
      const ids = [...new Set(lignesActionsAffichees.map(r => r.__demandeId || 0))];
      const toutReplie = ids.length > 0 && ids.every(k => groupesActionsReplies.has(k));
      if (toutReplie) groupesActionsReplies.clear(); else ids.forEach(k => groupesActionsReplies.add(k));
      btnReplier.textContent = toutReplie ? "⇕ Tout replier" : "⇕ Tout déplier";
      afficherTableauActions();
    });
  }
  majBoutonReplier();
})();

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
    planning: document.getElementById("vue-planning"),
    reporting: document.getElementById("vue-reporting"),
    ia: document.getElementById("vue-ia"),
    messages: document.getElementById("vue-messages")
  };
  const tags = {
    demandes: document.getElementById("tag-demandes"),
    actions: document.getElementById("tag-actions"),
    contacts: document.getElementById("tag-contacts"),
    planning: document.getElementById("tag-planning"),
    reporting: document.getElementById("tag-reporting"),
    ia: document.getElementById("tag-ia"),
    messages: document.getElementById("tag-messages")
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
  } else if (mode === "planning") {
    afficherPlanning();
  } else if (mode === "reporting") {
    afficherSousOngletReporting();
  } else if (mode === "ia") {
    afficherIa();
  } else if (mode === "messages") {
    ouvrirOngletMessages();
  }
}

document.getElementById("tag-demandes").addEventListener("click", () => basculerVue("demandes"));
document.getElementById("tag-actions").addEventListener("click", () => basculerVue("actions"));
document.getElementById("tag-contacts").addEventListener("click", () => basculerVue("contacts"));
document.getElementById("tag-reporting").addEventListener("click", () => basculerVue("reporting"));
document.getElementById("tag-planning").addEventListener("click", () => basculerVue("planning"));
document.getElementById("tag-ia").addEventListener("click", () => basculerVue("ia"));
document.getElementById("tag-messages").addEventListener("click", () => basculerVue("messages"));

// --- Reporting : 3 sous-onglets (v0.162) ---
// « Cette semaine » = reporting hebdomadaire ; « Aujourd'hui » = situation à date (statuts, porteurs, kanbans) ;
// « Évolution » = évolution dans le temps (actions par semaine, délais de traitement). L'ancien onglet Activité est absorbé.
let sousOngletReporting = "aujourdhui";
function afficherSousOngletReporting(choix) {
  if (choix) sousOngletReporting = choix;
  const panneaux = { semaine: "reporting-pane-semaine", aujourdhui: "reporting-pane-aujourdhui", evolution: "reporting-pane-evolution" }; // (« reporting-aujourdhui » est déjà le bouton Semaine en cours)
  Object.keys(panneaux).forEach(k => { const el = document.getElementById(panneaux[k]); if (el) el.style.display = k === sousOngletReporting ? "" : "none"; });
  document.querySelectorAll("#sous-onglets-reporting .sous-onglet-reporting").forEach(b => b.classList.toggle("actif", b.getAttribute("data-sous-onglet") === sousOngletReporting));
  if (sousOngletReporting === "semaine") afficherReporting(); else afficherActivite();
}
document.querySelectorAll("#sous-onglets-reporting .sous-onglet-reporting").forEach(b => b.addEventListener("click", () => afficherSousOngletReporting(b.getAttribute("data-sous-onglet"))));

// --- Graphiques de synthèse (sous-onglets Aujourd'hui et Évolution) ---

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

  // 3/ Demandes « Nouveau » ou « Accompagnement » sans aucune ligne RIDA de type Action (A).
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

// Parcours d'une demande (v0.162) : plan de métro. Ligne Émergence (statuts + jalons datés, nombre de demandes par statut),
// ligne BRM (entrants → Arbitrage → suivi hebdo en Compil, avec un point par semaine) et ligne Autres offres DTNUM.
// Coordonnées : 1 unité = 1/100 de pouce de la maquette (viewBox 1333 x 740).
function construireParcoursStatuts(statuts, comptages) {
  const n = {}; statuts.forEach((st, i) => { n[st] = comptages[i] || 0; });
  const coul = st => COULEURS_STATUT[st] || { fond: "#eee", texte: "#444" };
  const SC = 1.08, OX = 430, OY = 152;
  const X = x => OX + x * SC, Y = y => OY + (y + 30) * SC;
  const Yl = 153, YR = 277, XC = 735, XS = 530, XG = 240, XQ = 335, XA = 440, XE = 620;
  const INDIGO = "#1a1a9c", SLATE = "#1f2a44", AMB = "#b45309", GRY = "#6b7280";
  const Y0 = Math.round(Y(Yl));
  const etapes = [["Nouveau", 51], ["Contacter", 150], ["Qualifier", XQ], ["Accompagnement", XA], ["En cours de transfert", XE]];
  const libelle = st => st === "En cours de transfert" ? "Transfert" : st;
  const t = (x, y, txt, o) => { o = o || {};
    return "<text x='" + Math.round(x) + "' y='" + Math.round(y) + "' text-anchor='" + (o.a || "middle") + "' dominant-baseline='central' font-size='" + (o.fs || 18) + "'" +
      (o.b ? " font-weight='700'" : "") + (o.i ? " font-style='italic'" : "") + " fill='" + (o.c || "#333") + "'" + (o.ls ? " letter-spacing='" + o.ls + "'" : "") + ">" + escapeHtml(txt) + "</text>"; };
  const pill = (cx, cy, v, fond) => "<rect x='" + Math.round(cx - 25) + "' y='" + Math.round(cy - 13.5) + "' width='50' height='27' rx='13.5' fill='" + fond + "'/>" + t(cx, cy, String(v), { fs: 17, b: 1, c: "#2b2b2b" });
  const ligne = (x1, y1, x2, y2, c, w, dash) => "<line x1='" + Math.round(x1) + "' y1='" + Math.round(y1) + "' x2='" + Math.round(x2) + "' y2='" + Math.round(y2) + "' stroke='" + c + "' stroke-width='" + w + "'" + (dash ? " stroke-dasharray='" + dash + "'" : "") + "/>";
  const rond = (x, y, r, c, w, fill) => "<circle cx='" + Math.round(x) + "' cy='" + Math.round(y) + "' r='" + r + "' fill='" + (fill || "#fff") + "' stroke='" + c + "' stroke-width='" + w + "'/>";
  let g = "<svg viewBox='40 5 1275 665' width='100%' xmlns='http://www.w3.org/2000/svg' font-family='sans-serif' role='img' aria-label='Parcours d’une demande : ligne Émergence, ligne BRM, ligne Autres offres'>";
  g += "<rect x='430' y='140' width='875' height='445' rx='25' fill='#f6f7ff' stroke='" + INDIGO + "' stroke-width='2.8' stroke-dasharray='10 7'/>" + t(455, 163, "Process Émergence · projets et accompagnement", { a: "start", fs: 19, b: 1, i: 1, c: INDIGO });
  g += t(160, 214, "ENTRANTS", { a: "end", fs: 14, b: 1, c: GRY, ls: 2 });
  [["DN", 250], ["Mail Inno", 305], ["SDID", 395], ["MI & ATE", 450]].forEach(([nom, y]) => {
    g += "<path d='M160 " + y + " L200 " + y + " L265 " + Y0 + "' fill='none' stroke='" + SLATE + "' stroke-width='7' stroke-linejoin='round'/>" + rond(160, y, 11, SLATE, 4.5) + t(143, y, nom, { a: "end", fs: 18, b: 1, c: SLATE }); });
  g += "<path d='M335 " + (Y0 - 28) + " L335 115 Q335 85 365 85 L1235 85' fill='none' stroke='" + SLATE + "' stroke-width='9' stroke-linejoin='round'/>";
  for (let i = 0; i < 14; i++) g += rond(560 + i * 45, 85, 7, AMB, 3);
  g += "<rect x='420' y='70' width='105' height='30' rx='8' fill='" + SLATE + "'/>" + t(472, 85, "LIGNE BRM", { fs: 14, b: 1, c: "#fff" });
  g += rond(1235, 85, 20, AMB, 6.5) + "<path d='M1223 85 A12 12 0 1 1 1235 97' fill='none' stroke='" + AMB + "' stroke-width='4'/><path d='M1226 76 L1222 87 L1232 84 Z' fill='" + AMB + "'/>";
  g += t(1235, 30, "Suivi hebdo de l’avancement", { a: "end", fs: 19, b: 1, c: "#78350f" }) + t(1235, 54, "chaque semaine, en Compil", { a: "end", fs: 15, i: 1, c: "#78350f" });
  g += ligne(1235, 140, 1235, 118, AMB, 3, "6 4") + "<path d='M1235 108 L1228 120 L1242 120 Z' fill='" + AMB + "'/>";
  g += "<path d='M335 " + (Y0 + 28) + " L335 600 Q335 625 360 625 L460 625' fill='none' stroke='" + GRY + "' stroke-width='9' stroke-linejoin='round'/>" + rond(460, 625, 20, GRY, 6.5);
  g += t(500, 614, "Autres offres DTNUM", { a: "start", fs: 20, b: 1, c: "#374151" }) + t(500, 640, "N8N ; MIRAI API, Assistant IA, …", { a: "start", fs: 17, c: "#4b5563" });
  g += ligne(400, Y0, X(51), Y0, INDIGO, 11);
  g += "<rect x='265' y='" + (Y0 - 28) + "' width='140' height='56' rx='28' fill='#fff' stroke='" + SLATE + "' stroke-width='5.5'/>" + t(335, Y0, "Arbitrage BRM", { fs: 17, b: 1, c: SLATE });
  const xs = etapes.map(e => e[1]).concat([XG, XS]).sort((a, b) => a - b);
  xs.forEach(x => { g += ligne(X(x), Y(x === XS ? 94 : 228), X(x), Y(YR), "#b0b0bc", 2.7, "5 5"); });
  g += "<path d='M" + Math.round(X(51)) + " " + Math.round(Y(YR)) + " H" + Math.round(X(XC - 34)) + " Q" + Math.round(X(XC)) + " " + Math.round(Y(YR)) + " " + Math.round(X(XC)) + " " + Math.round(Y(243)) + " V" + Math.round(Y(173)) + "' fill='none' stroke='#b9b6cc' stroke-width='7.6' stroke-linecap='round'/>";
  xs.forEach(x => { g += rond(X(x), Y(YR), 7, "#b0b0bc", 3); });
  g += ligne(X(51), Y(Yl), X(XC), Y(Yl), INDIGO, 11);
  g += "<path d='M" + Math.round(X(XA + 13)) + " " + Math.round(Y(148)) + " C" + Math.round(X(XA + 58)) + " " + Math.round(Y(132)) + " " + Math.round(X(XS - 37)) + " " + Math.round(Y(78)) + " " + Math.round(X(XS)) + " " + Math.round(Y(78)) +
       " C" + Math.round(X(XS + 38)) + " " + Math.round(Y(78)) + " " + Math.round(X(XE - 53)) + " " + Math.round(Y(132)) + " " + Math.round(X(XE - 12)) + " " + Math.round(Y(148)) + "' fill='none' stroke='#1e7e34' stroke-width='7.6' stroke-dasharray='9 7' stroke-linecap='round'/>";
  // ligne vers Industrialisation (depuis Transfert)
  const VIO = "#6b21a8", xt = Math.round(X(XE));
  g += "<path d='M" + xt + " " + (Y0 - 18) + " Q" + xt + " 245 " + (xt + 40) + " 245 L1252 245' fill='none' stroke='" + VIO + "' stroke-width='9' stroke-linejoin='round'/>" + rond(1268, 245, 14, VIO, 5) + t(1292, 218, "Industrialisation", { a: "end", fs: 17, b: 1, c: VIO });
  [[51, "Entrée", "soumission"], [XG, "Go/NoGo", "Go/NoGo SDID"], [XQ, "1er atelier", "atelier RIDA"], [XA, "MVP", "MVP réalisée"]].forEach(([x, titre, sous]) => {
    const yd = Y(Yl - 60);
    g += ligne(X(x), Y(Yl - 15), X(x), Y(Yl - 52), "#6b7280", 1.8) + "<rect x='" + Math.round(X(x) - 12) + "' y='" + Math.round(yd - 12) + "' width='24' height='24' fill='" + INDIGO + "' transform='rotate(45 " + Math.round(X(x)) + " " + Math.round(yd) + ")'/>" +
      t(X(x), yd - 36, titre, { fs: 15, b: 1, c: INDIGO }) + t(X(x), yd - 55, sous, { fs: 13, i: 1, c: "#555a66" }); });
  etapes.forEach(([st, x]) => { const c = coul(st);
    g += rond(X(x), Y(Yl), 17, c.texte, 5.5) + t(X(x), Y(Yl) + 39, libelle(st), { fs: 16, b: 1, c: c.texte }) + pill(X(x), Y(Yl) + 73, n[st] || 0, c.fond); });
  g += "<circle cx='" + Math.round(X(XG)) + "' cy='" + Y0 + "' r='14' fill='" + INDIGO + "' stroke='#fff' stroke-width='3'/>" + t(X(XG), Y(Yl) + 36, "Comité", { fs: 18, b: 1, c: INDIGO }) + t(X(XG), Y(Yl) + 56, "émergence", { fs: 18, b: 1, c: INDIGO });
  const cs = coul("Support");
  g += rond(X(XS), Y(78), 17, cs.texte, 5.5) + t(X(XS), Y(78) - 50, "Support", { fs: 18, b: 1, c: cs.texte }) + t(X(XS), Y(78) - 30, "optionnel", { fs: 15, i: 1, c: cs.texte }) + pill(X(XS), Y(Yl) + 73, n["Support"] || 0, cs.fond);
  g += rond(X(XC), Y(Yl), 16, "#444", 8) + "<circle cx='" + Math.round(X(XC)) + "' cy='" + Y0 + "' r='8' fill='#444'/>" + t(X(XC), Y(Yl) - 41, "Clôturer", { fs: 18, b: 1, c: "#444" }) + pill(X(XC) + 50, Y(Yl), n["Clôturer"] || 0, "#e5e5e5");
  g += t(X(390), Y(YR) + 26, "Sortie possible à chaque étape vers Clôturer", { fs: 15, i: 1, c: "#666b78" });
  const ly = Math.round(Y(YR) + 62);
  g += ligne(460, ly, 505, ly, INDIGO, 8) + t(515, ly, "Parcours principal", { a: "start", fs: 15 }) + ligne(655, ly, 700, ly, "#1e7e34", 6.5, "9 7") + t(710, ly, "Étape optionnelle", { a: "start", fs: 15 }) +
       ligne(850, ly, 895, ly, "#b0b0bc", 2.7, "5 5") + t(905, ly, "Sortie vers Clôturer", { a: "start", fs: 15 }) +
       "<rect x='1045' y='" + (ly - 13) + "' width='40' height='26' rx='13' fill='#e5e5e5'/>" + t(1065, ly, "n", { fs: 15, b: 1, c: "#2b2b2b" }) + t(1095, ly, "Nb de demandes par statut", { a: "start", fs: 15 });
  return g + "</svg>";
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
  const parcours = document.getElementById("parcours-statuts");
  if (parcours) parcours.innerHTML = construireParcoursStatuts(donnees.statuts, donnees.comptagesStatuts);

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
  const totalStatuts = document.getElementById("activite-statuts-total");
  if (totalStatuts) { const t = donnees.comptagesStatuts.reduce((a, b) => a + b, 0); totalStatuts.textContent = "· " + t + " demande" + (t > 1 ? "s" : ""); }

  rafraichirKanban();
  afficherDelaisActivite();
}

// Kanban des demandes : une colonne par statut (dans l'ordre de COULEURS_STATUT), une carte par
// demande (titre + porteur et organisation en petit), colorée selon la priorité.
function classePrioriteKanban(priorite) {
  const code = String(priorite || "").trim().substring(0, 2).toUpperCase();
  return { P1: "kanban-p1", P2: "kanban-p2", P3: "kanban-p3" }[code] || "kanban-p0";
}

// --- Filtres du kanban (icône 🔎 dans le titre) : colonnes affichées, priorités, organisations,
// partie prenante. Ils ne concernent que l'affichage du kanban (pas l'export PDF). ---
const kanbanColonnesMasquees = new Set();   // statuts masqués
const kanbanPrioritesMasquees = new Set();  // "P1" | "P2" | "P3" | "" (sans priorité) masquées
const kanbanOrganisationsMasquees = new Set(); // organisations masquées ("" = sans organisation)
let kanbanFiltrePartiePrenante = "";

function codePrioriteKanban(priorite) {
  const code = String(priorite || "").trim().substring(0, 2).toUpperCase();
  return ["P1", "P2", "P3"].includes(code) ? code : "";
}
function kanbanFiltreActif() {
  return kanbanColonnesMasquees.size > 0 || kanbanPrioritesMasquees.size > 0 ||
    kanbanOrganisationsMasquees.size > 0 || !!kanbanFiltrePartiePrenante.trim();
}
function ligneCorrespondFiltreKanban(l) {
  if (kanbanPrioritesMasquees.has(codePrioriteKanban(l.Priorite))) return false;
  if (kanbanOrganisationsMasquees.has(l.Organisation || "")) return false;
  const q = normaliserTexteRecherche(kanbanFiltrePartiePrenante.trim());
  if (q) {
    const ids = nettoyerIdsActeurs(refListVersIds(l.Parties_prenantes_concernees).map(Number));
    if (!ids.some(id => normaliserTexteRecherche(ligneActeur(id)).indexOf(q) !== -1)) return false;
  }
  return true;
}
// Repli des kanban (v0.162) : seul le bandeau des colonnes (titre + compteur) reste visible.
const kanbansReplies = new Set(["kanban-activite", "kanban-jalons"]);   // repliés par défaut
function appliquerReplisKanban() {
  document.querySelectorAll(".btn-repli-kanban").forEach(b => {
    const cible = document.getElementById(b.dataset.cible);
    const replie = kanbansReplies.has(b.dataset.cible);
    if (cible) cible.classList.toggle("kanban-replie", replie);
    b.textContent = replie ? "▸" : "▾";
    b.setAttribute("aria-expanded", replie ? "false" : "true");
  });
}
document.querySelectorAll(".btn-repli-kanban").forEach(b => b.addEventListener("click", () => {
  if (kanbansReplies.has(b.dataset.cible)) kanbansReplies.delete(b.dataset.cible); else kanbansReplies.add(b.dataset.cible);
  appliquerReplisKanban();
}));

function rafraichirKanban() {
  const kanban = document.getElementById("kanban-activite");
  if (kanban) kanban.innerHTML = construireKanban();
  const jalons = document.getElementById("kanban-jalons");
  if (jalons) jalons.innerHTML = construireKanbanJalons();
  const btn = document.getElementById("btn-filtre-kanban");
  if (btn) btn.classList.toggle("filtre-actif", kanbanFiltreActif());
  const info = document.getElementById("kanban-filtre-info");
  if (info) {
    const total = lignesEmergence.length;
    const affichees = lignesEmergence.filter(ligneCorrespondFiltreKanban).length;
    info.textContent = kanbanFiltreActif() ? affichees + " / " + total + " demandes" : total + " demande" + (total > 1 ? "s" : "");
  }
  appliquerReplisKanban();
}

function fermerPopupFiltreKanban() {
  const p = document.querySelector(".popup-filtre-kanban");
  if (p) p.remove();
}

function contenuPopupFiltreKanban() {
  const cases = (classe, valeurs, estMasque, libelle) => valeurs.map(v =>
    "<label><input type='checkbox' class='" + classe + "' value=\"" + escapeHtml(v) + "\"" + (estMasque(v) ? "" : " checked") + ">" + libelle(v) + "</label>"
  ).join("");
  const organisations = [...new Set(lignesEmergence.map(l => l.Organisation || ""))].sort((a, b) => a.localeCompare(b));
  return "<button type='button' class='btn-supprimer-filtre kanban-reinit' style='display:" + (kanbanFiltreActif() ? "" : "none") + "'>✕ <span>Supprimer les filtres</span></button>" +
    "<div class='kanban-filtre-titre'>Colonnes affichées</div>" +
    cases("kf-colonne", Object.keys(COULEURS_STATUT), v => kanbanColonnesMasquees.has(v), v => "<span title=\"" + escapeHtml(descriptionStatut(v)) + "\">" + escapeHtml(v) + "</span>") +
    "<div class='kanban-filtre-titre'>Priorités affichées</div>" +
    cases("kf-priorite", ["P1", "P2", "P3", ""], v => kanbanPrioritesMasquees.has(v), v => v || "Sans priorité") +
    "<div class='kanban-filtre-titre'>Organisations affichées</div>" +
    "<div class='kanban-filtre-liste'>" + cases("kf-organisation", organisations, v => kanbanOrganisationsMasquees.has(v), v => v ? escapeHtml(v) : "Sans organisation") + "</div>" +
    "<div class='kanban-filtre-titre'>Partie prenante</div>" +
    "<input type='text' class='kf-pp' list='datalist-filtre-pp' value=\"" + escapeHtml(kanbanFiltrePartiePrenante) + "\" placeholder='Filtrer par partie prenante...'>";
}

function ouvrirPopupFiltreKanban(btn) {
  const dejaOuverte = !!document.querySelector(".popup-filtre-kanban");
  fermerPopupFiltreKanban();
  if (dejaOuverte) return;
  const popup = document.createElement("div");
  popup.className = "popup-filtre-action-colonne popup-filtre-kanban";
  popup.innerHTML = contenuPopupFiltreKanban();
  document.body.appendChild(popup);
  const r = btn.getBoundingClientRect();
  popup.style.top = (r.bottom + 4) + "px";
  let gauche = r.left;
  const largeur = popup.offsetWidth || 240;
  if (gauche + largeur > window.innerWidth - 8) gauche = Math.max(8, window.innerWidth - 8 - largeur);
  popup.style.left = gauche + "px";
  popup.addEventListener("click", (e) => e.stopPropagation());
  popup.addEventListener("pointerdown", (e) => e.stopPropagation());
  const maj = () => {
    rafraichirKanban();
    const reinit = popup.querySelector(".kanban-reinit");
    if (reinit) reinit.style.display = kanbanFiltreActif() ? "" : "none";
  };
  const lierCases = (classe, ensemble) => popup.querySelectorAll("." + classe).forEach(cb => {
    cb.addEventListener("change", () => { if (cb.checked) ensemble.delete(cb.value); else ensemble.add(cb.value); maj(); });
  });
  lierCases("kf-colonne", kanbanColonnesMasquees);
  lierCases("kf-priorite", kanbanPrioritesMasquees);
  lierCases("kf-organisation", kanbanOrganisationsMasquees);
  popup.querySelector(".kf-pp").addEventListener("input", (e) => { kanbanFiltrePartiePrenante = e.target.value; maj(); });
  popup.querySelector(".kanban-reinit").addEventListener("click", () => {
    kanbanColonnesMasquees.clear(); kanbanPrioritesMasquees.clear(); kanbanOrganisationsMasquees.clear();
    kanbanFiltrePartiePrenante = "";
    popup.innerHTML = contenuPopupFiltreKanban();
    // les cases sont recréées : on referme la popup (réouverture = état à jour)
    fermerPopupFiltreKanban();
    rafraichirKanban();
  });
}

const btnFiltreKanban = document.getElementById("btn-filtre-kanban");
if (btnFiltreKanban) {
  btnFiltreKanban.addEventListener("click", (e) => { e.stopPropagation(); ouvrirPopupFiltreKanban(btnFiltreKanban); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".popup-filtre-kanban")) fermerPopupFiltreKanban();
  });
}

function construireKanban() {
  const statuts = Object.keys(COULEURS_STATUT).filter(st => !kanbanColonnesMasquees.has(st));
  const connus = new Set(Object.keys(COULEURS_STATUT));
  const colonnes = statuts.map(st => ({ statut: st, lignes: [] }));
  const autres = { statut: "Autre / sans statut", lignes: [] };
  lignesEmergence.filter(ligneCorrespondFiltreKanban).forEach(l => {
    if (connus.has(l.Statut) && kanbanColonnesMasquees.has(l.Statut)) return;
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
      "<div class='kanban-colonne-titre' title=\"" + escapeHtml(descriptionStatut(col.statut)) + "\" style='background:" + c.fond + "; color:" + c.texte + ";'><span>" + escapeHtml(col.statut) + "</span><span>" + col.lignes.length + "</span></div>" +
      "<div class='kanban-cartes'>" + (cartes || "<div class='kanban-carte-detail' style='padding:4px;'>—</div>") + "</div></div>";
  }).join("");
}

// ===== Kanban par jalons (v0.162) =====
// Une demande = UNE colonne : celle du jalon le plus avancé atteint (Entrée → Go/NoGo → 1er atelier → MVP réalisée).
// Mêmes filtres que le kanban par statut. Sous chaque titre : durée moyenne / min / max (jours ouvrés) pour atteindre le
// jalon depuis le précédent, sur les demandes du périmètre ayant les deux dates (dates incohérentes ignorées).
const JALONS_KANBAN = [
  { cle: "entree", titre: "Entrée", sans: "sans Go/NoGo", fond: "#e0f2fe", texte: "#075985", de: null, vers: null },
  { cle: "gonogo", titre: "Go/NoGo", sans: "sans 1er atelier", fond: "#fef3c7", texte: "#92400e", de: "entree", vers: "gonogo" },
  { cle: "atelier", titre: "1er atelier", sans: "sans MVP", fond: "#ede9fe", texte: "#5b21b6", de: "gonogo", vers: "atelier" },
  { cle: "mvp", titre: "MVP réalisée", sans: "", fond: "#dcfce7", texte: "#166534", de: "atelier", vers: "mvp" }
];
function datesJalonsDemande(l) {
  return { entree: Number(l.Date_de_soumission) || 0, gonogo: Number(l.Date_Go_NoGo_SDID) || 0, atelier: Number(datePremierAtelier(l.id)) || 0, mvp: Number(l.Date_MVP_realisee) || 0 };
}
function jalonAtteint(d) { return d.mvp ? "mvp" : d.atelier ? "atelier" : d.gonogo ? "gonogo" : d.entree ? "entree" : null; }
function statsDureesJalon(lignes, de, vers) {
  const v = [];
  lignes.forEach(({ d }) => {
    // Sans date de 1er atelier mais avec une date de MVP : la durée se calcule depuis le Go/NoGo.
    const debut = (de === "atelier" && vers === "mvp" && !d.atelier) ? d.gonogo : d[de];
    if (debut && d[vers]) { const n = joursOuvresEntre(debut, d[vers]); if (n !== null) v.push(n); }
  });
  if (!v.length) return null;
  return { n: v.length, moy: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v) };
}
function construireKanbanJalons() {
  const perimetre = lignesEmergence.filter(l => !kanbanColonnesMasquees.has(l.Statut) && ligneCorrespondFiltreKanban(l)).map(l => ({ l, d: datesJalonsDemande(l) }));
  const sansDate = perimetre.filter(x => !jalonAtteint(x.d)).length;
  const info = document.getElementById("kanban-jalons-info");
  if (info) info.textContent = sansDate ? sansDate + " demande(s) sans aucune date, non affichée(s)" : "";
  const rang = (l) => l.Priorite ? String(l.Priorite).trim() : "P9";
  const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString("fr-FR");
  const colonnes = JALONS_KANBAN.map(j => {
    const lignes = perimetre.filter(x => jalonAtteint(x.d) === j.cle).map(x => x.l)
      .sort((a, b) => rang(a).localeCompare(rang(b)) || String(a.Titre || "").localeCompare(String(b.Titre || "")));
    const cartes = lignes.map(l => {
      const detail = [l.Porteurs, l.Organisation].filter(Boolean).join(" · ");
      return "<div class='kanban-carte " + classePrioriteKanban(l.Priorite) + "' data-id='" + l.id + "' title=\"" + escapeHtml((l.Titre || "Sans titre") + (l.Priorite ? " — " + l.Priorite : "")) + "\">" +
        "<div class='kanban-carte-titre'>" + escapeHtml(l.Titre || "Sans titre") + "</div>" +
        (detail ? "<div class='kanban-carte-detail'>" + escapeHtml(detail) + "</div>" : "") + "</div>";
    }).join("");
    return "<div class='kanban-colonne'><div class='kanban-colonne-titre kj-titre' style='background:" + j.fond + "; color:" + j.texte + ";'>" +
      "<div class='kj-titre-ligne'><span>" + escapeHtml(j.titre) + "</span><span>" + lignes.length + "</span></div>" +
      "<div class='kj-sans'>" + escapeHtml(j.sans) + "</div></div>" +
      "<div class='kanban-cartes'>" + (cartes || "<div class='kanban-carte-detail' style='padding:4px;'>—</div>") + "</div></div>";
  }).join("");
  // Durées de transition, « à cheval » sur la frontière entre deux colonnes (jalon précédent → jalon suivant).
  const ponts = JALONS_KANBAN.slice(1).map((j, k) => {
    const st = statsDureesJalon(perimetre, j.de, j.vers);
    const nomDe = JALONS_KANBAN[k].titre, nomVers = j.titre;
    const contenu = st
      ? "<b>⏱ moy. " + fmt(st.moy) + " j</b><span>min " + st.min + " · max " + st.max + " · " + st.n + " dem.</span>"
      : "<b>⏱</b><span>pas assez de dates</span>";
    return "<div class='kj-pont' style='left:calc((100% + 8px) * " + (k + 1) + " / 4 - 4px);' title=\"" + escapeHtml("Durée entre « " + nomDe + " » et « " + nomVers + " » (jours ouvrés, demandes ayant les deux dates" + (j.vers === "mvp" ? " ; sans date de 1er atelier, calcul depuis le Go/NoGo" : "") + ")") + "\">" + contenu + "</div>";
  }).join("");
  return "<div class='kj-interieur'><div class='kj-ponts'>" + ponts + "</div><div class='kj-grille'>" + colonnes + "</div></div>";
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

// ===== Export CSV de la liste des demandes (v0.162) =====
// Colonnes = colonnes affichées (dans l'ordre courant), lignes = demandes filtrées, dans l'ordre du tri.
// Séparateur « ; » + BOM UTF-8 pour une ouverture directe dans Excel français. Dates sans heure.
function echapperCsv(v) {
  const t = v === null || v === undefined ? "" : String(v);
  return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function valeurCsvColonne(ligne, col) {
  switch (col) {
    case "Priorite": return ligne.Priorite || "";
    case "Statut": return ligne.Statut || "";
    case "Date_de_derniere_modification": { const t = epochDerniereModifDemande(ligne.id); return t === null ? "" : formaterDate(t); }
    case "Activite_rida": { const a = (activiteRidaCache && activiteRidaCache.get(ligne.id)) || { sem: 0, mois: 0, avant: 0 };
      return "7 j : " + a.sem + " / 8-30 j : " + a.mois + " / avant : " + a.avant; }
    case "Date_de_soumission": case "Date_Go_NoGo_SDID": case "Date_MVP_previsionnelle": case "Date_MVP_realisee":
      return formaterDate(ligne[col]) || "";
    case "Date_1er_atelier": return formaterDate(datePremierAtelier(ligne.id)) || "";
    case "Organisation": return ligne.Organisation || "";
    case "Sponsor": return nomActeur(ligne.Sponsor) || "";
    case "Porteurs": return ligne.Porteurs || "";
    case "Titre": return ligne.Titre || "";
    case "Ref_BRM": return refBrm(ligne) || "";
    case "Ref_Emergence": return refDemande(ligne.id);
    case "Typologie_de_la_demande": return typologiesDeLigne(ligne).join(", ");
    case "Tag": return tagsDeLigne(ligne).join(", ");
    case "Parties_prenantes_concernees": return nomActeur(ligne.Parties_prenantes_concernees) || "";
    case "Action_ouverte": {
      const r = ridaAAfficherDansListe(ligne.id);
      if (!r) return "";
      const clos = r.RIDA === "A" && !!r.Fait_le;
      return [r.RIDA || "?", formaterDate(r.Pour_le), r.Porteur ? "(" + r.Porteur + ")" : "", clos ? "[Clos]" : "", r.Description || ""].filter(Boolean).join(" ");
    }
    default: return "";
  }
}
function construireCsvListe() {
  const cols = ORDRE_COLONNES.filter(c => c !== "Ppt" && colonnesVisibles.has(c));
  activiteRidaCache = activiteRidaParDemande();
  const lignes = trierLignes(appliquerFiltres(lignesEmergence));
  const rows = [cols.map(c => echapperCsv(LIBELLES_COLONNES[c] || c)).join(";")];
  for (const l of lignes) rows.push(cols.map(c => echapperCsv(valeurCsvColonne(l, c))).join(";"));
  return { texte: "\uFEFF" + rows.join("\r\n"), nbLignes: lignes.length };
}
function exporterListeCsv() {
  const { texte } = construireCsvListe();
  const d = new Date();
  const dateTxt = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  telechargerBlob(new Blob([texte], { type: "text/csv;charset=utf-8" }), "demandes_emergence_" + dateTxt + ".csv");
}
const btnExportCsvListe = document.getElementById("btn-export-csv-liste");
if (btnExportCsvListe) btnExportCsvListe.addEventListener("click", exporterListeCsv);

const btnExportPdfActivite = document.getElementById("btn-export-pdf-activite");
if (btnExportPdfActivite) btnExportPdfActivite.addEventListener("click", exporterPdfActivite);



// ===================== Onglet Planning =====================
// Planning hebdomadaire (lundi → dimanche) des éléments RIDA, placés au jour de leur date
// « Pour le » (à défaut « Fait le »). Filtres : types, porteur, partie prenante, titre,
// organisation, recherche générale, actions non terminées. Navigation semaine par semaine.
let planningDecalage = 0; // 0 = semaine en cours
const planningFiltres = { types: new Set(["A", "I", "D"]), porteur: "", partiePrenante: "", titre: "", organisation: "", general: "", actionsOuvertes: false };
const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function datePlanningRida(r) {
  if (typeof r.Pour_le === "number" && r.Pour_le) return r.Pour_le;
  if (typeof r.Fait_le === "number" && r.Fait_le) return r.Fait_le;
  return null;
}

function nomsPartiesPrenantesDemande(demandeId) {
  const l = lignesEmergence.find(x => x.id === demandeId);
  if (!l) return [];
  return nettoyerIdsActeurs(refListVersIds(l.Parties_prenantes_concernees).map(Number)).map(nomActeurParId);
}

function ridaPassePlanning(r) {
  const f = planningFiltres;
  if (estLigneJournalAuto(r)) return false;
  if (!f.types.has(r.RIDA)) return false;
  if (f.actionsOuvertes && r.RIDA === "A" && r.Fait_le) return false;
  if (f.porteur && (r.Porteur || "") !== f.porteur) return false;
  const demandeId = idDepuisRef(r.ID2);
  const d = nomDemandeParId2(r.ID2);
  const ligne = lignesEmergence.find(x => x.id === demandeId);
  const norm = normaliserTexteRecherche;
  if (f.organisation && ((ligne && ligne.Organisation) || "") !== f.organisation) return false;
  if (f.titre && norm(d.titre || "").indexOf(norm(f.titre)) === -1) return false;
  const pps = nomsPartiesPrenantesDemande(demandeId);
  if (f.partiePrenante && !pps.some(n => norm(n).indexOf(norm(f.partiePrenante)) !== -1)) return false;
  if (f.general) {
    const foin = norm([r.Description, r.Porteur, d.titre, d.objet, d.sponsor, d.organisation, d.statut, LIBELLES_TYPE_RIDA[r.RIDA]].concat(pps).join(" "));
    if (!f.general.split(/\s+/).filter(Boolean).every(mot => foin.indexOf(norm(mot)) !== -1)) return false;
  }
  return true;
}

function remplirListesFiltresPlanning() {
  const selP = document.getElementById("planning-porteur"), selO = document.getElementById("planning-organisation");
  const dl = document.getElementById("datalist-planning-pp");
  if (selP) {
    const porteurs = [...new Set(ridaToutes.map(r => r.Porteur).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selP.innerHTML = "<option value=''>Tous les porteurs</option>" + porteurs.map(v => "<option value=\"" + escapeHtml(v) + "\"" + (v === planningFiltres.porteur ? " selected" : "") + ">" + escapeHtml(v) + "</option>").join("");
  }
  if (selO) {
    const orgs = [...new Set(lignesEmergence.map(l => l.Organisation).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    selO.innerHTML = "<option value=''>Toutes les organisations</option>" + orgs.map(v => "<option value=\"" + escapeHtml(v) + "\"" + (v === planningFiltres.organisation ? " selected" : "") + ">" + escapeHtml(v) + "</option>").join("");
  }
  if (dl) dl.innerHTML = acteursTriesParNom.map(a => "<option value=\"" + escapeHtml(nomActeurParId(a.id)) + "\"></option>").join("");
}

function afficherPlanning() {
  const grille = document.getElementById("planning-grille");
  if (!grille) return;
  remplirListesFiltresPlanning();
  const lundi = lundiDeSemaineEpoch(aujourdHuiEpoch()) + planningDecalage * 7 * 24 * 3600;
  const dimanche = lundi + 6 * 24 * 3600;
  const lib = document.getElementById("planning-libelle-semaine");
  if (lib) lib.textContent = libelleSemaineReporting(lundi, dimanche, numeroSemaineIso(lundi)) + (planningDecalage === 0 ? " (en cours)" : "");
  const aujourdhui = aujourdHuiEpoch();
  const retenus = ridaToutes.filter(ridaPassePlanning);
  const sansDate = retenus.filter(r => !datePlanningRida(r)).length;
  const ordreType = { A: 0, D: 1, I: 2 };
  let total = 0;
  let html = "";
  for (let i = 0; i < 7; i++) {
    const jour = lundi + i * 24 * 3600;
    const items = retenus.filter(r => datePlanningRida(r) === jour)
      .sort((a, b) => (a.Fait_le ? 1 : 0) - (b.Fait_le ? 1 : 0) || (ordreType[a.RIDA] ?? 9) - (ordreType[b.RIDA] ?? 9) || String(nomDemandeParId2(a.ID2).titre).localeCompare(String(nomDemandeParId2(b.ID2).titre)));
    total += items.length;
    html += "<div class='planning-jour" + (jour === aujourdhui ? " planning-aujourdhui" : "") + (i >= 5 ? " planning-weekend" : "") + "'>" +
      "<div class='planning-jour-entete'>" + JOURS_COURTS[i] + " " + formaterDate(jour).slice(0, 5) + (items.length ? " <span class='planning-nb'>" + items.length + "</span>" : "") + "</div>" +
      (items.length ? items.map(r => {
        const d = nomDemandeParId2(r.ID2);
        const fait = !!r.Fait_le && r.RIDA !== "I";
        const sponsorDemande = String(d.sponsor || "").trim();
        return "<div class='planning-carte planning-type-" + escapeHtml(r.RIDA || "") + (fait ? " planning-fait" : "") + "' data-demande-id='" + (d.id || "") + "' title=\"" + escapeHtml((LIBELLES_TYPE_RIDA[r.RIDA] || "") + " — " + (d.titre || "") + (r.Porteur ? " — " + r.Porteur : "") + "\n" + (r.Description || "")) + "\">" +
          "<div class='planning-carte-tete'><span class='planning-carte-type'>" + escapeHtml(LIBELLES_TYPE_RIDA[r.RIDA] || r.RIDA || "—") + "</span>" + (fait ? "<span class='planning-carte-ok'>✓ fait</span>" : "") + "</div>" +
          // 2e ligne : titre de la demande (petit, gras) suivi du sponsor entre parenthèses ;
          // dernière ligne : porteur de la ligne RIDA.
          "<div class='planning-carte-titre'><b>" + escapeHtml(d.titre || "—") + "</b>" + (sponsorDemande ? " <span class='planning-carte-sponsor'>(" + escapeHtml(sponsorDemande) + ")</span>" : "") + "</div>" +
          "<div class='planning-carte-desc'>" + escapeHtml(r.Description || "(sans description)") + "</div>" +
          (r.Porteur ? "<div class='planning-carte-porteur'>" + escapeHtml(r.Porteur) + "</div>" : "") + "</div>";
      }).join("") : "<div class='planning-vide'>—</div>") + "</div>";
  }
  grille.innerHTML = html;
  const nb = document.getElementById("planning-compteur");
  if (nb) nb.textContent = total + " élément" + (total > 1 ? "s" : "") + " cette semaine" + (sansDate ? " · " + sansDate + " sans date (non affiché" + (sansDate > 1 ? "s" : "") + ")" : "");
  grille.querySelectorAll(".planning-carte[data-demande-id]").forEach(el => el.addEventListener("click", () => {
    const id = parseInt(el.getAttribute("data-demande-id"), 10);
    if (!id) return;
    basculerVue("demandes");
    selectionnerLigne(id);
  }));
}

(function initPlanning() {
  const $ = (id) => document.getElementById(id);
  if (!$("planning-grille")) return;
  $("planning-precedente").addEventListener("click", () => { planningDecalage--; afficherPlanning(); });
  $("planning-suivante").addEventListener("click", () => { planningDecalage++; afficherPlanning(); });
  $("planning-aujourdhui").addEventListener("click", () => { planningDecalage = 0; afficherPlanning(); });
  document.querySelectorAll(".planning-type-chk").forEach(cb => cb.addEventListener("change", () => {
    if (cb.checked) planningFiltres.types.add(cb.value); else planningFiltres.types.delete(cb.value);
    afficherPlanning();
  }));
  const lier = (id, cle, evt) => $(id).addEventListener(evt || "input", (e) => { planningFiltres[cle] = e.target.value; afficherPlanning(); });
  lier("planning-porteur", "porteur", "change");
  lier("planning-organisation", "organisation", "change");
  lier("planning-pp", "partiePrenante");
  lier("planning-titre", "titre");
  lier("planning-general", "general");
  $("planning-actions-ouvertes").addEventListener("change", (e) => { planningFiltres.actionsOuvertes = e.target.checked; afficherPlanning(); });
  $("planning-reset").addEventListener("click", () => {
    Object.assign(planningFiltres, { types: new Set(["A", "I", "D"]), porteur: "", partiePrenante: "", titre: "", organisation: "", general: "", actionsOuvertes: false });
    document.querySelectorAll(".planning-type-chk").forEach(cb => { cb.checked = true; });
    ["planning-pp", "planning-titre", "planning-general"].forEach(id => { $(id).value = ""; });
    $("planning-actions-ouvertes").checked = false;
    afficherPlanning();
  });
})();

// ===================== Onglet Reporting hebdomadaire =====================
// Résumé d'une semaine (lundi → dimanche) : les lignes RIDA faites dans la semaine (Actions,
// Informations, Décisions) et les Actions / Décisions prévues la semaine suivante (Pour le dans la
// semaine suivante, pas encore faites). Les lignes automatiques du journal des modifications
// (« Champ « X » modifié ») sont exclues. Regroupé par demande, exportable en PDF.
const JOURS_SEMAINE_S = 7 * 24 * 3600;
let reportingDecalageSemaines = 0; // 0 = semaine en cours, -1 = précédente, +1 = suivante
let reportingPorteur = "";         // "" = tous les porteurs

function numeroSemaineIso(epochLundi) {
  const d = new Date(epochLundi * 1000);
  const jeudi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3));
  const debutAnnee = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 1));
  return Math.ceil((((jeudi - debutAnnee) / 86400000) + 1) / 7);
}

function lundiReporting() {
  return lundiDeSemaineEpoch(aujourdHuiEpoch()) + reportingDecalageSemaines * JOURS_SEMAINE_S;
}

function estLigneJournalAuto(r) {
  return r.RIDA === "I" && (REGEX_LIGNE_JOURNAL.test(String(r.Description || "")) || estLigneChangementEtat(r));
}

// Regroupe des lignes RIDA par demande (statut puis titre) ; chaque groupe : { demande, lignes }.
function grouperLignesParDemande(lignes, cleDate) {
  const groupes = new Map();
  lignes.forEach(r => {
    const d = nomDemandeParId2(r.ID2);
    const k = d.id || 0;
    if (!groupes.has(k)) groupes.set(k, { demande: d, lignes: [] });
    groupes.get(k).lignes.push(r);
  });
  const liste = [...groupes.values()];
  liste.forEach(g => g.lignes.sort((a, b) => (a[cleDate] || 0) - (b[cleDate] || 0) || String(a.RIDA).localeCompare(String(b.RIDA))));
  liste.sort((a, b) => rangStatut(a.demande.statut) - rangStatut(b.demande.statut) || String(a.demande.titre).localeCompare(String(b.demande.titre)));
  return liste;
}

function comptagesParType(lignes) {
  return { A: lignes.filter(r => r.RIDA === "A").length, I: lignes.filter(r => r.RIDA === "I").length, D: lignes.filter(r => r.RIDA === "D").length };
}

function libelleComptages(c) {
  const morceaux = [];
  if (c.A) morceaux.push(c.A + " action" + (c.A > 1 ? "s" : ""));
  if (c.I) morceaux.push(c.I + " information" + (c.I > 1 ? "s" : ""));
  if (c.D) morceaux.push(c.D + " décision" + (c.D > 1 ? "s" : ""));
  return morceaux.join(" · ");
}

function calculerReporting() {
  const lundi = lundiReporting();
  const dimanche = lundi + 6 * 24 * 3600;
  const lundiSuivant = lundi + JOURS_SEMAINE_S;
  const dimancheSuivant = lundiSuivant + 6 * 24 * 3600;
  const utiles = ridaToutes.filter(r => !estLigneJournalAuto(r));
  const dansPorteur = (r) => !reportingPorteur || (r.Porteur || "") === reportingPorteur;
  const faitesToutes = utiles.filter(r => typeof r.Fait_le === "number" && r.Fait_le >= lundi && r.Fait_le < lundiSuivant);
  const prevuesToutes = utiles.filter(r => (r.RIDA === "A" || r.RIDA === "D") && !r.Fait_le &&
    typeof r.Pour_le === "number" && r.Pour_le >= lundiSuivant && r.Pour_le < lundiSuivant + JOURS_SEMAINE_S);
  const porteurs = [...new Set(faitesToutes.concat(prevuesToutes).map(r => r.Porteur || "").filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const faites = faitesToutes.filter(dansPorteur);
  const prevues = prevuesToutes.filter(dansPorteur);
  return {
    lundi, dimanche, lundiSuivant, dimancheSuivant, porteurs,
    numero: numeroSemaineIso(lundi), numeroSuivant: numeroSemaineIso(lundiSuivant),
    faites, prevues,
    groupesFaites: grouperLignesParDemande(faites, "Fait_le"),
    groupesPrevues: grouperLignesParDemande(prevues, "Pour_le")
  };
}

function libelleSemaineReporting(debut, fin, numero) {
  return "Semaine " + numero + " · du " + formaterDate(debut) + " au " + formaterDate(fin);
}

function htmlGroupesReporting(groupes, cleDate, libelleDate) {
  if (!groupes.length) return "<div class='reporting-vide'>Aucune ligne.</div>";
  return groupes.map(g => {
    const d = g.demande;
    return "<div class='reporting-groupe'>" +
      "<div class='reporting-groupe-entete' data-demande-id='" + (d.id || "") + "' title='Ouvrir la fiche de la demande'>" +
      "<b>" + escapeHtml(d.titre) + "</b> " + (d.statut ? badgeStatut(d.statut) : "") +
      "<span class='reporting-groupe-meta'>" + escapeHtml([d.sponsor, d.organisation].filter(Boolean).join(" · ")) + "</span></div>" +
      "<table class='reporting-lignes'><tbody>" +
      g.lignes.map(r =>
        "<tr><td class='reporting-type reporting-type-" + escapeHtml(r.RIDA || "") + "'>" + escapeHtml(LIBELLES_TYPE_RIDA[r.RIDA] || r.RIDA || "—") + "</td>" +
        "<td class='reporting-date'>" + formaterDate(r[cleDate]) + "</td>" +
        "<td class='reporting-porteur'>" + (r.Porteur ? escapeHtml(r.Porteur) : "—") + "</td>" +
        "<td class='reporting-description'>" + escapeHtml(r.Description || "") + "</td></tr>"
      ).join("") + "</tbody></table></div>";
  }).join("");
}

// --- Mouvements de la semaine (v0.162) : kanban, une demande par ligne ---
// Fenêtre : 1 semaine, 3 semaines ou 1 mois (30 jours) se terminant aujourd'hui (semaine en cours) ou le dimanche de la semaine affichée.
// Une demande y figure si elle est nouvelle (date d'entrée dans la fenêtre) ou si son statut a changé (lignes RIDA
// « Changement d'état »). Elle est placée dans la colonne de son statut actuel ; une flèche part du statut d'origine
// (date du dernier changement sur la flèche).
let periodeMouvementsJours = 7; // 7 = 1 semaine, 21 = 3 semaines, 30 = 1 mois
function fenetreMouvementsReporting() {
  const fin = reportingDecalageSemaines === 0 ? aujourdHuiEpoch() : lundiReporting() + 6 * 24 * 3600;
  return { debut: fin - (periodeMouvementsJours - 1) * 24 * 3600, fin };
}
function dateCourteMouvement(epoch) {
  const d = new Date(epoch * 1000);
  return String(d.getUTCDate()).padStart(2, "0") + "/" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
function calculerMouvementsSemaine() {
  const { debut, fin } = fenetreMouvementsReporting();
  const parDemande = new Map();
  ridaToutes.filter(r => estLigneChangementEtat(r) && typeof r.Pour_le === "number" && r.Pour_le >= debut && r.Pour_le <= fin)
    .sort((a, b) => a.Pour_le - b.Pour_le || a.id - b.id)
    .forEach(r => { const id = idDepuisRef(r.ID2); if (!parDemande.has(id)) parDemande.set(id, []); parDemande.get(id).push(r); });
  const mouvements = [];
  lignesEmergence.forEach(l => {
    const nouvelle = typeof l.Date_de_soumission === "number" && l.Date_de_soumission >= debut && l.Date_de_soumission <= fin;
    const lignes = parDemande.get(l.id) || [];
    const actuel = normaliserStatut(l.Statut) || STATUT_NOUVEAU;
    let origine = null, dateChangement = null;
    if (lignes.length) {
      origine = normaliserStatut(REGEX_CHANGEMENT_ETAT.exec(lignes[0].Description)[1]);
      dateChangement = lignes[lignes.length - 1].Pour_le;
      if (origine === actuel) origine = null; // aller-retour : retour au point de départ
    }
    if (!nouvelle && !origine) return;
    mouvements.push({ ligne: l, nouvelle, origine, actuel, date: origine ? dateChangement : l.Date_de_soumission, dateEntree: l.Date_de_soumission });
  });
  mouvements.sort((a, b) => (b.date || 0) - (a.date || 0) || b.ligne.id - a.ligne.id);
  return { debut, fin, mouvements };
}
function detailsMouvement(m) {
  const l = m.ligne;
  const sponsor = nomActeurParId(Number(l.Sponsor)) || "";
  const parties = refListVersIds(l.Parties_prenantes_concernees).map(Number).map(nomActeurParId).filter(Boolean).join(", ");
  const rows = [refDemande(l.id) + " — " + (l.Titre || "Sans titre")];
  if (m.origine) rows.push("Statut : " + m.origine + " → " + m.actuel + " (le " + formaterDate(m.date) + ")"); else rows.push("Statut : " + m.actuel);
  if (m.nouvelle) rows.push("Nouvelle demande, entrée le " + formaterDate(m.dateEntree));
  if (l.Organisation) rows.push("Organisation : " + l.Organisation);
  if (sponsor) rows.push("Sponsor : " + sponsor);
  if (l.Porteurs) rows.push("Porteur(s) : " + String(l.Porteurs).trim());
  if (parties) rows.push("Parties prenantes : " + parties);
  if (l.Priorite) rows.push("Priorité : " + l.Priorite);
  const syn = String(l.Synthese_de_la_demande || "").replace(/\s+/g, " ").trim();
  if (syn) rows.push("Synthèse : " + (syn.length > 200 ? syn.slice(0, 197) + "…" : syn));
  return rows.join("\n");
}
function htmlMouvementsSemaine() {
  const { debut, fin, mouvements } = calculerMouvementsSemaine();
  const noms = STATUTS.map(st => st.nom);
  const n = noms.length;
  const entete = "<div class='rk-ligne rk-entete'>" + noms.map(nm => "<div class='rk-col-titre'>" + badgeStatut(nm) + "</div>").join("") + "</div>";
  const lignes = mouvements.map(m => {
    const col = Math.max(0, noms.indexOf(m.actuel));
    const coul = COULEURS_STATUT[m.actuel] || { fond: "#eee", texte: "#333" };
    let fleche = "";
    if (m.origine && noms.indexOf(m.origine) >= 0 && noms.indexOf(m.origine) !== col) {
      const de = noms.indexOf(m.origine);
      const k = Math.abs(col - de), part = 100 / (k + 1);
      const retour = de > col;
      const style = retour
        ? "grid-column:" + (col + 1) + " / " + (de + 2) + ";--rk-g:" + part + "%;--rk-d:" + (part / 2) + "%"
        : "grid-column:" + (de + 1) + " / " + (col + 2) + ";--rk-g:" + (part / 2) + "%;--rk-d:" + part + "%";
      const c = (COULEURS_STATUT[m.origine] || coul).texte;
      fleche = "<div class='rk-fleche" + (retour ? " rk-retour" : "") + "' style='" + style + ";color:" + coul.texte + "' title='" + escapeHtml(m.origine + " → " + m.actuel + " le " + formaterDate(m.date)) + "'>" +
        "<span class='rk-fleche-date'>" + dateCourteMouvement(m.date) + "</span></div>";
    }
    const info = (m.nouvelle ? "＋ " : "");
    const infoDate = (m.nouvelle && !fleche) ? "<span class='rk-carte-date'>" + dateCourteMouvement(m.dateEntree) + "</span>" : "";
    const titre = refDemande(m.ligne.id) + " " + (m.ligne.Titre || "Sans titre");
    return "<div class='rk-ligne'>" + fleche +
      "<div class='rk-carte' data-demande-id='" + m.ligne.id + "' style='grid-column:" + (col + 1) + ";background:" + coul.fond + ";color:" + coul.texte + "' title=\"" + escapeHtml(detailsMouvement(m)) + "\">" +
      "<span class='rk-carte-texte'>" + info + "<b>" + escapeHtml(refDemande(m.ligne.id)) + "</b> " + escapeHtml(m.ligne.Titre || "Sans titre") + "</span>" + infoDate + "</div></div>";
  }).join("");
  const nbNouv = mouvements.filter(m => m.nouvelle).length, nbChg = mouvements.filter(m => m.origine).length;
  const choix = [[7, "1 semaine"], [21, "3 semaines"], [30, "1 mois"]];
  const libPeriode = (choix.find(c => c[0] === periodeMouvementsJours) || choix[0])[1];
  return "<section class='reporting-section reporting-mouvements'>" +
    "<div class='rk-bandeau'><h2>Mouvements des demandes — " + libPeriode + "</h2>" +
    "<label class='rk-periode'>Période <select id='rk-periode'>" +
    choix.map(c => "<option value='" + c[0] + "'" + (c[0] === periodeMouvementsJours ? " selected" : "") + ">" + c[1] + "</option>").join("") + "</select></label>" +
    "<span class='rk-dates'>du " + formaterDate(debut) + " au " + formaterDate(fin) + "</span></div>" +
    "<div class='reporting-total'>" + mouvements.length + " demande" + (mouvements.length > 1 ? "s" : "") + " · " + nbNouv + " nouvelle" + (nbNouv > 1 ? "s" : "") + " · " + nbChg + " changement" + (nbChg > 1 ? "s" : "") + " d'état</div>" +
    (mouvements.length ? "<div class='rk' style='--rk-n:" + n + "'>" + entete + lignes + "</div>" : "<div class='reporting-vide'>Aucun mouvement sur la période.</div>") + "</section>" +
    "<div class='reporting-bloc-titre'>Liste des actions RIDA</div>";
}

function afficherReporting() {
  const conteneur = document.getElementById("contenu-reporting");
  if (!conteneur) return;
  const r = calculerReporting();
  const sel = document.getElementById("reporting-porteur");
  if (sel) {
    const valeurs = r.porteurs.slice();
    if (reportingPorteur && !valeurs.includes(reportingPorteur)) valeurs.push(reportingPorteur);
    sel.innerHTML = "<option value=''>Tous les porteurs</option>" +
      valeurs.map(v => "<option value=\"" + escapeHtml(v) + "\"" + (v === reportingPorteur ? " selected" : "") + ">" + escapeHtml(v) + "</option>").join("");
  }
  const lib = document.getElementById("reporting-libelle-semaine");
  if (lib) lib.textContent = libelleSemaineReporting(r.lundi, r.dimanche, r.numero) +
    (reportingDecalageSemaines === 0 ? " (en cours)" : "");
  const cF = libelleComptages(comptagesParType(r.faites));
  const cP = libelleComptages(comptagesParType(r.prevues));
  conteneur.innerHTML = htmlMouvementsSemaine() +
    "<section class='reporting-section'><h2>Réalisé — " + escapeHtml(libelleSemaineReporting(r.lundi, r.dimanche, r.numero)) + "</h2>" +
    "<div class='reporting-total'>" + (cF || "Rien de réalisé cette semaine") + " · " + r.groupesFaites.length + " demande" + (r.groupesFaites.length > 1 ? "s" : "") + "</div>" +
    htmlGroupesReporting(r.groupesFaites, "Fait_le") + "</section>" +
    "<section class='reporting-section'><h2>Prévu — " + escapeHtml(libelleSemaineReporting(r.lundiSuivant, r.dimancheSuivant, r.numeroSuivant)) + "</h2>" +
    "<div class='reporting-total'>" + (cP || "Rien de prévu la semaine suivante") + " · " + r.groupesPrevues.length + " demande" + (r.groupesPrevues.length > 1 ? "s" : "") + "</div>" +
    htmlGroupesReporting(r.groupesPrevues, "Pour_le") + "</section>";
  afficherSyntheseReporting();
  const selPeriode = document.getElementById("rk-periode");
  if (selPeriode) selPeriode.addEventListener("change", () => { periodeMouvementsJours = parseInt(selPeriode.value, 10) || 7; afficherReporting(); });
  conteneur.querySelectorAll(".rk-carte[data-demande-id"+"], .reporting-groupe-entete[data-demande-id]").forEach(el => {
    el.addEventListener("click", () => {
      const id = parseInt(el.getAttribute("data-demande-id"), 10);
      if (!id) return;
      basculerVue("demandes");
      selectionnerLigne(id);
    });
  });
}

(function initReporting() {
  const prec = document.getElementById("reporting-precedente");
  const suiv = document.getElementById("reporting-suivante");
  const auj = document.getElementById("reporting-aujourdhui");
  const sel = document.getElementById("reporting-porteur");
  if (prec) prec.addEventListener("click", () => { reportingDecalageSemaines--; afficherReporting(); });
  if (suiv) suiv.addEventListener("click", () => { reportingDecalageSemaines++; afficherReporting(); });
  if (auj) auj.addEventListener("click", () => { reportingDecalageSemaines = 0; afficherReporting(); });
  if (sel) sel.addEventListener("change", () => { reportingPorteur = sel.value; afficherReporting(); });
  const btnPdf = document.getElementById("btn-export-pdf-reporting");
  if (btnPdf) btnPdf.addEventListener("click", exporterPdfReporting);
  const btnSynth = document.getElementById("reporting-synthese-btn");
  if (btnSynth) btnSynth.addEventListener("click", genererSyntheseReporting);
})();

function construirePdfReporting() {
  const donnees = calculerReporting();
  const pdf = creerEcrivainPdf();
  const L = pdf.LARGEUR, H = pdf.HAUTEUR, MARGE = 28, BAS = H - 34;
  const BLEU = "#1a3a6b", GRIS = "#6b7280";
  const maintenant = new Date();
  const dateTexte = formaterDate(Math.floor(Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()) / 1000));
  const sousTitre = libelleSemaineReporting(donnees.lundi, donnees.dimanche, donnees.numero) +
    (reportingPorteur ? " · Porteur : " + reportingPorteur : "");
  const X_TYPE = MARGE + 8, X_DATE = MARGE + 78, X_PORTEUR = MARGE + 142, X_DESC = MARGE + 282;
  const W_DESC = L - MARGE - 8 - X_DESC, W_PORTEUR = X_DESC - X_PORTEUR - 8;
  const TAILLE = 8.5, INTERLIGNE = 10.5;
  let y = 0;

  function nouvellePage(suite) {
    pdf.nouvellePage();
    pdf.rect(0, 0, L, 50, { fill: BLEU });
    pdf.texte(MARGE, 31, "Émergence — Reporting hebdomadaire" + (suite ? " (suite)" : ""), { taille: 18, gras: true, couleur: "#ffffff" });
    pdf.texte(L - MARGE, 22, "Édité le " + dateTexte, { taille: 9, couleur: "#dbe4f5", align: "right" });
    pdf.texte(L - MARGE, 36, sousTitre, { taille: 9, couleur: "#dbe4f5", align: "right" });
    y = 66;
  }
  function assurerPlace(hauteur, titreSection) {
    if (y + hauteur > BAS) {
      nouvellePage(true);
      if (titreSection) { pdf.texte(MARGE, y + 10, titreSection + " (suite)", { taille: 10.5, gras: true, couleur: BLEU }); y += 20; }
    }
  }
  function section(titre, sousLibelle, groupes, cleDate) {
    assurerPlace(60, null);
    pdf.rect(MARGE, y, L - 2 * MARGE, 20, { fill: "#e8edfb" });
    pdf.texte(MARGE + 8, y + 14, titre, { taille: 11, gras: true, couleur: BLEU });
    pdf.texte(L - MARGE - 8, y + 14, sousLibelle, { taille: 8.5, couleur: GRIS, align: "right" });
    y += 28;
    if (!groupes.length) {
      pdf.texte(MARGE + 8, y + 8, "Aucune ligne.", { taille: 9, couleur: "#9ca3af" });
      y += 22;
      return;
    }
    groupes.forEach(g => {
      const d = g.demande;
      const enteteH = 17;
      const lignesPrep = g.lignes.map(r => ({
        r,
        desc: pdf.decouper(r.Description || "", W_DESC, TAILLE, false, 8),
        porteur: pdf.decouper(r.Porteur || "—", W_PORTEUR, TAILLE, false, 2)
      }));
      const hauteurLigne = (l) => Math.max(l.desc.length, l.porteur.length, 1) * INTERLIGNE + 5;
      assurerPlace(enteteH + hauteurLigne(lignesPrep[0]), titre);
      pdf.rect(MARGE, y, L - 2 * MARGE, enteteH, { fill: "#f3f4f6" });
      const titreGroupe = pdf.decouper(d.titre, 430, 9.5, true, 1)[0] || "";
      pdf.texte(MARGE + 8, y + 12, titreGroupe, { taille: 9.5, gras: true });
      const c = COULEURS_STATUT[d.statut];
      const meta = [d.statut, d.sponsor, d.organisation].filter(Boolean).join(" · ");
      pdf.texte(L - MARGE - 8, y + 12, pdf.decouper(meta, 330, 8, false, 1)[0] || "", { taille: 8, couleur: c ? c.texte : GRIS, align: "right" });
      y += enteteH;
      lignesPrep.forEach(l => {
        const h = hauteurLigne(l);
        assurerPlace(h, titre);
        const typeCouleur = l.r.RIDA === "A" ? "#c2570c" : l.r.RIDA === "D" ? "#6b21a8" : "#1e40af";
        pdf.texte(X_TYPE, y + 11, LIBELLES_TYPE_RIDA[l.r.RIDA] || l.r.RIDA || "—", { taille: TAILLE, gras: true, couleur: typeCouleur });
        pdf.texte(X_DATE, y + 11, formaterDate(l.r[cleDate]), { taille: TAILLE });
        l.porteur.forEach((t, i) => pdf.texte(X_PORTEUR, y + 11 + i * INTERLIGNE, t, { taille: TAILLE }));
        l.desc.forEach((t, i) => pdf.texte(X_DESC, y + 11 + i * INTERLIGNE, t, { taille: TAILLE }));
        pdf.ligne(MARGE, y + h, L - MARGE, y + h, { couleur: "#e5e7eb", lw: 0.4 });
        y += h;
      });
      y += 8;
    });
  }

  nouvellePage(false);
  if (reportingSynthese.texte && reportingSynthese.cle === cleReportingCourante()) {
    pdf.rect(MARGE, y, L - 2 * MARGE, 20, { fill: "#ede9fe" });
    pdf.texte(MARGE + 8, y + 14, "Synthèse", { taille: 11, gras: true, couleur: "#5b21b6" });
    y += 28;
    reportingSynthese.texte.split(/\r?\n/).forEach(par => {
      const lignes = par.trim() ? pdf.decouper(par, L - 2 * MARGE - 16, 9, false, 40) : [""];
      lignes.forEach(t => {
        assurerPlace(13, null);
        if (t) pdf.texte(MARGE + 8, y + 9, t, { taille: 9 });
        y += 12.5;
      });
    });
    y += 10;
  }
  const cF = libelleComptages(comptagesParType(donnees.faites));
  const cP = libelleComptages(comptagesParType(donnees.prevues));
  section("Réalisé — " + libelleSemaineReporting(donnees.lundi, donnees.dimanche, donnees.numero),
    cF || "Rien de réalisé", donnees.groupesFaites, "Fait_le");
  section("Prévu — " + libelleSemaineReporting(donnees.lundiSuivant, donnees.dimancheSuivant, donnees.numeroSuivant),
    cP || "Rien de prévu", donnees.groupesPrevues, "Pour_le");

  const n = pdf.nombrePages();
  for (let i = 0; i < n; i++) {
    pdf.surPage(i);
    pdf.texte(L - MARGE, H - 14, "Page " + (i + 1) + " / " + n, { taille: 8, couleur: GRIS, align: "right" });
  }
  return { pdf, dateTexte, donnees };
}

function genererOctetsPdfReporting() {
  const { pdf, donnees } = construirePdfReporting();
  return pdf.finir("Émergence — Reporting semaine " + donnees.numero);
}

function exporterPdfReporting() {
  const btn = document.getElementById("btn-export-pdf-reporting");
  const msg = document.getElementById("msg-export-pdf-reporting");
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "Génération du PDF…";
  try {
    const octets = genererOctetsPdfReporting();
    const d = calculerReporting();
    const nom = "reporting_emergence_S" + String(d.numero).padStart(2, "0") + "_" + new Date(d.lundi * 1000).toISOString().slice(0, 10) + ".pdf";
    telechargerBlob(new Blob([octets], { type: "application/pdf" }), nom);
    if (msg) msg.textContent = "PDF généré.";
  } catch (e) {
    console.error("Export PDF reporting :", e);
    if (msg) msg.textContent = "Erreur : " + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}




// ===================== Images collées dans les champs markdown =====================
// Ctrl+V d'une image (ou glisser-déposer d'un fichier image) dans un champ markdown : l'image réduite
// est enregistrée en base64 dans la table Emergence_Images et insérée dans le texte sous la forme
// ![image](image:ID). Si l'enregistrement échoue, l'erreur est affichée et le base64 dans le texte est
// proposé (bouton). Les anciennes images ![image](attachment:ID) restent affichées.
let jetonAttachments = null; // { token, base, exp }

async function obtenirJetonAttachments(forcer) {
  if (!forcer && jetonAttachments && jetonAttachments.exp > Date.now() + 15000) return jetonAttachments;
  const r = await grist.docApi.getAccessToken({ readOnly: true });
  jetonAttachments = { token: r.token, base: r.baseUrl, exp: Date.now() + (r.ttlMsecs || 60000) };
  return jetonAttachments;
}

async function urlAttachment(id, forcerJeton) {
  try {
    const j = await obtenirJetonAttachments(forcerJeton);
    return j.base + "/attachments/" + id + "/download?auth=" + encodeURIComponent(j.token);
  } catch (e) {
    return GRIST_BASE_URL + "/api/docs/" + DOC_ID + "/attachments/" + id + "/download"; // repli : session du navigateur
  }
}

// Images de la table Emergence_Images : chargée une fois (mise en cache), rechargée si un id manque.
let imagesCache = null;
let imagesChargement = null;
function chargerImagesTable(forcer) {
  if (!forcer && imagesCache) return Promise.resolve(imagesCache);
  if (imagesChargement) return imagesChargement;
  imagesChargement = (async () => {
    const t = await grist.docApi.fetchTable(TABLE_IMAGES);
    const m = new Map();
    (t.id || []).forEach((id, i) => m.set(id, (t.Donnees || [])[i]));
    imagesCache = m;
    return m;
  })().finally(() => { imagesChargement = null; });
  return imagesChargement;
}

async function resoudreImageTable(img) {
  const id = Number(img.getAttribute("data-img"));
  try {
    let m = await chargerImagesTable(false);
    if (!m.has(id)) m = await chargerImagesTable(true);
    if (m.has(id) && m.get(id)) { img.src = m.get(id); return; }
    img.alt = img.alt || "image introuvable"; img.title = "Image " + id + " introuvable dans " + TABLE_IMAGES;
  } catch (e) {
    img.title = "Table " + TABLE_IMAGES + " illisible : " + e.message;
  }
}

async function resoudreImagesAttachments(racine) {
  const imgs = (racine || document).querySelectorAll("img[data-att]:not([data-resolu]), img[data-img]:not([data-resolu])");
  for (const img of imgs) {
    img.setAttribute("data-resolu", "1");
    if (img.hasAttribute("data-img")) { resoudreImageTable(img); continue; }
    const id = img.getAttribute("data-att");
    let reessaye = false;
    img.addEventListener("error", async () => {
      if (reessaye) return;
      reessaye = true; // jeton expiré : un seul nouvel essai avec un jeton frais
      img.src = await urlAttachment(id, true);
    });
    img.src = await urlAttachment(id, false);
  }
}
new MutationObserver((mutations) => {
  if (mutations.some(m => m.addedNodes.length)) resoudreImagesAttachments(document);
}).observe(document.body, { childList: true, subtree: true });

function agrandirImageMarkdown(img) {
  const fond = document.createElement("div");
  fond.className = "lightbox-image-md";
  fond.innerHTML = "<img>";
  fond.querySelector("img").src = img.src;
  fond.addEventListener("click", () => fond.remove());
  document.body.appendChild(fond);
}

// Réduit une image trop grande (> 1600 px de large) en JPEG ; sans canvas ou si déjà raisonnable : fichier d'origine.
async function reduireImage(fichier) {
  try {
    if (!fichier.type.startsWith("image/") || fichier.type === "image/gif") return fichier;
    const url = URL.createObjectURL(fichier);
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    URL.revokeObjectURL(url);
    const MAX = 1600;
    if (img.width <= MAX && fichier.size < 1500000) return fichier;
    const k = Math.min(1, MAX / img.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(ok => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], (fichier.name || "image").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : fichier;
  } catch (e) { return fichier; }
}

// Envoi d'un fichier dans les pièces jointes du document : l'API des widgets Grist n'a pas de méthode
// d'envoi, on passe par l'API REST avec un jeton d'accès en écriture (POST {baseUrl}/attachments,
// champ multipart « upload »). Si le runtime fournit uploadAttachment, il est utilisé en priorité.
function fichierVersDataUrl(fichier) {
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(fichier); });
}

function insererTexteDansTextarea(ta, texte) {
  const d = ta.selectionStart, f = ta.selectionEnd;
  ta.value = ta.value.slice(0, d) + texte + ta.value.slice(f);
  ta.selectionStart = ta.selectionEnd = d + texte.length;
}

// Enregistre l'image (déjà réduite) dans la table Emergence_Images et renvoie l'id de la ligne.
async function enregistrerImageDansTable(reduit, nom, ligneId) {
  try {
    const tables = await grist.docApi.listTables();
    if (Array.isArray(tables) && !tables.includes(TABLE_IMAGES)) throw new Error("absente");
  } catch (e) {
    if (e.message === "absente") throw new Error("la table " + TABLE_IMAGES + " n'existe pas : lancez l'outil « Création de la table Emergence_Images »");
  }
  const dataUrl = await fichierVersDataUrl(reduit);
  const r = await grist.docApi.applyUserActions([["AddRecord", TABLE_IMAGES, null, {
    ID2: ligneId, Nom: nom, Type: reduit.type, Date_ajout: aujourdHuiEpoch(), Donnees: dataUrl
  }]]);
  const id = r && r.retValues && r.retValues[0];
  if (!Number.isInteger(id)) throw new Error("identifiant de l'image non renvoyé par Grist");
  if (imagesCache) imagesCache.set(id, dataUrl);
  return id;
}

async function ajouterImageDansChamp(textarea, fichier, ligneId, msgEl) {
  const date = formaterDate(aujourdHuiEpoch());
  if (msgEl) { msgEl.textContent = "Envoi de l'image…"; msgEl.className = "msg-sauvegarde"; }
  const reduit = await reduireImage(fichier);
  const nom = reduit.name && reduit.name !== "image.png" ? reduit.name : "image-" + date + (reduit.type === "image/jpeg" ? ".jpg" : ".png");
  let texte = null;
  let erreur = null;
  // Table Emergence_Images (image en base64 dans une table dédiée, lien image:ID dans le texte)
  {
    try {
      const imgId = await enregistrerImageDansTable(reduit, nom, ligneId);
      texte = "![image](image:" + imgId + ")";
    } catch (e) { erreur = e; }
  }
  if (!texte) {
    console.error("Envoi de l'image impossible :", erreur);
    if (msgEl) {
      msgEl.className = "msg-sauvegarde erreur";
      msgEl.textContent = "Image non ajoutée — " + erreur.message + ". ";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Intégrer l'image dans le texte (base64)";
      btn.addEventListener("click", async () => {
        try {
          const petite = await reduireImage(fichier);
          textarea.focus();
          insererTexteDansTextarea(textarea, "\n![image](" + await fichierVersDataUrl(petite) + ")\n");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          msgEl.textContent = "";
        } catch (e2) { msgEl.textContent = "Erreur : image non ajoutée (" + e2.message + ")"; }
      });
      msgEl.appendChild(btn);
    }
    return;
  }
  textarea.focus();
  insererTexteDansTextarea(textarea, "\n" + texte + "\n");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  if (msgEl) msgEl.textContent = "";
}

function brancherCollageImage(textarea, ligneId, msgEl) {
  if (!textarea) return;
  const imagesDe = (dt) => dt ? [...(dt.files || [])].filter(f => f.type && f.type.startsWith("image/")) : [];
  textarea.addEventListener("paste", (e) => {
    let fichiers = [...((e.clipboardData && e.clipboardData.items) || [])].filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
    if (!fichiers.length) fichiers = imagesDe(e.clipboardData);
    if (!fichiers.length) return; // collage de texte : comportement normal
    e.preventDefault();
    fichiers.forEach(f => ajouterImageDansChamp(textarea, f, ligneId, msgEl));
  });
  textarea.addEventListener("dragover", (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files")) e.preventDefault(); });
  textarea.addEventListener("drop", (e) => {
    const fichiers = imagesDe(e.dataTransfer);
    if (!fichiers.length) return;
    e.preventDefault();
    fichiers.forEach(f => ajouterImageDansChamp(textarea, f, ligneId, msgEl));
  });
}

// ===================== Suggestions de titres pour les lignes RIDA =====================
// Quand on commence à saisir la description d'une ligne RIDA (fiche ou onglet Rida), une liste de
// titres types est proposée ; {sponsor} = sponsor de la demande, {date} = date du jour.
const MODELES_TITRE_RIDA_DEFAUT = [
  "Tenue d'un atelier avec {sponsor} le {date}",
  "Réunion avec {sponsor} le {date}",
  "Demande de prise de contact avec {sponsor}",
  "Attribution d'un compte N8N à {sponsor}",
  "Mail de communication envoyé à {sponsor}"
];
let popupSuggestionsRida = null; // { el, textarea, items, index }

// Phrases types : liste partagée de la table Emergence_Parametres (clé « phrases_rida »), sinon liste d'origine.
function modelesTitreRida() {
  const l = lireParametreJson(PARAM_PHRASES_RIDA, null);
  return Array.isArray(l) ? l.map(String).filter(s => s.trim()) : MODELES_TITRE_RIDA_DEFAUT.slice();
}

function sponsorPourLigneRida(ridaId) {
  const r = ridaToutes.find(x => x.id === ridaId);
  const demande = r ? lignesEmergence.find(l => l.id === idDepuisRef(r.ID2)) : null;
  const ids = demande ? refListVersIds(demande.Sponsor) : [];
  return ids.length ? nomActeurParId(Number(ids[0])) : "";
}

function resoudreModeleTitreRida(modele, sponsor) {
  return modele.replace("{sponsor}", sponsor || "<Sponsor>").replace("{date}", formaterDate(aujourdHuiEpoch()));
}

function fermerSuggestionsRida() {
  if (popupSuggestionsRida) { popupSuggestionsRida.el.remove(); popupSuggestionsRida = null; }
}

function suggestionsRidaPour(textarea, uniquementSiSaisie) {
  const saisie = textarea.value.trim();
  if (uniquementSiSaisie && !saisie) return [];
  const conteneur = textarea.closest("[data-rida-id]");
  const ridaId = conteneur ? parseInt(conteneur.getAttribute("data-rida-id"), 10) : NaN;
  const sponsor = sponsorPourLigneRida(ridaId);
  const q = normaliserTexteRecherche(saisie);
  const candidats = modelesTitreRida().map(m => resoudreModeleTitreRida(m, sponsor));
  if (!q) return candidats;
  const debut = candidats.filter(c => normaliserTexteRecherche(c).startsWith(q));
  const contient = candidats.filter(c => !debut.includes(c) && normaliserTexteRecherche(c).includes(q));
  return debut.concat(contient).filter(c => normaliserTexteRecherche(c) !== q);
}

function afficherSuggestionsRida(textarea, uniquementSiSaisie) {
  fermerSuggestionsRida();
  const items = suggestionsRidaPour(textarea, uniquementSiSaisie);
  if (!items.length) return;
  const el = document.createElement("div");
  el.className = "popup-suggestions-rida";
  el.innerHTML = items.map((t, i) => "<div class='suggestion-rida' data-i='" + i + "'>" + escapeHtml(t) + "</div>").join("");
  document.body.appendChild(el);
  popupSuggestionsRida = { el, textarea, items, index: -1, saisieOrigine: textarea.value };
  positionnerSuggestionsRida();
  // mousedown + preventDefault : le champ garde le focus (sinon la perte de focus enregistrerait la saisie partielle)
  el.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const cible = e.target.closest(".suggestion-rida");
    if (cible) accepterSuggestionRida(parseInt(cible.getAttribute("data-i"), 10));
  });
}

// Place la liste sous le champ, ou au-dessus s'il n'y a pas assez de place dessous ; elle reste
// toujours entièrement dans la fenêtre visible (et défile en interne si elle est très haute).
function positionnerSuggestionsRida() {
  if (!popupSuggestionsRida) return;
  const { el, textarea } = popupSuggestionsRida;
  const rect = textarea.getBoundingClientRect();
  const MARGE = 6, hauteurFenetre = window.innerHeight, largeurFenetre = window.innerWidth;
  el.style.maxHeight = Math.max(80, hauteurFenetre - 2 * MARGE) + "px";
  el.style.overflowY = "auto";
  el.style.minWidth = Math.min(Math.max(rect.width, 280), largeurFenetre - 2 * MARGE) + "px";
  const h = el.offsetHeight, l = el.offsetWidth;
  const placeDessous = hauteurFenetre - rect.bottom - MARGE, placeDessus = rect.top - MARGE;
  let top = (h <= placeDessous || placeDessous >= placeDessus) ? rect.bottom + 2 : rect.top - h - 2;
  top = Math.min(Math.max(MARGE, top), Math.max(MARGE, hauteurFenetre - h - MARGE));
  const left = Math.min(Math.max(MARGE, rect.left), Math.max(MARGE, largeurFenetre - l - MARGE));
  el.style.top = top + "px";
  el.style.left = left + "px";
}
window.addEventListener("resize", () => positionnerSuggestionsRida());
window.addEventListener("scroll", () => positionnerSuggestionsRida(), true);

function accepterSuggestionRida(i) {
  if (!popupSuggestionsRida) return;
  const { textarea, items } = popupSuggestionsRida;
  fermerSuggestionsRida();
  textarea.value = items[i];
  ajusterHauteurTextarea(textarea);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function surlignerSuggestionRida() {
  if (!popupSuggestionsRida) return;
  [...popupSuggestionsRida.el.children].forEach((c, k) => c.classList.toggle("suggestion-active", k === popupSuggestionsRida.index));
}

(function initSuggestionsRida() {
  const estChampTitre = (el) => el && el.matches && el.matches("textarea.rida-description, textarea.desc-action-textarea");
  document.addEventListener("focusin", (e) => { if (estChampTitre(e.target)) afficherSuggestionsRida(e.target, false); });
  document.addEventListener("input", (e) => { if (estChampTitre(e.target)) afficherSuggestionsRida(e.target, false); });
  document.addEventListener("focusout", (e) => { if (estChampTitre(e.target)) setTimeout(fermerSuggestionsRida, 0); });
  document.addEventListener("keydown", (e) => {
    if (!popupSuggestionsRida || e.target !== popupSuggestionsRida.textarea) return;
    const n = popupSuggestionsRida.items.length;
    // ↑/↓ : le titre sélectionné est inséré dans le champ (la liste reste ouverte pour changer de choix) ;
    // Entrée / Tab le valide, et on peut ensuite le compléter à la main. Échap restaure la saisie d'origine.
    const choisir = (k) => {
      popupSuggestionsRida.index = k;
      popupSuggestionsRida.textarea.value = popupSuggestionsRida.items[k];
      ajusterHauteurTextarea(popupSuggestionsRida.textarea);
      const l = popupSuggestionsRida.textarea.value.length;
      popupSuggestionsRida.textarea.setSelectionRange(l, l);
      surlignerSuggestionRida();
    };
    if (e.key === "ArrowDown") { e.preventDefault(); choisir((popupSuggestionsRida.index + 1) % n); }
    else if (e.key === "ArrowUp") { e.preventDefault(); choisir((popupSuggestionsRida.index - 1 + n) % n); }
    else if ((e.key === "Enter" || e.key === "Tab") && popupSuggestionsRida.index >= 0) { e.preventDefault(); accepterSuggestionRida(popupSuggestionsRida.index); }
    else if (e.key === "Escape") {
      if (popupSuggestionsRida.index >= 0) { e.stopPropagation(); popupSuggestionsRida.textarea.value = popupSuggestionsRida.saisieOrigine; ajusterHauteurTextarea(popupSuggestionsRida.textarea); }
      fermerSuggestionsRida();
    }
  }, true);
})();

// ===================== Paramètres généraux + assistant IA (LLM) =====================
// Configuration d'un LLM compatible API OpenAI (/chat/completions) : MirAI, Albert (DINUM) ou
// service général. Elle est enregistrée dans le navigateur de l'utilisateur (localStorage) et
// jamais dans le document Grist : la clé d'API reste donc personnelle.
const CLE_STOCKAGE_LLM = "emergence_llm_config_v1";
const PROMPT_SYNTHESE_DEFAUT =
  "Tu es l'assistant de l'équipe Émergence (ministère de l'Intérieur). À partir des éléments RIDA " +
  "(Actions, Informations, Décisions) réalisés pendant la semaine et de ceux prévus la semaine suivante, " +
  "rédige en français une synthèse hebdomadaire concise destinée à la direction, structurée ainsi : " +
  "faits marquants et décisions ; actions réalisées ; points d'attention ; prévu pour la semaine suivante. " +
  "Texte brut sans mise en forme markdown (tirets simples pour les listes), 20 lignes maximum. " +
  "N'invente aucune information absente des éléments fournis.";
const FOURNISSEURS_LLM = {
  mirai:   { libelle: "MirAI",   url: "https://api.mirai.interieur.gouv.fr/v1", modele: "",
             lienCle: "https://acces.api.mirai.interieur.gouv.fr/pats", texteCle: "Récupérer une clé MirAI (jeton d'accès personnel)" },
  albert:  { libelle: "Albert (API DINUM)", url: "https://albert.api.etalab.gouv.fr/v1", modele: "albert-large",
             lienCle: "https://albert.playground.etalab.gouv.fr/keys", texteCle: "Récupérer une clé Albert" },
  general: { libelle: "Général (compatible OpenAI)", url: "", modele: "", lienCle: "", texteCle: "" }
};
// Types de modèles (champ « type » renvoyé par /models, ex. Albert) utilisables pour générer du texte.
const TYPES_MODELES_LLM = ["text-generation", "image-text-to-text", "chat", "llm"];
const REGEX_MODELES_NON_LLM = /embed|whisper|rerank|tts|speech|moderation|classif|ocr|transcri|stable-diffusion|dall-e/i;

// Ne garde que les modèles « LLM » d'une réponse /models : par le champ type/task quand il existe,
// sinon (réponse type OpenAI sans cette info) en écartant les identifiants manifestement non génératifs.
function filtrerModelesLlm(reponse) {
  const liste = Array.isArray(reponse) ? reponse : (reponse && Array.isArray(reponse.data) ? reponse.data : []);
  const total = liste.length;
  const retenus = liste.filter(m => {
    const type = String((m && (m.type || m.task || m.pipeline_tag)) || "").toLowerCase();
    if (type) return TYPES_MODELES_LLM.includes(type);
    return !REGEX_MODELES_NON_LLM.test(String((m && m.id) || ""));
  }).map(m => m.id).filter(Boolean);
  return { ids: [...new Set(retenus)].sort((a, b) => a.localeCompare(b)), total };
}

async function listerModelesLlm(cfg) {
  if (!cfg.url) throw new Error("Renseignez d'abord l'URL de l'API.");
  const entetes = {};
  if (cfg.cle) entetes["Authorization"] = "Bearer " + cfg.cle;
  const reponse = await fetch(String(cfg.url).replace(/\/+$/, "") + "/models", { method: "GET", headers: entetes });
  if (!reponse.ok) throw new Error("Erreur " + reponse.status);
  return filtrerModelesLlm(await reponse.json());
}
let configLlmMemoire = null; // repli si localStorage est indisponible

function configLlmParDefaut() {
  return { fournisseur: "albert", url: FOURNISSEURS_LLM.albert.url, modele: FOURNISSEURS_LLM.albert.modele, cle: "", temperature: 0.2, prompt: PROMPT_SYNTHESE_DEFAUT };
}

function chargerConfigLlm() {
  let brut = null;
  try { brut = window.localStorage.getItem(CLE_STOCKAGE_LLM); } catch (e) { /* stockage indisponible */ }
  if (brut) {
    try { return Object.assign(configLlmParDefaut(), JSON.parse(brut)); } catch (e) { /* config corrompue */ }
  }
  return Object.assign(configLlmParDefaut(), configLlmMemoire || {});
}

function sauverConfigLlm(cfg) {
  configLlmMemoire = cfg;
  try { window.localStorage.setItem(CLE_STOCKAGE_LLM, JSON.stringify(cfg)); return true; } catch (e) { return false; }
}

function llmEstConfigure(cfg) {
  const c = cfg || chargerConfigLlm();
  return !!(c.url && c.modele);
}

// Appel « chat completions » ; renvoie le texte de la réponse.
async function appelerLlm(messages, cfgOptionnelle) {
  const cfg = cfgOptionnelle || chargerConfigLlm();
  if (!llmEstConfigure(cfg)) throw new Error("Assistant IA non configuré (Paramètres généraux : URL et modèle).");
  const url = String(cfg.url).replace(/\/+$/, "") + "/chat/completions";
  const entetes = { "Content-Type": "application/json" };
  if (cfg.cle) entetes["Authorization"] = "Bearer " + cfg.cle;
  const reponse = await fetch(url, {
    method: "POST",
    headers: entetes,
    body: JSON.stringify({ model: cfg.modele, messages, temperature: Number(cfg.temperature) || 0, stream: false })
  });
  if (!reponse.ok) {
    let detail = "";
    try { detail = (await reponse.text()).slice(0, 300); } catch (e) { /* ignore */ }
    throw new Error("Erreur " + reponse.status + (detail ? " : " + detail : ""));
  }
  const json = await reponse.json();
  const texte = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!texte) throw new Error("Réponse vide ou inattendue du service.");
  return String(texte).trim();
}

function ouvrirParametres() {
  const fond = document.getElementById("modale-parametres-fond");
  if (!fond) return;
  const cfg = chargerConfigLlm();
  document.getElementById("param-version").textContent = "v" + VERSION_WIDGET;
  document.getElementById("param-journal-rida").checked = journalModificationsActif;
  const champLien = document.getElementById("param-lien-base"); if (champLien) champLien.value = String(lireParametreJson(PARAM_LIEN_BASE, "") || "");
  document.getElementById("param-llm-fournisseur").value = FOURNISSEURS_LLM[cfg.fournisseur] ? cfg.fournisseur : "general";
  document.getElementById("param-llm-url").value = cfg.url || "";
  document.getElementById("param-llm-modele").value = cfg.modele || "";
  document.getElementById("param-llm-cle").value = cfg.cle || "";
  document.getElementById("param-llm-temperature").value = cfg.temperature;
  document.getElementById("param-llm-prompt").value = cfg.prompt || PROMPT_SYNTHESE_DEFAUT;
  document.getElementById("param-llm-msg").textContent = "";
  mettreAJourLienCleLlm();
  initialiserEditeurTypologies();
  initialiserEditeurPhrases();
  initialiserEditeurQuestionsIa();
  chargerMetaTypologie().then(initialiserEditeurTypologies);
  chargerParametres().then(() => { initialiserEditeurTags(); initialiserEditeurPhrases(); initialiserEditeurQuestionsIa(); afficherQuestionsTypesIa(); });
  fond.style.display = "flex";
}

let planifierParametresGeneraux = () => {};

// --- Paramètres : éditeur de la liste des typologies (choix de la colonne Grist) ---
let typoEdition = [];    // lignes en cours d'édition : { origine (nom actuel dans Grist ou null si nouveau), nom }
let typoOriginales = []; // noms actuels dans Grist au moment de l'ouverture

function nbFichesTypologie(valeur) {
  return lignesEmergence.filter(l => typologiesDeLigne(l).includes(valeur)).length;
}

function rendreEditeurTypologies() {
  const zone = document.getElementById("param-typo-liste");
  if (!zone) return;
  zone.innerHTML = "";
  typoEdition.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "typo-ligne";
    const nb = r.origine ? nbFichesTypologie(r.origine) : 0;
    div.innerHTML = "<input type='text' value=\"" + escapeHtml(r.nom) + "\" placeholder='Nouvelle typologie'>" +
      "<span class='typo-nb'>" + (r.origine ? nb + " fiche" + (nb > 1 ? "s" : "") : "nouvelle") + "</span>" +
      "<button type='button' class='typo-haut' title='Monter'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
      "<button type='button' class='typo-bas' title='Descendre'" + (i === typoEdition.length - 1 ? " disabled" : "") + ">↓</button>" +
      "<button type='button' class='typo-suppr' title='Supprimer'>🗑</button>";
    div.querySelector("input").addEventListener("input", (e) => { r.nom = e.target.value; });
    div.querySelector(".typo-haut").addEventListener("click", () => { typoEdition.splice(i - 1, 0, typoEdition.splice(i, 1)[0]); rendreEditeurTypologies(); });
    div.querySelector(".typo-bas").addEventListener("click", () => { typoEdition.splice(i + 1, 0, typoEdition.splice(i, 1)[0]); rendreEditeurTypologies(); });
    div.querySelector(".typo-suppr").addEventListener("click", () => { typoEdition.splice(i, 1); rendreEditeurTypologies(); });
    zone.appendChild(div);
  });
}

function initialiserEditeurTypologies() {
  typoOriginales = choixTypologieActuels();
  typoEdition = typoOriginales.map(n => ({ origine: n, nom: n }));
  rendreEditeurTypologies();
  const msg = document.getElementById("param-typo-msg");
  const ok = !!typologieMeta;
  document.getElementById("param-typo-ajouter").disabled = !ok;
  document.getElementById("param-typo-enregistrer").disabled = !ok;
  msg.className = ok ? "modale-msg" : "modale-msg erreur";
  msg.textContent = ok ? "" : "Lecture des choix de la colonne impossible : liste intégrée affichée, modification indisponible.";
}

async function enregistrerListeTypologies(auto) {
  const msg = document.getElementById("param-typo-msg");
  msg.className = "modale-msg";
  const lignes = typoEdition.map(r => ({ origine: r.origine, nom: String(r.nom).trim() })).filter(r => r.nom);
  const vus = new Set();
  for (const r of lignes) {
    const cle = normaliserTexteRecherche(r.nom);
    if (vus.has(cle)) { msg.className = "modale-msg erreur"; msg.textContent = "Doublon : « " + r.nom + " »."; return; }
    vus.add(cle);
  }
  if (!lignes.length) { msg.className = "modale-msg erreur"; msg.textContent = "La liste ne peut pas être vide."; return; }
  const renommages = new Map(lignes.filter(r => r.origine && r.origine !== r.nom).map(r => [r.origine, r.nom]));
  const conservees = new Set(lignes.map(r => r.origine).filter(Boolean));
  const supprimees = typoOriginales.filter(o => !conservees.has(o));
  const impactRen = [...renommages.keys()].filter(o => nbFichesTypologie(o) > 0);
  const impactSup = supprimees.filter(o => nbFichesTypologie(o) > 0);
  if (impactRen.length || impactSup.length) {
    const lignesMsg = []
      .concat(impactRen.map(o => "• « " + o + " » renommée en « " + renommages.get(o) + " » : " + nbFichesTypologie(o) + " fiche(s) mises à jour"))
      .concat(impactSup.map(o => "• « " + o + " » supprimée : retirée de " + nbFichesTypologie(o) + " fiche(s)"));
    if (!window.confirm("Cette modification met à jour des fiches :\n" + lignesMsg.join("\n") + "\n\nContinuer ?")) { if (auto) initialiserEditeurTypologies(); return; }
  }
  msg.textContent = "Enregistrement…";
  try {
    const finals = lignes.map(r => r.nom);
    // 1) choix de la colonne (widgetOptions) : on garde les autres réglages, on reporte les couleurs des renommées
    const options = Object.assign({}, typologieMeta.options || {});
    options.choices = finals;
    if (options.choiceOptions && typeof options.choiceOptions === "object") {
      const co = {};
      Object.keys(options.choiceOptions).forEach(k => {
        const nouveau = renommages.has(k) ? renommages.get(k) : k;
        if (!supprimees.includes(k)) co[nouveau] = options.choiceOptions[k];
      });
      options.choiceOptions = co;
    }
    await grist.docApi.applyUserActions([["ModifyColumn", TABLE_PRINCIPALE, COLONNE_TYPOLOGIE, { widgetOptions: JSON.stringify(options) }]]);
    // 2) fiches concernées (directement, sans horodater « Date de modification » de dizaines de fiches)
    const actions = [];
    lignesEmergence.forEach(l => {
      const avant = typologiesDeLigne(l);
      const apres = [...new Set(avant.filter(t => !supprimees.includes(t)).map(t => renommages.has(t) ? renommages.get(t) : t))];
      if (avant.join("\u0001") !== apres.join("\u0001")) {
        actions.push(["UpdateRecord", TABLE_PRINCIPALE, l.id, { [COLONNE_TYPOLOGIE]: valeurTypologiePourEcriture(apres) }]);
      }
    });
    if (actions.length) await grist.docApi.applyUserActions(actions);
    await chargerMetaTypologie();
    await chargerTablePrincipale();
    remplirOptionsFiltres();
    afficherListe();
    const courante = lignesEmergence.find(l => l.id === ligneSelectionneeId);
    if (courante) afficherFiche(courante);
    if (auto) { typoOriginales = finals.slice(); typoEdition.forEach(r => { r.nom = String(r.nom).trim(); if (r.nom) r.origine = r.nom; }); }
    else initialiserEditeurTypologies();
    msg.className = "modale-msg";
    msg.textContent = "Liste enregistrée" + (actions.length ? " (" + actions.length + " fiche(s) mises à jour)." : ".");
  } catch (e) {
    msg.className = "modale-msg erreur";
    msg.textContent = "Échec de l'enregistrement : " + e.message;
  }
}

function mettreAJourLienCleLlm() {
  const f = FOURNISSEURS_LLM[document.getElementById("param-llm-fournisseur").value] || FOURNISSEURS_LLM.general;
  const lien = document.getElementById("param-llm-lien-cle");
  if (!lien) return;
  if (f.lienCle) { lien.href = f.lienCle; lien.textContent = "🔑 " + f.texteCle + " ↗"; lien.style.display = "inline"; }
  else { lien.removeAttribute("href"); lien.style.display = "none"; }
}

function lireFormulaireParametres() {
  return {
    fournisseur: document.getElementById("param-llm-fournisseur").value,
    url: document.getElementById("param-llm-url").value.trim(),
    modele: document.getElementById("param-llm-modele").value.trim(),
    cle: document.getElementById("param-llm-cle").value.trim(),
    temperature: parseFloat(document.getElementById("param-llm-temperature").value) || 0,
    prompt: document.getElementById("param-llm-prompt").value.trim() || PROMPT_SYNTHESE_DEFAUT
  };
}

(function initParametres() {
  const fond = document.getElementById("modale-parametres-fond");
  const btn = document.getElementById("btn-parametres");
  if (!fond || !btn) return;
  const msg = document.getElementById("param-llm-msg");
  const fermer = () => { fond.style.display = "none"; };
  btn.addEventListener("click", ouvrirParametres);
  document.getElementById("param-annuler").addEventListener("click", fermer);
  fond.addEventListener("mousedown", (e) => { if (e.target === fond) fermer(); });
  document.getElementById("param-llm-fournisseur").addEventListener("change", (e) => {
    // Applique le préréglage (URL, modèle) du fournisseur choisi si les champs sont vides ou égaux à un préréglage.
    const preset = FOURNISSEURS_LLM[e.target.value] || FOURNISSEURS_LLM.general;
    const url = document.getElementById("param-llm-url"), modele = document.getElementById("param-llm-modele");
    const estPreset = (v, cle) => !v || Object.values(FOURNISSEURS_LLM).some(f => f[cle] === v);
    if (estPreset(url.value.trim(), "url")) url.value = preset.url;
    if (estPreset(modele.value.trim(), "modele")) modele.value = preset.modele;
    mettreAJourLienCleLlm();
    planifierParametresGeneraux();
  });
  document.getElementById("param-llm-lister").addEventListener("click", async () => {
    msg.className = "modale-msg";
    msg.textContent = "Récupération des modèles…";
    try {
      const { ids, total } = await listerModelesLlm(lireFormulaireParametres());
      document.getElementById("datalist-llm-modeles").innerHTML = ids.map(i => "<option value=\"" + escapeHtml(i) + "\"></option>").join("");
      const champ = document.getElementById("param-llm-modele");
      if (!champ.value.trim() && ids.length) { champ.value = ids[0]; planifierParametresGeneraux(); }
      msg.textContent = ids.length + " modèle(s) LLM disponible(s)" + (total > ids.length ? " (" + (total - ids.length) + " non génératif(s) masqué(s))" : "") +
        " — cliquez dans le champ Modèle pour choisir.";
      if (ids.length) champ.focus();
    } catch (e) {
      msg.className = "modale-msg erreur";
      msg.textContent = "Liste des modèles indisponible : " + e.message + " (vous pouvez saisir le modèle à la main).";
    }
  });
  document.getElementById("param-typo-ajouter").addEventListener("click", () => {
    typoEdition.push({ origine: null, nom: "" });
    rendreEditeurTypologies();
    const champs = document.querySelectorAll("#param-typo-liste input[type='text']");
    if (champs.length) champs[champs.length - 1].focus();
  });
  document.getElementById("param-typo-enregistrer").addEventListener("click", enregistrerListeTypologies);
  document.getElementById("param-llm-prompt-defaut").addEventListener("click", () => {
    document.getElementById("param-llm-prompt").value = PROMPT_SYNTHESE_DEFAUT;
    planifierParametresGeneraux();
  });
  // Enregistrement automatique : plus de bouton « Appliquer », chaque modification est prise en compte après une courte pause.
  const appliquerParametresGeneraux = () => {
    journalModificationsActif = document.getElementById("param-journal-rida").checked;
    sauverOptionsGenerales({ journalRida: journalModificationsActif });
    const ok = sauverConfigLlm(lireFormulaireParametres());
    msg.className = "modale-msg";
    msg.textContent = ok ? "Enregistré automatiquement." : "Pris en compte pour cette session seulement (stockage du navigateur indisponible).";
    afficherReporting();
  };
  let timerAutoGeneral = null;
  planifierParametresGeneraux = () => { clearTimeout(timerAutoGeneral); timerAutoGeneral = setTimeout(appliquerParametresGeneraux, 500); };
  ["input", "change"].forEach(ev => document.getElementById("param-panneaux").addEventListener(ev, (e) => {
    const id = e.target && e.target.id || "";
    if (id === "param-journal-rida" || id.indexOf("param-llm-") === 0) planifierParametresGeneraux();
  }));
  document.getElementById("param-llm-tester").addEventListener("click", async () => {
    msg.className = "modale-msg";
    msg.textContent = "Test en cours…";
    try {
      const rep = await appelerLlm([{ role: "user", content: "Réponds uniquement par le mot : OK" }], lireFormulaireParametres());
      msg.textContent = "Connexion réussie. Réponse : « " + rep.slice(0, 80) + " »";
    } catch (e) {
      msg.className = "modale-msg erreur";
      msg.textContent = "Échec : " + e.message;
    }
  });
})();

// ----- Synthèse IA du Reporting -----
let reportingSynthese = { cle: "", texte: "" };

function cleReportingCourante() { return lundiReporting() + "|" + reportingPorteur; }

function ligneReportingPourLlm(r, cleDate) {
  const desc = String(r.Description || "").replace(/\s+/g, " ").trim().slice(0, 400);
  return "  - " + (LIBELLES_TYPE_RIDA[r.RIDA] || r.RIDA) + " (" + formaterDate(r[cleDate]) + (r.Porteur ? ", " + r.Porteur : "") + ") : " + desc;
}

function textePourLlmReporting(d) {
  const bloc = (groupes, cleDate) => groupes.length ? groupes.map(g =>
    "- Demande « " + g.demande.titre + " »" + (g.demande.statut ? " [statut : " + g.demande.statut + "]" : "") +
    (g.demande.organisation ? " [" + g.demande.organisation + "]" : "") + "\n" +
    g.lignes.map(r => ligneReportingPourLlm(r, cleDate)).join("\n")).join("\n") : "(rien)";
  const texte =
    libelleSemaineReporting(d.lundi, d.dimanche, d.numero) + (reportingPorteur ? " — porteur : " + reportingPorteur : "") + "\n\n" +
    "RÉALISÉ CETTE SEMAINE :\n" + bloc(d.groupesFaites, "Fait_le") + "\n\n" +
    "PRÉVU LA SEMAINE SUIVANTE (" + libelleSemaineReporting(d.lundiSuivant, d.dimancheSuivant, d.numeroSuivant) + ") :\n" + bloc(d.groupesPrevues, "Pour_le");
  return texte.length > 24000 ? texte.slice(0, 24000) + "\n[… tronqué]" : texte;
}

async function genererSyntheseReporting() {
  const btn = document.getElementById("reporting-synthese-btn");
  const msg = document.getElementById("reporting-synthese-msg");
  if (!llmEstConfigure()) {
    if (msg) msg.textContent = "Configurez d'abord l'assistant IA (⚙ Paramètres généraux).";
    return;
  }
  const d = calculerReporting();
  if (!d.faites.length && !d.prevues.length) { if (msg) msg.textContent = "Rien à synthétiser pour cette période."; return; }
  if (btn) btn.disabled = true;
  if (msg) msg.textContent = "Génération de la synthèse…";
  try {
    const cfg = chargerConfigLlm();
    const texte = await appelerLlm([
      { role: "system", content: cfg.prompt || PROMPT_SYNTHESE_DEFAUT },
      { role: "user", content: textePourLlmReporting(d) }
    ], cfg);
    reportingSynthese = { cle: cleReportingCourante(), texte };
    if (msg) msg.textContent = "";
  } catch (e) {
    console.error("Synthèse IA :", e);
    if (msg) msg.textContent = "Erreur : " + e.message;
  } finally {
    if (btn) btn.disabled = false;
    afficherSyntheseReporting();
  }
}

function afficherSyntheseReporting() {
  const zone = document.getElementById("reporting-synthese-zone");
  if (!zone) return;
  if (reportingSynthese.cle !== cleReportingCourante()) reportingSynthese = { cle: "", texte: "" };
  if (!reportingSynthese.texte) { zone.style.display = "none"; zone.innerHTML = ""; return; }
  zone.style.display = "block";
  zone.innerHTML =
    "<div class='reporting-synthese-titre'>✨ Synthèse IA <span class='reporting-synthese-aide'>(modifiable ; incluse en tête du PDF)</span>" +
    "<button type='button' id='reporting-synthese-copier'>Copier</button><button type='button' id='reporting-synthese-effacer'>Effacer</button></div>" +
    "<textarea id='reporting-synthese-texte' rows='9'></textarea>";
  const ta = zone.querySelector("#reporting-synthese-texte");
  ta.value = reportingSynthese.texte;
  ta.addEventListener("input", () => { reportingSynthese.texte = ta.value; });
  zone.querySelector("#reporting-synthese-effacer").addEventListener("click", () => { reportingSynthese = { cle: "", texte: "" }; afficherSyntheseReporting(); });
  zone.querySelector("#reporting-synthese-copier").addEventListener("click", () => {
    try { navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand("copy"); }
  });
}

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
const kanbanJalonsConteneur = document.getElementById("kanban-jalons");
if (kanbanJalonsConteneur) kanbanJalonsConteneur.addEventListener("click", (e) => {
  const carte = e.target.closest(".kanban-carte[data-id]");
  if (carte) { basculerVue("demandes"); selectionnerLigne(Number(carte.getAttribute("data-id"))); }
});
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

  // Utilisateur connecté : e-mail affiché en haut à droite ; contact créé s'il n'existe pas encore.
  initialiserPorteurParDefaut();
})();


// ===================== Onglet IA : questions sur le référentiel =====================
// Principe : le périmètre (filtres) et les champs cochés sont assemblés en un contexte texte (fiches +
// statistiques calculées ici, jamais « comptées » par le LLM), envoyé avec la question au service IA configuré
// (Paramètres généraux). Le LLM doit répondre uniquement à partir de ce contexte et citer les fiches [#id].
const MAX_CARACTERES_IA = 400000;   // ≈ 110 000 jetons : au-delà, il faut réduire le périmètre
const TRONQUE_CHAMP_IA = 1500;      // caractères conservés par champ de fiche
const GROUPES_CHAMPS_IA = [
  { cle: "personnes", libelle: "Personnes (sponsor, porteurs, parties prenantes — sans les mails)", champs: [] },
  { cle: "objet", libelle: "Objet et détail de la demande", champs: ["Objet_de_la_demande", "Detail_de_la_demande"] },
  { cle: "painpoints", libelle: "Problématique, causes racines, synthèse de l'irritant", champs: ["Problematique_transverse", "Causes_racines_de_l_irritant", "Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement"] },
  { cle: "solutions", libelle: "Pistes et solutions (piste de communs, périmètre d'impact, synthèse, orientation, politique publique)", champs: ["Piste_de_communs", "Perimetre_d_impact2", "Synthese_de_la_demande", "Orientation", "Politique_Publique_concernee"] },
  { cle: "courante", libelle: "Main courante", champs: ["Main_courante"] },
  { cle: "rida", libelle: "Lignes RIDA (informations, décisions, actions)", champs: [] }
];
const QUESTIONS_TYPES_IA_DEFAUT = [
  "Quels sont les pain points principaux remontés ?",
  "Quelles solutions sont envisagées ?",
  "Quels thèmes reviennent dans plusieurs organisations ?",
  "Quelles demandes semblent bloquées ou en retard, et pourquoi ?",
  "Quelles actions restent à faire, et pour qui ?"
];
// Questions types : liste partagée de la table Emergence_Parametres (clé « questions_ia »), sinon liste d'origine.
function questionsTypesIa() {
  const l = lireParametreJson(PARAM_QUESTIONS_IA, null);
  return Array.isArray(l) ? l.map(String).filter(s => s.trim()) : QUESTIONS_TYPES_IA_DEFAUT.slice();
}
function afficherQuestionsTypesIa() {
  const zone = document.getElementById("ia-questions");
  if (!zone) return;
  zone.innerHTML = questionsTypesIa().map((q, i) =>
    "<button type='button' class='ia-question-type' data-i='" + i + "'>" + escapeHtml(q) + "</button>").join("");
}
const PROMPT_SYSTEME_IA =
  "Tu es l'assistant du référentiel des demandes de l'équipe Émergence (ministère de l'Intérieur). " +
  "Réponds en français, uniquement à partir des fiches et des statistiques fournies ci-dessous.\n" +
  "Règles :\n" +
  "- N'invente rien. Si une information n'est pas renseignée dans les fiches, écris « non renseigné ».\n" +
  "- Cite les fiches qui appuient chaque affirmation sous la forme [#id] (exemples : [#12] ou [#12, #15]).\n" +
  "- Pour tout comptage, utilise uniquement les STATISTIQUES fournies (calculées, ne recompte pas).\n" +
  "- Indique en une phrase sur combien de fiches repose ta réponse.\n" +
  "- Réponse structurée et concise (titres courts, puces) ; regroupe les thèmes similaires.";

let iaChampsActifs = new Set(GROUPES_CHAMPS_IA.map(g => g.cle));
let iaFiltres = { statut: "", typologie: "", organisation: "", tag: "", refBrm: "", du: "", au: "" }; // refBrm : "" = toutes, "oui" = renseignée, "non" = vide
let iaMessages = [];     // { role: "user" | "assistant", content }
let iaEnCours = false;
let iaInitialise = false;

function iaFichesDansPerimetre() {
  const du = iaFiltres.du ? inputVersDateEpoch(iaFiltres.du) : null;
  const au = iaFiltres.au ? inputVersDateEpoch(iaFiltres.au) : null;
  return lignesEmergence.filter(l => {
    if (iaFiltres.statut && l.Statut !== iaFiltres.statut) return false;
    if (iaFiltres.typologie && !typologiesDeLigne(l).includes(iaFiltres.typologie)) return false;
    if (iaFiltres.organisation && l.Organisation !== iaFiltres.organisation) return false;
    if (iaFiltres.tag && !tagsDeLigne(l).includes(iaFiltres.tag)) return false;
    if (iaFiltres.refBrm) { const a = !!String(refBrm(l) || "").trim(); if ((iaFiltres.refBrm === "oui") !== a) return false; }
    if (du !== null && !(Number(l.Date_de_soumission) >= du)) return false;
    if (au !== null && !(Number(l.Date_de_soumission) <= au)) return false;
    return true;
  });
}

// Texte d'un champ pour le LLM : une seule ligne, images retirées (le base64 ferait exploser le volume), tronqué.
function iaTexteChamp(v) {
  if (v === null || v === undefined) return "";
  let t = Array.isArray(v) ? typologiesDeValeur(v).join(", ") : String(v);
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]").replace(/\s+/g, " ").trim();
  return t.length > TRONQUE_CHAMP_IA ? t.slice(0, TRONQUE_CHAMP_IA) + " […tronqué]" : t;
}

function iaCompter(valeurs) {
  const m = new Map();
  valeurs.forEach(v => { const k = v || "(non renseigné)"; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function iaStatistiques(fiches) {
  const ids = new Set(fiches.map(f => f.id));
  const rida = ridaToutes.filter(r => ids.has(idDepuisRef(r.ID2)) && !estLigneJournalAuto(r));
  const ligne = (titre, paires, max) => "- " + titre + " : " + (paires.slice(0, max || 20).map(([k, n]) => k + " = " + n).join(" ; ") || "aucune");
  const actions = rida.filter(r => r.RIDA === "A");
  return [
    "Nombre de fiches dans le périmètre : " + fiches.length,
    ligne("Par statut", iaCompter(fiches.map(f => f.Statut))),
    ligne("Par priorité", iaCompter(fiches.map(f => f.Priorite))),
    ligne("Par typologie (une fiche peut en avoir plusieurs)", iaCompter(fiches.flatMap(f => typologiesDeLigne(f).length ? typologiesDeLigne(f) : [""]))),
    ligne("Par organisation", iaCompter(fiches.map(f => f.Organisation)), 15),
    "- Lignes RIDA (hors journal automatique) : " + rida.length + " (Informations " + rida.filter(r => r.RIDA === "I").length +
      ", Décisions " + rida.filter(r => r.RIDA === "D").length + ", Actions " + actions.length +
      " dont " + actions.filter(r => !r.Fait_le).length + " non terminées)"
  ].join("\n");
}

// Construit le contexte envoyé au LLM. Renvoie { texte, nbFiches, nbCar }.
function iaConstruireContexte(fiches) {
  const actifs = iaChampsActifs;
  const ridaParDemande = new Map();
  if (actifs.has("rida")) ridaToutes.forEach(r => {
    if (estLigneJournalAuto(r)) return;
    const id = idDepuisRef(r.ID2);
    if (!ridaParDemande.has(id)) ridaParDemande.set(id, []);
    ridaParDemande.get(id).push(r);
  });
  const blocs = fiches.map(f => {
    const l = [];
    l.push("### Fiche #" + f.id + " — " + (iaTexteChamp(f.Titre) || "Sans titre"));
    const meta = [
      "Statut : " + (f.Statut || "—"), "Priorité : " + (f.Priorite || "—"), "Organisation : " + (f.Organisation || "—"),
      "Typologie : " + (typologiesDeLigne(f).join(", ") || "—"),
      "Date d'entrée : " + (formaterDate(f.Date_de_soumission) || "—"), "Clôturée le : " + (formaterDate(f.Date_de_cloture) || "—")
    ];
    l.push(meta.join(" | "));
    if (actifs.has("personnes")) {
      const pp = refListVersIds(f.Parties_prenantes_concernees).map(Number).filter(id => acteursParId[id]).map(id => nomActeurParId(id)).join(", ");
      l.push("Sponsor : " + (nomActeur(f.Sponsor) || "—") + " | Porteurs : " + (iaTexteChamp(f.Porteurs) || "—") + " | Parties prenantes : " + (pp || "—"));
    }
    GROUPES_CHAMPS_IA.filter(g => actifs.has(g.cle)).forEach(g => g.champs.forEach(c => {
      const t = iaTexteChamp(f[c]);
      if (t) l.push(libelleChampJournal(c) + " : " + t);
    }));
    (ridaParDemande.get(f.id) || []).forEach(r => {
      const d = iaTexteChamp(r.Description);
      l.push("RIDA [" + (LIBELLES_TYPE_RIDA[r.RIDA] || r.RIDA || "?") + "]" + (r.Porteur ? " porteur : " + r.Porteur : "") +
        (r.Pour_le ? " pour le " + formaterDate(r.Pour_le) : "") + (r.Fait_le ? " fait le " + formaterDate(r.Fait_le) : "") + (d ? " — " + d : ""));
    });
    return l.join("\n");
  });
  const texte = "PÉRIMÈTRE ET STATISTIQUES (calculées) :\n" + iaStatistiques(fiches) + "\n\nFICHES :\n" + blocs.join("\n\n");
  return { texte, nbFiches: fiches.length, nbCar: texte.length };
}

function iaResumeFournisseur() {
  const cfg = chargerConfigLlm();
  let hote = cfg.url || "";
  try { hote = new URL(cfg.url).host; } catch (e) { /* garde l'URL telle quelle */ }
  return { hote, modele: cfg.modele || "" };
}

function iaMettreAJourVolume() {
  const zone = document.getElementById("ia-volume");
  if (!zone) return;
  const fiches = iaFichesDansPerimetre();
  const ctx = iaConstruireContexte(fiches);
  const f = iaResumeFournisseur();
  const trop = ctx.nbCar > MAX_CARACTERES_IA;
  zone.className = "ia-volume" + (trop ? " ia-volume-erreur" : "");
  zone.textContent = ctx.nbFiches + " fiche(s) · ≈ " + Math.round(ctx.nbCar / 1000) + " k caractères (~" + Math.round(ctx.nbCar / 3.5 / 1000) + " k jetons) · envoyé à " +
    (f.hote || "(service non configuré)") + (f.modele ? " (" + f.modele + ")" : "") +
    (trop ? " — trop volumineux : réduisez le périmètre ou décochez des champs." : "");
  const btn = document.getElementById("ia-envoyer");
  if (btn) btn.disabled = iaEnCours || trop || ctx.nbFiches === 0;
  const aperçu = document.getElementById("ia-apercu-texte");
  if (aperçu && document.getElementById("ia-apercu-zone").style.display !== "none") aperçu.textContent = ctx.texte;
}

function iaRemplirFiltres() {
  const remplir = (id, valeurs, libelleTous) => {
    const sel = document.getElementById(id);
    if (!sel) return; // HTML plus ancien que le JS
    const courant = sel.value;
    sel.innerHTML = "<option value=''>" + libelleTous + "</option>" + valeurs.map(v => "<option value=\"" + escapeHtml(v) + "\">" + escapeHtml(v) + "</option>").join("");
    sel.value = valeurs.includes(courant) ? courant : "";
  };
  const uniques = (f) => [...new Set(lignesEmergence.flatMap(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  remplir("ia-statut", uniques(l => [l.Statut]), "Tous les statuts");
  remplir("ia-typologie", uniques(l => typologiesDeLigne(l)), "Toutes les typologies");
  remplir("ia-organisation", uniques(l => [l.Organisation]), "Toutes les organisations");
  remplir("ia-tag", [...new Set([...listeTagsDefinis(), ...lignesEmergence.flatMap(l => tagsDeLigne(l))])].filter(Boolean).sort((a, b) => a.localeCompare(b)), "Tous les tags");
  iaFiltres.statut = document.getElementById("ia-statut").value;
  iaFiltres.typologie = document.getElementById("ia-typologie").value;
  iaFiltres.organisation = document.getElementById("ia-organisation").value;
  iaFiltres.tag = (document.getElementById("ia-tag") || {}).value || "";
  iaFiltres.refBrm = (document.getElementById("ia-refbrm") || {}).value || "";
}

function iaLierCitations(html) {
  return html.replace(/\[((?:#\d+\s*[,;]?\s*)+)\]/g, (m, interieur) => "[" + interieur.replace(/#(\d+)/g, (m2, id) => {
    const l = lignesEmergence.find(x => x.id === Number(id));
    return l ? "<a href='#' class='ia-ref' data-id='" + id + "' title=\"" + escapeHtml(l.Titre || "Fiche " + id) + "\">#" + id + "</a>" : "#" + id;
  }) + "]");
}

function iaRendreConversation() {
  const zone = document.getElementById("ia-conversation");
  if (!zone) return;
  zone.innerHTML = "";
  iaMessages.forEach((m, i) => {
    const div = document.createElement("div");
    div.className = "ia-msg ia-msg-" + m.role;
    if (m.role === "user") div.textContent = m.content;
    else {
      div.innerHTML = iaLierCitations(markdownToHtml(m.content)) + "<div class='ia-msg-actions'><button type='button' class='ia-copier' data-i='" + i + "'>Copier</button></div>";
    }
    zone.appendChild(div);
  });
  if (iaEnCours) {
    const att = document.createElement("div");
    att.className = "ia-msg ia-msg-attente";
    att.textContent = "Analyse du référentiel en cours…";
    zone.appendChild(att);
  }
  zone.scrollTop = zone.scrollHeight;
}

async function iaPoserQuestion(question) {
  const q = String(question || "").trim();
  const msg = document.getElementById("ia-msg");
  msg.textContent = "";
  if (!q || iaEnCours) return;
  if (!llmEstConfigure()) { msg.textContent = "Configurez d'abord l'assistant IA (⚙ Paramètres généraux)."; return; }
  const fiches = iaFichesDansPerimetre();
  const ctx = iaConstruireContexte(fiches);
  if (!fiches.length) { msg.textContent = "Aucune fiche dans le périmètre choisi."; return; }
  if (ctx.nbCar > MAX_CARACTERES_IA) { msg.textContent = "Périmètre trop volumineux : réduisez les filtres ou décochez des champs."; return; }
  iaEnCours = true;
  iaMessages.push({ role: "user", content: q });
  document.getElementById("ia-question").value = "";
  iaRendreConversation();
  iaMettreAJourVolume();
  try {
    const cfg = chargerConfigLlm();
    const historique = iaMessages.slice(0, -1).slice(-6).map(m => ({ role: m.role, content: m.content }));
    const reponse = await appelerLlm([
      { role: "system", content: PROMPT_SYSTEME_IA + "\n\n" + ctx.texte },
      ...historique,
      { role: "user", content: q }
    ], cfg);
    iaMessages.push({ role: "assistant", content: reponse });
  } catch (e) {
    console.error("Onglet IA :", e);
    msg.textContent = "Erreur : " + e.message;
    iaMessages.pop(); // la question reste à ressaisir
    document.getElementById("ia-question").value = q;
  } finally {
    iaEnCours = false;
    iaRendreConversation();
    iaMettreAJourVolume();
  }
}

function afficherIa() {
  if (!iaInitialise) {
    iaInitialise = true;
    document.getElementById("ia-champs-liste").innerHTML = GROUPES_CHAMPS_IA.map(g =>
      "<label><input type='checkbox' class='ia-champ' value='" + g.cle + "' checked> " + escapeHtml(g.libelle) + "</label>").join("");
    afficherQuestionsTypesIa();
    document.getElementById("ia-champs-liste").addEventListener("change", (e) => {
      if (!e.target.classList.contains("ia-champ")) return;
      if (e.target.checked) iaChampsActifs.add(e.target.value); else iaChampsActifs.delete(e.target.value);
      iaMettreAJourVolume();
    });
    ["ia-statut", "ia-typologie", "ia-organisation", "ia-tag", "ia-refbrm"].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener("change", () => {
      const val = (i) => (document.getElementById(i) || {}).value || "";
      iaFiltres = { ...iaFiltres, statut: val("ia-statut"), typologie: val("ia-typologie"), organisation: val("ia-organisation"), tag: val("ia-tag"), refBrm: val("ia-refbrm") };
      iaMettreAJourVolume();
    }); });
    ["ia-du", "ia-au"].forEach(id => document.getElementById(id).addEventListener("change", () => {
      iaFiltres.du = document.getElementById("ia-du").value; iaFiltres.au = document.getElementById("ia-au").value;
      iaMettreAJourVolume();
    }));
    document.getElementById("ia-reset").addEventListener("click", () => {
      ["ia-statut", "ia-typologie", "ia-organisation", "ia-tag", "ia-refbrm", "ia-du", "ia-au"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
      iaFiltres = { statut: "", typologie: "", organisation: "", tag: "", refBrm: "", du: "", au: "" };
      iaMettreAJourVolume();
    });
    document.getElementById("ia-questions").addEventListener("click", (e) => {
      const b = e.target.closest(".ia-question-type");
      if (b) iaPoserQuestion(questionsTypesIa()[Number(b.getAttribute("data-i"))]);
    });
    document.getElementById("ia-envoyer").addEventListener("click", () => iaPoserQuestion(document.getElementById("ia-question").value));
    document.getElementById("ia-question").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); iaPoserQuestion(e.target.value); }
    });
    document.getElementById("ia-effacer").addEventListener("click", () => { iaMessages = []; document.getElementById("ia-msg").textContent = ""; iaRendreConversation(); });
    document.getElementById("ia-apercu").addEventListener("click", () => {
      const z = document.getElementById("ia-apercu-zone");
      z.style.display = z.style.display === "none" ? "block" : "none";
      iaMettreAJourVolume();
    });
    document.getElementById("ia-conversation").addEventListener("click", (e) => {
      const ref = e.target.closest(".ia-ref");
      if (ref) { e.preventDefault(); basculerVue("demandes"); selectionnerLigne(Number(ref.getAttribute("data-id"))); return; }
      const cp = e.target.closest(".ia-copier");
      if (cp) {
        const texte = (iaMessages[Number(cp.getAttribute("data-i"))] || {}).content || "";
        if (navigator.clipboard) navigator.clipboard.writeText(texte).then(() => { cp.textContent = "Copié"; setTimeout(() => { cp.textContent = "Copier"; }, 1500); }).catch(() => {});
      }
    });
  }
  iaRemplirFiltres();
  iaRendreConversation();
  iaMettreAJourVolume();
}


// ===================== Export Markdown de toute la base (pour un LLM externe) =====================
// Un seul fichier .md structuré : consignes d'usage, statistiques, index des demandes, puis chaque fiche
// (tous les champs renseignés + lignes RIDA), les lignes RIDA sans fiche et les acteurs. Pas de mails,
// de téléphones ni d'images (remplacées par « [image] »).
const CHAMPS_EXPORT_IGNORES = new Set(["id", "manualSort", "html_fiche", "Titre", "Ref_Emergence", "Date_de_modification"]);
const CHAMPS_EXPORT_DATES = new Set(["Date_de_soumission", "Date_Go_NoGo_SDID", "Date_MVP_previsionnelle", "Date_MVP_realisee", "Date_de_cloture"]);

function exportTexteMarkdown(v) {
  // Texte libre conservé tel quel (markdown de l'utilisateur), mais : images retirées, titres rétrogradés en gras
  // (pour ne pas casser la hiérarchie du document), lignes vides multiples réduites.
  return String(v)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, "**$1**")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function exportValeurChamp(cle, v) {
  if (v === null || v === undefined || v === "" || v === false) return "";
  if (cle === "Sponsor") return refListVersIds(v).map(Number).filter(id => acteursParId[id]).map(ligneActeur).join(", ");
  if (cle === "Parties_prenantes_concernees") return refListVersIds(v).map(Number).filter(id => acteursParId[id]).map(ligneActeur).join(", ");
  if (CHAMPS_EXPORT_DATES.has(cle)) return typeof v === "number" ? formaterDate(v) : "";
  if (Array.isArray(v)) return typologiesDeValeur(v).join(", ");
  if (typeof v === "object") return "";
  if (typeof v === "number") return /date|_le$/i.test(cle) ? formaterDate(v) : String(v);
  return exportTexteMarkdown(v);
}

function exportLigneRida(r) {
  const type = LIBELLES_TYPE_RIDA[r.RIDA] || r.RIDA || "?";
  const d = r.Description ? exportTexteMarkdown(r.Description).replace(/\n+/g, " ") : "";
  return "- **" + type + "**" + (r.Porteur ? " — porteur : " + r.Porteur : "") +
    (r.Pour_le ? " — pour le " + formaterDate(r.Pour_le) : "") + (r.Fait_le ? " — fait le " + formaterDate(r.Fait_le) : "") +
    (idsParticipantsRida(r).length || estAtelierRida(r) ? " — " + (estAtelierRida(r) ? "participants" : "personnes concernées") + " (" + idsParticipantsRida(r).length + ")" + (idsParticipantsRida(r).length ? " : " + nomsParticipantsRida(r).join(", ") : "") : "") +
    (estLigneJournalAuto(r) ? " *(journal automatique)*" : "") + (d ? " : " + d : "");
}

// Correspondant d'un message pour l'export : nom connu (acteur), sinon nom affiché, sinon « inconnu@domaine » (jamais l'adresse complète).
function nomCorrespondantExport(texte) {
  return String(texte || "").split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => {
    const mail = emailsDeTexte(x)[0];
    const acteur = mail ? Object.values(acteursParId).find(a => String(a.mail || "").trim().toLowerCase() === mail) : null;
    if (acteur && acteur.Nom_et_Prenom) return acteur.Nom_et_Prenom;
    const nom = x.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
    if (nom && !/@/.test(nom)) return nom;
    return mail ? "inconnu@" + mail.split("@")[1] : (nom || "?");
  }).join(", ");
}
const MAX_CAR_MESSAGE_EXPORT = 4000;
function exportBlocMessage(m) {
  const corps = (typeof nettoyerCorpsPourVecteur === "function" ? nettoyerCorpsPourVecteur.call(null, m.message) : "").trim();
  const entete = "- **" + (m.sens === "sortant" ? "Message envoyé" : "Message reçu") + "** le " + formaterDate(m.recu) + " — " +
    (m.sens === "sortant" ? "à : " + nomCorrespondantExport(m.destinataires) : "de : " + nomCorrespondantExport(m.expediteur)) +
    " — objet : " + String(m.sujet || "(sans sujet)").replace(/\s+/g, " ");
  return corps ? entete + "\n  > " + corps.slice(0, MAX_CAR_MESSAGE_EXPORT) + (corps.length > MAX_CAR_MESSAGE_EXPORT ? " […]" : "") : entete;
}
async function genererMarkdownBase() {
  if (!messagesCharges) { try { await chargerMessages(); } catch (e) { /* export sans messages */ } }
  const fiches = lignesEmergence.slice().sort((a, b) => a.id - b.id);
  const ids = new Set(fiches.map(f => f.id));
  const ridaParFiche = new Map();
  const orphelines = [];
  ridaToutes.forEach(r => {
    const id = idDepuisRef(r.ID2);
    if (ids.has(id)) { if (!ridaParFiche.has(id)) ridaParFiche.set(id, []); ridaParFiche.get(id).push(r); }
    else orphelines.push(r);
  });
  const cleDate = (r) => Number(r.Fait_le || r.Pour_le || 0);
  const maintenant = new Date();
  const L = [];
  L.push("# Base documentaire Émergence — export du " + formaterDate(aujourdHuiEpoch()));
  L.push("");
  L.push("*Généré par le widget Émergence v" + VERSION_WIDGET + ". " + fiches.length + " demande(s), " + ridaToutes.length + " ligne(s) RIDA, " + Object.keys(acteursParId).length + " acteur(s).*");
  L.push("");
  L.push("## Consignes d'usage pour le LLM");
  L.push("");
  L.push("- Ce document est la base des demandes accompagnées par l'équipe Émergence (ministère de l'Intérieur). Réponds uniquement à partir de son contenu ; si une information n'y figure pas, indique « non renseigné ».");
  L.push("- Chaque demande est identifiée par sa référence `EMG-0123` (section « Fiche EMG-0123 »). Cite les fiches sous la forme [EMG-0123] pour appuyer tes affirmations.");
  L.push("- RIDA = Information, Décision ou Action. Une action sans date « fait le » est non terminée. Les lignes « journal automatique » sont des traces de modification, sans contenu métier.");
  L.push("- Les statistiques ci-dessous sont calculées : utilise-les pour les comptages plutôt que de recompter.");
  L.push("- Les messages (mails reçus/envoyés) sont listés par fiche, corps nettoyé (citations et signatures retirées) et tronqué à " + MAX_CAR_MESSAGE_EXPORT + " caractères. Les adresses mail, téléphones et images ne sont pas inclus (images remplacées par « [image] »).");
  L.push("");
  L.push("## Statistiques");
  L.push("");
  L.push(iaStatistiques(fiches));
  L.push("");
  L.push("## Index des demandes");
  L.push("");
  L.push("| Réf. | Titre | Statut | Priorité | Typologie | Organisation | Date d'entrée |");
  L.push("|---|---|---|---|---|---|---|");
  const cellule = (t) => String(t || "—").replace(/\|/g, "\\|").replace(/\s+/g, " ");
  fiches.forEach(f => L.push("| " + refDemande(f.id) + " | " + cellule(f.Titre) + " | " + cellule(f.Statut) + " | " + cellule(f.Priorite) + " | " +
    cellule(typologiesDeLigne(f).join(", ")) + " | " + cellule(f.Organisation) + " | " + (formaterDate(f.Date_de_soumission) || "—") + " |"));
  L.push("");
  L.push("## Fiches");
  fiches.forEach(f => {
    L.push("");
    L.push("### Fiche " + refDemande(f.id) + " — " + (String(f.Titre || "Sans titre").replace(/\s+/g, " ")));
    L.push("");
    const simples = [], longs = [];
    Object.keys(f).forEach(cle => {
      if (CHAMPS_EXPORT_IGNORES.has(cle)) return;
      const v = exportValeurChamp(cle, f[cle]);
      if (!v) return;
      (v.indexOf("\n") !== -1 || v.length > 160 ? longs : simples).push([libelleChampJournal(cle), v]);
    });
    if (f.Date_de_modification) simples.push(["Dernière modification", formaterDateHeure(f.Date_de_modification)]);
    simples.forEach(([l, v]) => L.push("- **" + l + "** : " + v));
    longs.forEach(([l, v]) => { L.push(""); L.push("**" + l + "** :"); L.push(""); L.push(v); });
    const rida = (ridaParFiche.get(f.id) || []).slice().sort((a, b) => cleDate(a) - cleDate(b));
    if (rida.length) {
      L.push(""); L.push("**RIDA** :"); L.push("");
      rida.forEach(r => L.push(exportLigneRida(r)));
    }
    const msgsFiche = messagesBrut.filter(m => m.demandes.includes(f.id)).sort((a, b) => a.recu - b.recu);
    if (msgsFiche.length) {
      L.push(""); L.push("**Messages liés** (" + msgsFiche.length + ") :"); L.push("");
      msgsFiche.forEach(m => L.push(exportBlocMessage(m)));
    }
  });
  const msgsLibres = messagesBrut.filter(m => !m.demandes.some(id => ids.has(id))).sort((a, b) => a.recu - b.recu);
  if (msgsLibres.length) {
    L.push(""); L.push("## Messages non rattachés à une demande (" + msgsLibres.length + ")"); L.push("");
    msgsLibres.forEach(m => L.push(exportBlocMessage(m)));
  }
  if (orphelines.length) {
    L.push(""); L.push("## Lignes RIDA sans fiche"); L.push("");
    orphelines.forEach(r => L.push(exportLigneRida(r)));
  }
  L.push(""); L.push("## Acteurs"); L.push("");
  Object.keys(acteursParId).map(Number).sort((a, b) => a - b).forEach(id => {
    const a = acteursParId[id];
    const detail = [a.Organisation, a.Role].filter(Boolean).join(" — ");
    L.push("- " + (a.Nom_et_Prenom || "—") + (detail ? " (" + detail + ")" : ""));
  });
  return L.join("\n") + "\n";
}

async function telechargerBaseMarkdown(idMsg) {
  const msg = document.getElementById(typeof idMsg === "string" ? idMsg : "param-export-msg");
  try {
    if (msg) { msg.className = "modale-msg"; msg.textContent = "Préparation de l'export…"; }
    const texte = await genererMarkdownBase();
    const d = new Date();
    const nom = "base_emergence_" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".md";
    telechargerBlob(new Blob([texte], { type: "text/markdown;charset=utf-8" }), nom);
    msg.className = "modale-msg";
    msg.textContent = nom + " téléchargé — " + lignesEmergence.length + " demande(s), " + Math.round(texte.length / 1000) + " k caractères (~" + Math.round(texte.length / 3.5 / 1000) + " k jetons).";
  } catch (e) {
    console.error("Export Markdown :", e);
    msg.className = "modale-msg erreur";
    msg.textContent = "Échec de l'export : " + e.message;
  }
}
const champLienBase = document.getElementById("param-lien-base"); // absent si le HTML est plus ancien que le JS : ne doit pas bloquer le chargement
if (champLienBase) champLienBase.addEventListener("change", async (e) => {
  const msg = document.getElementById("param-lien-msg") || document.createElement("div"), v = e.target.value.trim();
  if (v && !/#a\d+\.s\d+/.test(v)) { msg.className = "modale-msg erreur"; msg.textContent = "Lien non reconnu : il doit contenir « #a1.s7… » (lien d'ancre Grist d'une ligne)."; return; }
  try { await ecrireParametreJson(PARAM_LIEN_BASE, v, "Modèle de lien direct vers une fiche (lien d'ancre Grist)"); msg.className = "modale-msg"; msg.textContent = "Enregistré."; }
  catch (err) { msg.className = "modale-msg erreur"; msg.textContent = "Échec : " + (err && err.message || err); }
});
document.getElementById("param-export-md").addEventListener("click", () => telechargerBaseMarkdown("param-export-msg"));

// ===================== Export PowerPoint d'une fiche (v0.114) =====================
// Icône « PPT » à gauche de chaque ligne de la liste : ouvre une modale (aperçu simplifié, textes modifiables)
// puis produit un .pptx d'une diapo à partir du modèle stocké en pièce jointe dans la table Emergence_Templates
// (colonne Fichier). Le modèle contient des balises <Organisation>, <objet de la demande>, <une ou deux dates clés>,
// <sponsors, porteurs, partie prenantes>, <synthèse de l'avancement en 3 phrases>, <type>, remplacées dans le XML de
// la diapo. Pas de bibliothèque : lecture/écriture zip avec DecompressionStream / CompressionStream (navigateur).
const PPT_DIM = { w: 12192000, h: 6858000 };
const PPT_ZONES = { // positions EMU lues dans le modèle (x, y, largeur, hauteur)
  org: [1879517, 316048, 5600000, 738472],
  contexte: [1206497, 1995516, 4387366, 2200000],
  dates: [6891138, 1935429, 4325549, 700000],
  participants: [6893122, 3086076, 4169935, 1100000],
  bilan: [1295397, 4974019, 9922008, 1000000],
  type: [9690005, 6318914, 1672164, 448914]
};
let pptEtat = null; // { ligneId, valeurs, enCours }

// ---------- Zip minimal ----------

async function fluxVersOctets(flux) { return new Uint8Array(await new Response(flux).arrayBuffer()); }
async function inflateBrut(u8) {
  if (typeof DecompressionStream === "undefined") throw new Error("Ce navigateur ne sait pas décompresser un .pptx (DecompressionStream absent).");
  return fluxVersOctets(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
}
async function deflateBrut(u8) {
  if (typeof CompressionStream === "undefined") throw new Error("Ce navigateur ne sait pas compresser un .pptx (CompressionStream absent).");
  return fluxVersOctets(new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw")));
}

// Renvoie un tableau ordonné [{ nom, donnees: Uint8Array }]
async function lireZip(octets) {
  const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65600); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("Le fichier n'est pas un zip/pptx valide.");
  const nb = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const res = [];
  for (let k = 0; k < nb; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Zip corrompu (répertoire central).");
    const methode = dv.getUint16(p + 10, true), tailleC = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
    const decal = dv.getUint32(p + 42, true);
    const nom = dec.decode(u8.subarray(p + 46, p + 46 + ln));
    const ln2 = dv.getUint16(decal + 26, true), le2 = dv.getUint16(decal + 28, true);
    const brut = u8.subarray(decal + 30 + ln2 + le2, decal + 30 + ln2 + le2 + tailleC);
    if (!nom.endsWith("/")) res.push({ nom, donnees: methode === 0 ? brut.slice() : await inflateBrut(brut) });
    p += 46 + ln + le + lc;
  }
  return res;
}

async function ecrireZip(entrees) {
  const enc = new TextEncoder();
  const morceaux = [], central = [];
  let decal = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const e of entrees) {
    const nom = enc.encode(e.nom), crc = crc32(e.donnees);
    const comp = await deflateBrut(e.donnees);
    const entete = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(comp.length), ...u32(e.donnees.length), ...u16(nom.length), ...u16(0)]);
    morceaux.push(entete, nom, comp);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(comp.length), ...u32(e.donnees.length), ...u16(nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(decal)]), nom);
    decal += entete.length + nom.length + comp.length;
  }
  const tailleCentral = central.reduce((s, m) => s + m.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entrees.length), ...u16(entrees.length),
    ...u32(tailleCentral), ...u32(decal), ...u16(0)]);
  return new Blob([...morceaux, ...central, fin], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

// ---------- Modèle dans la table Emergence_Templates ----------
let pptTemplateCache = null; // entrées zip du modèle
async function chargerTemplatePptx(forcer) {
  if (pptTemplateCache && !forcer) return pptTemplateCache;
  let t;
  try { t = await grist.docApi.fetchTable(TABLE_TEMPLATES); }
  catch (e) { throw new Error("Table « " + TABLE_TEMPLATES + " » introuvable ou illisible (" + (e.message || e) + ")."); }
  const cleFichier = Object.keys(t).find(k => k.toLowerCase() === "fichier");
  if (!cleFichier) throw new Error("La table " + TABLE_TEMPLATES + " n'a pas de colonne « Fichier ».");
  // dernière ligne ayant une pièce jointe (la dernière pièce jointe de la cellule)
  let idPj = null;
  (t.id || []).forEach((id, i) => {
    const v = t[cleFichier][i];
    const ids = Array.isArray(v) ? v.filter(x => typeof x === "number") : [];
    if (ids.length) idPj = ids[ids.length - 1];
  });
  if (!idPj) throw new Error("Aucun fichier dans la colonne Fichier de " + TABLE_TEMPLATES + ".");
  let octets;
  try {
    let r = await fetch(await urlAttachment(idPj, false));
    if (!r.ok) r = await fetch(await urlAttachment(idPj, true));
    if (!r.ok) throw new Error("HTTP " + r.status);
    octets = await r.arrayBuffer();
  } catch (e) {
    throw new Error("Téléchargement du modèle impossible (" + (e.message || e) + ").");
  }
  const entrees = await lireZip(octets);
  const slides = entrees.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.nom));
  const dec = new TextDecoder();
  const cible = slides.filter(s => dec.decode(s.donnees).includes("&lt;Organisation&gt;"));
  if (slides.length !== 1 || cible.length !== 1) {
    throw new Error("Le modèle doit être un .pptx d'une seule diapo contenant la balise <Organisation> (trouvé : " + slides.length + " diapo(s), " + cible.length + " avec la balise).");
  }
  pptTemplateCache = entrees;
  return entrees;
}

// ---------- Ajustement de la taille du texte (réduit pour tenir dans la zone) ----------
// Estimation : largeur moyenne d'un caractère ≈ 0,5 × corps ; interligne 1,2. Corps de base → plancher 8 pt.
function pptTailleAjustee(lignes, cle, base) {
  const z = PPT_ZONES[cle];
  const largeur = z[2] - 182880, hauteur = z[3] - 91440; // marges internes
  const txt = (lignes || []).filter(Boolean);
  for (let pt = base / 100; pt >= 8; pt -= 0.5) {
    const cpl = Math.max(1, Math.floor(largeur / (pt * 12700 * 0.5)));
    const nb = txt.reduce((s, l) => s + Math.max(1, Math.ceil(String(l).length / cpl)), 0);
    if (nb * pt * 12700 * 1.2 <= hauteur) return Math.round(pt * 100);
  }
  return 800;
}
const PPT_TAILLE_BASE = { contexte: 1800, dates: 1800, participants: 1800, bilan: 1800 };

// ---------- Remplissage du XML de la diapo ----------
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
function remplirSlideXml(xml, v) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("XML de la diapo illisible.");
  const sz = (txt, grand) => String(txt || "").length > (grand ? 28 : 9999) ? (String(txt).length > 40 ? 2200 : 2800) : null;
  const regles = [
    { test: t => t === "<Organisation>", lignes: [v.org], taille: sz(v.org, true) },
    { test: t => t === "<objet de la demande>", lignes: v.contexte, taille: pptTailleAjustee(v.contexte, "contexte", PPT_TAILLE_BASE.contexte) },
    { test: t => t === "<une ou deux dates clés>", lignes: v.dates, taille: pptTailleAjustee(v.dates, "dates", PPT_TAILLE_BASE.dates) },
    { test: t => t.startsWith("<sponsors"), lignes: v.participants, taille: pptTailleAjustee(v.participants, "participants", PPT_TAILLE_BASE.participants) },
    { test: t => t.startsWith("<synthèse"), lignes: v.bilan, taille: pptTailleAjustee(v.bilan, "bilan", PPT_TAILLE_BASE.bilan) },
    { test: t => t === "<type>", lignes: [v.type] }
  ];
  const paragraphes = Array.from(doc.getElementsByTagNameNS(NS_A, "p"));
  for (const p of paragraphes) {
    const runs = Array.from(p.getElementsByTagNameNS(NS_A, "r"));
    if (!runs.length) continue;
    const texte = runs.map(r => (r.getElementsByTagNameNS(NS_A, "t")[0] || {}).textContent || "").join("").replace(/\s+/g, " ").trim();
    const regle = regles.find(r => r.test(texte.replace("’", "'")) || r.test(texte));
    if (!regle) continue;
    let lignes = (regle.lignes || []).map(s => String(s == null ? "" : s)).filter(s => s.length);
    if (!lignes.length) lignes = [""];
    runs.slice(1).forEach(r => r.parentNode.removeChild(r));
    const run = runs[0];
    if (regle.taille) run.getElementsByTagNameNS(NS_A, "rPr")[0].setAttribute("sz", String(regle.taille));
    const gabarit = p.cloneNode(true);
    const poser = (para, txt) => { para.getElementsByTagNameNS(NS_A, "t")[0].textContent = txt; };
    poser(p, lignes[0]);
    let precedent = p;
    for (let i = 1; i < lignes.length; i++) {
      const c = gabarit.cloneNode(true);
      poser(c, lignes[i]);
      precedent.parentNode.insertBefore(c, precedent.nextSibling);
      precedent = c;
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

async function genererPptx(valeurs) {
  const entrees = await chargerTemplatePptx(false);
  const dec = new TextDecoder(), enc = new TextEncoder();
  const sortie = entrees.map(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.nom)
    ? { nom: e.nom, donnees: enc.encode(remplirSlideXml(dec.decode(e.donnees), valeurs)) } : e);
  sortie.sort((a, b) => (a.nom === "[Content_Types].xml" ? -1 : b.nom === "[Content_Types].xml" ? 1 : 0));
  return ecrireZip(sortie);
}

// ---------- Contenu issu de la fiche ----------
function pptTronquer(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
}
function pptLignesRida(ligne) {
  return ridaToutes.filter(r => idDepuisRef(r.ID2) === ligne.id && !estLigneJournalAuto(r))
    .sort((a, b) => Number(a.Pour_le || a.Fait_le || 0) - Number(b.Pour_le || b.Fait_le || 0));
}
function pptParticipants(ligne) {
  const L = [];
  const sp = nomActeur(ligne.Sponsor); if (sp) L.push("Sponsor : " + sp);
  if (ligne.Porteurs) L.push("Porteur : " + ligne.Porteurs);
  const pp = nomActeur(ligne.Parties_prenantes_concernees); if (pp) L.push("Parties prenantes : " + pp);
  return L;
}
function pptContenuBrut(ligne) {
  const dates = [];
  if (ligne.Date_de_soumission) dates.push(formaterDate(ligne.Date_de_soumission) + " : demande initiale");
  if (ligne.Date_de_cloture) dates.push(formaterDate(ligne.Date_de_cloture) + " : clôture");
  const lignesTexte = (v) => exportTexteMarkdown(v || "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  const objet = lignesTexte(ligne.Objet_de_la_demande).concat(lignesTexte(ligne.Detail_de_la_demande));
  const bilan = lignesTexte(ligne.Synthese_de_la_demande || ligne.Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement);
  return {
    org: ligne.Organisation || "",
    contexte: objet,
    dates: dates.slice(0, 2),
    participants: pptParticipants(ligne),
    bilan: bilan,
    type: typologiesDeLigne(ligne)[0] || ""
  };
}
function pptContexteLlm(ligne) {
  const L = [];
  const add = (k, v) => { const t = exportTexteMarkdown(v == null ? "" : v); if (t) L.push(k + " : " + pptTronquer(t, 2500)); };
  add("Organisation", ligne.Organisation); add("Titre", ligne.Titre); add("Statut", ligne.Statut);
  add("Objet de la demande", ligne.Objet_de_la_demande); add("Détail de la demande", ligne.Detail_de_la_demande);
  add("Synthèse de la demande", ligne.Synthese_de_la_demande);
  add("Synthèse de l'irritant et état de son traitement", ligne.Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement);
  add("Main courante", ligne.Main_courante);
  if (ligne.Date_Go_NoGo_SDID) L.push("Go/noGo SDID : " + formaterDate(ligne.Date_Go_NoGo_SDID));
  if (ligne.Date_MVP_previsionnelle) L.push("MVP prévisionnel : " + formaterDate(ligne.Date_MVP_previsionnelle));
  if (ligne.Date_MVP_realisee) L.push("MVP réalisé : " + formaterDate(ligne.Date_MVP_realisee));
  if (ligne.Date_de_soumission) L.push("Date d'entrée : " + formaterDate(ligne.Date_de_soumission));
  if (ligne.Date_de_cloture) L.push("Date de clôture : " + formaterDate(ligne.Date_de_cloture));
  const rida = pptLignesRida(ligne).slice(-12).map(exportLigneRida);
  if (rida.length) L.push("Lignes RIDA :\n" + rida.join("\n"));
  return L.join("\n");
}
const PROMPT_PPT = "Tu prépares une diapo de synthèse pour une direction du ministère de l'Intérieur. À partir de la fiche fournie, réponds UNIQUEMENT par un objet JSON " +
  "{\"contexte\": string, \"dates\": [string, string], \"bilan\": string} en français. contexte : l'objet et l'objectif de la demande, 2 à 3 phrases, 380 caractères maximum. " +
  "dates : 1 ou 2 dates clés au format « JJ/MM/AAAA : événement » (60 caractères maximum chacune), uniquement si elles figurent dans la fiche. " +
  "bilan : synthèse de l'avancement en 3 phrases maximum, 350 caractères maximum. N'invente rien ; pas de markdown.";
async function pptCondenserParIa(ligne) {
  const rep = await appelerLlm([{ role: "system", content: PROMPT_PPT }, { role: "user", content: pptContexteLlm(ligne) }]);
  const m = rep.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse de l'IA non exploitable.");
  const j = JSON.parse(m[0]);
  return {
    contexte: j.contexte ? [pptTronquer(j.contexte, 450)] : null,
    dates: Array.isArray(j.dates) ? j.dates.filter(Boolean).slice(0, 2).map(d => pptTronquer(d, 70)) : null,
    bilan: j.bilan ? [pptTronquer(j.bilan, 420)] : null
  };
}

// ---------- Modale ----------
function pptPct(z) { return "left:" + (z[0] / PPT_DIM.w * 100) + "%;top:" + (z[1] / PPT_DIM.h * 100) + "%;width:" + (z[2] / PPT_DIM.w * 100) + "%;height:" + (z[3] / PPT_DIM.h * 100) + "%;"; }
function pptRendreScene(v) {
  const sc = document.getElementById("ppt-scene");
  const carte = (x, y, w, h) => "<div class='ppt-carte' style='" + pptPct([x, y, w, h]) + "'></div>";
  const titre = (txt, x, y) => "<div class='ppt-titre-zone' style='left:" + (x / PPT_DIM.w * 100) + "%;top:" + (y / PPT_DIM.h * 100) + "%'>" + txt + "</div>";
  const zone = (cle, cls) => "<div class='ppt-texte " + (cls || "") + "' contenteditable='true' data-ppt='" + cle + "' style='" + pptPct(PPT_ZONES[cle]) + "'></div>";
  sc.innerHTML = "<div class='ppt-bande'></div>" +
    carte(931329, 1340514, 5164664, 2942163) + carte(6347431, 1340514, 5164664, 2942163) + carte(1020231, 4439534, 10491865, 1572480) +
    titre("Contexte et objectifs", 1206496, 1514970) + titre("Dates clés", 6838498, 1514970) + titre("Participants", 6829623, 2657968) + titre("Bilan / Observations", 1298637, 4526456) +
    zone("org", "ppt-org") + zone("contexte") + zone("dates") + zone("participants") + zone("bilan") +
    "<div class='ppt-type' contenteditable='true' data-ppt='type' style='" + pptPct(PPT_ZONES.type) + "'></div>" +
    "<div class='ppt-pied'>Direction de la Transformation numérique</div>";
  pptPoserValeurs(v);
}
function pptPoserValeurs(v) {
  document.querySelectorAll("#ppt-scene [data-ppt]").forEach(el => {
    const cle = el.getAttribute("data-ppt");
    const val = v[cle];
    el.textContent = Array.isArray(val) ? val.join("\n") : (val || "");
    if (PPT_TAILLE_BASE[cle]) { // même ajustement que dans le .pptx (corps en pt → % de la largeur de diapo 13,33 in)
      const pt = pptTailleAjustee(Array.isArray(val) ? val : String(val || "").split("\n"), cle, PPT_TAILLE_BASE[cle]) / 100;
      el.style.fontSize = (pt / 960 * 100) + "cqw";
    }
  });
}
function pptLireValeurs() {
  const lire = (cle) => { const el = document.querySelector("#ppt-scene [data-ppt='" + cle + "']"); return el ? String(el.innerText !== undefined ? el.innerText : el.textContent).replace(/\u00a0/g, " ") : ""; };
  const lignes = (cle) => lire(cle).split(/\n+/).map(s => s.trim()).filter(Boolean);
  return { org: lire("org").replace(/\s+/g, " ").trim(), contexte: lignes("contexte"), dates: lignes("dates"),
    participants: lignes("participants"), bilan: lignes("bilan"), type: lire("type").trim() };
}
document.getElementById("ppt-scene").addEventListener("input", () => {
  if (!pptEtat) return;
  const v = pptLireValeurs();
  Object.keys(PPT_TAILLE_BASE).forEach(cle => {
    const el = document.querySelector("#ppt-scene [data-ppt='" + cle + "']");
    el.style.fontSize = (pptTailleAjustee(v[cle], cle, PPT_TAILLE_BASE[cle]) / 100 / 960 * 100) + "cqw";
  });
});
function pptMessage(t, ok) { const m = document.getElementById("ppt-msg"); m.textContent = t || ""; m.style.color = ok ? "#2b7a3d" : "#b03030"; }

async function pptLancerIa() {
  const ligne = lignesEmergence.find(l => l.id === pptEtat.ligneId);
  if (!ligne || pptEtat.enCours) return;
  if (!llmEstConfigure()) { pptMessage("Assistant IA non configuré (Paramètres généraux) : textes bruts conservés."); return; }
  pptEtat.enCours = true;
  pptMessage("Condensation par l'IA en cours…", true);
  try {
    const r = await pptCondenserParIa(ligne);
    const v = pptLireValeurs();
    if (r.contexte) v.contexte = r.contexte;
    if (r.dates && r.dates.length) v.dates = r.dates;
    if (r.bilan) v.bilan = r.bilan;
    pptPoserValeurs(v);
    pptMessage("Textes condensés par l'IA — à relire avant de télécharger.", true);
  } catch (e) {
    pptMessage("Condensation IA impossible : " + (e.message || e) + " (textes bruts conservés).");
  } finally { pptEtat.enCours = false; }
}

function ouvrirModalePpt(ligneId) {
  const ligne = lignesEmergence.find(l => l.id === ligneId);
  if (!ligne) return;
  pptEtat = { ligneId, enCours: false };
  document.getElementById("ppt-sous-titre").textContent = (ligne.Organisation ? ligne.Organisation + " — " : "") + (ligne.Titre || "demande " + ligne.id);
  pptRendreScene(pptContenuBrut(ligne));
  pptMessage("");
  document.getElementById("modale-ppt-fond").style.display = "flex";
  chargerTemplatePptx(false).catch(e => pptMessage("Modèle : " + (e.message || e)));
}
document.getElementById("ppt-fermer").addEventListener("click", () => { document.getElementById("modale-ppt-fond").style.display = "none"; });
document.getElementById("ppt-regenerer").addEventListener("click", pptLancerIa);
document.getElementById("ppt-telecharger").addEventListener("click", async () => {
  try {
    pptMessage("Génération du fichier…", true);
    const ligne = lignesEmergence.find(l => l.id === pptEtat.ligneId) || {};
    const blob = await genererPptx(pptLireValeurs());
    const nom = "Emergence_" + String(ligne.Organisation || ("demande_" + pptEtat.ligneId)).replace(/[^\w\-]+/g, "_").slice(0, 40) + ".pptx";
    telechargerBlob(blob, nom);
    pptMessage("Fichier " + nom + " téléchargé.", true);
  } catch (e) { pptMessage("Génération impossible : " + (e.message || e)); }
});

// ===================== Tags (v0.116) : colonne Emergence.Tag + liste des tags dans Emergence_Parametres =====================
// Table Emergence_Parametres (Cle, Valeur, Description) : paramètres applicatifs partagés. Clé « tags » : liste JSON des tags.
// Colonne Emergence.Tag : Choice List (créée par l'outil de migration de structure).
const TABLE_PARAMETRES = "Emergence_Parametres";
const COLONNE_TAG = "Tag";
const PARAM_TAGS = "tags";
const PARAM_PHRASES_RIDA = "phrases_rida";
const PARAM_QUESTIONS_IA = "questions_ia";
let parametres = {};          // { cle: { id, valeur(texte), description } }
let parametresDisponibles = false; // la table Emergence_Parametres existe et a été lue

async function chargerParametres() {
  try {
    const t = await grist.docApi.fetchTable(TABLE_PARAMETRES);
    const cle = (n) => Object.keys(t).find(k => k.toLowerCase() === n.toLowerCase());
    const cC = cle("Cle"), cV = cle("Valeur"), cD = cle("Description");
    if (!cC || !cV) throw new Error("colonnes Cle / Valeur absentes");
    parametres = {};
    (t.id || []).forEach((id, i) => { if (t[cC][i]) parametres[String(t[cC][i])] = { id, valeur: t[cV][i] == null ? "" : String(t[cV][i]), description: cD ? t[cD][i] : "" }; });
    parametresDisponibles = true;
  } catch (e) {
    parametres = {}; parametresDisponibles = false;
    console.error("Table " + TABLE_PARAMETRES + " illisible (lancer la migration de structure) :", e);
  }
}
function lireParametreJson(cle, defaut) {
  const p = parametres[cle];
  if (!p || !p.valeur) return defaut;
  try { const v = JSON.parse(p.valeur); return v == null ? defaut : v; } catch (e) { return defaut; }
}
async function ecrireParametreJson(cle, valeur, description) {
  const texte = JSON.stringify(valeur);
  const p = parametres[cle];
  const action = p ? ["UpdateRecord", TABLE_PARAMETRES, p.id, { Valeur: texte }]
    : ["AddRecord", TABLE_PARAMETRES, null, { Cle: cle, Valeur: texte, Description: description || "" }];
  await grist.docApi.applyUserActions([action]);
  await chargerParametres();
}

function tagsDeLigne(ligne) { return typologiesDeValeur(ligne && ligne[COLONNE_TAG]); }
function colonneTagPresente() { return lignesEmergence.length === 0 ? true : COLONNE_TAG in lignesEmergence[0]; }
function listeTagsDefinis() { const l = lireParametreJson(PARAM_TAGS, []); return Array.isArray(l) ? l.map(String) : []; }
async function enregistrerTags(ligneId, liste) {
  if (!colonneTagPresente()) { alert("La colonne « Tag » n'existe pas dans la table Emergence : lancez d'abord l'outil de migration de structure."); return; }
  try {
    await appliquerActions([["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [COLONNE_TAG]: liste.length ? ["L"].concat(liste) : null }]]);
    await rechargerEmergenceEtRafraichir(ligneId === ligneSelectionneeId ? ligneId : null);
  } catch (err) { alert("Erreur lors de l'enregistrement des tags : " + err.message); }
}
function fermerPopupTags() { const p = document.getElementById("popup-tag"); if (p) p.remove(); }
function ouvrirPopupTags(ancre, ligneId) {
  fermerPopupTags(); fermerPopupTypologie();
  const ligne = lignesEmergence.find(l => l.id === ligneId);
  if (!ligne) return;
  let selection = tagsDeLigne(ligne);
  const choix = listeTagsDefinis();
  selection.forEach(t => { if (!choix.includes(t)) choix.push(t); });
  const popup = document.createElement("div");
  popup.id = "popup-tag"; popup.className = "popup-typologie";
  popup.innerHTML = choix.length
    ? choix.map(v => "<label><input type='checkbox' value=\"" + escapeHtml(v) + "\"" + (selection.includes(v) ? " checked" : "") + ">" + escapeHtml(v) + "</label>").join("")
    : "<div class='popup-typologie-note'>Aucun tag défini : ajoutez-en dans ⚙ Paramètres généraux → Tags.</div>";
  document.body.appendChild(popup);
  const r = ancre.getBoundingClientRect(), largeur = popup.offsetWidth, hauteur = popup.offsetHeight;
  popup.style.left = Math.max(4, Math.min(r.left, window.innerWidth - largeur - 8)) + "px";
  const dessous = r.bottom + 4;
  popup.style.top = (dessous + hauteur > window.innerHeight - 8 ? Math.max(4, r.top - hauteur - 4) : dessous) + "px";
  popup.addEventListener("change", async () => {
    selection = [...popup.querySelectorAll("input:checked")].map(i => i.value);
    await enregistrerTags(ligneId, selection);
  });
  const fermer = (e) => {
    if (e.type === "keydown" ? e.key === "Escape" : !popup.contains(e.target) && e.target !== ancre) {
      fermerPopupTags();
      document.removeEventListener("mousedown", fermer, true);
      document.removeEventListener("keydown", fermer, true);
    }
  };
  setTimeout(() => { document.addEventListener("mousedown", fermer, true); document.addEventListener("keydown", fermer, true); }, 0);
}

// --- Paramètres : éditeur de la liste des tags ---
let tagEdition = [];    // { origine (nom actuel ou null si nouveau), nom }
let tagOriginaux = [];
function nbFichesTag(v) { return lignesEmergence.filter(l => tagsDeLigne(l).includes(v)).length; }
function rendreEditeurTags() {
  const zone = document.getElementById("param-tag-liste");
  if (!zone) return;
  zone.innerHTML = "";
  tagEdition.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "typo-ligne";
    const nb = r.origine ? nbFichesTag(r.origine) : 0;
    div.innerHTML = "<input type='text' value=\"" + escapeHtml(r.nom) + "\" placeholder='Nouveau tag'>" +
      "<span class='typo-nb'>" + (r.origine ? nb + " fiche" + (nb > 1 ? "s" : "") : "nouveau") + "</span>" +
      "<button type='button' class='typo-haut' title='Monter'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
      "<button type='button' class='typo-bas' title='Descendre'" + (i === tagEdition.length - 1 ? " disabled" : "") + ">↓</button>" +
      "<button type='button' class='typo-suppr' title='Supprimer'>🗑</button>";
    div.querySelector("input").addEventListener("input", (e) => { r.nom = e.target.value; });
    div.querySelector(".typo-haut").addEventListener("click", () => { tagEdition.splice(i - 1, 0, tagEdition.splice(i, 1)[0]); rendreEditeurTags(); });
    div.querySelector(".typo-bas").addEventListener("click", () => { tagEdition.splice(i + 1, 0, tagEdition.splice(i, 1)[0]); rendreEditeurTags(); });
    div.querySelector(".typo-suppr").addEventListener("click", () => { tagEdition.splice(i, 1); rendreEditeurTags(); });
    zone.appendChild(div);
  });
}
function initialiserEditeurTags() {
  tagOriginaux = listeTagsDefinis();
  tagEdition = tagOriginaux.map(n => ({ origine: n, nom: n }));
  rendreEditeurTags();
  const msg = document.getElementById("param-tag-msg");
  const ok = parametresDisponibles && colonneTagPresente();
  document.getElementById("param-tag-ajouter").disabled = !ok;
  document.getElementById("param-tag-enregistrer").disabled = !ok;
  msg.className = ok ? "modale-msg" : "modale-msg erreur";
  msg.textContent = ok ? "" : (!parametresDisponibles ? "Table « " + TABLE_PARAMETRES + " » absente : lancez l'outil de migration de structure."
    : "Colonne « Tag » absente de la table Emergence : lancez l'outil de migration de structure.");
}
async function enregistrerListeTags(auto) {
  const msg = document.getElementById("param-tag-msg");
  msg.className = "modale-msg";
  const lignes = tagEdition.map(r => ({ origine: r.origine, nom: String(r.nom).trim() })).filter(r => r.nom);
  const vus = new Set();
  for (const r of lignes) {
    const cle = normaliserTexteRecherche(r.nom);
    if (vus.has(cle)) { msg.className = "modale-msg erreur"; msg.textContent = "Doublon : « " + r.nom + " »."; return; }
    vus.add(cle);
  }
  const renommages = new Map(lignes.filter(r => r.origine && r.origine !== r.nom).map(r => [r.origine, r.nom]));
  const conserves = new Set(lignes.map(r => r.origine).filter(Boolean));
  const supprimes = tagOriginaux.filter(o => !conserves.has(o));
  const impactRen = [...renommages.keys()].filter(o => nbFichesTag(o) > 0);
  const impactSup = supprimes.filter(o => nbFichesTag(o) > 0);
  if (impactRen.length || impactSup.length) {
    const L = impactRen.map(o => "• « " + o + " » renommé en « " + renommages.get(o) + " » : " + nbFichesTag(o) + " fiche(s) mises à jour")
      .concat(impactSup.map(o => "• « " + o + " » supprimé : retiré de " + nbFichesTag(o) + " fiche(s)"));
    if (!window.confirm("Cette modification met à jour des fiches :\n" + L.join("\n") + "\n\nContinuer ?")) { if (auto) initialiserEditeurTags(); return; }
  }
  msg.textContent = "Enregistrement…";
  try {
    await ecrireParametreJson(PARAM_TAGS, lignes.map(r => r.nom), "Liste des tags proposés pour les demandes (JSON)");
    const actions = [];
    lignesEmergence.forEach(l => {
      const avant = tagsDeLigne(l);
      const apres = [...new Set(avant.filter(t => !supprimes.includes(t)).map(t => renommages.has(t) ? renommages.get(t) : t))];
      if (avant.join("\u0001") !== apres.join("\u0001")) actions.push(["UpdateRecord", TABLE_PRINCIPALE, l.id, { [COLONNE_TAG]: apres.length ? ["L"].concat(apres) : null }]);
    });
    if (actions.length) await grist.docApi.applyUserActions(actions);
    await chargerTablePrincipale();
    afficherListe();
    const courante = lignesEmergence.find(l => l.id === ligneSelectionneeId);
    if (courante) afficherFiche(courante);
    if (auto) { tagOriginaux = lignes.map(r => r.nom); tagEdition.forEach(r => { r.nom = String(r.nom).trim(); if (r.nom) r.origine = r.nom; }); }
    else initialiserEditeurTags();
    msg.className = "modale-msg";
    msg.textContent = "Liste enregistrée" + (actions.length ? " (" + actions.length + " fiche(s) mises à jour)." : ".");
  } catch (e) { msg.className = "modale-msg erreur"; msg.textContent = "Échec de l'enregistrement : " + e.message; }
}
document.getElementById("param-tag-ajouter").addEventListener("click", () => { tagEdition.push({ origine: null, nom: "" }); rendreEditeurTags(); });
document.getElementById("param-tag-enregistrer").addEventListener("click", enregistrerListeTags);

// --- Paramètres : onglets (v0.118) ---
function afficherOngletParametres(nom) {
  document.querySelectorAll("#param-onglets .param-onglet-btn").forEach(b => b.classList.toggle("actif", b.getAttribute("data-onglet") === nom));
  document.querySelectorAll("#modale-parametres-fond .param-onglet-panneau").forEach(p => { p.style.display = p.getAttribute("data-onglet") === nom ? "" : "none"; });
}
document.getElementById("param-onglets").addEventListener("click", (e) => {
  const b = e.target.closest(".param-onglet-btn");
  if (b) afficherOngletParametres(b.getAttribute("data-onglet"));
});

// --- Paramètres : éditeur des phrases types de la description RIDA (Emergence_Parametres, clé phrases_rida) ---
let phrEdition = []; // textes en cours d'édition
function rendreEditeurPhrases() {
  const zone = document.getElementById("param-phr-liste");
  zone.innerHTML = "";
  phrEdition.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "typo-ligne";
    div.innerHTML = "<input type='text' value=\"" + escapeHtml(r.texte) + "\" placeholder='Ex. Réunion avec {sponsor} le {date}' style='flex:1;'>" +
      "<button type='button' class='typo-haut' title='Monter'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
      "<button type='button' class='typo-bas' title='Descendre'" + (i === phrEdition.length - 1 ? " disabled" : "") + ">↓</button>" +
      "<button type='button' class='typo-suppr' title='Supprimer'>🗑</button>";
    div.querySelector("input").addEventListener("input", (e) => { r.texte = e.target.value; });
    div.querySelector(".typo-haut").addEventListener("click", () => { phrEdition.splice(i - 1, 0, phrEdition.splice(i, 1)[0]); rendreEditeurPhrases(); });
    div.querySelector(".typo-bas").addEventListener("click", () => { phrEdition.splice(i + 1, 0, phrEdition.splice(i, 1)[0]); rendreEditeurPhrases(); });
    div.querySelector(".typo-suppr").addEventListener("click", () => { phrEdition.splice(i, 1); rendreEditeurPhrases(); });
    zone.appendChild(div);
  });
}
function initialiserEditeurPhrases() {
  phrEdition = modelesTitreRida().map(t => ({ texte: t }));
  rendreEditeurPhrases();
  const msg = document.getElementById("param-phr-msg");
  const ok = parametresDisponibles;
  document.getElementById("param-phr-ajouter").disabled = !ok;
  document.getElementById("param-phr-enregistrer").disabled = !ok;
  msg.className = ok ? "modale-msg" : "modale-msg erreur";
  msg.textContent = ok ? "" : "Table « " + TABLE_PARAMETRES + " » absente : lancez l'outil de migration de structure (phrases d'origine affichées).";
  document.querySelector("#param-onglets [data-onglet='rida']").classList.toggle("alerte", !ok);
}
async function enregistrerListePhrases(auto) {
  const msg = document.getElementById("param-phr-msg");
  const liste = phrEdition.map(r => String(r.texte).trim()).filter(Boolean);
  if (new Set(liste.map(normaliserTexteRecherche)).size !== liste.length) { msg.className = "modale-msg erreur"; msg.textContent = "Doublon dans la liste."; return; }
  msg.className = "modale-msg"; msg.textContent = "Enregistrement…";
  try {
    await ecrireParametreJson(PARAM_PHRASES_RIDA, liste, "Phrases types proposées pour la description des lignes RIDA (JSON ; {sponsor}, {date})");
    if (!auto) initialiserEditeurPhrases();
    msg.textContent = "Phrases enregistrées (" + liste.length + ").";
  } catch (e) { msg.className = "modale-msg erreur"; msg.textContent = "Échec de l'enregistrement : " + e.message; }
}
document.getElementById("param-phr-ajouter").addEventListener("click", () => { phrEdition.push({ texte: "" }); rendreEditeurPhrases(); });
document.getElementById("param-phr-enregistrer").addEventListener("click", enregistrerListePhrases);
document.getElementById("param-phr-defaut").addEventListener("click", () => { phrEdition = MODELES_TITRE_RIDA_DEFAUT.map(t => ({ texte: t })); rendreEditeurPhrases(); document.getElementById("param-phr-msg").textContent = "Phrases d'origine rétablies : cliquez sur « Enregistrer les phrases » pour les appliquer."; });

// --- Paramètres : éditeur des questions types de l'onglet IA (Emergence_Parametres, clé questions_ia) ---
let qiaEdition = [];
function rendreEditeurQuestionsIa() {
  const zone = document.getElementById("param-qia-liste");
  zone.innerHTML = "";
  qiaEdition.forEach((r, i) => {
    const div = document.createElement("div");
    div.className = "typo-ligne";
    div.innerHTML = "<input type='text' value=\"" + escapeHtml(r.texte) + "\" placeholder='Ex. Quels sont les pain points principaux remontés ?' style='flex:1;'>" +
      "<button type='button' class='typo-haut' title='Monter'" + (i === 0 ? " disabled" : "") + ">↑</button>" +
      "<button type='button' class='typo-bas' title='Descendre'" + (i === qiaEdition.length - 1 ? " disabled" : "") + ">↓</button>" +
      "<button type='button' class='typo-suppr' title='Supprimer'>🗑</button>";
    div.querySelector("input").addEventListener("input", (e) => { r.texte = e.target.value; });
    div.querySelector(".typo-haut").addEventListener("click", () => { qiaEdition.splice(i - 1, 0, qiaEdition.splice(i, 1)[0]); rendreEditeurQuestionsIa(); });
    div.querySelector(".typo-bas").addEventListener("click", () => { qiaEdition.splice(i + 1, 0, qiaEdition.splice(i, 1)[0]); rendreEditeurQuestionsIa(); });
    div.querySelector(".typo-suppr").addEventListener("click", () => { qiaEdition.splice(i, 1); rendreEditeurQuestionsIa(); });
    zone.appendChild(div);
  });
}
function initialiserEditeurQuestionsIa() {
  qiaEdition = questionsTypesIa().map(t => ({ texte: t }));
  rendreEditeurQuestionsIa();
  const msg = document.getElementById("param-qia-msg");
  const ok = parametresDisponibles;
  document.getElementById("param-qia-ajouter").disabled = !ok;
  document.getElementById("param-qia-enregistrer").disabled = !ok;
  msg.className = ok ? "modale-msg" : "modale-msg erreur";
  msg.textContent = ok ? "" : "Table « " + TABLE_PARAMETRES + " » absente : lancez l'outil de migration de structure (questions d'origine affichées).";
}
async function enregistrerQuestionsIa(auto) {
  const msg = document.getElementById("param-qia-msg");
  const liste = qiaEdition.map(r => String(r.texte).trim()).filter(Boolean);
  if (new Set(liste.map(normaliserTexteRecherche)).size !== liste.length) { msg.className = "modale-msg erreur"; msg.textContent = "Doublon dans la liste."; return; }
  msg.className = "modale-msg"; msg.textContent = "Enregistrement…";
  try {
    await ecrireParametreJson(PARAM_QUESTIONS_IA, liste, "Questions types proposées dans l'onglet IA (JSON)");
    afficherQuestionsTypesIa();
    if (!auto) initialiserEditeurQuestionsIa();
    msg.textContent = "Questions enregistrées (" + liste.length + ").";
  } catch (e) { msg.className = "modale-msg erreur"; msg.textContent = "Échec de l'enregistrement : " + e.message; }
}
document.getElementById("param-qia-ajouter").addEventListener("click", () => { qiaEdition.push({ texte: "" }); rendreEditeurQuestionsIa(); });
document.getElementById("param-qia-enregistrer").addEventListener("click", enregistrerQuestionsIa);
document.getElementById("param-qia-defaut").addEventListener("click", () => { qiaEdition = QUESTIONS_TYPES_IA_DEFAUT.map(t => ({ texte: t })); rendreEditeurQuestionsIa(); document.getElementById("param-qia-msg").textContent = "Questions d'origine rétablies : cliquez sur « Enregistrer les questions » pour les appliquer."; });

// --- Paramètres : enregistrement automatique des listes (plus de bouton « Enregistrer ») ---
function creerAutoEnregistrement(fnEnregistrer, boutonId, delai) {
  let timer = null, enCours = false, rejouer = false;
  const lancer = async () => {
    if (enCours) { rejouer = true; return; }
    enCours = true;
    try { await fnEnregistrer(true); } finally { enCours = false; if (rejouer) { rejouer = false; lancer(); } }
  };
  return (immediat) => {
    clearTimeout(timer);
    if (document.getElementById(boutonId).disabled) return; // table / colonne absente : pas d'écriture
    timer = setTimeout(lancer, immediat ? 0 : delai);
  };
}
const autoTypologies = creerAutoEnregistrement(enregistrerListeTypologies, "param-typo-enregistrer", 600);
const autoTags = creerAutoEnregistrement(enregistrerListeTags, "param-tag-enregistrer", 600);
const autoPhrases = creerAutoEnregistrement(enregistrerListePhrases, "param-phr-enregistrer", 800);
const autoQuestionsIa = creerAutoEnregistrement(enregistrerQuestionsIa, "param-qia-enregistrer", 800);
(function brancherEnregistrementAutomatique() {
  const brancher = (zoneId, auto, surSaisie) => {
    const zone = document.getElementById(zoneId);
    zone.addEventListener("change", () => auto(true));   // fin de saisie (sortie du champ / Entrée)
    if (surSaisie) zone.addEventListener("input", () => auto(false)); // texte libre : enregistré après une pause
    zone.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".typo-haut, .typo-bas, .typo-suppr")) auto(true); });
  };
  brancher("param-typo-liste", autoTypologies, false); // renommer une typologie met à jour des fiches : seulement en fin de saisie
  brancher("param-tag-liste", autoTags, false);
  brancher("param-phr-liste", autoPhrases, true);
  brancher("param-qia-liste", autoQuestionsIa, true);
  document.getElementById("param-phr-defaut").addEventListener("click", () => autoPhrases(true));
  document.getElementById("param-qia-defaut").addEventListener("click", () => autoQuestionsIa(true));
  // les boutons « Enregistrer / Appliquer » n'ont plus lieu d'être
  ["param-typo-enregistrer", "param-tag-enregistrer", "param-phr-enregistrer", "param-qia-enregistrer"].forEach(id => { document.getElementById(id).style.display = "none"; });
})();

// ===================== Ateliers : participants des lignes RIDA (v0.120) =====================
// Un atelier = ligne RIDA dont la description contient « tenue d'un atelier ». Les participants sont stockés dans
// Emergence_Rida.Participants (RefList vers Emergence_Acteurs, créée par l'outil de migration de structure v4).
const CHAINE_ATELIER = "tenue d'un atelier";
function estAtelierRida(r) {
  return normaliserTexteRecherche(r && r.Description).replace(/[’‘`]/g, "'").includes(CHAINE_ATELIER);
}
function colonneParticipantsPresente() { return ridaToutes.length === 0 ? true : "Participants" in ridaToutes[0]; }
function idsParticipantsRida(r) { return refListVersIds(r && r.Participants).map(Number).filter(Boolean); }
function nomsParticipantsRida(r) { return idsParticipantsRida(r).map(nomActeurParId).filter(Boolean); }
function boutonParticipantsRidaHtml(r) {
  if (estLigneJournalAuto(r)) return "";
  const noms = nomsParticipantsRida(r);
  return "<button type='button' class='btn-rida-participants' data-rida-id='" + r.id + "' title=\"" +
    escapeHtml(noms.length ? "Impliqués : " + noms.join(", ") + " — cliquer pour modifier" : "Aucune personne impliquée — cliquer pour en ajouter") + "\">👤 " + idsParticipantsRida(r).length + "</button>";
}

let modaleParticipants = null; // { ridaId, ligneId }
function rendreModaleParticipants() {
  const r = ridaToutes.find(x => x.id === modaleParticipants.ridaId);
  if (!r) return;
  const ids = idsParticipantsRida(r);
  document.getElementById("participants-titre").textContent = "Impliqués — " + (r.Description || "ligne RIDA");
  document.getElementById("participants-liste").innerHTML = ids.length
    ? ids.map(id => "<span class='chip'><span class='chip-texte'>" + escapeHtml(nomActeurParId(id) || ("#" + id)) + "</span>" +
        "<button class='chip-retirer' type='button' data-acteur-id='" + id + "' title='Retirer'>×</button></span>").join("")
    : "<span style='color:#888;'>Aucune personne impliquée (0)</span>";
  document.getElementById("participants-nb").textContent = ids.length + " personne" + (ids.length > 1 ? "s" : "");
  document.getElementById("participants-datalist").innerHTML = acteursTriesParNom.filter(a => !ids.includes(a.id))
    .map(a => "<option value=\"" + escapeHtml(a.label) + "\"></option>").join("");
}
async function enregistrerParticipantsRida(liste) {
  const msg = document.getElementById("participants-msg");
  if (!colonneParticipantsPresente()) { msg.className = "modale-msg erreur"; msg.textContent = "La colonne « Participants » n'existe pas dans Emergence_Rida : lancez l'outil de migration de structure."; return; }
  msg.className = "modale-msg"; msg.textContent = "";
  try {
    await appliquerActions([["UpdateRecord", TABLE_RIDA, modaleParticipants.ridaId, { Participants: liste.length ? ["L"].concat(liste) : null }]]);
    const rida = await grist.docApi.fetchTable(TABLE_RIDA);
    ridaToutes = tableVersLignes(rida);
    rendreModaleParticipants();
    const lc = lignesEmergence.find(l => l.id === modaleParticipants.ligneId);
    if (lc) afficherFiche(lc);
  } catch (e) { msg.className = "modale-msg erreur"; msg.textContent = "Erreur : " + e.message; }
}
function ajouterParticipantDepuisSaisie() {
  const inp = document.getElementById("participants-saisie");
  const texte = normaliserTexteRecherche(inp.value.trim());
  if (!texte) return;
  const msg = document.getElementById("participants-msg");
  const cand = acteursTriesParNom.find(a => normaliserTexteRecherche(a.label) === texte) ||
    acteursTriesParNom.find(a => normaliserTexteRecherche(nomActeurParId(a.id)) === texte);
  if (!cand) { msg.className = "modale-msg erreur"; msg.textContent = "Aucun acteur ne correspond à « " + inp.value.trim() + " »."; return; }
  const r = ridaToutes.find(x => x.id === modaleParticipants.ridaId);
  const ids = idsParticipantsRida(r);
  if (ids.includes(cand.id)) { msg.className = "modale-msg erreur"; msg.textContent = "Déjà dans la liste."; return; }
  inp.value = "";
  enregistrerParticipantsRida(ids.concat(cand.id));
}
function ouvrirModaleParticipants(ridaId, ligneId) {
  modaleParticipants = { ridaId, ligneId };
  document.getElementById("participants-msg").textContent = "";
  document.getElementById("participants-saisie").value = "";
  rendreModaleParticipants();
  document.getElementById("modale-participants-fond").style.display = "flex";
  document.getElementById("participants-saisie").focus();
}
document.getElementById("participants-fermer").addEventListener("click", () => { document.getElementById("modale-participants-fond").style.display = "none"; modaleParticipants = null; });
document.getElementById("participants-ajouter").addEventListener("click", ajouterParticipantDepuisSaisie);
document.getElementById("participants-saisie").addEventListener("keydown", (e) => { if (e.key === "Enter") ajouterParticipantDepuisSaisie(); });
document.getElementById("participants-saisie").addEventListener("change", ajouterParticipantDepuisSaisie);
document.getElementById("participants-liste").addEventListener("click", (e) => {
  const b = e.target.closest(".chip-retirer");
  if (!b || !modaleParticipants) return;
  const id = Number(b.getAttribute("data-acteur-id"));
  enregistrerParticipantsRida(idsParticipantsRida(ridaToutes.find(x => x.id === modaleParticipants.ridaId)).filter(x => x !== id));
});

// ===================== KPI de délais, histogrammes et frise (v0.120) =====================
// Jours ouvrés : lundi–vendredi hors jours fériés français. Durée entre A et B = nombre de jours ouvrés dans ]A ; B].
function joursFeriesFrance(annee) {
  const cle = (d) => d.toISOString().slice(0, 10);
  const S = new Set(["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"].map(x => annee + "-" + x));
  // Pâques (algorithme de Meeus/Jones/Butcher)
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mois = Math.floor((hh + l - 7 * m + 114) / 31), jour = ((hh + l - 7 * m + 114) % 31) + 1;
  const paques = new Date(Date.UTC(annee, mois - 1, jour));
  [1, 39, 50].forEach(n => S.add(cle(new Date(paques.getTime() + n * 86400000)))); // lundi de Pâques, Ascension, lundi de Pentecôte
  return S;
}
const cacheFeries = {};
function estJourOuvre(jourUtcMs) {
  const d = new Date(jourUtcMs), dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const an = d.getUTCFullYear();
  if (!cacheFeries[an]) cacheFeries[an] = joursFeriesFrance(an);
  return !cacheFeries[an].has(d.toISOString().slice(0, 10));
}
// A, B : epoch en secondes. Retourne null si une date manque ou si B est antérieure à A.
function joursOuvresEntre(a, b) {
  if (!a || !b) return null;
  const jA = Math.floor(Number(a) / 86400), jB = Math.floor(Number(b) / 86400);
  if (!(jB >= jA) || jB - jA > 20000) return null;
  let n = 0;
  for (let jour = jA + 1; jour <= jB; jour++) if (estJourOuvre(jour * 86400000)) n++;
  return n;
}
// --- Activité RIDA par demande (mini-graphique de la vue liste) ---
// Trois périodes glissantes sans chevauchement : 7 derniers jours, 8 à 30 jours, avant.
// Lignes comptées : toutes sauf journal automatique, datées par « Fait le » sinon « Pour le ».
const PLAFOND_BARRE_ACTIVITE = 10;
function activiteRidaParDemande() {
  const auj = aujourdHuiEpoch(), j7 = auj - 6 * 86400, j30 = auj - 29 * 86400;
  const m = new Map();
  ridaToutes.forEach(r => {
    if (estLigneJournalAuto(r)) return;
    const id = idDepuisRef(r.ID2); if (!id) return;
    const t = Number(r.Fait_le || r.Pour_le) || 0;
    const a = m.get(id) || { sem: 0, mois: 0, avant: 0 };
    if (t >= j7) a.sem++; else if (t >= j30) a.mois++; else a.avant++;
    m.set(id, a);
  });
  return m;
}
function activiteRidaHtml(a) {
  a = a || { sem: 0, mois: 0, avant: 0 };
  const barre = (n, lib, cls) => "<div class='act-col' title='" + n + " RIDA — " + lib + "'><div class='act-nb'>" + (n || "") + "</div><div class='act-barre " + cls + "' style='height:" + (n ? Math.max(3, Math.round(Math.min(n, PLAFOND_BARRE_ACTIVITE) / PLAFOND_BARRE_ACTIVITE * 28)) : 1) + "px;'></div></div>";
  return "<div class='act-graph' title='Activité RIDA : avant (gauche) · 8 à 30 jours · 7 derniers jours (droite)'>" +
    barre(a.avant, "il y a plus de 30 jours", "act-ancien") + barre(a.mois, "entre 8 et 30 jours", "act-mois") + barre(a.sem, "7 derniers jours", "act-semaine") + "</div>";
}
function datePremierAtelier(demandeId) {
  const a = lignesAteliersDeDemande(demandeId);
  return a.length ? a[0].date : 0;
}
function lignesAteliersDeDemande(demandeId) {
  return ridaToutes.filter(r => idDepuisRef(r.ID2) === demandeId && !estLigneJournalAuto(r) && estAtelierRida(r))
    .map(r => ({ r, date: Number(r.Fait_le || r.Pour_le) || 0 })).filter(x => x.date)
    .sort((x, y) => x.date - y.date);
}
function kpisDemande(l) {
  const entree = Number(l.Date_de_soumission) || 0;
  const ateliers = lignesAteliersDeDemande(l.id);
  const premier = ateliers.length ? ateliers[0].date : 0;
  const inverse = (a, b) => !!(a && b && Math.floor(b / 86400) < Math.floor(a / 86400));
  return {
    gonogo: joursOuvresEntre(entree, Number(l.Date_Go_NoGo_SDID) || 0),
    mvp: joursOuvresEntre(entree, Number(l.Date_MVP_realisee) || 0),
    atelier: joursOuvresEntre(entree, premier),
    incoherent: { gonogo: inverse(entree, Number(l.Date_Go_NoGo_SDID)), mvp: inverse(entree, Number(l.Date_MVP_realisee)), atelier: inverse(entree, premier) },
    premierAtelier: premier
  };
}
const DEFINITIONS_KPI = [
  { cle: "gonogo", libelle: "Date d'entrée → Go/noGo SDID", couleur: "#3b5bdb" },
  { cle: "mvp", libelle: "Date d'entrée → MVP réalisé", couleur: "#2b9348" },
  { cle: "atelier", libelle: "Date d'entrée → 1er atelier", couleur: "#e07b1f" }
];
function genererKpiFicheHtml(ligne) {
  const k = kpisDemande(ligne);
  const tuile = (d) => {
    const v = k[d.cle];
    const txt = v != null ? v + " j" : (k.incoherent[d.cle] ? "dates incohérentes" : "—");
    return "<div class='kpi-tuile' title='Jours ouvrés (lundi–vendredi hors jours fériés français)'><div class='kpi-valeur' style='color:" + d.couleur + "'>" + txt + "</div>" +
      "<div class='kpi-libelle'>" + d.libelle + "</div></div>";
  };
  return "<div class='kpi-bloc'><div class='champ-label'>Délais (en jours ouvrés)</div><div class='kpi-tuiles'>" + DEFINITIONS_KPI.map(tuile).join("") + "</div></div>";
}

// --- Histogrammes (onglet Activité) : distribution des délais, période sur la Date d'entrée, filtre par tag ---
const TRANCHES_DELAIS = [
  { lib: "0–5 j", min: 0, max: 5 }, { lib: "6–10 j", min: 6, max: 10 }, { lib: "11–20 j", min: 11, max: 20 },
  { lib: "21–40 j", min: 21, max: 40 }, { lib: "41–60 j", min: 41, max: 60 }, { lib: "> 60 j", min: 61, max: Infinity }
];
function medianeDelais(t) { const s = t.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
function delaisActivitePeriode() {
  const debutEl = document.getElementById("delais-debut"), moisEl = document.getElementById("delais-duree"), tagEl = document.getElementById("delais-tag");
  const debut = inputVersDateEpoch(debutEl.value), mois = Math.max(1, parseInt(moisEl.value, 10) || 12);
  let fin = null;
  if (debut) { const d = new Date(debut * 1000); fin = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, d.getUTCDate()) / 1000); }
  const tag = tagEl.value;
  return lignesEmergence.filter(l => {
    const e = Number(l.Date_de_soumission) || 0;
    if (!e) return false;
    if (debut && e < debut) return false;
    if (fin && e >= fin) return false;
    return !tag || tagsDeLigne(l).includes(tag);
  });
}
let delaisInitialise = false;
function afficherDelaisActivite() {
  const zone = document.getElementById("delais-histogrammes");
  if (!zone) return;
  if (!delaisInitialise) {
    delaisInitialise = true;
    const d = new Date(); const debut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1));
    document.getElementById("delais-debut").value = debut.toISOString().slice(0, 10);
    ["delais-debut", "delais-duree", "delais-tag"].forEach(id => document.getElementById(id).addEventListener("change", afficherDelaisActivite));
  }
  const tagEl = document.getElementById("delais-tag"), tagActuel = tagEl.value;
  const tags = [...new Set(listeTagsDefinis().concat(...lignesEmergence.map(tagsDeLigne)))];
  tagEl.innerHTML = "<option value=''>Tous les tags</option>" + tags.map(t => "<option value=\"" + escapeHtml(t) + "\"" + (t === tagActuel ? " selected" : "") + ">" + escapeHtml(t) + "</option>").join("");
  const lignes = delaisActivitePeriode();
  const kpis = lignes.map(kpisDemande);
  document.getElementById("delais-resume").textContent = lignes.length + " demande" + (lignes.length > 1 ? "s" : "") + " entrée" + (lignes.length > 1 ? "s" : "") + " sur la période";
  zone.innerHTML = DEFINITIONS_KPI.map(def => {
    const valeurs = kpis.map(k => k[def.cle]).filter(v => v != null);
    const comptes = TRANCHES_DELAIS.map(t => valeurs.filter(v => v >= t.min && v <= t.max).length);
    const max = Math.max(1, ...comptes);
    const barres = TRANCHES_DELAIS.map((t, i) =>
      "<div class='histo-col' title='" + comptes[i] + " demande(s) : " + t.lib + "'><div class='histo-nb'>" + (comptes[i] || "") + "</div>" +
      "<div class='histo-barre' style='height:" + Math.round(comptes[i] / max * 100) + "%;background:" + def.couleur + ";'></div><div class='histo-lib'>" + t.lib + "</div></div>").join("");
    const moy = valeurs.length ? (valeurs.reduce((s, v) => s + v, 0) / valeurs.length) : null, med = medianeDelais(valeurs);
    return "<div class='histo-carte'><div class='histo-titre'>" + def.libelle + "</div><div class='histo-barres'>" + barres + "</div>" +
      "<div class='histo-stats'>" + (valeurs.length ? valeurs.length + " mesure(s) · médiane " + med + " j · moyenne " + (Math.round(moy * 10) / 10) + " j" : "Aucune mesure sur la période") + "</div></div>";
  }).join("");
}

// --- Frise chronologique en haut de la section RIDA de la fiche ---
function genererFriseRidaHtml(ligne, ridaLies) {
  const entree = Number(ligne.Date_de_soumission) || 0;
  const aujourdhui = aujourdHuiEpoch();
  const ateliers = lignesAteliersDeDemande(ligne.id);
  const datesRida = ridaLies.filter(x => !estLigneJournalAuto(x)).map(x => Number(x.Fait_le || x.Pour_le)).filter(Boolean);
  const debut = entree || (datesRida.length ? Math.min(...datesRida) : 0);
  if (!debut) return "";
  const cloture = Number(ligne.Date_de_cloture) || 0;
  const jalons = [{ t: debut, lib: "Entrée", cls: "debut" }];
  if (Number(ligne.Date_Go_NoGo_SDID)) jalons.push({ t: Number(ligne.Date_Go_NoGo_SDID), lib: "Go/noGo", cls: "gonogo" });
  if (Number(ligne.Date_MVP_previsionnelle)) jalons.push({ t: Number(ligne.Date_MVP_previsionnelle), lib: "MVP prévu", cls: "mvp-prev" });
  if (Number(ligne.Date_MVP_realisee)) jalons.push({ t: Number(ligne.Date_MVP_realisee), lib: "MVP réalisé", cls: "mvp-reel" });
  ateliers.forEach((a, i) => {
    const noms = nomsParticipantsRida(a.r);
    jalons.push({ t: a.date, lib: i === 0 ? "1er atelier" : "Atelier " + (i + 1), cls: "atelier",
      info: noms.length ? " — " + noms.length + " participant(s) : " + noms.join(", ") : " — aucun participant" });
  });
  jalons.push(cloture ? { t: cloture, lib: "Clôture", cls: "fin" } : { t: aujourdhui, lib: "Aujourd'hui", cls: "aujourdhui" });
  const fin = Math.max(...jalons.map(x => x.t), debut + 86400);
  const span = Math.max(fin - debut, 86400);
  const pct = (t) => Math.min(100, Math.max(0, (t - debut) / span * 100));
  jalons.sort((x, y) => x.t - y.t);
  const marques = jalons.map((x, i) =>
    "<div class='frise-jalon frise-" + x.cls + " " + (i % 2 ? "frise-bas" : "frise-haut") + "' style='left:" + pct(x.t) + "%;' title=\"" + escapeHtml(x.lib + " — " + formaterDate(x.t) + (x.info || "")) + "\">" +
    "<div class='frise-label'>" + escapeHtml(x.lib) + "<br><span>" + formaterDate(x.t) + "</span></div><div class='frise-point'></div></div>").join("");
  const progression = cloture ? 100 : pct(Math.min(aujourdhui, fin));
  // Points « jours d'action » : un petit point par jour comportant au moins une ligne RIDA
  const parJour = new Map();
  ridaLies.filter(x => !estLigneJournalAuto(x)).forEach(x => {
    const t = Number(x.Fait_le || x.Pour_le); if (!t) return;
    const j = Math.floor(t / 86400) * 86400;
    if (!parJour.has(j)) parJour.set(j, []);
    parJour.get(j).push(x);
  });
  const joursJalons = new Set(jalons.map(x => Math.floor(x.t / 86400) * 86400));
  const pointsAction = [...parJour.entries()].filter(([j]) => j >= debut - 86399 && j <= fin).sort((a, b) => a[0] - b[0]);
  const petitsPoints = pointsAction.filter(([j]) => !joursJalons.has(j)).map(([j, lignes]) => {
    const resume = lignes.map(x => (x.RIDA ? x.RIDA + " : " : "") + String(x.Description || "").replace(/\s+/g, " ").slice(0, 80)).join("\n");
    return "<div class='frise-jour' style='left:" + pct(j) + "%;' title=\"" + escapeHtml(formaterDate(j) + " — " + lignes.length + " action(s)\n" + resume) + "\"></div>";
  }).join("");
  // Délais (jours ouvrés) entre points consécutifs : jalons + jours d'action
  const tousTemps = [...new Set([...joursJalons, ...pointsAction.map(([j]) => j)])].sort((a, b) => a - b);
  let delais = "";
  for (let i = 1; i < tousTemps.length; i++) {
    const a = tousTemps[i - 1], b = tousTemps[i];
    const largeur = pct(b) - pct(a);
    const n = joursOuvresEntre(a, b);
    if (n == null || largeur < 4) continue;
    delais += "<div class='frise-delai' style='left:" + (pct(a) + largeur / 2) + "%;' title=\"" + n + " jour(s) ouvré(s) entre le " + formaterDate(a) + " et le " + formaterDate(b) + "\">" + n + " j</div>";
  }
  return "<div class='frise' title=\"Chronologie de la demande, de la date d'entrée " + (cloture ? "à la clôture" : "à aujourd'hui") + "\">" +
    "<div class='frise-piste'><div class='frise-progres' style='width:" + progression + "%;'></div>" + delais + petitsPoints + marques + "</div></div>";
}


// ===================== Onglet Messages (v0.162) : table Emergence_BalInno =====================
// Colonnes : Recu (DateTime), Expediteur, Destinataires, Sujet, Message, UID. La liste n'affiche pas le contenu ;
// un clic sur une ligne ouvre le message mis en forme. La date de réception est affichée sans l'heure.
const TABLE_MESSAGES = "Emergence_BalInno";
let messagesBrut = [];        // [{ id, recu (epoch s), expediteur, destinataires, sujet, message, uid }]
let messagesCharges = false;
let colonneDemandesMessagesPresente = true;
let messagesErreur = "";
// Colonnes du tableau Messages : ordre et largeurs modifiables (en-têtes déplaçables / poignées), mémorisés dans le navigateur
const COLONNES_MESSAGES_DEFAUT = ["Recu", "Sens", "Expediteur", "Destinataires", "Sujet", "Demandes"];
const LARGEURS_MESSAGES_DEFAUT = { Recu: 110, Sens: 80, Expediteur: 220, Destinataires: 220, Sujet: 320, Demandes: 240 };
let ordreMessages = COLONNES_MESSAGES_DEFAUT.slice();
let largeursMessages = Object.assign({}, LARGEURS_MESSAGES_DEFAUT);
(function chargerDispositionMessages() {
  try {
    const o = JSON.parse(window.localStorage.getItem("emergence_ordre_messages") || "null");
    if (Array.isArray(o)) { const v = o.filter((c, i) => COLONNES_MESSAGES_DEFAUT.includes(c) && o.indexOf(c) === i); COLONNES_MESSAGES_DEFAUT.forEach(c => { if (!v.includes(c)) v.push(c); }); ordreMessages = v; }
    const l = JSON.parse(window.localStorage.getItem("emergence_largeurs_messages") || "null");
    if (l && typeof l === "object") Object.keys(l).forEach(k => { if (k in LARGEURS_MESSAGES_DEFAUT && Number(l[k]) >= 40) largeursMessages[k] = Number(l[k]); });
  } catch (e) { /* disposition par défaut */ }
})();
function sauvegarderDispositionMessages() {
  try { window.localStorage.setItem("emergence_ordre_messages", JSON.stringify(ordreMessages)); window.localStorage.setItem("emergence_largeurs_messages", JSON.stringify(largeursMessages)); } catch (e) { /* non mémorisé */ }
}
let colonnesVisiblesMessages = new Set(COLONNES_MESSAGES_DEFAUT);
(function chargerColonnesMasqueesMessages() {
  try {
    const m = JSON.parse(window.localStorage.getItem("emergence_colonnes_masquees_messages") || "[]");
    if (Array.isArray(m)) m.forEach(c => { if (COLONNES_MESSAGES_DEFAUT.includes(c) && colonnesVisiblesMessages.size > 1) colonnesVisiblesMessages.delete(c); });
  } catch (e) { /* toutes visibles */ }
})();
function sauvegarderColonnesMasqueesMessages() {
  try { window.localStorage.setItem("emergence_colonnes_masquees_messages", JSON.stringify(COLONNES_MESSAGES_DEFAUT.filter(c => !colonnesVisiblesMessages.has(c)))); } catch (e) { /* non mémorisé */ }
}
const LIBELLES_COLONNES_MESSAGES = { Recu: "Date", Sens: "Sens (reçu / envoyé)", Expediteur: "Expéditeur", Destinataires: "Destinataires", Sujet: "Sujet", Demandes: "Demandes liées" };
function colonnesMessagesVisiblesOrdonnees() { return ordreMessages.filter(c => colonnesVisiblesMessages.has(c)); }
function derniereColonneMessagesVisible() { const v = colonnesMessagesVisiblesOrdonnees(); return v.length ? v[v.length - 1] : null; }
// Comme dans la liste des demandes : la dernière colonne visible est « élastique » (prend la place restante, non redimensionnable),
// les autres ont une largeur fixe ; les colonnes masquées disparaissent de l'en-tête et des lignes.
function appliquerDispositionMessages() {
  const table = document.getElementById("table-messages");
  if (!table) return;
  const tr = table.querySelector("thead tr");
  // Réordonner les en-têtes seulement si l'ordre a changé : replacer un <th> dans le DOM pendant un redimensionnement
  // détacherait la poignée (le navigateur perd la capture du pointeur et la colonne « décroche »).
  const actuel = [...tr.querySelectorAll("th[data-col-msg]")].map(t => t.getAttribute("data-col-msg"));
  if (actuel.join() !== ordreMessages.join()) {
    ordreMessages.forEach(c => { const th = tr.querySelector("th[data-col-msg='" + c + "']"); if (th) tr.appendChild(th); });
    const fixe = tr.querySelector("th[data-fixe='corbeille']"); if (fixe) tr.insertBefore(fixe, tr.firstChild);
  }
  const elastique = derniereColonneMessagesVisible();
  tr.querySelectorAll("th[data-col-msg]").forEach(th => {
    const c = th.getAttribute("data-col-msg");
    th.style.display = colonnesVisiblesMessages.has(c) ? "" : "none";
    if (c === elastique) { th.style.width = ""; th.style.minWidth = "120px"; th.style.maxWidth = ""; }
    else { const w = largeursMessages[c]; th.style.width = w + "px"; th.style.minWidth = w + "px"; th.style.maxWidth = w + "px"; }
  });
  table.style.width = "100%";
  table.style.minWidth = "";
}
function construirePopupColonnesMessages() {
  const popup = document.getElementById("popup-config-colonnes-messages");
  if (!popup) return;
  popup.innerHTML = COLONNES_MESSAGES_DEFAUT.map(c =>
    "<label><input type='checkbox' class='case-config-colonne-messages' value='" + c + "'" + (colonnesVisiblesMessages.has(c) ? " checked" : "") + ">" + escapeHtml(LIBELLES_COLONNES_MESSAGES[c]) + "</label>").join("") +
    "<div class='bloc-export-excel'><button type='button' id='msg-reinit-colonnes' title=\"Remet les colonnes dans leur ordre, leurs largeurs et leur affichage d'origine (déplacer = glisser un en-tête ; redimensionner = bord droit de l'en-tête)\">↺ Réinitialiser les colonnes</button></div>";
  popup.querySelectorAll(".case-config-colonne-messages").forEach(cb => cb.addEventListener("change", () => {
    if (cb.checked) colonnesVisiblesMessages.add(cb.value);
    else if (colonnesVisiblesMessages.size > 1) colonnesVisiblesMessages.delete(cb.value);
    else cb.checked = true; // au moins une colonne reste affichée
    sauvegarderColonnesMasqueesMessages(); afficherMessages();
  }));
  popup.querySelector("#msg-reinit-colonnes").addEventListener("click", (e) => {
    e.stopPropagation();
    ordreMessages = COLONNES_MESSAGES_DEFAUT.slice(); largeursMessages = Object.assign({}, LARGEURS_MESSAGES_DEFAUT); colonnesVisiblesMessages = new Set(COLONNES_MESSAGES_DEFAUT);
    sauvegarderDispositionMessages(); sauvegarderColonnesMasqueesMessages(); afficherMessages(); construirePopupColonnesMessages();
  });
}
let filtresMessages = {};      // filtres par colonne (🔎 dans les en-têtes) : { Expediteur: "…", … }
let triMessages = { col: "Recu", sens: "desc" };
let messagesAffiches = [];    // liste filtrée + triée courante (pour ← →)
let indexMessageOuvert = -1;

async function chargerMessages() {
  messagesErreur = "";
  try {
    const t = await grist.docApi.fetchTable(TABLE_MESSAGES);
    const ids = t.id || [];
    // colonne « $BAL » (entrant / sortant) : son identifiant Grist est « BAL » (ou proche) ; vide = entrant
    const colBal = Object.keys(t).find(k => /^_*bal\d*$/i.test(k)) || "";
    messagesBrut = ids.map((id, i) => ({
      id, recu: Number(t.Recu && t.Recu[i]) || 0,
      expediteur: String((t.Expediteur && t.Expediteur[i]) || ""), destinataires: String((t.Destinataires && t.Destinataires[i]) || ""),
      sujet: String((t.Sujet && t.Sujet[i]) || ""), message: String((t.Message && t.Message[i]) || ""), uid: t.UID ? t.UID[i] : null,
      demandes: refListVersIds(t.Demandes ? t.Demandes[i] : null).map(Number).filter(Boolean),
      sens: /sort|envoy|sent|out/i.test(String(colBal ? t[colBal][i] : "")) ? "sortant" : "entrant"
    }));
    colonneDemandesMessagesPresente = "Demandes" in t;
    messagesCharges = true;
  } catch (e) {
    messagesBrut = []; messagesCharges = false;
    messagesErreur = "Table « " + TABLE_MESSAGES + " » illisible : " + (e && e.message || e);
  }
}
// --- Lien messages ↔ demandes (colonne Emergence_BalInno.Demandes : RefList vers Emergence) ---
function titreDemande(id) {
  const l = lignesEmergence.find(x => x.id === id);
  return l ? (l.Titre || "Demande " + id) : "(demande supprimée #" + id + ")";
}
function emailsDeTexte(texte) {
  return [...new Set((String(texte || "").match(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map(x => x.toLowerCase()))];
}
function acteursDeEmails(texte) {
  const mails = emailsDeTexte(texte);
  return Object.keys(acteursParId).filter(id => mails.includes(String(acteursParId[id].mail || "").trim().toLowerCase())).map(Number);
}
function acteurImpliqueDansDemande(l, ids) { // nombre d'acteurs de ids impliqués (sponsor, porteur, partie prenante)
  const noms = ids.map(id => normaliserTexteRecherche(nomActeurParId(id)));
  const pp = refListVersIds(l.Parties_prenantes_concernees).map(Number), sp = Number(idDepuisRef(l.Sponsor));
  return ids.filter((id, k) => id === sp || pp.includes(id) || (l.Porteurs && normaliserTexteRecherche(l.Porteurs) === noms[k])).length;
}
// Suggestion de demandes pour un message : acteurs dont le mail correspond à l'expéditeur (à défaut, aux destinataires), puis
// demandes où ils sont sponsor, porteur ou partie prenante. S'il y en a plusieurs, on affine d'abord avec le titre (présent dans
// le sujet ou le début du message), puis avec les destinataires (demandes impliquant le plus de destinataires connus).
function suggestionDemandesMessage(m) {
  if (m.sens === "sortant") return suggestionDemandesMessageSortant(m);
  const expediteurs = acteursDeEmails(m.expediteur);
  const destinataires = acteursDeEmails(m.destinataires).filter(id => !expediteurs.includes(id));
  const base = expediteurs.length ? expediteurs : destinataires;
  if (!base.length) return { ids: [], etat: "inconnu" };
  let cand = lignesEmergence.filter(l => acteurImpliqueDansDemande(l, base) > 0).map(l => l.id);
  if (!cand.length) return { ids: [], etat: "aucune" };
  if (cand.length === 1) return { ids: cand, etat: "unique" };
  let etat = "affine";
  const texte = normaliserTexteRecherche(m.sujet + " " + m.message.slice(0, 3000));
  const parTitre = cand.filter(id => { const t = normaliserTexteRecherche(titreDemande(id)); return t.length >= 4 && texte.includes(t); });
  if (parTitre.length) cand = parTitre;
  if (cand.length === 1) return { ids: cand, etat };
  // destinataires : seulement s'ils ont servi à autre chose que de base (expéditeur connu)
  if (expediteurs.length && destinataires.length) {
    const score = id => acteurImpliqueDansDemande(lignesEmergence.find(l => l.id === id), destinataires);
    const best = Math.max(...cand.map(score));
    if (best > 0) { const top = cand.filter(id => score(id) === best); if (top.length < cand.length) cand = top; }
    if (cand.length === 1) return { ids: cand, etat: "affine-destinataires" };
  }
  if (parTitre.length) return { ids: cand, etat: "affine" }; // le titre figure dans le message : lien probable avec chacune de ces demandes
  return { ids: [], etat: "ambigu", candidats: cand };
}
// Message envoyé : le rattachement se fait uniquement sur les destinataires (acteurs dont le mail correspond), puis titre,
// puis nombre de destinataires impliqués dans la demande.
function suggestionDemandesMessageSortant(m) {
  const dest = acteursDeEmails(m.destinataires);
  if (!dest.length) return { ids: [], etat: "inconnu" };
  const score = l => acteurImpliqueDansDemande(l, dest);
  let cand = lignesEmergence.filter(l => score(l) > 0);
  if (!cand.length) return { ids: [], etat: "aucune" };
  if (cand.length === 1) return { ids: [cand[0].id], etat: "unique" };
  const texte = normaliserTexteRecherche(m.sujet + " " + m.message.slice(0, 3000));
  const parTitre = cand.filter(l => { const t = normaliserTexteRecherche(titreDemande(l.id)); return t.length >= 4 && texte.includes(t); });
  if (parTitre.length) { cand = parTitre; if (cand.length === 1) return { ids: [cand[0].id], etat: "affine" }; }
  const best = Math.max(...cand.map(score));
  const top = cand.filter(l => score(l) === best);
  if (top.length === 1) return { ids: [top[0].id], etat: "affine-destinataires" };
  if (parTitre.length) return { ids: top.map(l => l.id), etat: "affine" };
  return { ids: [], etat: "ambigu", candidats: top.map(l => l.id) };
}
async function enregistrerDemandesMessage(msgId, ids) {
  await grist.docApi.applyUserActions([["UpdateRecord", TABLE_MESSAGES, msgId, { Demandes: ids.length ? ["L"].concat(ids) : null }]]);
  const m = messagesBrut.find(x => x.id === msgId);
  if (m) m.demandes = ids.slice();
}
async function modifierLiensMessage(msgId, fn) {
  const m = messagesBrut.find(x => x.id === msgId);
  if (!m) return;
  if (!colonneDemandesMessagesPresente) { alert("La colonne « Demandes » n'existe pas dans " + TABLE_MESSAGES + " (RefList vers Emergence) : lancez l'outil de migration de structure."); return; }
  const ids = [...new Set(fn(m.demandes.slice()))];
  await enregistrerDemandesMessage(msgId, ids);
  rafraichirApresChangementLiens();
}
async function supprimerMessage(msgId) {
  const m = messagesBrut.find(x => x.id === msgId);
  if (!m) return;
  const lib = (m.sens === "sortant" ? "envoyé à " + (m.destinataires || "?") : "reçu de " + (m.expediteur || "?")) + " — « " + (m.sujet || "sans sujet") + " »";
  if (!window.confirm("Supprimer définitivement ce message (" + lib + ") de la table " + TABLE_MESSAGES + " ?" + (m.demandes.length ? "\nIl disparaîtra aussi du RIDA des demandes liées." : ""))) return false;
  await grist.docApi.applyUserActions([["RemoveRecord", TABLE_MESSAGES, msgId]]);
  messagesBrut = messagesBrut.filter(x => x.id !== msgId);
  return true;
}
function rafraichirApresChangementLiens() {
  afficherMessages();
  if (indexMessageOuvert >= 0 && document.getElementById("modale-message-fond").style.display !== "none") rendreBlocDemandesMessage();
  if (ligneSelectionneeId != null) rafraichirOngletMessagesFiche();
}
function dateMessage(epoch) {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  return String(d.getDate()).padStart(2, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + d.getFullYear();
}
function inputDateVersEpochDebut(v) { return v ? Math.floor(new Date(v + "T00:00:00").getTime() / 1000) : 0; }
function inputDateVersEpochFin(v) { return v ? Math.floor(new Date(v + "T23:59:59").getTime() / 1000) : 0; }

// Recherche avancée (v0.162) : dans l'onglet Messages d'une fiche demande. horsSdid = ne garder que les messages avec
// au moins un interlocuteur non SDID.
function messageHorsSdid(m) {
  // interlocuteurs = expéditeur (message reçu) ou destinataires (message envoyé) ; un acteur dont l'organisation contient « SDID » est interne
  const mails = emailsDeTexte(m.sens === "sortant" ? m.destinataires : m.expediteur);
  if (!mails.length) return true; // adresse illisible : on garde (non identifiable comme SDID)
  const sdid = new Set(Object.values(acteursParId).filter(a => /sdid/i.test(String(a.Organisation || "") + " " + String(a.Organisation_Path || ""))).map(a => String(a.mail || "").trim().toLowerCase()).filter(Boolean));
  return mails.some(x => !sdid.has(x));
}
function messagesFiltresTries() {
  const global = normaliserTexteRecherche(document.getElementById("msg-recherche").value || "");
  const sensFiltre = document.getElementById("msg-sens").value;
  const debut = inputDateVersEpochDebut(document.getElementById("msg-date-debut").value);
  const fin = inputDateVersEpochFin(document.getElementById("msg-date-fin").value);
  const colonnes = {};
  Object.keys(filtresMessages).forEach(k => { const v = normaliserTexteRecherche(filtresMessages[k] || ""); if (v) colonnes[k] = v; });
  const champ = { Expediteur: "expediteur", Destinataires: "destinataires", Sujet: "sujet", Demandes: "demandesTexte" };
  messagesBrut.forEach(m => { m.demandesTexte = m.demandes.map(titreDemande).join(", "); });
  const liste = messagesBrut.filter(m => {
    if (sensFiltre && m.sens !== sensFiltre) return false;
    if (debut && m.recu < debut) return false;
    if (fin && m.recu > fin) return false;
    for (const k of Object.keys(colonnes)) if (!normaliserTexteRecherche(m[champ[k]]).includes(colonnes[k])) return false;
    if (global && !normaliserTexteRecherche(m.expediteur + " " + m.destinataires + " " + m.sujet + " " + m.message).includes(global)) return false;
    return true;
  });
  const cle = { Recu: "recu", Expediteur: "expediteur", Destinataires: "destinataires", Sujet: "sujet", Demandes: "demandesTexte", Sens: "sens" }[triMessages.col] || "recu";
  const sens = triMessages.sens === "asc" ? 1 : -1;
  liste.sort((a, b) => {
    const x = a[cle], y = b[cle];
    const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr", { sensitivity: "base" });
    return c * sens || (b.recu - a.recu);
  });
  return liste;
}

function celluleDemandesMessageHtml(m) {
  if (m.demandes.length) {
    const noms = m.demandes.map(titreDemande);
    return "<td title=\"" + escapeHtml(noms.join("\n")) + "\"><span class='msg-lien-demande'>" + escapeHtml(noms.join(", ")) + "</span></td>";
  }
  const sg = suggestionDemandesMessage(m);
  if (sg.ids.length) return "<td class='msg-suggestion' title=\"Suggestion d'après l'expéditeur (pas encore enregistrée)\">≈ " + escapeHtml(sg.ids.map(titreDemande).join(", ")) + "</td>";
  if (sg.etat === "ambigu") return "<td class='msg-suggestion' title=\"" + escapeHtml("Plusieurs demandes possibles :\n" + sg.candidats.map(titreDemande).join("\n")) + "\">? " + sg.candidats.length + " demandes possibles</td>";
  return "<td></td>";
}
function deplacerColonneMessages(col, cible, avant) {
  const i = ordreMessages.indexOf(col);
  if (i < 0 || ordreMessages.indexOf(cible) < 0) return;
  ordreMessages.splice(i, 1);
  let j = ordreMessages.indexOf(cible);
  if (!avant) j++;
  ordreMessages.splice(j, 0, col);
  sauvegarderDispositionMessages();
  afficherMessages();
}
function afficherMessages() {
  appliquerDispositionMessages();
  const corps = document.getElementById("corps-messages");
  messagesAffiches = messagesFiltresTries();
  document.querySelectorAll("#table-messages th[data-col-msg]").forEach(th => {
    const f = th.querySelector(".fleche");
    if (f) f.textContent = th.getAttribute("data-col-msg") === triMessages.col ? (triMessages.sens === "asc" ? "▲" : "▼") : "";
  });
  document.getElementById("msg-compteur").textContent = messagesErreur ? "" :
    messagesAffiches.length + " message" + (messagesAffiches.length > 1 ? "s" : "") + (messagesAffiches.length !== messagesBrut.length ? " sur " + messagesBrut.length : "");
  if (messagesErreur) { corps.innerHTML = "<tr><td colspan='7' class='msg-vide'>" + escapeHtml(messagesErreur) + "</td></tr>"; return; }
  if (!messagesAffiches.length) { corps.innerHTML = "<tr><td colspan='7' class='msg-vide'>Aucun message.</td></tr>"; return; }
  corps.innerHTML = messagesAffiches.map((m, i) => {
    const cellules = {
      Recu: "<td>" + escapeHtml(dateMessage(m.recu)) + "</td>",
      Sens: "<td title='" + (m.sens === "sortant" ? "Message envoyé" : "Message reçu") + "' class='msg-sens msg-sens-" + m.sens + "'>" + (m.sens === "sortant" ? "↑ envoyé" : "↓ reçu") + "</td>",
      Expediteur: "<td title=\"" + escapeHtml(m.expediteur) + "\">" + escapeHtml(m.expediteur) + "</td>",
      Destinataires: "<td title=\"" + escapeHtml(m.destinataires) + "\">" + escapeHtml(m.destinataires) + "</td>",
      Sujet: "<td title=\"" + escapeHtml(m.sujet) + "\">" + escapeHtml(m.sujet || "(sans sujet)") + "</td>",
      Demandes: celluleDemandesMessageHtml(m)
    };
    return "<tr data-msg-index='" + i + "'><td class='msg-corbeille' title='Supprimer ce message'>🗑</td>" + colonnesMessagesVisiblesOrdonnees().map(c => cellules[c]).join("") + "</tr>";
  }).join("");
}

// --- Actualisation automatique des messages ---
// Interrogation périodique (30 s) tant que l'onglet Messages ou une fiche est affiché et que la page est visible, plus une
// actualisation immédiate à l'ouverture de l'onglet et au retour sur la page. L'affichage n'est refait que si la table a changé
// (messages ajoutés / supprimés, liens ou sens modifiés) et jamais pendant la lecture d'un message.
const INTERVALLE_ACTUALISATION_MESSAGES_MS = 30000;
let actualisationMessagesEnCours = false;
function signatureMessages(liste) { return liste.map(m => m.id + ":" + m.demandes.join("+") + ":" + m.sens + ":" + m.recu + ":" + m.sujet.length).join("|"); }
async function actualiserMessagesSilencieusement() {
  if (actualisationMessagesEnCours || !messagesCharges) return;
  if (document.getElementById("modale-message-fond").style.display !== "none") return; // lecture en cours
  actualisationMessagesEnCours = true;
  try {
    const avant = signatureMessages(messagesBrut), brutAvant = messagesBrut;
    await chargerMessages();
    if (messagesErreur) { messagesBrut = brutAvant; messagesErreur = ""; messagesCharges = true; return; } // erreur passagère : on garde l'affichage
    if (signatureMessages(messagesBrut) !== avant) {
      if (document.getElementById("vue-messages").style.display !== "none") afficherMessages();
      if (document.getElementById("fiche-messages")) rafraichirOngletMessagesFiche();
      else if (ligneSelectionneeId != null && document.getElementById("rida-tbody")) insererMessagesDansRida(messagesBrut.filter(x => x.demandes.includes(ligneSelectionneeId)));
    }
  } finally { actualisationMessagesEnCours = false; }
}
setInterval(() => {
  if (document.visibilityState === "hidden") return;
  if (document.getElementById("vue-messages").style.display !== "none" || (ligneSelectionneeId != null && document.getElementById("rida-tbody"))) actualiserMessagesSilencieusement();
}, INTERVALLE_ACTUALISATION_MESSAGES_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") actualiserMessagesSilencieusement(); });
// ===================== Recherche avancée des messages (v0.162) =====================
// 1) « Hors SDID » : messages échangés avec des personnes non SDID (organisation de l'acteur ; adresse inconnue = externe).
// 2) Corrélation IA avec une demande (ou un texte libre) : chaque message de la période est vectorisé UNE SEULE FOIS
//    (sujet + début du corps nettoyé, ~1000 car.) via /embeddings du fournisseur configuré ; les vecteurs restent en
//    mémoire pour la session et seuls les nouveaux messages sont envoyés ensuite. La recherche elle-même est une
//    similarité cosinus locale (0 token). Sans modèle d'embeddings disponible : repli TF-IDF local (mots-clés).
const TAILLE_LOT_EMBEDDINGS = 32;
const MAX_CAR_EMBEDDING = 1000;
const MAX_RESULTATS_RECHERCHE_IA = 50;
let cacheVecteursMessages = new Map();   // id message → { sig, vec } (session seulement)
let modeleEmbeddingsCache = "";          // modèle pour lequel le cache est valable
function nettoyerCorpsPourVecteur(brut) {
  let t = String(brut || "");
  if (messageEstHtml(t)) t = t.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?\w+;/g, " ");
  const coupe = t.search(/\n\s*(Le .{5,80} a écrit\s*:|De ?:\s|From:\s|-{3,}\s*(Message d'origine|Original Message))/i);
  if (coupe > 40) t = t.slice(0, coupe);
  t = t.split(/\r?\n/).filter(l => !/^\s*>/.test(l)).join(" ").replace(/\s+/g, " ").trim();
  return t.slice(0, MAX_CAR_EMBEDDING);
}
function textePourVecteur(m) { return ((m.sujet || "") + " . " + nettoyerCorpsPourVecteur(m.message)).slice(0, MAX_CAR_EMBEDDING + 200); }
function signatureTexteMessage(m) { return m.recu + ":" + (m.sujet || "").length + ":" + (m.message || "").length; }
function urlLlm(cfg, chemin) { return String(cfg.url).replace(/\/+$/, "") + chemin; }
function entetesLlm(cfg) { const e = { "Content-Type": "application/json" }; if (cfg.cle) e["Authorization"] = "Bearer " + cfg.cle; return e; }
async function trouverModeleEmbeddings(cfg) {
  if (cfg.modeleEmbeddings) return cfg.modeleEmbeddings;
  const r = await fetch(urlLlm(cfg, "/models"), { headers: entetesLlm(cfg) });
  if (!r.ok) throw new Error("liste des modèles indisponible (" + r.status + ")");
  const j = await r.json();
  const liste = Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
  const emb = liste.find(x => /embed|e5|bge|gte/i.test(String((x && (x.id || x.name)) || "") + " " + String((x && x.type) || "")));
  if (!emb) throw new Error("aucun modèle d'embeddings sur ce fournisseur");
  return String(emb.id || emb.name);
}
async function calculerEmbeddings(cfg, modele, textes) {
  const r = await fetch(urlLlm(cfg, "/embeddings"), { method: "POST", headers: entetesLlm(cfg), body: JSON.stringify({ model: modele, input: textes }) });
  if (!r.ok) { let d = ""; try { d = (await r.text()).slice(0, 200); } catch (e) { /* ignore */ } throw new Error("embeddings " + r.status + (d ? " : " + d : "")); }
  const j = await r.json();
  const data = (j && j.data || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0));
  if (data.length !== textes.length || !data.every(d => Array.isArray(d.embedding))) throw new Error("réponse embeddings inattendue");
  return data.map(d => Float32Array.from(d.embedding));
}
function cosinus(a, b) {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? p / Math.sqrt(na * nb) : 0;
}
const MOTS_VIDES_RECHERCHE = new Set("le la les un une des du de et en au aux ce ces son sa ses mon ma mes ton ta tes pour par sur dans avec sans que qui quoi est sont etre avoir bonjour cordialement merci bien votre vos notre nos je tu il elle nous vous ils elles ne pas plus the and for from this that re tr fw".split(" "));
function motsRecherche(t) { return normaliserTexteRecherche(t).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !MOTS_VIDES_RECHERCHE.has(w)); }
function scoresTfidf(requete, messages) {
  const docs = messages.map(m => { const mots = motsRecherche(textePourVecteur(m)); const f = new Map(); mots.forEach(w => f.set(w, (f.get(w) || 0) + 1)); return { m, f, n: mots.length || 1 }; });
  const df = new Map(); docs.forEach(d => d.f.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length || 1, idf = w => Math.log(1 + N / (1 + (df.get(w) || 0)));
  const q = new Map(); motsRecherche(requete).forEach(w => q.set(w, (q.get(w) || 0) + 1));
  const vec = f => { const v = new Map(); let n = 0; f.forEach((c, w) => { const x = (1 + Math.log(c)) * idf(w); v.set(w, x); n += x * x; }); return { v, n: Math.sqrt(n) }; };
  const vq = vec(q);
  const scores = new Map();
  docs.forEach(d => { const vd = vec(d.f); let p = 0; vq.v.forEach((x, w) => { if (vd.v.has(w)) p += x * vd.v.get(w); }); const s = vq.n && vd.n ? p / (vq.n * vd.n) : 0; if (s > 0) scores.set(d.m.id, s); });
  return scores;
}
function messagesDansProfondeur(mois, horsSdid, idDemandeExclue) {
  const limite = mois > 0 ? Math.floor(Date.now() / 1000) - mois * 30.5 * 86400 : 0;
  return messagesBrut.filter(m => (!limite || m.recu >= limite) && (!horsSdid || messageHorsSdid(m)) && !(idDemandeExclue && m.demandes.includes(idDemandeExclue)));
}
async function lancerRechercheIa(requete, mois, etat, horsSdid, idDemandeExclue) {
  const corpus = messagesDansProfondeur(mois, horsSdid, idDemandeExclue);
  if (!corpus.length) return { scores: new Map(), mode: "aucun", nbCorpus: 0, nbNouveaux: 0 };
  const cfg = chargerConfigLlm();
  let mode = "tfidf", raison = "";
  if (llmEstConfigure(cfg)) {
    try {
      const modele = await trouverModeleEmbeddings(cfg);
      if (modele !== modeleEmbeddingsCache) { cacheVecteursMessages = new Map(); modeleEmbeddingsCache = modele; }
      const aCalculer = corpus.filter(m => { const c = cacheVecteursMessages.get(m.id); return !c || c.sig !== signatureTexteMessage(m); });
      for (let i = 0; i < aCalculer.length; i += TAILLE_LOT_EMBEDDINGS) {
        const lot = aCalculer.slice(i, i + TAILLE_LOT_EMBEDDINGS);
        etat("Vectorisation des messages : " + Math.min(i + lot.length, aCalculer.length) + " / " + aCalculer.length + "…");
        const vecs = await calculerEmbeddings(cfg, modele, lot.map(textePourVecteur));
        lot.forEach((m, k) => cacheVecteursMessages.set(m.id, { sig: signatureTexteMessage(m), vec: vecs[k] }));
      }
      const [vq] = await calculerEmbeddings(cfg, modele, [requete.slice(0, MAX_CAR_EMBEDDING + 200)]);
      const scores = new Map();
      corpus.forEach(m => scores.set(m.id, cosinus(vq, cacheVecteursMessages.get(m.id).vec)));
      return { scores, mode: "embeddings", modele, nbCorpus: corpus.length, nbNouveaux: aCalculer.length };
    } catch (e) { raison = e && e.message || String(e); console.error("Recherche IA : embeddings indisponibles, repli TF-IDF :", e); }
  } else raison = "assistant IA non configuré";
  return { scores: scoresTfidf(requete, corpus), mode, raison, nbCorpus: corpus.length, nbNouveaux: 0 };
}
function retenirMeilleursScores(scores) {
  const tri = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!tri.length) return new Map();
  const max = tri[0][1];
  return new Map(tri.filter(([, v]) => v >= max * 0.6).slice(0, MAX_RESULTATS_RECHERCHE_IA));
}
function requeteDepuisDemande(id) {
  const l = lignesEmergence.find(x => x.id === id);
  if (!l) return "";
  return [l.Titre, l.Objet_de_la_demande, l.Synthese_de_la_demande].filter(Boolean).join(" . ");
}

async function ouvrirOngletMessages() {
  if (!messagesCharges) { document.getElementById("corps-messages").innerHTML = "<tr><td colspan='7' class='msg-vide'>Chargement…</td></tr>"; await chargerMessages(); }
  else actualiserMessagesSilencieusement(); // déjà chargé : affichage immédiat, puis mise à jour si la table a changé
  afficherMessages();
}

// --- Mise en forme du message ---
function messageEstHtml(t) { return /<\s*(html|body|div|p|br|table|span|a|img|ul|ol|li|h[1-6]|strong|b|i|blockquote)(\s|>|\/)/i.test(t || ""); }
function messageTexteVersHtml(t) {
  const lignes = String(t || "").replace(/\r\n?/g, "\n").split("\n");
  return lignes.map(l => {
    let h = escapeHtml(l).replace(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g, "<a href=\"$1\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>")
      .replace(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (m0, a, off, str) => /href="[^"]*$/.test(str.slice(0, off)) || str.slice(off - 1, off) === ">" ? m0 : "<a href=\"mailto:" + a + "\">" + a + "</a>");
    return /^\s*>/.test(l) ? "<span class='msg-citation'>" + h + "</span>" : h + "\n";
  }).join("");
}
function optionsDemandesDatalist() {
  return lignesEmergence.slice().sort((a, b) => String(a.Titre || "").localeCompare(String(b.Titre || ""), "fr"))
    .map(l => "<option value=\"#" + l.id + " — " + escapeHtml(l.Titre || "") + "\"></option>").join("");
}
function demandeDepuisSaisie(v) {
  v = String(v || "").trim(); if (!v) return null;
  const mid = v.match(/^#(\d+)/);
  if (mid) return lignesEmergence.some(l => l.id === Number(mid[1])) ? Number(mid[1]) : null;
  const n = normaliserTexteRecherche(v);
  const ex = lignesEmergence.filter(l => normaliserTexteRecherche(l.Titre) === n);
  if (ex.length === 1) return ex[0].id;
  const part = lignesEmergence.filter(l => normaliserTexteRecherche(l.Titre).includes(n));
  return part.length === 1 ? part[0].id : null;
}
function rendreBlocDemandesMessage() {
  const m = messagesAffiches[indexMessageOuvert];
  const zone = document.getElementById("msg-detail-demandes");
  if (!m) { zone.innerHTML = ""; return; }
  const chips = m.demandes.length ? m.demandes.map(id =>
    "<span class='chip'><span class='chip-texte' data-ouvrir-demande='" + id + "' style='cursor:pointer;' title='Ouvrir la demande'>" + escapeHtml(titreDemande(id)) + "</span>" +
    "<button type='button' class='chip-retirer' data-retirer-demande='" + id + "' title='Supprimer ce lien'>×</button></span>").join("") : "<span style='color:#888;'>Aucune demande liée</span>";
  const sg = m.demandes.length ? { ids: [] } : suggestionDemandesMessage(m);
  const sug = sg.ids.length ? "<div class='msg-sugg'>Suggestion d'après l'expéditeur : " + sg.ids.map(id => "<button type='button' class='btn-secondaire' data-lier-demande='" + id + "'>+ " + escapeHtml(titreDemande(id)) + "</button>").join(" ") + "</div>"
    : (sg.etat === "ambigu" ? "<div class='msg-sugg'>Plusieurs demandes possibles pour cet expéditeur : " + sg.candidats.map(id => "<button type='button' class='btn-secondaire' data-lier-demande='" + id + "'>+ " + escapeHtml(titreDemande(id)) + "</button>").join(" ") + "</div>" : "");
  zone.innerHTML = "<div><b>Demandes liées</b> <span class='chips-conteneur' style='display:inline-flex;'>" + chips + "</span></div>" + sug +
    "<div class='ajout-pp-conteneur' style='margin-top:4px;'><input type='text' id='msg-demande-saisie' list='msg-demandes-datalist' placeholder='Lier à une demande (titre ou n°)…'><datalist id='msg-demandes-datalist'>" + optionsDemandesDatalist() + "</datalist><button type='button' id='msg-demande-ajouter' title='Ajouter ce lien'>+</button></div>";
}
function ouvrirMessage(index) {
  const m = messagesAffiches[index];
  if (!m) return;
  indexMessageOuvert = index;
  document.getElementById("msg-detail-sujet").textContent = m.sujet || "(sans sujet)";
  const ligneEnt = (lib, v) => v ? "<div><b>" + lib + "</b>" + escapeHtml(v) + "</div>" : "";
  document.getElementById("msg-detail-entete").innerHTML = ligneEnt("De", m.expediteur) + ligneEnt("À", m.destinataires) + ligneEnt(m.sens === "sortant" ? "Envoyé le" : "Reçu le", dateMessage(m.recu));
  const corps = document.getElementById("msg-detail-corps");
  corps.scrollTop = 0;
  if (messageEstHtml(m.message)) {
    // HTML : affiché dans un cadre isolé (aucun script, aucune connexion externe hors images)
    const doc = "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data: https: cid:; style-src 'unsafe-inline'\">" +
      "<base target='_blank'><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;margin:0;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>" + m.message + "</body></html>";
    corps.innerHTML = "";
    const fr = document.createElement("iframe");
    fr.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    fr.setAttribute("referrerpolicy", "no-referrer");
    fr.srcdoc = doc;
    corps.appendChild(fr);
  } else {
    corps.innerHTML = "<div class='msg-texte'>" + messageTexteVersHtml(m.message) + "</div>";
  }
  rendreBlocDemandesMessage();
  document.getElementById("msg-detail-prec").disabled = index <= 0;
  document.getElementById("msg-detail-suiv").disabled = index >= messagesAffiches.length - 1;
  document.getElementById("modale-message-fond").style.display = "flex";
}
(function brancherOngletMessages() {
  const re = () => afficherMessages();
  ["msg-recherche", "msg-date-debut", "msg-date-fin", "msg-sens"].forEach(id => { document.getElementById(id).addEventListener("input", re); document.getElementById(id).addEventListener("change", re); });
  // Redimensionnement (poignée) et déplacement (glisser-déposer) des colonnes
  document.querySelectorAll("#table-messages thead .poignee").forEach(poignee => poignee.addEventListener("pointerdown", (e) => {
    const th = poignee.closest("th"), col = th.getAttribute("data-col-msg"), x0 = th.getBoundingClientRect().left;
    e.preventDefault(); e.stopPropagation();
    if (col === derniereColonneMessagesVisible()) return; // colonne élastique : suit la largeur disponible
    try { poignee.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    th.dataset.enTrainDeRedimensionner = "1"; poignee.classList.add("active-resize");
    th.setAttribute("draggable", "false"); // sinon le navigateur démarre un glisser-déposer et « pointerup » n'arrive jamais
    document.body.style.userSelect = "none"; document.body.style.cursor = "col-resize";
    let termine = false;
    const bouger = (ev) => {
      if (ev.buttons === 0) { fin(ev); return; } // bouton relâché sans évènement de fin : on arrête
      largeursMessages[col] = Math.max(50, Math.round(ev.clientX - x0)); appliquerDispositionMessages();
    };
    const fin = (ev) => {
      if (termine) return; termine = true;
      try { poignee.releasePointerCapture(ev.pointerId); } catch (err) { /* ignoré */ }
      poignee.removeEventListener("pointermove", bouger);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.removeEventListener(n, fin));
      document.removeEventListener("pointerup", fin);
      poignee.classList.remove("active-resize"); document.body.style.userSelect = ""; document.body.style.cursor = "";
      th.setAttribute("draggable", "true");
      sauvegarderDispositionMessages();
      setTimeout(() => { th.dataset.enTrainDeRedimensionner = "0"; }, 50);
    };
    poignee.addEventListener("pointermove", bouger);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(n => poignee.addEventListener(n, fin));
    document.addEventListener("pointerup", fin);
  }));
  (function () {
    const ths = document.querySelectorAll("#table-messages thead th[data-col-msg]");
    let deplacee = null;
    const nettoyer = () => ths.forEach(t => t.classList.remove("th-deplace", "th-cible-gauche", "th-cible-droite"));
    ths.forEach(th => {
      th.setAttribute("draggable", "true");
      th.addEventListener("dragstart", (e) => {
        if (th.dataset.enTrainDeRedimensionner === "1" || (e.target && e.target.classList && e.target.classList.contains("poignee"))) { e.preventDefault(); return; }
        deplacee = th.getAttribute("data-col-msg");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", deplacee); } catch (err) { /* ignoré */ }
        th.classList.add("th-deplace");
      });
      th.addEventListener("dragend", () => { deplacee = null; nettoyer(); });
      th.addEventListener("dragover", (e) => {
        if (!deplacee || deplacee === th.getAttribute("data-col-msg")) return;
        e.preventDefault();
        const r = th.getBoundingClientRect(), gauche = e.clientX < r.left + r.width / 2;
        th.classList.toggle("th-cible-gauche", gauche); th.classList.toggle("th-cible-droite", !gauche);
      });
      th.addEventListener("dragleave", () => th.classList.remove("th-cible-gauche", "th-cible-droite"));
      th.addEventListener("drop", (e) => {
        e.preventDefault();
        const cible = th.getAttribute("data-col-msg");
        if (!deplacee || deplacee === cible) { nettoyer(); return; }
        const r = th.getBoundingClientRect(), avant = e.clientX < r.left + r.width / 2;
        deplacerColonneMessages(deplacee, cible, avant);
        deplacee = null; nettoyer();
      });
    });
  })();
  // ⚙ colonnes (afficher / masquer, réinitialiser) et ✕ dans les en-têtes, comme dans la liste des demandes
  construirePopupColonnesMessages();
  document.getElementById("btn-config-colonnes-messages").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = document.getElementById("popup-config-colonnes-messages");
    pop.style.display = pop.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#conteneur-config-colonnes-messages")) document.getElementById("popup-config-colonnes-messages").style.display = "none";
  });
  document.querySelectorAll("#table-messages thead .icone-masquer-colonne").forEach(ic => ic.addEventListener("click", (e) => {
    e.stopPropagation();
    const col = ic.closest("th").getAttribute("data-col-msg");
    if (colonnesVisiblesMessages.size <= 1) return;
    colonnesVisiblesMessages.delete(col);
    sauvegarderColonnesMasqueesMessages(); afficherMessages(); construirePopupColonnesMessages();
  }));
  // Filtres par colonne : icône 🔎 dans l'en-tête, comme dans la liste des demandes
  const fermerPopupFiltre = () => { const p = document.getElementById("popup-filtre-msg"); if (p) p.remove(); };
  const marquerFiltresActifs = () => document.querySelectorAll("#table-messages [data-filtre-msg-icone]").forEach(ic => ic.classList.toggle("filtre-actif", !!(filtresMessages[ic.getAttribute("data-filtre-msg-icone")] || "").trim()));
  document.querySelectorAll("#table-messages [data-filtre-msg-icone]").forEach(ic => ic.addEventListener("click", (e) => {
    e.stopPropagation();
    const col = ic.getAttribute("data-filtre-msg-icone"), deja = document.getElementById("popup-filtre-msg");
    fermerPopupFiltre();
    if (deja && deja.getAttribute("data-col") === col) return;
    const pop = document.createElement("div");
    pop.id = "popup-filtre-msg"; pop.className = "popup-filtre-msg"; pop.setAttribute("data-col", col);
    pop.innerHTML = "<input type='text' placeholder='Filtrer…'><button type='button' class='btn-secondaire' title='Effacer ce filtre'>✕</button>";
    const r = ic.closest("th").getBoundingClientRect();
    pop.style.top = (r.bottom + 4) + "px"; pop.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 300)) + "px";
    document.body.appendChild(pop);
    const inp = pop.querySelector("input"); inp.value = filtresMessages[col] || ""; inp.focus();
    inp.addEventListener("input", () => { filtresMessages[col] = inp.value; marquerFiltresActifs(); afficherMessages(); });
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === "Escape") fermerPopupFiltre(); });
    pop.querySelector("button").addEventListener("click", () => { filtresMessages[col] = ""; inp.value = ""; marquerFiltresActifs(); afficherMessages(); inp.focus(); });
    pop.addEventListener("click", (ev) => ev.stopPropagation());
  }));
  document.addEventListener("click", (e) => { if (!e.target.closest("#popup-filtre-msg")) fermerPopupFiltre(); });
  document.getElementById("msg-reinit").addEventListener("click", () => {
    ["msg-recherche", "msg-date-debut", "msg-date-fin", "msg-sens"].forEach(id => { document.getElementById(id).value = ""; });
    filtresMessages = {};
    marquerFiltresActifs();
    afficherMessages();
  });
  document.getElementById("msg-actualiser").addEventListener("click", async () => { await chargerMessages(); afficherMessages(); });
  document.querySelectorAll("#table-messages th[data-col-msg]").forEach(th => th.addEventListener("click", (e) => {
    if (th.dataset.enTrainDeRedimensionner === "1" || e.target.closest("[data-filtre-msg-icone], .icone-masquer-colonne")) return;
    const c = th.getAttribute("data-col-msg");
    if (triMessages.col === c) triMessages.sens = triMessages.sens === "asc" ? "desc" : "asc"; else triMessages = { col: c, sens: c === "Recu" ? "desc" : "asc" };
    afficherMessages();
  }));
  document.getElementById("corps-messages").addEventListener("click", async (e) => {
    const tr = e.target.closest("tr[data-msg-index]");
    if (!tr) return;
    const m = messagesAffiches[parseInt(tr.getAttribute("data-msg-index"), 10)];
    if (e.target.closest(".msg-corbeille")) { // 🗑 à gauche de la ligne : suppression directe
      if (m && await supprimerMessage(m.id)) {
        afficherMessages();
        if (document.getElementById("fiche-messages")) rafraichirOngletMessagesFiche();
        else if (ligneSelectionneeId != null && document.getElementById("rida-tbody")) insererMessagesDansRida(messagesBrut.filter(x => x.demandes.includes(ligneSelectionneeId)));
      }
      return;
    }
    ouvrirMessage(parseInt(tr.getAttribute("data-msg-index"), 10));
  });
  const fond = document.getElementById("modale-message-fond");
  const fermer = () => { fond.style.display = "none"; document.getElementById("msg-detail-corps").innerHTML = ""; };
  document.getElementById("msg-detail-fermer").addEventListener("click", fermer);
  const zoneDem = document.getElementById("msg-detail-demandes");
  const idMsgCourant = () => { const m = messagesAffiches[indexMessageOuvert]; return m ? m.id : null; };
  const ajouterDepuisSaisie = async () => {
    const champ = document.getElementById("msg-demande-saisie"), id = demandeDepuisSaisie(champ.value);
    if (!id) { champ.setCustomValidity && champ.setCustomValidity(""); champ.style.outline = "2px solid #c8472b"; return; }
    await modifierLiensMessage(idMsgCourant(), l => l.concat(id));
  };
  zoneDem.addEventListener("click", async (e) => {
    const r = e.target.closest("[data-retirer-demande]"), l = e.target.closest("[data-lier-demande]"), o = e.target.closest("[data-ouvrir-demande]");
    if (r) await modifierLiensMessage(idMsgCourant(), a => a.filter(x => x !== Number(r.getAttribute("data-retirer-demande"))));
    else if (l) await modifierLiensMessage(idMsgCourant(), a => a.concat(Number(l.getAttribute("data-lier-demande"))));
    else if (o) { fond.style.display = "none"; basculerVue("demandes"); selectionnerLigne(Number(o.getAttribute("data-ouvrir-demande"))); }
    else if (e.target.id === "msg-demande-ajouter") await ajouterDepuisSaisie();
  });
  zoneDem.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "msg-demande-saisie") ajouterDepuisSaisie(); });
  zoneDem.addEventListener("change", (e) => { if (e.target.id === "msg-demande-saisie" && demandeDepuisSaisie(e.target.value) && /^#\d+ — /.test(e.target.value)) ajouterDepuisSaisie(); });
  document.getElementById("msg-mapping-auto").addEventListener("click", async () => {
    if (!colonneDemandesMessagesPresente) { alert("La colonne « Demandes » n'existe pas dans " + TABLE_MESSAGES + " : lancez l'outil de migration de structure."); return; }
    const aLier = messagesBrut.filter(m => !m.demandes.length).map(m => ({ m, sg: suggestionDemandesMessage(m) })).filter(x => x.sg.ids.length);
    if (!aLier.length) { alert("Aucun message sans demande ne peut être rattaché automatiquement (expéditeur inconnu des acteurs, ou plusieurs demandes possibles)."); return; }
    if (!window.confirm(aLier.length + " message(s) sans demande vont être rattachés d'après l'expéditeur (acteur dont l'e-mail correspond ; si plusieurs demandes, celle dont le titre figure dans le message).\nLes messages déjà rattachés ne sont pas modifiés. Continuer ?")) return;
    await grist.docApi.applyUserActions(aLier.map(x => ["UpdateRecord", TABLE_MESSAGES, x.m.id, { Demandes: ["L"].concat(x.sg.ids) }]));
    aLier.forEach(x => { x.m.demandes = x.sg.ids.slice(); });
    rafraichirApresChangementLiens();
  });
  fond.addEventListener("mousedown", (e) => { if (e.target === fond) fermer(); });
  document.getElementById("msg-detail-supprimer").addEventListener("click", async () => {
    const m = messagesAffiches[indexMessageOuvert];
    if (!m) return;
    const faite = await supprimerMessage(m.id);
    if (!faite) return;
    const idx = indexMessageOuvert;
    afficherMessages();
    if (document.getElementById("fiche-messages")) rafraichirOngletMessagesFiche();
    else if (ligneSelectionneeId != null && document.getElementById("rida-tbody")) insererMessagesDansRida(messagesBrut.filter(x => x.demandes.includes(ligneSelectionneeId)));
    // la liste affichée (filtrée dans l'onglet, ou liée à la fiche) peut avoir changé : on passe au message suivant s'il existe, sinon on ferme
    messagesAffiches = messagesAffiches.filter(x => x.id !== m.id);
    if (messagesAffiches.length) ouvrirMessage(Math.min(idx, messagesAffiches.length - 1)); else fermer();
  });
  document.getElementById("msg-detail-prec").addEventListener("click", () => ouvrirMessage(indexMessageOuvert - 1));
  document.getElementById("msg-detail-suiv").addEventListener("click", () => ouvrirMessage(indexMessageOuvert + 1));
  document.addEventListener("keydown", (e) => {
    if (fond.style.display === "none") return;
    if (e.key === "Escape") fermer();
    else if (e.key === "ArrowLeft" && indexMessageOuvert > 0) ouvrirMessage(indexMessageOuvert - 1);
    else if (e.key === "ArrowRight" && indexMessageOuvert < messagesAffiches.length - 1) ouvrirMessage(indexMessageOuvert + 1);
  });
})();

// --- Fiche : onglet « Messages » (messages liés à la demande ; ajout / suppression de liens) ---
async function rafraichirOngletMessagesFiche() {
  const zone = document.getElementById("fiche-messages"), btn = document.getElementById("tab-btn-messages-fiche");
  if (!zone) return;
  const idDemande = ligneSelectionneeId;
  if (!messagesCharges && !messagesErreur) { zone.innerHTML = "<div class='msg-vide'>Chargement…</div>"; await chargerMessages(); }
  if (idDemande !== ligneSelectionneeId || !document.getElementById("fiche-messages")) return; // fiche changée entre-temps
  if (messagesErreur) { zone.innerHTML = "<div class='msg-vide'>" + escapeHtml(messagesErreur) + "</div>"; return; }
  const lies = messagesBrut.filter(m => m.demandes.includes(idDemande)).sort((a, b) => b.recu - a.recu);
  insererMessagesDansRida(lies);
  if (btn) btn.textContent = "Messages" + (lies.length ? " (" + lies.length + ")" : "");
  const lignes = lies.map(m =>
    "<tr data-msg-id='" + m.id + "'><td>" + escapeHtml(dateMessage(m.recu)) + "</td><td title=\"" + escapeHtml(m.sens === "sortant" ? m.destinataires : m.expediteur) + "\">" + (m.sens === "sortant" ? "↑ à " + escapeHtml(m.destinataires) : "↓ " + escapeHtml(m.expediteur)) + "</td>" +
    "<td title=\"" + escapeHtml(m.sujet) + "\">" + escapeHtml(m.sujet || "(sans sujet)") + "</td>" +
    "<td class='msg-fiche-actions'><button type='button' class='btn-fiche-msg-delier' data-msg-id='" + m.id + "' title='Supprimer le lien entre ce message et la demande'>✕</button></td></tr>").join("");
  const dejaLies = new Set(lies.map(m => m.id));
  const options = messagesBrut.filter(m => !dejaLies.has(m.id)).sort((a, b) => b.recu - a.recu)
    .map(m => "<option value=\"#" + m.id + " — " + escapeHtml(dateMessage(m.recu) + " · " + (m.expediteur || "?") + " · " + (m.sujet || "(sans sujet)")) + "\"></option>").join("");
  zone.innerHTML = (lies.length ? "<table class='tableau-fiche msg-fiche-table'><thead><tr><th style='width:100px;'>Date</th><th style='width:30%;'>Correspondant</th><th>Sujet</th><th style='width:40px;'></th></tr></thead><tbody>" + lignes + "</tbody></table>"
    : "<div class='msg-vide' style='text-align:left;'>Aucun message lié à cette demande.</div>") +
    "<div class='ajout-pp-conteneur' style='margin-top:8px;'><input type='text' id='fiche-msg-saisie' list='fiche-msg-datalist' placeholder='Lier un message (tapez l&#39;expéditeur, le sujet ou la date)…' style='min-width:340px;'><datalist id='fiche-msg-datalist'>" + options + "</datalist><button type='button' id='fiche-msg-ajouter' title='Lier ce message à la demande'>+</button></div>" +
    "<div class='modale-msg' id='fiche-msg-info'></div>" + htmlRechercheAvanceeFiche(idDemande);
}
// --- Fiche > Messages > 🔬 Recherche avancée : messages (non encore liés) proches de la demande, par corrélation IA ---
let rechercheFiche = { idDemande: null, ouvert: false, horsSdid: true, mois: 2, requete: "", resultats: null, etat: "", enCours: false };
function etatRechercheFiche(idDemande) {
  if (rechercheFiche.idDemande !== idDemande) rechercheFiche = { idDemande, ouvert: false, horsSdid: true, mois: 2, requete: requeteDepuisDemande(idDemande), resultats: null, etat: "", enCours: false };
  return rechercheFiche;
}
function htmlRechercheAvanceeFiche(idDemande) {
  const r = etatRechercheFiche(idDemande);
  let h = "<div style='margin-top:10px;'><button type='button' id='fiche-msg-avance-ouvrir' class='btn-secondaire' title='Retrouver des messages liés à cette demande : hors SDID, corrélation IA avec son objet'>🔬 Recherche avancée" + (r.ouvert ? " ▲" : " ▼") + "</button></div>";
  if (!r.ouvert) return h;
  h += "<div class='msg-avance' id='fiche-msg-avance' style='display:flex;'>" +
    "<label class='msg-avance-ligne'><input type='checkbox' id='fiche-msg-avance-hors-sdid'" + (r.horsSdid ? " checked" : "") + "> Uniquement les messages échangés avec des personnes hors SDID</label>" +
    "<div class='msg-avance-ligne'><select id='fiche-msg-avance-profondeur' title='Profondeur de recherche dans le temps'>" +
    [[1, "1 mois"], [2, "2 mois"], [6, "6 mois"], [0, "Tout"]].map(([v, l]) => "<option value='" + v + "'" + (r.mois === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select>" +
    "<button type='button' id='fiche-msg-avance-chercher' class='btn-secondaire'" + (r.enCours ? " disabled" : "") + ">Rechercher (corrélation IA)</button></div>" +
    "<textarea id='fiche-msg-avance-requete' rows='2' placeholder='Objet de la demande ou texte libre à rapprocher du sujet et du corps des messages…'>" + escapeHtml(r.requete) + "</textarea>" +
    "<div class='msg-avance-etat' id='fiche-msg-avance-etat'>" + escapeHtml(r.etat) + "</div>";
  if (r.resultats) {
    const lignes = r.resultats.filter(x => { const m = messagesBrut.find(y => y.id === x.id); return m && !m.demandes.includes(idDemande); }).map(x => {
      const m = messagesBrut.find(y => y.id === x.id);
      return "<tr data-msg-id='" + m.id + "' class='ligne-resultat-avance'><td>" + escapeHtml(dateMessage(m.recu)) + "</td><td><span class='msg-score' title='Proximité avec la recherche'>" + Math.round(x.score * 100) + " %</span></td>" +
        "<td title=\"" + escapeHtml(m.sens === "sortant" ? m.destinataires : m.expediteur) + "\">" + (m.sens === "sortant" ? "↑ à " : "↓ de ") + escapeHtml(m.sens === "sortant" ? m.destinataires : m.expediteur) + "</td>" +
        "<td title=\"" + escapeHtml(m.sujet) + "\">" + escapeHtml(m.sujet || "(sans sujet)") + "</td>" +
        "<td class='msg-fiche-actions'><button type='button' class='btn-fiche-msg-lier' data-msg-id='" + m.id + "' title='Lier ce message à la demande'>+ Lier</button></td></tr>";
    }).join("");
    h += lignes ? "<table class='tableau-fiche msg-fiche-table'><thead><tr><th style='width:100px;'>Date</th><th style='width:60px;'>Score</th><th style='width:30%;'>Correspondant</th><th>Sujet</th><th style='width:70px;'></th></tr></thead><tbody>" + lignes + "</tbody></table>"
      : "<div class='msg-vide' style='text-align:left;'>Aucun message trouvé.</div>";
  }
  return h + "</div>";
}
document.getElementById("fiche-container").addEventListener("click", async (e) => {
  if (e.target.closest("#fiche-msg-avance-ouvrir")) { const r = etatRechercheFiche(ligneSelectionneeId); r.ouvert = !r.ouvert; rafraichirOngletMessagesFiche(); return; }
  const lier = e.target.closest(".btn-fiche-msg-lier");
  if (lier) { e.stopPropagation(); const idDemande = ligneSelectionneeId; await modifierLiensMessage(Number(lier.getAttribute("data-msg-id")), l => l.includes(idDemande) ? l : l.concat(idDemande)); return; }
  const ligneRes = e.target.closest(".ligne-resultat-avance");
  if (ligneRes) {
    const r = etatRechercheFiche(ligneSelectionneeId);
    messagesAffiches = (r.resultats || []).map(x => messagesBrut.find(y => y.id === x.id)).filter(Boolean);
    ouvrirMessage(messagesAffiches.findIndex(x => x.id === Number(ligneRes.getAttribute("data-msg-id"))));
    return;
  }
  if (e.target.id === "fiche-msg-avance-chercher") {
    const idDemande = ligneSelectionneeId, r = etatRechercheFiche(idDemande);
    r.requete = document.getElementById("fiche-msg-avance-requete").value.trim();
    r.mois = parseInt(document.getElementById("fiche-msg-avance-profondeur").value, 10) || 0;
    r.horsSdid = document.getElementById("fiche-msg-avance-hors-sdid").checked;
    if (r.requete.length < 3) { r.etat = "Saisir une requête."; rafraichirOngletMessagesFiche(); return; }
    r.enCours = true; r.etat = "Recherche…";
    const majEtat = (t) => { r.etat = t; const el = document.getElementById("fiche-msg-avance-etat"); if (el && rechercheFiche === r) el.textContent = t; };
    document.getElementById("fiche-msg-avance-chercher").disabled = true;
    try {
      const res = await lancerRechercheIa(r.requete, r.mois, majEtat, r.horsSdid, idDemande);
      r.resultats = [...retenirMeilleursScores(res.scores).entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
      r.etat = r.resultats.length + " message(s) trouvé(s) sur " + res.nbCorpus + " analysé(s) · " +
        (res.mode === "embeddings" ? "IA (embeddings " + res.modele + ", " + res.nbNouveaux + " nouveau(x) vectorisé(s), gardés en mémoire pour la session)" :
          "mots-clés locaux (TF-IDF)" + (res.raison ? " — embeddings indisponibles : " + res.raison : ""));
    } catch (err) { r.etat = "Erreur : " + (err && err.message || err); } finally { r.enCours = false; }
    if (rechercheFiche === r && document.getElementById("fiche-messages") && idDemande === ligneSelectionneeId) rafraichirOngletMessagesFiche();
  }
});
document.getElementById("fiche-container").addEventListener("change", (e) => {
  if (e.target.id === "fiche-msg-avance-hors-sdid") { const r = etatRechercheFiche(ligneSelectionneeId); r.horsSdid = e.target.checked; r.resultats = null; r.etat = "Filtre modifié : relancer la recherche."; rafraichirOngletMessagesFiche(); }
  if (e.target.id === "fiche-msg-avance-profondeur") { const r = etatRechercheFiche(ligneSelectionneeId); r.mois = parseInt(e.target.value, 10) || 0; }
  if (e.target.id === "fiche-msg-avance-requete") { etatRechercheFiche(ligneSelectionneeId).requete = e.target.value; }
});
document.getElementById("fiche-container").addEventListener("click", async (e) => {
  const ouvrir = e.target.closest(".msg-fiche-table tbody tr");
  const delier = e.target.closest(".btn-fiche-msg-delier");
  if (delier) {
    e.stopPropagation();
    const id = Number(delier.getAttribute("data-msg-id")), idDemande = ligneSelectionneeId;
    await modifierLiensMessage(id, l => l.filter(x => x !== idDemande));
    return;
  }
  if (e.target.id === "fiche-msg-ajouter") {
    const champ = document.getElementById("fiche-msg-saisie"), v = champ.value.trim(), mid = v.match(/^#(\d+)/);
    let m = mid ? messagesBrut.find(x => x.id === Number(mid[1])) : null;
    if (!m && v) { const n = normaliserTexteRecherche(v), c = messagesBrut.filter(x => normaliserTexteRecherche(x.expediteur + " " + x.sujet).includes(n)); if (c.length === 1) m = c[0]; }
    if (!m) { document.getElementById("fiche-msg-info").className = "modale-msg erreur"; document.getElementById("fiche-msg-info").textContent = "Choisissez un message dans la liste proposée."; return; }
    const idDemande = ligneSelectionneeId;
    await modifierLiensMessage(m.id, l => l.concat(idDemande));
    return;
  }
  if (ouvrir) {
    const m = messagesBrut.find(x => x.id === Number(ouvrir.getAttribute("data-msg-id")));
    if (!m) return;
    messagesAffiches = messagesBrut.filter(x => x.demandes.includes(ligneSelectionneeId)).sort((a, b) => b.recu - a.recu);
    ouvrirMessage(messagesAffiches.findIndex(x => x.id === m.id));
  }
});
document.getElementById("fiche-container").addEventListener("change", (e) => {
  if (e.target.id === "fiche-msg-saisie" && /^#\d+ — /.test(e.target.value)) document.getElementById("fiche-msg-ajouter").click();
});

// --- Fiche : messages liés affichés comme lignes d'information (non éditables) dans le tableau RIDA ---
function insererMessagesDansRida(lies) {
  const tbody = document.getElementById("rida-tbody");
  if (!tbody) return;
  tbody.querySelectorAll("tr.rida-message").forEach(tr => tr.remove());
  const trie = triRidaColonne === "Pour_le";
  const croissant = !trie || triRidaSens === "asc";
  const dateLigne = (tr) => { const r = ridaToutes.find(x => x.id === Number(tr.getAttribute("data-rida-id"))); return r ? (Number(r.Pour_le) || 0) : 0; };
  const messages = lies.slice().sort((a, b) => croissant ? a.recu - b.recu : b.recu - a.recu);
  messages.forEach(m => {
    const tr = document.createElement("tr");
    tr.className = "rida-message";
    tr.setAttribute("data-msg-id", m.id);
    tr.title = (m.sens === "sortant" ? "Message envoyé" : "Message reçu") + " — cliquer pour lire le contenu (ligne non modifiable)";
    const d = escapeHtml(dateMessage(m.recu));
    tr.innerHTML = "<td><span class='rida-message-type'>I</span></td><td class='rida-message-porteur'>✉ " + (m.sens === "sortant" ? "↑" : "↓") + "</td><td></td>" +
      "<td>" + d + "</td><td>" + d + "</td><td></td>" +
      "<td class='rida-message-desc'>" + (m.sens === "sortant" ? "Message mail envoyé à " + escapeHtml(m.destinataires || "(destinataire inconnu)") : "Message mail de " + escapeHtml(m.expediteur || "(expéditeur inconnu)")) + (m.sujet ? " : " + escapeHtml(m.sujet) : "") + "</td><td></td>";
    // position : trié par date avec les lignes RIDA si le tableau est trié par « Pour le », sinon à la fin
    let ref = null;
    if (trie) {
      for (const ligne of tbody.querySelectorAll("tr[data-rida-id]")) {
        const dl = dateLigne(ligne);
        if (croissant ? dl > m.recu : dl < m.recu) { ref = ligne; break; }
      }
    }
    tbody.insertBefore(tr, ref);
  });
}
document.getElementById("fiche-container").addEventListener("click", (e) => {
  const tr = e.target.closest("tr.rida-message");
  if (!tr) return;
  const lies = messagesBrut.filter(x => x.demandes.includes(ligneSelectionneeId)).sort((a, b) => b.recu - a.recu);
  messagesAffiches = lies;
  ouvrirMessage(lies.findIndex(x => x.id === Number(tr.getAttribute("data-msg-id"))));
});
