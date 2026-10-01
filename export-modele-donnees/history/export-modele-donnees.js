grist.ready({ requiredAccess: 'full' });

// --- Génère le Markdown complet du schéma du document ---
async function genererMarkdown() {
  const tablesMeta = await grist.docApi.fetchTable("_grist_Tables");
  const colonnesMeta = await grist.docApi.fetchTable("_grist_Tables_column");

  // Dictionnaire : id de ligne (table système) -> nom technique de la table (tableId)
  const nomTableParId = {};
  const idsTables = tablesMeta.id || [];
  for (let i = 0; i < idsTables.length; i++) {
    nomTableParId[idsTables[i]] = tablesMeta.tableId[i];
  }

  // Reconstruire chaque colonne comme un objet, indexé par son id de ligne
  const colonneParId = {};
  const idsColonnes = colonnesMeta.id || [];
  for (let i = 0; i < idsColonnes.length; i++) {
    const col = { id: idsColonnes[i] };
    for (const cle in colonnesMeta) {
      if (cle === "id") continue;
      col[cle] = colonnesMeta[cle][i];
    }
    colonneParId[col.id] = col;
  }

  // Regrouper les colonnes par table (via parentId)
  const colonnesParTable = {};
  for (const id in colonneParId) {
    const col = colonneParId[id];
    const nomTable = nomTableParId[col.parentId] || ("table_inconnue_" + col.parentId);
    if (!colonnesParTable[nomTable]) colonnesParTable[nomTable] = [];
    colonnesParTable[nomTable].push(col);
  }

  // Trier les colonnes de chaque table selon leur ordre d'affichage réel
  for (const nomTable in colonnesParTable) {
    colonnesParTable[nomTable].sort((a, b) => (a.parentPos || 0) - (b.parentPos || 0));
  }

  // Extrait la liste des choix depuis widgetOptions (colonnes Choice / ChoiceList)
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

  // Construction du document Markdown
  let md = "# Modèle de données Grist\n\n";
  md += "Généré automatiquement le " + new Date().toLocaleString("fr-FR") + "\n\n";

  const nomsTablesTries = Object.keys(colonnesParTable)
    .filter(t => t.indexOf("_grist_") !== 0) // exclure les tables système
    .sort();

  md += "## Sommaire des tables\n\n";
  nomsTablesTries.forEach(nomTable => {
    md += "- [" + nomTable + "](#table-" + nomTable.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ")\n";
  });
  md += "\n";

  nomsTablesTries.forEach(nomTable => {
    md += "## Table `" + nomTable + "`\n\n";
    md += "| Colonne (colId) | Libellé | Type | Formule | Détails |\n";
    md += "|---|---|---|---|---|\n";
    colonnesParTable[nomTable].forEach(col => {
      // Exclut les colonnes techniques internes générées par Grist (helpers de lookup, etc.)
      if (col.colId && col.colId.indexOf("gristHelper_") === 0) return;
      md += ligneMarkdown(col) + "\n";
    });
    md += "\n";
  });

  return md;
}

// --- Déclenche le téléchargement du fichier .md ---
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

  btn.disabled = true;
  statutEl.textContent = "Génération en cours...";
  statutEl.className = "statut";

  try {
    const md = await genererMarkdown();

    apercuMd.value = md;
    apercuConteneur.style.display = "block";

    telechargerMarkdown(md, "modele-donnees-grist.md");
    statutEl.textContent = "Fichier téléchargé ✓ (aperçu affiché ci-dessous)";
  } catch (err) {
    statutEl.textContent = "Erreur : " + err.message;
    statutEl.className = "statut erreur";
  } finally {
    btn.disabled = false;
  }
});
