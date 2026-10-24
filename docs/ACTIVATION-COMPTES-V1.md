# Derniers réglages Supabase pour les comptes privés

Les Workers et leurs secrets sont préparés automatiquement. Aucune clé, SQL ou
commande n'est à transmettre. Les outils Supabase connectés n'exposent pas les
réglages du service Auth : cette configuration dans son interface reste nécessaire.
Ne modifier que le projet **Mimmo-Paris**.

## 1. Adresses de retour

Ouvrir https://supabase.com/dashboard/project/nfhkfjtyfojiwajvbukk/auth/url-configuration

Dans **Site URL**, enregistrer :

`https://mimmo-v1-comptes-privee.delabarre-max.workers.dev`

Dans **Redirect URLs**, ajouter ces deux adresses exactes, sans joker :

- `https://mimmo-v1-comptes-privee.delabarre-max.workers.dev/api/confirm`
- `https://mimmo-v1-comptes-privee.delabarre-max.workers.dev/api/recover`

## 2. Liens des deux emails

Ouvrir https://supabase.com/dashboard/project/nfhkfjtyfojiwajvbukk/auth/templates

Dans **Confirm signup**, remplacer le lien du bouton de confirmation
(`{{ .ConfirmationURL }}` dans le modèle initial) par :

`{{ .SiteURL }}/api/confirm?token_hash={{ .TokenHash }}`

Dans **Reset password**, remplacer le lien du bouton de récupération par :

`{{ .SiteURL }}/api/recover?token_hash={{ .TokenHash }}`

Enregistrer chaque modèle. Ces expressions sont des paramètres de modèle, pas
des clés secrètes. Elles envoient la confirmation au serveur MIMMO sans transmettre
de jeton de session au JavaScript ou à l'URL applicative.

## 3. Sécurité du compte

Dans Authentication, conserver **Email/password** et **Confirm email** activés.
Régler l'expiration des JWT à **900 secondes** et le minimum du mot de passe à
**12 caractères** dans les réglages correspondants. Aucun abonnement à activer.

## 4. Test produit depuis Safari

Ouvrir https://mimmo-v1-comptes-privee.delabarre-max.workers.dev avec la même
protection de démonstration (identifiant `mimmo`, mot de passe déjà choisi).
Créer son propre compte, confirmer l'email, se connecter, créer un bien et
enregistrer des informations et une photo. Fermer et rouvrir Safari pour
vérifier la reprise. Puis tester le lien « Mot de passe oublié ? ».

L'expéditeur Supabase intégré restreint les destinataires et le débit. Pour le
premier essai, utiliser son email de membre de l'organisation Supabase. Ne pas
inviter de clients dans l'organisation technique pour contourner cette limite.
Un SMTP adapté reste nécessaire avant ouverture à des utilisateurs externes ;
aucune souscription ni dépense n'est autorisée automatiquement.

## Toujours bloqué volontairement

L'IA reste désactivée tant qu'un fournisseur ne garantit pas le traitement dans
l'Union européenne et que son accès/budget n'est pas approuvé. Les lectures PDF
et OCR restent locales. Le parcours bancaire n'est pas une offre de prêt.
