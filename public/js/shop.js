(() => {
  const state = {
    products: [],
    settings: {},
    cart: JSON.parse(localStorage.getItem('onze.cart') || '[]')
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const normalize = s => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function saveCart() {
    localStorage.setItem('onze.cart', JSON.stringify(state.cart));
    renderCartCount();
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function openModal(id) { $('#' + id).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(el) { el.classList.remove('open'); document.body.style.overflow = ''; }
  document.addEventListener('click', e => {
    if (e.target.matches('.modal-overlay')) closeModal(e.target);
    if (e.target.matches('[data-close]')) closeModal(e.target.closest('.modal-overlay'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal-overlay.open').forEach(closeModal);
  });

  async function fetchProducts() {
    const r = await fetch('/api/products');
    state.products = await r.json();
    renderGrid();
  }
  async function fetchSettings() {
    const r = await fetch('/api/settings');
    state.settings = await r.json();
    applySettings();
  }

  function applySettings() {
    const { shopName, tagline } = state.settings;
    if (shopName) {
      $$('[data-shop-name]').forEach(el => el.textContent = shopName);
      document.title = `${shopName} · Maillots de football`;
    }
    if (tagline) {
      $$('[data-shop-tagline]').forEach(el => el.textContent = tagline);
    }
  }

  function firstImage(p) {
    return (p.images && p.images.length) ? p.images[0] : '';
  }

  function productImage(p) {
    const img = firstImage(p);
    if (img) return `<img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy">`;
    return `<div class="card-img-placeholder">👕</div>`;
  }

  function renderGrid() {
    const q = normalize($('#search').value.trim());
    const list = q
      ? state.products.filter(p =>
          normalize(`${p.name} ${p.team || ''} ${p.description || ''}`).includes(q))
      : state.products;

    const grid = $('#productsGrid');
    grid.innerHTML = list.map(p => {
      const outOfStock = (p.stock || 0) <= 0;
      const imgCount = (p.images || []).length;
      return `
        <article class="card" data-id="${p.id}">
          <div class="card-img-wrap">
            ${productImage(p)}
            ${outOfStock
              ? '<span class="card-badge-stock out">Épuisé</span>'
              : (p.stock <= 3 ? `<span class="card-badge-stock">Plus que ${p.stock}</span>` : '')}
            ${imgCount > 1 ? `<span class="card-badge-multi">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="14" height="14" rx="2"/><rect x="7" y="7" width="14" height="14" rx="2"/></svg>
              ${imgCount}
            </span>` : ''}
          </div>
          <div class="card-body">
            ${p.team ? `<div class="card-team">${escapeHtml(p.team)}</div>` : ''}
            <h3 class="card-name">${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="card-desc">${escapeHtml(p.description)}</p>` : ''}
            <div class="card-foot">
              <div class="card-price">${eur(p.price)}</div>
              <button class="btn-add" ${outOfStock ? 'disabled' : ''}>
                ${outOfStock ? 'Épuisé' : 'Voir'}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    $('#emptyState').style.display = state.products.length === 0 ? 'block' : 'none';
    $('#noResults').style.display = (state.products.length > 0 && list.length === 0) ? 'block' : 'none';
    grid.style.display = list.length === 0 ? 'none' : '';

    grid.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        location.href = '/produit?id=' + encodeURIComponent(card.dataset.id);
      });
    });
  }

  function renderCartCount() {
    const total = state.cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = total;
  }

  function renderCart() {
    const body = $('#cartBody');
    if (state.cart.length === 0) {
      body.innerHTML = `<div class="empty" style="padding:36px 16px;border:none">
        <h3>Panier vide</h3>
        <p>Choisis un maillot pour commencer.</p>
      </div>`;
      $('#goCheckout').disabled = true;
      return;
    }
    const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    body.innerHTML = state.cart.map(i => `
      <div class="cart-item" data-key="${escapeHtml(i.key)}">
        <div class="cart-thumb">
          ${i.image ? `<img src="${escapeHtml(i.image)}" alt="">` : '<div class="card-img-placeholder" style="font-size:22px">👕</div>'}
        </div>
        <div class="cart-info">
          <div class="cart-name">${escapeHtml(i.name)}</div>
          <div class="cart-meta">${i.team ? escapeHtml(i.team) + ' · ' : ''}Taille ${escapeHtml(i.size)}</div>
          <div class="qty" style="margin-top:6px">
            <button data-act="dec" aria-label="Moins">−</button>
            <span>${i.qty}</span>
            <button data-act="inc" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="cart-actions">
          <div class="cart-price">${eur(i.price * i.qty)}</div>
          <button class="cart-remove" data-act="rm">Retirer</button>
        </div>
      </div>
    `).join('') + `<div class="cart-total"><span>Total</span><span>${eur(total)}</span></div>`;

    body.querySelectorAll('.cart-item').forEach(row => {
      const key = row.dataset.key;
      row.querySelectorAll('[data-act]').forEach(b =>
        b.addEventListener('click', () => cartAction(key, b.dataset.act))
      );
    });
    $('#goCheckout').disabled = false;
  }

  function cartAction(key, act) {
    const idx = state.cart.findIndex(i => i.key === key);
    if (idx === -1) return;
    const it = state.cart[idx];
    if (act === 'inc') it.qty = Math.min(it.qty + 1, it.maxStock || 99);
    if (act === 'dec') { it.qty -= 1; if (it.qty <= 0) state.cart.splice(idx, 1); }
    if (act === 'rm') state.cart.splice(idx, 1);
    saveCart();
    renderCart();
  }

  $('#cartBtn').addEventListener('click', () => {
    renderCart();
    openModal('cartModal');
  });

  $('#search').addEventListener('input', renderGrid);

  $('#goCheckout').addEventListener('click', () => {
    closeModal($('#cartModal'));
    const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    $('#checkoutTotal').textContent = eur(total);
    openModal('checkoutModal');
  });

  $('#checkoutForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Envoi...';
    const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    const payload = {
      customer: {
        name: form.name.value.trim(),
        contact: form.contact.value.trim(),
        address: form.address.value.trim()
      },
      items: state.cart.map(i => ({
        id: i.id, name: i.name, team: i.team,
        size: i.size, price: i.price, qty: i.qty
      })),
      total,
      note: form.note.value.trim()
    };
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Envoi impossible');
      const data = await r.json();
      state.cart = [];
      saveCart();
      form.reset();
      closeModal($('#checkoutModal'));
      showConfirmation(data.id, payload);
    } catch (err) {
      toast(err.message || 'Erreur lors de l\'envoi');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Valider la commande';
    }
  });

  function showConfirmation(id, payload) {
    $('#confirmId').textContent = '#' + id.slice(0, 6).toUpperCase();
    const opts = $('#contactOptions');
    const lines = [
      `Bonjour, je viens de passer commande #${id.slice(0, 6).toUpperCase()} chez ${state.settings.shopName || 'Onze'}.`,
      '',
      ...payload.items.map(i => `• ${i.qty}× ${i.name} (${i.size}) — ${eur(i.price * i.qty)}`),
      '',
      `Total : ${eur(payload.total)}`,
      `Nom : ${payload.customer.name}`,
      `Contact : ${payload.customer.contact}`
    ];
    const msg = encodeURIComponent(lines.join('\n'));
    const buttons = [];
    if (state.settings.contactWhatsapp) {
      const num = state.settings.contactWhatsapp.replace(/\D/g, '');
      buttons.push(`<a class="btn btn-orange btn-block" style="margin-top:12px" href="https://wa.me/${num}?text=${msg}" target="_blank" rel="noopener">Contacter sur WhatsApp</a>`);
    }
    if (state.settings.contactEmail) {
      buttons.push(`<a class="btn btn-secondary btn-block" style="margin-top:8px" href="mailto:${encodeURIComponent(state.settings.contactEmail)}?subject=Commande&body=${msg}">Envoyer par email</a>`);
    }
    opts.innerHTML = buttons.join('');
    openModal('confirmModal');
  }

  $('#year').textContent = new Date().getFullYear();

  renderCartCount();
  fetchSettings();
  fetchProducts();
})();
