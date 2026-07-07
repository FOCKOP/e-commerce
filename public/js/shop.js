(() => {
  const state = {
    products: [],
    settings: {},
    cart: JSON.parse(localStorage.getItem('onze.cart') || '[]'),
    selectedProduct: null,
    selectedSize: null
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

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

  function productImage(p, cls = '') {
    if (p.image) return `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" class="${cls}">`;
    return `<div class="card-img-placeholder">👕</div>`;
  }

  function renderGrid() {
    const q = $('#search').value.trim().toLowerCase();
    const list = state.products.filter(p => {
      if (!q) return true;
      return (p.name + ' ' + (p.team || '') + ' ' + (p.description || '')).toLowerCase().includes(q);
    });
    const grid = $('#productsGrid');
    grid.innerHTML = list.map(p => {
      const outOfStock = (p.stock || 0) <= 0;
      return `
        <article class="card" data-id="${p.id}">
          <div class="card-img-wrap">
            ${productImage(p)}
            ${outOfStock
              ? '<span class="card-badge-stock out">Épuisé</span>'
              : (p.stock <= 3 ? `<span class="card-badge-stock">Plus que ${p.stock}</span>` : '')}
          </div>
          <div class="card-body">
            ${p.team ? `<div class="card-team">${escapeHtml(p.team)}</div>` : ''}
            <h3 class="card-name">${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="card-desc">${escapeHtml(p.description)}</p>` : ''}
            <div class="card-foot">
              <div class="card-price">${eur(p.price)}</div>
              <button class="btn-add" data-open="${p.id}" ${outOfStock ? 'disabled' : ''}>
                ${outOfStock ? 'Épuisé' : 'Voir'}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
    $('#emptyState').style.display = state.products.length === 0 ? 'block' : 'none';
    grid.style.display = state.products.length === 0 ? 'none' : '';

    grid.querySelectorAll('[data-open]').forEach(btn =>
      btn.addEventListener('click', () => openDetail(btn.dataset.open))
    );
    grid.querySelectorAll('.card-img-wrap, .card-name').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.closest('.card')?.dataset.id;
        if (id) openDetail(id);
      });
      el.style.cursor = 'pointer';
    });
  }

  function openDetail(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    state.selectedProduct = p;
    state.selectedSize = (p.sizes && p.sizes[0]) || null;
    $('#detailTitle').textContent = p.name;
    $('#detailBody').innerHTML = `
      <div class="detail-img">${productImage(p)}</div>
      <div>
        ${p.team ? `<div class="detail-team">${escapeHtml(p.team)}</div>` : ''}
        <h2>${escapeHtml(p.name)}</h2>
        <div class="detail-price">${eur(p.price)}</div>
        ${p.description ? `<p class="detail-desc">${escapeHtml(p.description)}</p>` : ''}
        ${p.sizes && p.sizes.length ? `
          <div class="field">
            <label>Taille</label>
            <div class="detail-sizes" id="sizeChips">
              ${p.sizes.map((s, i) =>
                `<button type="button" class="size-chip ${i === 0 ? 'active' : ''}" data-size="${escapeHtml(s)}">${escapeHtml(s)}</button>`
              ).join('')}
            </div>
          </div>` : ''}
        <button class="btn btn-primary btn-block" id="addToCartBtn"
          ${(p.stock || 0) <= 0 ? 'disabled' : ''}>
          ${(p.stock || 0) <= 0 ? 'Épuisé' : 'Ajouter au panier'}
        </button>
      </div>
    `;
    $$('#sizeChips .size-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#sizeChips .size-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.selectedSize = chip.dataset.size;
      });
    });
    $('#addToCartBtn').addEventListener('click', addSelectedToCart);
    openModal('detailModal');
  }

  function addSelectedToCart() {
    const p = state.selectedProduct;
    if (!p) return;
    const size = state.selectedSize || (p.sizes && p.sizes[0]) || '-';
    const key = p.id + '::' + size;
    const existing = state.cart.find(i => i.key === key);
    if (existing) {
      existing.qty = Math.min(existing.qty + 1, p.stock || 99);
    } else {
      state.cart.push({
        key, id: p.id, name: p.name, team: p.team, price: p.price,
        image: p.image, size, qty: 1, maxStock: p.stock || 99
      });
    }
    saveCart();
    closeModal($('#detailModal'));
    toast(`« ${p.name} » ajouté au panier`);
  }

  function renderCartCount() {
    const total = state.cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = total;
  }

  function renderCart() {
    const body = $('#cartBody');
    if (state.cart.length === 0) {
      body.innerHTML = `<div class="empty" style="padding:32px 16px"><h3>Panier vide</h3><p>Ajoute un maillot pour commencer.</p></div>`;
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
            <button data-act="dec">−</button>
            <span>${i.qty}</span>
            <button data-act="inc">+</button>
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
