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
                
                <div style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column;">
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

        grid.innerHTML = activeSetsData.map((setData, index) => {
            const setArtUrl = `assets/pack-bg-${setData.code.toLowerCase()}.jpg`;
            
            return `
            <div class="booster-set-group" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 3rem; background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 16px; border: 1px solid var(--border-color);">
                
                <!-- Cabecera del Set con Engranaje Custom -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
                    <div style="display: flex; gap: 1rem; align-items: center;">
                        <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-3x" style="color: var(--accent-color); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></i>
                        <div>
                            <h3 style="margin-bottom: 0.1rem; font-family: var(--font-heading); font-size: 1.2rem;">${setData.code}</h3>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">${setData.name}</div>
                        </div>
                    </div>
                    <button class="nav-btn open-booster-custom" data-index="${index}" style="padding: 0.5rem 0.8rem; border-radius: 8px; font-size: 1rem; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); transition: background 0.2s;" title="Configuración Custom">
                        ⚙️ Custom
                    </button>
                </div>

                <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
                    <!-- Single Pack (Opción 1) -->
                    <div class="booster-pack-card pack-art-anim" data-index="${index}" style="flex: 1; min-width: 200px; max-width: 300px; aspect-ratio: 2.5/3.5; position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.6); cursor: pointer; background-image: url('${setArtUrl}'), url('assets/booster%20blank.png'); background-size: cover; background-position: center; background-blend-mode: multiply; border: 1px solid rgba(255,255,255,0.05); transition: transform 0.2s, box-shadow 0.2s;">
                        <div class="pack-foil-overlay"></div>
                        
                        <div style="position: absolute; top: 15%; width: 100%; text-align: center; z-index: 2; pointer-events: none;">
                            <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-3x" style="color: #fff; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8)); opacity: 0.8;"></i>
                            <h3 style="color: #fff; font-family: var(--font-heading); margin-top: 0.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.9); font-size: 1rem;">${setData.code}</h3>
                        </div>

                        <button class="save-btn open-booster-classic" data-index="${index}" style="position: absolute; bottom: 8%; left: 50%; transform: translateX(-50%); width: 80%; padding: 0.7rem; font-size: 0.9rem; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.2); z-index: 3;">
                            🗡️ Abrir Sobre
                        </button>
                    </div>

                    <!-- Booster Box (Opción 2) -->
                    <div class="booster-box-card box-art-anim" data-index="${index}" style="flex: 2; min-width: 300px; aspect-ratio: 16/9; position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.8); background-image: url('${setArtUrl}'), url('assets/booster%20box%20blank.png'); background-size: contain; background-position: center; background-blend-mode: multiply; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; justify-content: center; align-items: center; transition: transform 0.2s, box-shadow 0.2s;">
                        
                        <div style="position: absolute; right: 5%; top: 10%;">
                            <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-5x" style="color: #fff; opacity: 0.3; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.9));"></i>
                        </div>

                        <div style="position: relative; z-index: 2; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); text-align: center;">
                            <h3 style="margin-bottom: 0.5rem; font-family: var(--font-heading); font-size: 1.3rem; color: #fff;">${setData.name}</h3>
                            <p style="color: #ccc; font-size: 0.85rem; margin-bottom: 1.5rem;">Draft Booster Display</p>
                            
                            <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
                                <input type="number" class="mass-open-count" data-index="${index}" value="36" min="1" max="100" style="width: 60px; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.1); color: #fff; font-size: 1rem; text-align: center;">
                                <button class="save-btn open-booster-mass-classic" data-index="${index}" style="padding: 0.7rem 1.5rem; font-size: 1rem; background: var(--accent-hover);">
                                    📦 Abrir Caja
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            `;
        }).join('');

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

                    <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                        <button class="save-btn open-booster-custom-confirm" data-index="${index}" style="flex: 1; padding: 0.8rem; font-size: 0.95rem;">
                            ⚡ Generar 1 Sobre Custom
                        </button>
                        <div style="display: flex; gap: 0.5rem; flex: 1;">
                            <input type="number" class="mass-custom-count" data-index="${index}" value="36" min="1" max="100" style="width: 60px; padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.4); color: #fff; font-size: 0.95rem; text-align: center;">
                            <button class="save-btn open-booster-mass-custom-confirm" data-index="${index}" style="flex: 1; padding: 0.8rem; font-size: 0.95rem; background: var(--accent-hover);">
                                📦 Generar Caja Custom
                            </button>
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

