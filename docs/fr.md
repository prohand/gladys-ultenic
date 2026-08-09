# Les aspirateurs robots Ultenic dans Gladys

Cette intégration fait entrer vos aspirateurs robots **Ultenic** dans Gladys :
vous voyez leur état, leur batterie et leurs statistiques de nettoyage, et vous
pouvez lancer un cycle, l'arrêter, changer la puissance d'aspiration ou renvoyer
l'appareil à sa base — depuis le tableau de bord, une scène ou le chat.

## Comment ça marche, et pourquoi il faut un compte Tuya

Les aspirateurs Ultenic reposent sur la plateforme **Tuya** : l'application
Ultenic est une application Tuya en marque blanche, et les aspirateurs dialoguent
avec le cloud Tuya, pas avec votre réseau local. Il n'existe pas de protocole
local documenté, cette intégration passe donc par le **cloud IoT Tuya** — la
même route que Home Assistant et les autres intégrations open source pour du
matériel Tuya.

Concrètement : vous créez un **projet Cloud** gratuit sur la Tuya IoT Platform,
vous l'autorisez sur le compte applicatif qui possède l'aspirateur, et vous
donnez à Gladys l'Access ID et l'Access Secret du projet. Gladys lit et pilote
alors vos aspirateurs à travers ce projet.

C'est cette autorisation qui coince avec Ultenic — lisez l'encadré suivant
avant de commencer, il détermine toute la suite de la procédure.

> Tout ceci est gratuit. La période d'essai d'un projet Cloud Tuya doit être
> prolongée manuellement tous les quelques mois (un bouton dans la console) —
> voir la section dépannage.

## ⚠️ À lire avant tout : l'application Ultenic ne peut pas scanner le QR code Tuya

La procédure Tuya officielle demande de scanner un QR code depuis l'application
pour lier votre compte au projet Cloud. **Ce scanner n'existe pas dans
l'application Ultenic.** Celui que vous trouvez dans la gestion de groupe /
gestion de la maison est un scanner différent : il ne sait lire que les
invitations à rejoindre une maison. Quand vous lui présentez le QR code de la
console Tuya, il ne le reconnaît pas, la fenêtre se ferme et vous revenez à
l'écran précédent — sans message d'erreur.

Ce n'est pas un bug de votre côté : Tuya ne rend ce QR code lisible que par les
applications **Tuya Smart** et **Smart Life**, plus quelques applications de
marque explicitement autorisées. Ultenic n'en fait pas partie.

Deux chemins possibles, dans cet ordre de préférence :

| Chemin                                          | Ce que ça implique                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| **A. Déplacer l'aspirateur dans Smart Life** ✅ | Réinitialiser et réappairer l'aspirateur ; il quitte l'application Ultenic |
| **B. Mode « compte applicatif »**               | Aucun QR code, mais ne fonctionne en pratique qu'avec un compte Smart Life |

Le chemin A est celui qui marche de façon fiable. Le chemin B est décrit plus
bas : il évite le QR code, mais il ne contourne pas le fait que Tuya n'autorise
pas un projet tiers à s'authentifier sur le schéma d'une application de marque.

## Étape 1 — Appairer l'aspirateur dans Smart Life

Installez **Smart Life** (l'application gratuite de Tuya, disponible sur iOS et
Android) et appairez-y votre aspirateur, sur un réseau Wi-Fi **2,4 GHz**.

Un appareil Tuya n'appartient qu'à un seul compte à la fois : pour le faire
passer d'Ultenic à Smart Life, il faut le **supprimer de l'application Ultenic**
(ou le réinitialiser avec son bouton de reset, généralement 5 à 10 secondes
d'appui), puis l'appairer dans Smart Life comme un appareil neuf.

Ce que vous perdez : les fonctions propres à l'application Ultenic (carte,
zones interdites selon les modèles). Ce que vous gardez : le nettoyage, la
programmation, la puissance d'aspiration et le retour à la base — donc tout ce
que cette intégration pilote.

> Le partage d'appareil ne remplace pas ce déplacement : le projet Cloud ne voit
> que les appareils **possédés** par le compte lié, pas ceux qui lui ont été
> partagés.

