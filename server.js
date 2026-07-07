const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, []);
if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);
if (!fs.existsSync(SETTINGS_FILE)) {
  writeJson(SETTINGS_FILE, {
    shopName: 'Onze',
    tagline: 'Le vestiaire des passionnés',
    contactWhatsapp: '',
    contactEmail: ''
  });
}

const sessions = new Set();

function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  if (token && sessions.has(token)) return next();
  return res.status(401).json({ error: 'Non autorisé' });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(8).toString('hex') + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Format d\'image non supporté'), ok);
  }
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) sessions.delete(token);
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const token = req.cookies?.session;
  res.json({ authenticated: !!(token && sessions.has(token)) });
});

app.get('/api/products', (_req, res) => {
  res.json(readJson(PRODUCTS_FILE, []));
});

app.post('/api/products', requireAuth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const { name, team, price, description, image, sizes, stock } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'Nom et prix requis' });
  const product = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(name).trim(),
    team: (team || '').trim(),
    price: Number(price),
    description: (description || '').trim(),
    image: image || '',
    sizes: Array.isArray(sizes) ? sizes : ['S', 'M', 'L', 'XL'],
    stock: Number.isFinite(Number(stock)) ? Number(stock) : 10,
    createdAt: Date.now()
  };
  products.unshift(product);
  writeJson(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });
  const { name, team, price, description, image, sizes, stock } = req.body || {};
  products[idx] = {
    ...products[idx],
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(team !== undefined ? { team: String(team).trim() } : {}),
    ...(price !== undefined ? { price: Number(price) } : {}),
    ...(description !== undefined ? { description: String(description).trim() } : {}),
    ...(image !== undefined ? { image } : {}),
    ...(sizes !== undefined ? { sizes: Array.isArray(sizes) ? sizes : products[idx].sizes } : {}),
    ...(stock !== undefined ? { stock: Number(stock) } : {})
  };
  writeJson(PRODUCTS_FILE, products);
  res.json(products[idx]);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const filtered = products.filter(p => p.id !== req.params.id);
  writeJson(PRODUCTS_FILE, filtered);
  res.json({ ok: true });
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucune image' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/settings', (_req, res) => {
  res.json(readJson(SETTINGS_FILE, {}));
});

app.put('/api/settings', requireAuth, (req, res) => {
  const current = readJson(SETTINGS_FILE, {});
  const { shopName, tagline, contactWhatsapp, contactEmail } = req.body || {};
  const updated = {
    ...current,
    ...(shopName !== undefined ? { shopName } : {}),
    ...(tagline !== undefined ? { tagline } : {}),
    ...(contactWhatsapp !== undefined ? { contactWhatsapp } : {}),
    ...(contactEmail !== undefined ? { contactEmail } : {})
  };
  writeJson(SETTINGS_FILE, updated);
  res.json(updated);
});

app.post('/api/orders', (req, res) => {
  const { customer, items, total, note } = req.body || {};
  if (!customer?.name || !customer?.contact || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Commande invalide' });
  }
  const orders = readJson(ORDERS_FILE, []);
  const order = {
    id: crypto.randomBytes(6).toString('hex'),
    customer,
    items,
    total: Number(total) || 0,
    note: (note || '').trim(),
    status: 'nouvelle',
    createdAt: Date.now()
  };
  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
  res.status(201).json({ ok: true, id: order.id });
});

app.get('/api/orders', requireAuth, (_req, res) => {
  res.json(readJson(ORDERS_FILE, []));
});

app.put('/api/orders/:id', requireAuth, (req, res) => {
  const orders = readJson(ORDERS_FILE, []);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Introuvable' });
  const { status } = req.body || {};
  if (status) orders[idx].status = status;
  writeJson(ORDERS_FILE, orders);
  res.json(orders[idx]);
});

app.delete('/api/orders/:id', requireAuth, (req, res) => {
  const orders = readJson(ORDERS_FILE, []);
  writeJson(ORDERS_FILE, orders.filter(o => o.id !== req.params.id));
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Erreur' });
});

app.listen(PORT, () => {
  console.log(`Onze en ligne — http://localhost:${PORT}`);
  console.log(`Admin : http://localhost:${PORT}/admin  (mot de passe: ${ADMIN_PASSWORD})`);
});
