# Aperçu privé des comptes — 6 novembre 2026

Autorisation explicite du fondateur : déployer uniquement l’aperçu privé comptes
avec les corrections de PR 6, sans fusion, sans modifier les autres démonstrations
ni activer d’option payante.

Adresse : https://mimmo-v1-comptes-privee.delabarre-max.workers.dev
Protection extérieure : identifiant `mimmo`, mot de passe habituel inchangé.
Compte applicatif distinct : email/mot de passe personnels saisis par le fondateur.

## Version publiée et preuves

Code applicatif épinglé : `7439f0765929a3a7116c78fd50e3cfaa683e0192`, PR 6.
La branche d’opération `ops/approved-accounts-20261106` ne fait partie d’aucune PR
et ne modifie pas la branche principale. Les secrets existants sont utilisés par
le runner sans lecture ni affichage ; la clé de session existante est préservée.
Les workflows d’opération ne publient que sur cette branche et sous un message
explicite pour la révision déjà autorisée. Les modifications de code ordinaires
ne déclenchent pas de publication.

- [Publication réussie](https://github.com/delabarremax-svg/Mimmo/actions/runs/42195913127) :
  145 tests, audit npm sans vulnérabilité signalée, compilation comptes, déploiement
  du seul Worker `mimmo-v1-comptes-privee`, refus anonyme 401 et accès protégé.
- Paramètres Supabase effectifs vérifiés avant publication : lien de confirmation
  → `/api/confirm`, récupération → `/api/recover`, Site URL → `/`, tous sur l’origine
  comptes ci-dessus. Utilisation de jetons volontairement invalides, aucun email,
  aucun utilisateur fictif ni changement de configuration. Le premier contrôle
  avait arrêté l’opération avant publication parce qu’il cherchait l’erreur dans
  la query plutôt que dans le fragment ; le diagnostic a été corrigé.
- Empreintes HTML/JS/CSS des trois autres démonstrations identiques avant/après :
  `mimmo-demo-privee`, `mimmo-demo-ux`, `mimmo-v1-privee`. Accès anonyme toujours 401.
- Callbacks standard publiés : retour 303 vers un message français exploitable
  quand le code est invalide, `no-store`, aucun jeton affiché.
- [Recette distante mobile réussie](https://github.com/delabarremax-svg/Mimmo/actions/runs/42196245618) :
  octets HTML/JS/CSS comparés aux fichiers compilés de 7439f07 ; écran connexion,
  inscription et récupération à 320/390/430px, sans débordement ni erreur JS.
  Aucun bouton de fixtures dans l’espace comptes ; messages de liens invalides
  effectivement affichés dans le navigateur. Toute requête API autre que GET
  était bloquée par le test. Aucun email ni enregistrement distant créé.

## Reste à vérifier avec le fondateur

Le parcours réel utilise le mailer Supabase par défaut, sans SMTP personnalisé,
avec l’adresse déjà membre de l’organisation. Ouvrir le lien dans le même Safari.
Confirmation et récupération peuvent consommer les deux emails horaires d’essai.

Créer un bien avec titre/source distinctifs, enregistrer, se déconnecter puis se
reconnecter et vérifier sa reprise. Ce test ne doit pas être annoncé comme déjà
réussi : aucun mot de passe personnel ni email de confirmation n’est accessible
à l’assistant. La confidentialité est protégée par RLS et l’API ; l’isolation de
plusieurs comptes réels reste une recette distincte. Aucune donnée réelle n’a été
supprimée ou modifiée pendant l’opération. Londres est resté inchangé.

Guide exact : [ACTIVATION-COMPTES-V1.md](ACTIVATION-COMPTES-V1.md).
L’IA reste désactivée ; PDF/OCR local et calculs financiers ne dépendent pas d’elle.
