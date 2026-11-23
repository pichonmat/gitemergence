// Migration de la structure — v8
// Outil à usage unique : widget personnalisé (accès complet) à ajouter temporairement dans Grist.
// Compare le document au modèle attendu par le widget Émergence et crée ce qui manque. Ne supprime rien.
const VERSION_OUTIL = "8";
grist.ready({ requiredAccess: 'full' });

// Modèle attendu. creer:true = la table est créée si elle manque ; sinon elle doit déjà exister.
// type "…" comparé sur la partie avant « : » (Date et DateTime sont distincts) ; formule:true = colonne calculée (non créée).
const STRUCTURE = [
  { table: "Emergence", colonnes: [
    ["Titre", "Text"], ["Ref_BRM", "Text"], ["Objet_de_la_demande", "Text"], ["Detail_de_la_demande", "Text"],
    ["Main_courante", "Text"], ["Organisation", "Text"], ["Sponsor", "Ref:Emergence_Acteurs"],
    ["Parties_prenantes_concernees", "RefList:Emergence_Acteurs"], ["Porteurs", "Choice"], ["Statut", "Choice"],
    ["Priorite", "Choice"], ["Date_de_soumission", "Date"], ["Date_de_cloture", "Date"],
    ["Date_de_modification", "Date", "Date de modification"],
    ["Tag", "ChoiceList", "Tag"], ["Ref_Emergence", "Text", "Réf.", '"EMG-%04d" % $id', "formule"],
    ["Date_Go_NoGo_SDID", "Date", "Go/noGo SDID"], ["Date_MVP_previsionnelle", "Date", "MVP (prévisionnel)"], ["Date_MVP_realisee", "Date", "MVP (réalisé)"]
  ] },
  { table: "Emergence_Acteurs", colonnes: [
    ["Nom_et_Prenom", "Text"], ["Organisation", "Text"], ["mail", "Text"], ["Role", "Text"]
  ] },
  { table: "Emergence_Rida", colonnes: [
    ["ID2", "Ref:Emergence"], ["RIDA", "Text"], ["Porteur", "Text"], ["Pour_le", "Date"], ["Description", "Text"],
    ["Fait_le", "Date"], ["Date_de_modification", "Date", "Date de modification"],
    ["Participants", "RefList:Emergence_Acteurs", "Participants"]
  ] },
  { table: "Emergence_Images", creer: true, colonnes: [
    ["ID2", "Ref:Emergence", "ID"], ["Nom", "Text"], ["Type", "Text"], ["Date_ajout", "Date", "Date d'ajout"],
    ["Donnees", "Text", "Données (base64)"]
  ] },
  { table: "Emergence_Parametres", creer: true, colonnes: [
    ["Cle", "Text", "Clé"], ["Valeur", "Text"], ["Description", "Text"]
  ] },
  { table: "Emergence_Templates", creer: true, colonnes: [
    ["titre", "Text"], ["Fichier", "Attachments"]
  ] },
  { table: "Emergence_BalInno", creer: true, colonnes: [
    ["Recu", "DateTime:Europe/Paris", "Reçu"], ["Expediteur", "Text", "Expéditeur"], ["Destinataires", "Text"], ["Sujet", "Text"], ["Message", "Text"], ["UID", "Numeric"],
    ["Demandes", "RefList:Emergence", "Demandes"], ["BAL", "Text", "$BAL"]
  ] },
  { table: "Emergence_Session", creer: true, colonnes: [["Email", "Text", "Email", "user.Email"]] }
];
// Colonne à convertir en Choice List (sélection multiple de la typologie).
const COLONNE_CONVERSION = { table: "Emergence", colonne: "Typologie_de_la_demande", type: "ChoiceList" };

