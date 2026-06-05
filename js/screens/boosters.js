import { state } from '../utils/state.js';
import { saveToInventory, getInventoryMap } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

// ─── Module-level state (no memory leaks: single instance) ───────────────────
let pendingCards = [];
let customConfig = {
    counts: { common: 10, uncommon: 3, rare: 1, mythic: 0 },
    colors: [],        // [] = all colors
    smartFilter: true  // exclude cards with ≥4 copies
};

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initBoosters() {
    const container = document.getElementById('boosters');

    container.innerHTML = `
        <div id="boosters-header">
            <h2>Apertura de Sobres</h2>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Cargando sets disponibles...</p>
        </div>

        <!-- Result Area -->
        <div id="booster-result-container" style="display: none; margin-bottom: 2rem; padding: 2rem; background: rgba(0,0,0,0.6); border-radius: 12px; border: 1px solid var(--accent-color); backdrop-filter: blur(10px);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="color: var(--accent-hover);">Contenido del Sobre</h3>
                <div style="display: flex; gap: 1rem; width: 320px; justify-content: flex-end;">
                    <button id="discard-booster" class="nav-btn" style="flex: 1; padding: 0.6rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">Descartar</button>
                    <button id="add-booster-to-inv" class="save-btn" style="flex: 1; padding: 0.6rem; cursor: pointer;">Añadir a Colección</button>
                </div>
            </div>
            
            <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 300px;">
                    <div id="booster-stock-warning" style="display: none; color: #f1c40f; font-size: 0.85rem; margin-bottom: 1rem; padding: 0.5rem 1rem; border: 1px solid #f1c40f44; border-radius: 6px; background: rgba(241,196,15,0.08);">
                        ⚠️ Colección completada para estos criterios. Se muestran todas las cartas disponibles.
                    </div>
                    <div id="booster-result" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem;"></div>
                </div>
                
                <div id="booster-export-wrapper" style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column;">
                    <h4 style="color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.9rem;">Lista de Texto:</h4>
                    <textarea id="booster-export-text" readonly style="width: 100%; height: 500px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #aaa; padding: 0.8rem; font-family: monospace; resize: none; outline: none;"></textarea>
                </div>
            </div>
        </div>

        <div id="boosters-grid" class="set-grid"></div>

        <!-- Detail Modal for Zoom -->
        <div id="booster-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); backdrop-filter: blur(15px); z-index: 10000; justify-content: center; align-items: center;">
            <div id="booster-modal-content" style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 24px; padding: 3rem; display: flex; flex-wrap: wrap; gap: 3rem; max-width: 1000px; width: 95%; max-height: 90vh; overflow-y: auto; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.8);"></div>
        </div>
    `;

    // Render set cards reactively
    let lastSetsCount = -1;
    const render = ({ activeSetsData }) => {
        const header  = document.getElementById('boosters-header');
        const grid    = document.getElementById('boosters-grid');

        if (!activeSetsData || activeSetsData.length === 0) {
            header.innerHTML = `
                <h2>Apertura de Sobres</h2>
                <div style="text-align: center; margin-top: 4rem;">
                    <p style="color: var(--text-secondary)">No hay sets sincronizados. Ve a <strong>Configuración</strong> para añadir sets.</p>
                </div>`;
            grid.innerHTML = '';
            return;
        }

        if (activeSetsData.length === lastSetsCount) return;
        lastSetsCount = activeSetsData.length;

        header.innerHTML = `
            <h2>Apertura de Sobres</h2>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">Elige un set y un modo de apertura.</p>`;

        const cardsHtml = activeSetsData.map((setData, index) => {
            return `
            <!-- Flat UI: Sobre Individual -->
            <div class="set-card" data-index="${index}" style="padding: 1.5rem; position: relative; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px solid var(--border-color);">
                <button class="nav-btn open-booster-custom" data-index="${index}" style="position: absolute; top: 1rem; right: 1rem; padding: 0.4rem; border-radius: 6px; font-size: 1rem; background: rgba(255,255,255,0.1); border: none;" title="Configuración Custom">⚙️</button>
                <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-3x" style="color: var(--accent-color); margin-bottom: 0.8rem;"></i>
                <h3 style="margin-bottom: 0.2rem; font-family: var(--font-heading); font-size: 1.1rem;">${setData.code}</h3>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${setData.name}</div>
                <div style="font-size: 0.75rem; color: #aaa; margin-bottom: 1.5rem;">Sobre Individual (15 Cartas)</div>
                <button class="save-btn open-booster-classic" data-index="${index}" style="width: 100%; padding: 0.8rem; font-size: 0.95rem;">
                    🗡️ Abrir 1 Sobre
                </button>
            </div>

            <!-- Flat UI: Caja de Sobres -->
            <div class="set-card" data-index="${index}" style="padding: 1.5rem; position: relative; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px solid var(--border-color);">
                <button class="nav-btn open-booster-custom" data-index="${index}" style="position: absolute; top: 1rem; right: 1rem; padding: 0.4rem; border-radius: 6px; font-size: 1rem; background: rgba(255,255,255,0.1); border: none;" title="Configuración Custom">⚙️</button>
                <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-4x" style="color: var(--accent-color); margin-bottom: 0.8rem; opacity: 0.8;"></i>
                <h3 style="margin-bottom: 0.2rem; font-family: var(--font-heading); font-size: 1.1rem;">${setData.code}</h3>
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${setData.name}</div>
                <div style="font-size: 0.75rem; color: #aaa; margin-bottom: 1.5rem;">Caja de Sobres</div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="number" class="mass-open-count" data-index="${index}" value="36" min="1" max="100" style="width: 60px; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.4); color: #fff; font-size: 0.95rem; text-align: center;">
                    <button class="save-btn open-booster-mass-classic" data-index="${index}" style="flex: 1; padding: 0.8rem; font-size: 0.95rem; background: var(--accent-hover);">
                        📦 Abrir Múltiples
                    </button>
                </div>
            </div>
            `;
        }).join('');
        
        grid.innerHTML = cardsHtml;

        // Render custom panels for each set (hidden by default)
        const customPanelsHTML = activeSetsData.map((setData, index) => `
            <div id="custom-panel-${index}" class="custom-config-panel" data-index="${index}" style="display: none;">
                <div class="custom-config-panel-inner">
                    <h4 style="margin-bottom: 1.5rem; color: var(--accent-hover);">⚙️ Configuración Custom — ${setData.name}</h4>

                    <div style="display: flex; flex-wrap: wrap; gap: 2rem; margin-bottom: 1.5rem;">
                        <!-- Rareza -->
                        <div class="custom-section">
                            <label class="custom-label">Cantidad por Rareza</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
                                ${[
                                    { key: 'common',   label: 'C', color: '#ccc',    default: 10 },
                                    { key: 'uncommon', label: 'U', color: '#3498db', default: 3 },
                                    { key: 'rare',     label: 'R', color: '#f1c40f', default: 1 },
                                    { key: 'mythic',   label: 'M', color: '#e74c3c', default: 0 }
                                ].map(r => `
                                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.04); padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                                        <span style="font-weight: 900; color: ${r.color}; font-size: 1rem; width: 14px;">${r.label}</span>
                                        <input type="number" class="rarity-input" data-rarity="${r.key}" min="0" max="30" value="${r.default}"
                                            style="width: 50px; background: transparent; border: none; color: #fff; font-size: 1rem; font-weight: 600; text-align: center;">
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Color Identity -->
                        <div class="custom-section">
                            <label class="custom-label">Identidad de Color <span style="font-size: 0.75rem; opacity: 0.6;">(vacío = todos)</span></label>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                ${[
                                    { c: 'W', icon: '☀', bg: '#fffddd', fg: '#333' },
                                    { c: 'U', icon: '💧', bg: '#c1d8e9', fg: '#333' },
                                    { c: 'B', icon: '💀', bg: '#bab1ab', fg: '#333' },
                                    { c: 'R', icon: '🔥', bg: '#f9aa8f', fg: '#333' },
                                    { c: 'G', icon: '🌳', bg: '#9bd3ae', fg: '#333' }
                                ].map(m => `
                                    <button class="color-identity-btn" data-color="${m.c}"
                                        style="width: 40px; height: 40px; border-radius: 50%; background: ${m.bg}; color: ${m.fg}; border: 3px solid transparent; font-size: 1.2rem; cursor: pointer; transition: all 0.2s;">
                                        ${m.icon}
                                    </button>
                                `).join('')}
                            </div>
                            <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.5rem;">Incluye artefactos e incoloras automáticamente.</p>
                        </div>

                        <!-- Smart Filter -->
                        <div class="custom-section">
                            <label class="custom-label">Protección de Colección</label>
                            <label style="display: flex; align-items: center; gap: 0.8rem; cursor: pointer;">
                                <input type="checkbox" id="smart-filter-${index}" class="smart-filter-cb" checked
                                    style="width: 18px; height: 18px; accent-color: var(--accent-color);">
                                <span style="font-size: 0.9rem;">Omitir cartas con ≥ 4 copias</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Insert custom panels after the grid
        let panelContainer = document.getElementById('custom-panels-container');
        if (!panelContainer) {
            panelContainer = document.createElement('div');
            panelContainer.id = 'custom-panels-container';
            grid.after(panelContainer);
        }
        panelContainer.innerHTML = customPanelsHTML;
    };

    render(state);
    state.subscribe(render);

    // Ghost Portal Zoom
    container.addEventListener('mouseover', e => {
        const cardEl = e.target.closest('.booster-card-item');
        if (cardEl) showGhostPortal(cardEl);
    });
    container.addEventListener('mouseout', e => {
        if (!e.relatedTarget || !e.relatedTarget.closest?.('.booster-card-item')) {
            hideGhostPortal();
        }
    });
}

