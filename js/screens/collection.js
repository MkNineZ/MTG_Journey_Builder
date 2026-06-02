import { state } from '../utils/state.js';
import { renderSearchUI, filterCards } from '../components/searchEngine.js';
import { updateInventoryCount, clearNewStatus, saveToInventory, removeFromInventory, clearInventory } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

let currentFilteredCards = [];
let currentCollectionModalIndex = -1;

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

export function initCollection() {
    const container = document.getElementById('collection');
    
    // Base layout
    container.innerHTML = `
        <div class="app-columns-layout">
            <div id="collection-search" class="app-sidebar-filters"></div>
            
            <div class="app-main-content">
                <div class="collection-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h2 style="margin: 0;">Mi Colección</h2>
                        <div id="collection-info" style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;"></div>
                    </div>
                    <button id="bulk-mgmt-btn" class="nav-btn" style="border: 1px solid var(--accent-color); color: var(--accent-color); padding: 0.8rem 1.5rem;">
                        <i class="fas fa-boxes" style="margin-right: 0.5rem;"></i> Gestión Masiva
                    </button>
                </div>
                <div id="collection-results" class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 1rem;"></div>
            </div>
        </div>
        
        <!-- Collection Detail Modal -->
        <div id="collection-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); backdrop-filter: blur(15px); z-index: 10000; justify-content: center; align-items: center;">
            <div id="collection-modal-content" style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 24px; padding: 3rem; display: flex; flex-wrap: wrap; gap: 3rem; max-width: 1000px; width: 95%; max-height: 90vh; overflow-y: auto; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.8);"></div>
        </div>

        <!-- Bulk Management Modal -->
        <div id="bulk-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 10001; justify-content: center; align-items: center;">
            <div class="bulk-modal-container" style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 24px; width: 90%; max-width: 800px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.8);">
                <div class="bulk-tabs" style="display: flex; border-bottom: 1px solid var(--border-color);">
                    <button class="bulk-tab active" data-tab="import">Importar</button>
                    <button class="bulk-tab" data-tab="export">Exportar</button>
                    <button class="bulk-tab" data-tab="delete">Eliminar</button>
                </div>
                
                <div class="bulk-content" style="flex: 1; padding: 2rem; overflow-y: auto;">
                    <!-- Import View -->
                    <div id="bulk-import-view">
                        <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">Pega tu lista aquí (ejemplo: 4 Lightning Bolt):</p>
                        <textarea id="import-textarea" placeholder="1 Black Lotus&#10;4 Lightning Bolt..." style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; color: #fff; padding: 1rem; font-family: monospace; resize: none; margin-bottom: 1.5rem; outline: none;"></textarea>
                        
                        <div id="import-preview" style="display: none; background: rgba(0,0,0,0.2); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.05);">
                            <h4 id="import-summary" style="margin-bottom: 1rem; color: var(--accent-hover);"></h4>
                            <div id="import-list" style="max-height: 200px; overflow-y: auto; font-size: 0.85rem; line-height: 1.6;"></div>
                        </div>

                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button id="analyze-import-btn" class="nav-btn" style="border: 1px solid var(--border-color);">Analizar Lista</button>
                            <button id="confirm-import-btn" class="save-btn" style="display: none;">Confirmar e Importar</button>
                        </div>
                    </div>

                    <!-- Export View -->
                    <div id="bulk-export-view" style="display: none;">
                        <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">Lista de cartas filtradas actualmente:</p>
                        <textarea id="export-textarea" readonly style="width: 100%; height: 250px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; color: #aaa; padding: 1rem; font-family: monospace; resize: none; margin-bottom: 1.5rem; outline: none;"></textarea>
                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button id="copy-export-btn" class="save-btn">Copiar al Portapapeles</button>
                        </div>
                    </div>

                    <!-- Delete View -->
                    <div id="bulk-delete-view" style="display: none;">
                        <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">Pega tu lista de cartas a eliminar (ejemplo: 4 Lightning Bolt):</p>
                        <textarea id="delete-textarea" placeholder="1 Black Lotus&#10;4 Lightning Bolt..." style="width: 100%; height: 200px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; color: #fff; padding: 1rem; font-family: monospace; resize: none; margin-bottom: 1.5rem; outline: none;"></textarea>
                        
                        <div id="delete-preview" style="display: none; background: rgba(231, 76, 60, 0.1); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border: 1px solid rgba(231, 76, 60, 0.3);">
                            <h4 id="delete-summary" style="margin-bottom: 1rem; color: #e74c3c;"></h4>
                            <div id="delete-list" style="max-height: 200px; overflow-y: auto; font-size: 0.85rem; line-height: 1.6;"></div>
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <button id="delete-all-btn" class="save-btn" style="background: rgba(192, 57, 43, 0.2); border: 1px solid #c0392b; color: #e74c3c;"><i class="fas fa-trash-alt"></i> Eliminar Toda la Colección</button>
                            <div style="display: flex; gap: 1rem;">
                                <button id="analyze-delete-btn" class="nav-btn" style="border: 1px solid var(--border-color);">Analizar Lista</button>
                                <button id="confirm-delete-btn" class="save-btn" style="display: none; background: #c0392b; color: #fff;"><i class="fas fa-trash-alt"></i> Eliminar de la Colección</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="padding: 1.5rem 2rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end;">
                    <button id="close-bulk-modal" class="nav-btn">Cerrar</button>
                </div>
            </div>
        </div>
    `;

    const resultsContainer = document.getElementById('collection-results');
    const infoContainer = document.getElementById('collection-info');
    let lastRenderedHTML = '';

    // Ghost Portal Zoom
    resultsContainer.addEventListener('mouseover', e => {
        const cardEl = e.target.closest('.deck-inv-card');
        if (cardEl) showGhostPortal(cardEl);
    });
    resultsContainer.addEventListener('mouseout', e => {
        if (!e.relatedTarget || !e.relatedTarget.closest?.('.deck-inv-card')) {
            hideGhostPortal();
        }
    });

    const render = (currentState) => {
        const inventory = currentState.inventory || [];
        
        if (inventory.length === 0) {
            infoContainer.innerHTML = '';
            const emptyHTML = `
                <div style="grid-column: 1 / -1; padding: 5rem; text-align: center; border: 2px dashed rgba(255,255,255,0.1); border-radius: 20px; background: rgba(255,255,255,0.02);">
                    <h3 style="color: var(--text-secondary); margin-bottom: 1rem;">Tu inventario está vacío</h3>
                    <p>Consigue cartas abriendo sobres en la pestaña correspondiente.</p>
                </div>
            `;
            if (lastRenderedHTML !== emptyHTML) {
                resultsContainer.innerHTML = emptyHTML;
                lastRenderedHTML = emptyHTML;
            }
            return;
        }

        const onFilter = (filtered) => {
            currentFilteredCards = filtered;
            const totalCards = filtered.reduce((acc, c) => acc + c.count, 0);
            infoContainer.innerHTML = `Tienes <strong>${totalCards}</strong> cartas en total (<strong>${filtered.length}</strong> modelos únicos).`;
            const newHTML = filtered
                .sort((a, b) => b.count - a.count)
                .map(c => renderCard(c))
                .join('');
            
            if (lastRenderedHTML !== newHTML) {
                resultsContainer.innerHTML = newHTML;
                lastRenderedHTML = newHTML;
            }
        };

        const searchContainer = document.getElementById('collection-search');
        renderSearchUI(searchContainer, inventory, onFilter);
        onFilter(filterCards(inventory, { name: '', oracleText: '', keywords: '', type: 'all', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' }));
    };

    // Card interactions
    resultsContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.library-card');
        if (!card) return;
        const uuid = card.dataset.uuid;
        const data = currentFilteredCards.find(i => i.uuid === uuid);
        if (data) openModal(data);
    });

    // Bulk Management Logic
    const bulkBtn = document.getElementById('bulk-mgmt-btn');
    const bulkModal = document.getElementById('bulk-modal');
    const bulkClose = document.getElementById('close-bulk-modal');
    const bulkTabs = document.querySelectorAll('.bulk-tab');
    
    let cardsToImport = [];

    bulkBtn.onclick = () => {
        bulkModal.style.display = 'flex';
        updateExportText();
    };

    bulkClose.onclick = () => {
        bulkModal.style.display = 'none';
        resetImportUI();
    };

    bulkTabs.forEach(tab => {
        tab.onclick = () => {
            bulkTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('bulk-import-view').style.display = target === 'import' ? 'block' : 'none';
            document.getElementById('bulk-export-view').style.display = target === 'export' ? 'block' : 'none';
            document.getElementById('bulk-delete-view').style.display = target === 'delete' ? 'block' : 'none';
            if (target === 'export') updateExportText();
        };
    });

    // Import Logic
    const analyzeBtn = document.getElementById('analyze-import-btn');
    const confirmBtn = document.getElementById('confirm-import-btn');
    const importText = document.getElementById('import-textarea');
    const previewArea = document.getElementById('import-preview');
    const summaryText = document.getElementById('import-summary');
    const importList = document.getElementById('import-list');

    analyzeBtn.onclick = () => {
        const lines = importText.value.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return;

        cardsToImport = [];
        let errors = 0;
        let html = '';

        // Flatten all available cards from active sets for lookup
        const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));

        lines.forEach(line => {
            // Regex to match "4 Lightning Bolt" or just "Lightning Bolt"
            const match = line.match(/^(\d+)?\s*(.+)$/);
            if (match) {
                const count = parseInt(match[1]) || 1;
                const name = match[2].trim();
                
                // Find card by name (case insensitive)
                const found = allAvailableCards.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (found) {
                    cardsToImport.push({ ...found, count });
                    html += `<div><span style="color: var(--accent-color); font-weight: bold;">${count}x</span> ${found.name} <span style="color: var(--text-secondary); font-size: 0.7rem;">(${found.setCode})</span></div>`;
                } else {
                    errors++;
                    html += `<div style="color: #e74c3c;"><i class="fas fa-exclamation-circle"></i> Error: "${name}" no encontrada en sets activos.</div>`;
                }
            }
        });

        summaryText.innerHTML = `Se han encontrado <strong>${cardsToImport.length}</strong> cartas. <strong>${errors}</strong> líneas fallaron.`;
        importList.innerHTML = html;
        previewArea.style.display = 'block';
        confirmBtn.style.display = cardsToImport.length > 0 ? 'block' : 'none';
    };

    confirmBtn.onclick = async () => {
        if (cardsToImport.length === 0) return;
        confirmBtn.innerText = 'Importando...';
        confirmBtn.disabled = true;

        try {
            console.log('[Bulk] Iniciando proceso de guardado para', cardsToImport.length, 'cartas.');
            const totalToImport = cardsToImport.reduce((acc, c) => acc + c.count, 0);
            const stats = await saveToInventory(cardsToImport, 'bulk');
            state.incrementSessionCards(totalToImport);
            await state.loadInventory();
            
            let msg = `¡Importación completada!\n\n- Actualizadas: ${stats.updated}\n- Añadidas: ${stats.added}`;
            if (stats.failed > 0) {
                msg += `\n- Fallidas: ${stats.failed} (Ver consola para detalles)`;
            }
            alert(msg);
            
            bulkModal.style.display = 'none';
            resetImportUI();
        } catch (err) {
            console.error('[Bulk] Error crítico durante la importación:', err);
            alert('Error crítico durante la importación. Consulta la consola.');
        } finally {
            confirmBtn.innerText = 'Confirmar e Importar';
            confirmBtn.disabled = false;
        }
    };

    const resetImportUI = () => {
        importText.value = '';
        previewArea.style.display = 'none';
        confirmBtn.style.display = 'none';
        cardsToImport = [];
    };

    // Export Logic
    const exportText = document.getElementById('export-textarea');
    const copyBtn = document.getElementById('copy-export-btn');

    const updateExportText = () => {
        const text = currentFilteredCards
            .map(c => `${c.count} ${c.name}`)
            .join('\n');
        exportText.value = text;
    };

    copyBtn.onclick = () => {
        exportText.select();
        document.execCommand('copy');
        copyBtn.innerText = '¡Copiado!';
        setTimeout(() => copyBtn.innerText = 'Copiar al Portapapeles', 2000);
    };

    // Delete Logic
    const analyzeDeleteBtn = document.getElementById('analyze-delete-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const deleteText = document.getElementById('delete-textarea');
    const deletePreviewArea = document.getElementById('delete-preview');
    const deleteSummaryText = document.getElementById('delete-summary');
    const deleteList = document.getElementById('delete-list');
    const deleteAllBtn = document.getElementById('delete-all-btn');

    let cardsToDelete = [];

    analyzeDeleteBtn.onclick = () => {
        const lines = deleteText.value.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return;

        cardsToDelete = [];
        let errors = 0;
        let html = '';

        // Flatten all available cards from active sets for lookup
        const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));

        lines.forEach(line => {
            // Regex to match "4 Lightning Bolt" or just "Lightning Bolt"
            const match = line.match(/^(\d+)?\s*(.+)$/);
            if (match) {
                const count = parseInt(match[1]) || 1;
                const name = match[2].trim();
                
                // Find card by name (case insensitive) in active inventory/sets
                const found = allAvailableCards.find(c => c.name.toLowerCase() === name.toLowerCase());
                if (found) {
                    cardsToDelete.push({ ...found, count });
                    html += `<div><span style="color: #e74c3c; font-weight: bold;">-${count}x</span> ${found.name} <span style="color: var(--text-secondary); font-size: 0.7rem;">(${found.setCode})</span></div>`;
                } else {
                    errors++;
                    html += `<div style="color: #e74c3c;"><i class="fas fa-exclamation-circle"></i> Error: "${name}" no encontrada en la base de datos.</div>`;
                }
            }
        });

        deleteSummaryText.innerHTML = `Se han preparado <strong>${cardsToDelete.length}</strong> cartas para eliminar. <strong>${errors}</strong> líneas fallaron.`;
        deleteList.innerHTML = html;
        deletePreviewArea.style.display = 'block';
        confirmDeleteBtn.style.display = cardsToDelete.length > 0 ? 'block' : 'none';
    };

    confirmDeleteBtn.onclick = async () => {
        if (cardsToDelete.length === 0) return;
        confirmDeleteBtn.innerText = 'Eliminando...';
        confirmDeleteBtn.disabled = true;

        try {
            console.log('[Bulk] Iniciando proceso de eliminación para', cardsToDelete.length, 'cartas.');
            const totalToRemove = cardsToDelete.reduce((acc, c) => acc + c.count, 0);
            const stats = await removeFromInventory(cardsToDelete);
            await state.loadInventory();
            
            let msg = `¡Eliminación completada!\n\n- Restadas: ${stats.subtracted}\n- Borradas: ${stats.removed}`;
            if (stats.failed > 0) {
                msg += `\n- Fallidas: ${stats.failed} (Ver consola para detalles)`;
            }
            alert(msg);
            
            bulkModal.style.display = 'none';
            resetImportUI();
        } catch (err) {
            console.error('[Bulk] Error crítico durante la eliminación:', err);
            alert('Error crítico durante la eliminación. Consulta la consola.');
        } finally {
            confirmDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Eliminar de la Colección';
            confirmDeleteBtn.disabled = false;
        }
    };

    deleteAllBtn.onclick = async () => {
        const sure = confirm("⚠️ ¿ESTÁS SEGURO?\n\nEsta acción eliminará TODAS las cartas de tu colección. Esto no se puede deshacer.\n\n¿Quieres continuar y vaciar tu inventario?");
        if (!sure) return;
        
        try {
            deleteAllBtn.disabled = true;
            deleteAllBtn.innerText = "Eliminando...";
            
            await clearInventory();
            await state.loadInventory();
            
            alert("Colección vaciada por completo.");
            bulkModal.style.display = 'none';
            resetImportUI();
        } catch (err) {
            console.error('[Bulk] Error vaciando colección:', err);
            alert("Hubo un error al intentar vaciar la colección.");
        } finally {
            deleteAllBtn.disabled = false;
            deleteAllBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Eliminar Toda la Colección';
        }
    };

    // Render the initial UI
    render(state);

    // Persistent Glow Logic: Remove on Mouse Enter
    resultsContainer.addEventListener('mouseenter', async (e) => {
        const card = e.target.closest('.library-card.glow-active');
        if (!card) return;

        const uuid = card.dataset.uuid;
        card.classList.remove('glow-active', 'glow-mythic', 'glow-rare', 'glow-uncommon', 'glow-common');
        
        const item = state.inventory.find(i => i.uuid === uuid);
        if (item) {
            item.isNew = false;
        }
    }, true);
    
    state.subscribe(render);
    render(state);
}

