// Migration des statuts — v4
// Outil à usage unique : lit Emergence.Statut, affiche ce qui serait modifié, puis (après
// confirmation et sauvegarde CSV) remplace les anciennes valeurs par les nouvelles en UNE seule
// action Grist (BulkUpdateRecord : tout réussit ou tout échoue).
grist.ready({ requiredAccess: 'full' });

const TABLE = "Emergence";
const COLONNE = "Statut";

// ancien statut -> nouveau statut (les libellés cibles sont modifiables dans la page)
const MAPPING_PAR_DEFAUT = [
  ["1- En cours", "4 - En cours"],
  ["2- En attente", "6 - En attente"],
  ["3- Clôturé", "7 - Clôturer"],
  ["4- Transféré", "5 - Transférer"],
  ["5- A qualifier", "2 - Qualifier"],
  ["9 - A qualifier", "2 - Qualifier"] // libellé réellement présent dans la base
];
// "0-Nouveau" est inchangé. Nouveaux statuts sans ancien équivalent (à ajouter dans la liste Grist) :
const NOUVEAUX_SANS_ANCIEN = ["1 - Collecter", "3 - Approfondir"];
const INCHANGES = ["0-Nouveau"];

let lignes = [];           // [{id, Statut}]
let choixGrist = null;     // liste des choix de la colonne Statut dans Grist (null = illisible)
let idColonneStatut = null; // id de la colonne dans _grist_Tables_column (pour mettre à jour ses choix)

const el = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function tableVersLignes(table) {
  const out = [];
  const ids = table.id || [];
  for (let i = 0; i < ids.length; i++) out.push({ id: ids[i], Statut: table[COLONNE] ? table[COLONNE][i] : null });
  return out;
}

// Lecture seule des métadonnées pour retrouver les choix autorisés de la colonne Statut.
async function lireChoixGrist() {
  try {
    const tables = await grist.docApi.fetchTable("_grist_Tables");
    const cols = await grist.docApi.fetchTable("_grist_Tables_column");
    const idTable = tables.id[tables.tableId.indexOf(TABLE)];
    for (let i = 0; i < cols.id.length; i++) {
      if (cols.parentId[i] === idTable && cols.colId[i] === COLONNE) {
        idColonneStatut = cols.id[i];
        const opts = JSON.parse(cols.widgetOptions[i] || "{}");
        return Array.isArray(opts.choices) ? opts.choices : [];
      }
    }
  } catch (e) { console.error("Choix Grist illisibles :", e); }
  return null;
}

function mappingActuel() {
  return MAPPING_PAR_DEFAUT.map(([ancien], i) => [ancien, (el("cible-" + i).value || "").trim()]);
}

function compter(valeur) { return lignes.filter(l => l.Statut === valeur).length; }

function rendre() {
  const corps = el("corps-mapping");
  const cibles = MAPPING_PAR_DEFAUT.map(([, c], i) => { const inp = el("cible-" + i); return inp ? inp.value : c; });
  corps.innerHTML = MAPPING_PAR_DEFAUT.map(([ancien], i) =>
    "<tr><td>" + esc(ancien) + "</td>" +
    "<td><input id='cible-" + i + "' value=\"" + esc(cibles[i]) + "\"></td>" +
    "<td>" + compter(ancien) + "</td><td id='liste-" + i + "'></td></tr>"
  ).join("") +
    INCHANGES.map(v => "<tr><td>" + esc(v) + "</td><td>(inchangé)</td><td>" + compter(v) + "</td><td></td></tr>").join("");
  corps.querySelectorAll("input").forEach(inp => inp.addEventListener("input", verifier));
  verifier();

  const connus = new Set(MAPPING_PAR_DEFAUT.map(([a]) => a).concat(INCHANGES));
  const cibles2 = new Set(mappingActuel().map(([, c]) => c).concat(NOUVEAUX_SANS_ANCIEN));
  const inconnus = {};
  lignes.forEach(l => {
    const v = l.Statut == null || l.Statut === "" ? "(vide)" : l.Statut;
    if (!connus.has(l.Statut) && !cibles2.has(l.Statut)) inconnus[v] = (inconnus[v] || 0) + 1;
  });
  const bloc = el("bloc-inconnus");
  const noms = Object.keys(inconnus);
  if (noms.length) {
    bloc.style.display = "block";
    bloc.innerHTML = "<b>Valeurs non prévues (laissées telles quelles) :</b> " +
      noms.map(n => esc(n) + " (" + inconnus[n] + ")").join(", ");
  } else bloc.style.display = "none";
  const dejaMigrees = lignes.filter(l => cibles2.has(l.Statut)).length;
  el("statut-chargement").textContent = lignes.length + " ligne(s) lue(s)" +
    (dejaMigrees ? ", dont " + dejaMigrees + " déjà au nouveau format (ignorées)." : ".");
}

