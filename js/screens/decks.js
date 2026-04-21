import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASIC_LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const MAX_COPIES = 4;
const MAIN_MIN = 60;
const SIDE_MAX = 15;

// ── Module State ──────────────────────────────────────────────────────────────
let currentDeck = null; // { id?, name, format, mainboard:[], sideboard:[], ... }
let currentZone  = 'mainboard'; // 'mainboard' | 'sideboard'
let inventoryFilter = '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function isBasicLand(card) {
    return BASIC_LAND_TYPES.some(t => card.name && card.name.startsWith(t));
}

/** Total copies of a name already in the given zone array. */
function copiesInZone(zone, name) {
    return zone
        .filter(e => e.name === name)
        .reduce((sum, e) => sum + e.quantity, 0);
}

/** Total copies of a name across both mainboard + sideboard. */
function totalCopiesInDeck(name) {
    if (!currentDeck) return 0;
    return copiesInZone(currentDeck.mainboard, name) +
           copiesInZone(currentDeck.sideboard, name);
}

/** How many copies of this uuid the user owns in inventory. */
function ownedCount(uuid) {
    const item = state.inventory.find(i => i.uuid === uuid);
    return item ? item.count : 0;
}

/** Total copies of a name assigned to the deck (both zones combined). */
function usedCountByName(name) {
    return totalCopiesInDeck(name);
}

// ── VALIDATION ────────────────────────────────────────────────────────────────
/**
 * Checks if we can add `delta` more copies of a card to a zone.
 * Returns { ok: boolean, reason?: string }
 */
function canAdd(card, zone) {
    const isBasic = isBasicLand(card);
    const currentTotal = totalCopiesInDeck(card.name);
    const owned = ownedCount(card.uuid);

    // 4-copy limit (skip for basic lands)
    if (!isBasic && currentTotal >= MAX_COPIES) {
        return { ok: false, reason: `Límite de ${MAX_COPIES} copias alcanzado para "${card.name}".` };
    }

    // Sideboard max size
    if (zone === 'sideboard') {
        const sideTotal = currentDeck.sideboard.reduce((s, e) => s + e.quantity, 0);
        if (sideTotal >= SIDE_MAX) {
            return { ok: false, reason: `El sideboard ya tiene ${SIDE_MAX} cartas.` };
        }
    }

    // Inventory limit — user doesn't own enough
    if (owned <= 0 && currentTotal >= owned) {
        // Still allow adding but mark over-limit — don't block
    }

    return { ok: true };
}

// ── DECK MUTATIONS ────────────────────────────────────────────────────────────
function addCardToDeck(card, zone) {
    if (!currentDeck) return;

    const { ok, reason } = canAdd(card, zone);
    if (!ok) { showToast(reason, 'warn'); return; }

    const zoneArr = currentDeck[zone];
    const existing = zoneArr.find(e => e.uuid === card.uuid);
    if (existing) {
        existing.quantity++;
    } else {
        zoneArr.push({
            uuid: card.uuid,
            name: card.name,
            setCode: card.setCode,
            number: card.number || '',
            colors: card.colors || [],
            type: card.type || '',
            manaValue: card.manaValue ?? card.convertedManaCost ?? 0,
            rarity: card.rarity || 'common',
            quantity: 1
        });
    }

    refreshDeckPanel();
    updateStats();
}

function removeCardFromDeck(uuid, zone) {
    if (!currentDeck) return;
    const zoneArr = currentDeck[zone];
    const idx = zoneArr.findIndex(e => e.uuid === uuid);
    if (idx === -1) return;
    if (zoneArr[idx].quantity > 1) {
        zoneArr[idx].quantity--;
    } else {
        zoneArr.splice(idx, 1);
    }
    refreshDeckPanel();
    updateStats();
}

