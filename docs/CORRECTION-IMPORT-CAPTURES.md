# Import groupé des captures — correction après recette iPhone

Cette correction poursuit la PR 7, sans fusion et sans modifier les biens existants.
Le fondateur a autorisé le travail sur l’aperçu privé des comptes. Aucun changement
Supabase, aucun nouveau fournisseur IA et aucune dépense ne sont nécessaires.

## Fonctionnement

- Jusqu’à 20 images/PDF sélectionnés ensemble ; ajout, retrait, aperçus et ordre
  modifiables avant « Analyser ». Maximum 10 Mo/fichier, 100 Mo/lot, 200 pages.
- Un seul moteur OCR image réutilisé séquentiellement pour réduire les chargements
  et la mémoire. Progression réelle par fichier ; annulation et protection contre
  les résultats d’une ancienne URL. OCR PDF : plafond existant de 10 pages scannées.
- Une fiche commune. Prix de vente, ancien prix, loyer, taxe et charges séparés ;
  pas de transfert automatique de ces observations dans les calculs financiers.
- Surfaces habitable, Carrez, au sol, terrain et annexes distinctes. Une surface
  générique ou un « m? » issu de l’OCR reste une proposition à confirmer.
- Ville reconnue dans les formulations explicites (« appartement à… », « situé à… »,
  « au cœur de… »), lignes de localisation et ville/code postal. Pas de géocodage
  inventé ; une adresse non reconnue reste à compléter.
- Comparaison sur le sens, les unités et la période : 90 €/mois et 1080 €/an ne
  sont pas incompatibles. Des descriptions qui se complètent ne sont pas des
  contradictions. Des prix incompatibles entre deux fichiers restent à arbitrer.
- Les montants isolés, queues numériques d’un OCR corrompu et loyers/frais ne
  deviennent pas un prix de vente. Le DPE graphique n’est pas déduit d’une lettre
  isolée dans toute l’échelle A–G. Les négations des équipements sont conservées.
- Les lectures OCR globalement faibles (<65 selon l’indice moteur, qui n’est pas
  une probabilité de fiabilité) restent incertaines, sans remplissage automatique.
- Parasites UI reconnus retirés par lignes entières ; description reconstruite
  avec dédoublonnage prudent des lignes exactes/imbriquées. Elle est limitée à
  4000 caractères ; le texte brut intégral reste dans l’archive.
- Une liste de propositions par champ remplace les boutons « Utiliser » répétés.
  La fiche remplie, les propositions à confirmer et les absences sont regroupées.

## Provenance, sauvegarde et confidentialité

Les textes OCR originaux, noms des fichiers, pages, méthode, indice moteur et
échecs sont gardés séparément du texte nettoyé. L’archive gzip est sauvegardée dans
l’agrégat privé existant ; aucun original image/PDF n’est téléversé automatiquement.
Une lecture et un téléchargement du texte brut restent disponibles après reprise
du dossier. L’archive est bornée et sa décompression plafonnée à 1 Mo. Si le dossier
dépasse la capacité de sauvegarde existante, un message demande de réduire le lot
et permet de télécharger le brut ; aucune troncature silencieuse de cette archive.

Les variantes distinctes des champs sont conservées avant les preuves répétées
pour ne pas masquer une contradiction arrivant dans la dernière capture. Tous
les fichiers restent référencés dans l’archive, même si les preuves répétées sont
limitées. Les six faits existants et les règles RLS ne changent pas.

## Validation et limites

Tests de classification et de contexte, lot de 12 fichiers avec retrait, faible
qualité, vraies contradictions, sauvegarde/relecture du brut, API authentifiée et
PostgreSQL embarqué avec deux identités. Les navigateurs utilisent le vrai moteur
OCR sur trois captures synthétiques chevauchantes et un PDF scanné. Une confusion
réelle « m² → m? » est reproduite et doit nécessiter une confirmation.

Ces captures de test ne sont **pas** des captures d’une annonce réelle. Les fichiers
qui ont échoué sur l’iPhone du fondateur n’ont pas encore été reçus : cette recette
reste explicitement à faire. La sauvegarde distante personnelle ne doit pas être
annoncée comme vérifiée par ces tests locaux. Aucun compte personnel n’est utilisé
par les tests automatisés.

L’OCR local ne comprend pas les images comme un modèle multimodal. Flou, petites
polices, tableaux, texte tronqué, formulations inhabituelles, pictogrammes et DPE
peuvent rester mal lus. La vitesse dépend de l’iPhone et du nombre de captures ;
une lecture en quelques secondes de vingt images n’est pas garantie.

## Option multimodale UE — proposition, non activée

Une route authentifiée transmettrait le lot à un service d’inférence situé dans
un pays de l’UE, avec sortie structurée par champ/fichier/page/extrait et possibilité
« inconnu ». Le serveur validerait nombres, rôles et provenance, puis utiliserait
la même relecture. Calculs financiers inchangés, aucune navigation du modèle,
aucun suivi d’instruction figurant dans une annonce, aucune sauvegarde automatique.

Conditions préalables : contrat couvrant réellement l’UE exclusivement, modèle
vision disponible dans cette région, absence d’entraînement et rétention définie,
accès propriétaire aux fichiers, secrets serveur, journaux sans contenu, quotas
par utilisateur et plafond budgétaire bloquant sans recharge automatique. Aucun
repli vers une région globale si la région choisie échoue. Hébergement de la base
à Paris seul ne suffit pas à garantir le lieu d’inférence.

Repères publics consultés le 6 novembre 2026 : [tarifs Mistral](https://docs.mistral.ai/inference/pricing)
indiquant OCR 3 à 2 USD/1000 pages et OCR 4.1 à 4 USD/1000 pages. Dix captures
comptées comme dix pages représenteraient donc **0,02–0,04 USD pour l’OCR seul**,
hors structuration, surcharge régionale éventuelle, taxes et hébergement. Ce n’est
pas un devis ni un coût par dossier garanti. Pour une analyse vision facturée en
jetons : entrée × tarif d’entrée + sortie × tarif de sortie ; le lot réel doit être
mesuré avant de proposer un plafond.

La [documentation régionale Mistral](https://docs.mistral.ai/inference/regional-inference)
mentionne UE **et AELE**, ainsi que des métadonnées hors région. Cet endpoint n’est
donc pas validé ici comme répondant à l’exigence stricte du fondateur. Un contrat
plus précis ou un autre hébergement UE doit être qualifié avant activation.
L’IA reste désactivée ; aucun appel facturable n’a été effectué.