// Compare les libellés cibles à la liste des choix de la colonne dans Grist.
function verifier() {
  const attendus = mappingActuel().map(([, c]) => c).concat(NOUVEAUX_SANS_ANCIEN);
  let manquants = [];
  mappingActuel().forEach(([, c], i) => {
    const cell = el("liste-" + i);
    if (!cell) return;
    if (choixGrist === null) { cell.textContent = "?"; return; }
    const ok = choixGrist.includes(c);
    cell.textContent = ok ? "✓ présent" : "✗ absent";
    cell.className = ok ? "ok-cell" : "ko-cell";
  });
  if (choixGrist !== null) manquants = attendus.filter(c => c && !choixGrist.includes(c));
  const bloc = el("bloc-liste");
  if (choixGrist === null) {
    bloc.style.display = "block";
    bloc.textContent = "Impossible de lire la liste des choix de la colonne Statut : vérifie-la toi-même dans Grist avant de migrer.";
  } else if (manquants.length) {
    bloc.style.display = "block";
    bloc.innerHTML = "<b>À ajouter dans la liste des choix de la colonne Statut (Grist) avant de migrer :</b> " +
      manquants.map(esc).join(" · ");
  } else bloc.style.display = "none";
  el("btn-ajouter-choix").style.display = (choixGrist !== null && manquants.length && idColonneStatut) ? "inline-block" : "none";
  el("btn-migrer").disabled = !(choixGrist !== null && manquants.length === 0) || mappingActuel().some(([, c]) => !c);
}

function aMigrer() {
  const m = new Map(mappingActuel());
  return lignes.filter(l => m.has(l.Statut)).map(l => ({ id: l.id, ancien: l.Statut, nouveau: m.get(l.Statut) }));
}

function csvSauvegarde(liste) {
  const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  return "﻿" + ["id;ancien_statut;nouveau_statut"].concat(
    liste.map(r => [r.id, q(r.ancien), q(r.nouveau)].join(";"))).join("\n");
}

// Affiche la liste dans une zone de texte (copiable même si le téléchargement est bloqué).
function afficherPourCopie(liste) {
  el("zone-copie").value = csvSauvegarde(liste).replace(/^\uFEFF/, "");
  el("bloc-copie").style.display = "block";
  el("msg-copie").textContent = "";
}

async function copierTexte() {
  const zone = el("zone-copie");
  const msg = el("msg-copie");
  try {
    await navigator.clipboard.writeText(zone.value);
    msg.textContent = "Copié.";
  } catch (e) {
    zone.focus(); zone.select();
    let copie = false;
    try { copie = document.execCommand("copy"); } catch (e2) { /* ignoré */ }
    msg.textContent = copie ? "Copié." : "Sélectionné : fais Ctrl+C.";
  }
}