// v8 : statuts supprimés des demandes (Roadmap produit, Initialisation projet → Nouveau ; Recherche cause racine → Qualifier)
const STATUTS_SUPPRIMES = { "Roadmap produit": "Nouveau", "Initialisation projet": "Nouveau", "Recherche cause racine": "Qualifier" };
const COLONNE_STATUT = { table: "Emergence", colonne: "Statut" };
function choixStatutObsoletes(options) {
  try { const o = JSON.parse(options || "{}") || {}; return (o.choices || []).filter(c => Object.prototype.hasOwnProperty.call(STATUTS_SUPPRIMES, c)); } catch (e) { return []; }
}
async function migrerStatuts(meta) {
  const t = await grist.docApi.fetchTable(COLONNE_STATUT.table);
  const actions = [];
  (t.id || []).forEach((id, i) => {
    const v = t[COLONNE_STATUT.colonne] ? t[COLONNE_STATUT.colonne][i] : null;
    if (Object.prototype.hasOwnProperty.call(STATUTS_SUPPRIMES, v)) actions.push(["UpdateRecord", COLONNE_STATUT.table, id, { [COLONNE_STATUT.colonne]: STATUTS_SUPPRIMES[v] }]);
  });
  if (actions.length) await grist.docApi.applyUserActions(actions);
  let retires = 0;
  const colS = meta[COLONNE_STATUT.table] && meta[COLONNE_STATUT.table].colonnes[COLONNE_STATUT.colonne];
  if (colS && colS.options) {
    const o = JSON.parse(colS.options || "{}") || {};
    const avant = (o.choices || []).length;
    o.choices = (o.choices || []).filter(c => !Object.prototype.hasOwnProperty.call(STATUTS_SUPPRIMES, c));
    if (o.choiceOptions) Object.keys(STATUTS_SUPPRIMES).forEach(c => { delete o.choiceOptions[c]; });
    retires = avant - o.choices.length;
    if (retires) await grist.docApi.applyUserActions([["ModifyColumn", COLONNE_STATUT.table, COLONNE_STATUT.colonne, { widgetOptions: JSON.stringify(o) }]]);
  }
  return { fiches: actions.length, choixRetires: retires };
}

const el = (id) => document.getElementById(id);
const baseType = (t) => String(t || "").split(":")[0];
let plan = [];            // éléments proposés : { cle, libelle, detail, etat, actions[], coche }
let sauvegardeCsv = "";

async function lireMeta() {
  const tables = await grist.docApi.fetchTable("_grist_Tables");
  const cols = await grist.docApi.fetchTable("_grist_Tables_column");
  const parTable = {};
  (tables.id || []).forEach((id, i) => { parTable[tables.tableId[i]] = { ref: id, colonnes: {} }; });
  const refVersTable = {};
  Object.keys(parTable).forEach(t => { refVersTable[parTable[t].ref] = t; });
  (cols.id || []).forEach((id, i) => {
    const t = refVersTable[cols.parentId[i]];
    if (!t) return;
    parTable[t].colonnes[cols.colId[i]] = { type: cols.type[i], options: cols.widgetOptions[i] || "", formule: !!(cols.isFormula && cols.isFormula[i]) };
  });
  return parTable;
}

