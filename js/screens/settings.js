import { state } from '../utils/state.js';
import { navigateTo } from '../components/navigation.js';
import { fetchSetData } from '../utils/api.js';
import { saveSet, clearAllSets, exportDatabase, importDatabase, deleteSet } from '../utils/db.js';

let availableSets = [];

export async function initSettings() {
    const container = document.getElementById('settings');
    
    // Initialize localSelected from state
    let localSelected = state.selectedSets.map(s => s.code);

    container.innerHTML = `
        <div class="settings-header">
            <h2>Configuración del Simulador</h2>
            <p>Ajusta el idioma y sincroniza los sets que quieras utilizar.</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin: 2rem 0;">
                <!-- Language Selector -->
                <div style="padding: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 20px; display: flex; flex-direction: column; gap: 0.8rem;">
                    <label for="lang-select" style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Idioma de las cartas</label>
                    <select id="lang-select" style="background: var(--surface-color); color: var(--text-primary); border: 1px solid var(--accent-color); padding: 0.6rem; border-radius: 10px; cursor: pointer; font-weight: 600;">
                        <option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option>
                        <option value="es" ${state.language === 'es' ? 'selected' : ''}>Español</option>
                        <option value="fr" ${state.language === 'fr' ? 'selected' : ''}>Français</option>
                        <option value="it" ${state.language === 'it' ? 'selected' : ''}>Italiano</option>
                        <option value="de" ${state.language === 'de' ? 'selected' : ''}>Deutsch</option>
                    </select>
                    <button id="apply-lang-btn" class="btn-settings-action" style="margin-top: 0.5rem; width: 100%;">Aplicar cambios</button>
                </div>

                <!-- Visual Preferences (Zoom Slider) -->
                <div style="padding: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                        <label style="color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Zoom del Inventario</label>
                        <span id="zoom-val-display" style="font-weight: 800; color: var(--accent-color);">${state.hoverZoom}x</span>
                    </div>
                    <input type="range" id="setting-hover-zoom" min="1.1" max="2.0" step="0.05" value="${state.hoverZoom}" 
                        style="width: 100%; accent-color: var(--accent-color); cursor: pointer;">
                </div>
            </div>
        </div>

        <!-- Progress Backup Section -->
        <div style="margin: 2rem 0; padding: 2rem; background: rgba(184, 134, 11, 0.05); border: 1px solid rgba(184, 134, 11, 0.3); border-radius: 24px; display: flex; flex-direction: column; gap: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <i class="fas fa-shield-alt" style="color: #b8860b; font-size: 1.5rem;"></i>
                <h3 style="margin: 0; font-family: var(--font-heading); color: #b8860b; letter-spacing: 1px;">Cargar / Descargar Progreso</h3>
            </div>
            
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin: 0;">Gestiona tus datos locales. La exportación incluye tu inventario, mazos guardados y ajustes de usuario.</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                <button id="export-progress-btn" class="btn-mythic-accent" style="height: 60px;">
                    <i class="fas fa-save"></i>
                    Guardar Progreso
                </button>
                
                <label for="import-file-input" class="btn-settings-action" style="margin: 0;">
                    <i class="fas fa-upload"></i>
                    Importar Archivo
                    <input type="file" id="import-file-input" accept=".json" style="display: none;">
                </label>
            </div>
        </div>

        <div id="sync-progress-overlay" style="display: none; text-align: center; margin: 2rem 0; padding: 2rem; background: rgba(0,0,0,0.3); border: 1px solid var(--accent-color); border-radius: 12px;">
            <h3 id="sync-title" style="color: var(--accent-color); margin-bottom: 1rem;">Sincronizando...</h3>
            <div id="sync-status" style="color: var(--text-secondary); margin-bottom: 1rem;">Preparando...</div>
            <div style="width: 100%; background: rgba(255,255,255,0.1); border-radius: 8px; height: 10px; overflow: hidden;">
                <div id="sync-bar" style="width: 0%; height: 100%; background: var(--accent-color); transition: width 0.3s;"></div>
            </div>
        </div>

        <!-- Accordion for Set Management -->
        <div class="set-accordion" id="sets-management-accordion">
            <div class="set-accordion-header" id="accordion-toggle">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <i class="fas fa-database" style="color: var(--accent-color); font-size: 1.2rem;"></i>
                    <h3 style="margin: 0; font-family: var(--font-heading); font-size: 1.1rem;">Gestionar Sets de la App</h3>
                </div>
                <div style="display: flex; align-items: center; gap: 1.5rem;">
                    <span id="accordion-summary" style="color: var(--text-secondary); font-size: 0.9rem;">Sets activos: <strong>${localSelected.length}</strong></span>
                    <i class="fas fa-chevron-down accordion-icon" style="transition: transform 0.3s;"></i>
                </div>
            </div>
            <div class="set-accordion-content" style="padding-top: 2rem;">
                <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 2rem; margin-bottom: 2rem;">
                    <button id="deselect-all-btn" class="nav-btn" style="border: 1px solid var(--border-color); padding: 0.8rem 1.5rem;">Deseleccionar Todo</button>
                    <button id="save-sets-btn" class="save-btn">Sincronizar Selección</button>
                </div>

                <!-- Panel de Sets Activos (Filtro Rápido) -->
                <div id="active-sets-panel" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(0,0,0,0.3); border-radius: 12px; border: 1px solid var(--border-color);">
                    <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px;">Sets Activos Actuales</h4>
                    <div id="active-sets-badges" style="display: flex; flex-wrap: wrap; gap: 0.8rem;"></div>
                </div>

                <div id="set-search-container" style="margin-bottom: 2rem; position: relative;">
                    <i class="fas fa-search" style="position: absolute; left: 1.2rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 0.9rem;"></i>
                    <input type="text" id="set-search-input" placeholder="Buscar por nombre o código (ej: ONE, Phyrexia)..." 
                        style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); padding: 0.8rem 1.2rem 0.8rem 3rem; border-radius: 12px; color: #fff; font-size: 1rem; outline: none; transition: all 0.2s;">
                </div>

                <div id="sets-loading" class="loader"></div>
                <div id="sets-grid" class="set-grid" style="display: none; margin-bottom: 2rem;"></div>
            </div>
        </div>
    `;

    const grid = document.getElementById('sets-grid');
    const loader = document.getElementById('sets-loading');
    const saveBtn = document.getElementById('save-sets-btn');
    const deselectBtn = document.getElementById('deselect-all-btn');
    const langSelect = document.getElementById('lang-select');
    const searchInput = document.getElementById('set-search-input');
    const summaryLabel = document.getElementById('accordion-summary');
    const accordion = document.getElementById('sets-management-accordion');
    const accordionToggle = document.getElementById('accordion-toggle');

    accordionToggle.onclick = () => accordion.classList.toggle('open');

    langSelect.onchange = (e) => state.setLanguage(e.target.value);
    document.getElementById('apply-lang-btn').onclick = () => window.location.reload();

    // Zoom slider logic
    const zoomSlider = document.getElementById('setting-hover-zoom');
    const zoomDisplay = document.getElementById('zoom-val-display');
    zoomSlider.oninput = (e) => {
        const val = e.target.value;
        zoomDisplay.textContent = `${val}x`;
        state.setHoverZoom(val);
    };

    // Search Filtering Logic
    searchInput.oninput = (e) => {
        const term = e.target.value.toLowerCase().trim();
        const cards = grid.querySelectorAll('.set-card');
        cards.forEach(card => {
            const name = card.querySelector('.set-name').textContent.toLowerCase();
            const code = card.querySelector('.set-code').textContent.toLowerCase();
            if (name.includes(term) || code.includes(term)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    };

    const updateUI = () => {
        summaryLabel.innerHTML = `Sets activos: <strong>${localSelected.length}</strong>`;
        saveBtn.disabled = localSelected.length === 0;
        deselectBtn.disabled = localSelected.length === 0;

        // Update Active Sets Badges
        const badgesContainer = document.getElementById('active-sets-badges');
        if (state.selectedSets.length === 0) {
            badgesContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.9rem; font-style: italic;">No hay sets activos. Selecciona algunos abajo y sincroniza.</span>';
        } else {
            badgesContainer.innerHTML = state.selectedSets.map(set => `
                <div style="display: inline-flex; align-items: center; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.4rem 0.8rem; gap: 0.6rem;">
                    <i class="ss ss-${set.code.toLowerCase()}" style="font-size: 1.1rem;"></i>
                    <span style="font-weight: bold; font-size: 0.9rem;">[ ${set.code} ]</span>
                    <span style="font-size: 0.9rem; color: var(--text-primary);">${set.name}</span>
                    <button class="nav-btn deactivate-set-btn" data-code="${set.code}" style="margin-left: 0.5rem; color: #e74c3c; padding: 0.2rem 0.4rem; font-size: 0.9rem; border: 1px solid rgba(231,76,60,0.3); border-radius: 4px; line-height: 1;">DESACTIVAR</button>
                </div>
            `).join('');
            
            badgesContainer.querySelectorAll('.deactivate-set-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const codeToDeactivate = e.target.dataset.code;
                    // Delete from DB
                    try { await deleteSet(codeToDeactivate); } catch(err) { console.error("Error al borrar set", err); }
                    
                    // Update global state
                    const newSelectedSets = state.selectedSets.filter(s => s.code !== codeToDeactivate);
                    const newActiveSetsData = state.activeSetsData.filter(d => d.code !== codeToDeactivate);
                    state.setSelectedSets(newSelectedSets);
                    state.setActiveSetsData(newActiveSetsData);

                    // Update local selections and grid classes
                    localSelected = newSelectedSets.map(s => s.code);
                    const card = grid.querySelector(`.set-card[data-code="${codeToDeactivate}"]`);
                    if (card) card.classList.remove('selected');
                    
                    updateUI();
                };
            });
        }
    };

    deselectBtn.onclick = () => {
        localSelected = [];
        grid.querySelectorAll('.set-card').forEach(card => card.classList.remove('selected'));
        updateUI();
    };

    try {
        if (availableSets.length === 0) {
            const response = await fetch('./SetList.json');
            const data = await response.json();
            availableSets = data.data.filter(s => ['core', 'expansion', 'masters'].includes(s.type));
            availableSets.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
        }

        loader.style.display = 'none';
        grid.style.display = 'grid';

        grid.innerHTML = availableSets.map(set => {
            const isSelected = localSelected.includes(set.code);
            return `
                <div class="set-card ${isSelected ? 'selected' : ''}" data-code="${set.code}">
                    <i class="ss ss-${set.code.toLowerCase()} ss-3x" style="margin-bottom: 1rem;"></i>
                    <span class="set-code">${set.code}</span>
                    <div class="set-name">${set.name}</div>
                </div>
            `;
        }).join('');

        grid.onclick = (e) => {
            const card = e.target.closest('.set-card');
            if (!card) return;

            const code = card.dataset.code;
            const idx = localSelected.indexOf(code);

            if (idx > -1) {
                localSelected.splice(idx, 1);
                card.classList.remove('selected');
            } else {
                localSelected.push(code);
                card.classList.add('selected');
            }
            updateUI();
        };

        saveBtn.onclick = async () => {
            const selectedSetObjects = localSelected.map(code => availableSets.find(s => s.code === code));
            
            const overlay = document.getElementById('sync-progress-overlay');
            const statusText = document.getElementById('sync-status');
            const syncBar = document.getElementById('sync-bar');
            
            overlay.style.display = 'block';
            saveBtn.disabled = true;
            grid.style.pointerEvents = 'none';
            grid.style.opacity = '0.5';

            const fullSetsData = [];
            
            try {
                // 1. Clear database to ensure atomic state
                statusText.textContent = "Limpiando base de datos...";
                await clearAllSets();

                // 2. Download and save each set
                for (let i = 0; i < selectedSetObjects.length; i++) {
                    const set = selectedSetObjects[i];
                    statusText.textContent = `Descargando ${set.name}...`;
                    const data = await fetchSetData(set.code);
                    
                    // Save to IndexedDB
                    await saveSet(set.code, data);
                    
                    fullSetsData.push(data);
                    syncBar.style.width = `${Math.round(((i + 1) / selectedSetObjects.length) * 100)}%`;
                }

                // 3. Update global state
                state.setSelectedSets(selectedSetObjects);
                state.setActiveSetsData(fullSetsData);
                
                console.log(`[Config] Sincronización completada: ${fullSetsData.length} sets activos.`);
                statusText.textContent = "Sincronización finalizada.";
                
                setTimeout(() => {
                    overlay.style.display = 'none';
                    grid.style.pointerEvents = 'auto';
                    grid.style.opacity = '1';
                    saveBtn.disabled = false;
                    navigateTo('collection');
                }, 1000);
            } catch (err) {
                console.error("[Config] Error en sincronización:", err);
                statusText.innerHTML = `<span style="color: #ff4500;">Error: ${err.message}</span>`;
                grid.style.pointerEvents = 'auto';
                grid.style.opacity = '1';
                saveBtn.disabled = false;
            }
        };

        updateUI();

        // ── Backup & Restore Handlers ─────────────────────────────────────────
        
        const exportBtn = document.getElementById('export-progress-btn');
        const importInput = document.getElementById('import-file-input');

        exportBtn.onclick = async () => {
            try {
                exportBtn.disabled = true;
                exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando...';
                
                const dbData = await exportDatabase();
                const fullBackup = {
                    ...dbData,
                    settings: {
                        language: state.language,
                        hoverZoom: state.hoverZoom,
                        selectedSets: state.selectedSets.map(s => s.code)
                    }
                };

                const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
                a.href = url;
                a.download = `mtg_backup_${date}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                exportBtn.innerHTML = '<i class="fas fa-check"></i> Exportado';
                setTimeout(() => {
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Progreso';
                }, 2000);
            } catch (err) {
                console.error('[Backup] Error:', err);
                alert('Error al exportar el progreso.');
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Progreso';
            }
        };

        importInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const confirmImport = confirm("¿Estás seguro de que quieres importar este archivo?\n\nESTO SOBRESCRIBIRÁ TODA TU BASE DE DATOS ACTUAL (Inventario y Mazos). Esta acción no se puede deshacer.");
            if (!confirmImport) {
                importInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    // Basic validation
                    if (!data.inventory || !data.decks) {
                        throw new Error("El archivo no parece ser un backup válido de MTG Journey Builder.");
                    }

                    // Restore settings if present
                    if (data.settings) {
                        if (data.settings.language) state.setLanguage(data.settings.language);
                        if (data.settings.hoverZoom) state.setHoverZoom(data.settings.hoverZoom);
                    }

                    // Import to IndexedDB
                    await importDatabase(data);
                    
                    alert("Importación completada con éxito. La aplicación se reiniciará para cargar los nuevos datos.");
                    window.location.reload();
                } catch (err) {
                    console.error('[Import] Error:', err);
                    alert("Error al importar el archivo: " + err.message);
                } finally {
                    importInput.value = '';
                }
            };
            reader.readAsText(file);
        };

    } catch (error) {
        loader.style.display = 'none';
        container.innerHTML += `<p style="color:red; text-align:center;">Error al cargar SetList.json</p>`;
    }
}
