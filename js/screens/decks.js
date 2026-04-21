import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const MAX_COPIES = 4;
const MAIN_MIN   = 60;
const SIDE_MAX   = 15;
const FORMATS    = ['standard','pioneer','modern','legacy','commander','custom'];

// ── Module State ──────────────────────────────────────────────────────────────
let view         = 'list'; // 'list' | 'edit'
let currentDeck  = null;
let currentZone  = 'mainboard';
let invFilter    = '';
let statsOpen    = false;

// ── Root container reference ──────────────────────────────────────────────────
function root() { return document.getElementById('decks'); }

// ── Helpers ───────────────────────────────────────────────────────────────────
const isBasicLand  = c  => BASIC_LANDS.some(b => c.name?.startsWith(b));
const ownedCount   = uuid => (state.inventory.find(i => i.uuid === uuid)?.count) ?? 0;
const totalInDeck  = name => !currentDeck ? 0 :
    [...currentDeck.mainboard, ...currentDeck.sideboard]
        .filter(e => e.name === name).reduce((s, e) => s + e.quantity, 0);

function getTypeGroup(type = '') {
    const t = type.toLowerCase();
    if (t.includes('creature'))     return 'Criatura';
    if (t.includes('instant'))      return 'Instantáneo';
    if (t.includes('sorcery'))      return 'Conjuro';
    if (t.includes('enchantment'))  return 'Encantamiento';
    if (t.includes('artifact'))     return 'Artefacto';
    if (t.includes('planeswalker')) return 'Planeswalker';
    if (t.includes('land'))         return 'Tierra';
    return 'Otros';
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
    document.getElementById('deck-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'deck-toast';
    t.className = `deck-toast deck-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
}

// ── Deck mutations ────────────────────────────────────────────────────────────
function addCardToDeck(card, zone) {
    if (!currentDeck) return;
    const isBasic   = isBasicLand(card);
    const total     = totalInDeck(card.name);
    const sideTotal = currentDeck.sideboard.reduce((s,e) => s+e.quantity, 0);

    if (!isBasic && total >= MAX_COPIES)       { showToast(`Máximo ${MAX_COPIES} copias de "${card.name}".`, 'warn'); return; }
    if (zone === 'sideboard' && sideTotal >= SIDE_MAX) { showToast(`Sideboard lleno (${SIDE_MAX}).`, 'warn'); return; }

    const arr      = currentDeck[zone];
    const existing = arr.find(e => e.uuid === card.uuid);
    if (existing) {
        existing.quantity++;
    } else {
        arr.push({ uuid: card.uuid, name: card.name, setCode: card.setCode,
            number: card.number || '', colors: card.colors || [],
            type: card.type || '', manaValue: card.manaValue ?? 0,
            rarity: card.rarity || 'common', quantity: 1 });
    }
    refreshEditor();
}

function removeCardFromDeck(uuid, zone) {
    if (!currentDeck) return;
    const arr = currentDeck[zone];
    const idx = arr.findIndex(e => e.uuid === uuid);
    if (idx === -1) return;
    arr[idx].quantity > 1 ? arr[idx].quantity-- : arr.splice(idx, 1);
    refreshEditor();
}

// ── Save / Load ───────────────────────────────────────────────────────────────
async function saveCurrentDeck() {
    if (!currentDeck) return;
    const btn = document.getElementById('save-deck-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const totalMain = currentDeck.mainboard.reduce((s,e) => s+e.quantity, 0);
    const totalSide = currentDeck.sideboard.reduce((s,e) => s+e.quantity, 0);
    currentDeck.stats = {
        totalCards: totalMain, sideboardCards: totalSide,
        colorIdentity: [...new Set(currentDeck.mainboard.flatMap(e => e.colors||[]))]
    };
    const newId = await saveDeck(currentDeck);
    if (!currentDeck.id) currentDeck.id = newId;
    showToast('✅ Mazo guardado.', 'ok');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
}

async function loadDeckForEditing(id) {
    const deck = await getDeck(id);
    if (!deck) return;
    currentDeck = deck;
    switchView('edit');
}

function newEmptyDeck() {
    currentDeck = { name: 'Nuevo Mazo', format: 'standard',
        mainboard: [], sideboard: [],
        stats: { totalCards: 0, sideboardCards: 0, colorIdentity: [] } };
    switchView('edit');
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportDeckText() {
    if (!currentDeck) return;
    const lines = currentDeck.mainboard.map(e => `${e.quantity} ${e.name}`);
    if (currentDeck.sideboard.length) {
        lines.push('', 'SIDEBOARD:');
        currentDeck.sideboard.forEach(e => lines.push(`${e.quantity} ${e.name}`));
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text)
        .then(() => showToast('📋 Copiado al portapapeles (Untap.in/MTGO).', 'ok'))
        .catch(() => {
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([text], {type:'text/plain'})),
                download: `${currentDeck.name||'mazo'}.txt`
            });
            a.click();
        });
}

// ── View switcher ─────────────────────────────────────────────────────────────
function switchView(v) {
    view = v;
    if (v === 'list') renderListView();
    else              renderEditView();
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ══════════════════════════════════════════════════════════════════════════════
async function renderListView() {
    const decks = await getAllDecks();
    const colorPips = colors => (colors||[]).map(c =>
        `<span class="mana-pip mana-${c.toLowerCase()}">${c}</span>`).join('');
    const formatLabel = { standard:'Standard', pioneer:'Pioneer', modern:'Modern',
        legacy:'Legacy', commander:'Commander', custom:'Personalizado' };

    const cards = decks.length === 0
        ? `<div class="deck-list-empty">
                <div style="font-size:3rem; margin-bottom:1rem;">🃏</div>
                <p>No tienes mazos todavía.</p>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:0.5rem;">Crea uno con el botón de arriba.</p>
           </div>`
        : decks.map(d => {
            const total = d.stats?.totalCards ?? 0;
            const side  = d.stats?.sideboardCards ?? 0;
            return `
            <div class="deck-card" data-id="${d.id}">
                <div class="deck-card-body">
                    <div class="deck-card-name">${d.name}</div>
                    <div class="deck-card-format">${formatLabel[d.format]||d.format}</div>
                    <div class="deck-card-colors">${colorPips(d.stats?.colorIdentity)}</div>
                    <div class="deck-card-count">${total} cartas${side ? ` · SB: ${side}` : ''}</div>
                </div>
                <div class="deck-card-actions">
                    <button class="deck-action-btn deck-action-edit" data-id="${d.id}">✏️ Editar</button>
                    <button class="deck-action-btn deck-action-rename" data-id="${d.id}" data-name="${d.name}">🏷️ Renombrar</button>
                    <button class="deck-action-btn deck-action-delete" data-id="${d.id}">🗑️ Eliminar</button>
                </div>
            </div>`;
        }).join('');

    root().innerHTML = `
        <div class="deck-list-header">
            <h2 class="deck-list-title">Mis Mazos</h2>
            <button id="new-deck-btn" class="save-btn">✨ Nuevo Mazo</button>
        </div>
        <div class="deck-cards-grid">${cards}</div>
    `;

    document.getElementById('new-deck-btn').onclick = newEmptyDeck;

    root().addEventListener('click', async e => {
        const editBtn   = e.target.closest('.deck-action-edit');
        const renameBtn = e.target.closest('.deck-action-rename');
        const deleteBtn = e.target.closest('.deck-action-delete');

        if (editBtn) {
            await loadDeckForEditing(parseInt(editBtn.dataset.id, 10));
        } else if (renameBtn) {
            const newName = prompt('Nuevo nombre:', renameBtn.dataset.name);
            if (!newName?.trim()) return;
            const deck = await getDeck(parseInt(renameBtn.dataset.id, 10));
            if (deck) { deck.name = newName.trim(); await saveDeck(deck); renderListView(); }
        } else if (deleteBtn) {
            if (!confirm('¿Eliminar este mazo?')) return;
            await deleteDeck(parseInt(deleteBtn.dataset.id, 10));
            renderListView();
            showToast('🗑️ Mazo eliminado.', 'ok');
        }
    }, { once: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT VIEW
// ══════════════════════════════════════════════════════════════════════════════
function renderEditView() {
    const formatOpts = FORMATS.map(f =>
        `<option value="${f}" ${currentDeck?.format===f?'selected':''}>${
            {standard:'Standard',pioneer:'Pioneer',modern:'Modern',
             legacy:'Legacy',commander:'Commander / EDH',custom:'Personalizado'}[f]
        }</option>`).join('');

    root().innerHTML = `
        <!-- Top bar -->
        <div class="de-topbar">
            <button id="de-back" class="nav-btn">← Mis Mazos</button>
            <input id="de-name" class="deck-name-input" type="text"
                   placeholder="Nombre del mazo..."
                   value="${currentDeck?.name || 'Nuevo Mazo'}">
            <select id="de-format" class="deck-format-select">${formatOpts}</select>
            <div class="de-topbar-actions">
                <button id="de-stats-toggle" class="nav-btn" title="Ver estadísticas">📊 Stats</button>
                <button id="de-export" class="nav-btn">📤 Exportar</button>
                <button id="de-save" class="save-btn">💾 Guardar</button>
            </div>
        </div>

        <!-- Two-column editor -->
        <div class="de-body">
            <!-- LEFT: Inventory (75%) -->
            <div class="de-inventory">
                <div class="de-inv-header">
                    <h3 class="deck-panel-title" style="border:none;padding:0;">🎴 Tu Colección</h3>
                    <input id="de-inv-search" class="deck-inv-search" type="text" placeholder="Buscar carta...">
                </div>
                <div id="de-inv-grid" class="de-inv-grid"></div>
            </div>

            <!-- RIGHT: Deck list (25%) -->
            <div class="de-builder">
                <div class="zone-tabs">
                    <button class="zone-tab active" data-zone="mainboard">
                        Mainboard <span id="deck-count-label" class="zone-count"></span>
                    </button>
                    <button class="zone-tab" data-zone="sideboard">
                        Sideboard <span id="side-count-label" class="zone-count"></span>
                    </button>
                </div>
                <div class="deck-zone-wrapper active" id="zone-wrapper-mainboard">
                    <div id="zone-mainboard" class="deck-zone-list"></div>
                </div>
                <div class="deck-zone-wrapper" id="zone-wrapper-sideboard">
                    <div id="zone-sideboard" class="deck-zone-list"></div>
                </div>
            </div>
        </div>

        <!-- Stats drawer (hidden by default) -->
        <div id="de-stats-drawer" class="de-stats-drawer">
            <div class="de-stats-inner">
                <div>
                    <h4 class="deck-stats-title">⚡ Curva de Maná</h4>
                    <div id="mana-curve-bars" class="mana-curve"></div>
                </div>
                <div>
                    <h4 class="deck-stats-title">📊 Tipos</h4>
                    <div id="deck-type-counts" class="type-counts"></div>
                </div>
            </div>
        </div>

        <!-- Card preview modal -->
        <div id="deck-card-modal" class="deck-modal-overlay" style="display:none;">
            <div id="deck-card-modal-content" class="deck-modal-content"></div>
        </div>
    `;

    // Wire events
    document.getElementById('de-back').onclick   = () => switchView('list');
    document.getElementById('de-save').onclick   = () => saveCurrentDeck();
    document.getElementById('de-export').onclick = () => exportDeckText();
    document.getElementById('de-name').oninput   = e => { if (currentDeck) currentDeck.name = e.target.value; };
    document.getElementById('de-format').onchange= e => { if (currentDeck) currentDeck.format = e.target.value; };
    document.getElementById('de-inv-search').oninput = e => { invFilter = e.target.value; renderInventoryGrid(); };

    document.getElementById('de-stats-toggle').onclick = () => {
        statsOpen = !statsOpen;
        document.getElementById('de-stats-drawer').classList.toggle('open', statsOpen);
        updateStats();
    };

    // Zone tabs
    root().querySelectorAll('.zone-tab').forEach(tab => {
        tab.onclick = () => {
            root().querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
            root().querySelectorAll('.deck-zone-wrapper').forEach(w => w.classList.remove('active'));
            tab.classList.add('active');
            currentZone = tab.dataset.zone;
            document.getElementById(`zone-wrapper-${currentZone}`).classList.add('active');
        };
    });

    // Inventory click: open modal on image, add on button
    document.getElementById('de-inv-grid').addEventListener('click', e => {
        const addBtn = e.target.closest('.deck-add-btn');
        const card   = e.target.closest('.deck-inv-card');
        if (addBtn) {
            const uuid = addBtn.dataset.uuid;
            const c    = state.inventory.find(i => i.uuid === uuid);
            if (c) addCardToDeck(c, currentZone);
        } else if (card && !addBtn) {
            openCardModal(card.dataset.uuid);
        }
    });

    // Deck list controls
    root().addEventListener('click', e => {
        const minus = e.target.closest('.deck-entry-minus');
        const plus  = e.target.closest('.deck-entry-plus');
        if (minus) removeCardFromDeck(minus.dataset.uuid, minus.dataset.zone);
        if (plus) {
            const entry = currentDeck[plus.dataset.zone]?.find(en => en.uuid === plus.dataset.uuid);
            if (entry) addCardToDeck(entry, plus.dataset.zone);
        }
    });

    // Modal: close on overlay click
    document.getElementById('deck-card-modal').onclick = e => {
        if (e.target === e.currentTarget) closeCardModal();
    };

    refreshEditor();
}

// ── Card preview modal ────────────────────────────────────────────────────────
function openCardModal(uuid) {
    const card = state.inventory.find(i => i.uuid === uuid);
    if (!card) return;

    const lang        = state.language || 'en';
    const imgUrl      = getCardImageUrl(card, lang);
    const fallbackUrl = getCardImageUrlEn(card);
    const inDeck      = totalInDeck(card.name);
    const owned       = card.count;

    document.getElementById('deck-card-modal-content').innerHTML = `
        <button id="deck-modal-close" class="deck-modal-close">✕</button>
        <div class="deck-modal-img-col">
            <img src="${imgUrl}" alt="${card.name}"
                 style="width:100%;max-width:320px;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);"
                 onerror="this.src='${fallbackUrl}'">
        </div>
        <div class="deck-modal-info-col">
            <h2 style="font-family:var(--font-heading);font-size:1.8rem;margin-bottom:0.5rem;">${card.name}</h2>
            <p style="color:var(--text-secondary);margin-bottom:2rem;">${card.setCode?.toUpperCase()} · ${card.rarity}</p>
            <p style="font-size:0.9rem;margin-bottom:2rem;">
                Tienes: <strong style="color:var(--accent-secondary)">${owned}</strong> · 
                En mazo: <strong style="color:${inDeck>owned?'#e74c3c':'var(--text-primary)'}">${inDeck}</strong>
            </p>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                <button class="save-btn deck-modal-add" data-uuid="${card.uuid}" data-zone="mainboard">
                    + Añadir al Mainboard
                </button>
                <button class="nav-btn deck-modal-add" data-uuid="${card.uuid}" data-zone="sideboard"
                        style="border:1px solid var(--border-color);">
                    + Añadir al Sideboard
                </button>
            </div>
        </div>
    `;

    document.getElementById('deck-modal-close').onclick = closeCardModal;
    document.querySelectorAll('.deck-modal-add').forEach(btn => {
        btn.onclick = () => {
            const c = state.inventory.find(i => i.uuid === btn.dataset.uuid);
            if (c) addCardToDeck(c, btn.dataset.zone);
            // Update in-deck count in modal
            const newInDeck = totalInDeck(c.name);
            const inDeckEl = document.querySelector('.deck-modal-info-col strong:nth-child(2)');
            if (inDeckEl) inDeckEl.textContent = newInDeck;
        };
    });

    document.getElementById('deck-card-modal').style.display = 'flex';
}

function closeCardModal() {
    const modal = document.getElementById('deck-card-modal');
    if (modal) modal.style.display = 'none';
}

// ── Render: inventory grid ────────────────────────────────────────────────────
function renderInventoryGrid() {
    const container = document.getElementById('de-inv-grid');
    if (!container) return;

    const filtered = state.inventory.filter(c =>
        !invFilter || c.name.toLowerCase().includes(invFilter.toLowerCase()));

    if (filtered.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);margin-top:2rem;">
            ${state.inventory.length === 0 ? 'Colección vacía. Abre sobres primero.' : 'Sin resultados.'}
        </p>`;
        return;
    }

    const lang = state.language || 'en';
    container.innerHTML = filtered.map(card => {
        const imgUrl      = getCardImageUrl(card, lang);
        const fallbackUrl = getCardImageUrlEn(card);
        const inDeck      = totalInDeck(card.name);
        const overLimit   = inDeck > card.count;
        return `
            <div class="deck-inv-card ${overLimit ? 'over-limit' : ''}"
                 data-uuid="${card.uuid}"
                 title="${card.name} — Tienes: ${card.count} | En mazo: ${inDeck}">
                <img src="${imgUrl}" alt="${card.name}" loading="lazy" class="deck-inv-img"
                     onload="this.style.opacity=1"
                     onerror="this.onerror=null;this.src='${fallbackUrl}'">
                <div class="deck-inv-footer">
                    <span class="deck-inv-count">x${card.count}</span>
                    <button class="deck-add-btn" data-uuid="${card.uuid}">+</button>
                </div>
            </div>`;
    }).join('');
}

