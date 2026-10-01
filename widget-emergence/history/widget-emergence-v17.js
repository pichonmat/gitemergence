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

let largeursColonnes = {
  "Statut": 110,
  "Date_de_soumission": 100,
  "Organisation": 110,
  "Sponsor": 130,
  "Porteurs": 130,
  "Titre": 230,
  "Typologie_de_la_demande": 150,
  "Parties_prenantes_concernees": 200
};

const ORDRE_COLONNES = [
  "Statut", "Date_de_soumission", "Organisation", "Sponsor", "Porteurs",
  "Titre", "Typologie_de_la_demande", "Parties_prenantes_concernees"
];

let lignesEmergence = [];
let acteursParId = {};
let acteursTriesParNom = [];   // [{id, label}] tous les acteurs, triés alphabétiquement
let sponsorsCandidats = [];    // [{id, label}] acteurs SDID uniquement, pour le select Sponsor
let pjToutes = [];
let ridaToutes = [];
let colonneTri = "Date_de_soumission";
let sensTri = "desc";
let ligneSelectionneeId = null;
let filtreStatut = "";
let filtreTypologie = "";
let filtreOrganisation = "";
let filtrePartiePrenanteTexte = ""; // recherche libre par nom (sous-chaîne)
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

// --- Champ markdown : vue rendue par défaut, bascule vers édition ---
function champMarkdownHtml(idPrefix, valeur, classeTextareaSupp) {
  const contenuRendu = markdownToHtml(valeur) || "<span style='color:#bbb;'>—</span>";
  const classeTextarea = classeTextareaSupp ? " " + classeTextareaSupp : "";
  return (
    "<div class='markdown-vue' id='" + idPrefix + "-vue'>" +
    "<div class='boite-grise cliquable' id='" + idPrefix + "-boite' title='Cliquer pour modifier'>" + contenuRendu + "</div>" +
    "<button type='button' class='btn-modifier' id='" + idPrefix + "-btn-modifier'>✎ Modifier</button>" +
    "</div>" +
    "<div class='markdown-edition' id='" + idPrefix + "-edition' style='display:none;'>" +
    "<textarea id='" + idPrefix + "-textarea' class='" + classeTextarea.trim() + "'>" + escapeHtml(valeur || "") + "</textarea>" +
    "<button type='button' class='btn-sauver-objet visible' id='" + idPrefix + "-btn-enregistrer'>Enregistrer</button>" +
    "<button type='button' class='btn-annuler-mini' id='" + idPrefix + "-btn-annuler'>Annuler</button>" +
    "<span class='msg-sauvegarde' id='" + idPrefix + "-msg'></span>" +
    "</div>"
  );
}

