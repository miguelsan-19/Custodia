'use strict';

(function () {
  const state = {
    token: localStorage.getItem('token') || '',
    persons: [],
    movements: [],
    cards: [],
    purchases: [],
    balances: {},
    currency: 'S/',
    view: 'resumen',
    filterPerson: 'all',
    filterType: 'all',
    filterSearch: '',
    purchaseFilter: 'all',
    editingId: null,
    editingCardId: null,
    editingPurchaseId: null
  };

  const $ = (sel) => document.querySelector(sel);
  const els = {};
  let toastTimer = null;

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtMoney(cents) {
    const n = (Number(cents) || 0) / 100;
    const sign = n < 0 ? '-' : '';
    const s = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
    return sign + state.currency + ' ' + s;
  }

  function fmtDate(dateStr) {
    const parts = String(dateStr || '').split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function today() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function personName(id) {
    const p = state.persons.find(x => x.id === id);
    return p ? p.name : '(desconocido)';
  }

  async function api(method, url, body) {
    const headers = {};
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* vacío */ }
    if (!res.ok) throw new Error(data.error || 'Error inesperado del servidor.');
    return data;
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
  }

  function showError(el, msg) {
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  async function loadState() {
    const data = await api('GET', '/api/state');
    state.persons = data.persons || [];
    state.movements = data.movements || [];
    state.cards = data.cards || [];
    state.purchases = data.purchases || [];
    state.balances = data.balances || {};
    state.currency = data.currency || state.currency;
  }

  function renderAll() {
    renderSummary();
    renderMovementFilters();
    renderMovements();
    renderPersons();
    renderCards();
    renderPurchases();
    els['total-display'].textContent = fmtMoney(state.movements.reduce((acc, m) => {
      if (m.type === 'ingreso') return acc + m.amount;
      if (m.type === 'egreso') return acc - m.amount;
      return acc;
    }, 0));
  }

  function movementsOfPerson(id) {
    return state.movements.filter(m => m.personId === id || m.toPersonId === id).length;
  }

  function sortedMovements() {
    return state.movements.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || '') > (b.createdAt || '') ? -1 : 1;
    });
  }

  /* ---------------- Resumen ---------------- */

  function renderSummary() {
    els['card-total'].textContent = fmtMoney(Object.values(state.balances).reduce((a, b) => a + b, 0));
    els['card-persons'].textContent = state.persons.length;
    els['card-movements'].textContent = state.movements.length;

    const sorted = state.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const list = els['resumen-list'];

    if (!sorted.length) {
      list.innerHTML = '<div class="empty">Aún no tienes personas registradas. Ve a la pestaña "Personas" para agregar la primera.</div>';
      return;
    }

    list.innerHTML = sorted.map(p => {
      const bal = state.balances[p.id] || 0;
      const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : '';
      return '<div class="row clickable" data-person="' + p.id + '">' +
        '<div class="avatar">' + escapeHtml(initials(p.name)) + '</div>' +
        '<div class="body"><div class="name">' + escapeHtml(p.name) + '</div></div>' +
        '<span class="demo-count badge">' + movementsOfPerson(p.id) + ' mov.</span>' +
        '<div class="amount ' + cls + '">' + fmtMoney(bal) + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- Movimientos ---------------- */

  function renderMovementFilters() {
    const sel = els['filter-person'];
    const current = state.filterPerson;
    sel.innerHTML = '<option value="all">Todas las personas</option>' +
      state.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map(p => '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('');
    sel.value = current;
  }

  function filteredMovements() {
    let list = sortedMovements();
    if (state.filterPerson !== 'all') {
      list = list.filter(m => m.personId === state.filterPerson || m.toPersonId === state.filterPerson);
    }
    if (state.filterType !== 'all') {
      list = list.filter(m => m.type === state.filterType);
    }
    const q = state.filterSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(m => String(m.note || '').toLowerCase().includes(q));
    }
    return list;
  }

  function movementRow(m) {
    const badges = {
      ingreso: '<span class="badge ingreso">Ingreso</span>',
      egreso: '<span class="badge egreso">Egreso</span>',
      transferencia: '<span class="badge transferencia">Transferencia</span>'
    };
    const badge = badges[m.type] || '';

    let title, amountHtml;
    if (m.type === 'transferencia') {
      title = personName(m.personId) + ' \u2192 ' + personName(m.toPersonId);
      amountHtml = '<div class="amount neutral">' + fmtMoney(m.amount) + '</div>';
    } else {
      title = personName(m.personId);
      const cls = m.type === 'ingreso' ? 'pos' : 'neg';
      const sign = m.type === 'ingreso' ? '+' : '-';
      amountHtml = '<div class="amount ' + cls + '">' + sign + fmtMoney(m.amount) + '</div>';
    }

    const note = m.note ? '<div class="note">' + escapeHtml(m.note) + '</div>' : '';

    return '<div class="row">' +
      '<div class="avatar" style="background:var(--primary)">' + escapeHtml(initials(title)) + '</div>' +
      '<div class="body"><div class="name">' + escapeHtml(title) + '</div>' + note + '</div>' +
      badge +
      '<div class="date">' + fmtDate(m.date) + '</div>' +
      amountHtml +
      '<div class="actions">' +
      '<button class="btn small" data-edit-movement="' + m.id + '">Editar</button>' +
      '<button class="btn small danger" data-del-movement="' + m.id + '">Eliminar</button>' +
      '</div>' +
      '</div>';
  }

  function renderMovements() {
    const list = filteredMovements();
    els['movements-count'].textContent = list.length
      ? list.length + (list.length === 1 ? ' movimiento' : ' movimientos')
      : '';
    els['movimientos-list'].innerHTML = list.length
      ? list.map(movementRow).join('')
      : '<div class="empty">No hay movimientos con los filtros seleccionados.</div>';
  }

  /* ---------------- Personas ---------------- */

  function renderPersons() {
    const sorted = state.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const list = els['personas-list'];
    if (!sorted.length) {
      list.innerHTML = '<div class="empty">No hay personas registradas.</div>';
      return;
    }
    list.innerHTML = sorted.map(p => {
      const bal = state.balances[p.id] || 0;
      const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : '';
      const hasMoves = movementsOfPerson(p.id) > 0;
      return '<div class="row">' +
        '<div class="avatar">' + escapeHtml(initials(p.name)) + '</div>' +
        '<div class="body"><div class="name">' + escapeHtml(p.name) + '</div>' +
        '<div class="note">' + movementsOfPerson(p.id) + ' movimientos</div></div>' +
        '<div class="amount ' + cls + '">' + fmtMoney(bal) + '</div>' +
        '<div class="actions">' +
        '<button class="btn small" data-edit-person="' + p.id + '">Renombrar</button>' +
        (hasMoves ? '' : '<button class="btn small danger" data-del-person="' + p.id + '">Eliminar</button>') +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------------- Tarjetas y compras ---------------- */

  function cardName(id) {
    const c = state.cards.find(x => x.id === id);
    return c ? c.name : '(tarjeta eliminada)';
  }

  function remainingOfPurchase(p) {
    return Math.round((p.amount * (p.installments - p.paidInstallments)) / p.installments);
  }

  function cardTotals(cardId) {
    let total = 0;
    let pending = 0;
    for (const p of state.purchases.filter(x => x.cardId === cardId)) {
      total += p.amount;
      pending += remainingOfPurchase(p);
    }
    return { total, pending };
  }

  function renderCards() {
    const sorted = state.cards.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const list = els['cards-list'];
    if (!sorted.length) {
      list.innerHTML = '<div class="empty">Registra tu primera tarjeta de crédito.</div>';
    } else {
      list.innerHTML = sorted.map(c => {
        const t = cardTotals(c.id);
        const meta = [c.last4 ? '•••• ' + c.last4 : '',
          c.creditLimit ? 'Límite ' + fmtMoney(c.creditLimit) : '']
          .filter(Boolean).join(' · ');
        return '<div class="row">' +
          '<div class="avatar" style="background:#6d28d9">' + escapeHtml(initials(c.name)) + '</div>' +
          '<div class="body"><div class="name">' + escapeHtml(c.name) + '</div>' +
          (meta ? '<div class="note">' + escapeHtml(meta) + '</div>' : '') + '</div>' +
          '<div class="amount pos">' + fmtMoney(t.pending) + '</div>' +
          '<div class="actions">' +
          '<button class="btn small" data-edit-card="' + c.id + '">Editar</button>' +
          '<button class="btn small danger" data-del-card="' + c.id + '">Eliminar</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }
  }

  function populatePurchaseSelects() {
    const sorted = state.cards.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    els['pc-card'].innerHTML = sorted.map(c =>
      '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
    els['purchase-card-filter'].innerHTML = '<option value="all">Todas las tarjetas</option>' +
      sorted.map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
  }

  function filteredPurchases() {
    const list = state.purchases.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || '') > (b.createdAt || '') ? -1 : 1;
    });
    if (state.purchaseFilter !== 'all') {
      return list.filter(p => p.cardId === state.purchaseFilter);
    }
    return list;
  }

  function purchaseRow(p) {
    const badge = p.installments > 1
      ? '<span class="badge cuotas">Cuota ' + Math.min(p.paidInstallments + 1, p.installments) + '/' + p.installments + '</span>'
      : '<span class="badge contado">Contado</span>';
    let pendHtml = '';
    if (p.installments > 1) {
      const rem = remainingOfPurchase(p);
      pendHtml = rem > 0
        ? '<div class="amount neutral">Pend. ' + fmtMoney(rem) + '</div>'
        : '<div class="amount pos">Pagado</div>';
    }
    let payBtn = '';
    if (p.installments > 1 && p.paidInstallments < p.installments) {
      const next = p.paidInstallments + 1;
      const cuota = Math.round(p.amount / p.installments);
      payBtn = '<button class="btn small" data-pay-installment="' + p.id + '" title="Marcar como pagada la cuota ' +
        next + ' de ' + p.installments + ' (' + fmtMoney(cuota) + ')">Pagar cuota</button>';
    }
    const note = p.note ? '<div class="note">' + escapeHtml(p.note) + '</div>' : '';

    return '<div class="row">' +
      '<div class="avatar" style="background:#0e7490">' + escapeHtml(initials(p.concept)) + '</div>' +
      '<div class="body"><div class="name">' + escapeHtml(p.concept) + '</div>' +
      '<div class="note">' + escapeHtml(cardName(p.cardId)) + '</div>' + note + '</div>' +
      badge +
      '<div class="date">' + fmtDate(p.date) + '</div>' +
      '<div class="amount neg">' + fmtMoney(p.amount) + '</div>' +
      pendHtml +
      '<div class="actions">' + payBtn +
      '<button class="btn small pay" data-pay-purchase="' + p.id + '">Pagar</button>' +
      '<button class="btn small" data-edit-purchase="' + p.id + '">Editar</button>' +
      '<button class="btn small danger" data-del-purchase="' + p.id + '">Eliminar</button>' +
      '</div>' +
      '</div>';
  }

  function renderPurchases() {
    populatePurchaseSelects();
    els['purchase-card-filter'].value = state.purchaseFilter;
    const list = filteredPurchases();
    els['purchases-count'].textContent = list.length
      ? list.length + (list.length === 1 ? ' compra' : ' compras')
      : '';
    els['purchases-list'].innerHTML = list.length
      ? list.map(purchaseRow).join('')
      : '<div class="empty">No hay compras registradas con este filtro.</div>';

    const debt = state.purchases.reduce((a, p) => a + p.amount, 0);
    const pending = state.purchases.reduce((a, p) => a + remainingOfPurchase(p), 0);
    els['card-total-debt'].textContent = fmtMoney(debt);
    els['card-count'].textContent = state.cards.length;
    els['card-pending'].textContent = fmtMoney(pending);
  }

  function openPurchaseModal(editId) {
    state.editingPurchaseId = editId || null;
    els['purchase-modal-title'].textContent = editId ? 'Editar compra' : 'Nueva compra';
    populatePurchaseSelects();
    const p = editId ? state.purchases.find(x => x.id === editId) : null;
    els['pc-card'].value = p ? p.cardId : (state.cards[0] ? state.cards[0].id : '');
    els['pc-date'].value = p ? p.date : today();
    els['pc-concept'].value = p ? p.concept : '';
    els['pc-amount'].value = p ? (p.amount / 100).toFixed(2) : '';
    els['pc-installments'].value = p ? p.installments : 1;
    els['pc-note'].value = p ? p.note : '';
    showError(els['pc-error'], null);
    updatePurchaseHint();
    els['modal-purchase'].classList.remove('hidden');
  }

  function updatePurchaseHint() {
    const n = Number(els['pc-installments'].value) || 1;
    const amt = Math.round((Number(els['pc-amount'].value.replace(',', '.')) || 0) * 100);
    if (n > 1 && amt > 0) {
      els['pc-hint'].textContent = 'Cuota mensual aprox. de ' + fmtMoney(Math.round(amt / n)) +
        ' durante ' + n + (n === 1 ? ' mes' : ' meses');
    } else {
      els['pc-hint'].textContent = '';
    }
  }

  async function savePurchase(e) {
    e.preventDefault();
    const amount = Math.round((Number(els['pc-amount'].value.replace(',', '.')) || 0) * 100);
    const body = {
      cardId: els['pc-card'].value,
      date: els['pc-date'].value,
      concept: els['pc-concept'].value,
      amount,
      installments: Number(els['pc-installments'].value) || 1,
      paidInstallments: 0,
      note: els['pc-note'].value
    };
    try {
      if (state.editingPurchaseId) {
        const prev = state.purchases.find(x => x.id === state.editingPurchaseId);
        if (prev) body.paidInstallments = prev.paidInstallments;
        await api('PUT', '/api/card-purchases/' + state.editingPurchaseId, body);
        toast('Compra actualizada.');
      } else {
        await api('POST', '/api/card-purchases', body);
        toast('Compra registrada.');
      }
      closePurchaseModal();
      await loadState();
      renderAll();
    } catch (err) {
      showError(els['pc-error'], err.message);
    }
  }

  function closePurchaseModal() {
    els['modal-purchase'].classList.add('hidden');
  }

  function openCardEdit(id) {
    const c = state.cards.find(x => x.id === id);
    if (!c) return;
    state.editingCardId = id;
    els['card-name'].value = c.name;
    els['card-last4'].value = c.last4 || '';
    els['card-limit'].value = c.creditLimit ? (c.creditLimit / 100).toFixed(2) : '';
    els['card-submit'].textContent = 'Guardar';
    els['card-cancel'].classList.remove('hidden');
    els['card-name'].focus();
  }

  function resetCardForm() {
    state.editingCardId = null;
    els['card-name'].value = '';
    els['card-last4'].value = '';
    els['card-limit'].value = '';
    els['card-submit'].textContent = 'Agregar';
    els['card-cancel'].classList.add('hidden');
  }

  async function saveCard(e) {
    e.preventDefault();
    const body = {
      name: els['card-name'].value,
      last4: els['card-last4'].value,
      creditLimit: els['card-limit'].value === ''
        ? null
        : Math.round((Number(els['card-limit'].value.replace(',', '.')) || 0) * 100)
    };
    try {
      if (state.editingCardId) {
        await api('PATCH', '/api/cards/' + state.editingCardId, body);
        toast('Tarjeta actualizada.');
      } else {
        await api('POST', '/api/cards', body);
        toast('Tarjeta agregada.');
      }
      resetCardForm();
      await loadState();
      renderAll();
    } catch (err) {
      toast(err.message);
    }
  }

  /* ---------------- Modal de movimiento ---------------- */

  function fillPersonSelects() {
    const sorted = state.persons.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const opts = (excludeId) => sorted
      .filter(p => p.id !== excludeId)
      .map(p => {
        const bal = state.balances[p.id] || 0;
        return '<option value="' + p.id + '">' + escapeHtml(p.name) + ' (' + fmtMoney(bal) + ')</option>';
      })
      .join('');
    els['mv-from'].innerHTML = opts(null);
    els['mv-to'].innerHTML = opts(els['mv-from'].value);
  }

  function openMovementModal(editId) {
    state.editingId = editId || null;
    els['movement-modal-title'].textContent = editId ? 'Editar movimiento' : 'Nuevo movimiento';
    fillPersonSelects();

    if (editId) {
      const m = state.movements.find(x => x.id === editId);
      if (!m) return;
      els['mv-type'].value = m.type;
      els['mv-from'].value = m.personId;
      els['mv-to'].value = m.toPersonId || state.persons.find(p => p.id !== m.personId).id;
      els['mv-date'].value = m.date;
      els['mv-amount'].value = (m.amount / 100).toFixed(2);
      els['mv-note'].value = m.note || '';
    } else {
      els['mv-type'].value = 'ingreso';
      els['mv-from'].value = state.persons[0] ? state.persons[0].id : '';
      els['mv-date'].value = today();
      els['mv-amount'].value = '';
      els['mv-note'].value = '';
    }
    updateTypeFields();
    els['modal-movement'].classList.remove('hidden');
  }

  function updateTypeFields() {
    const isTransfer = els['mv-type'].value === 'transferencia';
    els['field-to'].classList.toggle('hidden', !isTransfer);
    els['label-from'].textContent = isTransfer ? 'De' : 'Persona';
    els['mv-person-fields'].classList.toggle('double', isTransfer);
    if (isTransfer) {
      els['mv-to'].innerHTML = state.persons.filter(p => p.id !== els['mv-from'].value).map(p =>
        '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>').join('');
    }
  }

  async function saveMovement(e) {
    e.preventDefault();
    const amount = Math.round((Number(els['mv-amount'].value.replace(',', '.')) || 0) * 100);
    const personId = els['mv-from'].value;
    const type = els['mv-type'].value;
    const body = {
      type,
      personId,
      toPersonId: type === 'transferencia' ? els['mv-to'].value : null,
      amount,
      date: els['mv-date'].value,
      note: els['mv-note'].value
    };
    try {
      if (state.editingId) {
        await api('PUT', '/api/movements/' + state.editingId, body);
        toast('Movimiento actualizado.');
      } else {
        await api('POST', '/api/movements', body);
        toast('Movimiento registrado.');
      }
      closeModal();
      await loadState();
      renderAll();
    } catch (err) {
      showError(els['mv-error'], err.message);
    }
  }

  /* ---------------- Acciones ---------------- */

  function cacheEls() {
    const ids = ['auth-screen', 'auth-msg', 'auth-form', 'auth-password', 'auth-currency', 'auth-btn',
      'setup-fields', 'auth-error', 'app-screen', 'total-display',
      'btn-new-movement', 'btn-logout', 'resumen-list', 'card-total', 'card-persons', 'card-movements',
      'filter-person', 'filter-type', 'filter-search', 'movements-count', 'movimientos-list',
      'person-form', 'person-name', 'personas-list',
      'card-form', 'card-name', 'card-last4', 'card-limit', 'card-submit', 'card-cancel',
      'cards-list', 'btn-new-purchase', 'purchase-card-filter', 'purchases-count', 'purchases-list',
      'card-total-debt', 'card-count', 'card-pending',
      'modal-movement', 'movement-modal-title', 'movement-form', 'mv-type', 'mv-from', 'mv-to',
      'mv-date', 'mv-amount', 'mv-note', 'mv-error', 'field-to', 'label-from', 'mv-person-fields',
      'modal-purchase', 'purchase-modal-title', 'purchase-form', 'pc-card', 'pc-date', 'pc-concept',
      'pc-amount', 'pc-installments', 'pc-note', 'pc-hint', 'pc-error',
      'toast'];
    ids.forEach(id => { els[id] = document.getElementById(id); });
  }

  async function handleAuth(e) {
    e.preventDefault();
    showError(els['auth-error'], null);
    const password = els['auth-password'].value;
    els['auth-btn'].disabled = true;
    try {
      const status = await api('GET', '/api/status');
      let res;
      if (!status.setup) {
        res = await api('POST', '/api/setup', { password, currency: els['auth-currency'].value });
        toast('Aplicación configurada. ¡Bienvenido!');
      } else {
        res = await api('POST', '/api/login', { password });
      }
      state.token = res.token;
      localStorage.setItem('token', state.token);
      await loadState();
      showApp();
    } catch (err) {
      showError(els['auth-error'], err.message);
    } finally {
      els['auth-btn'].disabled = false;
    }
  }

  function showApp() {
    els['auth-screen'].classList.add('hidden');
    els['app-screen'].classList.remove('hidden');
    renderAll();
  }

  async function showAuth() {
    els['app-screen'].classList.add('hidden');
    els['auth-screen'].classList.remove('hidden');
    els['auth-password'].value = '';
    showError(els['auth-error'], null);
    try {
      const status = await api('GET', '/api/status');
      els['setup-fields'].classList.toggle('hidden', status.setup);
      els['auth-msg'].textContent = status.setup
        ? 'Ingresa tu contraseña para continuar.'
        : 'Primera vez: crea una contraseña y define el símbolo de tu moneda.';
      els['auth-btn'].textContent = status.setup ? 'Ingresar' : 'Crear y entrar';
    } catch (err) {
      showError(els['auth-error'], 'No se pudo conectar con el servidor. Revisa que esté iniciado.');
    }
  }

  function closeModal() {
    els['modal-movement'].classList.add('hidden');
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });
    ['resumen', 'movimientos', 'personas', 'tarjetas'].forEach(v => {
      $('#view-' + v).classList.toggle('hidden', v !== view);
    });
  }

  function bind() {
    cacheEls();

    els['auth-form'].addEventListener('submit', handleAuth);

    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchView(t.dataset.view));
    });

    els['btn-new-movement'].addEventListener('click', () => openMovementModal(null));
    els['btn-logout'].addEventListener('click', async () => {
      try {
        await api('POST', '/api/logout');
      } catch (e) { /* si falla igual se limpia localmente */ }
      state.token = '';
      localStorage.removeItem('token');
      showAuth();
    });

    els['person-form'].addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = els['person-name'].value.trim();
      if (!name) return;
      try {
        await api('POST', '/api/persons', { name });
        els['person-name'].value = '';
        els['person-name'].focus();
        await loadState();
        renderAll();
        toast('Persona agregada.');
      } catch (err) {
        toast(err.message);
      }
    });

    els['movement-form'].addEventListener('submit', saveMovement);
    els['mv-type'].addEventListener('change', updateTypeFields);
    els['mv-from'].addEventListener('change', updateTypeFields);

    els['card-form'].addEventListener('submit', saveCard);
    els['card-cancel'].addEventListener('click', resetCardForm);
    els['btn-new-purchase'].addEventListener('click', () => openPurchaseModal(null));
    els['purchase-form'].addEventListener('submit', savePurchase);
    els['pc-installments'].addEventListener('input', updatePurchaseHint);
    els['pc-amount'].addEventListener('input', updatePurchaseHint);
    els['purchase-card-filter'].addEventListener('change', () => {
      state.purchaseFilter = els['purchase-card-filter'].value;
      renderPurchases();
    });
    document.querySelectorAll('[data-close="purchase-modal"]').forEach(el => {
      el.addEventListener('click', closePurchaseModal);
    });

    document.querySelectorAll('[data-close="modal"], .modal-backdrop').forEach(el => {
      el.addEventListener('click', closeModal);
    });

    els['filter-person'].addEventListener('change', () => { state.filterPerson = els['filter-person'].value; renderMovements(); });
    els['filter-type'].addEventListener('change', () => { state.filterType = els['filter-type'].value; renderMovements(); });
    els['filter-search'].addEventListener('input', () => { state.filterSearch = els['filter-search'].value; renderMovements(); });

    document.addEventListener('click', async (e) => {
      const personRow = e.target.closest('[data-person]');
      if (personRow) {
        const id = personRow.dataset.person;
        state.filterPerson = id;
        els['filter-person'].value = id;
        switchView('movimientos');
        renderMovements();
        return;
      }

      const editMov = e.target.closest('[data-edit-movement]');
      if (editMov) { openMovementModal(editMov.dataset.editMovement); return; }

      const delMov = e.target.closest('[data-del-movement]');
      if (delMov) {
        if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;
        try {
          await api('DELETE', '/api/movements/' + delMov.dataset.delMovement);
          await loadState();
          renderAll();
          toast('Movimiento eliminado.');
        } catch (err) { toast(err.message); }
        return;
      }

      const editPerson = e.target.closest('[data-edit-person]');
      if (editPerson) {
        const id = editPerson.dataset.editPerson;
        const p = state.persons.find(x => x.id === id);
        const name = prompt('Nuevo nombre para ' + p.name + ':', p.name);
        if (name === null) return;
        try {
          await api('PATCH', '/api/persons/' + id, { name });
          await loadState();
          renderAll();
          toast('Nombre actualizado.');
        } catch (err) { toast(err.message); }
        return;
      }

      const delPerson = e.target.closest('[data-del-person]');
      if (delPerson) {
        if (!confirm('¿Eliminar esta persona?')) return;
        try {
          await api('DELETE', '/api/persons/' + delPerson.dataset.delPerson);
          await loadState();
          renderAll();
          toast('Persona eliminada.');
        } catch (err) { toast(err.message); }
        return;
      }

      const editCard = e.target.closest('[data-edit-card]');
      if (editCard) { openCardEdit(editCard.dataset.editCard); return; }

      const delCard = e.target.closest('[data-del-card]');
      if (delCard) {
        if (!confirm('¿Eliminar esta tarjeta? No se eliminarán las compras si ya tiene registros.')) return;
        try {
          await api('DELETE', '/api/cards/' + delCard.dataset.delCard);
          if (state.purchaseFilter === delCard.dataset.delCard) state.purchaseFilter = 'all';
          await loadState();
          renderAll();
          toast('Tarjeta eliminada.');
        } catch (err) { toast(err.message); }
        return;
      }

      const payInst = e.target.closest('[data-pay-installment]');
      if (payInst) {
        const id = payInst.dataset.payInstallment;
        const p = state.purchases.find(x => x.id === id);
        if (!p || p.paidInstallments >= p.installments) return;
        try {
          await api('PUT', '/api/card-purchases/' + id, {
            cardId: p.cardId,
            date: p.date,
            concept: p.concept,
            amount: p.amount,
            installments: p.installments,
            paidInstallments: p.paidInstallments + 1,
            note: p.note
          });
          await loadState();
          renderAll();
          toast('Cuota registrada como pagada.');
        } catch (err) { toast(err.message); }
        return;
      }

      const payPurchase = e.target.closest('[data-pay-purchase]');
      if (payPurchase) {
        const id = payPurchase.dataset.payPurchase;
        const p = state.purchases.find(x => x.id === id);
        const remaining = p ? remainingOfPurchase(p) : 0;
        const msg = (p && p.installments > 1 && remaining > 0)
          ? 'Esta compra aún tiene pendiente ' + fmtMoney(remaining) +
            ' en cuotas. ¿Confirmas que la pagas por completo y la eliminas del registro?'
          : '¿Registrar esta compra como pagada y eliminar el registro?';
        if (!confirm(msg)) return;
        try {
          await api('DELETE', '/api/card-purchases/' + id);
          await loadState();
          renderAll();
          toast('Compra pagada y eliminada del registro.');
        } catch (err) { toast(err.message); }
        return;
      }

      const editPurchase = e.target.closest('[data-edit-purchase]');
      if (editPurchase) { openPurchaseModal(editPurchase.dataset.editPurchase); return; }

      const delPurchase = e.target.closest('[data-del-purchase]');
      if (delPurchase) {
        if (!confirm('¿Eliminar esta compra? Esta acción no se puede deshacer.')) return;
        try {
          await api('DELETE', '/api/card-purchases/' + delPurchase.dataset.delPurchase);
          await loadState();
          renderAll();
          toast('Compra eliminada.');
        } catch (err) { toast(err.message); }
        return;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(); closePurchaseModal(); }
    });
  }

  async function init() {
    bind();
    if (state.token) {
      try {
        await loadState();
        showApp();
        return;
      } catch (err) {
        state.token = '';
        localStorage.removeItem('token');
      }
    }
    showAuth();
  }

  init();
})();