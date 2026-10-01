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

let largeursColonnes = {
  "Statut": 110,
  "Date_de_soumission": 100,
  "Organisation": 120,
  "Sponsor": 140,
  "Porteurs": 140,
  "Titre": 260,
  "Typologie_de_la_demande": 160
};

const ORDRE_COLONNES = ["Statut", "Date_de_soumission", "Organisation", "Sponsor", "Porteurs", "Titre", "Typologie_de_la_demande"];

let lignesEmergence = [];
let acteursParId = {};
let acteursTriesParNom = []; // [{id, label}], triés alphabétiquement, pour le menu "ajouter"
let pjToutes = [];
let ridaToutes = [];
let colonneTri = "Date_de_soumission";
let sensTri = "desc";
let ligneSelectionneeId = null;
let filtreStatut = "";
let filtreTypologie = "";
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
        Organisation_Path: acteurs.Organisation_Path ? acteurs.Organisation_Path[i] : ""
      };
    }
    acteursTriesParNom = Object.keys(acteursParId)
      .map(id => ({ id: parseInt(id, 10), label: ligneActeur(parseInt(id, 10)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
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
  txt = txt.replace(/^###\s+(.+)$/gm, "<u><b>$1</b></u>");
  txt = txt.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  txt = txt.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");
  txt = txt.replace(/\[(.+?)\]\((.+?)\)/g, "<a href='$2' target='_blank'>$1</a>");

  const lignes = txt.split("\n");
  let html = "";
  let dansListe = false;
  for (const ligne of lignes) {
    if (/^\s*[-*]\s+/.test(ligne)) {
      if (!dansListe) { html += "<ul>"; dansListe = true; }
      html += "<li>" + ligne.replace(/^\s*[-*]\s+/, "") + "</li>";
    } else {
      if (dansListe) { html += "</ul>"; dansListe = false; }
      if (ligne.trim()) html += ligne + "<br>";
    }
  }
  if (dansListe) html += "</ul>";
  return html;
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

function badgeStatut(statut) {
  const c = COULEURS_STATUT[statut] || { fond: "#f3f4f6", texte: "#374151" };
  return "<span class='badge-statut' style='background:" + c.fond + "; color:" + c.texte + ";'>" + (statut || "—") + "</span>";
}

function valeurOuTiret(v) {
  return v ? String(v) : "<span style='color:#bbb;'>—</span>";
}

// --- Filtres ---
function remplirOptionsFiltres() {
  const statuts = [...new Set(lignesEmergence.map(l => l.Statut).filter(Boolean))].sort();
  const typologies = [...new Set(lignesEmergence.map(l => l.Typologie_de_la_demande).filter(Boolean))].sort();

  const selStatut = document.getElementById("filtre-statut");
  const selTypologie = document.getElementById("filtre-typologie");

  const valeurActuelleStatut = selStatut.value;
  const valeurActuelleTypologie = selTypologie.value;

  selStatut.innerHTML = "<option value=''>Tous les statuts</option>" +
    statuts.map(s => "<option value=\"" + s + "\">" + s + "</option>").join("");
  selTypologie.innerHTML = "<option value=''>Toutes les typologies</option>" +
    typologies.map(t => "<option value=\"" + t + "\">" + t + "</option>").join("");

  if (statuts.includes(valeurActuelleStatut)) selStatut.value = valeurActuelleStatut;
  if (typologies.includes(valeurActuelleTypologie)) selTypologie.value = valeurActuelleTypologie;
}

document.getElementById("filtre-statut").addEventListener("change", (e) => {
  filtreStatut = e.target.value;
  afficherListe();
});

document.getElementById("filtre-typologie").addEventListener("change", (e) => {
  filtreTypologie = e.target.value;
  afficherListe();
});

document.getElementById("btn-reset-filtres").addEventListener("click", () => {
  filtreStatut = "";
  filtreTypologie = "";
  document.getElementById("filtre-statut").value = "";
  document.getElementById("filtre-typologie").value = "";
  afficherListe();
});

function appliquerFiltres(lignes) {
  return lignes.filter(l => {
    if (filtreStatut && l.Statut !== filtreStatut) return false;
    if (filtreTypologie && l.Typologie_de_la_demande !== filtreTypologie) return false;
    return true;
  });
}

// --- Liste ---
function trierLignes(lignes) {
  const copie = [...lignes];
  copie.sort((a, b) => {
    let vA = a[colonneTri], vB = b[colonneTri];

    // Sponsor / Porteurs sont des références : on trie sur le nom résolu, pas l'id brut
    if (colonneTri === "Sponsor" || colonneTri === "Porteurs") {
      vA = nomActeur(vA);
      vB = nomActeur(vB);
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
    corps.innerHTML = "<tr><td colspan='7' class='chargement'>Aucune ligne trouvée.</td></tr>";
    return;
  }
  let html = "";
  for (const ligne of lignesTriees) {
    const sel = ligne.id === ligneSelectionneeId ? "selectionnee" : "";
    const sponsorNom = nomActeur(ligne.Sponsor);
    const porteurNom = nomActeur(ligne.Porteurs);
    html += "<tr class='" + sel + "' data-id='" + ligne.id + "'>" +
      "<td>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td title='" + (formaterDate(ligne.Date_de_soumission) || "") + "'>" + formaterDate(ligne.Date_de_soumission) + "</td>" +
      "<td title='" + (ligne.Organisation || "") + "'>" + (ligne.Organisation || "—") + "</td>" +
      "<td title='" + sponsorNom + "'>" + (sponsorNom || "—") + "</td>" +
      "<td title='" + porteurNom + "'>" + (porteurNom || "—") + "</td>" +
      "<td title='" + (ligne.Titre || "") + "'>" + (ligne.Titre || "—") + "</td>" +
      "<td title='" + (ligne.Typologie_de_la_demande || "") + "'>" + (ligne.Typologie_de_la_demande || "—") + "</td>" +
      "</tr>";
  }
  corps.innerHTML = html;
  corps.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", () => selectionnerLigne(parseInt(tr.getAttribute("data-id"), 10)));
  });
  mettreAJourFleches();
  appliquerLargeursColonnes();
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
        "<span class='chip-texte'>" + escapeHtml(ligneActeur(id)) + "</span>" +
        "<button class='chip-retirer' type='button' data-acteur-id='" + id + "' title='Retirer'>×</button>" +
        "</span>";
    });
    chipsHtml += "</div>";
  }

  const optionsDisponibles = acteursTriesParNom.filter(a => !idsActuels.includes(a.id));
  const optionsHtml = optionsDisponibles.map(a =>
    "<option value=\"" + a.id + "\">" + escapeHtml(a.label) + "</option>"
  ).join("");

  const selectHtml =
    "<select class='select-ajouter-pp' id='select-ajouter-pp'>" +
    "<option value=''>+ Ajouter une partie prenante...</option>" +
    optionsHtml +
    "</select>" +
    "<span class='msg-sauvegarde' id='msg-pp'></span>";

  return chipsHtml + selectHtml;
}

// --- RIDA éditable ---
function ajusterHauteurTextarea(textarea) {
  textarea.style.height = "22px";
  const nouvelleHauteur = Math.max(22, textarea.scrollHeight);
  textarea.style.height = nouvelleHauteur + "px";
}

function optionsPorteurHtml(valeurActuelle) {
  const valeurs = new Set();
  ridaToutes.forEach(r => { if (r.Porteur) valeurs.add(r.Porteur); });
  if (valeurActuelle) valeurs.add(valeurActuelle);
  const liste = Array.from(valeurs).sort();
  let html = "<option value=''>—</option>";
  liste.forEach(v => {
    html += "<option value=\"" + escapeHtml(v) + "\"" + (v === valeurActuelle ? " selected" : "") + ">" + escapeHtml(v) + "</option>";
  });
  return html;
}

function genererLigneRidaEditable(r) {
  return "<tr data-rida-id='" + r.id + "'>" +
    "<td><input type='text' class='rida-input' data-field='RIDA' value=\"" + escapeHtml(r.RIDA) + "\"></td>" +
    "<td><select class='rida-input' data-field='Porteur'>" + optionsPorteurHtml(r.Porteur) + "</select></td>" +
    "<td><input type='date' class='rida-input' data-field='Pour_le' value=\"" + dateEpochVersInput(r.Pour_le) + "\"></td>" +
    "<td><input type='date' class='rida-input' data-field='Fait_le' value=\"" + dateEpochVersInput(r.Fait_le) + "\"></td>" +
    "<td><textarea class='rida-input rida-description' data-field='Description'>" + escapeHtml(r.Description) + "</textarea></td>" +
    "<td class='rida-actions'>" +
    "<button class='btn-rida-save' type='button' style='display:none;'>Enregistrer</button>" +
    "<button class='btn-rida-delete' type='button' title='Supprimer cette ligne'>🗑</button>" +
    "</td>" +
    "</tr>";
}

function genererTableauRidaEditable(ridaLies) {
  let lignesHtml = "";
  ridaLies.forEach(r => { lignesHtml += genererLigneRidaEditable(r); });

  return (
    "<table class='tableau-fiche tableau-rida-editable'>" +
    "<thead><tr><th style='width:12%;'>RIDA</th><th style='width:16%;'>Porteur</th>" +
    "<th style='width:12%;'>Pour le</th><th style='width:12%;'>Fait le</th>" +
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

  const detailHtml = markdownToHtml(ligne.Detail_de_la_demande) || "<span style='color:#bbb;'>—</span>";
  const mainCouranteHtml = markdownToHtml(ligne.Main_courante) || "<span style='color:#bbb;'>—</span>";
  const sponsorNom = nomActeur(ligne.Sponsor);
  const porteursNom = nomActeur(ligne.Porteurs);
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

  const ridaLies = ridaToutes.filter(r => idDepuisRef(r.ID2) === ligne.id);
  const ridaContenu = genererTableauRidaEditable(ridaLies);

  conteneur.innerHTML = `
    <div class="bandeau">
      <div class="bandeau-entete">
        <div class="bandeau-titre">${ligne.Titre || ""}</div>
      </div>
      <div class="bandeau-corps">
        <div>
          <div class="zone" style="grid-template-columns: 1fr;">
            <div class="champ-editable">
              <div class="champ-label">Objet de la demande</div>
              <textarea id="objet-textarea">${ligne.Objet_de_la_demande || ""}</textarea>
              <button class="btn-sauver-objet" id="btn-sauver-objet">Enregistrer</button>
              <span class="msg-sauvegarde" id="msg-sauver-objet"></span>
            </div>
          </div>
          <div class="zone" style="grid-template-columns: repeat(3, 1fr);">
            <div><div class="champ-label">Organisation qui émet la demande</div><div class="champ-valeur">${valeurOuTiret(ligne.Organisation)}</div></div>
            <div><div class="champ-label">Sponsor</div><div class="champ-valeur">${valeurOuTiret(sponsorNom)}</div></div>
            <div><div class="champ-label">Porteurs</div><div class="champ-valeur">${valeurOuTiret(porteursNom)}</div></div>
          </div>
          <div class="zone" style="grid-template-columns: repeat(4, 1fr); border-bottom:none;">
            <div><div class="champ-label">Priorité</div><div class="champ-valeur">${valeurOuTiret(ligne.Priorite)}</div></div>
            <div><div class="champ-label">Statut</div><div class="champ-valeur">${badgeStatut(ligne.Statut)}</div></div>
            <div><div class="champ-label">Date de soumission</div><div class="champ-valeur">${formaterDate(ligne.Date_de_soumission) || "—"}</div></div>
            <div><div class="champ-label">Date de cloture</div><div class="champ-valeur">${formaterDate(ligne.Date_de_cloture) || "—"}</div></div>
          </div>
        </div>
        <div class="col-droite">
          <div class="champ-label">Parties prenantes concernées</div>
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
      <div class="champ-label">Détail de la demande</div>
      <div class="boite-grise">${detailHtml}</div>
    </div>
    <div class="tab-panel ${ongletActif === 'main-courante' ? 'active' : ''}" data-panel="main-courante">
      <div class="boite-grise">${mainCouranteHtml}</div>
    </div>
    <div class="tab-panel ${ongletActif === 'autres' ? 'active' : ''}" data-panel="autres">
      <ul class="liste-champs">${listeChamps}</ul>
    </div>
    <div class="tab-panel ${ongletActif === 'pj' ? 'active' : ''}" data-panel="pj">${pjContenu}</div>
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

  // --- Édition de l'Objet de la demande ---
  const objetTextarea = conteneur.querySelector("#objet-textarea");
  const btnSauverObjet = conteneur.querySelector("#btn-sauver-objet");
  const msgSauverObjet = conteneur.querySelector("#msg-sauver-objet");
  const valeurInitialeObjet = ligne.Objet_de_la_demande || "";

  objetTextarea.addEventListener("input", () => {
    const modifie = objetTextarea.value !== valeurInitialeObjet;
    btnSauverObjet.classList.toggle("visible", modifie);
    msgSauverObjet.textContent = "";
  });

  btnSauverObjet.addEventListener("click", async () => {
    btnSauverObjet.disabled = true;
    msgSauverObjet.textContent = "";
    msgSauverObjet.className = "msg-sauvegarde";
    try {
      await grist.docApi.applyUserActions([
        ["UpdateRecord", TABLE_PRINCIPALE, ligne.id, { Objet_de_la_demande: objetTextarea.value }]
      ]);
      msgSauverObjet.textContent = "Enregistré ✓";
      btnSauverObjet.classList.remove("visible");
    } catch (err) {
      msgSauverObjet.textContent = "Erreur : " + err.message;
      msgSauverObjet.className = "msg-sauvegarde erreur";
    } finally {
      btnSauverObjet.disabled = false;
    }
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

  const selectAjouterPp = conteneur.querySelector("#select-ajouter-pp");
  if (selectAjouterPp) {
    selectAjouterPp.addEventListener("change", () => {
      const idAAjouter = parseInt(selectAjouterPp.value, 10);
      if (!idAAjouter) return;
      const idsActuels = refListVersIds(ligne.Parties_prenantes_concernees).map(Number);
      sauverPartiesPrenantes(idsActuels.concat([idAAjouter]));
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
    });
  }

  // --- Édition des lignes RIDA ---
  const ridaTbody = conteneur.querySelector("#rida-tbody");
  const msgRida = conteneur.querySelector("#msg-rida");

  if (ridaTbody) {
    // Ajuste la hauteur de chaque textarea Description à son contenu actuel au chargement
    ridaTbody.querySelectorAll(".rida-description").forEach(ajusterHauteurTextarea);

    ridaTbody.addEventListener("input", (e) => {
      if (e.target.classList.contains("rida-input")) {
        const tr = e.target.closest("tr");
        tr.querySelector(".btn-rida-save").style.display = "inline-block";
        if (e.target.classList.contains("rida-description")) {
          ajusterHauteurTextarea(e.target);
        }
      }
    });

    ridaTbody.addEventListener("change", (e) => {
      if (e.target.classList.contains("rida-input")) {
        const tr = e.target.closest("tr");
        tr.querySelector(".btn-rida-save").style.display = "inline-block";
      }
    });

    ridaTbody.addEventListener("click", async (e) => {
      // Enregistrer une ligne RIDA
      if (e.target.classList.contains("btn-rida-save")) {
        const tr = e.target.closest("tr");
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
        e.target.disabled = true;
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
          e.target.disabled = false;
        }
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
    });
  }

  const btnAjouterRida = conteneur.querySelector("#btn-ajouter-rida");
  if (btnAjouterRida) {
    btnAjouterRida.addEventListener("click", async () => {
      btnAjouterRida.disabled = true;
      try {
        await grist.docApi.applyUserActions([
          ["AddRecord", TABLE_RIDA, null, { ID2: ligne.id }]
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

// Initialisation
(async function init() {
  await chargerTablesAnnexes();
  await chargerTablePrincipale();
  remplirOptionsFiltres();
  afficherListe();
})();
