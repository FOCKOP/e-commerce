# Onze — Mini-boutique de maillots de football

Boutique en ligne minimaliste pour vendre des maillots de foot.
Panier, page produit, panneau admin, paiement en ligne (Stripe + PayPal).

## Installation

```bash
npm install
npm start
```

- Boutique : http://localhost:3000
- Admin : http://localhost:3000/admin  (mot de passe : `admin123`)

## Configuration

Le serveur lit ses paramètres dans des variables d'environnement.
Sur Windows PowerShell :

```powershell
$env:ADMIN_PASSWORD="votre-mot-de-passe"
$env:STRIPE_SECRET_KEY="sk_test_..."
$env:STRIPE_PUBLISHABLE_KEY="pk_test_..."
$env:PAYPAL_CLIENT_ID="AZ..."
$env:PAYPAL_CLIENT_SECRET="EL..."
$env:PAYPAL_ENV="sandbox"
npm start
```

Sur macOS / Linux :

```bash
ADMIN_PASSWORD="votre-mot-de-passe" \
STRIPE_SECRET_KEY="sk_test_..." \
STRIPE_PUBLISHABLE_KEY="pk_test_..." \
PAYPAL_CLIENT_ID="AZ..." \
PAYPAL_CLIENT_SECRET="EL..." \
PAYPAL_ENV="sandbox" \
npm start
```

| Variable                   | Défaut     | Rôle                                             |
|----------------------------|------------|--------------------------------------------------|
| `PORT`                     | `3000`     | Port d'écoute                                    |
| `ADMIN_PASSWORD`           | `admin123` | Mot de passe admin                               |
| `STRIPE_SECRET_KEY`        | —          | Clé secrète Stripe (`sk_test_…` ou `sk_live_…`)  |
| `STRIPE_PUBLISHABLE_KEY`   | —          | Clé publiable Stripe (`pk_test_…` ou `pk_live_…`)|
| `PAYPAL_CLIENT_ID`         | —          | Client ID PayPal                                  |
| `PAYPAL_CLIENT_SECRET`     | —          | Client Secret PayPal                              |
| `PAYPAL_ENV`               | `sandbox`  | `sandbox` (tests) ou `live` (production)         |
| `SHOP_URL`                 | auto       | URL publique (pour les URLs de retour Stripe)     |

Si **aucune** clé de paiement n'est fournie, la boutique bascule sur
l'ancien flow "envoyer la commande sans paiement" avec WhatsApp/email.

## Récupérer les clés

### Stripe (cartes bancaires + Apple Pay + Google Pay + Link)

1. Créer un compte sur https://dashboard.stripe.com/register
2. Dashboard → **Développeurs** → **Clés API**
3. Copier la **clé publiable** (`pk_test_...`) et la **clé secrète** (`sk_test_...`)
4. En mode test, Apple Pay et Google Pay sont activés automatiquement.
5. **Pour la production (Apple Pay)** : Dashboard → **Paramètres** →
   **Méthodes de paiement** → **Apple Pay** → **Ajouter un nouveau domaine**
   et suivre les instructions (upload d'un fichier de vérification).

### PayPal

1. Créer un compte sur https://developer.paypal.com
2. Dashboard → **Apps & Credentials** → **Create App**
3. Copier **Client ID** et **Client Secret** (mode Sandbox pour les tests)
4. Pour tester : PayPal fournit des comptes acheteur sandbox dans
   **Sandbox** → **Accounts**.
5. Passer en production : recréer l'app en mode Live et changer
   `PAYPAL_ENV=live`.

## Fonctionnement

**Pour l'acheteur** — parcourir, ajouter au panier, remplir ses coordonnées,
choisir un mode de paiement :

- **Carte / Apple Pay / Google Pay / Link** → Stripe Checkout (redirection)
- **PayPal** → bouton officiel PayPal (popup)
- **Réserver et régler après contact** → commande créée, on la finalise
  par WhatsApp/email

**Pour le vendeur** — panneau admin (`/admin`) avec 3 onglets :

- **Maillots** : ajouter/modifier/supprimer, jusqu'à 8 photos par maillot
- **Commandes** : voir toutes les commandes reçues, statut business
  (Nouvelle / Traitée / Annulée) et statut paiement (Payé / En attente / À régler)
- **Paramètres** : nom de la boutique, slogan, WhatsApp, email

## Structure

```
server.js              Express + Stripe + PayPal
public/
  index.html           Vitrine
  produit.html         Page maillot (galerie multi-images)
  admin.html           Panneau admin
  paiement-succes.html Retour Stripe (succès)
  paiement-annule.html Retour Stripe (annulation)
  css/styles.css       Design responsive
  js/
    shop.js            Logique vitrine
    produit.js         Logique page produit
    admin.js           Auth + CRUD produits/commandes
    checkout.js        Logique de paiement partagée
  img/                 Logo + hero image
data/
  products.json        Catalogue
  orders.json          Commandes reçues
  settings.json        Paramètres de la boutique
```

## Sécurité

- Le serveur revalide les prix côté serveur (impossible pour un client
  malveillant de modifier le prix affiché). Les items envoyés par le
  client contiennent uniquement `id`, `size`, `qty` — le prix est
  toujours relu depuis `data/products.json`.
- Le stockage est en fichiers JSON — parfait pour démarrer, à migrer
  vers une vraie base (SQLite, PostgreSQL) si le volume monte.
- Les images uploadées sont servies depuis `public/uploads/` et exclues
  du dépôt git.
- Les webhooks Stripe (confirmation asynchrone du paiement) ne sont
  pas implémentés — la vérification se fait à la redirection retour,
  ce qui suffit pour un petit volume. À ajouter si nécessaire.
