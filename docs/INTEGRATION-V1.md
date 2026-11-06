# Intégration V1 préparée — 6 novembre 2026

Aucune nouvelle PR : poursuivre la PR 6 et la recette sur cette branche.
Aucune fusion, changement de base distant ou publication effectué.

## Ordre vérifié

| PR  | Contenu                                  | Base actuelle | Tête vérifiée                                 |
| --- | ---------------------------------------- | ------------- | --------------------------------------------- |
| 3   | Expérience guidée mobile                 | main          | dd04fefc2bfd6b196ced67f7ec864fd9101c214d      |
| 4   | Comptes et sauvegarde privée             | branche de 3  | 2e0d2cdbca9ae9898324df2a2aa75356cc3006e8      |
| 5   | Dossier, simulation, PDF/OCR, stockage   | branche de 4  | 58e38f7c3db6f3cd853275c17e4cd80719ee0412      |
| 6   | Corrections, audit et préparation finale | branche de 5  | révision courante de feat/v1-completion-audit |

Les quatre branches forment une chaîne d'ancêtres. `scripts/check-integration.mjs`
vérifie les ancêtres et calcule les quatre arbres de fusion sans modifier aucun
ref, branche ou checkout. Les arbres calculés correspondent aux têtes attendues,
sans conflit. Cette simulation ne fusionne aucune PR. À refaire si main ou une
branche change. Les tests de la révision finale sont exécutés sur le code cumulé.

## Après accord explicite du fondateur seulement

1. Utiliser des **merge commits**, sans squash ni rebase, pour préserver les
   ancêtres de cette pile. Fusionner 3 vers main, puis vérifier CI et arbre.
2. Retargeter 4 vers main, revoir le diff résiduel, passer en revue après recette
   comptes puis fusionner après validation. Vérifier CI et arbre.
3. Retargeter 5 vers main, revoir le diff et fusionner après validation.
4. Retargeter 6 vers main et fusionner après validation. Elle porte les
   corrections des dépendances et le verrouillage des publications.
5. Ne supprimer aucune branche automatiquement. Comparer l'arbre final avec
   celui de la révision finale approuvée. Ne pas ouvrir l'application publiquement.

L'accord de fusion est distinct de l'accord de publication. L'ouverture des
comptes à des utilisateurs externes exige un envoi email approprié et sa recette.
Les états brouillon restent inchangés tant que les critères ne sont pas remplis.

## Publications et ressources

La branche de PR 5 possède aujourd'hui un déploiement sur push. La modification
préparée dans PR 6 remplace ce déclenchement par un workflow exclusivement manuel,
avec accord du fondateur et confirmation Workers Free, désactivés par défaut.
Deux cibles séparées : comptes (par défaut) ou démonstration fictive. Mettre à
jour les comptes ne doit plus republier la démonstration fictive.

Cette protection ne devient effective sur la branche de PR 5 que lorsque la
modification y est intégrée. Jusque-là, ne pousser aucun code sur
`feat/integrated-v1`. Travailler uniquement sur la branche de PR 6.
Le workflow manuel doit être présent sur la branche par défaut pour être
accessible au déclenchement GitHub ; il n'est pas exécuté pendant cette préparation.
La publication privée de la nouvelle révision nécessitera une autorisation et
un chemin de déclenchement vérifié à ce moment-là.

Les deux démonstrations initiales restent distinctes. Le workflow de publication
initial est manuel ; celui de l'UX PR 3 ne cible que sa branche spécifique.
Ne synchroniser ni modifier ces branches pendant cette préparation.
Aucun déploiement n'est déclenché par la CI de main.
Paris reste l'unique base cible ; ne jamais modifier Londres. Les migrations
002/003/004 sont déjà appliquées : ne pas les rejouer lors de l'intégration.

## Parcours iPhone à rendre disponible

- Compte réel, email confirmé, session protégée.
- Annonce réelle : texte fourni ou capture/PDF local ; URL seulement pour une
  source autorisée. Propositions relues, provenance et contradictions conservées.
- Lecture des documents PDF/OCR avec source et page ; analyse IA séparée et
  inactive tant que le traitement UE n'est pas qualifié. Ne pas appeler la
  lecture OCR une analyse immobilière IA.
- Hypothèses réelles de financement/travaux/loyer, calcul déterministe et PDF.
- Sauvegarde explicite, fermeture/réouverture, reconnexion et reprise du dossier.
- Mot de passe oublié et refus d'accès aux biens/documents de l'autre compte.

Pour le premier essai privé, le mailer Supabase par défaut permet uniquement les
emails des membres existants de l'organisation. Ne pas créer de faux comptes ni
inviter de clients comme administrateurs pour contourner cette restriction.
Un second compte réel et l'ouverture externe requièrent une solution email adaptée.

Les réglages email utilisent désormais les modèles Supabase par défaut : aucun
SMTP ni modification de modèle nécessaire pour le test privé. Le seul écran
d’adresses de retour à vérifier et le parcours de recette sont dans
[ACTIVATION-COMPTES-V1.md](ACTIVATION-COMPTES-V1.md). Aucun SQL ni secret en chat.
