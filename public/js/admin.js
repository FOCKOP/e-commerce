(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const state = {
    editingImages: [] // urls currently attached to the product being edited
  };

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

  async function checkSession() {
    const r = await fetch('/api/session');
    const { authenticated } = await r.json();
    if (authenticated) showAdmin(); else showLogin();
  }
  function showLogin() {
    $('#loginView').style.display = '';
    $('#adminView').style.display = 'none';
  }
  function showAdmin() {
    $('#loginView').style.display = 'none';
    $('#adminView').style.display = '';
    loadProducts();
    loadOrders();
    loadSettings();
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#loginError');
    err.style.display = 'none';
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: $('#password').value })
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        err.textContent = d.error || 'Connexion impossible';
        err.style.display = 'block';
        return;
      }
      showAdmin();
    } catch {
      err.textContent = 'Erreur réseau';
      err.style.display = 'block';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
    $('#password').value = '';
  });

  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      $$('.tab').forEach(x => x.classList.toggle('active', x === tab));
      $$('.tab-panel').forEach(p =>
        p.classList.toggle('active', p.dataset.panel === t)
      );
      if (t === 'orders') loadOrders();
    });
  });

  // Products
  let products = [];

  async function loadProducts() {
    const r = await fetch('/api/products');
    products = await r.json();
    renderProducts();
  }

  function renderProducts() {
    const grid = $('#adminGrid');
    grid.innerHTML = products.map(p => {
      const cover = (p.images && p.images[0]) || '';
      const imgCount = (p.images || []).length;
      return `
        <div class="admin-card" data-id="${p.id}">
          <div class="admin-thumb">
            ${cover ? `<img src="${escapeHtml(cover)}" alt="">` : '<div class="card-img-placeholder" style="font-size:24px">👕</div>'}
            ${imgCount > 1 ? `<span class="count">×${imgCount}</span>` : ''}
          </div>
          <div class="admin-info">
            <h4>${escapeHtml(p.name)}</h4>
            <div class="price">${eur(p.price)}</div>
            <div class="meta">${escapeHtml(p.team || '—')} · Stock : ${p.stock ?? 0}</div>
          </div>
          <div class="admin-actions">
            <button class="btn btn-secondary" data-edit="${p.id}">Modifier</button>
            <button class="btn btn-danger" data-del="${p.id}">Supprimer</button>
          </div>
        </div>
      `;
    }).join('');
    $('#adminEmpty').style.display = products.length === 0 ? 'block' : 'none';
    grid.style.display = products.length === 0 ? 'none' : '';
    grid.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => openProductModal(b.dataset.edit))
    );
    grid.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => deleteProduct(b.dataset.del))
    );
  }

  $('#newProductBtn').addEventListener('click', () => openProductModal(null));

  function openProductModal(id) {
    const form = $('#productForm');
    form.reset();
    state.editingImages = [];
    if (id) {
      const p = products.find(x => x.id === id);
      if (!p) return;
      $('#productModalTitle').textContent = 'Modifier le maillot';
      form.id.value = p.id;
      form.name.value = p.name;
      form.team.value = p.team || '';
      form.price.value = p.price;
      form.stock.value = p.stock ?? 0;
      form.sizes.value = (p.sizes || []).join(', ');
      form.description.value = p.description || '';
      state.editingImages = [...(p.images || [])];
    } else {
      $('#productModalTitle').textContent = 'Ajouter un maillot';
      form.id.value = '';
    }
    renderImagesGrid();
    openModal('productModal');
  }

  function renderImagesGrid() {
    const grid = $('#imagesGrid');
    const tiles = state.editingImages.map((url, i) => `
      <div class="image-tile" data-i="${i}">
        <img src="${escapeHtml(url)}" alt="">
        ${i === 0 ? '<span class="badge-cover">Couverture</span>' : ''}
        <div class="actions">
          ${i > 0 ? '<button type="button" data-act="left" title="Déplacer à gauche">←</button>' : ''}
          ${i < state.editingImages.length - 1 ? '<button type="button" data-act="right" title="Déplacer à droite">→</button>' : ''}
          <button type="button" data-act="del" class="del" title="Retirer">×</button>
        </div>
      </div>
    `).join('');
    const canAdd = state.editingImages.length < 8;
    const addTile = canAdd ? `
      <div class="upload-area" id="addImageTile">
        <div>
          <div style="font-size:28px;line-height:1">+</div>
          <div style="font-size:12px;margin-top:4px;font-weight:600">
            ${state.editingImages.length === 0 ? 'Ajouter des photos' : 'Ajouter'}
          </div>
        </div>
      </div>` : '';
    grid.innerHTML = tiles + addTile;

    grid.querySelectorAll('.image-tile').forEach(tile => {
      const i = Number(tile.dataset.i);
      tile.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', () => {
          const act = b.dataset.act;
          if (act === 'del') state.editingImages.splice(i, 1);
          if (act === 'left') [state.editingImages[i - 1], state.editingImages[i]] = [state.editingImages[i], state.editingImages[i - 1]];
          if (act === 'right') [state.editingImages[i + 1], state.editingImages[i]] = [state.editingImages[i], state.editingImages[i + 1]];
          renderImagesGrid();
        });
      });
    });

    const addTileEl = $('#addImageTile');
    if (addTileEl) {
      addTileEl.addEventListener('click', () => $('#uploadInput').click());
      addTileEl.addEventListener('dragover', e => { e.preventDefault(); addTileEl.style.background = 'var(--blue-100)'; });
      addTileEl.addEventListener('dragleave', () => { addTileEl.style.background = ''; });
      addTileEl.addEventListener('drop', e => {
        e.preventDefault();
        addTileEl.style.background = '';
        if (e.dataTransfer.files?.length) handleUpload(Array.from(e.dataTransfer.files));
      });
    }
  }

  $('#uploadInput').addEventListener('change', e => {
    if (e.target.files?.length) handleUpload(Array.from(e.target.files));
    e.target.value = '';
  });

  async function handleUpload(files) {
    const remaining = 8 - state.editingImages.length;
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) { toast('Maximum 8 photos'); return; }
    const form = new FormData();
    toUpload.forEach(f => form.append('images', f));
    toast('Téléchargement...');
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: form });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Échec du téléchargement');
      }
      const { urls } = await r.json();
      state.editingImages.push(...urls);
      renderImagesGrid();
      toast(urls.length > 1 ? `${urls.length} photos ajoutées` : 'Photo ajoutée');
    } catch (err) {
      toast(err.message);
    }
  }

  async function deleteProduct(id) {
    if (!confirm('Supprimer ce maillot ?')) return;
    const r = await fetch('/api/products/' + id, { method: 'DELETE' });
    if (!r.ok) { toast('Erreur'); return; }
    toast('Maillot supprimé');
    loadProducts();
  }

  $('#productForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const payload = {
      name: form.name.value.trim(),
      team: form.team.value.trim(),
      price: Number(form.price.value),
      stock: Number(form.stock.value),
      sizes: form.sizes.value.split(',').map(s => s.trim()).filter(Boolean),
      description: form.description.value.trim(),
      images: state.editingImages
    };
    const id = form.id.value;
    try {
      const r = await fetch('/api/products' + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Enregistrement impossible');
      closeModal($('#productModal'));
      toast(id ? 'Maillot mis à jour' : 'Maillot ajouté');
      loadProducts();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // Orders
  async function loadOrders() {
    const r = await fetch('/api/orders');
    if (!r.ok) return;
    const orders = await r.json();
    const nouvelles = orders.filter(o => o.status === 'nouvelle').length;
    const badge = $('#ordersBadge');
    if (nouvelles > 0) { badge.textContent = nouvelles; badge.style.display = 'inline-block'; }
    else badge.style.display = 'none';
    const list = $('#ordersList');
    list.innerHTML = orders.map(o => `
      <div class="order-item" data-id="${o.id}">
        <div class="order-head">
          <div>
            <div class="order-customer">${escapeHtml(o.customer.name)}</div>
            <div class="order-date">
              #${o.id.slice(0, 6).toUpperCase()} · ${new Date(o.createdAt).toLocaleString('fr-FR')}
            </div>
          </div>
          <span class="order-status status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
        </div>
        <ul class="order-items">
          ${o.items.map(i => `<li>${i.qty}× <strong>${escapeHtml(i.name)}</strong> (${escapeHtml(i.size)}) — ${eur(i.price * i.qty)}</li>`).join('')}
        </ul>
        <div style="margin-bottom:8px"><strong>Total :</strong> ${eur(o.total)}</div>
        <div style="font-size:13px;margin-bottom:10px">
          <div><strong>Contact :</strong> ${escapeHtml(o.customer.contact)}</div>
          <div><strong>Adresse :</strong> ${escapeHtml(o.customer.address || '—')}</div>
          ${o.note ? `<div><strong>Message :</strong> ${escapeHtml(o.note)}</div>` : ''}
        </div>
        <div class="order-actions">
          <select data-status="${o.id}">
            <option value="nouvelle" ${o.status === 'nouvelle' ? 'selected' : ''}>Nouvelle</option>
            <option value="traitee" ${o.status === 'traitee' ? 'selected' : ''}>Traitée</option>
            <option value="annulee" ${o.status === 'annulee' ? 'selected' : ''}>Annulée</option>
          </select>
          <button class="btn btn-danger" data-del-order="${o.id}">Supprimer</button>
        </div>
      </div>
    `).join('');
    $('#ordersEmpty').style.display = orders.length === 0 ? 'block' : 'none';
    list.style.display = orders.length === 0 ? 'none' : '';

    list.querySelectorAll('[data-status]').forEach(sel =>
      sel.addEventListener('change', async () => {
        const r = await fetch('/api/orders/' + sel.dataset.status, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sel.value })
        });
        if (r.ok) { toast('Statut mis à jour'); loadOrders(); }
      })
    );
    list.querySelectorAll('[data-del-order]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('Supprimer cette commande ?')) return;
        const r = await fetch('/api/orders/' + b.dataset.delOrder, { method: 'DELETE' });
        if (r.ok) { toast('Commande supprimée'); loadOrders(); }
      })
    );
  }

  // Settings
  async function loadSettings() {
    const r = await fetch('/api/settings');
    const s = await r.json();
    const f = $('#settingsForm');
    f.shopName.value = s.shopName || '';
    f.tagline.value = s.tagline || '';
    f.contactWhatsapp.value = s.contactWhatsapp || '';
    f.contactEmail.value = s.contactEmail || '';
  }

  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      shopName: f.shopName.value.trim(),
      tagline: f.tagline.value.trim(),
      contactWhatsapp: f.contactWhatsapp.value.trim(),
      contactEmail: f.contactEmail.value.trim()
    };
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.ok) toast('Paramètres enregistrés');
    else toast('Erreur');
  });

  checkSession();
})();
