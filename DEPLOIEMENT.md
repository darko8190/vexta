﻿﻿# Déploiement de Vexta sur Dokploy

Deux environnements, deux branches, deux fichiers compose :

| Environnement | Branche | Fichier compose     |
| ------------- | ------- | ------------------- |
| QA            | `qa`    | `compose.qa.yaml`   |
| Production    | `prod`  | `compose.prod.yaml` |

Chaque pile démarre trois conteneurs :

```
Internet → Traefik (Dokploy) ──→ app   (Next.js, port 3000)  ──┐
                             └──→ api   (.NET, port 8080)  ────┤ réseau vexta-internal
                                        postgres (port 5432) ──┘
```

`postgres` n'est **pas** rattaché au réseau de Dokploy. Il n'est joignable que par `api`, à
l'intérieur du réseau privé de la pile — sans cela, toute autre application hébergée sur la même
machine Dokploy pourrait l'atteindre.

L'API possède son propre domaine public parce que deux flux ne peuvent pas passer par le proxy
Next : Stripe envoie ses webhooks directement, et Google renvoie le navigateur vers l'API.

---

## 1. DNS

Avant de déployer, faites pointer quatre enregistrements `A` vers l'IP de votre serveur Dokploy :

| Domaine         | Pile       |
| --------------- | ---------- |
| `vexta.ca`      | production |
| `api.vexta.ca`  | production |
| `qa.vexta.ca`   | QA         |
| `api-qa.vexta.ca` | QA       |

Les quatre sont nécessaires, y compris ceux de l'API : sans `api-qa.vexta.ca`, la connexion
sociale et les webhooks Stripe n'ont nulle part où arriver.

Traefik ne peut pas obtenir de certificat Let's Encrypt avant que le DNS ne résolve. Attendez
que `nslookup api.vexta.ca` réponde avant de lancer le déploiement.

Let's Encrypt valide le domaine en contactant le **port 80 depuis l'extérieur**, même si le site
ne sert ensuite qu'en HTTPS. Deux pièges :

- un pare-feu qui ferme le 80 empêche toute émission de certificat ;
- tester depuis votre propre réseau ne prouve rien. Si le serveur est chez vous, votre routeur
  répond en boucle locale et le port paraît ouvert alors qu'il est bloqué de l'extérieur.
  Plusieurs fournisseurs résidentiels, dont Vidéotron, bloquent le port 80 entrant. Vérifiez
  depuis une connexion extérieure, par exemple le partage de connexion d'un téléphone en données
  mobiles.

---

## 1b. Deux piles sur une seule machine

QA et production tournent côte à côte, et les deux fichiers compose décrivent des services
portant les mêmes noms : `postgres`, `api`, `app`. Compose enregistre un alias DNS **égal au nom
du service sur chaque réseau rejoint**, et `api` comme `app` rejoignent `dokploy-network`, qui
est partagé. Sur ce réseau, le nom `api` a donc répondu pour deux conteneurs à la fois.

Docker alterne entre eux. La moitié des appels de la production vers `http://api:8080` étaient
servis par l'API de QA — qui signe les jetons avec une autre clé, d'où des déconnexions au
hasard, et qui lit la base de QA, d'où deux environnements qui semblaient partager leurs données
et leurs intégrations. Les refus n'apparaissaient dans aucun journal : ils se produisaient dans
l'autre pile.

Chaque pile donne donc à ses conteneurs un **alias privé** sur `vexta-internal`, un réseau qui
n'appartient qu'à elle, et les appelle par cet alias :

| | QA | Production |
| --- | --- | --- |
| Base | `vexta-qa-db` | `vexta-prod-db` |
| API | `vexta-qa-api` | `vexta-prod-api` |

Les noms de services restent `api` et `app`, donc les domaines configurés dans Dokploy
continuent de nommer des services qui existent. Ne revenez jamais à `Host=postgres` ou à
`http://api:8080` dans ces fichiers.

---

## 2. Créer l'application dans Dokploy

À faire deux fois, une par environnement.

1. **Project → Create Service → Compose.**
2. **Provider :** GitHub, dépôt `darko8190/vexta`.
3. **Branch :** `prod` (ou `qa`).
4. **Compose Path :** `./compose.prod.yaml` (ou `./compose.qa.yaml`).
5. **Compose Type :** `Docker Compose`, pas `Stack`.
6. Remplissez l'onglet **Environment** (section 3), puis **Deploy**.
7. Une fois la pile démarrée, ajoutez les deux domaines dans l'onglet **Domains** :

   | Host | Service | Port |
   | ---- | ------- | ---- |
   | `vexta.ca` (ou `qa.vexta.ca`) | `app` | 3000 |
   | `api.vexta.ca` (ou `api-qa.vexta.ca`) | `api` | 8080 |

   Activez **HTTPS** et choisissez **Let's Encrypt** comme fournisseur de certificat sur chacun.
   Dokploy crée alors le routeur, demande le certificat et ajoute la redirection HTTP→HTTPS tout
   seul. N'exposez jamais `postgres`.

Le fichier compose ne déclare **aucune** étiquette Traefik : les domaines se gèrent uniquement
ici. Les deux à la fois créeraient deux routeurs pour le même hôte, et Dokploy refuse de
déployer dès qu'un domaine nomme un service absent du fichier — ce qui bloque le déploiement au
moindre renommage.

Le premier déploiement est long : il compile l'API .NET et le front Next.js. Les suivants
réutilisent le cache de couches.

---

## 3. Variables d'environnement

Dans Dokploy, onglet **Environment** de l'application. Un `NOM=valeur` par ligne. Dokploy les
écrit dans un `.env` à côté du fichier compose, que compose substitue dans les `${...}`.

`.env.example` à la racine du dépôt reprend cette liste sous une forme copiable.

### Obligatoires

| Variable             | Exemple            | Comment l'obtenir |
| -------------------- | ------------------ | ----------------- |
| `WEB_DOMAIN`         | `vexta.ca`         | Sans `https://` ni barre oblique finale. |
| `API_DOMAIN`         | `api.vexta.ca`     | Idem. |
| `POSTGRES_PASSWORD`  | 32 caractères      | `openssl rand -base64 32` |
| `JWT_SIGNING_KEY`    | 48 caractères      | `openssl rand -base64 48`. En dessous de 32 octets, HS256 refuse de démarrer. |
| `SUPERADMIN_EMAIL`   | votre courriel     | Le compte créé au premier démarrage. |
| `SUPERADMIN_PASSWORD`| 10 caractères min. | Une majuscule, une minuscule et un chiffre au minimum. |

En QA, utilisez **des valeurs différentes de la production** pour `POSTGRES_PASSWORD`,
`JWT_SIGNING_KEY` et `SUPERADMIN_PASSWORD`. Une clé partagée fait d'un accès QA un accès
production.

### Optionnelles

| Variable | Défaut | Rôle |
| -------- | ------ | ---- |
| `POSTGRES_DB` | `vextaprod` / `vextaqa` | Nom de la base. Il diffère par environnement :
deux piles sur une machine ne doivent pas être à une faute de frappe près d'écrire l'une chez l'autre. |
| `POSTGRES_USER` | `vexta` | Utilisateur PostgreSQL. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | vide | Connexion Google. Vides, le bouton n'apparaît pas. |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | vide | Connexion Microsoft. |
| `BRANDING_LOGO_LIGHT_URL` | vide | Logo sur fond pâle, tant qu'aucun n'est téléversé. |
| `BRANDING_LOGO_DARK_URL` | vide | Logo sur fond foncé. |
| `BRANDING_ICON_URL` | vide | Icône de l'application et onglet du navigateur. |

### Ce qui ne va **pas** dans l'environnement

Les clés d'API ne sont jamais des variables d'environnement. Elles se saisissent dans
l'application, sous **Intégrations**, et sont chiffrées en base avec ASP.NET Core Data
Protection :

- Stripe — clé secrète, clé publiable, secret de webhook
- Mailgun — clé d'API, domaine, expéditeur
- Cloudflare R2 — identifiant de compte, clé d'accès, clé secrète, seau, URL publique

L'API ne les renvoie jamais au navigateur. L'écran Intégrations n'affiche qu'un indicateur
« configuré » et les valeurs non secrètes, de sorte qu'une session super admin compromise ne
révèle pas les clés elles-mêmes.

---

## 4. Volumes

Déclarés dans le fichier compose, créés par Docker au premier démarrage.

| Volume | Monté sur | Contenu |
| ------ | --------- | ------- |
| `postgres-data` | `/var/lib/postgresql/data` | La base de données. |
| `api-keys` | `/data/keys` | **Le trousseau Data Protection.** |

> **`api-keys` est le volume à ne jamais perdre.** Ces clés déchiffrent les identifiants Stripe,
> Mailgun et R2 enregistrés par le super admin. Sans elles, ces lignes deviennent illisibles et
> toutes les intégrations doivent être reconfigurées à la main. L'application ne plante pas pour
> autant — une valeur indéchiffrable est traitée comme absente — mais tout est à ressaisir.
>
> Sauvegardez-le avec la base, pas séparément :
> ```bash
> docker run --rm -v vexta-prod_api-keys:/keys -v "$PWD":/sauvegarde alpine \
>   tar czf /sauvegarde/api-keys.tar.gz -C /keys .
> ```
> (`docker volume ls` donne le nom exact : Dokploy le préfixe du nom du projet.)

---

## 5. Premier démarrage

Au lancement, l'API :

1. applique les migrations EF Core — **à chaque démarrage**, donc un déploiement qui ajoute une
   migration l'applique tout seul ;
2. crée le super admin **seulement si aucun n'existe**.

Le second point mérite d'être compris : le seed ne s'exécute qu'à la création de la base.
Modifier `SUPERADMIN_PASSWORD` par la suite ne change **pas** le mot de passe du compte — il
faut passer par l'application. C'est voulu : un redémarrage ne doit pas pouvoir réinitialiser un
mot de passe en silence.

Le conteneur `app` attend que `api` soit en bonne santé (`/alive`) avant de démarrer, et la
fenêtre de grâce du test est de 90 secondes pour laisser les migrations se terminer.

Ne montez pas `api` à plus d'un exemplaire sans précaution : deux conteneurs qui appliquent les
migrations en même temps peuvent entrer en conflit.

---

## 6. Après le premier déploiement

### Stripe

1. **Intégrations** → clé secrète, clé publiable.
2. Dans Stripe, créez un webhook vers `https://api.vexta.ca/api/billing/webhook`
   (`https://api-qa.vexta.ca/api/billing/webhook` en QA) et abonnez-le à ces trois
   événements — ce sont exactement ceux que l'API traite, le reste est seulement journalisé :
   - `checkout.session.completed` — le paiement est arrivé : on attache le client et
     l'abonnement Stripe au locataire, et c'est là qu'un espace personnel devient une entreprise.
   - `customer.subscription.updated` — changement d'état : `past_due`, `unpaid` et `incomplete`
     passent le locataire en impayé, `active` et `trialing` le réactivent.
   - `customer.subscription.deleted` — abonnement résilié : le locataire passe en annulé.
3. Reportez le secret de signature dans **Intégrations**.
4. **Si vous vendez les paiements en ligne** (les entreprises qui encaissent leurs propres
   clients), activez **Connect** dans Stripe, puis créez un **second** webhook, de type
   *Connect*, vers `https://api.vexta.ca/api/billing/webhook/connect`
   (`https://api-qa.vexta.ca/api/billing/webhook/connect` en QA), abonné à deux événements :
   - `account.updated` — Stripe a autorisé (ou suspendu) une entreprise ; c'est ce qui allume
     le bouton « Payer en ligne » sur ses factures.
   - `checkout.session.completed` — un client a payé une facture : le paiement est inscrit et
     la facture passe à *Payée*.

   Reportez son secret dans **Intégrations → Secret du webhook Connect**. C'est un secret
   **différent** de celui de l'étape 3 : Stripe signe les deux flux séparément, et vérifier
   l'un avec le secret de l'autre fait échouer *toutes* les livraisons avec une erreur qui
   ressemble exactement à une signature falsifiée.
5. Créez vos forfaits dans **Forfaits**. Vexta crée le prix dans Stripe à l'enregistrement ; un
   forfait sans prix Stripe ne peut pas être publié. Chaque forfait porte aussi un **nombre
   d'utilisateurs** — voir la section Équipe plus bas.

### Mailgun

1. **Intégrations** → domaine, clé d'API, adresse et nom d'envoi, région (us ou eu).
2. Enregistrez, puis utilisez **Envoyer un test** dans la même carte. Le test part avec la
   configuration *enregistrée*, pas avec ce qui est à l'écran : enregistrez d'abord.
3. Laissé vide, le test part vers l'adresse d'envoi. Vérifiez aussi les indésirables.

Mailgun accepte parfois une clé tout en refusant le domaine, c'est pourquoi rien d'autre qu'un
envoi réel ne prouve que la configuration fonctionne. Les refus sont relayés tels quels :
une clé rejetée, un domaine inconnu, une région qui ne correspond pas.

Le corps de la réponse est inclus dans le message, et il départage deux cas qui se ressemblent :

| Corps renvoyé | Ce que ça veut dire |
|---|---|
| `404 page not found` | L'URL appelée est mauvaise — c'est un défaut de code, pas un champ à corriger. |
| JSON nommant le domaine | Mailgun ne connaît vraiment pas ce domaine sur ce compte et dans cette région. |
| `Forbidden` | La clé d'API est refusée. |

Un domaine d'envoi doit être un **sous-domaine** (`mg.vexta.ca`), jamais le domaine racine : les MX
de Mailgun ne doivent pas déloger ceux de la messagerie de l'entreprise. GoDaddy remplace le SPF
de Mailgun par sa propre indirection (`include:dc-xxxx._spfm.mg.vexta.ca`) qui aboutit au même
endroit — c'est normal, il ne faut pas la remplacer par la valeur brute.

Sans Mailgun, la plateforme fonctionne : les invitations d'employés ne partent simplement pas
par courriel, et l'administrateur transmet le lien lui-même. **Le mot de passe oublié, lui, ne
fonctionne pas sans Mailgun** : il n'y a pas d'autre chemin pour délivrer le lien, et c'est la
seule fonction qui en dépende absolument.

#### Qui apparaît comme expéditeur

L'adresse d'envoi reste toujours la vôtre — Mailgun n'envoie pas depuis un domaine qu'il ne
possède pas. Le **nom** affiché à côté, lui, est celui de l'entreprise qui écrit : une facture de
Construction Tremblay arrive de « Construction Tremblay », et son invitation d'employé aussi. Le
nom configuré dans **Intégrations** sert de repli pour ce que la plateforme envoie elle-même.

Les réinitialisations de mot de passe partent toujours au nom de **Vexta**, jamais de
l'entreprise : un courriel qui semblerait venir de l'employeur serait exactement la forme du
hameçonnage que ce flux attire.

#### Mot de passe oublié

Deux portes, un seul mécanisme :

