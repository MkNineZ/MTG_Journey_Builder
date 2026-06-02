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

        grid.innerHTML = activeSetsData.map((setData, index) => `
            <div class="set-card booster-set-card" style="padding: 1.5rem;">
                <i class="ss ss-${setData.code.toLowerCase()} ss-mtg ss-3x" style="margin-bottom: 0.8rem; color: var(--accent-color);"></i>
                <h3 style="margin-bottom: 0.3rem; font-family: var(--font-heading); font-size: 0.9rem;">${setData.code}</h3>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1.2rem; height: 2.5em; overflow: hidden;">${setData.name}</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <button class="save-btn open-booster-classic" data-index="${index}" style="width: 100%; padding: 0.6rem; font-size: 0.82rem;">
                        ✨ Clásico (15)
                    </button>
                    <button class="nav-btn open-booster-custom" data-index="${index}" style="width: 100%; padding: 0.6rem; font-size: 0.82rem; border: 1px solid var(--border-color);">
                        ⚙️ Custom
                    </button>
                </div>
            </div>
        `).join('');

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

                    <button class="save-btn open-booster-custom-confirm" data-index="${index}"
                        style="width: 100%; padding: 0.8rem; margin-top: 0.5rem;">
                        ⚡ Generar Sobre Custom
                    </button>
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
}

// ─── Exported actions (called from app.js global delegation) ──────────────────

export async function openBoosterClassic(index) {
    console.log('INICIANDO APERTURA — Modo Clásico');
    const setData = state.activeSetsData[index];
    if (!setData) return;

    const btn = document.querySelector(`.open-booster-classic[data-index="${index}"]`);
    if (btn) { btn.innerText = 'GENERANDO...'; btn.disabled = true; }

    const cards = await generateBoosterClassic(setData);
    state.currentOpeningPack = cards;
    displayBooster(state.currentOpeningPack, false);

    if (btn) { btn.innerText = '✨ Clásico (15)'; btn.disabled = false; }
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

    if (btn) { btn.innerText = '⚡ Generar Sobre Custom'; btn.disabled = false; }
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

    grid.innerHTML = cards.map(c => {
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
    }).join('');

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
