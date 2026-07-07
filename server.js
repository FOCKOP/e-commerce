const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Payment config
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
const PAYPAL_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';
const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

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

function normalizeProduct(p) {
  const images = Array.isArray(p.images) && p.images.length
    ? p.images.filter(Boolean)
    : (p.image ? [p.image] : []);
  const { image, ...rest } = p;
  return { ...rest, images };
}

function sanitizeImages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(u => typeof u === 'string' && u.length > 0 && u.length < 500)
    .filter(u => u.startsWith('/uploads/') || u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/'))
    .slice(0, 8);
}

function shopUrl(req) {
  if (process.env.SHOP_URL) return process.env.SHOP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// Server-side items validation — protects against price tampering
function validateItems(rawItems) {
  const products = readJson(PRODUCTS_FILE, []).map(normalizeProduct);
  const items = [];
  let total = 0;
  for (const it of rawItems || []) {
    const p = products.find(x => x.id === it.id);
    if (!p) throw new Error(`Produit introuvable`);
    const qty = Math.max(1, Math.min(Number(it.qty) || 1, p.stock || 99));
    items.push({
      id: p.id,
      name: p.name,
      team: p.team || '',
      size: String(it.size || (p.sizes && p.sizes[0]) || '-'),
      price: Number(p.price),
      qty
    });
    total += Number(p.price) * qty;
  }
  return { items, total: Math.round(total * 100) / 100 };
}

function makeOrder({ customer, items, total, note, paymentMethod, paymentStatus }) {
  const orders = readJson(ORDERS_FILE, []);
  const order = {
    id: crypto.randomBytes(6).toString('hex'),
    customer,
    items,
    total,
    note: (note || '').trim(),
    status: 'nouvelle',
    paymentMethod: paymentMethod || 'manuel',
    paymentStatus: paymentStatus || 'manuel',
    createdAt: Date.now()
  };
  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
  return order;
}

function updateOrderPayment(orderId, updates) {
  const orders = readJson(ORDERS_FILE, []);
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...updates };
  writeJson(ORDERS_FILE, orders);
  return orders[idx];
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
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Format d\'image non supporté'), ok);
  }
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- Auth ----------

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

// ---------- Public config (for client to know which payment methods are on) ----------

app.get('/api/config', (_req, res) => {
  res.json({
    stripe: {
      enabled: !!stripe && !!STRIPE_PUBLISHABLE_KEY,
      publishableKey: STRIPE_PUBLISHABLE_KEY
    },
    paypal: {
      enabled: !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
      clientId: PAYPAL_CLIENT_ID,
      env: PAYPAL_ENV
    }
  });
});

// ---------- Products ----------

app.get('/api/products', (_req, res) => {
  const list = readJson(PRODUCTS_FILE, []).map(normalizeProduct);
  res.json(list);
});

app.get('/api/products/:id', (req, res) => {
  const list = readJson(PRODUCTS_FILE, []).map(normalizeProduct);
  const p = list.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Introuvable' });
  res.json(p);
});

app.post('/api/products', requireAuth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const { name, team, price, description, images, sizes, stock } = req.body || {};
  if (!name || !price) return res.status(400).json({ error: 'Nom et prix requis' });
  const product = {
    id: crypto.randomBytes(6).toString('hex'),
    name: String(name).trim(),
    team: (team || '').trim(),
    price: Number(price),
    description: (description || '').trim(),
    images: sanitizeImages(images),
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
  const { name, team, price, description, images, sizes, stock } = req.body || {};
  const normalized = normalizeProduct(products[idx]);
  const updated = {
    ...normalized,
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(team !== undefined ? { team: String(team).trim() } : {}),
    ...(price !== undefined ? { price: Number(price) } : {}),
    ...(description !== undefined ? { description: String(description).trim() } : {}),
    ...(images !== undefined ? { images: sanitizeImages(images) } : {}),
    ...(sizes !== undefined ? { sizes: Array.isArray(sizes) ? sizes : normalized.sizes } : {}),
    ...(stock !== undefined ? { stock: Number(stock) } : {})
  };
  products[idx] = updated;
  writeJson(PRODUCTS_FILE, products);
  res.json(updated);
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const filtered = products.filter(p => p.id !== req.params.id);
  writeJson(PRODUCTS_FILE, filtered);
  res.json({ ok: true });
});

app.post('/api/upload', requireAuth, upload.array('images', 8), (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'Aucune image' });
  res.json({ urls: files.map(f => '/uploads/' + f.filename) });
});

// ---------- Settings ----------

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

// ---------- Orders (manual / no online payment) ----------

