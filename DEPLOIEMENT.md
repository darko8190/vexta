# Déploiement de Vexta sur Dokploy

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
4. Créez vos forfaits dans **Forfaits**. Vexta crée le prix dans Stripe à l'enregistrement ; un
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

Les cinq modules standards (Clients, Projets, Factures, Ressources humaines, Entreprise) sont
créés par la migration avec leurs liens, mais **rattachés à aucun forfait** : rien de ce que vous
voyez aujourd'hui ne change tant que vous ne les cochez pas dans un forfait. Si vous aviez déjà
des modules marketing portant les mêmes titres, ils sont conservés tels quels — vous verrez donc
deux lignes « Clients », celle sans écran et celle avec.

#### Les écrans qui existent et que vous pouvez rattacher à un module

Les nouveaux écrans n'ont **pas** de module créé pour eux : un forfait dont le menu vient des
modules ne les verra pas tant que vous n'en aurez pas ajouté un dans **Admin → Modules**. Voici
les liens à y mettre.

| Lien | Titre suggéré | Remarque |
| ---- | ------------- | -------- |
| `/tableau-de-bord` | — | Toujours là, jamais un module. |
| `/clients` | Clients | |
| `/projets` | Projets | |
| `/factures` | Factures | |
| `/achats` | Achats | Parent. Mène à Dépenses tant que c'est son seul enfant. |
| `/achats/depenses` | Dépenses | Sous-onglet d'Achats. |
| `/inventaire` | Inventaire | |
| `/mes-feuilles-de-temps` | Mes feuilles de temps | Les heures de la personne connectée. |
| `/mes-assignations` | Mes assignations | Ses tâches. |
| `/outils` | Outils & Formation | Les formulaires sont là. |
| `/rapports` | Rapports | |
| `/ressources-humaines` | Ressources humaines | Cochez **réservé au propriétaire**. |
| `/entreprise` | Entreprise | Cochez **réservé au propriétaire**. |

Les deux « Mes… » ne se réservent à personne : ce sont les seuls écrans qui parlent de la
personne plutôt que de l'entreprise, et un administrateur saisit ses heures comme les autres.

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

**Achats** est un onglet de menu avec pour l'instant un seul sous-onglet : **Dépenses**. Il
existe pour que les bons de commande et les fournisseurs aient un endroit où aller plus tard,
plutôt que d'avoir à déplacer Dépenses du premier niveau le jour où ils arrivent. Cliquer
« Achats » mène directement à Dépenses tant que c'est la seule chose qui s'y trouve.

La page liste **toutes** les dépenses de l'entreprise, tous projets confondus, avec recherche,
type et période. « Combien on a dépensé en novembre » est une question d'achats, et y répondre en
ouvrant quarante projets, c'est ne jamais y répondre.

Les trois totaux en haut portent sur **tout ce que les filtres attrapent**, pas sur les vingt
lignes affichées : un total d'une page aurait l'air d'une réponse et serait la mauvaise. Une
dépense sans date est écartée d'une recherche datée plutôt que ramassée dedans — on n'a pas dit
quand l'argent est sorti, donc aucune période ne peut honnêtement la réclamer.

En lecture seule, pour la même raison que les feuilles de temps : une dépense se saisit contre
son projet, avec la photo du reçu.

### Formulaires

Sous **Outils & Formation → Formulaires**, une entreprise monte ses propres formulaires : les
questions, le type de réponse attendu, et **ce que la réponse déclenche**.

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