// ── Ghost Portal Zoom (Escape Overflow) ───────────────────────────────────────
let ghostPortal = null;
function getGhostPortal() {
    if (!ghostPortal) {
        ghostPortal = document.createElement('div');
        ghostPortal.className = 'ghost-zoom-portal';
        
        const inner = document.createElement('div');
        inner.className = 'ghost-portal-inner';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.borderRadius = 'inherit';
        inner.style.transition = 'transform 0.1s ease-out';
        
        const img = document.createElement('img');
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.borderRadius = 'inherit';
        img.style.display = 'block';
        
        inner.appendChild(img);
        ghostPortal.appendChild(inner);
        document.body.appendChild(ghostPortal);
    }
    return ghostPortal;
}

function showGhostPortal(cardEl) {
    const portal = getGhostPortal();
    const inner = portal.querySelector('.ghost-portal-inner');
    const imgEl  = cardEl.querySelector('img');
    if (!imgEl) return;

    portal.dataset.activeUuid = cardEl.dataset.uuid;

    if (cardEl.classList.contains('foil-card-effect')) {
        inner.classList.add('foil-card-effect');
    } else {
        inner.classList.remove('foil-card-effect');
        inner.style.transform = 'none';
    }

    const rect = cardEl.getBoundingClientRect();
    const zoom = getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom') || '1.4';

    // Boundary check for left edge
    const z = parseFloat(zoom) || 1.4;
    const offset = (rect.width * (z - 1)) / 2;
    let finalLeft = rect.left;
    if (finalLeft - offset < 20) finalLeft = 20 + offset;

    const portalImg = inner.querySelector('img');
    portalImg.src = imgEl.src;
    portal.style.width  = rect.width + 'px';
    portal.style.height = rect.height + 'px';
    portal.style.top    = rect.top + 'px';
    portal.style.left   = finalLeft + 'px';
    
    portal.style.display = 'block';
    requestAnimationFrame(() => {
        portal.classList.add('visible');
        portal.style.transform = `scale(${zoom})`;
        
        if (cardEl.classList.contains('foil-card-effect')) {
            const rotX = cardEl.style.getPropertyValue('--rot-x') || '0deg';
            const rotY = cardEl.style.getPropertyValue('--rot-y') || '0deg';
            inner.style.setProperty('--pos-x', cardEl.style.getPropertyValue('--pos-x') || '50%');
            inner.style.setProperty('--pos-y', cardEl.style.getPropertyValue('--pos-y') || '50%');
            inner.style.setProperty('--rot-x', rotX);
            inner.style.setProperty('--rot-y', rotY);
            inner.style.transform = `perspective(1000px) rotateX(${rotX}) rotateY(${rotY})`;
        }
    });
}

