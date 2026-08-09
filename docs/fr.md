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
vous y **liez votre compte applicatif Ultenic**, et vous donnez à Gladys
l'Access ID et l'Access Secret du projet. Gladys lit et pilote alors vos
aspirateurs à travers ce projet. Votre application Ultenic continue de
fonctionner exactement comme avant.

> Tout ceci est gratuit. La période d'essai d'un projet Cloud Tuya doit être
> prolongée manuellement tous les quelques mois (un bouton dans la console) —
> voir la section dépannage.

## Étape 1 — Appairer l'aspirateur dans l'application

Appairez votre aspirateur dans l'application **Ultenic** (ou dans **Smart
Life**, qui gère les mêmes appareils), sur un réseau Wi-Fi **2,4 GHz**. Vérifiez
que vous arrivez à le démarrer et à l'arrêter depuis l'application avant d'aller
plus loin : si l'application n'y arrive pas, Gladys n'y arrivera pas non plus.

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

## Étape 3 — Lier votre compte Ultenic au projet

1. Dans le projet, ouvrez l'onglet **Devices**, puis **Link App Account**.
2. Cliquez sur **Add App Account** : un QR code s'affiche.
3. Dans l'application **Ultenic** (ou Smart Life), ouvrez l'onglet profil,
   utilisez l'icône de scan en haut à droite, scannez le QR code et confirmez.
4. Vos appareils apparaissent dans la liste **All Devices** du projet. Si votre
   aspirateur n'y est pas, c'est que le centre de données du projet ne
   correspond pas à celui de votre compte — recréez le projet dans le bon.

Pendant que vous êtes sur cet écran, notez l'**UID** affiché à côté du compte
lié : il est facultatif, mais utile si vous avez lié plusieurs comptes et que
vous n'en voulez qu'un seul dans Gladys.

## Étape 4 — Configurer l'intégration dans Gladys

Installez l'intégration Ultenic, ouvrez son écran **Configuration**, et
renseignez :

| Champ                              | Ce qu'il faut y mettre                                        |
| ---------------------------------- | ------------------------------------------------------------- |
| **Centre de données Tuya**         | Celui choisi à l'étape 2                                      |
| **Access ID**                      | Depuis la page Overview du projet                             |
| **Access Secret**                  | Depuis la page Overview du projet                             |
| **UID utilisateur Tuya**           | Facultatif — laissez vide pour prendre tous les comptes liés  |
| **Intervalle de rafraîchissement** | Fréquence de lecture des aspirateurs (30 s est un bon défaut) |

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
qui a été lié.

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