- **Page de connexion** → « Mot de passe oublié ? ». La réponse est la même pour une adresse
  connue et une adresse inconnue — autrement la page devient un moyen de savoir qui a un compte
  chez nous.
- **Mon profil** → « Réinitialiser mon mot de passe ». Le lien part à l'adresse du compte, ce qui
  *est* la confirmation par courriel. Aucun formulaire ne change le mot de passe depuis une
  session ouverte : ça le changerait pour qui se trouve devant le clavier.

Le lien est valable **2 heures**, ne fonctionne qu'une fois, et n'ouvre pas de session — la
personne se reconnecte avec le mot de passe qu'elle vient de choisir. Il est signé avec le
trousseau Data Protection, donc **le volume `api-keys` doit survivre aux redéploiements** : un
trousseau neuf invalide tous les liens en vol et rend illisibles les clés d'API enregistrées.

> Depuis cette version, le chemin du trousseau vaut `/data/keys` par défaut, sans rien dans
> l'environnement. Un chemin relatif y était configuré : dans un conteneur il aboutissait à
> `/app`, propriété de root alors que l'application tourne sans privilèges, donc le dossier ne
> pouvait pas être créé et le trousseau repartait de zéro à chaque démarrage. Une seule ligne de
> journal le signalait. Et un réglage qu'on ne peut plus déchiffrer se lisait comme un réglage
> jamais saisi — il est maintenant journalisé pour ce qu'il est.

### Ressources humaines et nombre d'utilisateurs

Chaque forfait porte une plage d'utilisateurs, **le propriétaire compris** : un forfait à 5
donne 5 comptes au total, pas 5 en plus du propriétaire.

- Le **maximum** est la seule valeur appliquée. Au-delà, la case « Accès » ne peut plus être
  cochée et l'API refuse la demande.
- Le **minimum** n'est pas appliqué : il sert à situer le forfait sur la page des tarifs
  (« De 3 à 10 utilisateurs »). Rien ne peut obliger une entreprise à créer des comptes
  qu'elle ne veut pas, et l'en empêcher ne ferait qu'enfermer le propriétaire hors de son
  propre espace.

Baisser le maximum ne déconnecte personne : une entreprise déjà au-dessus garde ses accès
jusqu'à ce qu'elle en retire. La page **Locataires** affiche `utilisés / permis` et passe le
chiffre en rouge quand un locataire dépasse sa limite.

Côté entreprise, la page **Ressources humaines** regroupe quatre sections — Employés,
Équipes, Adresses et Documents — et c'est la première qui liste les employés. Une fiche n'occupe aucun siège tant que
la case **Accès** n'est pas cochée. En la cochant :

1. un compte sans mot de passe est créé — il est donc inutilisable tel quel ;
2. une invitation à usage unique est émise, valable 7 jours ;
3. Mailgun l'envoie s'il est configuré, et le lien est de toute façon affiché pour être copié ;
4. l'employé choisit son mot de passe sur `/bienvenue/<jeton>` et arrive connecté.

Décocher la case supprime le compte et libère le siège ; la fiche de l'employé reste au dossier.

> Un espace sans forfait est plafonné à **1** accès. C'est le cas des locataires créés à la main
> depuis **Locataires** : la colonne **Forfait** de cette page permet de leur en assigner un.
> Changer le forfait d'un locataire ne touche pas à Stripe — ça fixe ce que l'espace a le droit
> de faire, pas ce qu'il paie.
>
> Les forfaits qui existaient avant cette fonction ont été mis à 1 / 1 par les migrations, ce qui
> correspond à ce qu'ils permettaient réellement. Relisez-les avant de vendre.

Les **Documents** des ressources humaines passent par Cloudflare R2 : tant qu'il n'est pas
configuré, le téléversement échoue. Le reste de la section fonctionne sans lui, et le **logo de
l'entreprise** est rangé en base plutôt qu'en R2, pour la même raison que la marque de la
plateforme — il doit survivre à une panne de stockage.

### Espaces : personnel et travail

Un compte n'appartient plus à un seul espace. Une personne a **son espace personnel**, gratuit,
et les entreprises qui lui ont donné un accès ; elle bascule de l'un à l'autre depuis la
pastille de son profil, section **Espaces**.

Ce qui change à chaque bascule : le locataire **et** le rôle. La même personne est propriétaire
de son espace personnel et employée de l'entreprise qui l'emploie, donc le rôle ne peut pas
vivre sur le compte. Il vit sur l'appartenance, et le jeton en porte une à la fois.

- L'espace personnel est créé au premier passage dans le sélecteur, y compris pour les comptes
  qui existaient avant. Rien à migrer.
- Il est **vide pour l'instant** : son menu ne contient que le tableau de bord. Les clients, les
  projets et les factures appartiennent à un compte entreprise, et les offrir ici ouvrirait trois
  écrans dont le seul contenu serait une invitation à changer de forfait. Ce qui ira dans cet
  espace reste à décider.
- Un super admin n'a ni appartenance ni espace personnel : il entre dans un locataire, ce qui
  reste un mécanisme distinct.
- Demander un espace où l'on n'a pas d'appartenance est refusé, même si le locataire existe.

### Accès client

Un **particulier**, ou un **contact nommé** dans la fiche d'une entreprise cliente, peut recevoir
un accès depuis sa fiche. L'invitation est la même que pour un employé : compte sans mot de
passe, jeton à usage unique valable 7 jours, courriel par Mailgun s'il est configuré et lien
affiché dans tous les cas.

Ce qu'un client voit une fois connecté :

| | Client | Employé |
|---|---|---|
| Ses projets, ses factures | Lecture | Lecture et écriture |
| Les projets et factures des autres clients | **Jamais** | Oui |
| Répertoire des clients, RH, fiche entreprise, bibliothèque | **Refusé** | Oui |
| Siège consommé dans le forfait | **Aucun** | Un |

Le cloisonnement est posé dans les filtres de requête, pas dans chaque point d'entrée : demander
explicitement les projets d'un autre client renvoie une liste vide, parce que la requête ne les
a jamais vus.

Deux modifications sont refusées tant qu'un accès existe, parce qu'elles laisseraient un compte
orphelin : **changer le courriel** (c'est l'identifiant) et **passer un particulier en
entreprise** (il ne reste personne pour être le titulaire). Retirer l'accès débloque les deux et
conserve la fiche.

> Un client peut lister ses factures mais pas encore en ouvrir une : le seul écran de détail est
> le formulaire de modification, et le lui montrer serait pire que le manque.

### Paramètres de facturation

Une entreprise ne peut pas créer de facture avant d'avoir rempli **Paramètres → Facturation**,
une fois. Une facture est un document légal : deviner le taux de taxe ou la numérotation à la
place de l'entreprise n'est pas un service à lui rendre.

Ce qu'elle y règle :

