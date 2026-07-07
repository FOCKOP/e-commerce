(() => {
  const state = {
    product: null,
    products: [],
    settings: {},
    cart: JSON.parse(localStorage.getItem('onze.cart') || '[]'),
    size: null,
    qty: 1,
    currentImage: 0
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
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

  function firstImage(p) {
    return (p.images && p.images.length) ? p.images[0] : '';
  }

  async function loadAll() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return renderNotFound();
    const [pRes, allRes, sRes] = await Promise.all([
      fetch('/api/products/' + encodeURIComponent(id)),
      fetch('/api/products'),
      fetch('/api/settings')
    ]);
    if (!pRes.ok) return renderNotFound();
    state.product = await pRes.json();
    state.products = await allRes.json();
    state.settings = await sRes.json();
    applySettings();
    renderProduct();
    renderRelated();
  }

  function applySettings() {
    const { shopName, tagline } = state.settings;
    if (shopName) {
      $$('[data-shop-name]').forEach(el => el.textContent = shopName);
      document.title = `${state.product?.name || 'Maillot'} · ${shopName}`;
    } else {
      document.title = `${state.product?.name || 'Maillot'} · Onze`;
    }
    if (tagline) $$('[data-shop-tagline]').forEach(el => el.textContent = tagline);
  }

  function renderNotFound() {
    $('#productContainer').innerHTML = `
      <div class="empty" style="margin-top:40px">
        <h3>Maillot introuvable</h3>
        <p>Il a peut-être été retiré. <a href="/">Retour à la boutique</a></p>
      </div>`;
    document.title = 'Introuvable · Onze';
  }

  function renderProduct() {
    const p = state.product;
    const outOfStock = (p.stock || 0) <= 0;
    const images = p.images && p.images.length ? p.images : [];
    const sizes = p.sizes && p.sizes.length ? p.sizes : ['Unique'];
    state.size = sizes[0];

    $('#productContainer').innerHTML = `
      <div class="product-page">
        <div class="gallery">
          <div class="gallery-main">
            <div class="gallery-track" id="galleryTrack">
              ${images.length ? images.map(src => `
                <div class="gallery-slide"><img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}"></div>
              `).join('') : `
                <div class="gallery-slide"><div class="card-img-placeholder" style="font-size:80px">👕</div></div>
              `}
            </div>
            ${images.length > 1 ? `
              <button class="gallery-arrow prev" id="prevBtn" aria-label="Image précédente">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button class="gallery-arrow next" id="nextBtn" aria-label="Image suivante">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <div class="gallery-dots" id="galleryDots">
                ${images.map((_, i) => `<button class="gallery-dot ${i === 0 ? 'active' : ''}" data-slide="${i}" aria-label="Image ${i + 1}"></button>`).join('')}
              </div>
            ` : ''}
          </div>
          ${images.length > 1 ? `
            <div class="gallery-thumbs" id="galleryThumbs">
              ${images.map((src, i) => `
                <button class="gallery-thumb ${i === 0 ? 'active' : ''}" data-slide="${i}">
                  <img src="${escapeHtml(src)}" alt="">
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="product-info">
          ${p.team ? `<div class="product-team">${escapeHtml(p.team)}</div>` : ''}
          <h1 class="product-title">${escapeHtml(p.name)}</h1>
          <div class="product-price-row">
            <div class="product-price">${eur(p.price)}</div>
            ${outOfStock
              ? '<div class="product-stock out">Épuisé</div>'
              : (p.stock <= 3
                  ? `<div class="product-stock warn">Plus que ${p.stock} en stock</div>`
                  : `<div class="product-stock">${p.stock} en stock</div>`)}
          </div>
          ${p.description ? `<p class="product-desc">${escapeHtml(p.description)}</p>` : ''}

          <div>
            <div class="product-section-label">Taille</div>
            <div class="size-chips" id="sizeChips">
              ${sizes.map((s, i) =>
                `<button type="button" class="size-chip ${i === 0 ? 'active' : ''}" data-size="${escapeHtml(s)}">${escapeHtml(s)}</button>`
              ).join('')}
            </div>
          </div>

          <div>
            <div class="product-section-label">Quantité</div>
            <div class="qty-selector" id="qtySelector">
              <button data-qty="dec" aria-label="Moins">−</button>
              <span id="qtyValue">1</span>
              <button data-qty="inc" aria-label="Plus">+</button>
            </div>
          </div>

          <div class="product-cta">
            <button class="btn btn-orange" id="addToCart" ${outOfStock ? 'disabled' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              ${outOfStock ? 'Épuisé' : 'Ajouter au panier'}
            </button>
            <button class="btn btn-primary" id="buyNow" ${outOfStock ? 'disabled' : ''}>
              Commander
            </button>
          </div>

          <div class="product-features">
            <div class="feature">
              <div class="feature-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              </div>
              <div><strong>Livraison sous 48h</strong>France métropolitaine</div>
            </div>
            <div class="feature">
              <div class="feature-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div><strong>Pièces authentiques</strong>Achetées en direct</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Wire size chips
    $$('#sizeChips .size-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#sizeChips .size-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.size = chip.dataset.size;
      });
    });

    // Wire qty
    $$('#qtySelector [data-qty]').forEach(b => {
      b.addEventListener('click', () => {
        const max = state.product.stock || 99;
        if (b.dataset.qty === 'inc') state.qty = Math.min(state.qty + 1, max);
        else state.qty = Math.max(state.qty - 1, 1);
        $('#qtyValue').textContent = state.qty;
      });
    });

    // Wire CTAs
    $('#addToCart')?.addEventListener('click', () => {
      addToCart();
      toast(`« ${state.product.name } » ajouté au panier`);
    });
    $('#buyNow')?.addEventListener('click', () => {
      addToCart();
      openCart();
    });

    // Wire gallery
    if (images.length > 1) wireGallery();
  }

  function wireGallery() {
    const track = $('#galleryTrack');
    const dots = $$('#galleryDots .gallery-dot');
    const thumbs = $$('#galleryThumbs .gallery-thumb');
    const prev = $('#prevBtn');
    const next = $('#nextBtn');

    function slideCount() { return track.children.length; }
    function width() { return track.clientWidth; }

    function updateActive() {
      const idx = Math.round(track.scrollLeft / width());
      state.currentImage = idx;
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      thumbs.forEach((t, i) => t.classList.toggle('active', i === idx));
      if (prev) prev.disabled = idx === 0;
      if (next) next.disabled = idx === slideCount() - 1;
    }

    function scrollToSlide(i) {
      track.scrollTo({ left: i * width(), behavior: 'smooth' });
    }

    track.addEventListener('scroll', () => {
      clearTimeout(track._t);
      track._t = setTimeout(updateActive, 60);
    });
    dots.forEach((d, i) => d.addEventListener('click', () => scrollToSlide(i)));
    thumbs.forEach((t, i) => t.addEventListener('click', () => scrollToSlide(i)));
    prev?.addEventListener('click', () => scrollToSlide(Math.max(0, state.currentImage - 1)));
    next?.addEventListener('click', () => scrollToSlide(Math.min(slideCount() - 1, state.currentImage + 1)));

    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') scrollToSlide(Math.max(0, state.currentImage - 1));
      if (e.key === 'ArrowRight') scrollToSlide(Math.min(slideCount() - 1, state.currentImage + 1));
    });
    updateActive();
  }

  function addToCart() {
    const p = state.product;
    const size = state.size || 'Unique';
    const key = p.id + '::' + size;
    const existing = state.cart.find(i => i.key === key);
    if (existing) {
      existing.qty = Math.min(existing.qty + state.qty, p.stock || 99);
    } else {
      state.cart.push({
        key, id: p.id, name: p.name, team: p.team, price: p.price,
        image: firstImage(p), size, qty: state.qty, maxStock: p.stock || 99
      });
    }
    saveCart();
  }

  function renderRelated() {
    const p = state.product;
    const related = state.products
      .filter(x => x.id !== p.id && (!p.team || x.team === p.team))
      .slice(0, 4);
    const pool = related.length >= 3
      ? related
      : state.products.filter(x => x.id !== p.id).slice(0, 4);
    if (pool.length === 0) return;
    $('#relatedContainer').innerHTML = `
      <section class="related">
        <div class="section-head"><h2>Ces maillots pourraient te plaire</h2></div>
        <div class="grid">
          ${pool.map(pp => {
            const outOfStock = (pp.stock || 0) <= 0;
            const img = firstImage(pp);
            return `
              <article class="card" data-id="${pp.id}">
                <div class="card-img-wrap">
                  ${img ? `<img src="${escapeHtml(img)}" alt="">` : '<div class="card-img-placeholder">👕</div>'}
                  ${outOfStock ? '<span class="card-badge-stock out">Épuisé</span>' : ''}
                </div>
                <div class="card-body">
                  ${pp.team ? `<div class="card-team">${escapeHtml(pp.team)}</div>` : ''}
                  <h3 class="card-name">${escapeHtml(pp.name)}</h3>
                  <div class="card-foot">
                    <div class="card-price">${eur(pp.price)}</div>
                    <button class="btn-add" ${outOfStock ? 'disabled' : ''}>Voir</button>
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
    $$('#relatedContainer .card').forEach(card => {
      card.addEventListener('click', () => {
        location.href = '/produit?id=' + encodeURIComponent(card.dataset.id);
      });
    });
  }

  // Cart / checkout (shared behavior)
  function renderCartCount() {
    const total = state.cart.reduce((s, i) => s + i.qty, 0);
    $('#cartCount').textContent = total;
  }

  function openCart() {
    renderCart();
    openModal('cartModal');
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

  $('#cartBtn').addEventListener('click', openCart);

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
  loadAll();
})();