async function analyser() {
  const meta = await lireMeta();
  const lignes = [];
  const alertes = [];
  if (!meta["Emergence"]) throw new Error("La table Emergence est introuvable : ce n'est pas le bon document.");
  for (const def of STRUCTURE) {
    const existe = !!meta[def.table];
    if (!existe) {
      if (def.creer) {
        lignes.push({ cle: "table:" + def.table, libelle: "Table " + def.table, detail: "à créer (" + def.colonnes.length + " colonnes)", etat: "a-faire",
          actions: [["AddTable", def.table, def.colonnes.map(c => {
            const o = { id: c[0], type: c[1], label: c[2] || c[0], isFormula: false }; // même définition que le widget (formule déclencheur)
            if (c[3]) o.formula = c[3];
            return o;
          })]] });
      } else {
        alertes.push("La table « " + def.table + " » est introuvable : elle est indispensable au widget et ne peut pas être créée par cet outil.");
        lignes.push({ cle: "table:" + def.table, libelle: "Table " + def.table, detail: "introuvable", etat: "alerte", actions: [] });
      }
      continue;
    }
    lignes.push({ cle: "table:" + def.table, libelle: "Table " + def.table, detail: "présente", etat: "ok", actions: [] });
    for (const [id, type, label, formule, pure] of def.colonnes) {
      const col = meta[def.table].colonnes[id];
      const refCible = /^Ref(List)?:(.+)$/.exec(type);
      if (!col) {
        if (refCible && !meta[refCible[2]] && !STRUCTURE.some(s => s.table === refCible[2] && s.creer)) {
          lignes.push({ cle: def.table + "." + id, libelle: def.table + "." + id, detail: "référence vers " + refCible[2] + " (introuvable)", etat: "alerte", actions: [] });
          continue;
        }
        lignes.push({ cle: def.table + "." + id, libelle: def.table + "." + id, detail: "colonne à créer (" + type + ")", etat: "a-faire",
          actions: [["AddColumn", def.table, id, pure ? { type, label: label || id, isFormula: true, formula: formule } : { type, label: label || id, isFormula: false }]] });
      } else if (baseType(col.type) !== baseType(type) && !col.formule) {
        lignes.push({ cle: def.table + "." + id, libelle: def.table + "." + id, detail: "type " + col.type + " (attendu " + baseType(type) + ") — non modifié", etat: "alerte", actions: [] });
      } else {
        lignes.push({ cle: def.table + "." + id, libelle: def.table + "." + id, detail: col.type, etat: "ok", actions: [] });
      }
    }
  }
  // conversion Choice -> Choice List de la typologie
  const c = COLONNE_CONVERSION, colT = meta[c.table].colonnes[c.colonne];
  if (colT && colT.type === "Choice") {
    lignes.push({ cle: "conversion", libelle: c.table + "." + c.colonne, detail: "Choice → Choice List (sélection multiple) ; les valeurs existantes sont conservées", etat: "a-faire", conversion: true, actions: [] });
  } else if (colT) {
    lignes.push({ cle: "conversion", libelle: c.table + "." + c.colonne, detail: colT.type === "ChoiceList" ? "déjà en Choice List" : "type " + colT.type + " — non modifié", etat: colT.type === "ChoiceList" ? "ok" : "alerte", actions: [] });
  }
  // v8 : statuts supprimés
  {
    const colS = meta[COLONNE_STATUT.table] && meta[COLONNE_STATUT.table].colonnes[COLONNE_STATUT.colonne];
    if (colS) {
      const tS = await grist.docApi.fetchTable(COLONNE_STATUT.table);
      const nbFiches = (tS[COLONNE_STATUT.colonne] || []).filter(v => Object.prototype.hasOwnProperty.call(STATUTS_SUPPRIMES, v)).length;
      const nbChoix = choixStatutObsoletes(colS.options).length;
      const detail = nbFiches + " fiche(s) à réaffecter (Roadmap produit / Initialisation projet → Nouveau ; Recherche cause racine → Qualifier), " + nbChoix + " choix à retirer de la colonne";
      lignes.push({ cle: "statuts", libelle: COLONNE_STATUT.table + "." + COLONNE_STATUT.colonne, detail: nbFiches || nbChoix ? detail : "statuts à jour", etat: nbFiches || nbChoix ? "a-faire" : "ok", statuts: true, actions: [] });
    }
  }
  return { lignes, alertes, meta };
}

function afficher(res) {
  plan = res.lignes;
  const corps = el("corps");
  corps.innerHTML = "";
  plan.forEach((l, i) => {
    const tr = document.createElement("tr");
    const modifiable = l.etat === "a-faire";
    tr.innerHTML = "<td>" + (modifiable ? "<input type='checkbox' checked data-i='" + i + "'>" : "") + "</td><td></td><td></td><td></td>";
    tr.children[1].textContent = l.libelle;
    tr.children[2].textContent = l.detail;
    tr.children[3].textContent = l.etat === "ok" ? "✓ OK" : l.etat === "a-faire" ? "À faire" : "⚠ À vérifier";
    tr.children[3].className = "etat-" + l.etat;
    corps.appendChild(tr);
  });
  el("alertes").innerHTML = "";
  res.alertes.forEach(a => { const d = document.createElement("div"); d.className = "alerte"; d.textContent = a; el("alertes").appendChild(d); });
  const nb = plan.filter(l => l.etat === "a-faire").length;
  el("btn-appliquer").disabled = nb === 0;
  el("btn-sauvegarde").style.display = plan.some(l => l.conversion) ? "" : "none";
  el("statut").className = "statut";
  el("statut").textContent = nb ? nb + " élément(s) à créer ou convertir." : "La structure est à jour. Rien à faire.";
  el("zone").style.display = "";
}

async function actualiser() {
  try { afficher(await analyser()); }
  catch (e) { el("statut").className = "statut erreur"; el("statut").textContent = "Erreur : " + e.message; }
}

async function lireTypologie() {
  const t = await grist.docApi.fetchTable(COLONNE_CONVERSION.table);
  return (t.id || []).map((id, i) => ({ id, valeur: t[COLONNE_CONVERSION.colonne] ? t[COLONNE_CONVERSION.colonne][i] : null }));
}