- **Taxes** — numéros de TPS et TVQ (laissés vides si elle n'est pas inscrite) et les taux
  appliqués par défaut à chaque nouvelle ligne. Les valeurs du Québec sont pré-remplies : 5 % et
  9,975 %.
- **Numérotation** — un préfixe et le prochain numéro, par exemple `F-0001`. Le numéro **ne peut
  pas reculer** sur une facture déjà émise : il est relevé automatiquement. Supprimer une facture
  ne rend pas son numéro — c'est une référence que des gens citent.
- **Délai et conditions** — le délai fixe la date d'échéance d'une nouvelle facture, les
  conditions s'impriment dessus.
- **Mentions** — la ligne du bas : intérêts de retard, mode de paiement, remerciement.

Le formulaire de facture affiche **l'aperçu à droite**, construit à partir de ce qui est à
l'écran. Il sert à attraper une mauvaise adresse ou un numéro de taxe manquant avant l'envoi,
pas à remplacer le document final.

### Modules et menu des entreprises

Un module n'est plus seulement du contenu marketing. Quand il porte un **lien** — `/clients`,
`/projets` — il devient une entrée du menu latéral de toutes les entreprises dont le forfait
l'inclut. Une seule ligne décrit à la fois ce qui est vendu et ce qui est ouvert, donc les deux
ne peuvent plus diverger.

Chaque module peut aussi être :

- un **sous-onglet** d'un autre, sur un seul niveau — un menu qui s'imbrique plus profond cesse
  d'être lisible d'un coup d'œil ;
- **réservé au propriétaire**, pour les ressources humaines et la fiche entreprise, qu'un
  employé n'a pas à ouvrir. Une entrée qui répond 403 est pire que pas d'entrée.

> **La règle à retenir** : dès qu'un forfait inclut **au moins un** module avec un lien, le menu
> de ses locataires vient **entièrement** des modules. Il ne s'ajoute pas au menu intégré, il le
> remplace. Un forfait qui n'en inclut aucun garde le menu intégré — c'est ce qui permet à un
> locataire sans forfait, donc à tous ceux créés à la main, d'atteindre quoi que ce soit.

Le tableau de bord est toujours là, en premier, et n'est pas un module : une entreprise doit
avoir un endroit où atterrir.

Les onglets ajoutés après coup — **Soumissions**, **Feuilles de temps et poinçons**, **Tâches et
horaire** — sont semés au démarrage comme les autres, à la fin de la liste et cochés sur aucun
forfait. Un onglet ajouté au menu intégré sans ligne correspondante ici serait un onglet qui
disparaît dès qu'un forfait définit un seul module : pensez à les cocher sur les forfaits
concernés.

Les cinq modules standards (Clients, Projets, Factures, Ressources humaines, Entreprise) sont
créés par la migration avec leurs liens, mais **rattachés à aucun forfait** : rien de ce que vous
voyez aujourd'hui ne change tant que vous ne les cochez pas dans un forfait. Si vous aviez déjà
des modules marketing portant les mêmes titres, ils sont conservés tels quels — vous verrez donc
deux lignes « Clients », celle sans écran et celle avec.

#### Les onglets sont créés tout seuls

Vous n'avez plus à taper les modules à la main. Au démarrage, l'API regarde la liste des onglets
que l'application possède réellement et crée celui qui manque, une seule fois, en le reconnaissant
à son **lien** plutôt qu'à son titre. Un module que vous avez renommé reste le vôtre ; un onglet
livré dans une mise à jour apparaît dans la liste le jour où elle est déployée.

Les douze qui existent :

| Lien | Titre | Remarque |
| ---- | ----- | -------- |
| `/tableau-de-bord` | — | Toujours là, jamais un module. |
| `/mes-feuilles-de-temps` | Mes feuilles de temps | Les heures de la personne connectée. |
| `/mes-assignations` | Mes assignations | Ses tâches. |
| `/clients` | Clients | |
| `/projets` | Projets | |
| `/factures` | Facturation | Contient Factures et Paiements. |
| `/achats` | Achats | Contient Dépenses. |
| `/approvisionnement` | Fournisseurs & Commandes | Contient Fournisseurs, Commandes, Réceptions. |
| `/inventaire` | Inventaire | |
| `/outils` | Outils | Les formulaires et leurs réponses. |
| `/rapports` | Rapports | |
| `/ressources-humaines` | Ressources humaines | Réservé au propriétaire. |
| `/entreprise` | Entreprise | Réservé au propriétaire. |

Les deux « Mes… » ne se réservent à personne : ce sont les seuls écrans qui parlent de la
personne plutôt que de l'entreprise, et un administrateur saisit ses heures comme les autres.

Il vous reste **une** décision, celle que vous vouliez prendre : ouvrir **Admin → Forfaits** et
cocher ce que chaque forfait inclut.

Les nouveaux modules sont ajoutés **à la fin** de la liste, pas à leur place naturelle. Un ordre
que vous avez réglé à la main ne doit pas être réarrangé par un déploiement ; glissez-les où vous
les voulez.

> **Un module par onglet, jamais par section.** Les sections d'une page — Factures et Paiements,
> Fournisseurs et Commandes et Réceptions, les quatorze du dossier d'un employé — sont un rail à
> l'intérieur de l'écran, pas des entrées du menu. Elles n'ont pas de module et n'en veulent pas :
> c'est l'onglet qui se vend et qui s'ouvre, et le rail est ce qu'on y trouve une fois entré.

#### L'ordre du menu

Les modules se replacent par **glisser-déposer** dans Admin → Modules : attrapez une ligne par
sa poignée, à gauche. L'ordre du tableau est l'ordre du menu de toutes les entreprises
concernées, et il s'enregistre dès que vous lâchez.

Sans souris, la poignée prend le focus au clavier et répond aux flèches haut et bas.

#### « Mes entreprises n'ont pas l'onglet Rapports / Achats »

C'était le cas le plus fréquent, et ce n'était pas un bogue : le forfait contenait déjà au moins
un module, donc le menu venait **entièrement** des modules, et un écran sans module n'existait pas
pour ces entreprises même s'il répondait parfaitement quand on tapait son adresse.

Depuis que les douze onglets se créent tout seuls, il ne reste qu'une étape :

1. **Admin → Forfaits**, ouvrez le forfait.
2. Cochez les onglets manquants — Rapports, Achats, Inventaire, Outils, ce que vous voulez vendre.
3. Enregistrez. L'entreprise recharge sa page et le menu se rebâtit.

> **Le piège, qui n'a pas changé** : un forfait à **zéro** module laisse voir le menu intégré au
> complet. Lui cocher un seul module fait basculer tout le menu sur les modules — cochez donc
> **tous** les onglets que l'entreprise doit garder d'un coup, pas un seul pour essayer.

### Fonctionnalités : ce qu'un forfait permet de faire

Un module est un **onglet** ; une fonctionnalité est ce qu'on a le droit de faire **dedans**.
Les deux se cochent séparément sur chaque forfait, dans **Admin → Fonctionnalités** pour la liste
et **Admin → Forfaits** pour l'attribution.

Vexta en livre deux, créées au démarrage comme les modules :

| Clé | Nom | Ce qu'elle ouvre |
| --- | --- | ---------------- |
| `ocr` | Lecture de reçus (OCR) | Le bouton qui lit un reçu photographié. Le **nombre** de lectures par mois reste un champ du forfait. |
| `ia` | Assistant IA | Le bouton d'assistant en haut de l'écran, et l'onglet Assistant IA dans les paramètres de l'entreprise. |

Le **nom** et la description vous appartiennent : renommez « Assistant IA » comme votre marketing
l'entend. La **clé**, elle, est ce que le code vérifie, et c'est pour ça qu'elle ne se change pas
sur ces deux lignes-là : la changer éteindrait la fonction pour toutes les entreprises sans que
rien ne l'explique. Vous pouvez créer les vôtres, mais une clé seule ne fait rien tant que
l'application ne la connaît pas.

Décocher une fonctionnalité ne retire **aucun écran** : c'est le bouton concerné qui disparaît,
plutôt que d'apparaître et de refuser.

> Une entreprise dont l'espace n'a **aucun forfait** les a toutes. C'est le cas de tout espace
> créé à la main, et c'est voulu : un espace d'essai doit pouvoir essayer.

À la première mise à jour, la lecture de reçus est cochée d'office sur les forfaits qui avaient
déjà une allocation supérieure à zéro — personne ne perd ce qu'il payait déjà.

### Assistant IA

Une entreprise branche **son propre** compte Claude ou ChatGPT dans **Paramètres → Assistant IA**.
C'est son compte qui est facturé, pas le vôtre : vous n'avez aucune clé à fournir et aucun
quota à surveiller.

Ce qu'elle règle elle-même :

- **Fournisseur** : Claude (Anthropic) ou ChatGPT (OpenAI).
- **Modèle** : du texte libre, parce que les noms de modèles changent plus vite que les
  déploiements. `claude-opus-5-5` et `gpt-5` sont proposés par défaut.
- **Clé API** : chiffrée au repos et jamais renvoyée au navigateur. L'écran dit qu'une clé est
  enregistrée, jamais laquelle. « Oublier la clé » est la seule façon de la reprendre.
- **Activer l'assistant** : le bouton n'apparaît en haut de l'écran que si c'est coché *et*
  qu'une clé est enregistrée.
- **L'autoriser à créer et à modifier** : décoché au départ, exprès.

Le bouton **Tester** fait deux vérifications et dit laquelle échoue : est-ce que Vexta se joint
elle-même, et est-ce que le fournisseur accepte la clé. Ça coûte une fraction de cent et ça évite
de découvrir le problème au milieu d'une question.

#### Ce que l'assistant peut et ne peut pas faire

Il travaille en appelant l'API de Vexta **au nom de la personne qui lui parle**. Il hérite donc
de ses droits, de son entreprise et de toutes les règles de l'application — il ne voit rien
qu'elle ne verrait pas elle-même, et un employé ne peut pas s'en servir pour lire les salaires.

Trois portes restent fermées, côté serveur et pas seulement dans ses instructions :

- **La suppression, toujours.** Créer de travers coûte un après-midi ; supprimer ce qui comptait
  coûte un appel au client. Il dira d'aller le faire soi-même, depuis l'écran concerné.
- **Toute écriture**, tant que « L'autoriser à créer et à modifier » n'est pas coché.
- **La connexion, le super admin, la facturation.** Ce ne sont pas des parties de
  l'application qu'une entreprise conduit en parlant.

Sous chaque réponse, l'assistant affiche ce qu'il a fait : la méthode, la route, et si ça a
marché. Un refus est plus utile visible qu'avalé.

Rien de ce qui lui est écrit n'est conservé par Vexta : la conversation vit dans l'onglet du
navigateur et part avec lui.

#### Ce qu'il coûte

À côté du bouton, en haut de l'écran, une petite étiquette dit ce que l'assistant a consommé
**depuis le début du mois**. Le compteur repart tout seul au changement de mois : la question que
se pose quelqu'un qui surveille une facture est « combien ce mois-ci », pas « combien depuis
toujours ».

Pour qu'elle affiche des dollars, l'entreprise inscrit dans **Paramètres → Assistant IA** ses
deux prix par million de jetons — entrée et sortie — tels que son fournisseur les lui facture.
Tant qu'ils sont vides, l'étiquette affiche les jetons.

**Nous n'inscrivons aucun prix à sa place, et c'est voulu.** Un tarif gravé dans le code serait
faux pour quiconque a négocié son taux, et faux pour tout le monde le jour où un fournisseur
change sa liste — faux d'une manière qui ressemble à un relevé de compte. Les jetons, eux, sont
vrais sans prétendre être une facture.

Le compte inclut tous les allers-retours d'une même question, pas seulement le dernier : une
demande réglée en trois appels d'outil est facturée pour les quatre échanges.

### Essai gratuit et rabais de départ

Deux champs de plus sur chaque forfait, dans **Admin → Forfaits**.

**Jours d'essai gratuit.** Au-dessus de zéro, s'inscrire à ce forfait **ne demande aucune carte
de crédit** : l'entreprise entre tout de suite, et une bande en haut de l'écran compte les jours
qui restent avec un bouton **Payer l'abonnement** qui mène à Paramètres. À zéro, rien ne change :
le paiement est demandé à l'inscription comme avant.

L'essai est tenu par Vexta, pas par Stripe. Il n'y a ni client, ni abonnement, ni carte chez
Stripe pendant ce temps-là — faire passer l'essai par Stripe aurait voulu dire ramasser une carte
pour commencer quelque chose de gratuit, ce qui est précisément ce qu'on évite ici.

Quand l'essai est écoulé, les onglets se referment avec un message qui dit quoi faire, et non une
page vide. L'entreprise, ses données et son dossier restent intacts : c'est l'accès aux modules
qui s'arrête, jamais le contenu.

**Rabais de départ.** Un pourcentage et une durée — 15 % pendant les 3 premiers mois, par
exemple. Les deux vont ensemble : un pourcentage sans durée ne s'applique jamais, une durée sans
pourcentage ne retire rien, et le formulaire refuse les deux cas plutôt que d'enregistrer un
rabais qui ne fait rien.

Celui-là, c'est Stripe qui l'applique, sur les vraies factures. C'est ce qui fait que le reçu que
le client reçoit et ce que Vexta affiche disent la même chose — un rabais calculé de notre côté
aurait à être refait à chaque prorata, chaque remboursement et chaque changement de forfait, et
finirait par contredire la facture.

Changer le rabais d'un forfait crée un nouveau coupon chez Stripe : le pourcentage et la durée
d'un coupon ne se modifient pas une fois créés. Les entreprises déjà abonnées gardent le coupon
qu'elles avaient, parce que leur supprimer le leur couperait leur rabais avant la fin.

L'essai et le rabais s'affichent tous les deux sur la carte du forfait au moment de s'inscrire.
Un essai dont l'acheteur n'est pas informé est un essai que personne ne prend.

### Se désabonner

**Paramètres → Abonnement → Se désabonner.** Rien ne ferme le jour du clic : Stripe laisse
l'abonnement courir jusqu'à la fin de la période déjà payée, puis il s'éteint tout seul. Garder
l'argent d'un mois sans livrer le mois serait un drôle de commerce.

Tant que cette date n'est pas passée, le même écran propose **Reprendre l'abonnement**. Une
résiliation faite depuis le tableau de bord Stripe arrive ici aussi, par le webhook.

Les données restent en place dans tous les cas : c'est l'accès aux modules du forfait qui cesse,
pas le dossier de l'entreprise.

### Importer et exporter en Excel

Quatre listes voyagent en classeur `.xlsx` : **Clients**, **Employés**, **Fournisseurs** et
**Produits**. Sur chacune de ces pages, un bouton **Excel** ouvre trois choix :

- **Télécharger le modèle** — un classeur vide, en-têtes et une ligne d'exemple remplie.
- **Télécharger en xlsx** — la même forme, avec tout ce qui est en place.
- **Importer un xlsx** — relire un classeur.

Le modèle et l'export ont **exactement la même forme**, et c'est ce qui rend l'aller-retour
possible : exportez, changez une colonne dans Excel, réimportez.

Chaque classeur porte aussi les sous-onglets qui comptent, parce qu'un client n'est pas une ligne
— c'est une ligne plus ses contacts plus ses adresses :

| Liste | Onglets du classeur | Clé |
| ----- | ------------------- | --- |
| Clients | Clients, Contacts, Adresses | Le nom du client |
| Employés | Employés, Contacts d'urgence, Adresses, Formations et permis | Le courriel |
| Fournisseurs | Fournisseurs | Le nom |
| Produits | Produits, Catégories, Sous-catégories | Le code, sinon le titre |

Sur les onglets secondaires, la colonne qui relie à la fiche principale reprend cette clé —
le nom du client, le courriel de l'employé. Pas un identifiant interne : une personne qui bâtit
une liste dans Excel n'en a pas, et un format que seul un export peut produire est un format que
personne ne peut taper.

**L'importation met à jour plutôt que de dupliquer.** Une clé déjà connue modifie la fiche en
place ; réimporter deux fois le même fichier ne crée rien la deuxième fois. Une ligne qu'on ne
peut pas prendre est signalée avec son numéro et la raison, et les autres passent quand même.

Ce qui ne s'importe **pas**, volontairement :

- Les **salaires** et la **banque d'heures**. Un taux est un historique daté, et laisser un
  tableur l'écraser réécrirait ce que quelqu'un a été payé en mars.
- La **quantité en stock**. Elle bouge par entrées d'inventaire, qui sont ce qu'un décompte ou
  une livraison laisse derrière. La taper par-dessus ferait mentir l'historique qui l'explique.
- Le **rôle** d'un employé qui a déjà un accès. Promouvoir ou rétrograder un compte vivant depuis
  un tableur, sans rien à l'écran qui le dise, n'est pas une bonne surprise.
- **Aucune invitation n'est envoyée.** L'importation écrit le dossier ; la case « Accès » reste
  un geste délibéré.

Importer ou exporter les **employés** est réservé au propriétaire, comme le reste de leur dossier.

### La fiche d'un client

Le premier sous-onglet est **Détails** : tout ce qui a été saisi à la création — numéro, type,
statut, personne-ressource, téléphone, courriel, numéro de taxe, taxes, adresse principale, solde
au compte, notes. C'est ce qu'on vient chercher en ouvrant un client neuf fois sur dix, alors
c'est la section sur laquelle la fiche s'ouvre.

La carte du haut garde le nom, les pastilles qui changent ce que les boutons feront (banni,
compte bloqué, non taxable) et les boutons eux-mêmes. Elle ne grossit plus à chaque champ ajouté.

Le dossier d'un employé suit exactement la même forme — voir *Le dossier d'un employé*.

### Actifs, comptes clients et paiements

#### Actifs

Un **actif** est ce que le client possède et sur quoi vous travaillez : un véhicule pour un
garage, un immeuble pour un entrepreneur, une fournaise pour un frigoriste. Le sous-onglet
**Actifs** d'une fiche client les liste.

Volontairement pas appelé « véhicule » : dès qu'un métier obtient sa propre table, le suivant en
veut une aussi. Et pas « équipement » non plus — ce mot désigne déjà l'outillage de
l'entreprise dans l'inventaire, et l'auto d'un client n'est pas l'équipement du garage.

Les champs sont ceux que tous les métiers remplissent vraiment : un nom, un **type**, marque,
modèle, année, un numéro de série (NIV, plaque signalétique), une référence (plaque
d'immatriculation, numéro d'unité), un relevé d'usage avec son unité, et une adresse pour ce qui
ne se déplace pas. Les deux numéros sont indexés : on retrouve une auto avec une plaque, pas
seulement avec un nom.

Un actif vendu ou mis au rebut se décoche — **Toujours en service** — plutôt que de se
supprimer. Le travail fait dessus reste de l'histoire, et l'histoire ne cesse pas d'être vraie
parce qu'une auto a changé de mains.

#### Types d'actifs

Le type est une ligne dans la liste de l'entreprise — Véhicule, Maison, Bloc appartements,
Machinerie — et non une valeur figée dans le code. La liste est différente dans chaque métier et
s'allonge à mesure qu'un métier rencontre du nouveau travail.

Elle se complète **depuis le menu déroulant qui en a besoin**, avec le bouton `+` à côté du
champ Type, comme les catégories de dépenses. S'arrêter pour aller configurer une liste ailleurs,
c'est ce qui fait choisir le mauvais type.

Un type déjà utilisé ne se supprime pas : le refus dit combien d'actifs s'en servent. Les actifs
perdraient le seul champ qui dit ce qu'ils sont, et personne ne pourrait le remettre.

#### L'actif d'un projet

Un projet peut porter sur un des actifs de son client : le champ **Actif** du formulaire de
projet cherche parmi les actifs en service de ce client, et permet d'en ajouter un sans quitter
le formulaire. Il est facultatif — beaucoup de mandats ne portent sur aucune chose en
particulier.

L'API refuse l'actif d'un autre client, comme elle refuse déjà l'adresse d'un autre client : les
identifiants viennent du navigateur, et un bon de travail qui nomme le camion de quelqu'un
d'autre est une erreur qu'on ne rattrape pas.

Changer le client d'un projet vide le champ. Supprimer un actif ne supprime pas les projets faits
dessus — vendre l'auto n'efface pas la réparation.

#### Compte client

Chaque client a un compte : un relevé de ce qui a été porté dessus et de ce qui a été payé. Le
solde est **la somme des lignes** et n'est stocké nulle part — un solde stocké et une liste de
lignes sont deux choses qui doivent concorder, et un jour elles ne concordent plus.

Trois types de lignes : **Charge** (une facture portée au compte), **Paiement** (de l'argent
reçu) et **Ajustement** (solde d'ouverture, note de crédit, correction). Aucun formulaire
n'affiche de signe négatif : on saisit un montant positif et le type décide du sens.

#### Paiements de facture

Le bloc **Paiements** apparaît sous les lignes d'une facture dès qu'elle n'est plus un brouillon.
Plusieurs paiements par facture — un acompte puis le solde, c'est deux lignes — et ce qui reste à
encaisser est le total moins ces lignes.

La facture passe à **Payée** quand l'arithmétique le dit, pas quand quelqu'un pense à changer un
menu. Retirer un paiement la ramène à Envoyée, ou à En retard si l'échéance est passée.

Méthodes : comptant, Interac, carte, chèque, virement, **porté au compte**, autre. « Porté au
compte » est la seule qui n'encaisse rien : la facture est réglée sur papier et le montant
s'ajoute au compte du client, dans la même écriture — il n'y a pas d'instant où la facture est
payée et où le compte l'ignore. Retirer ce paiement retire aussi la charge.

> Le total d'une facture se calculait à **deux** endroits qui ne s'accordaient pas au cent près :
> l'écran additionnait les montants bruts puis arrondissait, le PDF arrondissait chaque ligne
> puis additionnait. Les deux passent maintenant par `InvoiceTotals`, et c'est la méthode du PDF
> qui a été retenue — c'est la colonne que le client a entre les mains. Quelques factures
> existantes peuvent donc afficher un cent de différence à l'écran : c'est la correction, pas
> l'erreur.

#### Bloquer un client

Deux niveaux, parce que ce sont deux décisions différentes. Réservés au **propriétaire** : un
chargé de projet décide ce qui se construit, pas avec qui l'entreprise fait affaire.

| | Ce que ça arrête | Ce que ça laisse passer |
| --- | --- | --- |
| **Compte bloqué** | Plus rien ne peut être porté au compte | Les projets, les factures, et **les paiements** — sans quoi le client ne pourrait pas régler le solde qui a causé le blocage |
| **Client bloqué** | Nouveau projet, nouvelle facture, nouvel actif, commande sur la page publique | Les projets et factures en cours, les paiements, le relevé |

Rien n'est supprimé et rien ne cesse d'être vrai : ses projets, ses factures et ce qu'il doit
restent exactement où ils sont. Bloquer est une décision commerciale, pas une raison de perdre
ce qui a été fait ni ce qui est dû.

La **raison** saisie est reprise mot pour mot dans le refus — c'est ce que lira la personne au
comptoir dans trois mois, et une porte qui se ferme sans un mot est une porte que personne ne
peut expliquer.

> La commande sur la page publique n'existe pas encore. Le blocage est écrit pour elle :
> `Client.WorkRefusal()` est le seul endroit qui répond « peut-on prendre du travail de ce
> client », et l'endpoint de commande n'aura qu'à l'appeler.

### Rapports

**Admin → Rapports** est le catalogue : chaque ligne décrit un rapport et le **module** auquel il
est rattaché. Ce module est toute sa distribution — une entreprise ne se fait offrir que les
rapports dont le module est dans son forfait, et un module réservé au propriétaire garde ses
rapports pour lui.

C'est donc le module, et non le rôle, qui décide qui voit quoi : « Heures par employé » rattaché
à **Ressources humaines** (réservé au propriétaire) reste chez le propriétaire, tandis que
« Charge de tâches » rattaché à **Projets** est visible de toute l'équipe. Plus fin qu'un rôle,
et surtout : aucune entrée de menu ne mène à un 403.

Pour que l'onglet apparaisse chez les entreprises, créez un module dans **Admin → Modules** :

| Champ | Valeur |
| --- | --- |
| Titre | Rapports |
| Lien | `/rapports` |
| Icône | ChartBar |
| Réservé au propriétaire | non |

Puis cochez-le dans les forfaits concernés. Le menu intégré le contient déjà, donc un locataire
sans forfait y accède sans rien faire.

Le champ **Calcul** d'un rapport choisit la requête que l'API exécute. Trois sont en place :

- **Charge de tâches** — qui porte quoi, et ce qui a dépassé son échéance ;
- **Heures par employé** — les heures inscrites sur une période, et sur combien de chantiers ;
- **Projets par statut** — combien de chantiers à chaque étape, et leur budget.

Les cinq autres (rentabilité par projet, factures impayées, ventes par mois, valeur de
l'inventaire, dépenses par type) apparaissent dans la liste suivies de « à venir » : le rapport
peut être défini et placé dès maintenant, et la page le dit franchement au lieu d'afficher un
tableau vide. Ils demandent le calcul des totaux de facture, qui n'est pas encore partagé entre
le PDF et le reste de l'API.

### États des clients

Un client est **Prospect**, **Client** ou **Ancien client**. Aucun des trois ne bloque quoi que
ce soit : on soumissionne un prospect, et un ancien client qui rappelle redevient client. La
liste des clients se filtre là-dessus — un état sur lequel personne ne peut filtrer est un état
dont personne ne se sert.

**« Banni » n'est pas un quatrième état.** C'est le cadenas de la fiche (voir *Actifs, comptes
clients et paiements*), et un client bloqué garde l'état qu'il avait. L'écran affiche « Banni » à
la place de son état quand le cadenas est fermé. Deux interrupteurs pour une même porte, c'est
deux interrupteurs qui finissent par se contredire — et il faudrait alors expliquer à quelqu'un
un dossier qui dit « Client » en refusant tout.

Les dossiers qui existaient avant cette colonne sont tous des **clients** : ce sont des gens que
l'entreprise sert déjà, et une migration qui les aurait transformés en prospects aurait menti sur
tout le fichier.

### Mon espace : feuilles de temps et assignations

Deux onglets du menu qui ne parlent pas de l'entreprise mais de la personne connectée. Pour la
plus grande partie de la paie, ce sont eux, l'application.

**Mes feuilles de temps** montre ses heures une semaine à la fois, tous chantiers confondus, avec
le total de la semaine. C'est la question qu'on se pose un jeudi soir — « est-ce que mes heures
sont rentrées » — et y répondre en ouvrant cinq projets, c'est ne jamais vérifier. En lecture
seule : des heures se saisissent contre le projet où elles ont été travaillées, et une saisie
sans projet serait un coût que personne ne peut facturer.

La semaine va du **lundi au dimanche** et c'est le serveur qui décide où tombe le lundi. Un quart
qui commence dimanche 22 h et finit lundi 2 h appartient aux deux semaines et apparaît dans les
deux : l'écarter de l'une perdrait des heures payées.

**Mes assignations** montre les tâches qui lui ont été confiées, par son nom **ou par une équipe
dont il fait partie** — et dit laquelle des deux, parce que « ce n'est pas à moi, c'est à
l'équipe » est la première chose que pense quelqu'un devant une tâche qu'il ne reconnaît pas. Le
statut se change sur le projet, pas ici : deux endroits pour changer la même chose sont deux
endroits qui divergent.

Un compte sans dossier d'employé — un fondateur qui ne s'est jamais mis sur la paie — voit une
page qui le dit, et non une erreur.

### Achats et dépenses

**Achats** porte deux sous-onglets : **Dépenses** et **Factures fournisseurs**. Le second est en
place et vide pour l'instant — le rail est le plan, et une page qui gagne un rail plus tard
déplace tout ce que les gens avaient appris à trouver.

La page liste **toutes** les dépenses de l'entreprise, tous projets confondus, avec recherche,
type et période. « Combien on a dépensé en novembre » est une question d'achats, et y répondre en
ouvrant quarante projets, c'est ne jamais y répondre.

Les trois totaux en haut portent sur **tout ce que les filtres attrapent**, pas sur les vingt
lignes affichées : un total d'une page aurait l'air d'une réponse et serait la mauvaise. Une
dépense sans date est écartée d'une recherche datée plutôt que ramassée dedans — on n'a pas dit
quand l'argent est sorti, donc aucune période ne peut honnêtement la réclamer.

Le bouton **Nouvelle dépense** est maintenant ici aussi. Comme une dépense appartient toujours à
un projet — c'est ce qui la rend facturable — il demande d'abord lequel, puis ouvre le même
formulaire que sur le projet, photo du reçu comprise. Deux étapes plutôt qu'un champ « projet »
caché dans le formulaire : la question n'est pas optionnelle, et un formulaire dont le premier
champ décide du sens de tout le reste se remplit à l'envers.

### Formulaires

Sous **Outils & Formation → Formulaires**, une entreprise monte ses propres formulaires : les
questions, le type de réponse attendu, et **ce que la réponse déclenche**.

**La ligne s'ouvre.** Il n'y a plus de menu à trois points sur la liste : presser la carte d'un
formulaire mène à sa page. On y trouve **Détails** en premier sous-onglet — ce qui a été saisi à
sa création : le titre, l'état, la description, le message de confirmation — puis les questions,
les actions et les réponses. Supprimer se fait depuis cette page, là où on voit ce qu'on
s'apprête à retirer.

Un employé qui n'administre pas l'entreprise garde sa carte ordinaire et son bouton
**Remplir** : ce qu'il vient faire, c'est répondre.

#### Les questions

Neuf types : Texte, Paragraphe, Nombre, Date, Choix, Choix multiples, Oui/Non, Courriel,
Téléphone. Un Choix exige au moins deux choix — une question à une seule réponse n'est pas une
question.

Les questions se montent et s'enregistrent **en un seul coup**, pas une requête par ligne.
Monter un formulaire, c'est réordonner, renommer et supprimer dans la même séance ; un écran qui
sauvegardait chaque frappe serait un écran où la moitié d'un renommage est une question que
personne n'a posée. Le bouton dit quand il reste des modifications à enregistrer.

#### Les actions

C'est la moitié qui donne sa valeur au formulaire. La plupart des outils s'arrêtent à recueillir
des réponses, et les réponses dorment ensuite dans une liste que personne n'ouvre.

- **Envoyer les réponses par courriel** — jusqu'à dix destinataires ; le premier reçoit le
  message, les autres sont en copie. Le nom de l'entreprise apparaît comme expéditeur, l'adresse
  reste la nôtre (Mailgun ne peut pas envoyer au nom d'un domaine qu'il ne détient pas).
  Les destinataires sont configurés par l'entreprise, jamais saisis par celui qui remplit : un
  formulaire qui envoie où on lui dit est un relais à pourriel.
- **Créer un client** — construit avec les questions dont la colonne « Remplit » pointe vers un
  champ du client. Il faut au moins un nom, et l'API refuse l'action tant qu'aucune question n'en
  donne un : un formulaire qui classerait des réponses sans rien créer en ayant l'air de
  fonctionner est pire qu'une erreur. Le client créé est un **prospect** par défaut, et sa fiche
  porte une note disant de quel formulaire il vient — six mois plus tard, « d'où sort ce client »
  est la question que quelqu'un pose toujours.

Une action qui échoue **n'annule pas les réponses**. Elles sont déjà enregistrées quand les
actions partent : une équipe qui vient de remplir douze questions sur un toit ne les remplit pas
une deuxième fois. L'échec est écrit dans le journal de la réponse et dit à l'écran sur le
champ — un formulaire dont le courriel n'est pas parti doit le dire, sinon la personne s'en va en
croyant que le bureau est au courant.

#### Les réponses

Chaque réponse garde **sa propre copie** du libellé et du type de la question. Renommer une
question au printemps ne réécrit pas ce qu'une équipe a répondu à l'automne, et supprimer une
question n'emporte pas les réponses déjà données.

Un formulaire qui a été rempli ne se supprime pas : le refus dit combien de réponses y pendent et
propose de le **dépublier** à la place. Tant qu'il n'est pas publié, les employés ne le voient
pas — le temps de le finir.

Qui fait quoi : tout le monde lit et remplit (c'est fait sur le chantier) ; l'administrateur et
le chargé de projet montent les formulaires ; seul l'administrateur supprime une réponse ou un
formulaire.

### Lecture des reçus (IA)

Dans l'onglet **Dépenses** d'un projet, une fois une photo jointe, un bouton **Lire le reçu**
remplit le fournisseur, le montant et la date à partir de l'image. Il lit aussi la TPS, la TVQ
et le numéro de facture, qui n'ont pas encore de champ dans le formulaire.

**Rien n'est enregistré par la lecture.** Elle remplit le formulaire que la personne est déjà en
train de remplir, et seulement les champs restés vides — quelqu'un qui a déjà tapé le total
n'est pas corrigé par une machine. Elle enregistre ensuite elle-même, après avoir regardé. Un
reçu lu de travers et classé en silence finit sur la facture d'un client, et c'est l'entreprise
qui répond au téléphone.

Les PDF sont acceptés autant que les photos : les fournisseurs envoient les deux.

#### Ce qu'il faut configurer

1. **La clé**, dans **Intégrations → Lecture de reçus**. Elle se crée sur
   `console.anthropic.com` et se range chiffrée en base comme les autres, jamais dans
   l'environnement.
2. **La fonctionnalité `ocr`, cochée sur le forfait** (voir *Fonctionnalités*). Elle est cochée
   d'office sur les forfaits qui avaient déjà une allocation.
3. **Le quota, sur chaque forfait** : le champ *Lectures de reçus par mois*. **Tous les forfaits
   existants sont à zéro** — la migration ne l'a allumé pour personne, parce que c'est la seule
   chose ici qui se facture à l'usage et que l'allumer sans demander mettrait la facture d'API
   de quelqu'un d'autre sur la plateforme. Zéro retire la fonction : le bouton n'apparaît pas,
   plutôt que d'apparaître et de refuser.

Un locataire sans forfait — ceux créés à la main — obtient 100 lectures par mois.

#### Ce que ça coûte

Environ **deux cents par reçu** : une photo de téléphone fait à peu près 2 000 jetons d'entrée,
et la réponse quelques centaines de jetons de sortie. Cent reçus par mois, c'est deux dollars.

Chaque lecture laisse une ligne dans `ReceiptScans` avec son nombre de jetons et le modèle
utilisé, de sorte que « pourquoi ça coûte ça » ait une réponse qui n'est pas une estimation. Le
compteur du mois est un `SELECT count(*)` sur cette table et non une colonne entretenue à côté :
un compteur stocké et une liste de lignes sont deux choses qui doivent concorder, et un mois
elles ne concorderont plus.

Le modèle est `claude-opus-5-5`, parce qu'un reçu est une lecture difficile — papier froissé,
impression thermique effacée, photo prise de travers — et qu'un total lu de travers est pire
qu'un champ vide. `claude-haiku-5-5` est un changement d'une ligne dans `ReceiptScanner` et
coûte environ quarante fois moins ; c'est un vrai compromis, il lira bien une facture de
fournisseur propre et perdra davantage de reçus chiffonnés.

#### Ce qui part chez Anthropic

L'image du reçu et les consignes de lecture. Rien d'autre : ni le nom du client, ni celui du
projet, ni le nom de l'entreprise, ni l'adresse de qui que ce soit. La requête est une image et
une phrase.

### Le dossier d'un employé

La fiche d'un employé a maintenant la même forme que celle d'un client : un rail de sections à
gauche, le contenu à droite. Quatorze sections, dont deux annoncent honnêtement qu'elles ne
contiennent encore rien plutôt que d'être cachées — le rail est le plan, et une pastille à zéro
dit la vérité sur ce qui s'en vient.

| Section | Ce qu'elle contient |
| ------- | ------------------- |
| Détails | Ce qui a été saisi à la création : nom, courriel, téléphone, titre, rôle, accès. |
| Équipes | Celles dont il fait partie, et où il est responsable. Elles se composent depuis l'onglet Équipes des ressources humaines. |
| Contacts | Ses contacts d'urgence : qui appeler s'il arrive quelque chose sur un chantier. |
| Adresses | Où il habite. Plusieurs sont permises ; une seule est la principale. |
| CV | Expériences, formations, compétences — saisies pour pouvoir être cherchées. |
| Salaires | L'historique des taux. **Réservé à l'administrateur.** |
| Dépenses | *À venir.* Une dépense appartient aujourd'hui au projet où elle a été faite. |
| Formations/Permis | Cartes de compétence, permis, formations, avec leur date d'expiration. |
| Horaire | Ce qui est prévu, semaine par semaine. |
| Demandes de congés | Déposées par l'employé, répondues par l'entreprise. |
| Feuilles de temps | Ses heures, semaine par semaine. En lecture seule. |
| Banque d'heures | Le temps supplémentaire accumulé et repris. **Réservé à l'administrateur.** |
| Avantages et allocations | *À venir.* |
| Documents/Notes | Les fichiers à son dossier. |

Trois choses valent la peine d'être sues :

- **Un taux ne se corrige pas, il se remplace par un nouveau.** Écraser un taux ferait coûter
  aux heures du printemps dernier ce que coûtent celles d'aujourd'hui, et la facture sur
  laquelle elles ont été portées cesserait de s'additionner. Un taux daté dans le futur attend
  sa date avant de devenir « en vigueur ».
- **La banque d'heures est une suite de mouvements, pas un solde.** Un nombre dans une colonne
  est quelque chose que personne ne peut contester et que personne ne peut expliquer.
- **Un congé « banque d'heures » approuvé sort les heures de la banque tout seul**, dans la même
  écriture que la décision. L'annuler les remet.

### Ressources humaines : ce qui a bougé

- **Adresses** veut maintenant dire *les adresses des employés*, pas celles de l'entreprise.
  Chaque adresse appartient à quelqu'un, obligatoirement.
- **Les lieux de l'entreprise** — siège social, entrepôt, cour — ont déménagé dans
  **Entreprise → Lieux**. Un entrepôt n'est pas un fait au sujet d'une personne.
- **Contacts** est nouveau : les contacts d'urgence, visibles aussi bien par personne que pour
  toute l'entreprise.
- **Candidats** est nouveau. Embaucher quelqu'un crée sa fiche d'employé **au dossier
  seulement** : aucun accès, aucune licence consommée. Donner l'accès reste une décision
  séparée, prise sur sa fiche.
- **Formations** a quitté Outils pour venir ici. La liste se trie par date d'expiration la plus
  proche : c'est la seule question qu'on ouvre cet écran pour poser — qui va se faire refuser à
  la barrière.
- **Offres d'emplois** est en place et vide, juste **avant** Candidats, parce que c'est l'ordre
  dans lequel ça arrive : une offre sort, et les candidatures entrent contre elle.

### Frais supplémentaires sur un projet

Le sous-onglet **Frais supplémentaires** d'un projet enregistre maintenant de vraies lignes : ce
qui s'ajoute à la facture et qui n'était pas dans la soumission — un déplacement de plus, une
heure de temps supplémentaire, un supplément de fin de semaine.

C'est le formulaire d'une dépense **sans la photo**. Une dépense se prouve par son reçu — le reçu
*est* la dépense. Un frais supplémentaire est une décision que l'entreprise a prise : il n'y a
rien à photographier, et un bouton d'appareil photo ici n'inviterait qu'à classer des reçus là où
le tableau des coûts ne les voit pas.

Il n'y a pas de catégorie non plus. Les types de dépenses d'une entreprise répondent à « quelle
sorte de dépense était-ce » pour la comptabilité ; un frais se décrit par sa propre ligne, et
inventer une deuxième liste à entretenir, c'est se donner un champ obligatoire qui finit toujours
par dire « Autre ».

Le coût et le vendant alimentent la ligne **Frais supplémentaires** du tableau des coûts du
projet, qui attendait à zéro depuis le début. Un projet facturé n'en accepte plus : ce serait de
l'argent que personne n'a mis sur la facture.

### Sous-onglets d'inventaire

**Inventaire** gagne deux sous-onglets en place et vides, dans cet ordre : **Historique de
commandes**, puis **Historique de réceptions**. Chacun montrera toutes les lignes, toutes
commandes ou réceptions confondues. L'ordre suit ce qui se passe : une commande est passée avant
la livraison qui lui répond.

### Les deux boutons d'un carré vide

Une règle maintenant uniforme partout. Quand un carré est **vide**, le bouton pour ajouter est à
**deux endroits** : en haut à droite du carré, et au milieu du carré. Quand il contient des
lignes, il n'est plus qu'en haut à droite.

C'est là qu'on cherche quand il n'y a rien : au milieu de l'espace vide, pas dans un coin. Et une
fois qu'il y a des lignes, le deuxième bouton n'ajouterait que du bruit.

Les adresses d'un client suivent la règle, avec un **Ajouter une adresse** qui manquait : l'écran
disait d'ajouter une adresse « depuis la fiche du client » alors qu'on y était déjà. Presser une
adresse l'ouvre pour la corriger — en ajouter une sans pouvoir réparer une coquille n'est qu'une
demi-fonction.

Un état « aucun résultat » après un filtre n'offre pas de bouton, lui : la liste n'est pas vide,
c'est la recherche qui ne trouve rien, et proposer d'en créer un répondrait à côté.

### Les deux boutons : le reste des carrés

La règle ci-dessus existait, mais douze carrés ne la suivaient pas : leur bouton d'en haut à
droite n'apparaissait **que** lorsqu'il y avait déjà des lignes. Matériaux d'un projet, candidats,
formations, contacts d'urgence, CV, banque d'heures, congés, salaires, adresses d'employés, bons
de commande, fournisseurs et politiques de prix. Ils sont tous corrigés : le bouton d'en haut est
là en permanence.

Quatre carrés n'ont volontairement **aucun** bouton et gardent leur état vide tel quel : les
feuilles de temps d'un employé, les paiements, l'historique de prix d'un produit et les
réceptions. Ces lignes ne se créent pas là — elles arrivent depuis le projet, la facture, un
changement de prix ou un bon de commande — et leur état vide dit où aller.

### Les sous-onglets sont alignés

Le rail des sous-onglets était large de 208 pixels. « Historique de réceptions » n'y entrait pas,
poussait sa pastille hors du cadre, et une ligne plus large sur huit suffit à faire paraître toute
la colonne de travers.

Le rail fait maintenant 256 pixels, c'est-à-dire la largeur du plus long libellé que l'application
possède réellement, pastille comprise. Un libellé encore plus long se coupe avec « … » et son
texte complet apparaît au survol : c'est le filet, pas le plan — un ajout futur se dégrade en
points de suspension au lieu de recasser la colonne.

### L'espace de travail est dans la barre

Le changement d'espace était caché dans le menu du portrait, deux clics plus loin, juste à côté de
« Se déconnecter ». C'était le contrôle le plus lourd de conséquences de toute l'application —
**chaque liste de chaque écran change** quand il change — et rien à l'écran ne disait dans quel
espace on se trouvait : quelqu'un qui tient deux entreprises devait ouvrir un menu pour savoir de
qui il lisait les factures.

Il est maintenant dans la barre du haut et répond sans qu'on l'ouvre. Sur téléphone, seul le
pictogramme reste : la barre y tient déjà le menu, l'assistant, le thème et le portrait.

Il ne s'affiche pas du tout quand il n'y a qu'un seul espace. Un sélecteur qui ne peut rien
sélectionner est un meuble, et afficher « Acme Construction » à quelqu'un qui n'a jamais eu autre
chose qu'Acme Construction est une étiquette, pas un bouton.

### Le tableau de bord

Il comptait trois choses : combien de clients, combien de projets, combien de factures. Ce sont
des nombres qui ne font que monter, et aucun des trois ne répond à une question qu'on se pose en
ouvrant l'application.

Il répond maintenant à : **combien j'ai facturé ce mois-ci** (avec le mois précédent à côté, parce
qu'un chiffre seul ne dit que « de l'argent est rentré »), **combien on me doit**, **combien est
en retard**, **combien j'ai dépensé**, combien de projets sont actifs et combien d'heures ont été
faites cette semaine.

En dessous, **À surveiller** : les factures en retard, les tâches en retard, les congés à décider,
les cartes qui expirent, les produits sous leur minimum, les nouvelles candidatures. Chaque ligne
est un nombre et un endroit où aller. **Un zéro ne s'affiche pas** — « 0 facture en retard » est
une ligne qu'il faut lire pour apprendre qu'il n'y a rien à lire, et six comme celle-là
apprennent à sauter le carré.

La tuile **En retard** ne paraît que lorsqu'il y a vraiment du retard. Une tuile rouge affichant
0 $ tous les jours d'un mois bien tenu est un voyant que plus personne ne regarde.

Tout vient d'une seule requête. Six appels auraient rempli la page en six vagues, et surtout : une
liste répond par pages, donc demander « le mois » à la liste des factures aurait donné le total
des vingt-cinq dernières factures en l'appelant un mois.

Le super admin a le sien : combien d'entreprises, combien d'abonnées, combien en essai, combien
créées ce mois-ci, plus la liste de ce qu'il faut relancer — un essai terminé sans abonnement, un
compte en souffrance, une inscription jamais payée. **Aucun montant** : ce qu'une entreprise paie
vit chez Stripe, et un total calculé ici serait une deuxième réponse qui contredirait les factures
que Stripe a réellement émises.

### Paliers de marge

Une politique de prix peut maintenant facturer une marge **différente selon le prix d'achat**.
L'exemple type : de 1 $ à 5 $, 60 %. Un entrepreneur ne charge pas le même pourcentage sur une
boîte de vis à 2 $ que sur une fenêtre à 2 000 $ — le bas de gamme porte la manutention, le voyage
au comptoir coûte le même prix dans les deux cas.

Le palier se lit sur le **prix d'achat**, pas sur le prix de vente. C'est obligé : la marge est ce
qui transforme un coût en prix, donc un palier sur le prix de vente aurait besoin de la réponse
avant de pouvoir choisir la règle qui la produit.

Un prix qui ne tombe dans **aucun** palier prend la marge ordinaire de la politique. C'est ce qui
fait qu'une politique sans palier se comporte exactement comme avant.

Les **trous sont permis** : on peut tarifer 0–5 $ et 50 $ et plus, et laisser tout le milieu à la
marge ordinaire. Les **chevauchements sont refusés** : deux paliers qui couvrent 4 $ voudraient
dire que le prix d'un article à 4 $ dépend de la ligne lue en premier. Seul le dernier palier peut
rester ouvert vers le haut.

Sur une facture, choisir la politique puis écrire un prix d'achat fait basculer la marge toute
seule : 3 $ donne 60 %, 50 $ donne 25 %. Taper une marge à la main reste possible — la bascule
automatique ne se déclenche que si la politique a des paliers, pour ne pas écraser un pourcentage
que quelqu'un vient d'écrire.

### Offres d'emplois

Elles existaient déjà, mais sous **Entreprise → Page publique**, comme des annonces. Une offre
d'emploi est une décision d'embauche qui se trouve être annoncée, pas un paragraphe de publicité
qui se trouve à attirer du monde : on pouvait réécrire le texte d'un poste sans jamais voir
combien de personnes y avaient répondu.

Elles sont maintenant dans **Ressources humaines → Offres d'emplois**, avec leur état
(brouillon, publiée, pourvue, fermée), le nombre de postes à combler, la date d'affichage, la
fermeture, des notes internes jamais publiées, et surtout le **nombre de candidatures reçues**.
Ce nombre est cliquable : il ouvre les candidats filtrés sur cette offre.

Pourvue et fermée sont deux états distincts exprès. Les deux veulent dire « ce n'est plus ouvert »,
mais une entreprise qui ne peut pas les distinguer ne peut pas dire après coup si son affichage a
fonctionné.

**Une seule autorité.** La page publique n'édite plus les offres, elle y renvoie. Les deux écrans
savaient des choses différentes sur les mêmes lignes : celui de la page publique pouvait publier
un poste sans voir qu'il était comblé. Une offre publiée paraît sur la page tant que la section
est affichée ; la marquer pourvue l'en retire sans qu'il y ait un deuxième interrupteur à penser.

Un candidat peut nommer l'offre à laquelle il répond. La plupart des CV arrivent d'eux-mêmes —
c'est pourquoi « candidature spontanée » reste le choix par défaut, et inventer une offre pour y
ranger ces gens-là gonflerait le seul chiffre sur lequel une offre se juge.

**Supprimer une offre ne supprime pas les candidatures.** Les gens qui ont répondu gardent leur
fiche et perdent seulement le lien : une entreprise qui fait le ménage du printemps dernier ne
doit pas perdre la trace de qui a postulé.

### Supprimer un locataire emportait tout sauf les candidats

Trouvé en nettoyant la base de test. La suppression d'un locataire balaie explicitement une
trentaine de tables, mais **pas** les candidats — rien dans le modèle ne les rattache au locataire.
Une entreprise supprimée à sa demande laissait donc derrière elle les noms, les téléphones et les
liens vers les CV des gens qui lui avaient écrit, invisibles pour tous les filtres mais bien
présents dans la base. Corrigé.

### Trois nouveaux onglets

**Soumissions** — les prix donnés aux clients avant les travaux. L'écran derrière reste à bâtir.
L'onglet existe parce que c'est là qu'on ira le chercher, et qu'une page vide honnête vaut mieux
qu'une soumission écrite comme une facture en brouillon : c'est le contournement qu'on ne peut
plus défaire une fois le mois fermé.

**Feuilles de temps et poinçons** — les heures de toute l'équipe, toutes les feuilles ensemble,
semaine par semaine, avec le total calculé par le serveur et non par le tableau (qui s'arrête à
200 lignes). C'est un onglet à part de « Mes feuilles de temps » parce que les deux répondent à
des gens différents : un employé saisit sa semaine, un contremaître lit celle de tout le monde.
En lecture seule : les heures se saisissent sur le projet où elles ont été travaillées, sinon une
semaine finit par être entrée deux fois. **Poinçons** reste à bâtir.

**Tâches et horaire** — l'horaire de toute l'équipe (le même écran que sur la fiche d'un employé,
sans filtre sur une personne) et toutes les tâches ouvertes, tous chantiers confondus, les
retards en premier. Les tâches sont en lecture seule ici aussi : une tâche se modifie sur son
projet, où son équipe et son échéance sont à l'écran.

### Crédits et remboursements

Deux nouveaux sous-onglets dans **Facturation**, encore vides. Ils sont dans le rail parce que le
rail est le plan : quelqu'un qui réconcilie un mois voit où ira une note de crédit au lieu
d'inventer une facture négative pour la loger. Un remboursement n'est pas un paiement négatif —
c'est son propre événement avec sa propre date, sinon les recettes d'une journée ne s'additionnent
plus.

### Le menu ne clignote plus

Au chargement d'une page, le menu de gauche affichait un instant **tous** les onglets de
l'application, puis retirait ceux qui ne sont pas au forfait. Il devinait pendant que la réponse
du serveur était en route.

Il attend maintenant. « Inconnu » et « vide » ne sont pas la même chose : le menu bâti d'office
ne sert que pour une entreprise dont le forfait ne définit aucun module, et ça, seule la réponse
peut l'établir. **Tableau de bord** s'affiche tout de suite — il n'est jamais un module et jamais
retiré, donc l'afficher tôt ne peut pas se révéler faux.

### Fournisseurs, commandes et réceptions

Un nouvel onglet avec trois sous-onglets. Le cycle est volontairement simple :

1. **Fournisseurs** — une cour, un grossiste. Un fournisseur avec des commandes ne se supprime
   pas ; on le rend inactif, parce que ses commandes doivent continuer de dire chez qui elles
   ont été passées.
2. **Commandes** — numérotées par entreprise. Elles naissent en brouillon, s'envoient, puis
   suivent ce que les livraisons disent.
3. **Réceptions** — notées depuis la commande, parce que c'est là qu'on sait ce qui reste à
   recevoir.

> **Le statut d'une commande n'est jamais tapé à la main** pour « reçue » ou « partiellement
> reçue » : il est lu à partir des livraisons. Un statut qu'on peut cocher est un statut qui dit
> qu'un camion est arrivé alors qu'il n'est pas arrivé. Retirer une réception fait reculer le
> statut tout seul.

Recevoir **plus** que ce qui a été commandé est permis : un fournisseur envoie une boîte pleine
plutôt que les onze morceaux demandés, et refuser de le noter mettrait l'entrepôt et l'écran en
désaccord dès la première livraison.

### Facturation et paiements

L'onglet **Factures** s'appelle maintenant **Facturation**, et il a un sous-onglet
**Paiements** : tout ce qui est rentré, toutes factures confondues.

L'écran est en **lecture seule**. Un paiement se prend sur la facture qu'il règle — c'est là
qu'on calcule ce qui reste dû et qu'on écrit au compte du client. Un formulaire ici ne serait
qu'une deuxième façon de faire la même chose, qui finirait par diverger de la première.

Le total « porté au compte » est tenu à part de l'encaissé : ce n'est pas de l'argent, c'est la
facture déplacée sur le compte du client. L'ajouter aux recettes du jour ferait paraître la
caisse plus pleine que la banque.

### Réponses aux formulaires

**Outils → Réponses** regroupe les formulaires remplis **par formulaire**, pas à plat. Une
réponse ne veut rien dire sans sa question : « Oui » n'est pas une information tant qu'on ne
sait pas qu'il répondait à « Le chantier était-il propre au départ ? ».

Les formulaires que personne n'a remplis sont montrés aussi, en bas, à zéro. Les cacher ferait
passer un formulaire publié et jamais utilisé pour un formulaire jamais publié.

### Fuseau horaire et langue

L'API décide de « aujourd'hui » dans le fuseau de l'entreprise (`America/Toronto`), jamais dans
celui du conteneur. Un conteneur tourne en UTC : sans cela, de 19 h à minuit **chaque soir**, une
tâche due aujourd'hui s'afficherait en retard et « cette semaine » voudrait dire la semaine
prochaine. Quelqu'un qui consulte ses heures un dimanche soir se verrait offrir une semaine vide.

La culture de l'application est fixée à `fr-CA` au démarrage. Un conteneur n'a pas de culture, et
sans cela l'application écrirait « 23 November 2026 » au milieu d'une phrase française — dans un
courriel d'invitation, dans la note qu'un formulaire laisse sur un client. Elle est fixée et non
négociée par requête : il y a une seule langue ici, et l'en-tête `Accept-Language` d'un navigateur
ne doit pas pouvoir changer ce qui est écrit en base.

Rien à configurer dans Dokploy pour l'un ni pour l'autre. Les images `dotnet/aspnet` embarquent
les données de fuseaux et ICU ; si elles manquaient, l'API retomberait sur UTC plutôt que de
planter.

### Rôles des employés

Chaque employé porte un rôle, choisi dans sa fiche avant même qu'un accès existe. Il est recopié
sur son adhésion au moment où l'accès est accordé, et c'est cette adhésion que le jeton signe.

| | Administrateur | Chargé de projet | Employé |
| --- | --- | --- | --- |
| Lire les clients, projets, factures, inventaire | oui | oui | oui |
| Créer et modifier clients, projets, produits | oui | oui | non |
| Factures | oui | oui | non |
| Matériaux, heures, dépenses, notes, tâches d'un chantier | oui | oui | oui |
| Rapports | selon le module | selon le module | selon le module |
| Employés et équipes | tout | lecture | non |
| Fiche entreprise, paramètres, politiques de prix, forfait | oui | non | non |

Un employé change l'**état** d'une tâche — y compris « Bloquée » — mais ne la crée pas, ne la
réassigne pas et ne la supprime pas.

Changer le rôle de quelqu'un prend effet **au prochain appel** : `/api/auth/me` compare le rôle
du jeton à celui de l'adhésion et réémet le jeton dès qu'ils diffèrent, sans attendre la
fenêtre de glissement de 30 jours. Inutile de demander à la personne de se reconnecter.

Le propriétaire de l'entreprise reste administrateur : le rétrograder laisserait une entreprise
dont le propriétaire ne peut plus atteindre ses propres paramètres, et personne pour l'y
remettre. Le champ est donc verrouillé sur sa fiche.

### Cloudflare R2

1. Créez un seau et un jeton d'API R2 (lecture + écriture).
2. Renseignez **Intégrations**, puis **Tester la connexion**.
3. Déclarez la politique CORS du seau — sans elle, les téléversements échouent côté navigateur :

```json
[
  {
    "AllowedOrigins": ["https://vexta.ca"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type", "Content-Encoding"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`Content-Encoding` est obligatoire dans `AllowedHeaders` : les fichiers compressibles sont
envoyés en gzip, et cet en-tête fait partie de la signature de l'URL de téléversement. S'il
manque, le navigateur reçoit un 403 au moment du transfert.

### Connexion Google / Microsoft

L'URI de redirection à enregistrer chez le fournisseur est celle du gestionnaire, pas celle de
notre contrôleur :

- Google : `https://api.vexta.ca/signin-google`
- Microsoft : `https://api.vexta.ca/signin-microsoft`

### Logo et icône

**Apparence**, dans la session super admin. Trois emplacements : logo clair, logo sombre, icône.
PNG, JPEG, WebP, SVG ou ICO, 2 Mo au maximum. « Rétablir » supprime le téléversement et redonne
la main à la variable d'environnement, puis à l'image livrée avec le front.

L'image apparaît partout dans la minute : la route la sert avec un `ETag` et un cache court, donc
une image inchangée ne coûte rien et une nouvelle s'impose tout de suite.

### Pays et provinces sur les adresses

Chaque champ d'adresse offre maintenant la liste des pays, et sous elle la liste des provinces ou
des états quand le pays en a une. Ailleurs, la ligne reste une boîte de texte : une liste à
laquelle manque la région de celui qui écrit refuse la seule réponse exacte, alors qu'une boîte
l'accepte.

La liste des 250 pays est **générée une fois et versionnée** (`web/src/lib/geo.ts`), pas lue dans
le navigateur à l'exécution. La réponse d'un navigateur dépend de sa version d'ICU — « États-Unis »
sur une machine, « États-Unis d'Amérique » sur une autre — et ces chaînes sont **enregistrées**,
pas seulement affichées : un libellé qui dérive, c'est deux orthographes du même pays en base, et
une adresse qui ne se reconnaît plus elle-même. C'est aussi pourquoi la valeur stockée reste le nom
français, qui est ce que la colonne contenait déjà : un code se serait mieux lu mais aurait demandé
de réécrire chaque adresse existante et chaque document qui en imprime une, pour ne rien gagner de
visible.

Changer le pays efface la province si le nouveau pays ne l'a pas : « Québec » sous la France
imprimerait une adresse qui se lit comme une erreur. Une valeur saisie avant l'existence de la
liste est réoffertes telle quelle plutôt que perdue — un sélecteur qui vide un champ rempli est
pire qu'une boîte de texte.

Le fournisseur avait une adresse sans pays ; la colonne est ajoutée et **nullable**, parce que les
fiches existantes n'en ont pas et qu'on ne va pas obliger le bureau à en remplir une avant de
pouvoir corriger un numéro de téléphone.

### Adresse et numéro d'entreprise à l'inscription

Une entreprise qui s'inscrit doit donner son adresse. Une entreprise facture, et une facture sans
l'adresse de son émetteur n'est pas un document utilisable — demandée à l'inscription plutôt que
laissée à un écran de réglages que personne n'ouvre avant que la première facture soit déjà partie
sans elle. Un espace personnel ne facture personne et ne se fait rien demander.

L'adresse devient le **premier emplacement** de l'entreprise, marqué principal, et non des colonnes
sur le locataire : le modèle a déjà un endroit pour « un lieu qu'occupe l'entreprise », et un
deuxième voudrait dire deux réponses à ce qui va en haut d'une facture.

Le **numéro d'entreprise** (le NEQ au Québec) est demandé mais jamais obligatoire : une entreprise
s'enregistre avant de le recevoir, et un travailleur autonome sous son propre nom n'en a jamais.
Il est modifiable ensuite dans la fiche de l'entreprise — sinon un numéro laissé vide à
l'inscription serait inaccessible à vie.

La validation est faite **avant** que le compte soit créé. Un locataire et un utilisateur créés
puis abandonnés faute d'adresse garderaient le courriel en otage, et la deuxième tentative se
ferait répondre que le compte existe déjà.

Les deux chemins d'inscription — le formulaire par courriel et celui qui termine une inscription
Google ou Microsoft — partagent les champs et la règle (`web/src/lib/company-signup.ts`). Écrites
deux fois, elles divergent, et ça se voit sous la forme d'une inscription refusée avec un message
mais aucun champ marqué : la pire erreur de formulaire possible, parce qu'il n'y a rien à corriger.

### Style visuel de la page publique

Quatre arrangements : **Classique**, **Chantier** (bandeau foncé, titres en majuscules),
**Épuré** (étroit, sans cadres) et **Vitrine** (produits en premier et plus grands). Ce n'est pas
un éditeur de thème : aucun des quatre ne choisit de couleur. Tous peignent avec la couleur de
l'entreprise et gardent les contrastes de l'application, donc **aucun choix fait ici ne peut
produire une page illisible** — et c'est le nom de l'entreprise qui est dessus.

Un seul tableau de classes (`web/src/lib/public-page-style.ts`) plutôt que quatre copies de la
page : les quatre looks diffèrent sur une huitaine de décisions, et quatre mises en page
complètes voudraient dire qu'une correction à la section des produits doit être faite quatre fois
— c'est comme ça que trois d'entre elles prennent du retard en silence.

Les pages existantes arrivent en Classique (`defaultValue: 0`), donc rien ne change d'apparence au
déploiement.

### Formulaire et documents sur une offre d'emploi

Une offre peut se faire **attribuer un formulaire** que l'entreprise a déjà construit, et la page
publique affiche alors un bouton **Postuler**. Une référence vers un formulaire existant plutôt que
des questions sur l'offre : une entreprise qui embauche deux charpentiers et un chauffeur pose les
mêmes questions chaque fois, et un formulaire par offre serait les mêmes questions retapées puis
corrigées dans un seul des trois endroits.

Seuls les formulaires **publiés** sont offerts, et une offre dont le formulaire est redevenu
brouillon n'affiche pas de bouton : elle redit où écrire, comme avant qu'un formulaire existe. La
fiche prévient quand c'est le cas.

Une candidature crée **la soumission et une fiche candidat**, reliée à l'offre — ce qui alimente le
compteur de candidatures déjà affiché sur la ligne. La fiche est bâtie à partir des réponses dont
la question est **pointée** vers un nom, un courriel ou un téléphone, exactement comme un
formulaire sait déjà créer un client. L'entreprise pose donc ses questions dans ses propres mots et
dit ce qu'est la réponse ; rien ici ne devine laquelle était le nom. Un formulaire qui ne demande
pas de nom se fait refuser avec une phrase qui le dit, parce qu'une fiche candidat sans nom est une
ligne sur laquelle personne ne peut agir.

Le chemin d'écriture anonyme est le seul endroit de Vexta où un inconnu écrit, et il est tenu par
quatre règles :

- La page doit être publiée, la section emplois affichée, l'offre publiée et son formulaire publié.
  Chaque échec répond **404**, identique : on ne peut pas distinguer une entreprise qui n'existe pas
  d'une page retirée ou d'un formulaire en brouillon. Une page mise hors ligne retire ses offres
  avec elle, donc un lien enregistré ne continue pas de déposer des candidatures.
- Les réponses sont validées par **les mêmes règles** que le bureau
  (`src/Vexta.Api/Features/Forms/FormAnswerRules.cs`, partagé). Deux copies voudraient dire un
  formulaire qui accepte de la rue ce qu'il refuse au bureau.
- On parcourt **les questions**, pas ce qui arrive : une réponse envoyée pour un champ absent du
  formulaire est ignorée, pas stockée, et un champ obligatoire omis du corps reste un champ vide.
- Le journal des actions n'est **pas** renvoyé. Qu'un courriel soit parti ou non est l'affaire de
  l'entreprise, et un inconnu à qui on dit « courriel non envoyé » apprend une mauvaise
  configuration sur laquelle il ne peut rien.

Une offre peut aussi porter **jusqu'à douze documents ou images** — la description de poste en PDF,
une photo du chantier. Le téléversement passe par les routes média comme tout autre fichier, donc
les limites de taille, le quota et la compression se décident à un seul endroit. Les liens publics
sont signés à chaque chargement de page : le seau n'est jamais public. Retirer un document le
décroche de l'offre sans supprimer le fichier de la bibliothèque — il peut être sur une autre
offre, et supprimer des octets est une décision de la bibliothèque.

**Ce qui n'est pas fait :** un candidat ne peut pas **téléverser** de fichier (un CV) depuis la page
publique. Le constructeur de formulaires n'a pas de type « fichier », et en ajouter un ouvrirait
le téléversement anonyme vers le seau partagé — une décision de sécurité à prendre exprès, pas en
passant. Le champ « Pour postuler » continue de dire où envoyer un CV.

---

### Fournisseurs : chercher, rapprocher, inviter

**Ajouter un fournisseur commence par une recherche.** Le champ « Déjà sur Vexta ? » cherche parmi
les entreprises de la plateforme et remplit la fiche. Deux limites volontaires :

- Seules les entreprises **qui ont publié leur page publique** apparaissent. Leur nom et leur
  adresse sont déjà lisibles par n'importe qui à `/e/{slug}` : les offrir ici ne divulgue rien de
  neuf, alors que lister toutes les entreprises de Vexta donnerait à chacune l'annuaire des
  autres.
- C'est une **recherche, jamais un parcours** : deux caractères minimum, dix résultats, rien pour
  une requête vide. On peut confirmer une entreprise qu'on a déjà en tête ; on ne peut pas
  dérouler la liste.

La recherche ignore les accents : « beton » trouve « Béton ». Elle filtre en mémoire sur
l'ensemble borné des entreprises à page publiée, parce qu'aucune extension Postgres ne peut être
supposée présente pour le faire en SQL ; le commentaire dans le code dit quoi faire si cet
ensemble cesse d'être petit (un nom normalisé stocké, avec un index).

**L'adresse du fournisseur est obligatoire**, parce que c'est elle qui le reconnaîtra le jour où
il s'inscrira. Un fournisseur sans adresse ne pourra jamais être rapproché. Une fiche qui n'en
avait pas déjà reste modifiable sans en ajouter une — on ne va pas arrêter quelqu'un qui corrige
un numéro de téléphone pour lui faire chercher un code postal.

**Le rapprochement à l'inscription.** Quand une entreprise s'inscrit, on cherche dans les listes
de fournisseurs de tous les autres locataires celles qui lui correspondent. La règle tient en deux
tests, et les deux doivent passer :

1. **L'adresse** : code postal + numéro et nom de rue, normalisés (minuscules, accents retirés,
   ponctuation retirée). La ville et la province sont volontairement exclues de la clé — ce sont
   les parties que les gens écrivent de travers, alors qu'un code postal et un numéro civique sont
   déjà précis à un côté de rue près. Une adresse incomplète ne donne pas de clé et ne correspond
   donc jamais : la moitié d'une adresse ne suffit pas à affirmer que deux entreprises sont la
   même.
2. **Le nom**, comparé **mot par mot**. Chaque mot du nom le plus court doit se retrouver dans
   l'autre, un mot de quatre lettres ou plus correspondant aussi à un mot plus long qui commence
   pareil — c'est ce qui fait que « beton » retrouve « betons ». Et au moins un des mots qui
   correspondent doit réellement identifier l'entreprise : deux Construction quelque chose à la
   même adresse ne sont pas la même entreprise.

Une paire qui partage l'adresse mais échoue sur le nom est **laissée tranquille**. Deux entreprises
à une même adresse, c'est ordinaire — un centre commercial, un parc industriel, un propriétaire et
son locataire — et une adresse n'est pas une identité. Rien n'est perdu à refuser : l'entreprise
reste trouvable par son nom dans l'annuaire.

La comparaison était d'abord écrite sur les chaînes entières. Le pluriel de « Les **Bétons** Lévis
inc. » contre « Beton Levis » suffisait à la casser, et c'est le test de bout en bout qui l'a
montré — pas la relecture.

**Ce qui traverse, et ce qui ne traverse pas.** L'entreprise qui arrive reçoit **ses clients** :
une fiche client par entreprise qui l'avait inscrite comme fournisseur, avec le nom, l'adresse et
les coordonnées que cette entreprise publie, et une note sur la fiche qui explique d'où elle
vient. Rien d'autre. Pas le numéro de compte, pas les notes de son client sur elle, pas une
commande, pas une réception. Une entreprise qui note un fournisseur a divulgué qui elle est pour
être livrée et facturée ; elle n'a pas accepté de montrer ses dossiers.

Dans l'autre sens, sur la fiche du fournisseur chez son client, seuls le lien et les champs
**vides** sont remplis (courriel, téléphone, ville). Le **nom est laissé tel que son client l'a
tapé** : « la cour à bois » est son étiquette à lui, et la réécrire ressemblerait à l'application
qui change ses données dans son dos. Le numéro de compte et les notes sont la relation, pas
l'entreprise, et ne sont jamais touchés.

Le rapprochement tourne **après** que le compte est créé et enregistré, et avale ses propres
erreurs. Personne ne doit se faire refuser un compte parce que la plateforme n'a pas réussi à
deviner qui sont ses clients.

**Inviter un fournisseur.** Un courriel qui dit que Vexta existe, envoyé **au nom de l'entreprise**
qui le demande — le fournisseur connaît son client et n'a jamais entendu parler de nous. Ce n'est
pas un accès : il n'y a rien à quoi se connecter dans l'espace de son client, et un message
construit comme une invitation à un compte promettrait un accès qui n'existe pas. Une par jour au
maximum, rien pour un fournisseur déjà sur Vexta, rien sans courriel sur la fiche. Si Mailgun n'est
pas configuré, l'écran le dit et **aucune date n'est inscrite** : une date écrite laisserait
quelqu'un attendre un courriel qui n'allait jamais partir.

### Le slug avalait les lettres accentuées

Corrigé en passant, parce que le test l'a mis sous le nez : « Les Bétons Lévis inc. » donnait
`les-b-tons-l-vis-inc`. La génération mettait le nom en minuscules puis supprimait tout ce qui
n'était pas `[a-z0-9]` — ce qui efface chaque lettre accentuée au lieu de la translittérer. C'est
l'adresse web publique de l'entreprise, avec des trous dedans. Elle donne maintenant
`les-betons-levis-inc`.

**Les slugs existants ne sont pas recalculés** : ils sont dans des liens que des gens ont déjà
enregistrés, et ça vaut plus que leur orthographe.

---

### Le menu ne défile plus avec la page

La coque fait maintenant exactement la hauteur de la fenêtre et ne défile pas ; seule la zone de
contenu défile. Le rail de gauche, la barre du haut et la bannière d'essai restent donc à l'écran.
Le rail est le seul contrôle qui répond à « où suis-je », et défiler un long tableau le faisait
disparaître précisément au moment où quelqu'un voulait en sortir.

`h-dvh` et non `h-screen` : avec `vh`, la coque est haute comme la fenêtre **sans** les barres du
navigateur mobile, et la dernière ligne de chaque page se retrouvait dessous.

Le rail des sous-onglets est `sticky` lui aussi, et `self-start` pour ne pas s'étirer à la hauteur
d'un tableau de deux cents lignes. Les sous-onglets sont de la navigation eux aussi : un rail qui
part avec le contenu oblige à remonter pour changer de section.

### Le toggle de la page publique en mode sombre

Il était invisible. La piste éteinte était une surface translucide — une forme sombre sur une
carte sombre, avec un bouton sombre dessus — et, pire, `dark:bg-input` était écrit **après**
`data-checked:bg-primary`, donc en thème sombre le toggle allumé n'était pas allumé non plus. Sur
le seul réglage qui décide si la page de l'entreprise est sur Internet.

Maintenant : piste pleine avec sa propre bordure dans les deux thèmes, variante sombre répétée
après l'état coché pour qu'elle ne gagne pas, bouton blanc dans les deux thèmes (contre une piste
sombre, c'est le bouton qui doit être la chose claire). Et **l'état est écrit en mots** à côté —
« En ligne » / « Hors ligne » : un interrupteur ne se lit que par celui qui sait déjà de quel côté
est allumé.

### Type de réponse « fichier / image » dans les formulaires

Une question peut maintenant demander un fichier. Le téléversement passe par les routes média
comme tout autre fichier, donc la limite de taille, le quota et la compression restent décidés à
un seul endroit. Le fichier part **au moment où il est choisi**, pas à l'envoi : téléverser à
l'envoi voudrait dire un formulaire qui échoue tard, quand la personne a déjà tourné la page.

La réponse garde **le nom du fichier comme texte** et pointe vers l'asset. Deux conséquences
voulues : supprimer le fichier de la bibliothèque ne supprime pas la réponse (elle dit encore ce
qui a été envoyé), et le nom est lu depuis l'asset vérifié, jamais depuis ce que l'appelant a
tapé — sinon une soumission pourrait prétendre qu'un fichier s'appelle n'importe quoi. Les assets
sont vérifiés contre la bibliothèque **du locataire** avant toute écriture : les identifiants
viennent du navigateur, et une réponse pointant vers le fichier d'une autre entreprise mettrait
son nom et un lien vers lui sur la soumission de celle-ci.

**La page publique anonyme refuse** un formulaire qui contient une question fichier, avec une
phrase qui le dit. Téléverser demande un compte, et ouvrir les routes média à quiconque atteint
une page publique est une décision à prendre exprès, pas un effet de bord de l'ajout d'un type de
champ. Une candidature déposée sans le CV qu'on lui demandait serait pire qu'une candidature
refusée, parce que personne ne s'en apercevrait.

### Trois styles de page publique de plus, et le pied retiré

**Journal** (mesure large, texte aéré, titres réduits à des étiquettes), **Panneau** (tout en
panneaux encadrés, se lit comme une fiche produit) et **Affiche** (une colonne, le nom très grand
et centré). Sept en tout, et aucun ne choisit de couleur.

Le bloc du bas qui répétait le nom de l'entreprise est retiré : il est déjà en haut de la page.

---

### Comptes personnels : le CV appartient à la personne

Un compte personnel a maintenant un **CV**, et c'est la décision structurante de tout ce qui
suit. La table est clé par `UserId`, sans `TenantId` et **sans filtre de locataire** — c'est le
seul enregistrement de l'application qui appartient à une personne plutôt qu'à une entreprise.
Un homme de métier répond à trois entreprises par saison ; un CV rangé dans l'espace d'une
entreprise devrait être retapé pour chacune et disparaîtrait avec n'importe laquelle. Toutes les
requêtes nomment donc l'utilisateur explicitement : il n'y a aucun filtre derrière elles.

Postuler ne donne **jamais** cette ligne à l'entreprise. Ça fabrique un `Candidate` dans
l'espace de l'entreprise, copié depuis le CV, exactement comme une candidature arrivée par
courriel. L'entreprise possède ensuite ce qu'elle a reçu, et la personne peut modifier ou
supprimer son CV ensuite sans réécrire l'histoire à l'intérieur du commerce de quelqu'un
d'autre. Vérifié en base : `PersonalProfiles` n'a **pas de colonne TenantId**, et une entreprise
ne voit zéro ligne d'expérience d'un postulant.

**Ce qui compte comme « CV rempli »** : un numéro de téléphone, et un récit de ce qu'on a fait —
soit un emploi inscrit, soit un document téléversé. Deux choses, pas plus. En demander davantage
transformerait une candidature en exercice de paperasse et coûterait à l'entreprise les
candidats qu'elle veut le plus ; en demander moins lui enverrait un nom sans rien pour agir. La
règle est calculée, jamais stockée, et lue aussi bien par l'écran qui réclame que par l'endpoint
qui refuse — avec, dans les deux cas, **la liste de ce qui manque**, parce qu'« incomplet » sans
dire quoi est le seul message sur lequel personne ne peut agir.

**Ce que l'entreprise reçoit** : le CV écrit en texte, figé au moment de la candidature, dans sa
propre colonne (`ApplicationSummary`) et non dans `Notes` — une candidature et l'opinion qu'on
s'en fait sont deux choses, et écrire la première dans la seconde écraserait ce que le bureau
avait déjà tapé. Si la personne avait téléversé un document, il est **copié** sous le préfixe de
l'entreprise (copie serveur à serveur dans R2, rien n'est téléchargé). Aucune ligne de l'espace
de l'entreprise ne pointe vers celui du postulant, et ses routes média restent strictement
locataires.

**Une candidature par compte et par offre**, tenue par un index unique partiel en base et pas
seulement par l'endpoint : un bouton pressé deux fois est la façon ordinaire dont ça arrive, et
la deuxième ligne se lirait comme une deuxième personne.

Sur la page publique : la barre de compte en haut (se connecter / s'inscrire, ou qui vous êtes),
et **chaque** offre publiée peut être postulée — avec ou sans formulaire attaché, puisque le CV
*est* la candidature et que le formulaire n'est que les questions supplémentaires de
l'entreprise. La ligne « écrivez à » reste à côté, parce que certains préféreront téléphoner,
mais ce n'est plus la seule porte. La connexion et l'inscription portent un chemin de retour
validé (relatif, jamais `//`), pour ramener la personne à l'offre qu'elle lisait.

### Deux défauts trouvés par le test, pas par la relecture

**Un espace personnel en double.** `WorkspaceService.EnsureAsync` lit les adhésions une fois,
ajoute celle de l'espace d'accueil **au contexte** et non à la liste, puis demande à la liste
périmée si la personne a déjà un espace personnel. Elle répondait non pour quelqu'un qui venait
d'en ouvrir un : chaque inscription personnelle recevait donc un **deuxième** espace vide à sa
première connexion, et le sélecteur d'espaces affichait deux fois le même nom.

**Un espace sans nom.** Le formulaire web calcule le nom d'un espace personnel à partir du nom
de la personne, mais l'endpoint est joignable sans lui : un nom vide créait un locataire **sans
nom**, avec un slug aléatoire — un enregistrement que personne ne reconnaît, à une adresse
publique que personne ne peut lire. L'API retombe maintenant sur le nom de la personne, et
refuse si même ça est vide.

**Et un index que le générateur voulait supprimer.** En ajoutant l'index unique partiel sur
`(JobPostingId, ApplicantUserId)`, EF a retiré `IX_Candidates_JobPostingId` en le croyant
redondant. Il ne l'est pas : le nouveau est **partiel** et ne couvre rien pour un candidat sans
compte — c'est-à-dire chaque CV arrivé par courriel et chaque personne saisie à la main. La
requête « combien de gens ont répondu à cette offre » tourne à chaque chargement de l'écran
d'embauche et serait tombée en balayage de table. L'index est déclaré explicitement pour que le
générateur ne puisse plus le retirer.

---

### Paiements en ligne : l'entreprise encaisse ses propres clients

C'est l'inverse de tout ce qui précède sur Stripe. Les sections plus haut parlent de Vexta qui
facture les entreprises ; celle-ci parle de l'entreprise qui se fait payer par **ses** clients,
avec de l'argent qui ne touche jamais le compte de Vexta.

**Comment c'est branché.** Chaque entreprise ouvre son propre compte Stripe, depuis
**Paramètres → Paiements**. Stripe lui demande son numéro d'entreprise, une pièce d'identité et
le compte bancaire où déposer l'argent — Vexta ne voit rien de tout cela et ne le stocke nulle
part. Ce sont des *charges directes* : l'entreprise est le commerçant, le paiement apparaît sur
le relevé du client sous le nom de l'entreprise, l'entreprise paie les frais de Stripe, et Vexta
ne prend aucune commission.

**Il faut cocher la fonctionnalité.** « Paiements en ligne » est une fonctionnalité de forfait,
comme l'OCR et l'assistant : **Fonctionnalités** la liste, et c'est en la cochant sur un forfait
dans **Forfaits** qu'une entreprise y a droit. Sans la coche, la carte Paiements s'affiche mais
tout y est refusé.

**Le pays ne se change pas.** Stripe fixe le pays d'un compte à sa création et ne le change
jamais. Vexta le prend donc sur l'adresse de l'entreprise, et refuse de commencer tant qu'il n'y
en a pas — avec un message qui le dit. Une entreprise sans adresse doit d'abord la remplir dans
**Entreprise**.

**Sur les factures.** Dès que Stripe autorise l'entreprise à encaisser, un bouton
**Payer en ligne** s'ajoute au bas des courriels de facture. Il est *ajouté* au message, pas
offert comme champ de gabarit : une entreprise qui a écrit son propre texte n'a rien à modifier,
et personne ne peut se retrouver avec deux boutons. Le lien mène à `/facture/<jeton>`, une page
Vexta sans connexion : le client qui a reçu la facture ne doit pas avoir à s'ouvrir un compte
pour la régler.

Le jeton est 32 octets aléatoires et **ne périme pas** — une facture payée trois mois plus tard
est toujours la même facture. Il est créé une fois et le même lien part dans tous les rappels.
Une entreprise peut aussi le récupérer seule : `GET /api/invoices/{id}/lien-paiement`.

**Ce que la page publique dit.** Le nom de l'entreprise, sa couleur, le numéro de la facture,
les deux dates, le total, ce qui a déjà été payé et ce qui reste. Rien d'autre : ni les lignes,
ni le projet, ni les autres factures du client.

**Quand le paiement arrive**, il est inscrit comme un paiement par carte, sans nom d'employé
dessus — personne chez l'entreprise ne l'a saisi — et la facture passe à *Payée* par la même
règle que les paiements au comptoir. Deux chemins l'enregistrent, la page de retour et le
webhook, et ils se courent après volontairement : l'identifiant du paiement Stripe fait que le
second reconnaît la ligne du premier au lieu d'en ajouter une deuxième.

**Sans le webhook Connect**, tout fonctionne quand même : la page où le client atterrit inscrit
le paiement. Ce qui manque, c'est l'avertissement automatique quand Stripe autorise une
entreprise du jour au lendemain — la carte Paiements a un bouton **Actualiser** pour ça, et le
dit.

### Formulaires : un type, un actif de client, et la page publique

Trois choses d'un coup, parce qu'elles se tiennent.

**Un formulaire a maintenant un type** — *Formulaire*, *Actif d'un client*, *Nouveau client*,
*Demande de soumission*. Ce n'est pas un interrupteur : les quatre acceptent les mêmes questions
et déclenchent les mêmes actions. C'est ce que le formulaire *est*, et ça sert à deux choses —
retrouver le bon parmi quinze, et savoir quelle action proposer. Vexta n'a pas encore d'entité
Soumission ; une demande de soumission arrive donc dans Réponses et le bureau la chiffre à la
main, ce qui est exactement ce qu'il fait aujourd'hui avec le courriel qu'il reçoit, moins la
retranscription. Le type est là pour que ce travail soit déjà étiqueté le jour où les soumissions
existeront.

**Une nouvelle action : « Créer un actif de client ».** Un formulaire peut maintenant ficher la
voiture déposée ce matin ou l'immeuble qu'on demande d'inspecter. Les questions pointent vers les
champs de l'actif — libellé, marque, modèle, année, numéro de série, plaque, usage, notes — comme
elles pointaient déjà vers ceux du client.

Il faut un client pour y accrocher l'actif, et il est trouvé de trois façons, dans cet ordre : le
client que l'action « Créer un client » vient de créer dans la même soumission ; celui dont le
courriel revient dans les réponses ; celui qui a rempli le formulaire depuis son compte. Aucun des
trois et **rien n'est créé**, dit en toutes lettres dans le journal de la réponse — un actif qui
n'appartient à personne est une ligne que personne ne retrouvera. Jamais de rapprochement par nom :
deux Jean Tremblay sont deux personnes.

Le type d'actif (*Véhicule*, *Immeuble*, *Machinerie*) et l'unité d'usage (*km*, *heures*) se
choisissent **sur l'action**, une fois pour toutes. Une fiche véhicule crée un véhicule chaque
fois, et le demander à chaque personne qui répond est une occasion de plus de se tromper.

**Un formulaire peut aller sur la page publique.** Deux cases, parce que ce sont deux décisions :
*Publié* l'offre à vos employés, *Sur ma page publique* l'offre aux visiteurs. La seconde seule ne
fait rien — il faut aussi que le formulaire soit publié et que la page affiche les formulaires —
ce qui veut dire que remettre un formulaire en brouillon le retire du site dans le même geste.

Un visiteur n'a pas besoin de compte. C'est volontaire, contrairement aux candidatures : un CV
s'écrit une fois et s'envoie dix fois, ce qui vaut un compte ; une demande de soumission ne vaut
rien si la personne doit d'abord s'inscrire — elle appellera un concurrent.

Ce que ça coûte, c'est un inconnu qui écrit dans l'espace d'une entreprise, et c'est encadré :

- **Un formulaire qui demande un fichier ne peut pas aller sur la page.** Un visiteur sans compte
  n'a nulle part où téléverser. Refusé là où on le coche, et refusé aussi si on ajoute une question
  « fichier » à un formulaire déjà sur la page — plutôt que de l'en retirer en silence.
- **Un plafond par adresse** : cinq envois par heure et par formulaire. Assez pour quelqu'un qui
  s'est trompé de numéro de téléphone deux fois.
- **Un plafond par entreprise** : soixante par jour, tous formulaires confondus. C'est le filet
  contre un envoi distribué, où les adresses sont toutes différentes mais la journée de
  l'entreprise se termine quand même.
- Les compteurs sont **en mémoire**. Redémarrez l'API et ils repartent à zéro, et une deuxième
  instance compte séparément. C'est assumé : ce que ça achète, c'est un plafond sans nouvelle
  infrastructure, et les chiffres sont choisis pour que la fuite compte moins que le plancher.

Chaque réponse venue de la page porte la mention **Page publique** dans Réponses. Le bureau ne lit
pas de la même façon une feuille remplie par un employé et une demande venue d'un inconnu, et
« Rempli par Jean Dubé » ne veut pas dire la même chose dans les deux cas.

**Au passage, un défaut corrigé.** Le moteur d'actions filtrait sur l'entreprise de la session. Il
tourne aussi là où il n'y en a pas — une candidature arrive du compte personnel de quelqu'un, un
formulaire public de personne du tout — et dans ces deux cas il ne trouvait aucune action et le
formulaire ne faisait rien, sans le dire. **Si vous aviez attaché un courriel ou une création de
client à un formulaire de candidature, il ne partait pas.** Il part maintenant : l'entreprise est
lue sur la soumission elle-même, qui est l'autorité qui compte.

### Panier et commandes en ligne

Un visiteur peut maintenant commander les produits d'une page publique, et retrouver ses
commandes dans **Mes commandes**.

**Deux interrupteurs, pas un.** « Afficher mes produits » dit ce que vous vendez ; « Accepter les
commandes en ligne » dit que vous le livrez. Ce sont deux promesses, et une entreprise qui n'a
pas décidé qu'elle tient du stock, répond au téléphone et livre ne devrait pas faire la seconde
par accident. Les deux se cochent dans **Entreprise → Page publique**.

**Commander demande un compte**, contrairement aux formulaires publics. Pas une barrière pour
le plaisir : une commande est un engagement des deux côtés — vous la préparez, le client vient
la chercher et la paie — et chacun a besoin de savoir à qui il a affaire. C'est aussi la seule
façon que « Mes commandes » existe : quelqu'un qui achète chez quatre fournisseurs retrouve ses
quatre commandes au même endroit au lieu de fouiller ses courriels.

**Le panier vit dans le navigateur du visiteur**, un par entreprise. Rien n'est envoyé tant que
la commande n'est pas passée — un panier, c'est quelqu'un qui réfléchit, et une entreprise n'a
pas besoin de le regarder réfléchir. Un panier par entreprise parce que deux entrepreneurs
livrent séparément, facturent séparément et sont deux conversations.

**Les prix ne viennent jamais du navigateur.** Le panier envoie des identifiants de produits et
des quantités ; ce que ça coûte est lu dans votre catalogue par l'API. Un appelant qui pourrait
nommer un prix nommerait le sien. Un produit sans prix affiché — « prix sur demande » — n'a pas
de bouton et est refusé sur une commande : le client accepterait un chiffre que personne n'a
nommé.

**Ce que la commande garde** est une photo du moment : la description, l'unité, le prix unitaire
et vos deux taux de taxes tels qu'ils étaient. Le catalogue bouge, et ce qui a été convenu ne
doit pas bouger avec lui. C'est la seule chose qui diffère d'une facture — une facture est
réimprimable par l'entreprise, une commande est un chiffre qu'un client a vu et accepté.

**Le dossier client s'ouvre tout seul** à la première commande d'un compte que vous ne
connaissez pas encore, avec le compte rattaché. Une commande qui n'appartient à personne ne peut
pas devenir une facture, ce qui est toute la raison d'en avoir une. Une deuxième commande du même
compte retombe sur le même dossier plutôt que d'en ouvrir un second. Un client bloqué est refusé,
et on lui dit pourquoi.

**Rien ne sort du stock.** Une commande est une demande, pas une vente : le stock bouge quand
vous préparez. Laisser un inconnu décrémenter une tablette serait une façon de la vider sans rien
acheter.

**Côté entreprise**, un nouvel onglet : **Commandes en ligne**. « En ligne » fait un vrai travail
dans ce titre — le menu a déjà *Fournisseurs & Commandes*, qui est vous qui achetez ; celles-ci
vont dans l'autre sens. Cinq états — Reçue, En préparation, Prête, Livrée, Annulée — et le client
lit exactement le même mot dans son espace, ce qui est toute la raison de les tenir à jour.

**Facturer une commande** crée une facture **en brouillon** avec les mêmes lignes, au même prix,
dans le même ordre, et la note du client reportée dessus. Un brouillon toujours : c'est vous qui
décidez quoi facturer — une livraison, un rabais, une correction — et une facture qui partait au
moment où on presse un bouton serait un document que personne n'a relu. Une fois par commande, et
une commande facturée ne peut plus être annulée sans annuler la facture d'abord.

**Les lignes d'une commande ne se modifient jamais.** Une commande est ce que le client a
demandé ; une entreprise qui pourrait la réécrire changerait ce que quelqu'un a accepté après
coup. Ce que vous facturez va sur la facture, qui est à vous.

Rien n'est payé en ligne à cette étape. Les paiements par carte restent sur les factures — voir
*Paiements en ligne* plus haut — et les deux fonctionnent ensemble : la commande devient une
facture, la facture porte un lien de paiement.

---

## 7. Compression des fichiers R2

Les fichiers sont compressés en gzip **dans le navigateur**, avant d'être envoyés — le fichier ne
passe jamais par l'API en route vers R2, donc c'est le seul endroit de la chaîne qui détient les
octets. La compression ne coûte ni processeur ni bande passante côté serveur.

Rien ne les décompresse ensuite. L'encodage est enregistré sur l'objet R2 lui-même, qui renvoie
`Content-Encoding: gzip`, et le navigateur le décompresse comme n'importe quelle réponse web.
gzip est sans perte : le fichier restitué est identique au fichier envoyé, octet pour octet.

Deux garde-fous évitent de compresser pour rien :

- les formats déjà compressés sont ignorés (JPEG, PNG, WebP, MP4, ZIP, et tous les formats
  Office modernes, qui sont des archives ZIP) ;
- un fichier qui ne gagne pas au moins 5 % est stocké tel quel.

**Ce que cela donne en pratique.** gzip travaille sur la redondance. Mesuré dans le navigateur
sur des fichiers réels :

| Fichier | Avant | Après | Gain |
| ------- | ----- | ----- | ---- |
| Export JSON, 2000 lignes de facturation | 176 Ko | 11 Ko | **94 %** |
| Page HTML | 22 Ko | 5,5 Ko | **75 %** |
| `vexta-icon.png` | 279 Ko | 279 Ko | 0 % — ignoré |
| Octets aléatoires | 256 Ko | 256,1 Ko | le fichier **grossit** — conservé tel quel |

Les deux dernières lignes sont la raison d'être des garde-fous. Une photo JPEG ou PNG ne gagne
rien : elle est déjà compressée, et le code ne tente même pas. Si l'essentiel de votre stockage
est fait de photos, le gain réel sera donc proche de zéro — il faudrait alors les réencoder en
WebP, ce qui réduit beaucoup plus mais **modifie l'image**. C'est une décision à prendre, pas un
réglage à activer, et ce n'est pas ce qui est en place aujourd'hui.

La bibliothèque affiche la taille réellement stockée — celle que Cloudflare facture — et, quand
le fichier est compressé, le pourcentage économisé.

---

## 8. Mises à jour

```
git checkout qa && git merge main && git push     # déploie en QA
git checkout prod && git merge qa && git push     # puis en production
```

### Déploiement automatique à chaque push

À configurer **une seule fois pour tout le compte**, pas par projet.

1. Dokploy → **Settings → Git → GitHub → Create GitHub App.** Donnez-lui un nom unique.
2. Cliquez **Install**, puis choisissez **All repositories**. C'est ce choix qui fait qu'un
   dépôt créé plus tard n'aura rien à reconfigurer — en sélectionnant des dépôts précis, il
   faudra revenir autoriser chaque nouveau.
3. **Install & Authorize.**

Dans chaque application, passez ensuite le **Provider** de « Git URL » à **GitHub**, puis
choisissez le dépôt et la branche. Avec cette méthode le déploiement automatique est actif par
défaut : Dokploy pose et entretient le webhook lui-même, il n'y a rien à ajouter côté GitHub.

La branche de l'application doit correspondre à celle que vous poussez, sinon Dokploy répond
« Branch Not Match » et ne déploie pas. L'application QA suit `qa`, la production suit `prod`.

> Une fois ceci en place, **`git push origin main:prod` déploie la production immédiatement**,
> sans confirmation. C'est le but, mais cela change ce qu'un push engage.

L'ancienne méthode — un webhook collé à la main depuis **Deployments → Webhook URL** — reste
valable, mais elle se refait pour chaque dépôt.

### Migrations

Un déploiement qui ajoute une migration l'applique au démarrage. Un déploiement qui en retire une
ne la défait pas : prévoyez une migration inverse.

---

## 9. Dépannage

| Symptôme | Cause la plus probable |
| -------- | ---------------------- |
| `404 page not found` sur **toutes** les pages | C'est la réponse de Traefik quand aucun routeur ne correspond à l'hôte : le domaine n'est pas déclaré dans l'onglet Domains, ou il pointe sur un service arrêté. |
| 404 Traefik sur une page seulement | DNS pas encore propagé, ou `WEB_DOMAIN` contient `https://`. |
| « Non sécurisé » dans le navigateur | Voir ci-dessous. |
| Il faut se reconnecter à chaque rafraîchissement | Le site est servi en HTTP. Le cookie de session porte l'attribut `Secure`, qu'un navigateur refuse d'enregistrer sur une origine non chiffrée — la connexion réussit, mais rien n'est conservé. Réglez le HTTPS et le problème disparaît. |
| Certificat absent | Attendez 30 s après le premier déploiement ; vérifiez que le `A` pointe bien sur le serveur. |
| `app` ne démarre pas | `api` n'est pas en bonne santé. Regardez ses journaux : presque toujours la chaîne de connexion. |
| Intégrations vidées après un déploiement | Le volume `api-keys` a été perdu. Restaurez-le, ou ressaisissez les clés. |
| Connexion Google en échec | L'URI de redirection n'est pas `https://api.vexta.ca/signin-google`. |
| Téléversement R2 en échec (403) | Politique CORS du seau : il faut `PUT` et les en-têtes `Content-Type` **et** `Content-Encoding`. |
| Un forfait publié n'apparaît pas | Le cache du site public tient 5 minutes au maximum, et chaque modification le purge. Au-delà, vérifiez que le forfait est publié et possède un prix Stripe. |

### « Votre connexion n'est pas privée » / « Non sécurisé »

Deux causes distinctes, à démêler avant de corriger quoi que ce soit.

**1. Vous êtes arrivé en HTTP.** Taper `qa.vexta.ca` dans la barre d'adresse envoie le navigateur
sur `http://`, et le navigateur affiche « Non sécurisé » pour toute page HTTP — même une erreur
404. Vérifiez que **HTTPS est activé** sur le domaine, dans l'onglet Domains : c'est ce réglage
qui ajoute la redirection.

**2. Le certificat n'a pas été émis.** Testez directement en HTTPS :

```bash
curl -sS -o /dev/null -w "%{http_code}
" https://qa.vexta.ca
curl -vI https://qa.vexta.ca 2>&1 | grep -E "subject:|issuer:"
```

- `issuer: ... Let's Encrypt` → le certificat est bon.
- `issuer: ... TRAEFIK DEFAULT CERT` → Let's Encrypt a refusé. Regardez les journaux du
  conteneur Traefik de Dokploy. Les causes habituelles : l'enregistrement `A` ne pointait pas
  encore sur le serveur au moment de la demande, ou le port 80 n'est pas joignable depuis
  l'extérieur — Let's Encrypt en a besoin pour valider le domaine, même si le site final ne sert
  qu'en HTTPS.

Après correction du DNS, redéployez pour que Traefik retente la demande.
