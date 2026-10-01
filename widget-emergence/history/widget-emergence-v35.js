// Widget Emergence — v35
// --- Configuration ---
const GRIST_BASE_URL = "https://grist.numerique.gouv.fr";
const DOC_ID = "qXWzdtyGgNh2T64Ti1SQfc";
const TABLE_PRINCIPALE = "Emergence";
const TABLE_ACTEURS = "Emergence_Acteurs";
const TABLE_PJ = "Emergence_PJ";
const TABLE_RIDA = "Emergence_Rida";

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
  "Action_ouverte": "Action ouverte"
};

// Colonnes actuellement affichées dans la liste des demandes (toutes par défaut).
let colonnesVisibles = new Set(ORDRE_COLONNES);

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
let filtreTypologie = "";
let filtreOrganisation = "";
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
    const rida = await grist.docApi.fetchTable(TABLE_RIDA);
    ridaToutes = tableVersLignes(rida);
  } catch (e) { console.error("Erreur chargement RIDA :", e); }
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
// autoSauvegarde=true : pas de bouton Enregistrer/Annuler, sauvegarde automatique à la perte de focus.
function champMarkdownHtml(idPrefix, valeur, classeTextareaSupp, classeBoiteSupp, autoSauvegarde) {
  const contenuRendu = markdownToHtml(valeur) || "<span style='color:#bbb;'>—</span>";
  const classeTextarea = classeTextareaSupp ? " " + classeTextareaSupp : "";
  const classeBoite = classeBoiteSupp ? " " + classeBoiteSupp : "";
  const boutonsEdition = autoSauvegarde
    ? "<span class='msg-sauvegarde' id='" + idPrefix + "-msg'></span>"
    : "<button type='button' class='btn-sauver-objet visible' id='" + idPrefix + "-btn-enregistrer'>Enregistrer</button>" +
      "<button type='button' class='btn-annuler-mini' id='" + idPrefix + "-btn-annuler'>Annuler</button>" +
      "<span class='msg-sauvegarde' id='" + idPrefix + "-msg'></span>";
  return (
    "<div class='markdown-vue' id='" + idPrefix + "-vue'>" +
    "<div class='boite-grise cliquable" + classeBoite + "' id='" + idPrefix + "-boite' title='Cliquer pour modifier'>" + contenuRendu + "</div>" +
    "<button type='button' class='btn-modifier' id='" + idPrefix + "-btn-modifier'>✎ Modifier</button>" +
    "</div>" +
    "<div class='markdown-edition' id='" + idPrefix + "-edition' style='display:none;'>" +
    "<textarea id='" + idPrefix + "-textarea' class='" + classeTextarea.trim() + "'>" + escapeHtml(valeur || "") + "</textarea>" +
    boutonsEdition +
    "</div>"
  );
}

