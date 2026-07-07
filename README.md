# Onze — Mini-boutique de maillots de football

Une boutique en ligne minimaliste pour vendre des maillots de foot.
Côté acheteur : catalogue, panier, commande en 3 clics.
Côté vendeur : panneau admin protégé, gestion des maillots, des commandes et
des paramètres — sans base de données à installer.

## Installation

```bash
npm install
npm start
```

- Boutique : http://localhost:3000
- Admin : http://localhost:3000/admin

Mot de passe admin par défaut : `admin123`.
Le changer avant de mettre en production :

```bash
ADMIN_PASSWORD="votre-mot-de-passe" npm start
```

## Ce qu'il fait

**Pour l'acheteur**
- Grille de maillots responsive (mobile, tablette, desktop)
- Recherche par équipe / nom
- Détail avec choix de la taille
- Panier persistant (localStorage)
- Formulaire de commande, puis bouton WhatsApp / email pré-rempli pour
  finaliser avec le vendeur

**Pour le vendeur**
- Espace admin avec mot de passe
- Ajouter / modifier / supprimer des maillots, upload d'image (drag & drop)
- Liste des commandes reçues avec statut (nouvelle / traitée / annulée)
- Paramètres : nom de la boutique, slogan, WhatsApp, email

## Structure

```
server.js              Express + API JSON + upload multer
public/
  index.html           Boutique publique
  admin.html           Panneau admin
  css/styles.css       Design responsive (mobile-first)
  js/shop.js           Logique boutique + panier + checkout
  js/admin.js          Auth + CRUD produits/commandes/paramètres
data/
  products.json        Catalogue
  orders.json          Commandes reçues (créé au premier envoi)
  settings.json        Paramètres de la boutique
```

## Configuration (variables d'environnement)

| Variable         | Défaut      | Rôle                             |
|------------------|-------------|----------------------------------|
| `PORT`           | `3000`      | Port d'écoute HTTP               |
| `ADMIN_PASSWORD` | `admin123`  | Mot de passe de l'espace admin   |

## Notes

- Le stockage se fait en fichiers JSON — parfait pour un lancement rapide,
  à migrer vers une vraie base (SQLite, PostgreSQL) si le volume monte.
- Les images uploadées sont servies depuis `public/uploads/` et exclues
  du dépôt git.
- Aucun paiement en ligne intégré : la commande est enregistrée côté
  serveur, l'acheteur est redirigé vers WhatsApp/email pour la finaliser
  avec le vendeur.
