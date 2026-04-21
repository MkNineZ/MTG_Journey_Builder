import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';
import { filterCards, renderSearchUI } from '../components/searchEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const MAX_COPIES  = 4;
const MAIN_MIN    = 60;
const SIDE_MAX    = 15;
const FORMATS     = ['standard','pioneer','modern','legacy','commander','custom'];
const FORMAT_LABELS = { standard:'Standard', pioneer:'Pioneer', modern:'Modern',
    legacy:'Legacy', commander:'Commander / EDH', custom:'Personalizado' };

// ── Module State ──────────────────────────────────────────────────────────────
let view        = 'list';
let currentDeck = null;
let currentZone = 'mainboard';
let statsOpen   = false;
let filteredInv = []; // current filtered inventory for the editor

// ── Hover preview element ─────────────────────────────────────────────────────
let hoverImg = null;
function getHoverImg() {
    if (!hoverImg) {
        hoverImg = document.createElement('img');
        hoverImg.className = 'card-hover-preview';
        document.body.appendChild(hoverImg);
    }
    return hoverImg;
}
function showHoverPreview(card, evt) {
    const img = getHoverImg();
    img.src = getCardImageUrlEn(card);
    img.style.display = 'block';
    positionHoverPreview(evt);
    requestAnimationFrame(() => img.classList.add('visible'));
}
function positionHoverPreview(evt) {
    const img = getHoverImg();
    const x = evt.clientX + 16;
    const y = evt.clientY - 60;
    img.style.left = (x + 210 > window.innerWidth ? x - 230 : x) + 'px';
    img.style.top  = Math.max(8, Math.min(y, window.innerHeight - 310)) + 'px';
}
function hideHoverPreview() {
    const img = getHoverImg();
    img.classList.remove('visible');
    setTimeout(() => { if (!img.classList.contains('visible')) img.style.display = 'none'; }, 160);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isBasicLand = c   => BASIC_LANDS.some(b => c.name?.startsWith(b));
const ownedCount  = uuid => state.inventory.find(i => i.uuid === uuid)?.count ?? 0;
const totalInDeck = name => !currentDeck ? 0 :
    [...currentDeck.mainboard, ...currentDeck.sideboard]
        .filter(e => e.name === name).reduce((s, e) => s + e.quantity, 0);

/** Render mana cost string like "{1}{W}{R}" as Scryfall SVG images. */
function parseManaSymbols(manaCost) {
    if (!manaCost) return '';
    return manaCost.replace(/\{([^}]+)\}/g, (_, sym) => {
        const encoded = sym.replace('/', '-'); // e.g. {W/U} -> W-U
        return `<img src="https://svgs.scryfall.io/card-symbols/${encoded}.svg"
                     class="mana-sym" alt="{${sym}}" title="{${sym}}">`;
    });
}

/** Look up full card data (manaCost, manaValue) from activeSetsData by uuid. */
function getFullCardData(uuid) {
    for (const set of state.activeSetsData) {
        const card = (set.cards || []).find(c => c.uuid === uuid);
        if (card) return card;
    }
    return null;
}

function getManaValue(entry) {
    const full = getFullCardData(entry.uuid);
    if (full) return full.manaValue ?? full.convertedManaCost ?? 0;
    return entry.manaValue ?? 0;
}

