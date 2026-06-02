import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';
import { filterCards, renderSearchUI } from '../components/searchEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const MAX_COPIES  = 4;
const MAIN_MIN    = 60;
const SIDE_MAX    = 15;
const FORMATS     = ['clasico', 'commander'];
const FORMAT_LABELS = { clasico: 'Clásico', commander: 'Commander / EDH' };

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
    
    let calcLeft = (x + 210 > window.innerWidth ? x - 230 : x);
    if (calcLeft < 20) calcLeft = 20;

    img.style.left = calcLeft + 'px';
    img.style.top  = Math.max(8, Math.min(y, window.innerHeight - 310)) + 'px';
}
function hideHoverPreview() {
    const img = getHoverImg();
    img.classList.remove('visible');
    setTimeout(() => { if (!img.classList.contains('visible')) img.style.display = 'none'; }, 160);
}

// ── Ghost Portal Zoom (Escape Overflow) ───────────────────────────────────────
let ghostPortal = null;
function getGhostPortal() {
    if (!ghostPortal) {
        ghostPortal = document.createElement('img');
        ghostPortal.className = 'ghost-zoom-portal';
        document.body.appendChild(ghostPortal);
    }
    return ghostPortal;
}
function showGhostPortal(cardEl) {
    const portal = getGhostPortal();
    const imgEl  = cardEl.querySelector('img');
    if (!imgEl) return;

    const rect = cardEl.getBoundingClientRect();
    const zoom = getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom') || '1.4';

    // Boundary check for left edge
    const z = parseFloat(zoom) || 1.4;
    const offset = (rect.width * (z - 1)) / 2;
    let finalLeft = rect.left;
    if (finalLeft - offset < 20) finalLeft = 20 + offset;

    portal.src = imgEl.src;
    portal.style.width  = rect.width + 'px';
    portal.style.height = rect.height + 'px';
    portal.style.top    = rect.top + 'px';
    portal.style.left   = finalLeft + 'px';
    
    portal.style.display = 'block';
    requestAnimationFrame(() => {
        portal.classList.add('visible');
        portal.style.transform = `scale(${zoom})`;
    });
}
function hideGhostPortal() {
    if (!ghostPortal) return;
    ghostPortal.classList.remove('visible');
    ghostPortal.style.transform = 'scale(1)';
    setTimeout(() => { if (!ghostPortal.classList.contains('visible')) ghostPortal.style.display = 'none'; }, 200);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isBasicLand = c   => BASIC_LANDS.some(b => c.name?.startsWith(b));
const ownedCount  = uuid => state.inventory.find(i => i.uuid === uuid)?.count ?? 0;
const totalInDeck = name => !currentDeck ? 0 :
    [...currentDeck.mainboard, ...currentDeck.sideboard, ...(currentDeck.commander || [])]
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
    const card = full || entry;
    const exactCmc = card.convertedManaCost !== undefined ? card.convertedManaCost : (card.manaValue !== undefined ? card.manaValue : (card.cmc !== undefined ? card.cmc : 0));
    return exactCmc;
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
    const formatMax = currentDeck.format === 'commander' ? 1 : MAX_COPIES;

    if (!isBasic && total >= formatMax)         { showToast(`Máximo ${formatMax} copias de "${card.name}".`, 'warn'); return; }
    if (zone === 'sideboard' && sideTotal >= SIDE_MAX) { showToast(`Sideboard lleno (${SIDE_MAX}).`, 'warn'); return; }

    const arr      = currentDeck[zone];
    const existing = arr.find(e => e.uuid === card.uuid);
    if (existing) {
        existing.quantity++;
    } else {
        const exactCmc = card.convertedManaCost !== undefined ? card.convertedManaCost : (card.manaValue !== undefined ? card.manaValue : (card.cmc !== undefined ? card.cmc : 0));
        arr.push({ uuid: card.uuid, name: card.name, setCode: card.setCode,
            number: card.number || '', colors: card.colors || [],
            type: card.type || '', manaValue: exactCmc,
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
    hideHoverPreview(); // Fix ghost preview bug
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
    currentDeck = { name: 'Nuevo Mazo', format: 'clasico',
        commander: [], mainboard: [], sideboard: [],
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
            const setBadges = [...new Set((d.mainboard || []).map(c => c.setCode))].filter(c => c).map(c => `<span class="set-badge">[${c.toUpperCase()}]</span>`).join('');
            return `<div class="deck-card" data-id="${d.id}">
                <div class="deck-card-body">
                    <div class="deck-card-name">${d.name}</div>
                    <div style="margin-bottom: 0.5rem;">${setBadges}</div>
                    <div class="deck-card-format format-badge ${d.format}">${FORMAT_LABELS[d.format]||d.format}</div>
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
    filteredInv = filterCards(state.inventory, { name: '', oracleText: '', keywords: '', type: 'all', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' });

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

        <!-- Three-column body -->
        <div class="app-columns-layout" id="de-body">
            <!-- LEFT: Search Filters -->
            <div id="de-search-container" class="app-sidebar-filters"></div>

            <!-- CENTER: Inventory Grid -->
            <div class="app-main-content">
                <div id="de-inv-grid" class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem;"></div>
            </div>

            <!-- RIGHT: Builder -->
            <div class="app-sidebar-deckboard">
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
                <!-- Stacked Zones -->
                <div class="deck-zone-stacked-layout" style="display: flex; flex-direction: column; gap: 1rem; flex: 1; overflow-y: auto;">
                    <!-- Commander Zone -->
                    <div class="deck-zone-wrapper" id="zone-wrapper-commander" style="display: ${currentDeck?.format === 'commander' ? 'block' : 'none'};">
                        <div class="deck-zone-header" style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; color: var(--accent-color); margin-bottom: 0.5rem; border-left: 3px solid var(--accent-color);">
                            Commander <span id="commander-count-label" class="zone-count" style="margin-left: 0.5rem; font-size: 0.9em; opacity: 0.8;"></span>
                        </div>
                        <div id="zone-commander" class="deck-zone-list"></div>
                    </div>
                    
                    <!-- Mainboard Zone -->
                    <div class="deck-zone-wrapper" id="zone-wrapper-mainboard" style="display: block;">
                        <div class="deck-zone-header" style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; margin-bottom: 0.5rem;">
                            Mainboard <span id="deck-count-label" class="zone-count" style="margin-left: 0.5rem; font-size: 0.9em; opacity: 0.8;"></span>
                        </div>
                        <div id="zone-mainboard" class="deck-zone-list"></div>
                    </div>
                    
                    <!-- Sideboard Zone -->
                    <div class="deck-zone-wrapper" id="zone-wrapper-sideboard" style="display: ${currentDeck?.format === 'clasico' ? 'block' : 'none'};">
                        <div class="deck-zone-header" style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 6px; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.5rem;">
                            Sideboard <span id="side-count-label" class="zone-count" style="margin-left: 0.5rem; font-size: 0.9em; opacity: 0.8;"></span>
                        </div>
                        <div id="zone-sideboard" class="deck-zone-list"></div>
                    </div>
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
    document.getElementById('de-format').onchange = e => { 
        if (currentDeck) {
            currentDeck.format = e.target.value;
            const isCmd = currentDeck.format === 'commander';
            
            const cmdWrapper = document.getElementById('zone-wrapper-commander');
            const sideWrapper = document.getElementById('zone-wrapper-sideboard');
            
            if (cmdWrapper) cmdWrapper.style.display = isCmd ? 'block' : 'none';
            if (sideWrapper) sideWrapper.style.display = isCmd ? 'none' : 'block';
            
            // Si pasamos a clásico y había cartas en commander, las pasamos al mainboard
            if (!isCmd && currentDeck.commander && currentDeck.commander.length > 0) {
                currentDeck.commander.forEach(c => {
                    const existing = currentDeck.mainboard.find(m => m.uuid === c.uuid);
                    if (existing) {
                        existing.quantity += c.quantity;
                    } else {
                        currentDeck.mainboard.push({ ...c });
                    }
                });
                currentDeck.commander = [];
            }
            
            // Si pasamos a commander y había cartas en sideboard, las pasamos al mainboard
            if (isCmd && currentDeck.sideboard && currentDeck.sideboard.length > 0) {
                currentDeck.sideboard.forEach(c => {
                    const existing = currentDeck.mainboard.find(m => m.uuid === c.uuid);
                    if (existing) {
                        existing.quantity += c.quantity;
                    } else {
                        currentDeck.mainboard.push({ ...c });
                    }
                });
                currentDeck.sideboard = [];
            }
            
            refreshEditor();
        }
    };

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
            const c = filteredInv.find(i => i.uuid === uuid);
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

    // Ghost Portal Zoom for Inventory Grid
    const invGrid = document.getElementById('de-inv-grid');
    invGrid.addEventListener('mouseover', e => {
        const cardEl = e.target.closest('.deck-inv-card');
        if (cardEl) showGhostPortal(cardEl);
    });
    invGrid.addEventListener('mouseout', e => {
        if (!e.relatedTarget || !e.relatedTarget.closest?.('.deck-inv-card')) {
            hideGhostPortal();
        }
    });

    // Deck list: +/- controls and click on name
    document.getElementById('decks').addEventListener('click', e => {
        const minus  = e.target.closest('.deck-entry-minus');
        const plus   = e.target.closest('.deck-entry-plus');
        const nameEl = e.target.closest('.deck-entry-name');
        const cmdBtn = e.target.closest('.btn-commander');
        const transferBtn = e.target.closest('.btn-transfer');

        if (transferBtn) {
            const uuid = transferBtn.dataset.uuid;
            const zone = transferBtn.dataset.zone;
            const targetZone = zone === 'mainboard' ? 'sideboard' : 'mainboard';
            const entry = currentDeck[zone].find(en => en.uuid === uuid);
            
            if (entry) {
                // Validación para sideboard límite si va hacia sideboard
                if (targetZone === 'sideboard') {
                    const sideTotal = currentDeck.sideboard.reduce((s,e) => s+e.quantity, 0);
                    if (sideTotal >= SIDE_MAX) {
                        showToast(`Sideboard lleno (${SIDE_MAX}).`, 'warn');
                        return;
                    }
                }
                
                removeCardFromDeck(uuid, zone);
                
                const targetEntry = currentDeck[targetZone].find(en => en.uuid === uuid);
                if (targetEntry) {
                    targetEntry.quantity++;
                } else {
                    currentDeck[targetZone].push({ ...entry, quantity: 1 });
                }
                
                refreshEditor();
            }
        } else if (cmdBtn) {
            const uuid = cmdBtn.dataset.uuid;
            const zone = cmdBtn.dataset.zone;
            const targetZone = zone === 'commander' ? 'mainboard' : 'commander';
            const entry = currentDeck[zone].find(en => en.uuid === uuid);
            
            if (entry) {
                // Validación para evitar más de un comandante
                if (targetZone === 'commander') {
                    const cmdTotal = currentDeck.commander ? currentDeck.commander.reduce((s,e) => s+e.quantity, 0) : 0;
                    if (cmdTotal >= 1) {
                        showToast('Solo puedes tener 1 comandante. Quita el actual primero.', 'warn');
                        return;
                    }
                }

                // Remove one from origin zone
                removeCardFromDeck(uuid, zone);
                
                // Add to target zone (as if it was added from inventory, but we clone it)
                const targetEntry = currentDeck[targetZone].find(en => en.uuid === uuid);
                if (targetEntry) {
                    targetEntry.quantity++;
                } else {
                    currentDeck[targetZone].push({ ...entry, quantity: 1 });
                }
                
                // Force UI update
                refreshEditor();
            }
        } else if (minus) {
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
        if (!e.relatedTarget || !e.relatedTarget.closest?.('.deck-entry-name')) {
            hideHoverPreview();
        }
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
                ${currentDeck.format !== 'commander' ? `<button class="nav-btn deck-modal-add" data-uuid="${card.uuid}" data-zone="sideboard" style="border:1px solid var(--border-color);">+ Añadir al Sideboard</button>` : ''}
            </div>
        </div>`;

    document.getElementById('deck-modal-close').onclick = closeCardModal;
    document.querySelectorAll('.deck-modal-add').forEach(btn => {
        btn.onclick = () => {
            const c = filteredInv.find(i => i.uuid === btn.dataset.uuid);
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
            const dbCard = typeof entry.uuid !== 'undefined' ? getFullCardData(entry.uuid) : null;
            let displayName = entry.name;
            if (dbCard) {
                const lang = state.language || 'en';
                const LANG_MAP = {
                    'es': 'Spanish', 'fr': 'French', 'it': 'Italian', 'de': 'German',
                    'pt': 'Portuguese (Brazil)', 'ja': 'Japanese', 'ko': 'Korean',
                    'ru': 'Russian', 'zhs': 'Chinese Simplified', 'zht': 'Chinese Traditional'
                };
                if (lang !== 'en' && dbCard.foreignData) {
                    const targetLang = LANG_MAP[lang];
                    const foreign = dbCard.foreignData.find(f => f.language === targetLang);
                    if (foreign && foreign.name) displayName = foreign.name;
                }
            }

            const over       = entry.quantity > ownedCount(entry.uuid);
            
            const formatMax  = currentDeck.format === 'commander' ? 1 : MAX_COPIES;
            const atLimit    = !isBasicLand(entry) && totalInDeck(entry.name) >= formatMax;
            
            // Si es commander y tiene más de 1 copia (y no es tierra básica), pintamos de rojo la cantidad
            const isIllegalQuantity = currentDeck.format === 'commander' && !isBasicLand(entry) && entry.quantity > 1;
            
            const noStock    = ownedCount(entry.uuid) <= 0;
            const outOfStock = totalInDeck(entry.name) >= ownedCount(entry.uuid);
            const plusDisabled = (atLimit || noStock || outOfStock) ? 'disabled style="opacity:0.35;cursor:not-allowed"' : '';
            const isSetInactive = state.selectedSets && !state.selectedSets.some(s => s.code === entry.setCode);
            const mv         = getManaValue(entry);
            const manaCost   = getManaCost(entry);
            const costHtml   = manaCost ? parseManaSymbols(manaCost)
                             : `<span class="entry-mv">${mv > 0 ? mv : ''}</span>`;
            html += `<div class="deck-entry ${over?'over-limit':''} ${isSetInactive ? 'set-inactive' : ''}">
                <div class="deck-entry-qty" ${isIllegalQuantity ? 'style="color: #ff4444;"' : ''}>${entry.quantity}</div>
                <div class="deck-entry-name" data-uuid="${entry.uuid}">${displayName}</div>
                <div class="deck-entry-cost">${costHtml}</div>
                <div class="deck-entry-controls">
                    ${currentDeck.format === 'clasico' ? 
                        `<button class="btn-transfer" data-uuid="${entry.uuid}" data-zone="${zone}" title="Mover a ${zone === 'mainboard' ? 'Sideboard' : 'Mainboard'}" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; padding: 0 0.4rem; font-size: 1.1rem;">⇄</button>` : ''}
                    ${currentDeck.format === 'commander' && (zone === 'mainboard' || zone === 'commander') ? 
                        `<button class="btn-commander" data-uuid="${entry.uuid}" data-zone="${zone}" title="${zone === 'commander' ? 'Quitar de Comandante' : 'Hacer Comandante'}">👑</button>` : ''}
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
    const cmd  = currentDeck.commander ? currentDeck.commander.reduce((s,e) => s+e.quantity, 0) : 0;
    
    let isMainValid = false;
    let isSideValid = false;
    let targetMain = MAIN_MIN;
    let targetSide = SIDE_MAX;

    if (currentDeck.format === 'commander') {
        const total = main + cmd;
        targetMain = 100;
        isMainValid = (total === 100);
        isSideValid = (side === 0);
        
        const lbl = document.getElementById('deck-count-label');
        if (lbl) {
            const color = isMainValid ? 'var(--accent-secondary)' : '#ff4444';
            lbl.innerHTML = `<span style="color:${color};font-weight:700">${total}</span>/100`;
        }
        const cmdLbl = document.getElementById('commander-count-label');
        if (cmdLbl) {
            cmdLbl.innerHTML = `(${cmd})`;
        }
    } else {
        // Formato clásico: 60 exacto? No, el usuario dijo "supera las 60"
        isMainValid = (main === MAIN_MIN);
        isSideValid = (side <= SIDE_MAX);
        
        const lbl = document.getElementById('deck-count-label');
        if (lbl) {
            const color = isMainValid ? 'var(--accent-secondary)' : '#ff4444';
            lbl.innerHTML = `<span style="color:${color};font-weight:700">${main}</span>/${MAIN_MIN}`;
        }
    }

    const slbl = document.getElementById('side-count-label');
    if (slbl) {
        const scolor = isSideValid ? 'var(--text-secondary)' : '#ff4444';
        slbl.innerHTML = `<span style="color:${scolor}">${side}</span>/${currentDeck.format === 'commander' ? 0 : SIDE_MAX}`;
    }
}

function updateStats() {
    if (!currentDeck) return;
    const all = [...currentDeck.mainboard, ...(currentDeck.commander || [])];

    // Mana curve with Scryfall SVG labels
    const curve  = Array(8).fill(0);
    all.forEach(card => { 
        // Forzamos a obtener la carta limpia directamente de la base de datos de los sets
        const dbCard = typeof card.uuid !== 'undefined' ? getFullCardData(card.uuid) : getFullCardData(card.id);
        if (!dbCard) {
            console.warn("UUID no encontrado en la base de datos de sets:", card.uuid || card.id);
            return;
        }

        const type = dbCard.type || '';
        if (type.toLowerCase().includes('land')) return; // Skip lands from the curve

        const cmc = dbCard.convertedManaCost !== undefined ? dbCard.convertedManaCost : 0;
        const index = Math.min(parseInt(cmc) || 0, 7);
        console.log("Carta en la curva:", card, "dbCard:", dbCard, "CMC resolved:", cmc, "Index in curve:", index);
        curve[index] += card.quantity; 
    });
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
    renderZone('commander');
    renderZone('mainboard');
    renderZone('sideboard');
    updateDeckCountLabel();
    updateStats(); // always update - stats are now always visible
    renderInventoryGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDecks() {
    switchView('list');
}