function hideGhostPortal() {
    if (!ghostPortal) return;
    ghostPortal.classList.remove('visible');
    ghostPortal.style.transform = 'scale(1)';
    const inner = ghostPortal.querySelector('.ghost-portal-inner');
    if (inner) {
        inner.style.transform = 'none';
        inner.classList.remove('foil-card-effect');
    }
    setTimeout(() => { if (!ghostPortal.classList.contains('visible')) ghostPortal.style.display = 'none'; }, 200);
}

// ─── Exported actions (called from app.js global delegation) ──────────────────

async function generateBoosterWithPanelSettings(setData, index, runningInventoryMap = null) {
    const panel = document.getElementById(`custom-panel-${index}`);
    if (!panel) return { cards: await generateBoosterClassic(setData), stockWarning: false };

    const counts = {};
    panel.querySelectorAll('.rarity-input').forEach(inp => {
        counts[inp.dataset.rarity] = parseInt(inp.value, 10) || 0;
    });

    const colors = [];
    panel.querySelectorAll('.color-identity-btn.active').forEach(btn => {
        colors.push(btn.dataset.color);
    });

    const smartFilter = panel.querySelector('.smart-filter-cb')?.checked ?? true;

    let inventoryMap = runningInventoryMap;
    if (!inventoryMap && smartFilter) {
        inventoryMap = await getInventoryMap();
    }
    if (!smartFilter) inventoryMap = new Map();

    const result = await generateBoosterCustom(setData, counts, colors, inventoryMap);

    if (runningInventoryMap && smartFilter) {
        result.cards.forEach(c => {
            const current = runningInventoryMap.get(c.uuid) || { regularCount: 0, foilCount: 0 };
            const updated = { ...current };
            if (c.isFoil) {
                updated.foilCount = (updated.foilCount || 0) + 1;
            } else {
                updated.regularCount = (updated.regularCount || 0) + 1;
            }
            runningInventoryMap.set(c.uuid, updated);
        });
    }

    return result;
}

export async function openBoosterClassic(index) {
    console.log('INICIANDO APERTURA — Sobre Individual');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const btn = document.querySelector(`.open-booster-classic[data-index="${index}"]`);
    if (btn) { btn.innerText = 'Abriendo...'; btn.disabled = true; }

    const result = await generateBoosterWithPanelSettings(setData, index);
    
    state.currentOpeningPack = {
        cards: result.cards,
        bonusUpgrades: result.bonusUpgrades
    };
    displayBooster(result.cards, result.stockWarning, false, result.bonusUpgrades);

    if (btn) { btn.innerText = '🗡️ Abrir 1 Sobre'; btn.disabled = false; }
}