function telecharger(liste) {
  try {
    const blob = new Blob([csvSauvegarde(liste)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sauvegarde_statuts_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) { console.error(e); return false; }
}

async function charger() {
  el("resultat").textContent = "";
  const table = await grist.docApi.fetchTable(TABLE);
  lignes = tableVersLignes(table);
  choixGrist = await lireChoixGrist();
  el("zone").style.display = "block";
  rendre();
}

// Ajoute les libellés manquants à la liste des choix de la colonne Statut (sans rien retirer :
// les anciens choix restent en place jusqu'à la fin de la migration).
el("btn-ajouter-choix").addEventListener("click", async () => {
  const res = el("resultat");
  res.className = "statut";
  const attendus = mappingActuel().map(([, c]) => c).concat(NOUVEAUX_SANS_ANCIEN).filter(Boolean);
  try {
    // Relecture fraîche des options pour ne pas écraser une modification faite entre-temps.
    const cols = await grist.docApi.fetchTable("_grist_Tables_column");
    const idx = cols.id.indexOf(idColonneStatut);
    if (idx === -1) throw new Error("colonne Statut introuvable");
    const opts = JSON.parse(cols.widgetOptions[idx] || "{}");
    const actuels = Array.isArray(opts.choices) ? opts.choices.slice() : [];
    const aAjouter = [...new Set(attendus)].filter(c => !actuels.includes(c));
    if (!aAjouter.length) { await charger(); return; }
    if (!confirm("Ajouter ces choix à la colonne Statut ?\n\n" + aAjouter.join("\n") +
      "\n\nLes choix existants ne sont pas modifiés.")) return;
    opts.choices = actuels.concat(aAjouter);
    if (!opts.widget) opts.widget = "TextBox";
    await grist.docApi.applyUserActions([
      ["UpdateRecord", "_grist_Tables_column", idColonneStatut, { widgetOptions: JSON.stringify(opts) }]
    ]);
    await charger();
    const reste = attendus.filter(c => !(choixGrist || []).includes(c));
    res.className = reste.length ? "statut erreur" : "statut ok";
    res.textContent = reste.length
      ? "Les choix n'apparaissent pas encore dans Grist (" + reste.join(", ") + ") : ajoute-les à la main dans le panneau de la colonne."
      : aAjouter.length + " choix ajouté(s) à la colonne Statut.";
  } catch (e) {
    res.className = "statut erreur";
    res.textContent = "Impossible d'ajouter les choix automatiquement (" + e.message + ") : ajoute-les à la main dans Grist.";
  }
});

el("btn-actualiser").addEventListener("click", () => charger().catch(e => { el("resultat").className = "statut erreur"; el("resultat").textContent = "Erreur : " + e.message; }));
el("btn-sauvegarde").addEventListener("click", () => telecharger(aMigrer()));
el("btn-afficher-copie").addEventListener("click", () => afficherPourCopie(aMigrer()));
el("btn-copier").addEventListener("click", copierTexte);

el("btn-migrer").addEventListener("click", async () => {
  const liste = aMigrer();
  const res = el("resultat");
  res.className = "statut";
  if (liste.length === 0) { res.textContent = "Rien à migrer : aucune ligne ne porte un ancien statut."; return; }
  const resume = mappingActuel().map(([a, n]) => compter(a) ? "• " + a + " → " + n + " : " + compter(a) : null).filter(Boolean).join("\n");
  if (!confirm("Migrer " + liste.length + " ligne(s) ?\n\n" + resume + "\n\nUne sauvegarde CSV va être téléchargée d'abord.")) return;
  el("btn-migrer").disabled = true;
  try {
    telecharger(liste); // sauvegarde avant écriture
    afficherPourCopie(liste); // et liste copiable à l'écran (le téléchargement peut être bloqué)
    await grist.docApi.applyUserActions([
      ["BulkUpdateRecord", TABLE, liste.map(r => r.id), { [COLONNE]: liste.map(r => r.nouveau) }]
    ]);
    await charger();
    const restantes = aMigrer().length;
    res.className = restantes === 0 ? "statut ok" : "statut erreur";
    res.textContent = restantes === 0
      ? "Migration terminée : " + liste.length + " ligne(s) mises à jour. Tu peux retirer ce widget."
      : "Attention : " + restantes + " ligne(s) portent encore un ancien statut. Relance « Actualiser ».";
  } catch (e) {
    res.className = "statut erreur";
    res.textContent = "Erreur, rien n'a été modifié : " + e.message;
    el("btn-migrer").disabled = false;
  }
});

charger().catch(e => { el("statut-chargement").className = "statut erreur"; el("statut-chargement").textContent = "Erreur de lecture : " + e.message; });