// ── Render: deck zone ─────────────────────────────────────────────────────────
function renderZone(zone) {
    const el = document.getElementById(`zone-${zone}`);
    if (!el || !currentDeck) return;
    const entries = currentDeck[zone];
    if (entries.length === 0) {
        el.innerHTML = `<p class="deck-zone-empty">— ${zone === 'mainboard' ? 'Mainboard' : 'Sideboard'} vacío —</p>`;
        return;
    }
    const TYPE_ORDER = ['Criatura','Instantáneo','Conjuro','Encantamiento','Artefacto','Planeswalker','Tierra','Otros'];
    const grouped = {};
    entries.forEach(e => { const g = getTypeGroup(e.type); (grouped[g]??=[]).push(e); });
    let html = '';
    TYPE_ORDER.forEach(g => {
        if (!grouped[g]) return;
        const tot = grouped[g].reduce((s,e)=>s+e.quantity,0);
        html += `<div class="deck-type-group">
            <div class="deck-type-header"><span>${g}</span><span class="deck-type-count">${tot}</span></div>`;
        grouped[g].forEach(entry => {
            const over = entry.quantity > ownedCount(entry.uuid);
            html += `<div class="deck-entry ${over?'over-limit':''}" data-uuid="${entry.uuid}" data-zone="${zone}">
                <div class="deck-entry-qty">${entry.quantity}</div>
                <div class="deck-entry-name">${entry.name}</div>
                <div class="deck-entry-set">${entry.setCode}</div>
                <div class="deck-entry-controls">
                    <button class="deck-entry-minus" data-uuid="${entry.uuid}" data-zone="${zone}">-</button>
                    <button class="deck-entry-plus"  data-uuid="${entry.uuid}" data-zone="${zone}">+</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    });
    el.innerHTML = html;
}

function updateDeckCountLabel() {
    if (!currentDeck) return;
    const main = currentDeck.mainboard.reduce((s,e)=>s+e.quantity,0);
    const side = currentDeck.sideboard.reduce((s,e)=>s+e.quantity,0);
    const color = main >= MAIN_MIN ? 'var(--accent-secondary)' : 'var(--text-secondary)';
    const lbl = document.getElementById('deck-count-label');
    const slbl = document.getElementById('side-count-label');
    if (lbl) lbl.innerHTML = `<span style="color:${color};font-weight:700">${main}</span>/${MAIN_MIN}`;
    if (slbl) slbl.innerHTML = `${side}/${SIDE_MAX}`;
}

function updateStats() {
    if (!currentDeck || !statsOpen) return;
    const all    = currentDeck.mainboard;
    const curve  = Array(8).fill(0);
    all.forEach(e => { curve[Math.min(Math.floor(e.manaValue??0),7)] += e.quantity; });
    const maxVal = Math.max(...curve, 1);
    const curveEl = document.getElementById('mana-curve-bars');
    if (curveEl) curveEl.innerHTML = curve.map((c,i) => `
        <div class="curve-bar-col">
            <div class="curve-bar-count">${c||''}</div>
            <div class="curve-bar" style="height:${(c/maxVal)*100}%"></div>
            <div class="curve-bar-label">${i===7?'7+':i}</div>
        </div>`).join('');
    const typeCounts = {};
    all.forEach(e => { const g = getTypeGroup(e.type); typeCounts[g] = (typeCounts[g]||0)+e.quantity; });
    const typesEl = document.getElementById('deck-type-counts');
    if (typesEl) typesEl.innerHTML = Object.entries(typeCounts)
        .sort((a,b)=>b[1]-a[1])
        .map(([g,c])=>`<div class="type-count-row"><span>${g}</span><span>${c}</span></div>`)
        .join('') || '<p style="color:var(--text-secondary);font-size:0.8rem;">Sin cartas</p>';
}

function refreshEditor() {
    renderZone('mainboard');
    renderZone('sideboard');
    updateDeckCountLabel();
    updateStats();
    renderInventoryGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDecks() {
    switchView('list');
}