export async function openBoosterMassClassic(index) {
    console.log('INICIANDO APERTURA MASIVA — Caja');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const input = document.querySelector(`.mass-open-count[data-index="${index}"]`);
    const count = parseInt(input?.value, 10) || 36;
    if (count <= 0 || count > 100) {
        alert("El número de sobres debe ser entre 1 y 100");
        return;
    }

    const btn = document.querySelector(`.open-booster-mass-classic[data-index="${index}"]`);
    if (btn) { btn.innerText = 'Abriendo...'; btn.disabled = true; }

    const smartFilter = document.querySelector(`#custom-panel-${index} .smart-filter-cb`)?.checked ?? true;
    let runningInventoryMap = smartFilter ? await getInventoryMap() : new Map();

    let allCards = [];
    let allBonusUpgrades = [];
    let anyStockWarning = false;
    for (let i = 0; i < count; i++) {
        const result = await generateBoosterWithPanelSettings(setData, index, runningInventoryMap);
        allCards = allCards.concat(result.cards);
        if (result.bonusUpgrades) allBonusUpgrades = allBonusUpgrades.concat(result.bonusUpgrades);
        if (result.stockWarning) anyStockWarning = true;
    }
    
    state.currentOpeningPack = {
        cards: allCards,
        bonusUpgrades: allBonusUpgrades
    };
    displayBooster(allCards, anyStockWarning, true, allBonusUpgrades);

    if (btn) { btn.innerText = '📦 Abrir Múltiples'; btn.disabled = false; }
}