Vérifiez que vous arrivez à démarrer et arrêter l'aspirateur depuis Smart Life
avant d'aller plus loin : si l'application n'y arrive pas, Gladys n'y arrivera
pas non plus.

## Étape 2 — Créer un projet Cloud Tuya

1. Créez un compte sur la [Tuya IoT Platform](https://iot.tuya.com/) (c'est la
   console développeur, un compte différent de celui de l'application).
2. Allez dans **Cloud → Development → Create Cloud Project**.
3. Donnez-lui le nom que vous voulez. Pour **Industry** choisissez _Smart
   Home_, pour **Development Method** choisissez _Smart Home_.
4. Pour **Data Center**, choisissez celui où vit votre compte Ultenic — c'est
   le champ le plus souvent mal renseigné :
   - Europe → _Central Europe_
   - Royaume-Uni → _Western Europe_
   - États-Unis → _Western America_ (ou _Eastern America_)
   - Inde → _India_
   - Chine → _China_
5. Sur l'écran suivant, vérifiez que les services d'API **IoT Core** et
   **Authorization** sont bien activés pour le projet (ils le sont par défaut).

Sur la page **Overview** du projet, vous disposez maintenant d'un **Access ID /
Client ID** et d'un **Access Secret / Client Secret**. Gardez-les sous la main.

## Étape 3 — Lier votre compte Smart Life au projet

1. Dans le projet, ouvrez l'onglet **Devices**, puis **Link App Account**.
2. Cliquez sur **Add App Account** : un QR code s'affiche.
3. Dans **Smart Life**, ouvrez l'onglet **Moi** (profil) et utilisez l'icône de
   scan **en haut à droite** — pas celle de la gestion de maison. Scannez le QR
   code, puis confirmez.
4. Vos appareils apparaissent dans la liste **All Devices** du projet. Si votre
   aspirateur n'y est pas, c'est que le centre de données du projet ne
   correspond pas à celui de votre compte — recréez le projet dans le bon.

Pendant que vous êtes sur cet écran, notez l'**UID** affiché à côté du compte
lié : il est facultatif, mais utile si vous avez lié plusieurs comptes et que
vous n'en voulez qu'un seul dans Gladys.

### Si le QR code ne fonctionne pas : le mode « compte applicatif »

Le QR code expire vite, et certains comptes le refusent obstinément. Dans ce
cas, l'intégration sait s'authentifier **directement comme l'utilisateur de
l'application**, sans aucun QR code : passez le champ **Mode d'autorisation**
sur _Compte applicatif_ et renseignez l'e-mail, le mot de passe, l'indicatif
pays et le schéma de l'application.

Le **schéma** est le code Tuya de l'application à laquelle appartient le
compte : `smartlife` pour Smart Life, `tuyaSmart` pour Tuya Smart.

Une remarque honnête sur ce mode : il n'est pas une porte dérobée pour garder
l'aspirateur dans l'application Ultenic. Une application de marque a son propre
schéma, et Tuya n'autorise normalement pas un projet Cloud tiers à s'y
authentifier — la tentative renvoie une erreur du type « user not exist » ou
« permission deny ». Le champ étant libre, rien ne vous empêche d'essayer avant
de déplacer l'aspirateur : le bouton **Tester la connexion** vous répond en
quelques secondes.

## Étape 4 — Configurer l'intégration dans Gladys

Installez l'intégration Ultenic, ouvrez son écran **Configuration**, et
renseignez :

| Champ                              | Ce qu'il faut y mettre                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| **Centre de données Tuya**         | Celui choisi à l'étape 2                                       |
| **Access ID**                      | Depuis la page Overview du projet                              |
| **Access Secret**                  | Depuis la page Overview du projet                              |
| **Mode d'autorisation**            | _Compte lié_ si le QR code a marché, sinon _Compte applicatif_ |
| **UID utilisateur Tuya**           | Facultatif — laissez vide pour prendre tous les comptes liés   |
| **Intervalle de rafraîchissement** | Fréquence de lecture des aspirateurs (30 s est un bon défaut)  |

En mode _Compte applicatif_, quatre champs supplémentaires sont utilisés :
**Schéma de l'application** (`smartlife`), **E-mail du compte applicatif**,
**Mot de passe du compte applicatif** et **Indicatif pays** (`33` pour la
France). Ils sont ignorés en mode _Compte lié_.

Enregistrez, puis cliquez sur **Tester la connexion**. La réponse doit indiquer
le nombre d'aspirateurs trouvés et leurs noms.

## Étape 5 — Créer les appareils

Ouvrez l'onglet **Découverte** de l'intégration : vos aspirateurs y sont listés.
Cliquez sur **Créer** pour chacun de ceux que vous voulez dans Gladys, affectez-
leur une pièce, et c'est terminé.

## Ce que vous obtenez

Chaque aspirateur devient un appareil Gladys avec :

- **État opérationnel** (lecture seule) — arrêté, en marche, en pause, erreur,
  retour à la base, en charge, sur la base.
- **Mode de fonctionnement** — mettez-le sur _Nettoyer_ pour lancer un cycle,
  sur _Inactif_ pour l'arrêter.
- **Mode de nettoyage** — la puissance d'aspiration, projetée sur les modes de
  nettoyage Gladys (_Serpillière_ = aspiration coupée, _Silencieux_ = douce,
  _Auto_ = normale, _Nettoyage en profondeur_ = forte/max). Seuls les niveaux
  que votre modèle sait faire sont acceptés.
- **Retour à la base** — renvoie l'aspirateur à sa station.
- **Batterie**, en pourcentage.
- **Surface nettoyée**, **Durée de nettoyage** et **Durée de vie du filtre**,
  quand le modèle les remonte.

Les capteurs ne sont ajoutés que si votre aspirateur les publie réellement :
deux modèles Ultenic différents n'exposeront donc pas forcément la même liste.

Un badge **cloud** est affiché sur l'appareil : il passe à **injoignable**
lorsque le cloud Tuya signale l'aspirateur comme hors ligne (base débranchée,
Wi-Fi coupé).