function renderCard(c) {
    const lang = state.language || 'en';
    const rarity = c.rarity.toLowerCase();
    const rarityColors = { common: '#fff', uncommon: '#3498db', rare: '#f1c40f', mythic: '#e74c3c' };
    const color = rarityColors[rarity] || '#fff';
    
    const imgUrl      = getCardImageUrl(c, lang);
    const fallbackUrl = getCardImageUrlEn(c);
    const glowClass   = c.isNew ? `glow-active glow-${rarity}` : '';

    return `
        <div class="library-card deck-inv-card ${glowClass}" data-uuid="${c.uuid}" style="position: relative; cursor: pointer; border: 2px solid ${color}; background: #000;">
            <img src="${imgUrl}" alt="${c.name}" loading="lazy" class="deck-inv-img" style="opacity: 0;" onload="this.style.opacity=1;" onerror="this.onerror=null; this.src='${fallbackUrl}';">
            <div class="deck-inv-badge">x${c.count}</div>
            <div style="padding: 0.5rem 0.7rem; background: rgba(0,0,0,0.85); display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 2;">
                <i class="ss ss-${c.setCode.toLowerCase()} ss-mtg" style="font-size: 1.1rem; color: ${color};"></i>
                <span style="color: ${color}; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">${rarity}</span>
            </div>
        </div>
    `;
}