app.post('/api/orders', (req, res) => {
  const { customer, items: rawItems, note } = req.body || {};
  if (!customer?.name || !customer?.contact || !Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Commande invalide' });
  }
  try {
    const { items, total } = validateItems(rawItems);
    const order = makeOrder({
      customer, items, total, note,
      paymentMethod: 'manuel', paymentStatus: 'manuel'
    });
    res.status(201).json({ ok: true, id: order.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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

// ---------- Payment: Stripe Checkout ----------

app.post('/api/pay/stripe/session', async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Paiement Stripe non configuré' });
  const { customer, items: rawItems, note } = req.body || {};
  if (!customer?.name || !customer?.contact || !Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Commande invalide' });
  }
  try {
    const { items, total } = validateItems(rawItems);
    const order = makeOrder({
      customer, items, total, note,
      paymentMethod: 'stripe', paymentStatus: 'en_attente'
    });
    const base = shopUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map(i => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${i.name}${i.team ? ' — ' + i.team : ''} · Taille ${i.size}`.slice(0, 250)
          },
          unit_amount: Math.round(i.price * 100)
        },
        quantity: i.qty
      })),
      customer_email: customer.contact.includes('@') ? customer.contact : undefined,
      success_url: `${base}/paiement-succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/paiement-annule?order_id=${order.id}`,
      metadata: { orderId: order.id, shopName: (readJson(SETTINGS_FILE, {}).shopName || 'Onze') }
    });
    res.json({ url: session.url, orderId: order.id });
  } catch (e) {
    console.error('Stripe session error:', e.message);
    res.status(500).json({ error: 'Impossible de créer la session de paiement' });
  }
});

app.get('/api/pay/stripe/verify', async (req, res) => {
  if (!stripe) return res.status(400).json({ error: 'Non configuré' });
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id manquant' });
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const orderId = session.metadata?.orderId;
    if (orderId && session.payment_status === 'paid') {
      updateOrderPayment(orderId, { paymentStatus: 'paye' });
    }
    res.json({
      orderId,
      paymentStatus: session.payment_status,
      amount: session.amount_total ? session.amount_total / 100 : null
    });
  } catch (e) {
    console.error('Stripe verify error:', e.message);
    res.status(500).json({ error: 'Vérification impossible' });
  }
});

// ---------- Payment: PayPal ----------

async function paypalToken() {
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('Auth PayPal impossible');
  const j = await r.json();
  return j.access_token;
}

app.post('/api/pay/paypal/order', async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Paiement PayPal non configuré' });
  }
  const { customer, items: rawItems, note } = req.body || {};
  if (!customer?.name || !customer?.contact || !Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Commande invalide' });
  }
  try {
    const { items, total } = validateItems(rawItems);
    const order = makeOrder({
      customer, items, total, note,
      paymentMethod: 'paypal', paymentStatus: 'en_attente'
    });
    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: order.id,
          amount: {
            currency_code: 'EUR',
            value: total.toFixed(2),
            breakdown: {
              item_total: { currency_code: 'EUR', value: total.toFixed(2) }
            }
          },
          items: items.map(i => ({
            name: `${i.name} — ${i.size}`.slice(0, 127),
            unit_amount: { currency_code: 'EUR', value: Number(i.price).toFixed(2) },
            quantity: String(i.qty)
          }))
        }]
      })
    });
    const pp = await r.json();
    if (!pp.id) throw new Error(pp.message || 'PayPal a refusé la création');
    res.json({ paypalOrderId: pp.id, orderId: order.id });
  } catch (e) {
    console.error('PayPal order error:', e.message);
    res.status(500).json({ error: e.message || 'Impossible de créer la commande PayPal' });
  }
});

app.post('/api/pay/paypal/capture', async (req, res) => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Non configuré' });
  }
  const { paypalOrderId, orderId } = req.body || {};
  if (!paypalOrderId || !orderId) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }
  try {
    const token = await paypalToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const result = await r.json();
    if (result.status === 'COMPLETED') {
      updateOrderPayment(orderId, { paymentStatus: 'paye' });
      return res.json({ ok: true, orderId, status: 'COMPLETED' });
    }
    res.status(400).json({ error: 'Paiement non complété', details: result });
  } catch (e) {
    console.error('PayPal capture error:', e.message);
    res.status(500).json({ error: e.message || 'Capture PayPal impossible' });
  }
});

// ---------- Error middleware ----------

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Erreur' });
});

// ---------- Boot ----------

app.listen(PORT, () => {
  console.log(`Onze en ligne — http://localhost:${PORT}`);
  console.log(`Admin : http://localhost:${PORT}/admin  (mot de passe: ${ADMIN_PASSWORD})`);
  console.log(`Paiements : Stripe ${stripe ? 'ON' : 'OFF'} · PayPal ${PAYPAL_CLIENT_ID ? 'ON (' + PAYPAL_ENV + ')' : 'OFF'}`);
});