// ─── Exported actions (called from app.js global delegation) ──────────────────

export async function openBoosterClassic(index) {
    console.log('INICIANDO APERTURA — Modo Clásico');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const btn = document.querySelector(`.open-booster-classic[data-index="${index}"]`);
    const packArt = btn?.closest('.booster-pack-card')?.querySelector('.pack-art-anim');
    if (btn) { btn.innerText = 'GENERANDO...'; btn.disabled = true; }
    if (packArt) { packArt.style.animation = 'packTear 0.5s forwards'; }

    const cards = await generateBoosterClassic(setData);
    
    // Simulate animation delay
    if (packArt) await new Promise(r => setTimeout(r, 400));

    state.currentOpeningPack = cards;
    displayBooster(state.currentOpeningPack, false);

    if (btn) { btn.innerText = '🗡️ Abrir Sobre'; btn.disabled = false; }
    if (packArt) { packArt.style.animation = 'none'; }
}

export async function openBoosterMassClassic(index) {
    console.log('INICIANDO APERTURA MASIVA — Modo Clásico');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const input = document.querySelector(`.mass-open-count[data-index="${index}"]`);
    const count = parseInt(input?.value, 10) || 36;
    if (count <= 0 || count > 100) {
        alert("El número de sobres debe ser entre 1 y 100");
        return;
    }

    const btn = document.querySelector(`.open-booster-mass-classic[data-index="${index}"]`);
    const boxArt = btn?.closest('.booster-box-card')?.querySelector('.box-art-anim');
    if (btn) { btn.innerText = 'GENERANDO...'; btn.disabled = true; }
    if (boxArt) { boxArt.style.animation = 'boxOpen 0.6s forwards'; }

    let allCards = [];
    for (let i = 0; i < count; i++) {
        const packCards = await generateBoosterClassic(setData);
        allCards = allCards.concat(packCards);
    }
    
    if (boxArt) await new Promise(r => setTimeout(r, 400));
    
    state.currentOpeningPack = allCards;
    displayBooster(state.currentOpeningPack, false);

    if (btn) { btn.innerText = '📦 Abrir Caja'; btn.disabled = false; }
    if (boxArt) { boxArt.style.animation = 'none'; }
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
    if (state.currentOpeningPack.length === 0) return;
    try {
        await saveToInventory(state.currentOpeningPack, 'booster');
        state.incrementSessionCards(state.currentOpeningPack.length);
        await state.loadInventory();
        document.getElementById('booster-result-container').style.display = 'none';
        document.getElementById('booster-stock-warning').style.display = 'none';
        state.currentOpeningPack = [];
        alert('¡Cartas añadidas correctamente!');
    } catch (err) {
        console.error('Error al guardar sobres:', err);
        alert('Error al guardar en el inventario.');
    }
}

export function discardBooster() {
    document.getElementById('booster-result-container').style.display = 'none';
    document.getElementById('booster-stock-warning').style.display = 'none';
    state.currentOpeningPack = [];
}

let currentBoosterModalIndex = -1;

