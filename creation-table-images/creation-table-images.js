// Création de la table Emergence_Images — v1
// Outil à usage unique : widget personnalisé (accès complet) à ajouter temporairement dans Grist.
grist.ready({ requiredAccess: 'full' });

const TABLE = "Emergence_Images";
const COLONNES = [
  { id: "ID2", type: "Ref:Emergence", label: "ID" },
  { id: "Nom", type: "Text", label: "Nom" },
  { id: "Type", type: "Text", label: "Type" },
  { id: "Date_ajout", type: "Date", label: "Date d'ajout" },
  { id: "Donnees", type: "Text", label: "Données (base64)" }
];

const elStatut = document.getElementById("statut");
const elResultat = document.getElementById("resultat");
const btn = document.getElementById("btn-creer");

async function colonnesExistantes() {
  const tables = await grist.docApi.listTables();
  if (!tables.includes(TABLE)) return null;
  const t = await grist.docApi.fetchTable(TABLE);
  return Object.keys(t);
}

async function actualiser() {
  try {
    const tables = await grist.docApi.listTables();
    if (!tables.includes("Emergence")) throw new Error("La table Emergence est introuvable : ce n'est pas le bon document.");
    const cols = await colonnesExistantes();
    if (!cols) elStatut.textContent = "La table " + TABLE + " n'existe pas encore.";
    else {
      const manquantes = COLONNES.filter(c => !cols.includes(c.id));
      elStatut.textContent = manquantes.length
        ? "La table existe ; colonnes manquantes : " + manquantes.map(c => c.id).join(", ") + "."
        : "La table " + TABLE + " existe déjà et est complète. Rien à faire.";
      btn.disabled = manquantes.length === 0;
      if (manquantes.length === 0) return;
    }
    btn.disabled = false;
  } catch (e) {
    elStatut.className = "statut erreur";
    elStatut.textContent = "Erreur : " + e.message;
  }
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  elResultat.className = "statut"; elResultat.textContent = "Création en cours...";
  try {
    const cols = await colonnesExistantes();
    if (!cols) {
      await grist.docApi.applyUserActions([["AddTable", TABLE, COLONNES.map(c => ({ id: c.id, type: c.type, label: c.label, isFormula: false }))]]);
    } else {
      for (const c of COLONNES.filter(c => !cols.includes(c.id))) {
        await grist.docApi.applyUserActions([["AddColumn", TABLE, c.id, { type: c.type, label: c.label, isFormula: false }]]);
      }
    }
    elResultat.className = "statut ok";
    elResultat.textContent = "Table " + TABLE + " prête. Vous pouvez retirer cet outil du document.";
    await actualiser();
  } catch (e) {
    elResultat.className = "statut erreur";
    elResultat.textContent = "Erreur : " + e.message;
    btn.disabled = false;
  }
});

actualiser();