// ── SAVE / LOAD ───────────────────────────────────────────────────────────────
async function saveCurrentDeck() {
    if (!currentDeck) return;
    const btn = document.getElementById('save-deck-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const totalMain = currentDeck.mainboard.reduce((s, e) => s + e.quantity, 0);
    const totalSide = currentDeck.sideboard.reduce((s, e) => s + e.quantity, 0);
    const allColors = new Set(currentDeck.mainboard.flatMap(e => e.colors || []));

    currentDeck.stats = {
        totalCards: totalMain,
        sideboardCards: totalSide,
        colorIdentity: [...allColors]
    };

    const newId = await saveDeck(currentDeck);
    if (!currentDeck.id) currentDeck.id = newId;

    showToast('✅ Mazo guardado correctamente.', 'ok');
    renderDeckSelector();
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Mazo'; }
}

async function loadDeckForEditing(id) {
    const deck = await getDeck(id);
    if (!deck) return;
    currentDeck = deck;
    document.getElementById('deck-name-input').value = deck.name;
    document.getElementById('deck-format').value = deck.format || 'standard';
    refreshDeckPanel();
    updateStats();
}

function newEmptyDeck() {
    currentDeck = {
        name: 'Nuevo Mazo',
        format: 'standard',
        mainboard: [],
        sideboard: [],
        stats: { totalCards: 0, sideboardCards: 0, colorIdentity: [] }
    };
    document.getElementById('deck-name-input').value = currentDeck.name;
    document.getElementById('deck-format').value = 'standard';
    refreshDeckPanel();
    updateStats();
}

// ── RENDER: DECK SELECTOR PANEL ───────────────────────────────────────────────
async function renderDeckSelector() {
    const list = document.getElementById('saved-decks-list');
    const decks = await getAllDecks();

    if (decks.length === 0) {
        list.innerHTML = `<p class="deck-empty-hint">No tienes mazos guardados aún.</p>`;
        return;
    }

    list.innerHTML = decks.map(d => {
        const total = d.stats?.totalCards ?? 0;
        const colors = (d.stats?.colorIdentity || []).map(c => `<span class="mana-pip mana-${c.toLowerCase()}">${c}</span>`).join('');
        const isActive = currentDeck && currentDeck.id === d.id;
        return `
            <div class="saved-deck-item ${isActive ? 'active' : ''}" data-deck-id="${d.id}">
                <div class="saved-deck-info">
                    <span class="saved-deck-name">${d.name}</span>
                    <span class="saved-deck-meta">${total} cartas ${colors}</span>
                </div>
                <button class="deck-delete-btn" data-deck-id="${d.id}" title="Eliminar mazo">🗑️</button>
            </div>
        `;
    }).join('');
}

// ── RENDER: INVENTORY PANEL ───────────────────────────────────────────────────
function renderInventoryPanel() {
    const container = document.getElementById('deck-inventory-results');
    const inv = state.inventory;

    const filtered = inv.filter(card => {
        if (!inventoryFilter) return true;
        return card.name.toLowerCase().includes(inventoryFilter.toLowerCase());
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-secondary); margin-top:2rem;">
            ${inv.length === 0 ? 'Tu colección está vacía. Abre algunos sobres primero.' : 'No hay cartas que coincidan.'}
        </p>`;
        return;
    }

    container.innerHTML = filtered.map(card => {
        const lang = state.language || 'en';
        const imgUrl = getCardImageUrl(card, lang);
        const fallbackUrl = getCardImageUrlEn(card);
        const inDeck = totalCopiesInDeck(card.name);
        const owned = card.count;
        const overLimit = inDeck > owned;

        return `
            <div class="deck-inv-card ${overLimit ? 'over-limit' : ''}" 
                 data-uuid="${card.uuid}"
                 data-name="${card.name}"
                 title="${card.name} (${card.setCode}) — Tienes: ${owned} | En mazo: ${inDeck}">
                <img src="${imgUrl}" 
                     alt="${card.name}" 
                     loading="lazy"
                     class="deck-inv-img"
                     onload="this.style.opacity=1"
                     onerror="this.onerror=null;this.src='${fallbackUrl}'">
                <div class="deck-inv-footer">
                    <span class="deck-inv-count">x${owned}</span>
                    <div class="deck-inv-actions">
                        <button class="deck-add-btn" data-uuid="${card.uuid}" title="Añadir al mazo">+</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── RENDER: DECK LIST PANEL ───────────────────────────────────────────────────
function refreshDeckPanel() {
    renderZone('mainboard');
    renderZone('sideboard');
    updateDeckCountLabel();
    renderInventoryPanel(); // refresh over-limit flags
}

function renderZone(zone) {
    const container = document.getElementById(`zone-${zone}`);
    if (!container || !currentDeck) return;

    const entries = currentDeck[zone];
    const totalCards = entries.reduce((s, e) => s + e.quantity, 0);

    if (entries.length === 0) {
        container.innerHTML = `<p class="deck-zone-empty">
            ${zone === 'mainboard' ? '— Mainboard vacío —' : '— Sideboard vacío —'}
        </p>`;
        return;
    }

    // Group by type for mainboard readability
    const grouped = {};
    entries.forEach(e => {
        const typeKey = getTypeGroup(e.type);
        if (!grouped[typeKey]) grouped[typeKey] = [];
        grouped[typeKey].push(e);
    });

    const typeOrder = ['Criatura', 'Instantáneo', 'Conjuro', 'Encantamiento', 'Artefacto', 'Planeswalker', 'Tierra', 'Otros'];

    let html = '';
    typeOrder.forEach(group => {
        if (!grouped[group]) return;
        const groupTotal = grouped[group].reduce((s, e) => s + e.quantity, 0);
        html += `<div class="deck-type-group">
            <div class="deck-type-header">
                <span>${group}</span>
                <span class="deck-type-count">${groupTotal}</span>
            </div>`;
        grouped[group].forEach(entry => {
            const owned = ownedCount(entry.uuid);
            const overLimit = entry.quantity > owned;
            html += `
                <div class="deck-entry ${overLimit ? 'over-limit' : ''}" data-uuid="${entry.uuid}" data-zone="${zone}">
                    <div class="deck-entry-qty">${entry.quantity}</div>
                    <div class="deck-entry-name">${entry.name}</div>
                    <div class="deck-entry-set">${entry.setCode}</div>
                    <div class="deck-entry-controls">
                        <button class="deck-entry-minus" data-uuid="${entry.uuid}" data-zone="${zone}">-</button>
                        <button class="deck-entry-plus" data-uuid="${entry.uuid}" data-zone="${zone}">+</button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}

function getTypeGroup(type) {
    if (!type) return 'Otros';
    const t = type.toLowerCase();
    if (t.includes('creature')) return 'Criatura';
    if (t.includes('instant')) return 'Instantáneo';
    if (t.includes('sorcery')) return 'Conjuro';
    if (t.includes('enchantment')) return 'Encantamiento';
    if (t.includes('artifact')) return 'Artefacto';
    if (t.includes('planeswalker')) return 'Planeswalker';
    if (t.includes('land')) return 'Tierra';
    return 'Otros';
}

function updateDeckCountLabel() {
    if (!currentDeck) return;
    const totalMain = currentDeck.mainboard.reduce((s, e) => s + e.quantity, 0);
    const totalSide = currentDeck.sideboard.reduce((s, e) => s + e.quantity, 0);
    const label = document.getElementById('deck-count-label');
    if (label) {
        const color = totalMain >= MAIN_MIN ? 'var(--accent-secondary)' : 'var(--text-secondary)';
        label.innerHTML = `<span style="color:${color};font-weight:700;">${totalMain}</span> / ${MAIN_MIN} cartas · Side: ${totalSide}/${SIDE_MAX}`;
    }
}

// ── STATS: MANA CURVE ─────────────────────────────────────────────────────────
function updateStats() {
    if (!currentDeck) return;
    const all = currentDeck.mainboard;

    // Mana curve (0–7+)
    const curve = Array(8).fill(0);
    all.forEach(e => {
        const mv = Math.min(Math.floor(e.manaValue ?? 0), 7);
        curve[mv] += e.quantity;
    });

    const maxVal = Math.max(...curve, 1);
    const curveEl = document.getElementById('mana-curve-bars');
    if (curveEl) {
        curveEl.innerHTML = curve.map((count, i) => `
            <div class="curve-bar-col">
                <div class="curve-bar-count">${count || ''}</div>
                <div class="curve-bar" style="height: ${(count / maxVal) * 100}%"></div>
                <div class="curve-bar-label">${i === 7 ? '7+' : i}</div>
            </div>
        `).join('');
    }

    // Type counts
    const typeCounts = {};
    all.forEach(e => {
        const g = getTypeGroup(e.type);
        typeCounts[g] = (typeCounts[g] || 0) + e.quantity;
    });
    const typesEl = document.getElementById('deck-type-counts');
    if (typesEl) {
        const entries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
        typesEl.innerHTML = entries.map(([g, c]) =>
            `<div class="type-count-row"><span>${g}</span><span>${c}</span></div>`
        ).join('') || `<p style="color:var(--text-secondary);font-size:0.8rem;">Sin cartas</p>`;
    }

    updateDeckCountLabel();
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function exportDeckText() {
    if (!currentDeck) return;
    const lines = [];
    currentDeck.mainboard.forEach(e => lines.push(`${e.quantity} ${e.name}`));
    if (currentDeck.sideboard.length > 0) {
        lines.push('');
        lines.push('SIDEBOARD:');
        currentDeck.sideboard.forEach(e => lines.push(`${e.quantity} ${e.name}`));
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Mazo copiado al portapapeles (formato Untap.in/MTGO).', 'ok');
    }).catch(() => {
        // Fallback: download as .txt
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentDeck.name || 'mazo'}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'ok') {
    const existing = document.getElementById('deck-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'deck-toast';
    toast.className = `deck-toast deck-toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 400); }, 3000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
export function initDecks() {
    const container = document.getElementById('decks');

    container.innerHTML = `
        <!-- ── Top Bar ─────────────────────────────────────── -->
        <div class="deck-topbar">
            <div style="display:flex; align-items:center; gap:1rem; flex:1; min-width:0;">
                <input id="deck-name-input" class="deck-name-input" type="text" placeholder="Nombre del mazo..." value="Nuevo Mazo">
                <select id="deck-format" class="deck-format-select">
                    <option value="standard">Standard</option>
                    <option value="pioneer">Pioneer</option>
                    <option value="modern">Modern</option>
                    <option value="legacy">Legacy</option>
                    <option value="commander">Commander / EDH</option>
                    <option value="custom">Personalizado</option>
                </select>
            </div>
            <div style="display:flex; gap:0.75rem; flex-shrink:0;">
                <button id="new-deck-btn" class="nav-btn" title="Nuevo mazo">✨ Nuevo</button>
                <button id="export-deck-btn" class="nav-btn" title="Exportar para Untap.in/MTGO">📤 Exportar</button>
                <button id="save-deck-btn" class="save-btn">💾 Guardar Mazo</button>
            </div>
        </div>

        <!-- ── Body: Sidebar + Editor ──────────────────────── -->
        <div class="deck-body">

            <!-- Saved Decks Sidebar -->
            <div class="deck-sidebar">
                <h3 class="deck-panel-title">Mis Mazos</h3>
                <div id="saved-decks-list" class="saved-decks-list"></div>
            </div>

            <!-- Inventory Panel -->
            <div class="deck-inventory-panel">
                <h3 class="deck-panel-title">🎴 Colección Disponible</h3>
                <input id="inv-search" class="deck-inv-search" type="text" placeholder="Buscar carta...">
                <div id="deck-inventory-results" class="deck-inv-grid"></div>
            </div>

            <!-- Deck Construction Panel -->
            <div class="deck-build-panel">
                <!-- Zone selector tabs -->
                <div class="zone-tabs">
                    <button class="zone-tab active" data-zone="mainboard">
                        Mainboard <span id="deck-count-label" class="zone-count">0 / 60</span>
                    </button>
                    <button class="zone-tab" data-zone="sideboard">
                        Sideboard <span id="side-count-label" class="zone-count">0 / 15</span>
                    </button>
                </div>

                <!-- Mainboard list -->
                <div class="deck-zone-wrapper active" id="zone-wrapper-mainboard">
                    <div id="zone-mainboard" class="deck-zone-list"></div>
                </div>

                <!-- Sideboard list -->
                <div class="deck-zone-wrapper" id="zone-wrapper-sideboard">
                    <div id="zone-sideboard" class="deck-zone-list"></div>
                </div>

                <!-- Stats -->
                <div class="deck-stats-panel">
                    <h4 class="deck-stats-title">⚡ Curva de Maná</h4>
                    <div id="mana-curve-bars" class="mana-curve"></div>
                    <h4 class="deck-stats-title" style="margin-top:1rem;">📊 Tipos</h4>
                    <div id="deck-type-counts" class="type-counts"></div>
                </div>
            </div>
        </div>
    `;

    // ── Wire up events ────────────────────────────────────────────────────────

    document.getElementById('new-deck-btn').onclick = () => { newEmptyDeck(); };
    document.getElementById('save-deck-btn').onclick = () => saveCurrentDeck();
    document.getElementById('export-deck-btn').onclick = () => exportDeckText();

    document.getElementById('deck-name-input').oninput = (e) => {
        if (currentDeck) currentDeck.name = e.target.value;
    };
    document.getElementById('deck-format').onchange = (e) => {
        if (currentDeck) currentDeck.format = e.target.value;
    };

    // Inventory search
    document.getElementById('inv-search').oninput = (e) => {
        inventoryFilter = e.target.value;
        renderInventoryPanel();
    };

    // Zone tabs
    document.querySelectorAll('.zone-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.zone-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.deck-zone-wrapper').forEach(w => w.classList.remove('active'));
            tab.classList.add('active');
            currentZone = tab.dataset.zone;
            document.getElementById(`zone-wrapper-${currentZone}`).classList.add('active');
        };
    });

    // Inventory: add card on click
    document.getElementById('deck-inventory-results').addEventListener('click', (e) => {
        const addBtn = e.target.closest('.deck-add-btn');
        if (!addBtn) return;
        if (!currentDeck) { showToast('Crea o selecciona un mazo primero.', 'warn'); return; }
        const uuid = addBtn.dataset.uuid;
        const card = state.inventory.find(i => i.uuid === uuid);
        if (card) addCardToDeck(card, currentZone);
    });

    // Deck list: +/- controls (delegated)
    document.getElementById('decks').addEventListener('click', async (e) => {
        const minusBtn = e.target.closest('.deck-entry-minus');
        const plusBtn  = e.target.closest('.deck-entry-plus');
        const deleteBtn = e.target.closest('.deck-delete-btn');
        const deckItem  = e.target.closest('.saved-deck-item');

        if (minusBtn) {
            removeCardFromDeck(minusBtn.dataset.uuid, minusBtn.dataset.zone);
        } else if (plusBtn) {
            const zone = plusBtn.dataset.zone;
            const entry = currentDeck[zone].find(e => e.uuid === plusBtn.dataset.uuid);
            if (entry) addCardToDeck(entry, zone);
        } else if (deleteBtn) {
            const id = parseInt(deleteBtn.dataset.deckId, 10);
            if (!confirm('¿Seguro que quieres eliminar este mazo?')) return;
            await deleteDeck(id);
            if (currentDeck && currentDeck.id === id) newEmptyDeck();
            renderDeckSelector();
            showToast('🗑️ Mazo eliminado.', 'ok');
        } else if (deckItem && !e.target.closest('.deck-delete-btn')) {
            const id = parseInt(deckItem.dataset.deckId, 10);
            await loadDeckForEditing(id);
            renderDeckSelector();
        }
    });

    // Init
    newEmptyDeck();
    renderDeckSelector();
    renderInventoryPanel();
    updateStats();
}