export function openBoosterModal(uuid) {
    const cardData = state.currentOpeningPack.find(c => c.uuid === uuid);
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

async function generateBoosterClassic(setData) {
    if (!setData?.cards) return [];

    const commons   = setData.cards.filter(c => c.rarity === 'common');
    const uncommons = setData.cards.filter(c => c.rarity === 'uncommon');
    const rares     = setData.cards.filter(c => c.rarity === 'rare' || c.rarity === 'mythic');
    const lands     = commons.filter(c => c.type?.toLowerCase().includes('land'));

    let selected;
    if (commons.length >= 10 && uncommons.length >= 3 && rares.length >= 1) {
        selected = [
            ...getRandom(rares,    1),
            ...getRandom(uncommons, 3),
            ...getRandom(commons,  10),
            ...(lands.length > 0 ? getRandom(lands, 1) : getRandom(commons, 1))
        ];
    } else {
        selected = getRandom(setData.cards, 15);
    }

    return selected.map(c => cardToBoosterEntry(c, setData.code));
}

async function generateBoosterCustom(setData, counts, colors, inventoryMap) {
    if (!setData?.cards) return { cards: [], stockWarning: false };

    let pool = [...setData.cards];

    // 1. Color identity filter
    if (colors.length > 0) {
        pool = pool.filter(c => {
            const ci = c.colorIdentity || [];
            // Colorless / artifacts: always included
            if (ci.length === 0) return true;
            // Every color of the card must be in the selected colors
            return ci.every(color => colors.includes(color));
        });
    }

    // 2. Smart filter: skip cards with ≥4 copies
    if (inventoryMap.size > 0) {
        pool = pool.filter(c => (inventoryMap.get(c.uuid) ?? 0) < 4);
    }

    let selected = [];
    let stockWarning = false;

    for (const [rarity, count] of Object.entries(counts)) {
        if (count <= 0) continue;
        const rarityPool = pool.filter(c => c.rarity === rarity);
        const picked = getRandom(rarityPool, count);
        if (picked.length < count) stockWarning = true;
        selected.push(...picked);
    }

    return {
        cards: selected.map(c => cardToBoosterEntry(c, setData.code)),
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

function displayBooster(cards, stockWarning = false) {
    const resultContainer = document.getElementById('booster-result-container');
    const grid            = document.getElementById('booster-result');
    const warning         = document.getElementById('booster-stock-warning');
    const exportText      = document.getElementById('booster-export-text');
    const lang            = state.language || 'en';

    console.log('[Boosters] Renderizando', cards.length, 'cartas en idioma:', lang);

    const rarityColors = {
        common: '#ccc', uncommon: '#3498db', rare: '#f1c40f', mythic: '#e74c3c'
    };

    resultContainer.style.display = 'block';
    warning.style.display = stockWarning ? 'block' : 'none';

    const renderCard = c => {
        const color       = rarityColors[c.rarity?.toLowerCase()] || '#ccc';
        const imgUrl      = getCardImageUrl(c, lang);
        const fallbackUrl = getCardImageUrlEn(c);

        return `
            <div class="booster-card-item card-skeleton"
                style="border: 2px solid ${color}; border-radius: 10px; overflow: hidden; background: #000; position: relative; transition: transform 0.2s; cursor: pointer;"
                data-uuid="${c.uuid}">
                <img src="${imgUrl}" alt="${c.name}" loading="lazy"
                    style="width: 100%; display: block; opacity: 0; transition: opacity 0.3s ease;"
                    onload="this.style.opacity=1; this.parentElement.classList.remove('card-skeleton');"
                    onerror="this.onerror=null; this.src='${fallbackUrl}';">
                <div style="position: absolute; bottom: 0; width: 100%; padding: 0.35rem; background: rgba(0,0,0,0.75); text-align: center; font-size: 0.65rem; color: ${color}; font-weight: 700; letter-spacing: 1px;">
                    ${c.rarity.toUpperCase()}
                </div>
            </div>`;
    };

    if (cards.length > 30) {
        // Group by rarity for mass openings
        const groups = { mythic: [], rare: [], uncommon: [], common: [] };
        cards.forEach(c => {
            const r = c.rarity?.toLowerCase();
            if (groups[r]) groups[r].push(c);
            else groups.common.push(c);
        });

        const rarityNames = { mythic: 'Míticas', rare: 'Raras', uncommon: 'Infrecuentes', common: 'Comunes' };
        
        let groupedHtml = '';
        ['mythic', 'rare', 'uncommon', 'common'].forEach(r => {
            if (groups[r].length > 0) {
                groupedHtml += `
                    <div style="grid-column: 1 / -1; border-bottom: 2px solid ${rarityColors[r]}40; margin-top: 1.5rem; margin-bottom: 0.5rem; padding-bottom: 0.5rem;">
                        <h3 style="color: ${rarityColors[r]}; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
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
}
