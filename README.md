# Onze — Mini-boutique de maillots de football

Boutique en ligne minimaliste pour vendre des maillots de foot.
Panier, page produit, panneau admin, paiement en ligne via **PayPal Business**
(compte PayPal + cartes bancaires en guest checkout).

## Installation

```bash
npm install
npm start
```

- Boutique : http://localhost:3000
- Admin : http://localhost:3000/admin  (mot de passe : `admin123`)

## Configuration

Le serveur lit ses paramètres dans des variables d'environnement.

**Windows PowerShell** :

```powershell
$env:ADMIN_PASSWORD="votre-mot-de-passe"
$env:PAYPAL_CLIENT_ID="AZ..."
$env:PAYPAL_CLIENT_SECRET="EL..."
$env:PAYPAL_ENV="sandbox"
npm start
```

**macOS / Linux** :

```bash
ADMIN_PASSWORD="votre-mot-de-passe" \
PAYPAL_CLIENT_ID="AZ..." \
PAYPAL_CLIENT_SECRET="EL..." \
PAYPAL_ENV="sandbox" \
npm start
```

| Variable                   | Défaut     | Rôle                                             |
|----------------------------|------------|--------------------------------------------------|
| `PORT`                     | `3000`     | Port d'écoute                                    |
| `ADMIN_PASSWORD`           | `admin123` | Mot de passe admin                               |
| `PAYPAL_CLIENT_ID`         | —          | Client ID PayPal Business                        |
| `PAYPAL_CLIENT_SECRET`     | —          | Client Secret PayPal Business                    |
| `PAYPAL_ENV`               | `sandbox`  | `sandbox` (tests) ou `live` (production)         |

Si les clés PayPal ne sont pas fournies, la boutique bascule sur
l'ancien flow "envoyer la commande sans paiement" avec WhatsApp/email.

## Récupérer les clés PayPal

1. Connecte-toi sur https://developer.paypal.com avec ton compte
   **PayPal Business**.
2. **Apps & Credentials** → **Sandbox** (mode test) → **Create App**.
   Nom d'app libre. Copie le **Client ID** et le **Client Secret**.
3. Pour tester : PayPal fournit des comptes acheteur sandbox dans
   **Sandbox** → **Accounts**.
4. **Pour la production** (vraies transactions) : bascule sur
   **Live** dans le dashboard, recrée une app en Live, récupère les
   nouvelles clés `Client ID / Client Secret`, et lance le serveur
   avec `PAYPAL_ENV=live`.

## Modes de paiement acceptés

Un seul compte PayPal Business te donne accès à :

- **Le bouton PayPal jaune** — pour les clients qui ont un compte PayPal
- **Le bouton carte noir** ("Débit ou Carte de crédit") — pour les
  clients **sans compte PayPal** : ils tapent leur numéro de CB
  directement dans le flow PayPal (Visa, Mastercard, CB, Amex).
  L'argent arrive sur ton compte PayPal Business comme n'importe quelle
  vente.

Pas besoin d'un autre processeur de paiement.

## Fonctionnement

**Pour l'acheteur** — parcourir, ajouter au panier, remplir ses coordonnées,
puis dans la modale finaliser :

- Cliquer sur le **bouton PayPal** → popup PayPal → connexion → paiement
- Ou cliquer sur le **bouton Carte** → popup PayPal en mode invité →
  saisie CB → paiement
- Ou "Réserver et régler après contact" → commande créée, à finaliser
  par WhatsApp/email

**Pour le vendeur** — panneau admin (`/admin`), 3 onglets :

- **Maillots** — CRUD + upload jusqu'à 8 photos par maillot
- **Commandes** — statut business (Nouvelle / Traitée / Annulée) et
  statut paiement (Payé ✓ / En attente ⋯ / À régler)
- **Paramètres** — nom de la boutique, slogan, WhatsApp, email

## Structure

```
server.js              Express + PayPal API
public/
  index.html           Vitrine
  produit.html         Page maillot (galerie multi-images)
  admin.html           Panneau admin
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

- Le serveur revalide systématiquement les prix côté serveur : le client
  n'envoie qu'`id`, `size`, `qty`. Impossible pour un client malveillant
  de trafiquer le prix affiché — le serveur relit `data/products.json`.
- Le stockage se fait en fichiers JSON — parfait pour démarrer, à
  migrer vers une vraie base (SQLite, PostgreSQL) si le volume monte.
- Les images uploadées sont servies depuis `public/uploads/` et exclues
  du dépôt git.
