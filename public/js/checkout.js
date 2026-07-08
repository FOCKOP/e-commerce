// Shared checkout logic used by shop.js and produit.js.
// Expects the host page to create `window.Onze` with:
//   { getCart, clearCart, getSettings }

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function openModal(id) { $('#' + id)?.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(el) { el?.classList.remove('open'); document.body.style.overflow = ''; }

  let config = null;
  let paypalLoaded = false;

  async function loadConfig() {
    if (config) return config;
    try {
      const r = await fetch('/api/config');
      config = await r.json();
    } catch {
      config = { paypal: { enabled: false } };
    }
    return config;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chargement du SDK impossible'));
      document.head.appendChild(s);
    });
  }

  function validateForm() {
    const f = $('#checkoutForm');
    if (!f) return null;
    if (!f.reportValidity()) return null;
    return {
      name: f.name.value.trim(),
      contact: f.contact.value.trim(),
      address: f.address.value.trim(),
      note: f.note.value.trim()
    };
  }

  function buildPayload() {
    const info = validateForm();
    if (!info) return null;
    const cart = window.Onze.getCart();
    if (!cart.length) return null;
    return {
      customer: { name: info.name, contact: info.contact, address: info.address },
      items: cart.map(i => ({ id: i.id, size: i.size, qty: i.qty })),
      note: info.note
    };
  }

  async function payManual() {
    const payload = buildPayload();
    if (!payload) return;
    const btn = $('#payManualBtn');
    btn.disabled = true;
    btn.textContent = 'Envoi...';
    try {
      const r = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Envoi impossible');
      const data = await r.json();
      window.Onze.clearCart();
      $('#checkoutForm').reset();
      closeModal($('#checkoutModal'));
      showConfirmation(data.id, payload, 'manual');
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = manualBtnHtml();
    }
  }

  async function initPayPal() {
    if (paypalLoaded || !config.paypal.enabled) return;
    try {
      const clientId = encodeURIComponent(config.paypal.clientId);
      // enable-funding=card ensures the "Debit or Credit Card" button is available
      await loadScript(`https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR&intent=capture&enable-funding=card`);
    } catch (e) {
      console.error(e);
      const wrap = $('#paypal-buttons-wrap');
      if (wrap) wrap.innerHTML = '<div class="pay-note" style="color:var(--danger)">PayPal indisponible</div>';
      return;
    }
    paypalLoaded = true;
    let pendingOrderId = null;

    async function createOrder() {
      const payload = buildPayload();
      if (!payload) throw new Error('Formulaire incomplet');
      const r = await fetch('/api/pay/paypal/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'PayPal a refusé');
      }
      const { paypalOrderId, orderId } = await r.json();
      pendingOrderId = orderId;
      return paypalOrderId;
    }

    async function onApprove(data) {
      const r = await fetch('/api/pay/paypal/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId: data.orderID, orderId: pendingOrderId })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        toast(e.error || 'Paiement échoué');
        return;
      }
      const cart = window.Onze.getCart();
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const items = cart.map(i => ({
        name: i.name, size: i.size, price: i.price, qty: i.qty, team: i.team
      }));
      window.Onze.clearCart();
      $('#checkoutForm').reset();
      closeModal($('#checkoutModal'));
      showConfirmation(pendingOrderId, {
        items,
        total,
        customer: {
          name: $('#cName').value.trim(),
          contact: $('#cContact').value.trim()
        }
      }, 'paypal');
    }

    function onError(err) {
      console.error(err);
      toast('Erreur PayPal');
    }

    function onCancel() {
      toast('Paiement annulé');
    }

    // PayPal button (yellow — login flow)
    window.paypal.Buttons({
      style: { layout: 'horizontal', color: 'gold', shape: 'pill', label: 'paypal', tagline: false, height: 45 },
      createOrder,
      onApprove,
      onError,
      onCancel
    }).render('#paypal-button-container');

    // Card button (black — guest debit/credit card checkout via PayPal)
    if (window.paypal.FUNDING && window.paypal.FUNDING.CARD) {
      window.paypal.Buttons({
        fundingSource: window.paypal.FUNDING.CARD,
        style: { layout: 'horizontal', color: 'black', shape: 'pill', height: 45 },
        createOrder,
        onApprove,
        onError,
        onCancel
      }).render('#paypal-card-container');
    }
  }

  function manualBtnHtml() {
    return `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      Réserver et régler après contact
    `;
  }

  async function setupCheckout() {
    const cfg = await loadConfig();
    const paySection = $('#paySection');
    if (!paySection) return;

    if (cfg.paypal.enabled) {
      $('#paypal-buttons-wrap').style.display = '';
      initPayPal();
    }
    $('#payManualBtn').innerHTML = manualBtnHtml();
    $('#payManualBtn').addEventListener('click', payManual);

    if (!cfg.paypal.enabled) {
      $('#payMethodLabel').style.display = 'none';
      $('#payManualBtn').innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        Valider la commande
      `;
      $('#payManualBtn').classList.remove('manual');
      $('#payManualBtn').classList.add('primary-solid');
    }
  }

  function showConfirmation(id, payload, method) {
    $('#confirmId').textContent = '#' + id.slice(0, 6).toUpperCase();
    const isPaid = method === 'paypal';
    const title = $('#confirmTitle');
    const intro = $('#confirmIntro');
    if (title) title.textContent = isPaid ? 'Paiement confirmé !' : 'Commande envoyée !';
    if (intro) intro.textContent = isPaid
      ? 'Merci ! Le paiement est bien reçu, on prépare ton maillot.'
      : 'Nous avons bien reçu ta commande et on te recontacte pour finaliser.';

    const settings = window.Onze.getSettings() || {};
    const opts = $('#contactOptions');
    if (isPaid || !payload?.items?.length) {
      opts.innerHTML = '';
      return;
    }
    const lines = [
      `Bonjour, je viens de passer commande #${id.slice(0, 6).toUpperCase()} chez ${settings.shopName || 'Onze'}.`,
      '',
      ...payload.items.map(i => `• ${i.qty}× ${i.name} (${i.size}) — ${eur(i.price * i.qty)}`),
      '',
      `Total : ${eur(payload.total)}`,
      `Nom : ${payload.customer.name}`,
      `Contact : ${payload.customer.contact}`
    ];
    const msg = encodeURIComponent(lines.join('\n'));
    const buttons = [];
    if (settings.contactWhatsapp) {
      const num = settings.contactWhatsapp.replace(/\D/g, '');
      buttons.push(`<a class="btn btn-orange btn-block" style="margin-top:12px" href="https://wa.me/${num}?text=${msg}" target="_blank" rel="noopener">Contacter sur WhatsApp</a>`);
    }
    if (settings.contactEmail) {
      buttons.push(`<a class="btn btn-secondary btn-block" style="margin-top:8px" href="mailto:${encodeURIComponent(settings.contactEmail)}?subject=Commande&body=${msg}">Envoyer par email</a>`);
    }
    opts.innerHTML = buttons.join('');
  }

  window.OnzeCheckout = {
    setup: setupCheckout,
    showConfirmation
  };
})();
