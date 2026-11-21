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
| `POSTGRES_DB` | `vextadb` | Nom de la base. |
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
2. Dans Stripe, créez un webhook vers `https://api.vexta.ca/api/billing/webhook`, événement
   `checkout.session.completed`.
3. Reportez le secret de signature dans **Intégrations**.
4. Créez vos forfaits dans **Forfaits**. Vexta crée le prix dans Stripe à l'enregistrement ; un
   forfait sans prix Stripe ne peut pas être publié.

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

Dokploy déclenche le déploiement sur réception du push si le webhook GitHub est activé
(**Deployments → Webhook URL**). Sinon, **Deploy** dans l'interface.

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