## Dépannage

**« Tuya a refusé les identifiants (sign invalid) »** — l'Access ID ou l'Access
Secret est erroné, ou une espace a été collée avec. Recopiez-les depuis la page
Overview du projet.

**« Aucun aspirateur robot trouvé »** — trois causes habituelles : le centre de
données du projet ne correspond pas à votre compte, le compte applicatif n'est
pas lié au projet, ou l'aspirateur est appairé sur un autre compte que celui
qui a été lié (typiquement : il est resté dans l'application Ultenic alors que
c'est un compte Smart Life qui a été lié).

**Le scan du QR code ferme la fenêtre et ne fait rien** — vous utilisez le
scanner de la gestion de groupe de l'application Ultenic, qui ne sait lire que
les invitations à rejoindre une maison. Ce QR code n'est lisible que par Tuya
Smart et Smart Life : voir l'encadré en haut de cette page.

**« user not exist » / « permission deny » en mode compte applicatif** — le
schéma d'application ne correspond pas au compte, ou Tuya n'autorise pas votre
projet Cloud sur ce schéma (le cas d'une application de marque comme Ultenic).
Utilisez un compte Smart Life avec le schéma `smartlife`.

**« permission deny » / code 1106** — les services d'API du projet n'incluent
pas IoT Core, ou le compte lié a expiré. Reliez le compte applicatif.

**Ça marchait et ça s'est arrêté au bout de quelques mois** — un projet Cloud
Tuya fonctionne sur un abonnement d'essai qui expire. Ouvrez **Cloud →
Development → votre projet → Service API** et prolongez l'essai (c'est gratuit
et ça prend un clic).

**L'état est en retard sur l'application** — l'intégration interroge le cloud
Tuya à l'intervalle que vous avez configuré. Réduisez-le si vous voulez un
retour plus rapide : un seul appel d'API rafraîchit tous les aspirateurs,
l'intervalle court reste donc peu coûteux.

**Le mode cartographie ne fait rien** — le mode de fonctionnement de Gladys
propose une valeur _Cartographier_, mais l'API cloud de Tuya n'expose aucune
commande standard « cartographier sans nettoyer ». L'intégration la refuse
explicitement plutôt que de faire silencieusement autre chose.