function getManaCost(entry) {
    const full = getFullCardData(entry.uuid);
    return full?.manaCost || '';
}

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
    const t = Object.assign(document.createElement('div'),
        { id: 'deck-toast', className: `deck-toast deck-toast-${type}`, textContent: msg });
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

    if (!isBasic && total >= MAX_COPIES)         { showToast(`Máximo ${MAX_COPIES} copias de "${card.name}".`, 'warn'); return; }
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
    const btn = document.getElementById('de-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const totalMain = currentDeck.mainboard.reduce((s,e) => s+e.quantity, 0);
    const totalSide = currentDeck.sideboard.reduce((s,e) => s+e.quantity, 0);
    currentDeck.stats = { totalCards: totalMain, sideboardCards: totalSide,
        colorIdentity: [...new Set(currentDeck.mainboard.flatMap(e => e.colors||[]))] };

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
        stats: { totalCards:0, sideboardCards:0, colorIdentity:[] } };
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
        .then(()  => showToast('📋 Copiado al portapapeles (Untap.in/MTGO).', 'ok'))
        .catch(()  => {
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
    hideHoverPreview();
    v === 'list' ? renderListView() : renderEditView();
}

// ══════════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ══════════════════════════════════════════════════════════════════════════════
async function renderListView() {
    const container = document.getElementById('decks');
    const decks = await getAllDecks();
    const colorPips = colors => (colors||[]).map(c =>
        `<span class="mana-pip mana-${c.toLowerCase()}">${c}</span>`).join('');

    const cards = decks.length === 0
        ? `<div class="deck-list-empty"><div style="font-size:3rem;margin-bottom:1rem">🃏</div>
               <p>No tienes mazos guardados todavía.</p>
               <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:0.5rem">Crea uno con el botón de arriba.</p></div>`
        : decks.map(d => {
            const total = d.stats?.totalCards ?? 0;
            const side  = d.stats?.sideboardCards ?? 0;
            return `<div class="deck-card" data-id="${d.id}">
                <div class="deck-card-body">
                    <div class="deck-card-name">${d.name}</div>
                    <div class="deck-card-format">${FORMAT_LABELS[d.format]||d.format}</div>
                    <div class="deck-card-colors">${colorPips(d.stats?.colorIdentity)}</div>
                    <div class="deck-card-count">${total} cartas${side ? ` · SB: ${side}` : ''}</div>
                </div>
                <div class="deck-card-actions">
                    <button class="deck-action-btn deck-action-edit"   data-id="${d.id}">✏️ Editar</button>
                    <button class="deck-action-btn deck-action-rename" data-id="${d.id}" data-name="${d.name}">🏷️ Renombrar</button>
                    <button class="deck-action-btn deck-action-delete" data-id="${d.id}">🗑️ Eliminar</button>
                </div>
            </div>`;
          }).join('');

    container.innerHTML = `
        <div class="deck-list-header">
            <h2 class="deck-list-title">Mis Mazos</h2>
            <button id="new-deck-btn" class="save-btn">✨ Nuevo Mazo</button>
        </div>
        <div class="deck-cards-grid">${cards}</div>`;

    container.onclick = async e => {
        const editBtn   = e.target.closest('.deck-action-edit');
        const renameBtn = e.target.closest('.deck-action-rename');
        const deleteBtn = e.target.closest('.deck-action-delete');
        const newBtn    = e.target.closest('#new-deck-btn');
        if (newBtn)    { newEmptyDeck(); return; }
        if (editBtn)   { await loadDeckForEditing(parseInt(editBtn.dataset.id,10)); return; }
        if (renameBtn) {
            const newName = prompt('Nuevo nombre:', renameBtn.dataset.name);
            if (!newName?.trim()) return;
            const deck = await getDeck(parseInt(renameBtn.dataset.id,10));
            if (deck) { deck.name = newName.trim(); await saveDeck(deck); renderListView(); }
        }
        if (deleteBtn) {
            if (!confirm('¿Eliminar este mazo?')) return;
            await deleteDeck(parseInt(deleteBtn.dataset.id,10));
            renderListView();
            showToast('🗑️ Mazo eliminado.', 'ok');
        }
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT VIEW
// ══════════════════════════════════════════════════════════════════════════════
function renderEditView() {
    statsOpen   = false;
    currentZone = 'mainboard';
    filteredInv = [...state.inventory];

    const formatOpts = FORMATS.map(f =>
        `<option value="${f}" ${currentDeck?.format===f?'selected':''}>${FORMAT_LABELS[f]}</option>`).join('');

    document.getElementById('decks').innerHTML = `
        <!-- Top bar -->
        <div class="de-topbar">
            <button id="de-back" class="nav-btn">← Mis Mazos</button>
            <input id="de-name" class="deck-name-input" type="text"
                   placeholder="Nombre del mazo..." value="${currentDeck?.name||'Nuevo Mazo'}">
            <select id="de-format" class="deck-format-select">${formatOpts}</select>
            <div class="de-topbar-actions">
                <button id="de-export" class="nav-btn">📤 Exportar</button>
                <button id="de-save" class="save-btn">💾 Guardar</button>
            </div>
        </div>

        <!-- Two-column body -->
        <div class="de-body" id="de-body">
            <!-- LEFT: Inventory 75% -->
            <div class="de-inventory" id="de-inventory">
                <div id="de-search-container"></div>
                <div id="de-inv-grid" class="de-inv-grid"></div>
            </div>

            <!-- RIGHT: Builder 25% -->
            <div class="de-builder">
                <!-- Integrated compact stats -->
                <div class="de-stats-compact" id="de-stats-compact">
                    <div class="de-stats-row">
                        <div class="de-stats-block">
                            <div class="deck-stats-title">Curva de Maná</div>
                            <div id="mana-curve-bars" class="mana-curve"></div>
                        </div>
                        <div class="de-stats-block">
                            <div class="deck-stats-title">Colores</div>
                            <div id="deck-color-dist" class="color-dist"></div>
                        </div>
                    </div>
                </div>
                <!-- Zone tabs + list -->
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

        <!-- Card preview modal -->
        <div id="deck-card-modal" class="deck-modal-overlay" style="display:none;">
            <div id="deck-card-modal-content" class="deck-modal-content"></div>
        </div>`;


    // Wire events
    document.getElementById('de-back').onclick    = () => switchView('list');
    document.getElementById('de-save').onclick    = () => saveCurrentDeck();
    document.getElementById('de-export').onclick  = () => exportDeckText();
    document.getElementById('de-name').oninput    = e => { if (currentDeck) currentDeck.name = e.target.value; };
    document.getElementById('de-format').onchange = e => { if (currentDeck) currentDeck.format = e.target.value; };

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

    // Advanced search component
    renderSearchUI(document.getElementById('de-search-container'), state.inventory, filtered => {
        filteredInv = filtered;
        renderInventoryGrid();
    });

    // Inventory grid: add by clicking card or +
    document.getElementById('de-inv-grid').addEventListener('click', e => {
        const addBtn = e.target.closest('.deck-add-btn');
        const card   = e.target.closest('.deck-inv-card');
        
        if (card) {
            const uuid = card.dataset.uuid;
            const c = state.inventory.find(i => i.uuid === uuid);
            if (!c) return;
            
            const inDeck      = totalInDeck(c.name);
            const atLimit     = !isBasicLand(c) && inDeck >= MAX_COPIES;
            const outOfStock  = inDeck >= c.count;
            const isDisabled  = atLimit || outOfStock;

            // Only add if not disabled
            if (!isDisabled && (addBtn || e.target.tagName === 'IMG')) {
                addCardToDeck(c, currentZone);
            }
        }
    });

    // Deck list: +/- controls and click on name
    document.getElementById('decks').addEventListener('click', e => {
        const minus  = e.target.closest('.deck-entry-minus');
        const plus   = e.target.closest('.deck-entry-plus');
        const nameEl = e.target.closest('.deck-entry-name');

        if (minus) {
            removeCardFromDeck(minus.dataset.uuid, minus.dataset.zone);
        } else if (nameEl) {
            const row = nameEl.closest('.deck-entry');
            if (row) {
                const minusBtn = row.querySelector('.deck-entry-minus');
                if (minusBtn) removeCardFromDeck(nameEl.dataset.uuid, minusBtn.dataset.zone);
            }
        } else if (plus && !plus.disabled) {
            const entry = currentDeck?.[plus.dataset.zone]?.find(en => en.uuid === plus.dataset.uuid);
            if (entry) addCardToDeck(entry, plus.dataset.zone);
        }
    });

    // Hover preview on deck list entries
    document.getElementById('decks').addEventListener('mouseover', e => {
        const nameEl = e.target.closest('.deck-entry-name[data-uuid]');
        if (!nameEl) return;
        const uuid = nameEl.dataset.uuid;
        const entry = [...(currentDeck?.mainboard||[]), ...(currentDeck?.sideboard||[])]
            .find(en => en.uuid === uuid);
        if (entry) showHoverPreview(entry, e);
    });
    document.getElementById('decks').addEventListener('mousemove', e => {
        if (e.target.closest('.deck-entry-name[data-uuid]')) positionHoverPreview(e);
    });
    document.getElementById('decks').addEventListener('mouseout', e => {
        if (e.target.closest('.deck-entry-name[data-uuid]')) hideHoverPreview();
    });

    // Modal close
    document.getElementById('deck-card-modal').onclick = e => {
        if (e.target === e.currentTarget) closeCardModal();
    };

    refreshEditor();
}

// ── Card preview modal ────────────────────────────────────────────────────────
function openCardModal(uuid) {
    const card = state.inventory.find(i => i.uuid === uuid);
    if (!card) return;
    const imgUrl      = getCardImageUrl(card, state.language || 'en');
    const fallbackUrl = getCardImageUrlEn(card);
    const inDeck      = totalInDeck(card.name);

    document.getElementById('deck-card-modal-content').innerHTML = `
        <button id="deck-modal-close" class="deck-modal-close">✕</button>
        <div class="deck-modal-img-col">
            <img src="${imgUrl}" alt="${card.name}"
                 style="width:100%;max-width:300px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.8);"
                 onerror="this.src='${fallbackUrl}'">
        </div>
        <div class="deck-modal-info-col">
            <h2 style="font-family:var(--font-heading);font-size:1.6rem;margin-bottom:0.4rem;">${card.name}</h2>
            <p style="color:var(--accent-secondary);font-size:0.8rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:1.5rem;">
                ${card.setCode?.toUpperCase()} · ${card.rarity}
            </p>
            <p style="font-size:0.9rem;margin-bottom:1.5rem;">
                Tienes: <strong style="color:var(--accent-secondary)">${card.count}</strong> &nbsp;·&nbsp;
                En mazo: <strong style="color:${inDeck>card.count?'#e74c3c':'var(--text-primary)'}">${inDeck}</strong>
            </p>
            <div style="display:flex;flex-direction:column;gap:0.6rem;">
                <button class="save-btn deck-modal-add" data-uuid="${card.uuid}" data-zone="mainboard">+ Añadir al Mainboard</button>
                <button class="nav-btn deck-modal-add" data-uuid="${card.uuid}" data-zone="sideboard"
                        style="border:1px solid var(--border-color);">+ Añadir al Sideboard</button>
            </div>
        </div>`;

    document.getElementById('deck-modal-close').onclick = closeCardModal;
    document.querySelectorAll('.deck-modal-add').forEach(btn => {
        btn.onclick = () => {
            const c = state.inventory.find(i => i.uuid === btn.dataset.uuid);
            if (c) addCardToDeck(c, btn.dataset.zone);
        };
    });
    document.getElementById('deck-card-modal').style.display = 'flex';
}

function closeCardModal() {
    const m = document.getElementById('deck-card-modal');
    if (m) m.style.display = 'none';
}

// ── Render: inventory grid ────────────────────────────────────────────────────
function renderInventoryGrid() {
    const container = document.getElementById('de-inv-grid');
    if (!container) return;

    if (filteredInv.length === 0) {
        container.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-secondary);margin-top:2rem;">
            ${state.inventory.length===0 ? 'Colección vacía. Abre sobres primero.' : 'Sin resultados.'}</p>`;
        return;
    }

    const lang = state.language || 'en';
    container.innerHTML = filteredInv.map(card => {
        const imgUrl      = getCardImageUrl(card, lang);
        const fallbackUrl = getCardImageUrlEn(card);
        const inDeck      = totalInDeck(card.name);
        
        const atLimit     = !isBasicLand(card) && inDeck >= MAX_COPIES;
        const noStock     = card.count <= 0;
        const outOfStock  = inDeck >= card.count;
        const isDisabled  = atLimit || noStock || outOfStock;
        
        const cardStyle   = isDisabled ? 'opacity: 0.3; cursor: not-allowed;' 
                          : (inDeck > 0) ? 'border-color: rgba(255, 255, 255, 0.4); box-shadow: inset 0 0 20px rgba(255,255,255,0.1);' : '';
        
        return `
            <div class="deck-inv-card" data-uuid="${card.uuid}" style="${cardStyle}"
                 title="${card.name} — Tienes: ${card.count} | En mazo: ${inDeck}">
                <img src="${imgUrl}" alt="${card.name}" loading="lazy" class="deck-inv-img"
                     onload="this.style.opacity=1"
                     onerror="this.onerror=null;this.src='${fallbackUrl}'">
                <div class="deck-inv-badge">x${card.count}</div>
            </div>`;
    }).join('');
}

// ── Render: deck zone ─────────────────────────────────────────────────────────
function renderZone(zone) {
    const el = document.getElementById(`zone-${zone}`);
    if (!el || !currentDeck) return;
    const entries = currentDeck[zone];
    if (entries.length === 0) {
        el.innerHTML = `<p class="deck-zone-empty">— ${zone==='mainboard'?'Mainboard':'Sideboard'} vacío —</p>`;
        return;
    }
    const TYPE_ORDER = ['Criatura','Instantáneo','Conjuro','Encantamiento','Artefacto','Planeswalker','Tierra','Otros'];
    const grouped = {};
    entries.forEach(e => { const g = getTypeGroup(e.type); (grouped[g]??=[]).push(e); });

    let html = '';
    TYPE_ORDER.forEach(g => {
        if (!grouped[g]) return;
        const tot = grouped[g].reduce((s,e) => s+e.quantity, 0);
        html += `<div class="deck-type-group">
            <div class="deck-type-header"><span>${g}</span><span class="deck-type-count">${tot}</span></div>`;
        grouped[g].forEach(entry => {
            const over       = entry.quantity > ownedCount(entry.uuid);
            const atLimit    = !isBasicLand(entry) && totalInDeck(entry.name) >= MAX_COPIES;
            const noStock    = ownedCount(entry.uuid) <= 0;
            const outOfStock = totalInDeck(entry.name) >= ownedCount(entry.uuid);
            const plusDisabled = (atLimit || noStock || outOfStock) ? 'disabled style="opacity:0.35;cursor:not-allowed"' : '';
            const mv         = getManaValue(entry);
            const manaCost   = getManaCost(entry);
            const costHtml   = manaCost ? parseManaSymbols(manaCost)
                             : `<span class="entry-mv">${mv > 0 ? mv : ''}</span>`;
            html += `<div class="deck-entry ${over?'over-limit':''}">
                <div class="deck-entry-qty">${entry.quantity}</div>
                <div class="deck-entry-name" data-uuid="${entry.uuid}">${entry.name}</div>
                <div class="deck-entry-cost">${costHtml}</div>
                <div class="deck-entry-controls">
                    <button class="deck-entry-minus" data-uuid="${entry.uuid}" data-zone="${zone}">-</button>
                    <button class="deck-entry-plus"  data-uuid="${entry.uuid}" data-zone="${zone}" ${plusDisabled}>+</button>
                </div>
            </div>`;
        });
        html += `</div>`;
    });
    el.innerHTML = html;
}

function updateDeckCountLabel() {
    if (!currentDeck) return;
    const main = currentDeck.mainboard.reduce((s,e) => s+e.quantity, 0);
    const side = currentDeck.sideboard.reduce((s,e) => s+e.quantity, 0);
    const color = main >= MAIN_MIN ? 'var(--accent-secondary)' : 'var(--text-secondary)';
    const lbl  = document.getElementById('deck-count-label');
    const slbl = document.getElementById('side-count-label');
    if (lbl)  lbl.innerHTML  = `<span style="color:${color};font-weight:700">${main}</span>/${MAIN_MIN}`;
    if (slbl) slbl.innerHTML = `${side}/${SIDE_MAX}`;
}

function updateStats() {
    if (!currentDeck) return;
    const all = currentDeck.mainboard;

    // Mana curve with Scryfall SVG labels
    const curve  = Array(8).fill(0);
    all.forEach(e => { curve[Math.min(Math.floor(getManaValue(e)),7)] += e.quantity; });
    const maxVal  = Math.max(...curve, 1);
    const curveEl = document.getElementById('mana-curve-bars');
    if (curveEl) curveEl.innerHTML = curve.map((c,i) => {
        const sym = i === 7 ? '∞' : String(i);
        const label = `<img src="https://svgs.scryfall.io/card-symbols/${i}.svg"
            class="mana-sym" style="width:13px;height:13px" onerror="this.outerHTML='${i===7?'7+':i}'">`;
        return `<div class="curve-bar-col">
            <div class="curve-bar-count">${c||''}</div>
            <div class="curve-bar" style="height:${(c/maxVal)*100}%"></div>
            <div class="curve-bar-label">${label}</div>
        </div>`;
    }).join('');

    // Color distribution with Scryfall SVG icons
    const colorMap = {};
    all.forEach(e => { (e.colors||[]).forEach(c => { colorMap[c] = (colorMap[c]||0)+e.quantity; }); });
    const total = Object.values(colorMap).reduce((s,v)=>s+v, 0) || 1;
    const distEl = document.getElementById('deck-color-dist');
    const COLOR_SYMBOLS = ['W','U','B','R','G','C'];
    if (distEl) distEl.innerHTML = COLOR_SYMBOLS
        .filter(c => colorMap[c])
        .map(c => {
            const pct = Math.round((colorMap[c]/total)*100);
            return `<div class="color-dist-row">
                <img src="https://svgs.scryfall.io/card-symbols/${c}.svg" class="mana-sym" style="width:16px;height:16px">
                <div class="color-dist-bar-wrap"><div class="color-dist-bar" style="width:${pct}%"></div></div>
                <span class="color-dist-pct">${pct}%</span>
            </div>`;
        }).join('') || '<p style="color:var(--text-secondary);font-size:0.75rem">Sin colores</p>';
}

function refreshEditor() {
    renderZone('mainboard');
    renderZone('sideboard');
    updateDeckCountLabel();
    updateStats(); // always update — stats are now always visible
    renderInventoryGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDecks() {
    switchView('list');
}