function openModal(cardData) {
    const modal = document.getElementById('collection-modal');
    const content = document.getElementById('collection-modal-content');
    
    currentCollectionModalIndex = currentFilteredCards.findIndex(i => i.uuid === cardData.uuid);

    const updateView = (data) => {
        const lang = state.language || 'en';
        const imgUrl = getCardImageUrl(data, lang);
        const fallbackUrl = getCardImageUrlEn(data);
        let currentCount = data.count;

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
                <h2 style="font-size: 2.5rem; margin-bottom: 1rem; font-family: var(--font-heading); background: linear-gradient(to right, #fff, #aaa); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">${data.name}</h2>
                <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 3rem; opacity: 0.7;">
                    <i class="ss ss-${data.setCode.toLowerCase()} ss-2x"></i>
                    <span style="font-size: 1.1rem; letter-spacing: 2px;">${data.setCode.toUpperCase()} — ${data.rarity.toUpperCase()}</span>
                </div>
                
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 3rem; border-radius: 30px; text-align: center; backdrop-filter: blur(5px);">
                    <p style="margin-bottom: 2rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 3px; font-size: 0.9rem;">Ejemplares en Colección</p>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 3rem;">
                        <button id="modal-dec" class="nav-btn" style="width: 60px; height: 60px; border-radius: 50%; font-size: 2rem; background: rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center;">-</button>
                        <span id="modal-count-display" style="font-size: 4.5rem; font-weight: 900; min-width: 80px; font-family: 'Inter';">${currentCount}</span>
                        <button id="modal-inc" class="nav-btn" style="width: 60px; height: 60px; border-radius: 50%; font-size: 2rem; background: var(--accent-color); color: #000; display: flex; justify-content: center; align-items: center;">+</button>
                    </div>
                </div>
            </div>
            <button id="modal-close" style="position: absolute; top: 2rem; right: 2rem; background: transparent; border: none; color: #fff; font-size: 2.5rem; cursor: pointer; opacity: 0.3; transition: opacity 0.2s;">✕</button>
        `;

        document.getElementById('modal-close').onclick = async () => {
            modal.style.display = 'none';
            window.removeEventListener('keydown', handleKeyNav);
            await state.loadInventory();
            clearNewStatus(); 
        };

        const navigate = (dir) => {
            currentCollectionModalIndex += dir;
            if (currentCollectionModalIndex < 0) currentCollectionModalIndex = currentFilteredCards.length - 1;
            if (currentCollectionModalIndex >= currentFilteredCards.length) currentCollectionModalIndex = 0;
            updateView(currentFilteredCards[currentCollectionModalIndex]);
        };

        document.getElementById('modal-prev').onclick = (e) => { e.stopPropagation(); navigate(-1); };
        document.getElementById('modal-next').onclick = (e) => { e.stopPropagation(); navigate(1); };

        document.getElementById('modal-dec').onclick = async () => {
            if (currentCount > 0) {
                currentCount--;
                document.getElementById('modal-count-display').innerText = currentCount;
                await updateInventoryCount(data, -1);
                const invItem = state.inventory.find(i => i.uuid === data.uuid);
                if (invItem) invItem.count = currentCount;
            }
        };

        document.getElementById('modal-inc').onclick = async () => {
            currentCount++;
            document.getElementById('modal-count-display').innerText = currentCount;
            await updateInventoryCount(data, 1);
            state.incrementSessionCards(1);
            const invItem = state.inventory.find(i => i.uuid === data.uuid);
            if (invItem) invItem.count = currentCount;
            else state.inventory.push({ ...data, count: currentCount });
        };
    };

    const handleKeyNav = (e) => {
        if (e.key === 'ArrowRight') document.getElementById('modal-next').click();
        if (e.key === 'ArrowLeft') document.getElementById('modal-prev').click();
        if (e.key === 'Escape') document.getElementById('modal-close').click();
    };

    window.addEventListener('keydown', handleKeyNav);
    updateView(cardData);
    modal.style.display = 'flex';
}
