grist.ready({ requiredAccess: 'full' });

let nomTableParId = {};
let colonneParId = {};
let colonnesParTable = {};
let nomsTablesTries = [];

// --- Chargement initial : liste des tables et colonnes disponibles ---
async function chargerSchema() {
  const tablesMeta = await grist.docApi.fetchTable("_grist_Tables");
  const colonnesMeta = await grist.docApi.fetchTable("_grist_Tables_column");

  nomTableParId = {};
  const idsTables = tablesMeta.id || [];
  for (let i = 0; i < idsTables.length; i++) {
    nomTableParId[idsTables[i]] = tablesMeta.tableId[i];
  }

  colonneParId = {};
  const idsColonnes = colonnesMeta.id || [];
  for (let i = 0; i < idsColonnes.length; i++) {
    const col = { id: idsColonnes[i] };
    for (const cle in colonnesMeta) {
      if (cle === "id") continue;
      col[cle] = colonnesMeta[cle][i];
    }
    colonneParId[col.id] = col;
  }

  colonnesParTable = {};
  for (const id in colonneParId) {
    const col = colonneParId[id];
    const nomTable = nomTableParId[col.parentId] || ("table_inconnue_" + col.parentId);
    if (!colonnesParTable[nomTable]) colonnesParTable[nomTable] = [];
    colonnesParTable[nomTable].push(col);
  }

  for (const nomTable in colonnesParTable) {
    colonnesParTable[nomTable].sort((a, b) => (a.parentPos || 0) - (b.parentPos || 0));
  }

  nomsTablesTries = Object.keys(colonnesParTable)
    .filter(t => t.indexOf("_grist_") !== 0) // exclure les tables système
    .sort();
}

// --- Affiche la liste des tables avec cases à cocher ---
function afficherListeTables() {
  const conteneur = document.getElementById("liste-tables");
  let html = "";
  nomsTablesTries.forEach((nomTable, index) => {
    const nbColonnes = colonnesParTable[nomTable].filter(
      c => !(c.colId && c.colId.indexOf("gristHelper_") === 0)
    ).length;
    const idCheckbox = "table-cb-" + index;
    html +=
      "<div class='ligne-table-checkbox'>" +
      "<input type='checkbox' id='" + idCheckbox + "' data-table='" + nomTable + "' checked>" +
      "<label for='" + idCheckbox + "'>" + nomTable + "</label>" +
      "<span class='nb-colonnes'>(" + nbColonnes + " colonnes)</span>" +
      "</div>";
  });
  conteneur.innerHTML = html;

  conteneur.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", mettreAJourEtatBoutonGenerer);
  });
}

function tablesSelectionnees() {
  const cases = document.querySelectorAll("#liste-tables input[type='checkbox']:checked");
  return Array.from(cases).map(cb => cb.getAttribute("data-table"));
}

function mettreAJourEtatBoutonGenerer() {
  const btn = document.getElementById("btn-generer");
  const selection = tablesSelectionnees();
  btn.disabled = selection.length === 0;
  const statutEl = document.getElementById("statut");
  if (selection.length === 0) {
    statutEl.textContent = "Sélectionne au moins une table.";
    statutEl.className = "statut neutre";
  } else {
    statutEl.textContent = "";
    statutEl.className = "statut";
  }
}

document.getElementById("btn-tout-selectionner").addEventListener("click", () => {
  document.querySelectorAll("#liste-tables input[type='checkbox']").forEach(cb => cb.checked = true);
  mettreAJourEtatBoutonGenerer();
});

document.getElementById("btn-tout-deselectionner").addEventListener("click", () => {
  document.querySelectorAll("#liste-tables input[type='checkbox']").forEach(cb => cb.checked = false);
  mettreAJourEtatBoutonGenerer();
});

// --- Génération du Markdown pour les tables sélectionnées ---
function extraireChoix(widgetOptionsJson) {
  try {
    const opts = JSON.parse(widgetOptionsJson || "{}");
    if (opts.choices && Array.isArray(opts.choices)) {
      return opts.choices;
    }
  } catch (e) { /* ignore JSON invalide */ }
  return null;
}

function ligneMarkdown(col) {
  const type = col.type || "";
  const estFormule = col.isFormula ? "Oui" : "Non";
  const formuleTexte = (col.isFormula && col.formula)
    ? "`" + String(col.formula).replace(/\n/g, " ").replace(/\|/g, "\\|") + "`"
    : "";

  let details = "";

  if (type === "Choice" || type === "ChoiceList") {
    const choix = extraireChoix(col.widgetOptions);
    if (choix) details = "Choix : " + choix.join(", ");
  }

  if (type && (type.indexOf("Ref:") === 0 || type.indexOf("RefList:") === 0)) {
    const tableCible = type.split(":")[1];
    details = "→ Référence vers `" + tableCible + "`";
    if (col.visibleCol && colonneParId[col.visibleCol]) {
      details += " (colonne affichée : `" + colonneParId[col.visibleCol].colId + "`)";
    }
  }

  const detailsFinal = [formuleTexte, details].filter(Boolean).join("<br>");

  return "| `" + (col.colId || "") + "` | " + (col.label || "") + " | `" + type + "` | " +
    estFormule + " | " + detailsFinal + " |";
}

function genererMarkdown(tablesChoisies) {
  let md = "# Modèle de données Grist\n\n";
  md += "Généré automatiquement le " + new Date().toLocaleString("fr-FR") + "\n\n";

  md += "## Sommaire des tables\n\n";
  tablesChoisies.forEach(nomTable => {
    md += "- [" + nomTable + "](#table-" + nomTable.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ")\n";
  });
  md += "\n";

  tablesChoisies.forEach(nomTable => {
    md += "## Table `" + nomTable + "`\n\n";
    md += "| Colonne (colId) | Libellé | Type | Formule | Détails |\n";
    md += "|---|---|---|---|---|\n";
    colonnesParTable[nomTable].forEach(col => {
      if (col.colId && col.colId.indexOf("gristHelper_") === 0) return;
      md += ligneMarkdown(col) + "\n";
    });
    md += "\n";
  });

  return md;
}

function telechargerMarkdown(contenu, nomFichier) {
  const blob = new Blob([contenu], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.getElementById("btn-generer").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generer");
  const statutEl = document.getElementById("statut");
  const apercuConteneur = document.getElementById("apercu-conteneur");
  const apercuMd = document.getElementById("apercu-md");

  const tablesChoisies = tablesSelectionnees();
  if (tablesChoisies.length === 0) return;

  btn.disabled = true;
  statutEl.textContent = "Génération en cours...";
  statutEl.className = "statut";

  try {
    const md = genererMarkdown(tablesChoisies);

    apercuMd.value = md;
    apercuConteneur.style.display = "block";

    telechargerMarkdown(md, "modele-donnees-grist.md");
    statutEl.textContent = "Fichier téléchargé ✓ (" + tablesChoisies.length + " table(s) incluse(s))";
  } catch (err) {
    statutEl.textContent = "Erreur : " + err.message;
    statutEl.className = "statut erreur";
  } finally {
    btn.disabled = false;
  }
});

// --- Initialisation ---
(async function init() {
  const statutChargement = document.getElementById("statut-chargement");
  try {
    await chargerSchema();
    statutChargement.style.display = "none";
    document.getElementById("zone-tables").style.display = "block";
    document.getElementById("btn-generer").style.display = "inline-block";
    afficherListeTables();
    mettreAJourEtatBoutonGenerer();
  } catch (err) {
    statutChargement.textContent = "Erreur lors du chargement : " + err.message;
    statutChargement.className = "statut erreur";
  }
})();
