import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn, getCardArtCropUrl, getCardArtCropUrlEn } from '../utils/api.js';
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
let handHistory = [];

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
    const lang = state.language || 'en';
    const localizedUrl = getCardImageUrl(card, lang);
    const fallbackUrl = getCardImageUrlEn(card);
    
    if (img.dataset.cardId !== card.uuid) {
        img.src = localizedUrl;
        img.dataset.cardId = card.uuid;
        img.onerror = function() {
            if (this.src !== fallbackUrl) {
                this.src = fallbackUrl;
            }
        };
    }
    
    img.style.display = 'block';
    positionHoverPreview(evt);
    requestAnimationFrame(() => img.classList.add('visible'));
}
function positionHoverPreview(evt) {
    const img = getHoverImg();
    const itemEl = evt.target.closest('.deck-entry-name[data-uuid]') || evt.target.closest('.deck-entry-row') || evt.target.closest('li');
    const sidebarEl = document.querySelector('.app-sidebar-deckboard') || document.getElementById('de-sidebar');
    
    if (!itemEl || !sidebarEl) return;
    
    const rect = itemEl.getBoundingClientRect();
    const colRect = sidebarEl.getBoundingClientRect();
    
    const zoomStr = getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom') || '1.4';
    const zoom = parseFloat(zoomStr) || 1.4;
    const imgWidth = 220 * zoom; 
    const imgHeight = imgWidth * (3.5 / 2.5); // Magic MTG ratio (88x63)
    
    const gap = 15;
    let x = colRect.left - imgWidth - gap;
    
    // Alineación vertical: centro de la previsualización con el borde superior del item
    let y = rect.top - (imgHeight / 2);
    
    // Boundary checks
    if (y < 10) y = 10;
    if (y + imgHeight > window.innerHeight) y = window.innerHeight - imgHeight - 10;
    if (x < 10) x = 10;

    img.style.left = x + 'px';
    img.style.top  = y + 'px';
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
const isBasicLand = c   => BASIC_LANDS.some(b => c.name?.startsWith(b) || c.name?.includes('Llanura') || c.name?.includes('Isla') || c.name?.includes('Pantano') || c.name?.includes('Montaña') || c.name?.includes('Bosque'));
const ownedCount = entry => {
    if (isBasicLand(entry)) return 999;
    const i = state.inventory.find(i => i.uuid === entry.uuid);
    return i ? (i.regularCount || 0) + (i.foilCount || 0) : 0;
};
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
    
    const clock = document.getElementById('btn-activity-clock');
    if (clock) {
        clock.style.display = v === 'edit' ? 'none' : 'flex';
    }
    
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

    const decksHtml = decks.map(d => {
            const total = d.stats?.totalCards ?? 0;
            const side  = d.stats?.sideboardCards ?? 0;
            const setBadges = [...new Set((d.mainboard || []).map(c => c.setCode))].filter(c => c).map(c => `<span class="set-badge">[${c.toUpperCase()}]</span>`).join('');
            
            let bgStyle = '';
            let editBtn = '';
            const isCommander = d.format === 'commander' || d.format === 'brawl';
            const lang = state.language || 'en';
            
            if (isCommander && d.commander && d.commander.length > 0) {
                const commanderUrl = getCardArtCropUrl(d.commander[0], lang);
                bgStyle = `background-image: linear-gradient(rgba(0,0,0, 0.7), rgba(0,0,0, 0.7)), url('${commanderUrl}');`;
            } else {
                if (d.coverCardArt) {
                    bgStyle = `background-image: linear-gradient(rgba(0,0,0, 0.7), rgba(0,0,0, 0.7)), url('${d.coverCardArt}');`;
                }
                editBtn = `<i class="fa-solid fa-pen deck-cover-edit-btn" data-id="${d.id}" title="Cambiar portada"></i>`;
            }

            return `<div class="deck-card" data-id="${d.id}" style="${bgStyle}">
                ${editBtn}
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

    const ghostCardHtml = `
        <div id="new-deck-btn" class="deck-card deck-create-ghost-card">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.7; transition: opacity 0.2s;">
                <i class="fas fa-plus" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
                <div style="font-weight: bold; font-size: 1.2rem; text-transform: uppercase; letter-spacing: 1px;">Crear Nuevo Mazo</div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="deck-list-header">
            <h2 class="deck-list-title">Mis Mazos</h2>
        </div>
        <div class="deck-cards-grid">${decksHtml}${ghostCardHtml}</div>`;

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
        
        const coverBtn = e.target.closest('.deck-cover-edit-btn');
        if (coverBtn) {
            e.stopPropagation();
            openCoverPicker(parseInt(coverBtn.dataset.id, 10));
        }
    };
}

async function openCoverPicker(deckId) {
    const deck = await getDeck(deckId);
    if (!deck) return;
    
    const modal = document.getElementById('cover-picker-modal');
    const grid = document.getElementById('cover-picker-grid');
    const closeBtn = document.getElementById('cover-picker-close');
    
    if (!modal || !grid) return;
    
    const allCards = [...(deck.mainboard || []), ...(deck.sideboard || [])];
    
    if (allCards.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2rem 0;">Añade cartas a tu mazo en el editor para poder elegir una portada.</div>`;
    } else {
        const uniqueCards = [];
        const seen = new Set();
        for (const c of allCards) {
            if (!seen.has(c.name)) {
                seen.add(c.name);
                uniqueCards.push(c);
            }
        }
        
        const lang = state.language || 'en';
        grid.innerHTML = uniqueCards.map(c => {
            const cropUrl = getCardArtCropUrl(c, lang);
            const fallbackUrl = getCardArtCropUrlEn(c);
            return `<div class="cover-picker-card" data-cardname="${c.name.replace(/"/g, '&quot;')}">
                        <div class="card-art-crop" style="background-image: url('${cropUrl}'), url('${fallbackUrl}');"></div>
                        <span class="cover-card-name">${c.name}</span>
                    </div>`;
        }).join('');
        
        grid.onclick = async e => {
            const cardEl = e.target.closest('.cover-picker-card');
            if (!cardEl) return;
            const cardName = cardEl.dataset.cardname;
            const card = uniqueCards.find(c => c.name === cardName);
            if (card) {
                deck.coverCardArt = getCardArtCropUrl(card, lang);
                await saveDeck(deck);
                modal.style.display = 'none';
                renderListView();
            }
        };
    }
    
    modal.style.display = 'flex';
    
    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = 'none';
    }
    modal.onmousedown = e => {
        if (e.target === modal) modal.style.display = 'none';
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
            <div class="app-sidebar-deckboard" style="position: relative;">
                <button id="btn-toggle-tabletop" class="tabletop-toggle-btn">←</button>
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
                
                <!-- Tabletop Visual Container -->
                <div id="deck-visual-tabletop">
                    <!-- LEFT COLUMN: Cards Area -->
                    <div class="tabletop-card-area">
                        <div id="tabletop-header-row">
                            <div style="display: flex; gap: 15px; align-items: center;">
                                <span style="font-weight:bold; font-size: 1.1rem;">Vista de Mesa</span>
                                <select id="tabletop-sort-criteria" class="deck-format-select" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
                                    <option value="mv">Por Valor de Maná (Curva)</option>
                                    <option value="type">Por Tipo de Carta</option>
                                    <option value="color">Por Color</option>
                                </select>
                            </div>
                        </div>
                        <div class="tabletop-scroll-area">
                            <div>
                                <div class="tabletop-section-title">MAINBOARD</div>
                                <div id="tabletop-board-main" class="tabletop-board"></div>
                            </div>
                            <div>
                                <div class="tabletop-section-title">TIERRAS</div>
                                <div id="tabletop-board-lands" class="tabletop-board"></div>
                            </div>
                            <div>
                                <div class="tabletop-section-title">SIDEBOARD</div>
                                <div id="tabletop-board-side" class="tabletop-board"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- RIGHT COLUMN: Dedicated Stats Sidebar -->
                    <div class="tabletop-dashboard-sidebar">
                        <div class="tabletop-sidebar-block">
                            <div class="tabletop-sidebar-title">Curva de Maná</div>
                            <div id="tabletop-mana-curve" class="mana-curve"></div>
                        </div>
                        <div class="tabletop-sidebar-block">
                            <div class="tabletop-sidebar-title">Distribución de Colores</div>
                            <div id="tabletop-color-dist" class="color-dist"></div>
                        </div>
                        <div class="tabletop-sidebar-block">
                            <div class="tabletop-sidebar-title">Composición</div>
                            <div id="tabletop-deck-composition"></div>
                        </div>
                        <div style="margin-top: auto; padding-top: 1rem;">
                            <button id="btn-sim-starting-hand" class="btn-mythic-accent" style="width: 100%; height: 50px; text-transform: uppercase;">🎲 Simular Mano Inicial</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Card preview modal -->
        <div id="deck-card-modal" class="deck-modal-overlay" style="display:none;">
            <div id="deck-card-modal-content" class="deck-modal-content"></div>
        </div>
        
        <!-- Starting hand simulator modal -->
        <div id="starting-hand-modal" class="deck-modal-overlay" style="display:none; justify-content: center; align-items: center; background: rgba(0,0,0,0.85); z-index: 100000;">
            <div class="starting-hand-modal-content" style="display: flex; flex-direction: column; align-items: center; gap: 2rem; width: 90%; max-width: 1200px; padding: 2rem; background: #1a1a1a; border: 1px solid var(--border-color); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); box-sizing: border-box;">
                <h3 style="font-family: var(--font-heading); font-size: 1.8rem; margin: 0; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 2px;">Simulador de Mano Inicial</h3>
                
                <!-- Horizontal Row of Cards -->
                <div id="starting-hand-cards" style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; width: 100%; min-height: 280px; align-items: center;"></div>
                
                <!-- Analytical Stats Text -->
                <div id="starting-hand-stats" style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary); text-align: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 0.8rem 1.5rem; border-radius: 8px; width: 100%; max-width: 600px; box-sizing: border-box;"></div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 1.5rem; justify-content: center; width: 100%;">
                    <button id="btn-draw-new-hand" class="btn-mythic-accent" style="height: 50px; padding: 0 2rem; font-size: 1rem;">🔄 Robar Nueva Mano</button>
                    <button id="btn-close-hand-modal" class="btn-settings-action" style="height: 50px; padding: 0 2rem; font-size: 1rem; border-color: rgba(255,255,255,0.1); margin: 0;">✕ Cerrar</button>
                </div>
            </div>
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

    // Tabletop Toggle
    const layoutContainer = document.getElementById('de-body');
    const toggleBtn = document.getElementById('btn-toggle-tabletop');
    const sortCriteria = document.getElementById('tabletop-sort-criteria');
    
    if (toggleBtn && layoutContainer) {
        // Inicializar texto
        toggleBtn.innerHTML = layoutContainer.classList.contains('is-expanded') ? '&rarr;' : '&larr;';
        toggleBtn.onclick = () => {
            layoutContainer.classList.toggle('is-expanded');
            const isExp = layoutContainer.classList.contains('is-expanded');
            toggleBtn.innerHTML = isExp ? '&rarr;' : '&larr;';
            if (isExp) renderTabletop();
        };
    }
    
    if (sortCriteria) {
        sortCriteria.onchange = () => {
            if (layoutContainer.classList.contains('is-expanded')) {
                renderTabletop();
            }
        };
    }

    // Advanced search component
    renderSearchUI(document.getElementById('de-search-container'), state.inventory, filtered => {
        filteredInv = filtered.filter(c => !isBasicLand(c));
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
            const isBasic     = isBasicLand(c);
            const atLimit     = !isBasic && inDeck >= MAX_COPIES;
            const bCount      = isBasic ? '∞' : (c.regularCount || 0) + (c.foilCount || 0);
            const outOfStock  = !isBasic && inDeck >= bCount;
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
        const entry = [...(currentDeck?.mainboard||[]), ...(currentDeck?.sideboard||[]), ...(currentDeck?.commander||[])]
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

    // Starting Hand Modal events
    const startingHandModal = document.getElementById('starting-hand-modal');
    const drawNewHandBtn = document.getElementById('btn-draw-new-hand');
    const closeHandModalBtn = document.getElementById('btn-close-hand-modal');
    const simHandBtn = document.getElementById('btn-sim-starting-hand');

    if (startingHandModal) {
        startingHandModal.onclick = e => {
            if (e.target === e.currentTarget) {
                startingHandModal.style.display = 'none';
                handHistory = [];
            }
        };
    }

    if (drawNewHandBtn) {
        drawNewHandBtn.onclick = () => {
            simulateStartingHand();
        };
    }

    if (closeHandModalBtn) {
        closeHandModalBtn.onclick = () => {
            if (startingHandModal) startingHandModal.style.display = 'none';
            handHistory = [];
        };
    }

    if (simHandBtn) {
        simHandBtn.onclick = () => {
            openStartingHandModal();
        };
    }

    refreshEditor();
}

// ── Card preview modal ────────────────────────────────────────────────────────
function openCardModal(uuid) {
    const card = state.inventory.find(i => i.uuid === uuid);
    if (!card) return;
    const imgUrl      = getCardImageUrl(card, state.language || 'en');
    const fallbackUrl = getCardImageUrlEn(card);
    const inDeck      = totalInDeck(card.name);
    const isBasic     = isBasicLand(card);
    const badgeCount  = isBasic ? '∞' : (card.regularCount || 0) + (card.foilCount || 0);

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
                Tienes: <strong style="color:var(--accent-secondary)">${badgeCount}</strong> &nbsp;·&nbsp;
                En mazo: <strong style="color:${!isBasic && inDeck > badgeCount ? '#e74c3c' : 'var(--text-primary)'}">${inDeck}</strong>
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
        const isBasic     = isBasicLand(card);
        const badgeCount  = isBasic ? '∞' : (card.regularCount || 0) + (card.foilCount || 0);
        
        const atLimit     = !isBasic && inDeck >= MAX_COPIES;
        const noStock     = !isBasic && badgeCount <= 0;
        const outOfStock  = !isBasic && inDeck >= badgeCount;
        const isDisabled  = atLimit || noStock || outOfStock;
        
        const cardStyle   = isDisabled ? 'opacity: 0.3; cursor: not-allowed;' 
                          : (inDeck > 0) ? 'border-color: rgba(255, 255, 255, 0.4); box-shadow: inset 0 0 20px rgba(255,255,255,0.1);' : '';
        
        return `
            <div class="deck-inv-card" data-uuid="${card.uuid}" style="${cardStyle}"
                 title="${card.name} — Tienes: ${badgeCount} | En mazo: ${inDeck}">
                <img src="${imgUrl}" alt="${card.name}" loading="lazy" class="deck-inv-img"
                     onload="this.style.opacity=1"
                     onerror="this.onerror=null;this.src='${fallbackUrl}'">
                <div class="card-quantity-badge" style="font-size: ${isBasic ? '1.1rem' : '0.8rem'}; ${isBasic ? 'padding: 0 6px; display:flex; align-items:center;' : ''}">${isBasic ? '∞' : 'x' + badgeCount}</div>
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

            const over       = entry.quantity > ownedCount(entry);
            
            const formatMax  = currentDeck.format === 'commander' ? 1 : MAX_COPIES;
            const atLimit    = !isBasicLand(entry) && totalInDeck(entry.name) >= formatMax;
            
            // Si es commander y tiene más de 1 copia (y no es tierra básica), pintamos de rojo la cantidad
            const isIllegalQuantity = currentDeck.format === 'commander' && !isBasicLand(entry) && entry.quantity > 1;
            
            const noStock    = ownedCount(entry) <= 0;
            const outOfStock = totalInDeck(entry.name) >= ownedCount(entry);
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
    
    // --- Commander Banner Injection ---
    const isCommanderFormat = (currentDeck.format === 'commander' || currentDeck.format === 'brawl');
    const hasCommander = currentDeck.commander && currentDeck.commander.length > 0;
    
    document.querySelectorAll('.commander-stats-banner').forEach(el => el.remove());

    if (isCommanderFormat && hasCommander) {
        const commander = currentDeck.commander[0];
        const lang = state.language || 'en';
        const imgUrl = getCardArtCropUrl(commander, lang);
        const fallbackUrl = getCardArtCropUrlEn(commander);
        
        let dbCard = typeof commander.uuid !== 'undefined' ? getFullCardData(commander.uuid) : getFullCardData(commander.id);
        const name = commander.name;
        let manaCostHtml = '';
        if (dbCard && dbCard.manaCost) {
            manaCostHtml = dbCard.manaCost.replace(/{([^}]+)}/g, '<img src="https://svgs.scryfall.io/card-symbols/$1.svg" class="mana-sym" style="width:16px;height:16px;margin-left:2px">');
        }
        
        const bannerHtml = `
            <div class="commander-stats-banner tabletop-sidebar-block deck-entry-name" data-uuid="${commander.uuid}" style="
                background-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 60%, transparent 100%), url('${imgUrl}'), url('${fallbackUrl}');
                background-size: cover;
                background-position: center 20%;
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 1.5rem;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                display: flex;
                flex-direction: column;
                justify-content: center;
                min-height: 80px;
                cursor: pointer;
                position: relative;
                overflow: hidden;
            ">
                <div style="font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; text-shadow: 0 2px 4px rgba(0,0,0,0.8); position: relative; z-index: 2;">Comandante</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 2;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${name}</span>
                    <span style="display: flex; align-items: center;">${manaCostHtml}</span>
                </div>
            </div>
        `;
        
        const classicContainer = document.getElementById('de-stats-compact');
        if (classicContainer) classicContainer.insertAdjacentHTML('afterbegin', bannerHtml);
        
        const tabletopContainer = document.querySelector('.tabletop-dashboard-sidebar');
        if (tabletopContainer) tabletopContainer.insertAdjacentHTML('afterbegin', bannerHtml);
    }
    // --- End Commander Banner Injection ---

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
    const curveHtml = curve.map((c,i) => {
        const sym = i === 7 ? '∞' : String(i);
        const label = `<img src="https://svgs.scryfall.io/card-symbols/${i}.svg"
            class="mana-sym" style="width:13px;height:13px" onerror="this.outerHTML='${i===7?'7+':i}'">`;
        return `<div class="curve-bar-col">
            <div class="curve-bar-count">${c||''}</div>
            <div class="curve-bar-wrapper" style="flex: 1; display: flex; align-items: flex-end; width: 100%;">
                <div class="curve-bar" style="height:${(c/maxVal)*100}%"></div>
            </div>
            <div class="curve-bar-label">${label}</div>
        </div>`;
    }).join('');

    const curveEl = document.getElementById('mana-curve-bars');
    if (curveEl) curveEl.innerHTML = curveHtml;
    
    const ttCurveEl = document.getElementById('tabletop-mana-curve');
    if (ttCurveEl) ttCurveEl.innerHTML = curveHtml;

    // Color distribution with Scryfall SVG icons
    const colorMap = {};
    all.forEach(e => { (e.colors||[]).forEach(c => { colorMap[c] = (colorMap[c]||0)+e.quantity; }); });
    const total = Object.values(colorMap).reduce((s,v)=>s+v, 0) || 1;
    const distEl = document.getElementById('deck-color-dist');
    const COLOR_SYMBOLS = ['W','U','B','R','G','C'];
    
    const distHtml = COLOR_SYMBOLS
        .filter(c => colorMap[c])
        .map(c => {
            const pct = Math.round((colorMap[c]/total)*100);
            return `<div class="color-dist-row">
                <img src="https://svgs.scryfall.io/card-symbols/${c}.svg" class="mana-sym" style="width:16px;height:16px">
                <div class="color-dist-bar-wrap"><div class="color-dist-bar" style="width:${pct}%"></div></div>
                <span class="color-dist-pct">${pct}%</span>
            </div>`;
        }).join('') || '<p style="color:var(--text-secondary);font-size:0.75rem">Sin colores</p>';

    if (distEl) distEl.innerHTML = distHtml;
    
    const ttDistEl = document.getElementById('tabletop-color-dist');
    if (ttDistEl) ttDistEl.innerHTML = distHtml;

    // ── Composition Stats calculation ──
    const compEl = document.getElementById('tabletop-deck-composition');
    if (compEl) {
        const typeCounts = {
            'Criatura': 0,
            'Instantáneo': 0,
            'Conjuro': 0,
            'Encantamiento': 0,
            'Artefacto': 0,
            'Planeswalker': 0,
            'Tierra': 0,
            'Otros': 0
        };
        let cmcSum = 0;
        let nonLandCount = 0;
        let mainCount = 0;
        
        all.forEach(entry => {
            const dbCard = typeof entry.uuid !== 'undefined' ? getFullCardData(entry.uuid) : null;
            const cardType = (dbCard ? dbCard.type : entry.type) || '';
            const isLand = isBasicLand(entry) || cardType.toLowerCase().includes('land');
            
            const typeGroup = getTypeGroup(cardType);
            typeCounts[typeGroup] = (typeCounts[typeGroup] || 0) + entry.quantity;
            
            if (!isLand) {
                const mv = getManaValue(entry);
                cmcSum += mv * entry.quantity;
                nonLandCount += entry.quantity;
            }
            
            mainCount += entry.quantity;
        });
        
        const sideCount = currentDeck.sideboard ? currentDeck.sideboard.reduce((s, e) => s + e.quantity, 0) : 0;
        const avgMv = nonLandCount > 0 ? (cmcSum / nonLandCount).toFixed(1) : '0.0';
        
        const typeOrder = ['Criatura', 'Instantáneo', 'Conjuro', 'Encantamiento', 'Artefacto', 'Planeswalker', 'Tierra', 'Otros'];
        const typesHtml = typeOrder
            .filter(t => typeCounts[t] > 0)
            .map(t => `<div style="display: flex; justify-content: space-between;">
                <span>${t === 'Criatura' ? 'Criaturas' : t === 'Instantáneo' ? 'Instantáneos' : t === 'Conjuro' ? 'Conjuros' : t === 'Encantamiento' ? 'Encantamientos' : t === 'Artefacto' ? 'Artefactos' : t === 'Planeswalker' ? 'Planeswalkers' : t === 'Tierra' ? 'Tierras' : t}:</span>
                <strong style="color: var(--text-primary);">${typeCounts[t]}</strong>
            </div>`)
            .join('');
            
        compEl.innerHTML = `
            <div class="composition-wrapper" style="display: flex; flex-direction: column; gap: 0.8rem; font-size: 0.9rem; color: var(--text-secondary);">
                <div class="comp-types" style="display: flex; flex-direction: column; gap: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.6rem;">
                    ${typesHtml || '<div style="font-style:italic; opacity:0.6;">Sin cartas</div>'}
                </div>
                
                <div class="comp-avg-mv" style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.6rem;">
                    <span>MV Promedio (sin tierras):</span>
                    <strong style="color: var(--text-primary);">${avgMv}</strong>
                </div>
                
                <div class="comp-legality" style="display: flex; flex-direction: column; gap: 0.4rem;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Mainboard:</span>
                        <strong style="color: ${mainCount > 60 ? '#ff4444' : 'var(--text-primary)'};">${mainCount} / 60</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Sideboard:</span>
                        <strong style="color: var(--text-primary);">${sideCount} / 15</strong>
                    </div>
                </div>
            </div>
        `;
    }
}

// ── Tabletop Mode Logic ───────────────────────────────────────────────────────
function renderTabletop() {
    if (!currentDeck) return;
    
    updateStats(); // Force re-render of the stats directly
    
    const criteria = document.getElementById('tabletop-sort-criteria')?.value || 'mv';
    const mainCardsRaw = [...currentDeck.mainboard, ...(currentDeck.commander || [])];
    const sideCards = currentDeck.sideboard || [];
    
    // Split spells and lands
    const mainCards = mainCardsRaw.filter(entry => {
        const dbCard = getFullCardData(entry.uuid);
        const isLand = isBasicLand(entry) || (dbCard && dbCard.type?.toLowerCase().includes('land'));
        return !isLand;
    });
    const landsCards = mainCardsRaw.filter(entry => {
        const dbCard = getFullCardData(entry.uuid);
        return isBasicLand(entry) || (dbCard && dbCard.type?.toLowerCase().includes('land'));
    });
    
    const renderBoard = (cards, containerId, emptyText) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (cards.length === 0) {
            container.innerHTML = `<div style="color: var(--text-secondary); opacity: 0.5; padding: 1rem 0; font-style: italic; width: 100%;">— ${emptyText} —</div>`;
            return;
        }

        const groups = {};
        
        cards.forEach(entry => {
            const dbCard = typeof entry.uuid !== 'undefined' ? getFullCardData(entry.uuid) : null;
            let groupKey = 'Otro';
            let sortOrder = 0;
            
            if (containerId === 'tabletop-board-lands') {
                const typeLine = (dbCard ? dbCard.type : entry.type) || '';
                const isBasic = typeLine.toLowerCase().includes('basic') || typeLine.toLowerCase().includes('básica');
                if (isBasic) {
                    groupKey = 'Tierras Básicas';
                    sortOrder = 1;
                } else {
                    groupKey = 'Tierras Especiales';
                    sortOrder = 2;
                }
            } else if (criteria === 'mv') {
                const cmc = dbCard && dbCard.convertedManaCost !== undefined ? dbCard.convertedManaCost : 0;
                const index = Math.min(parseInt(cmc) || 0, 7);
                groupKey = index === 7 ? '7+' : String(index);
                sortOrder = index;
            } else if (criteria === 'type') {
                groupKey = getTypeGroup(entry.type);
                const TYPE_ORDER = ['Criatura','Instantáneo','Conjuro','Encantamiento','Artefacto','Planeswalker','Tierra','Otros'];
                sortOrder = TYPE_ORDER.indexOf(groupKey);
                if(sortOrder === -1) sortOrder = 99;
            } else if (criteria === 'color') {
                const colors = entry.colors || [];
                if (colors.length === 0) { groupKey = 'Incoloro'; sortOrder = 7; }
                else if (colors.length > 1) { groupKey = 'Multicolor'; sortOrder = 6; }
                else {
                    const c = colors[0];
                    if (c === 'W') { groupKey = 'Blanco'; sortOrder = 1; }
                    else if (c === 'U') { groupKey = 'Azul'; sortOrder = 2; }
                    else if (c === 'B') { groupKey = 'Negro'; sortOrder = 3; }
                    else if (c === 'R') { groupKey = 'Rojo'; sortOrder = 4; }
                    else if (c === 'G') { groupKey = 'Verde'; sortOrder = 5; }
                }
            }
            
            if (!groups[groupKey]) groups[groupKey] = { label: groupKey, order: sortOrder, items: [] };
            
            // Expand quantities into individual cards for tabletop view
            for (let i = 0; i < entry.quantity; i++) {
                groups[groupKey].items.push(entry);
            }
        });
        
        const processedGroups = [];
        const sortedKeys = Object.keys(groups).sort((a,b) => groups[a].order - groups[b].order);
        
        sortedKeys.forEach(k => {
            const g = groups[k];
            const MAX_CARDS = 10;
            if (g.items.length > MAX_CARDS) {
                for (let i = 0; i < g.items.length; i += MAX_CARDS) {
                    const chunk = g.items.slice(i, i + MAX_CARDS);
                    processedGroups.push({
                        label: i === 0 ? g.label : `${g.label} (cont.)`,
                        items: chunk,
                        totalCount: g.items.length
                    });
                }
            } else {
                processedGroups.push({ label: g.label, items: g.items, totalCount: g.items.length });
            }
        });
        
        container.innerHTML = processedGroups.map(g => {
            const cardsHtml = g.items.map(entry => {
                const lang = state.language || 'en';
                const imgUrl = getCardImageUrl(entry, lang);
                const fallbackUrl = getCardImageUrlEn(entry);
                return `<div class="tabletop-card-container" data-uuid="${entry.uuid}" title="${entry.name}">
                            <div class="tabletop-card" style="background-image: url('${imgUrl}'), url('${fallbackUrl}')"></div>
                        </div>`;
            }).join('');
            
            return `<div class="tabletop-column">
                <div class="tabletop-column-header">${g.label} <span style="opacity: 0.6; font-size: 0.7rem;">(${g.totalCount})</span></div>
                ${cardsHtml}
            </div>`;
        }).join('');
    };
    
    renderBoard(mainCards, 'tabletop-board-main', 'Sin cartas');
    renderBoard(landsCards, 'tabletop-board-lands', 'Sin tierras');
    renderBoard(sideCards, 'tabletop-board-side', 'Sideboard vacío');
}

function refreshEditor() {
    renderZone('commander');
    renderZone('mainboard');
    renderZone('sideboard');
    updateDeckCountLabel();
    updateStats(); // always update - stats are now always visible
    renderInventoryGrid();
    
    const layoutContainer = document.getElementById('de-body');
    if (layoutContainer && layoutContainer.classList.contains('is-expanded')) {
        renderTabletop();
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initDecks() {
    switchView('list');
}

// ── Starting Hand Simulator ──────────────────────────────────────────────────
function openStartingHandModal() {
    const modal = document.getElementById('starting-hand-modal');
    if (!modal) return;
    
    // Clear history when opening
    handHistory = [];
    
    modal.style.display = 'flex';
    simulateStartingHand();
}

function simulateStartingHand() {
    if (!currentDeck) return;
    
    const mainCards = [...currentDeck.mainboard];
    if (currentDeck.format === 'commander' && currentDeck.commander) {
        mainCards.push(...currentDeck.commander);
    }
    
    const rawCards = [];
    mainCards.forEach(entry => {
        for (let i = 0; i < entry.quantity; i++) {
            rawCards.push(entry);
        }
    });

    if (rawCards.length < 7) {
        showToast("Necesitas al menos 7 cartas en el mazo principal para simular una mano.", "warn");
        const modal = document.getElementById('starting-hand-modal');
        if (modal) modal.style.display = 'none';
        handHistory = [];
        return;
    }

    // Shuffle using Fisher-Yates
    for (let i = rawCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawCards[i], rawCards[j]] = [rawCards[j], rawCards[i]];
    }

    // Draw 7 cards
    const hand = rawCards.slice(0, 7);

    // Calculate Lands and average MV for this hand
    let landCount = 0;
    let mvSum = 0;
    let nonLandCount = 0;
    
    hand.forEach(entry => {
        const dbCard = typeof entry.uuid !== 'undefined' ? getFullCardData(entry.uuid) : null;
        const cardType = (dbCard ? dbCard.type : entry.type) || '';
        const isLand = isBasicLand(entry) || cardType.toLowerCase().includes('land');
        
        if (isLand) {
            landCount++;
        } else {
            const mv = getManaValue(entry);
            mvSum += mv;
            nonLandCount++;
        }
    });

    // Protect against division by zero (7-land draw) returning NaN
    const handAvgMv = nonLandCount > 0 ? (mvSum / nonLandCount).toFixed(1) : "0.0";

    // Update history
    handHistory.push({ lands: landCount, avgMv: handAvgMv });
    if (handHistory.length > 5) {
        handHistory.shift(); // Keep only last 5 draws
    }

    // Render hand
    const cardsContainer = document.getElementById('starting-hand-cards');
    const statsContainer = document.getElementById('starting-hand-stats');

    if (cardsContainer) {
        const lang = state.language || 'en';
        cardsContainer.innerHTML = hand.map(entry => {
            const imgUrl = getCardImageUrl(entry, lang);
            const fallbackUrl = getCardImageUrlEn(entry);
            
            return `<div class="starting-hand-card-item" style="width: 140px; height: 195px; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.5); transition: transform 0.2s; cursor: pointer;" 
                         onmouseover="this.style.transform='scale(1.1) translateY(-10px)'" 
                         onmouseout="this.style.transform='scale(1)'">
                <img src="${imgUrl}" alt="${entry.name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.src='${fallbackUrl}';">
            </div>`;
        }).join('');
    }

    if (statsContainer) {
        const totalHands = handHistory.length;
        const avgLands = (handHistory.reduce((s, h) => s + h.lands, 0) / totalHands).toFixed(1);
        const avgMvOverHistory = (handHistory.reduce((s, h) => s + parseFloat(h.avgMv), 0) / totalHands).toFixed(1);
        
        statsContainer.innerHTML = `📊 Media (últimos ${totalHands} robos): <strong style="color:var(--accent-secondary);">${avgLands}</strong> Tierras | MV Medio: <strong style="color:var(--accent-secondary);">${avgMvOverHistory}</strong>`;
    }
}