function versTexte(v) {
  if (Array.isArray(v)) return v.filter((x, i) => !(i === 0 && x === "L")).join(" | ");
  return v == null ? "" : String(v);
}

async function convertirTypologie(meta) {
  const c = COLONNE_CONVERSION;
  const avant = await lireTypologie();
  const options = meta[c.table].colonnes[c.colonne].options;
  const params = { type: c.type };
  if (options) params.widgetOptions = options;
  await grist.docApi.applyUserActions([["ModifyColumn", c.table, c.colonne, params]]);
  // Grist convertit en général lui-même ; on écrit explicitement les valeurs qui ne sont pas encore des listes.
  const apres = await lireTypologie();
  const parId = new Map(apres.map(r => [r.id, r.valeur]));
  const corrections = [];
  avant.forEach(r => {
    const initial = Array.isArray(r.valeur) ? null : (r.valeur == null || r.valeur === "" ? null : String(r.valeur));
    if (initial === null) return;
    const courant = parId.get(r.id);
    const estListe = Array.isArray(courant) && courant[0] === "L" && courant.length > 1;
    if (!estListe) corrections.push(["UpdateRecord", c.table, r.id, { [c.colonne]: ["L", initial] }]);
  });
  if (corrections.length) await grist.docApi.applyUserActions(corrections);
  const final = await lireTypologie();
  const perdues = avant.filter(r => {
    const attendu = Array.isArray(r.valeur) ? versTexte(r.valeur) : versTexte(r.valeur);
    const f = final.find(x => x.id === r.id);
    return attendu && versTexte(f && f.valeur) !== attendu;
  }).length;
  return { total: avant.length, corrigees: corrections.length, perdues };
}

el("btn-sauvegarde").addEventListener("click", async () => {
  const lignes = await lireTypologie();
  sauvegardeCsv = "id;typologie\n" + lignes.map(r => r.id + ";\"" + versTexte(r.valeur).replace(/"/g, '""') + "\"").join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + sauvegardeCsv], { type: "text/csv;charset=utf-8" }));
  a.download = "sauvegarde_typologie.csv";
  document.body.appendChild(a); a.click(); a.remove();
});

el("btn-appliquer").addEventListener("click", async () => {
  const coches = [...document.querySelectorAll("#corps input[type=checkbox]:checked")].map(c => plan[Number(c.getAttribute("data-i"))]);
  if (!coches.length) { el("resultat").className = "statut erreur"; el("resultat").textContent = "Rien n'est coché."; return; }
  if (!window.confirm("Appliquer " + coches.length + " modification(s) de structure ? Pensez à avoir fait une copie du document.")) return;
  el("btn-appliquer").disabled = true;
  el("resultat").className = "statut"; el("resultat").textContent = "Application en cours...";
  const journal = [];
  try {
    const meta = await lireMeta();
    // 1) tables, 2) colonnes (les tables référencées existent), 3) conversion
    for (const l of coches.filter(x => x.cle.startsWith("table:"))) { await grist.docApi.applyUserActions(l.actions); journal.push(l.libelle + " créée"); }
    for (const l of coches.filter(x => !x.cle.startsWith("table:") && !x.conversion && !x.statuts)) { await grist.docApi.applyUserActions(l.actions); journal.push(l.libelle + " créée"); }
    const conv = coches.find(x => x.conversion);
    if (conv) {
      const r = await convertirTypologie(meta);
      journal.push("Typologie convertie en Choice List (" + r.total + " fiche(s), " + r.corrigees + " valeur(s) réécrite(s)" + (r.perdues ? ", " + r.perdues + " valeur(s) à vérifier" : "") + ")");
    }
    const st = coches.find(x => x.statuts);
    if (st) { const r = await migrerStatuts(meta); journal.push("Statuts : " + r.fiches + " fiche(s) réaffectée(s), " + r.choixRetires + " choix retiré(s)"); }
    el("resultat").className = "statut ok";
    el("resultat").textContent = "Terminé : " + journal.join(" ; ") + ". Vous pouvez retirer cet outil du document.";
  } catch (e) {
    el("resultat").className = "statut erreur";
    el("resultat").textContent = "Erreur : " + e.message + (journal.length ? " (déjà fait : " + journal.join(" ; ") + ")" : "");
  }
  await actualiser();
});
el("btn-actualiser").addEventListener("click", actualiser);
el("version").textContent = "v" + VERSION_OUTIL;
actualiser();
