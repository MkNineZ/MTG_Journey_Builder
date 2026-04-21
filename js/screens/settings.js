import { state } from '../utils/state.js';
import { navigateTo } from '../components/navigation.js';
import { fetchSetData } from '../utils/api.js';
import { saveSet, clearAllSets } from '../utils/db.js';

let availableSets = [];

export async function initSettings() {
    const container = document.getElementById('settings');
    
    // Initialize localSelected from state
    let localSelected = state.selectedSets.map(s => s.code);

    container.innerHTML = `
        <div class="settings-header">
            <h2>Configuración del Simulador</h2>
            <p>Ajusta el idioma y sincroniza los sets que quieras utilizar.</p>
            
            <!-- Language Selector - Visual Priority -->
            <div style="margin: 2.5rem 0; padding: 2rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <label for="lang-select" style="color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; font-weight: 800;">Idioma de las cartas</label>
                <select id="lang-select" style="background: var(--surface-color); color: var(--text-primary); border: 1px solid var(--accent-color); padding: 0.8rem 1.5rem; border-radius: 12px; cursor: pointer; font-size: 1.1rem; width: 100%; max-width: 300px; text-align: center; font-weight: 600;">
                    <option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option>
                    <option value="es" ${state.language === 'es' ? 'selected' : ''}>Español</option>
                    <option value="fr" ${state.language === 'fr' ? 'selected' : ''}>Français</option>
                    <option value="it" ${state.language === 'it' ? 'selected' : ''}>Italiano</option>
                    <option value="de" ${state.language === 'de' ? 'selected' : ''}>Deutsch</option>
                </select>
                <p style="font-size: 0.8rem; opacity: 0.5;">Cambiar el idioma actualizará todas las imágenes de la app.</p>
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
    };

    deselectBtn.onclick = () => {
        localSelected = [];
        grid.querySelectorAll('.set-card').forEach(card => card.classList.remove('selected'));
        updateUI();
    };

    try {
        if (availableSets.length === 0) {
            const response = await fetch('/SetList.json');
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

    } catch (error) {
        loader.style.display = 'none';
        container.innerHTML += `<p style="color:red; text-align:center;">Error al cargar SetList.json</p>`;
    }
}
