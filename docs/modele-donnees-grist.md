# Modèle de données Grist

Généré automatiquement le 22/09/2026 09:29:33

## Sommaire des tables

- [Emergence](#table-emergence)
- [Emergence_Acteurs](#table-emergence-acteurs)
- [Emergence_PJ](#table-emergence-pj)
- [Emergence_Rida](#table-emergence-rida)

## Table `Emergence`

| Colonne (colId) | Libellé | Type | Formule | Détails |
|---|---|---|---|---|
| `manualSort` | manualSort | `ManualSortPos` | Non |  |
| `Objet_de_la_demande` | Objet de la demande | `Text` | Non |  |
| `Lien_vers_fiche_DS` | Lien vers fiche DS | `Text` | Non |  |
| `Parties_prenantes_concernees` | Parties prenantes concernées | `RefList:Emergence_Acteurs` | Non | → Référence vers `Emergence_Acteurs` (colonne affichée : `Complet`) |
| `Porteurs` | Porteurs | `Choice` | Non | Choix (texte libre, PAS une référence) : Frédéric Dol (SDID), Hana MATTEI (SDID), Equipe, Turgot (DINUM), Caroline ROBILLARD (SDID), Audrey PIERRE (SDID), Clément GERARD (SDID), Eugénie LEVALLOIS (SDID), Mathieu PICHON (SDID), Joel PAGNIEZ (SDID), Sarah BEY (), Christophe LE COZ, etc. |
| `Main_courante` | Main courante | `Text` | Non |  |
| `Vecteur_de_remontee_terrain` | Vecteur de remontée terrain | `Choice` | Non |  |
| `Nom_Prenom_demandeurs` | Nom Prénom demandeurs | `Text` | Non |  |
| `Territoire` | Territoire | `Text` | Non |  |
| `Organisation` | Organisation | `Text` | Non |  |
| `Orientation` | Orientation | `Choice` | Non | Choix : 0- A QUALIFIER, 1.1 DIAG & PLAN D'ACTION (3J), 1.2 IMMERSION (3J), 2- EXPERIMENTATION - 3S, 3- PERENNISATION (3M), A TRANSFERER, Transféré, Sans suite, Fin accompagnement CSIA 2025-26 |
| `Detail_de_la_demande` | Détail de la demande | `Text` | Non |  |
| `Problematique_transverse` | Problématique transverse | `Text` | Non |  |
| `Piste_de_communs` | Piste de communs | `Text` | Non |  |
| `Perimetre_d_impact2` | Périmètre d'impact | `Text` | Non |  |
| `Causes_racines_de_l_irritant` | Causes racines de l'irritant | `Text` | Non |  |
| `ID2` | ID | `Text` | Non |  |
| `Typologie_de_la_demande` | Typologie de la demande | `Choice` | Non | Choix : 1 - Hébergement N8N, 2 - Accès MIRAI API, 3 - Rag, 4 - Grist, 5 - Accompagnement adoption, 0 - Autre, 6 - Synthèse, analyse et reporting, 7 - Instruction des dossiers, 8 - Synthèse, analyse et reporting, 9 - Priorisation / traitement des mails |
| `Synthese_de_la_demande` | Synthèse de la demande | `Text` | Non |  |
| `Statut` | Statut | `Choice` | Non | Choix : 0-Nouveau, 1- En cours, 2- En attente, 3- Clôturé, 4- Transféré, 9 - A qualifier |
| `Politique_Publique_concernee` | Politique Publique concernée | `ChoiceList` | Non | Choix : FINANCES, ECOLOGIE, AFFAIRES SOCIALES, MINISTERE DE L'INTERIEUR, AGRICULTURE, INTERMINISTERIEL |
| `Contributeurs_SDID` | Contributeurs SDID | `Text` | Non |  |
| `Priorite` | Priorité | `Choice` | Non | Choix : P1 - HAUTE, P2- MOYENNE, P3- BASSE |
| `Date_de_cloture` | Date de cloture | `Date` | Non |  |
| `Date_de_soumission` | Date de soumission | `Date` | Non |  |
| `Synthese_reformulation_de_l_irritant_et_etat_de_son_traitement` | Synthèse : reformulation de l'irritant et état de son traitement | `Text` | Non |  |
| `ID_Note` | ID Note | `Text` | Non |  |
| `Organisation_Id` | Organisation Id | `Text` | Non |  |
| `Sponsor` | Sponsor | `Ref:Emergence_Acteurs` | Non | → Référence vers `Emergence_Acteurs` (colonne affichée : `Complet`) |
| `Titre` | Titre | `Text` | Non |  |
| `Porteurs2` | Porteurs2 | `ChoiceList` | Non |  |
| `html_fiche` | html-fiche | `Text` | Oui | Ancienne fiche en formule Grist (texte Python), remplacée par le widget custom `widget-emergence`. Conservée ici pour mémoire/archive uniquement — voir `widget-emergence/`. |

## Table `Emergence_Acteurs`

| Colonne (colId) | Libellé | Type | Formule | Détails |
|---|---|---|---|---|
| `manualSort` | manualSort | `ManualSortPos` | Non |  |
| `Nom_et_Prenom` | Nom et Prénom | `Text` | Non |  |
| `Organisation` | Organisation | `Text` | Non |  |
| `Complet` | Complet | `Any` | Oui | `f"{$Nom_et_Prenom} ({$Organisation})"` |
| `Notes` | Notes | `Text` | Non |  |
| `Emergence` | Emergence | `RefList:Emergence` | Non | → Référence vers `Emergence` (colonne affichée : `Objet_de_la_demande`) |
| `Emergence_Sponsor` | Emergence-Sponsor | `RefList:Emergence` | Non | → Référence vers `Emergence` (colonne affichée : `Objet_de_la_demande`) |
| `Emergence_Porteurs` | Emergence-Porteurs | `RefList:Emergence` | Non | → Référence vers `Emergence` (colonne affichée : `Objet_de_la_demande`) |
| `Organisation_Path` | Organisation Path | `Text` | Non |  |
| `mail` | mail | `Text` | Non |  |
| `Role` | Role | `Text` | Non |  |

## Table `Emergence_PJ`

| Colonne (colId) | Libellé | Type | Formule | Détails |
|---|---|---|---|---|
| `manualSort` | manualSort | `ManualSortPos` | Non |  |
| `ID2` | ID | `Ref:Emergence` | Non | → Référence vers `Emergence` |
| `Titre` | Titre | `Text` | Non |  |
| `Lien` | Lien | `Attachments` | Non |  |

## Table `Emergence_Rida`

| Colonne (colId) | Libellé | Type | Formule | Détails |
|---|---|---|---|---|
| `manualSort` | manualSort | `ManualSortPos` | Non |  |
| `ID2` | ID | `Ref:Emergence` | Non | → Référence vers `Emergence` |
| `RIDA` | RIDA | `Text` | Non | Type RIDA : `I` (Information), `D` (Décision), `A` (Action) |
| `Porteur` | Porteur | `Text` | Non | Texte libre (pas une référence vers Emergence_Acteurs) |
| `Pour_le` | Pour le | `Date` | Non | Date cible |
| `Description` | Description | `Text` | Non |  |
| `Fait_le` | Fait le | `Date` | Non | Date de clôture — vide tant que la ligne n'est pas close |
| `Sujet_Emergence` | Sujet Emergence | `Any` | Oui | `if $ID2: return $ID2.Titre` |
| `Pour` | Pour | `Any` | Oui | `if $ID2: return $ID2.Organisation` |
| `ID3` | ID | `Any` | Oui | `if $ID2: return str($ID2.id)` |
| `A` | A | `Any` | Oui | `if $ID2: return $ID2.Typologie_de_la_demande` |