function initChampMarkdown(conteneur, idPrefix, champGrist, valeurInitiale, ligneId) {
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

  btnModifier.addEventListener("click", passerEnEdition);
  boiteDiv.addEventListener("click", (e) => {
    if (e.target.closest("a")) return; // laisse les liens markdown fonctionner normalement
    passerEnEdition();
  });

  btnAnnuler.addEventListener("click", () => {
    textarea.value = valeurInitiale;
    msgEl.textContent = "";
    editionDiv.style.display = "none";
    vueDiv.style.display = "block";
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
  const organisations = [...new Set(lignesEmergence.map(l => l.Organisation).filter(Boolean))].sort();

  const selStatut = document.getElementById("filtre-statut");
  const selTypologie = document.getElementById("filtre-typologie");
  const selOrganisation = document.getElementById("filtre-organisation");
  const datalistPartiePrenante = document.getElementById("datalist-filtre-pp");

  const valeurActuelleStatut = selStatut.value;
  const valeurActuelleTypologie = selTypologie.value;
  const valeurActuelleOrganisation = selOrganisation.value;

  selStatut.innerHTML = "<option value=''>Tous les statuts</option>" +
    statuts.map(s => "<option value=\"" + escapeHtml(s) + "\">" + escapeHtml(s) + "</option>").join("");
  selTypologie.innerHTML = "<option value=''>Toutes les typologies</option>" +
    typologies.map(t => "<option value=\"" + escapeHtml(t) + "\">" + escapeHtml(t) + "</option>").join("");
  selOrganisation.innerHTML = "<option value=''>Toutes les organisations</option>" +
    organisations.map(o => "<option value=\"" + escapeHtml(o) + "\">" + escapeHtml(o) + "</option>").join("");

  // Datalist d'autocomplétion pour le filtre "Parties prenantes" (nom seul, sans organisation,
  // pour que la saisie corresponde bien au texte comparé lors du filtrage)
  const idsUtilises = new Set();
  lignesEmergence.forEach(l => refListVersIds(l.Parties_prenantes_concernees).map(Number).forEach(id => idsUtilises.add(id)));
  const nomsPourFiltre = [...new Set(
    acteursTriesParNom.filter(a => idsUtilises.has(a.id)).map(a => nomActeurParId(a.id)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  datalistPartiePrenante.innerHTML = nomsPourFiltre.map(nom => "<option value=\"" + escapeHtml(nom) + "\"></option>").join("");

  if (statuts.includes(valeurActuelleStatut)) selStatut.value = valeurActuelleStatut;
  if (typologies.includes(valeurActuelleTypologie)) selTypologie.value = valeurActuelleTypologie;
  if (organisations.includes(valeurActuelleOrganisation)) selOrganisation.value = valeurActuelleOrganisation;
}

document.getElementById("filtre-statut").addEventListener("change", (e) => {
  filtreStatut = e.target.value;
  afficherListe();
});

document.getElementById("filtre-typologie").addEventListener("change", (e) => {
  filtreTypologie = e.target.value;
  afficherListe();
});

document.getElementById("filtre-organisation").addEventListener("change", (e) => {
  filtreOrganisation = e.target.value;
  afficherListe();
});

document.getElementById("filtre-partie-prenante").addEventListener("input", (e) => {
  filtrePartiePrenanteTexte = e.target.value;
  afficherListe();
});

document.getElementById("btn-reset-filtres").addEventListener("click", () => {
  filtreStatut = "";
  filtreTypologie = "";
  filtreOrganisation = "";
  filtrePartiePrenanteTexte = "";
  document.getElementById("filtre-statut").value = "";
  document.getElementById("filtre-typologie").value = "";
  document.getElementById("filtre-organisation").value = "";
  document.getElementById("filtre-partie-prenante").value = "";
  afficherListe();
});

function appliquerFiltres(lignes) {
  return lignes.filter(l => {
    if (filtreStatut && l.Statut !== filtreStatut) return false;
    if (filtreTypologie && l.Typologie_de_la_demande !== filtreTypologie) return false;
    if (filtreOrganisation && l.Organisation !== filtreOrganisation) return false;
    if (filtrePartiePrenanteTexte) {
      const texte = nomActeur(l.Parties_prenantes_concernees).toLowerCase();
      if (texte.indexOf(filtrePartiePrenanteTexte.toLowerCase()) === -1) return false;
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
    corps.innerHTML = "<tr><td colspan='8' class='chargement'>Aucune ligne trouvée.</td></tr>";
    return;
  }
  let html = "";
  for (const ligne of lignesTriees) {
    const sel = ligne.id === ligneSelectionneeId ? "selectionnee" : "";
    const sponsorNom = nomActeur(ligne.Sponsor);
    const porteurTexte = ligne.Porteurs || ""; // Choix unique : valeur texte directe, pas de résolution
    const partiesPrenantesTexte = nomActeur(ligne.Parties_prenantes_concernees);
    html += "<tr class='" + sel + "' data-id='" + ligne.id + "'>" +
      "<td>" + badgeStatut(ligne.Statut) + "</td>" +
      "<td title='" + (formaterDate(ligne.Date_de_soumission) || "") + "'>" + formaterDate(ligne.Date_de_soumission) + "</td>" +
      "<td title='" + (ligne.Organisation || "") + "'>" + (ligne.Organisation || "—") + "</td>" +
      "<td title='" + sponsorNom + "'>" + (sponsorNom || "—") + "</td>" +
      "<td title='" + porteurTexte + "'>" + (porteurTexte || "—") + "</td>" +
      "<td title='" + (ligne.Titre || "") + "'>" + (ligne.Titre || "—") + "</td>" +
      "<td title='" + (ligne.Typologie_de_la_demande || "") + "'>" + (ligne.Typologie_de_la_demande || "—") + "</td>" +
      "<td title='" + partiesPrenantesTexte + "'>" + (partiesPrenantesTexte || "—") + "</td>" +
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

// --- Redimensionnement vertical de la liste / masquage-affichage ---
(function initRedimensionnementListe() {
  const zoneListeComplete = document.getElementById("zone-liste-complete");
  const conteneurListe = document.getElementById("conteneur-liste");
  const poigneeToggle = document.getElementById("poignee-toggle");
  const poigneeIcone = document.getElementById("poignee-icone");
  const zonesGlisser = document.querySelectorAll("#barre-redimension .barre-glisser");

  let listeMasquee = false;
  let hauteurAvantMasquage = conteneurListe.offsetHeight || 260;

  function basculerAffichageListe() {
    if (!listeMasquee) {
      hauteurAvantMasquage = conteneurListe.offsetHeight;
      zoneListeComplete.style.display = "none";
      poigneeIcone.textContent = "▼";
    } else {
      zoneListeComplete.style.display = "";
      conteneurListe.style.height = hauteurAvantMasquage + "px";
      poigneeIcone.textContent = "▲";
    }
    listeMasquee = !listeMasquee;
  }

  poigneeToggle.addEventListener("click", basculerAffichageListe);

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
        const nouvelleHauteur = Math.max(60, Math.min(700, hauteurDepart + (ev.clientY - yDepart)));
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
  const ridaContenu = genererTableauRidaEditable(ridaLies);

  // --- Champ Sponsor (texte + autocomplétion, sur toute la liste des acteurs) ---
  const sponsorLabelActuel = sponsorId ? ligneActeur(sponsorId) : "";
  const datalistSponsorOptions = sponsorsCandidats.map(a =>
    "<option value=\"" + escapeHtml(a.label) + "\"></option>"
  ).join("");
  const sponsorChampHtml =
    "<div class='champ-avec-effacer'>" +
    "<input type='text' id='sponsor-input' list='datalist-sponsor' value=\"" + escapeHtml(sponsorLabelActuel) + "\" placeholder='Tapez un nom...'>" +
    "<datalist id='datalist-sponsor'>" + datalistSponsorOptions + "</datalist>" +
    "<button id='btn-effacer-sponsor' type='button' title='Retirer le sponsor'>✕</button>" +
    "<button id='btn-nouvel-acteur-sponsor' type='button' title='Créer un nouvel acteur'>+</button>" +
    "</div>" +
    "<span class='msg-sauvegarde' id='msg-sponsor'></span>";

  // --- Champ Porteurs (texte + autocomplétion, Choix unique donc valeur texte libre) ---
  const datalistPorteursOptions = sponsorsCandidats.map(a =>
    "<option value=\"" + escapeHtml(a.label) + "\"></option>"
  ).join("");
  const porteursChampHtml =
    "<div class='champ-avec-effacer'>" +
    "<input type='text' id='porteurs-input' list='datalist-porteurs' value=\"" + escapeHtml(ligne.Porteurs || "") + "\" placeholder='Tapez un nom...'>" +
    "<datalist id='datalist-porteurs'>" + datalistPorteursOptions + "</datalist>" +
    "<button id='btn-effacer-porteurs' type='button' title='Effacer'>✕</button>" +
    "<button id='btn-nouvel-acteur-porteurs' type='button' title='Créer un nouvel acteur'>+</button>" +
    "</div>" +
    "<span class='msg-sauvegarde' id='msg-porteurs'></span>";

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
              ${champMarkdownHtml("objet", ligne.Objet_de_la_demande)}
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
      <div class="champ-editable">
        <div class="champ-label">Détail de la demande</div>
        ${champMarkdownHtml("detail", ligne.Detail_de_la_demande, "textarea-longue")}
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

  // --- Objet / Détail / Main courante : rendu markdown avec bascule "Modifier" ---
  initChampMarkdown(conteneur, "objet", "Objet_de_la_demande", ligne.Objet_de_la_demande || "", ligne.id);
  initChampMarkdown(conteneur, "detail", "Detail_de_la_demande", ligne.Detail_de_la_demande || "", ligne.id);
  initChampMarkdown(conteneur, "main-courante", "Main_courante", ligne.Main_courante || "", ligne.id);

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

  // --- Édition du Sponsor (texte + autocomplétion, doit correspondre à un acteur existant) ---
  const sponsorInput = conteneur.querySelector("#sponsor-input");
  const btnEffacerSponsor = conteneur.querySelector("#btn-effacer-sponsor");
  const msgSponsor = conteneur.querySelector("#msg-sponsor");

  sponsorInput.addEventListener("change", () => {
    const texteTape = sponsorInput.value.trim();
    if (!texteTape) {
      sauverChampEmergence("Sponsor", null, msgSponsor);
      return;
    }
    const candidat = acteursTriesParNom.find(a => a.label.toLowerCase() === texteTape.toLowerCase());
    if (!candidat) {
      msgSponsor.textContent = "Aucune correspondance pour « " + texteTape + " ».";
      msgSponsor.className = "msg-sauvegarde erreur";
      sponsorInput.value = sponsorLabelActuel;
      return;
    }
    sauverChampEmergence("Sponsor", candidat.id, msgSponsor);
  });
  btnEffacerSponsor.addEventListener("click", () => {
    sponsorInput.value = "";
    sauverChampEmergence("Sponsor", null, msgSponsor);
  });
  conteneur.querySelector("#btn-nouvel-acteur-sponsor").addEventListener("click", () => {
    ouvrirModaleActeur("sponsor", sponsorInput.value.trim());
  });

  // --- Édition des Porteurs (texte + autocomplétion, valeur texte libre acceptée) ---
  const porteursInput = conteneur.querySelector("#porteurs-input");
  const btnEffacerPorteurs = conteneur.querySelector("#btn-effacer-porteurs");
  const msgPorteurs = conteneur.querySelector("#msg-porteurs");

  porteursInput.addEventListener("change", () => {
    const texteTape = porteursInput.value.trim();
    if (!texteTape) {
      sauverChampEmergence("Porteurs", null, msgPorteurs);
      return;
    }
    // Normalise sur la casse/l'orthographe d'un candidat existant si trouvé, sinon accepte le texte tel quel
    const candidat = sponsorsCandidats.find(a => a.label.toLowerCase() === texteTape.toLowerCase());
    sauverChampEmergence("Porteurs", candidat ? candidat.label : texteTape, msgPorteurs);
  });
  btnEffacerPorteurs.addEventListener("click", () => {
    porteursInput.value = "";
    sauverChampEmergence("Porteurs", null, msgPorteurs);
  });
  conteneur.querySelector("#btn-nouvel-acteur-porteurs").addEventListener("click", () => {
    ouvrirModaleActeur("porteurs", porteursInput.value.trim());
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

// --- Modale : créer un nouvel acteur ---
let contexteModaleActeur = null;

function ouvrirModaleActeur(contexte, nomPreRempli) {
  contexteModaleActeur = contexte;
  document.getElementById("modale-acteur-nom").value = nomPreRempli || "";
  document.getElementById("modale-acteur-organisation").value = "";
  document.getElementById("modale-acteur-organisation-path").value = "";
  document.getElementById("modale-acteur-role").value = "";
  document.getElementById("modale-acteur-mail").value = "";
  document.getElementById("modale-acteur-msg").textContent = "";
  document.getElementById("modale-acteur-fond").style.display = "flex";
}

document.getElementById("modale-acteur-annuler").addEventListener("click", () => {
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
    if (ligne && nouvelId) {
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