function initChampMarkdown(conteneur, idPrefix, champGrist, valeurInitiale, ligneId, autoSauvegarde) {
  const vueDiv = conteneur.querySelector("#" + idPrefix + "-vue");
  const boiteDiv = conteneur.querySelector("#" + idPrefix + "-boite");
  const editionDiv = conteneur.querySelector("#" + idPrefix + "-edition");
  const btnModifier = conteneur.querySelector("#" + idPrefix + "-btn-modifier");
  const btnEnregistrer = conteneur.querySelector("#" + idPrefix + "-btn-enregistrer");
  const btnAnnuler = conteneur.querySelector("#" + idPrefix + "-btn-annuler");
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

  if (autoSauvegarde) {
    async function sauverSiModifie() {
      if (textarea.value === valeurInitiale) {
        revenirEnVue();
        return;
      }
      msgEl.textContent = "";
      msgEl.className = "msg-sauvegarde";
      try {
        await grist.docApi.applyUserActions([
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
  } else {
    btnAnnuler.addEventListener("click", () => {
      textarea.value = valeurInitiale;
      msgEl.textContent = "";
      revenirEnVue();
    });

    btnEnregistrer.addEventListener("click", async () => {
      btnEnregistrer.disabled = true;
      msgEl.textContent = "";
      msgEl.className = "msg-sauvegarde";
      try {
        await grist.docApi.applyUserActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligneId, { [champGrist]: textarea.value }]
        ]);
        // Recharge et redessine toute la fiche : le champ revient automatiquement
        // en vue rendue avec le nouveau contenu.
        await rechargerEmergenceEtRafraichir(ligneId);
      } catch (err) {
        msgEl.textContent = "Erreur : " + err.message;
        msgEl.className = "msg-sauvegarde erreur";
        btnEnregistrer.disabled = false;
      }
    });
  }
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
// null s'il n'y en a pas. Conservé pour le tri de la colonne "Action ouverte".
function epochActionOuvertePlusAncienne(ligneId) {
  const r = actionOuvertePlusAncienne(ligneId);
  return r ? r.Pour_le : null;
}

// --- Filtres ---
function remplirOptionsFiltres() {
  mettreAJourOptionsTypologieEtOrganisation();

  const datalistPartiePrenante = document.getElementById("datalist-filtre-pp");

  // Datalist d'autocomplétion pour le filtre "Parties prenantes" (nom seul, sans organisation,
  // pour que la saisie corresponde bien au texte comparé lors du filtrage)
  const idsUtilises = new Set();
  lignesEmergence.forEach(l => refListVersIds(l.Parties_prenantes_concernees).map(Number).forEach(id => idsUtilises.add(id)));
  const nomsPourFiltre = [...new Set(
    acteursTriesParNom.filter(a => idsUtilises.has(a.id)).map(a => nomActeurParId(a.id)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  datalistPartiePrenante.innerHTML = nomsPourFiltre.map(nom => "<option value=\"" + escapeHtml(nom) + "\"></option>").join("");

  construirePopupFiltreStatut();
  construirePopupConfigColonnes();
}

// Applique tous les filtres actifs sauf celui passé en paramètre : sert à calculer,
// pour un filtre donné, les options encore pertinentes compte tenu des AUTRES filtres.
function calculerLignesFiltreesSauf(champExclu) {
  return lignesEmergence.filter(l => {
    if (champExclu !== "statut" && filtreStatutSelection.size > 0 && !filtreStatutSelection.has(l.Statut)) return false;
    if (champExclu !== "typologie" && filtreTypologie && l.Typologie_de_la_demande !== filtreTypologie) return false;
    if (champExclu !== "organisation" && filtreOrganisation && l.Organisation !== filtreOrganisation) return false;
    if (champExclu !== "partie-prenante" && filtrePartiePrenanteTexte) {
      const texte = nomActeur(l.Parties_prenantes_concernees).toLowerCase();
      if (texte.indexOf(filtrePartiePrenanteTexte.toLowerCase()) === -1) return false;
    }
    if (champExclu !== "titre" && filtreTitreTexte) {
      if ((l.Titre || "").toLowerCase().indexOf(filtreTitreTexte.toLowerCase()) === -1) return false;
    }
    return true;
  });
}

// Recalcule les options de Typologie et Organisation en fonction des AUTRES filtres actifs
// (filtrage à facettes) : si un filtre réduit fortement les lignes visibles, les deux menus
// ne proposent plus que les valeurs encore possibles compte tenu de la sélection en cours.
function mettreAJourOptionsTypologieEtOrganisation() {
  const lignesPourTypologie = calculerLignesFiltreesSauf("typologie");
  const lignesPourOrganisation = calculerLignesFiltreesSauf("organisation");

  const typologies = [...new Set(lignesPourTypologie.map(l => l.Typologie_de_la_demande).filter(Boolean))].sort();
  const organisations = [...new Set(lignesPourOrganisation.map(l => l.Organisation).filter(Boolean))].sort();

  const selTypologie = document.getElementById("filtre-typologie");
  const selOrganisation = document.getElementById("filtre-organisation");
  const valeurActuelleTypologie = selTypologie.value;
  const valeurActuelleOrganisation = selOrganisation.value;

  selTypologie.innerHTML = "<option value=''>Toutes les typologies</option>" +
    typologies.map(t => "<option value=\"" + escapeHtml(t) + "\">" + escapeHtml(t) + "</option>").join("");
  selOrganisation.innerHTML = "<option value=''>Toutes les organisations</option>" +
    organisations.map(o => "<option value=\"" + escapeHtml(o) + "\">" + escapeHtml(o) + "</option>").join("");

  if (typologies.includes(valeurActuelleTypologie)) {
    selTypologie.value = valeurActuelleTypologie;
  } else if (valeurActuelleTypologie) {
    filtreTypologie = ""; // la valeur sélectionnée n'est plus possible compte tenu des autres filtres
  }
  if (organisations.includes(valeurActuelleOrganisation)) {
    selOrganisation.value = valeurActuelleOrganisation;
  } else if (valeurActuelleOrganisation) {
    filtreOrganisation = "";
  }
}

// --- Filtre Statut à sélection multiple ---
function libelleBoutonFiltreStatut() {
  const total = Object.keys(COULEURS_STATUT).length;
  if (filtreStatutSelection.size === 0 || filtreStatutSelection.size === total) return "Tous les statuts ▾";
  if (filtreStatutSelection.size === 1) return [...filtreStatutSelection][0] + " ▾";
  return "Statut (" + filtreStatutSelection.size + ") ▾";
}

function construirePopupFiltreStatut() {
  const popup = document.getElementById("popup-filtre-statut");
  const btn = document.getElementById("btn-filtre-statut");
  popup.innerHTML = Object.keys(COULEURS_STATUT).map(s =>
    "<label><input type='checkbox' class='case-filtre-statut' value=\"" + escapeHtml(s) + "\"" +
    (filtreStatutSelection.has(s) ? " checked" : "") + ">" + escapeHtml(s) + "</label>"
  ).join("");
  btn.textContent = libelleBoutonFiltreStatut();

  popup.querySelectorAll(".case-filtre-statut").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreStatutSelection.add(cb.value);
      else filtreStatutSelection.delete(cb.value);
      btn.textContent = libelleBoutonFiltreStatut();
      mettreAJourOptionsTypologieEtOrganisation();
      afficherListe();
    });
  });
}

document.getElementById("btn-filtre-statut").addEventListener("click", (e) => {
  e.stopPropagation();
  const popup = document.getElementById("popup-filtre-statut");
  popup.style.display = popup.style.display === "none" ? "block" : "none";
});
document.addEventListener("click", (e) => {
  const conteneur = document.getElementById("btn-filtre-statut").closest(".filtre-multi-conteneur");
  if (conteneur && !conteneur.contains(e.target)) {
    document.getElementById("popup-filtre-statut").style.display = "none";
  }
});

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
      appliquerVisibiliteColonnes();
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

document.getElementById("filtre-typologie").addEventListener("change", (e) => {
  filtreTypologie = e.target.value;
  mettreAJourOptionsTypologieEtOrganisation();
  afficherListe();
});

document.getElementById("filtre-organisation").addEventListener("change", (e) => {
  filtreOrganisation = e.target.value;
  mettreAJourOptionsTypologieEtOrganisation();
  afficherListe();
});

document.getElementById("filtre-partie-prenante").addEventListener("input", (e) => {
  filtrePartiePrenanteTexte = e.target.value;
  mettreAJourOptionsTypologieEtOrganisation();
  afficherListe();
});

document.getElementById("filtre-titre").addEventListener("input", (e) => {
  filtreTitreTexte = e.target.value;
  mettreAJourOptionsTypologieEtOrganisation();
  afficherListe();
});

document.getElementById("btn-reset-filtres").addEventListener("click", () => {
  filtreStatutSelection = new Set();
  filtreTypologie = "";
  filtreOrganisation = "";
  filtrePartiePrenanteTexte = "";
  filtreTitreTexte = "";
  construirePopupFiltreStatut();
  document.getElementById("filtre-typologie").value = "";
  document.getElementById("filtre-organisation").value = "";
  document.getElementById("filtre-partie-prenante").value = "";
  document.getElementById("filtre-titre").value = "";
  afficherListe();
});

function appliquerFiltres(lignes) {
  return lignes.filter(l => {
    if (filtreStatutSelection.size > 0 && !filtreStatutSelection.has(l.Statut)) return false;
    if (filtreTypologie && l.Typologie_de_la_demande !== filtreTypologie) return false;
    if (filtreOrganisation && l.Organisation !== filtreOrganisation) return false;
    if (filtrePartiePrenanteTexte) {
      const texte = nomActeur(l.Parties_prenantes_concernees).toLowerCase();
      if (texte.indexOf(filtrePartiePrenanteTexte.toLowerCase()) === -1) return false;
    }
    if (filtreTitreTexte) {
      if ((l.Titre || "").toLowerCase().indexOf(filtreTitreTexte.toLowerCase()) === -1) return false;
    }
    return true;
  });
}

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
    // Action ouverte : colonne calculée, pas une propriété directe de la ligne
    if (colonneTri === "Action_ouverte") {
      vA = epochActionOuvertePlusAncienne(a.id);
      vB = epochActionOuvertePlusAncienne(b.id);
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

function appliquerLargeursColonnes() {
  const table = document.getElementById("table-liste");
  const ths = table.querySelectorAll("thead th");
  ths.forEach((th) => {
    const nomCol = th.getAttribute("data-col");
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
    const actionOuverte = actionOuvertePlusAncienne(ligne.id);
    const dateActionOuverte = actionOuverte ? formaterDate(actionOuverte.Pour_le) : "";
    const descriptionActionOuverte = actionOuverte ? (actionOuverte.Description || "") : "";
    const celluleActionOuverte = actionOuverte ?
      "<div class='cellule-action-ouverte'>" +
      "<div class='date-action-ouverte'>" + escapeHtml(dateActionOuverte) + "</div>" +
      (descriptionActionOuverte ? "<div class='description-action-ouverte' title=\"" + escapeHtml(descriptionActionOuverte) + "\">" + escapeHtml(descriptionActionOuverte) + "</div>" : "") +
      "</div>" :
      "<span style='color:#bbb;'>—</span>";
    html += "<tr class='" + sel + "' data-id='" + ligne.id + "'>" +
      "<td>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td title='" + (formaterDate(ligne.Date_de_soumission) || "") + "'>" + formaterDate(ligne.Date_de_soumission) + "</td>" +
      "<td title='" + (ligne.Organisation || "") + "'>" + (ligne.Organisation || "—") + "</td>" +
      "<td title='" + sponsorNom + "'>" + (sponsorNom || "—") + "</td>" +
      "<td title='" + porteurTexte + "'>" + (porteurTexte || "—") + "</td>" +
      "<td title='" + (ligne.Titre || "") + "'>" + (ligne.Titre || "—") + "</td>" +
      "<td title='" + (ligne.Typologie_de_la_demande || "") + "'>" + (ligne.Typologie_de_la_demande || "—") + "</td>" +
      "<td title='" + partiesPrenantesTexte + "'>" + (partiesPrenantesTexte || "—") + "</td>" +
      "<td>" + celluleActionOuverte + "</td>" +
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
    if (e.target.classList.contains("poignee") || th.dataset.enTrainDeRedimensionner === "1") return;
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
      e.preventDefault();
      e.stopPropagation();
      poignee.setPointerCapture(e.pointerId);

      const th = poignee.closest("th");
      const colName = th.getAttribute("data-col");
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
  const idsActuels = refListVersIds(ligne.Parties_prenantes_concernees).map(Number);

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
    const candidat = sponsorsCandidats.find(a => a.label.toLowerCase() === texteActuel.toLowerCase());
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
  return "<tr data-rida-id='" + r.id + "'>" +
    "<td><select class='rida-input' data-field='RIDA'>" + optionsRidaTypeHtml(r.RIDA) + "</select></td>" +
    "<td>" + genererCelluleRidaPorteurHtml(r) + "</td>" +
    "<td><div class='champ-avec-effacer'>" +
    "<input type='date' class='rida-input' data-field='Pour_le' value=\"" + dateEpochVersInput(r.Pour_le) + "\">" +
    "<button type='button' class='btn-effacer-date-rida' data-field='Pour_le' title='Effacer la date'>✕</button>" +
    "</div></td>" +
    "<td><div class='champ-avec-effacer'>" +
    "<input type='date' class='rida-input' data-field='Fait_le' value=\"" + dateEpochVersInput(r.Fait_le) + "\">" +
    "<button type='button' class='btn-effacer-date-rida' data-field='Fait_le' title='Effacer la date'>✕</button>" +
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
    const candidat = acteursTriesParNom.find(a => nomActeurParId(a.id).toLowerCase() === texteActuel.toLowerCase());
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
              ${champMarkdownHtml("objet", ligne.Objet_de_la_demande, null, null, true)}
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
      await grist.docApi.applyUserActions([
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
  initChampMarkdown(conteneur, "objet", "Objet_de_la_demande", ligne.Objet_de_la_demande || "", ligne.id, true);
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
    const candidat = acteursTriesParNom.find(a => a.label.toLowerCase() === texteTape.toLowerCase());
    if (!candidat) {
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
    const candidat = sponsorsCandidats.find(a => a.label.toLowerCase() === texteTape.toLowerCase());
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
      await grist.docApi.applyUserActions([
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
      const idsActuels = refListVersIds(ligne.Parties_prenantes_concernees).map(Number);
      const candidat = acteursTriesParNom.find(a =>
        !idsActuels.includes(a.id) && a.label.toLowerCase() === texteTape.toLowerCase()
      );
      if (!candidat) {
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
        const idsActuels = refListVersIds(ligne.Parties_prenantes_concernees).map(Number);
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
      msgRida.textContent = "";
      msgRida.className = "msg-sauvegarde";
      try {
        await grist.docApi.applyUserActions([
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
        await grist.docApi.applyUserActions([
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
        const candidat = acteursTriesParNom.find(a => nomActeurParId(a.id).toLowerCase() === texteTape.toLowerCase());
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
          await grist.docApi.applyUserActions([
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
        await grist.docApi.applyUserActions([
          ["AddRecord", TABLE_RIDA, null, {
            ID2: ligne.id,
            RIDA: "I",
            Pour_le: aujourdHuiEpoch()
            // Porteur et Fait_le volontairement laissés vides à la création.
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
    "<button class='btn-rida-save' type='button' style='display:none;'>Enregistrer</button>" +
    "<button class='btn-rida-delete' type='button' title='Supprimer cet acteur'>🗑</button>" +
    "</td></tr>";
}

function rafraichirTableauGestionActeurs() {
  const tbody = document.getElementById("tbody-gestion-acteurs");
  let ids = Object.keys(acteursParId).map(Number);

  if (filtreGestionActeurNom) {
    const q = filtreGestionActeurNom.toLowerCase();
    ids = ids.filter(id => ((acteursParId[id] && acteursParId[id].Nom_et_Prenom) || "").toLowerCase().indexOf(q) !== -1);
  }
  if (filtreGestionActeurOrg) {
    const q = filtreGestionActeurOrg.toLowerCase();
    ids = ids.filter(id => ((acteursParId[id] && acteursParId[id].Organisation) || "").toLowerCase().indexOf(q) !== -1);
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
  document.querySelectorAll("#modale-acteurs-fond [data-col-acteur]").forEach(th => {
    const f = th.querySelector(".fleche-rida");
    if (!f) return;
    f.textContent = th.getAttribute("data-col-acteur") === triGestionActeurColonne
      ? (triGestionActeurSens === "asc" ? "▲" : "▼") : "";
  });
}

document.querySelectorAll("#modale-acteurs-fond [data-col-acteur]").forEach(th => {
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

function ouvrirModaleGestionActeurs() {
  filtreGestionActeurNom = "";
  filtreGestionActeurOrg = "";
  document.getElementById("recherche-acteur-nom").value = "";
  document.getElementById("recherche-acteur-organisation").value = "";
  rafraichirTableauGestionActeurs();
  document.getElementById("modale-acteurs-msg").textContent = "";
  document.getElementById("modale-acteurs-fond").style.display = "flex";
}

async function rafraichirApresChangementActeur() {
  await chargerTablesAnnexes();
  rafraichirTableauGestionActeurs();
  const ligneCourante = lignesEmergence.find(l => l.id === ligneSelectionneeId);
  if (ligneCourante) afficherFiche(ligneCourante);
}

document.getElementById("tbody-gestion-acteurs").addEventListener("input", (e) => {
  if (e.target.classList.contains("acteur-input")) {
    e.target.closest("tr").querySelector(".btn-rida-save").style.display = "inline-block";
  }
});

document.getElementById("tbody-gestion-acteurs").addEventListener("click", async (e) => {
  const msgEl = document.getElementById("modale-acteurs-msg");

  if (e.target.classList.contains("btn-rida-save")) {
    const tr = e.target.closest("tr");
    const acteurId = parseInt(tr.getAttribute("data-acteur-id"), 10);
    const champs = {};
    tr.querySelectorAll(".acteur-input").forEach(input => {
      champs[input.getAttribute("data-field")] = input.value;
    });
    e.target.disabled = true;
    msgEl.textContent = "";
    try {
      await grist.docApi.applyUserActions([["UpdateRecord", TABLE_ACTEURS, acteurId, champs]]);
      await rafraichirApresChangementActeur();
    } catch (err) {
      msgEl.textContent = "Erreur : " + err.message;
      e.target.disabled = false;
    }
  }

  if (e.target.classList.contains("btn-rida-delete")) {
    const tr = e.target.closest("tr");
    const acteurId = parseInt(tr.getAttribute("data-acteur-id"), 10);
    if (!confirm("Supprimer cet acteur ? Il sera retiré des fiches où il est référencé.")) return;
    try {
      await grist.docApi.applyUserActions([["RemoveRecord", TABLE_ACTEURS, acteurId]]);
      await rafraichirApresChangementActeur();
    } catch (err) {
      msgEl.textContent = "Erreur lors de la suppression : " + err.message;
    }
  }
});

document.getElementById("btn-ajouter-acteur-gestion").addEventListener("click", () => {
  ouvrirModaleActeur("gestion-acteurs", "");
});

document.getElementById("modale-acteurs-fermer").addEventListener("click", () => {
  document.getElementById("modale-acteurs-fond").style.display = "none";
});

// --- Modale : créer / modifier un acteur ---
let contexteModaleActeur = null;

function ouvrirModaleActeur(contexte, nomPreRempli) {
  contexteModaleActeur = contexte;
  acteurEnEditionId = null;
  document.getElementById("modale-acteur-titre").textContent = "Créer un nouvel acteur";
  document.getElementById("modale-acteur-valider").textContent = "Créer";
  document.getElementById("modale-acteur-nom").value = nomPreRempli || "";
  document.getElementById("modale-acteur-organisation").value = "";
  document.getElementById("modale-acteur-organisation-path").value = "";
  document.getElementById("modale-acteur-role").value = "";
  document.getElementById("modale-acteur-mail").value = "";
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
      await grist.docApi.applyUserActions([
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
    const resultat = await grist.docApi.applyUserActions([
      ["AddRecord", TABLE_ACTEURS, null, {
        Nom_et_Prenom: nom,
        Organisation: organisation,
        Organisation_Path: organisationPath,
        Role: role,
        mail: mail
      }]
    ]);
    const nouvelId = resultat && resultat.retValues ? resultat.retValues[0] : null;

    // Recharge la table Acteurs pour connaître localement le nouvel acteur
    await chargerTablesAnnexes();

    const ligne = lignesEmergence.find(l => l.id === ligneSelectionneeId);

    if (contexteModaleActeur && typeof contexteModaleActeur === "object" && contexteModaleActeur.type === "rida-porteur") {
      if (nouvelId) {
        const nomSeul = nomActeurParId(nouvelId);
        await grist.docApi.applyUserActions([
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
        await grist.docApi.applyUserActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Sponsor: nouvelId }]
        ]);
      } else if (contexteModaleActeur === "porteurs") {
        const label = ligneActeur(nouvelId);
        await grist.docApi.applyUserActions([
          ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Porteurs: label }]
        ]);
      } else if (contexteModaleActeur === "partie-prenante") {
        const idsActuels = refListVersIds(ligne.Parties_prenantes_concernees).map(Number);
        await grist.docApi.applyUserActions([
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

    await grist.docApi.applyUserActions([
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
    await grist.docApi.applyUserActions([
      ["RemoveRecord", TABLE_PRINCIPALE, ligneSelectionneeId]
    ]);
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
    const resultat = await grist.docApi.applyUserActions([
      ["AddRecord", TABLE_PRINCIPALE, null, { Statut: "0-Nouveau" }]
    ]);
    const nouvelId = resultat && resultat.retValues ? resultat.retValues[0] : null;
    await chargerTablePrincipale();
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
let filtreActionType = new Set(["I", "D", "A"]);
let filtreActionPorteur = "";
let filtreActionTitre = "";
let triActionColonne = "Pour_le";
let triActionSens = "desc";

function nomDemandeParId2(valeurId2) {
  const id = idDepuisRef(valeurId2);
  const ligne = lignesEmergence.find(l => l.id === id);
  return {
    id: id,
    titre: ligne ? (ligne.Titre || "Sans titre") : "—",
    sponsor: ligne ? nomActeur(ligne.Sponsor) : "",
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

function libelleBoutonFiltreTypeAction() {
  if (filtreActionType.size === 0 || filtreActionType.size === 3) return "Tous les types ▾";
  return [...filtreActionType].sort().join(", ") + " ▾";
}

function construirePopupFiltreTypeAction() {
  const popup = document.getElementById("popup-filtre-type-action");
  const btn = document.getElementById("btn-filtre-type-action");
  const choix = ["I", "D", "A"];
  popup.innerHTML = choix.map(v =>
    "<label><input type='checkbox' class='case-filtre-action-type' value=\"" + v + "\"" +
    (filtreActionType.has(v) ? " checked" : "") + ">" + v + "</label>"
  ).join("");
  btn.textContent = libelleBoutonFiltreTypeAction();
  popup.querySelectorAll(".case-filtre-action-type").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) filtreActionType.add(cb.value);
      else filtreActionType.delete(cb.value);
      btn.textContent = libelleBoutonFiltreTypeAction();
      afficherTableauActions();
    });
  });
}

document.getElementById("btn-filtre-type-action").addEventListener("click", (e) => {
  e.stopPropagation();
  const popup = document.getElementById("popup-filtre-type-action");
  popup.style.display = popup.style.display === "none" ? "block" : "none";
});
document.addEventListener("click", (e) => {
  const conteneur = document.querySelector("#vue-actions .filtre-multi-conteneur");
  if (conteneur && !conteneur.contains(e.target)) {
    document.getElementById("popup-filtre-type-action").style.display = "none";
  }
});

document.getElementById("filtre-action-porteur").addEventListener("input", (e) => {
  filtreActionPorteur = e.target.value;
  afficherTableauActions();
});
document.getElementById("filtre-action-titre").addEventListener("input", (e) => {
  filtreActionTitre = e.target.value;
  afficherTableauActions();
});
document.getElementById("btn-reset-filtres-actions").addEventListener("click", () => {
  filtreActionType = new Set(["I", "D", "A"]);
  filtreActionPorteur = "";
  filtreActionTitre = "";
  document.getElementById("filtre-action-porteur").value = "";
  document.getElementById("filtre-action-titre").value = "";
  construirePopupFiltreTypeAction();
  afficherTableauActions();
});

document.querySelectorAll("#table-actions thead [data-col-action]").forEach(th => {
  th.addEventListener("click", () => {
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

function afficherTableauActions() {
  const corps = document.getElementById("corps-tableau-actions");
  let lignes = ridaToutes.map(r => {
    const demande = nomDemandeParId2(r.ID2);
    return Object.assign({}, r, {
      __titre: demande.titre,
      __demandeId: demande.id,
      __sponsor: demande.sponsor,
      __statut: demande.statut
    });
  });

  if (filtreActionType.size > 0 && filtreActionType.size < 3) {
    lignes = lignes.filter(r => filtreActionType.has(r.RIDA));
  }
  if (filtreActionPorteur) {
    const q = filtreActionPorteur.toLowerCase();
    lignes = lignes.filter(r => (r.Porteur || "").toLowerCase().indexOf(q) !== -1);
  }
  if (filtreActionTitre) {
    const q = filtreActionTitre.toLowerCase();
    lignes = lignes.filter(r => r.__titre.toLowerCase().indexOf(q) !== -1);
  }

  lignes.sort((a, b) => {
    let vA, vB;
    if (triActionColonne === "titre") { vA = a.__titre; vB = b.__titre; }
    else if (triActionColonne === "sponsor") { vA = a.__sponsor; vB = b.__sponsor; }
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

  if (lignes.length === 0) {
    corps.innerHTML = "<tr><td colspan='8' class='chargement'>Aucune action trouvée.</td></tr>";
  } else {
    corps.innerHTML = lignes.map(r => {
      const classeUrgence = classeUrgenceAction(r);
      return "<tr data-demande-id='" + (r.__demandeId || "") + "'" + (classeUrgence ? " class='" + classeUrgence + "'" : "") + ">" +
        "<td title=\"" + escapeHtml(r.__titre) + "\">" + escapeHtml(r.__titre) + "</td>" +
        "<td title=\"" + escapeHtml(r.__sponsor) + "\">" + (r.__sponsor ? escapeHtml(r.__sponsor) : "—") + "</td>" +
        "<td>" + (r.__statut ? badgeStatut(r.__statut) : "—") + "</td>" +
        "<td>" + escapeHtml(r.RIDA || "—") + "</td>" +
        "<td title=\"" + escapeHtml(r.Porteur || "") + "\">" + escapeHtml(r.Porteur || "—") + "</td>" +
        "<td>" + formaterDate(r.Pour_le) + "</td>" +
        "<td>" + formaterDate(r.Fait_le) + "</td>" +
        "<td title=\"" + escapeHtml(r.Description || "") + "\">" + escapeHtml(r.Description || "") + "</td>" +
        "</tr>";
    }).join("");

    corps.querySelectorAll("tr[data-demande-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const id = parseInt(tr.getAttribute("data-demande-id"), 10);
        if (!id) return;
        basculerVue("demandes");
        selectionnerLigne(id);
      });
    });
  }

  mettreAJourFlechesTableauActions();
}

// --- Bascule entre la vue "Demandes" et la vue "Actions" ---
function basculerVue(mode) {
  const vueDemandes = document.getElementById("vue-demandes");
  const vueActions = document.getElementById("vue-actions");
  const tagDemandes = document.getElementById("tag-demandes");
  const tagActions = document.getElementById("tag-actions");

  if (mode === "actions") {
    vueDemandes.style.display = "none";
    vueActions.style.display = "block";
    tagDemandes.classList.remove("active");
    tagActions.classList.add("active");
    construirePopupFiltreTypeAction();
    afficherTableauActions();
  } else {
    vueActions.style.display = "none";
    vueDemandes.style.display = "";
    tagActions.classList.remove("active");
    tagDemandes.classList.add("active");
  }
}

document.getElementById("tag-demandes").addEventListener("click", () => basculerVue("demandes"));
document.getElementById("tag-actions").addEventListener("click", () => basculerVue("actions"));

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