export async function openBoosterCustom(index) {
    // Toggle the custom config panel
    const panel = document.getElementById(`custom-panel-${index}`);
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    // Close all panels first
    document.querySelectorAll('.custom-config-panel').forEach(p => p.style.display = 'none');
    if (!isVisible) {
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

export async function openBoosterCustomConfirm(index) {
    console.log('INICIANDO APERTURA — Modo Custom');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const panel = document.getElementById(`custom-panel-${index}`);

    // Read config from panel
    const counts = {};
    panel.querySelectorAll('.rarity-input').forEach(inp => {
        counts[inp.dataset.rarity] = parseInt(inp.value, 10) || 0;
    });

    const colors = [];
    panel.querySelectorAll('.color-identity-btn.active').forEach(btn => {
        colors.push(btn.dataset.color);
    });

    const smartFilter = panel.querySelector('.smart-filter-cb')?.checked ?? true;

    const btn = panel.querySelector('.open-booster-custom-confirm');
    if (btn) { btn.innerText = 'GENERANDO...'; btn.disabled = true; }

    const inventoryMap = smartFilter ? await getInventoryMap() : new Map();
    const { cards, stockWarning } = await generateBoosterCustom(setData, counts, colors, inventoryMap);
    state.currentOpeningPack = cards;
    displayBooster(state.currentOpeningPack, stockWarning);

    if (btn) { btn.innerText = '⚡ Generar 1 Sobre Custom'; btn.disabled = false; }
}

export async function openBoosterMassCustomConfirm(index) {
    console.log('INICIANDO APERTURA MASIVA — Modo Custom');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const panel = document.getElementById(`custom-panel-${index}`);
    const input = panel.querySelector('.mass-custom-count');
    const count = parseInt(input?.value, 10) || 36;
    
    if (count <= 0 || count > 100) {
        alert("El número de sobres debe ser entre 1 y 100");
        return;
    }

    const counts = {};
    panel.querySelectorAll('.rarity-input').forEach(inp => {
        counts[inp.dataset.rarity] = parseInt(inp.value, 10) || 0;
    });

    const colors = [];
    panel.querySelectorAll('.color-identity-btn.active').forEach(btn => {
        colors.push(btn.dataset.color);
    });

    const smartFilter = panel.querySelector('.smart-filter-cb')?.checked ?? true;

    const btn = panel.querySelector('.open-booster-mass-custom-confirm');
    if (btn) { btn.innerText = 'GENERANDO...'; btn.disabled = true; }

    const inventoryMap = smartFilter ? await getInventoryMap() : new Map();
    
    let allCards = [];
    let anyStockWarning = false;
    for (let i = 0; i < count; i++) {
        const { cards, stockWarning } = await generateBoosterCustom(setData, counts, colors, inventoryMap);
        allCards = allCards.concat(cards);
        if (stockWarning) anyStockWarning = true;
    }
    
    state.currentOpeningPack = allCards;
    displayBooster(state.currentOpeningPack, anyStockWarning);

    if (btn) { btn.innerText = '📦 Generar Caja Custom'; btn.disabled = false; }
}

export async function confirmBoosterSave() {
    if (!state.currentOpeningPack || !state.currentOpeningPack.cards || state.currentOpeningPack.cards.length === 0) return;
    try {
        const allCardsToSave = [...state.currentOpeningPack.cards, ...(state.currentOpeningPack.bonusUpgrades || [])];
        await saveToInventory(allCardsToSave, 'booster');
        state.incrementSessionCards(allCardsToSave.length);
        await state.loadInventory();
        document.getElementById('booster-result-container').style.display = 'none';
        document.getElementById('booster-stock-warning').style.display = 'none';
        state.currentOpeningPack = { cards: [], bonusUpgrades: [] };
        alert('¡Cartas añadidas correctamente!');
    } catch (err) {
        console.error('Error al guardar sobres:', err);
        alert('Error al guardar en el inventario.');
    }
}

export function discardBooster() {
    document.getElementById('booster-result-container').style.display = 'none';
    document.getElementById('booster-stock-warning').style.display = 'none';
    state.currentOpeningPack = { cards: [], bonusUpgrades: [] };
}

let currentBoosterModalIndex = -1;

export function openBoosterModal(uuid) {
    const allPacks = [...(state.currentOpeningPack.cards || []), ...(state.currentOpeningPack.bonusUpgrades || [])];
    const cardData = allPacks.find(c => c.uuid === uuid);
    if (!cardData) return;
    
    const modal = document.getElementById('booster-modal');
    const content = document.getElementById('booster-modal-content');

    currentBoosterModalIndex = state.currentOpeningPack.findIndex(c => c.uuid === uuid);

    const updateView = (data) => {
        const lang = state.language || 'en';
        const imgUrl = getCardImageUrl(data, lang);
        const fallbackUrl = getCardImageUrlEn(data);

        // Custom styling for arrows based on theme
        const arrowStyle = `
            background: rgba(20, 15, 12, 0.8);
            border: 1px solid var(--accent-secondary);
            color: var(--accent-secondary);
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        `;

        content.innerHTML = `
            <button id="modal-prev" class="modal-nav-btn" style="${arrowStyle}"><i class="fas fa-chevron-left"></i></button>
            <button id="modal-next" class="modal-nav-btn" style="${arrowStyle}"><i class="fas fa-chevron-right"></i></button>
            
            <div style="flex: 1; min-width: 350px; display: flex; justify-content: center;">
                <img src="${imgUrl}" style="width: 100%; max-width: 400px; border-radius: 20px; box-shadow: 0 20px 80px rgba(0,0,0,0.9);" onerror="this.src='${fallbackUrl}';">
            </div>
            <div style="flex: 1.2; min-width: 350px; display: flex; flex-direction: column; justify-content: center;">
                <h2 style="font-size: 2.5rem; margin-bottom: 1rem; font-family: var(--font-heading); color: #fff;">${data.name}</h2>
                <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 3rem; opacity: 0.7;">
                    <i class="ss ss-${data.setCode.toLowerCase()} ss-2x"></i>
                    <span style="font-size: 1.1rem; letter-spacing: 2px;">${data.setCode.toUpperCase()} — ${data.rarity.toUpperCase()}</span>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 2rem; border-radius: 20px; backdrop-filter: blur(5px);">
                    <p style="color: var(--text-secondary); line-height: 1.6; margin: 0;">Esta es una vista previa de la carta contenida en el sobre. Para añadirla a tu colección junto con el resto del sobre, cierra esta ventana y pulsa en <strong>'Añadir a Colección'</strong>.</p>
                </div>
            </div>
            <button id="booster-modal-close" style="position: absolute; top: 2rem; right: 2rem; background: transparent; border: none; color: #fff; font-size: 2.5rem; cursor: pointer; opacity: 0.3; transition: opacity 0.2s;">✕</button>
        `;

        document.getElementById('booster-modal-close').onclick = () => {
            modal.style.display = 'none';
            window.removeEventListener('keydown', handleKeyNav);
        };

        const navigate = (dir) => {
            currentBoosterModalIndex += dir;
            if (currentBoosterModalIndex < 0) currentBoosterModalIndex = state.currentOpeningPack.length - 1;
            if (currentBoosterModalIndex >= state.currentOpeningPack.length) currentBoosterModalIndex = 0;
            updateView(state.currentOpeningPack[currentBoosterModalIndex]);
        };

        document.getElementById('modal-prev').onclick = (e) => { e.stopPropagation(); navigate(-1); };
        document.getElementById('modal-next').onclick = (e) => { e.stopPropagation(); navigate(1); };
    };

    const handleKeyNav = (e) => {
        if (e.key === 'ArrowRight') navigateFromKey(1);
        if (e.key === 'ArrowLeft') navigateFromKey(-1);
        if (e.key === 'Escape') document.getElementById('booster-modal-close').click();
    };

    const navigateFromKey = (dir) => {
        currentBoosterModalIndex += dir;
        if (currentBoosterModalIndex < 0) currentBoosterModalIndex = state.currentOpeningPack.length - 1;
        if (currentBoosterModalIndex >= state.currentOpeningPack.length) currentBoosterModalIndex = 0;
        updateView(state.currentOpeningPack[currentBoosterModalIndex]);
    };

    window.addEventListener('keydown', handleKeyNav);
    updateView(cardData);
    modal.style.display = 'flex';
}

// Toggle color button active state (called from app.js delegation)
export function toggleColorBtn(btn) {
    btn.classList.toggle('active');
}

// ─── Internal generators ──────────────────────────────────────────────────────

async function generateBoosterClassic(setData, inventoryMap = new Map()) {
    if (!setData?.cards) return { cards: [], bonusUpgrades: [], stockWarning: false };

    let pool = [...setData.cards];
    let selected = [];
    let bonusUpgradesRaw = [];

    // Simulate MTG standard pack: 1 Rare/Mythic, 3 Uncommon, 10 Common, 1 Basic Land
    const counts = { mythic: 0, rare: 1, uncommon: 3, common: 10, land: 1 };
    
    // --- Foil Engine (22.5% Drop Rate) ---
    if (Math.random() < 0.225) {
        const foilRoll = Math.random();
        let foilRarity = 'common';
        if (foilRoll < 0.01) foilRarity = 'mythic';
        else if (foilRoll < 0.09) foilRarity = 'rare';
        else if (foilRoll < 0.29) foilRarity = 'uncommon';

        const foilPool = pool.filter(c => c.rarity === foilRarity && !c.type?.toLowerCase().includes('basic land'));
        if (foilPool.length > 0) {
            const pickedRawFoil = getRandom(foilPool, 1)[0];
            const dbCard = inventoryMap.get(pickedRawFoil.uuid) || {};
            const totalOwned = (dbCard.regularCount || 0) + (dbCard.foilCount || 0);

            const clonedFoil = { ...pickedRawFoil, _isFoil: true };

            if (totalOwned >= 4) {
                bonusUpgradesRaw.push(clonedFoil);
            } else {
                selected.push(clonedFoil);
                counts.common--; // Consume a common slot
            }
        }
    }

    const commons = pool.filter(c => c.rarity === 'common' && !c.type?.toLowerCase().includes('basic land'));
    const uncommons = pool.filter(c => c.rarity === 'uncommon');
    let rares = pool.filter(c => c.rarity === 'rare');
    let mythics = pool.filter(c => c.rarity === 'mythic');
    const basicLands = pool.filter(c => c.type?.toLowerCase().includes('basic land'));

    if (commons.length > 0) selected.push(...getRandom(commons, counts.common));
    if (uncommons.length > 0) selected.push(...getRandom(uncommons, counts.uncommon));
    
    // Rare or Mythic (approx 1/8 chance for Mythic)
    if (mythics.length > 0 && Math.random() < 0.125) {
        selected.push(...getRandom(mythics, 1));
    } else if (rares.length > 0) {
        selected.push(...getRandom(rares, 1));
    } else if (mythics.length > 0) {
        selected.push(...getRandom(mythics, 1));
    }

    if (basicLands.length > 0) {
        selected.push(...getRandom(basicLands, 1));
    } else {
        selected.push(...getRandom(pool, 1)); // Fallback
    }

    const mapFn = c => {
        const entry = cardToBoosterEntry(c, setData.code);
        if (c._isFoil) entry.isFoil = true;
        return entry;
    };

    return {
        cards: selected.map(mapFn),
        bonusUpgrades: bonusUpgradesRaw.map(mapFn),
        stockWarning: false
    };
}

async function generateBoosterCustom(setData, countsRaw, colors, inventoryMap) {
    if (!setData?.cards) return { cards: [], bonusUpgrades: [], stockWarning: false };

    let pool = [...setData.cards];
    const counts = { ...countsRaw };

    // 1. Color identity filter
    if (colors.length > 0) {
        pool = pool.filter(c => {
            const ci = c.colorIdentity || [];
            if (ci.length === 0) return true;
            return ci.every(color => colors.includes(color));
        });
    }

    let selected = [];
    let bonusUpgradesRaw = [];
    let stockWarning = false;

    // --- Foil Engine (22.5% Drop Rate) ---
    // Replaces 1 common if triggered and valid
    if (Math.random() < 0.225 && counts.common > 0) {
        const foilRoll = Math.random();
        let foilRarity = 'common';
        if (foilRoll < 0.01) foilRarity = 'mythic';
        else if (foilRoll < 0.09) foilRarity = 'rare';
        else if (foilRoll < 0.29) foilRarity = 'uncommon';

        const foilPool = pool.filter(c => c.rarity === foilRarity);
        if (foilPool.length > 0) {
            const pickedRawFoil = getRandom(foilPool, 1)[0];
            const dbCard = inventoryMap.get(pickedRawFoil.uuid) || {};
            const totalOwned = (dbCard.regularCount || 0) + (dbCard.foilCount || 0);

            const clonedFoil = { ...pickedRawFoil, _isFoil: true };

            if (totalOwned >= 4) {
                // BONUS UPGRADE: User already has 4. Send to bonus, don't consume common slot (reroll)
                bonusUpgradesRaw.push(clonedFoil);
            } else {
                // NORMAL UPGRADE: Consume 1 common slot
                selected.push(clonedFoil);
                counts.common--;
            }
        }
    }

    // 2. Smart filter: skip cards with >=4 copies (regular + foil) for the rest of the pack
    if (inventoryMap.size > 0) {
        pool = pool.filter(c => {
            const dbCard = inventoryMap.get(c.uuid) || {};
            const totalOwned = (dbCard.regularCount || 0) + (dbCard.foilCount || 0);
            return totalOwned < 4;
        });
    }

    for (const [rarity, count] of Object.entries(counts)) {
        if (count <= 0) continue;
        
        let picked = [];
        // If picking rares and mythic is 0, give a 1/8 chance to upgrade each rare slot to mythic
        if (rarity === 'rare' && (counts.mythic || 0) === 0) {
            let rarePool = pool.filter(c => c.rarity === 'rare');
            let mythicPool = pool.filter(c => c.rarity === 'mythic');
            
            for (let i = 0; i < count; i++) {
                if (mythicPool.length > 0 && Math.random() < 0.125) {
                    const m = getRandom(mythicPool, 1);
                    if (m.length > 0) {
                        picked.push(m[0]);
                        mythicPool = mythicPool.filter(c => c.uuid !== m[0].uuid);
                    } else {
                        const r = getRandom(rarePool, 1);
                        picked.push(...r);
                        if (r.length > 0) rarePool = rarePool.filter(c => c.uuid !== r[0].uuid);
                    }
                } else {
                    const r = getRandom(rarePool, 1);
                    picked.push(...r);
                    if (r.length > 0) rarePool = rarePool.filter(c => c.uuid !== r[0].uuid);
                }
            }
        } else {
            const rarityPool = pool.filter(c => c.rarity === rarity);
            picked = getRandom(rarityPool, count);
        }

        if (picked.length < count) stockWarning = true;
        selected.push(...picked);
    }

    const mapFn = c => {
        const entry = cardToBoosterEntry(c, setData.code);
        if (c._isFoil) entry.isFoil = true;
        return entry;
    };

    return {
        cards: selected.map(mapFn),
        bonusUpgrades: bonusUpgradesRaw.map(mapFn),
        stockWarning
    };
}

function cardToBoosterEntry(c, setCode) {
    return {
        uuid:       c.uuid,
        name:       c.name,
        setCode:    setCode,
        number:     c.number,          // needed for Scryfall set+number URL
        lang:       state.language || 'en', // snapshot language at generation time
        rarity:     c.rarity || 'common',
        type:       c.type   || 'Unknown',
        colors:     c.colors || [],
        scryfallId: c.identifiers?.scryfallId ?? null
    };
}

function getRandom(arr, count) {
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
}

// ─── Display ──────────────────────────────────────────────────────────────────

function getLocalizedName(card, lang) {
    if (!lang || lang === 'en') return card.name;
    const LANG_MAP = {
        'es': 'Spanish', 'fr': 'French', 'it': 'Italian', 'de': 'German',
        'pt': 'Portuguese (Brazil)', 'ja': 'Japanese', 'ko': 'Korean',
        'ru': 'Russian', 'zhs': 'Chinese Simplified', 'zht': 'Chinese Traditional'
    };
    const targetLang = LANG_MAP[lang];
    
    // Look up the full dbCard from active sets to get foreignData
    let dbCard = null;
    for (const set of state.activeSetsData) {
        dbCard = (set.cards || []).find(c => c.uuid === card.uuid);
        if (dbCard) break;
    }
    
    if (dbCard && dbCard.foreignData) {
        const foreign = dbCard.foreignData.find(f => f.language === targetLang);
        if (foreign && foreign.name) return foreign.name;
    }
    return card.name;
}

export function displayBooster(cards, stockWarning = false, isMassOpen = false, bonusUpgrades = []) {
    const resultContainer = document.getElementById('booster-result-container');
    const grid            = document.getElementById('booster-result');
    const warning         = document.getElementById('booster-stock-warning');
    const exportText      = document.getElementById('booster-export-text');
    const exportWrapper   = document.getElementById('booster-export-wrapper');
    const lang            = state.language || 'en';

    console.log('[Boosters] Renderizando', cards.length, 'cartas en idioma:', lang);

    const rarityColors = {
        common: '#ccc', uncommon: '#3498db', rare: '#f1c40f', mythic: '#e74c3c'
    };

    resultContainer.style.display = 'block';
    warning.style.display = stockWarning ? 'block' : 'none';
    
    // Maintain export text area visible always
    if (exportWrapper) {
        exportWrapper.style.display = 'flex';
    }

    const renderCard = c => {
        const color       = rarityColors[c.rarity?.toLowerCase()] || '#ccc';
        const imgUrl      = getCardImageUrl(c, lang);
        const fallbackUrl = getCardImageUrlEn(c);
        
        const foilClass = c.isFoil ? 'foil-card-effect' : '';
        const bonusLabel = c._isBonus ? '<div class="foil-upgrade-label">UPGRADE FOIL</div>' : '';

        return `
            <div class="booster-card-item card-skeleton ${foilClass}"
                style="border: 2px solid ${color}; border-radius: 10px; overflow: hidden; background: #000; position: relative; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;"
                data-uuid="${c.uuid}">
                ${bonusLabel}
                <img src="${imgUrl}" alt="${c.name}" loading="lazy"
                    style="width: 100%; display: block; opacity: 0; transition: opacity 0.3s ease;"
                    onload="this.style.opacity=1; this.parentElement.classList.remove('card-skeleton');"
                    onerror="this.onerror=null; this.src='${fallbackUrl}';">
                <div style="position: absolute; bottom: 0; width: 100%; padding: 0.35rem; background: rgba(0,0,0,0.75); text-align: center; font-size: 0.65rem; color: ${color}; font-weight: 700; letter-spacing: 1px;">
                    ${c.rarity.toUpperCase()}
                </div>
            </div>`;
    };

    if (isMassOpen) {
        // Group by rarity and lands for mass openings
        const groups = { mythic: [], rare: [], uncommon: [], common: [], special_land: [], basic_land: [] };
        cards.forEach(c => {
            const typeLine = (c.type || '').toLowerCase();
            if (typeLine.includes('land')) {
                if (typeLine.includes('basic')) {
                    groups.basic_land.push(c);
                } else {
                    groups.special_land.push(c);
                }
            } else {
                const r = c.rarity?.toLowerCase();
                if (groups[r]) groups[r].push(c);
                else groups.common.push(c);
            }
        });

        const rarityNames = { 
            mythic: 'Míticas', rare: 'Raras', uncommon: 'Infrecuentes', common: 'Comunes',
            special_land: 'Tierras Especiales', basic_land: 'Tierras Básicas'
        };
        const sectionColors = { ...rarityColors, special_land: '#e67e22', basic_land: '#7f8c8d' };
        
        let groupedHtml = '';
        ['mythic', 'rare', 'uncommon', 'common', 'special_land', 'basic_land'].forEach(r => {
            if (groups[r].length > 0) {
                groupedHtml += `
                    <div style="grid-column: 1 / -1; border-bottom: 2px solid ${sectionColors[r]}40; margin-top: 1.5rem; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">
                        <h3 style="color: ${sectionColors[r]}; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                            ${rarityNames[r]} <span style="opacity:0.6; font-size:0.9em; font-weight: normal;">(${groups[r].length})</span>
                        </h3>
                    </div>
                `;
                groupedHtml += groups[r].map(renderCard).join('');
            }
        });
        grid.innerHTML = groupedHtml;
    } else {
        grid.innerHTML = cards.map(renderCard).join('');
    }

    // Generate plain text export
    const counts = {};
    cards.forEach(c => {
        const localizedName = getLocalizedName(c, lang);
        counts[localizedName] = (counts[localizedName] || 0) + 1;
    });
    
    if (exportText) {
        exportText.value = Object.entries(counts)
            .map(([name, qty]) => `${qty} ${name}`)
            .join('\n');
    }

    resultContainer.scrollIntoView({ behavior: 'smooth' });

    // --- Bonus Upgrades (Bonus Drop) ---
    if (bonusUpgrades && bonusUpgrades.length > 0) {
        let bonusHtml = `
            <div style="grid-column: 1 / -1; margin-top: 2rem; margin-bottom: 1rem; text-align: center;">
                <hr style="border: 0; border-top: 2px solid rgba(255, 215, 0, 0.3); width: 50%; margin: 0 auto 1rem auto;">
                <h3 style="color: #ffd700; font-family: var(--font-heading); margin: 0; text-shadow: 0 0 10px rgba(255,215,0,0.5);">✨ BONUS DROP ✨</h3>
                <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem;">Cartas foil extra obtenidas por exceder 4 copias.</p>
            </div>
        `;
        bonusUpgrades.forEach(c => {
            const bCard = { ...c, _isBonus: true };
            bonusHtml += renderCard(bCard);
        });
        grid.innerHTML += bonusHtml;
    }

    // --- 3D Parallax Tilt for Foil Cards ---
    setTimeout(() => {
        document.querySelectorAll('.foil-card-effect').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const xPercent = (x / rect.width) * 100;
                const yPercent = (y / rect.height) * 100;

                const rotX = ((y / rect.height) - 0.5) * -30;
                const rotY = ((x / rect.width) - 0.5) * 30;

                card.style.setProperty('--pos-x', `${xPercent}%`);
                card.style.setProperty('--pos-y', `${yPercent}%`);
                card.style.setProperty('--rot-x', `${rotX}deg`);
                card.style.setProperty('--rot-y', `${rotY}deg`);
                card.style.transform = `perspective(1000px) rotateX(var(--rot-x)) rotateY(var(--rot-y)) scale(1.05)`;
                card.style.zIndex = '10';
                card.style.boxShadow = `0 15px 30px rgba(0,0,0,0.8)`;

                if (ghostPortal && ghostPortal.classList.contains('visible') && ghostPortal.dataset.activeUuid === card.dataset.uuid) {
                    const inner = ghostPortal.querySelector('.ghost-portal-inner');
                    if (inner) {
                        inner.style.setProperty('--pos-x', `${xPercent}%`);
                        inner.style.setProperty('--pos-y', `${yPercent}%`);
                        inner.style.setProperty('--rot-x', `${rotX}deg`);
                        inner.style.setProperty('--rot-y', `${rotY}deg`);
                        inner.style.transform = `perspective(1000px) rotateX(var(--rot-x)) rotateY(var(--rot-y))`;
                    }
                }
            });

            card.addEventListener('mouseleave', () => {
                card.style.setProperty('--pos-x', `50%`);
                card.style.setProperty('--pos-y', `50%`);
                card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`;
                card.style.zIndex = '1';
                card.style.boxShadow = `none`;
            });
        });
    }, 50);
}
