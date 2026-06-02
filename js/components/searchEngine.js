// searchEngine.js

import { state } from '../utils/state.js';

function getFullCardData(uuid) {
    if (!state || !state.activeSetsData) return null;
    for (const set of state.activeSetsData) {
        const card = (set.cards || []).find(c => c.uuid === uuid);
        if (card) return card;
    }
    return null;
}

export function filterCards(cards, criteria) {
    return cards.filter(card => {
        // Forzamos a obtener la carta limpia directamente de la base de datos de los sets
        const dbCard = typeof card.uuid !== 'undefined' ? getFullCardData(card.uuid) : getFullCardData(card.id);
        if (!dbCard) {
            console.warn("UUID no encontrado en la base de datos de sets:", card.uuid || card.id);
            return false;
        }

        if (criteria.name && !dbCard.name?.toLowerCase().includes(criteria.name.toLowerCase())) return false;
        if (criteria.oracleText && !dbCard.text?.toLowerCase().includes(criteria.oracleText.toLowerCase())) return false;
        if (criteria.keywords) {
            const searchKeyword = criteria.keywords.toLowerCase();
            const hasKeyword = dbCard.keywords && dbCard.keywords.some(kw => kw.toLowerCase().includes(searchKeyword));
            const inText = dbCard.text && dbCard.text.toLowerCase().includes(searchKeyword);
            if (!hasKeyword && !inText) return false;
        }
        if (criteria.type && criteria.type !== 'all' && !dbCard.type?.toLowerCase().includes(criteria.type.toLowerCase())) return false;
        if (criteria.set && criteria.set !== 'all' && dbCard.setCode !== criteria.set) return false;
        if (criteria.rarity && criteria.rarity !== 'all' && dbCard.rarity?.toLowerCase() !== criteria.rarity.toLowerCase()) return false;
        if (criteria.manaValue !== null && criteria.manaValue !== '') {
            if (dbCard.convertedManaCost === undefined || parseInt(dbCard.convertedManaCost) !== parseInt(criteria.manaValue)) return false;
        }
        if (criteria.colors && criteria.colors.length > 0) {
            const cardColors = dbCard.colors || [];
            const searchingColorless = criteria.colors.includes('C');
            const activeColors = criteria.colors.filter(c => c !== 'C');

            if (criteria.colorMode === 'exact') {
                // Exact Mode: Must match exactly the selected set of colors
                if (searchingColorless && activeColors.length === 0) {
                    // Only Colorless selected
                    if (cardColors.length > 0) return false;
                } else {
                    // Specific colors selected (with or without 'C' which is redundant here)
                    if (cardColors.length !== activeColors.length) return false;
                    const hasAll = activeColors.every(c => cardColors.includes(c));
                    if (!hasAll) return false;
                }
            } else {
                // Inclusive Mode (Color Identity style): 
                // Card colors must be a subset of the selected colors.
                if (activeColors.length > 0) {
                    // If colors are selected, card cannot have colors OUTSIDE that selection.
                    // Colorless cards ([]) always pass this check.
                    const hasForbiddenColor = cardColors.some(c => !activeColors.includes(c));
                    if (hasForbiddenColor) return false;
                } else if (searchingColorless) {
                    // ONLY 'C' was selected: show only colorless cards
                    if (cardColors.length > 0) return false;
                }
            }
        }
        return true;
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function renderSearchUI(containerElement, allCards, onFilterCallback) {
    // Filtrar para mostrar solo los sets activos en el desplegable
    const activeSetCodes = state.selectedSets ? state.selectedSets.map(s => s.code).sort() : [];
    const setOptions = activeSetCodes.map(code => `<option value="${code}">${code}</option>`).join('');

    containerElement.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <h3 style="color: var(--text-secondary); margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Filtros</h3>
            
            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Nombre</label>
                <input type="text" class="search-name" placeholder="Ej. Black Lotus" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.5); color: #fff;">
            </div>
            
            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Texto (Oracle)</label>
                <input type="text" class="search-oracle" placeholder="Ej. destruye..." style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.5); color: #fff;">
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Colores</label>
                <div style="display: flex; gap: 0.2rem; align-items: center; margin-bottom: 0.5rem; justify-content: space-between;">
                    <button class="mana-btn" data-color="W" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #fffddd; padding: 3px; cursor: pointer; transition: 0.2s;" title="Blanco"><img src="https://svgs.scryfall.io/card-symbols/W.svg" style="width:100%;height:100%;"></button>
                    <button class="mana-btn" data-color="U" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #c1d8e9; padding: 3px; cursor: pointer; transition: 0.2s;" title="Azul"><img src="https://svgs.scryfall.io/card-symbols/U.svg" style="width:100%;height:100%;"></button>
                    <button class="mana-btn" data-color="B" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #bab1ab; padding: 3px; cursor: pointer; transition: 0.2s;" title="Negro"><img src="https://svgs.scryfall.io/card-symbols/B.svg" style="width:100%;height:100%;"></button>
                    <button class="mana-btn" data-color="R" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #f9aa8f; padding: 3px; cursor: pointer; transition: 0.2s;" title="Rojo"><img src="https://svgs.scryfall.io/card-symbols/R.svg" style="width:100%;height:100%;"></button>
                    <button class="mana-btn" data-color="G" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #9bd3ae; padding: 3px; cursor: pointer; transition: 0.2s;" title="Verde"><img src="https://svgs.scryfall.io/card-symbols/G.svg" style="width:100%;height:100%;"></button>
                    <button class="mana-btn" data-color="C" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #ccc; padding: 3px; cursor: pointer; transition: 0.2s;" title="Incoloro"><img src="https://svgs.scryfall.io/card-symbols/C.svg" style="width:100%;height:100%;"></button>
                </div>
                <select class="search-colormode" style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
                    <option value="includes">Incluye estos colores</option>
                    <option value="exact">Exactamente estos</option>
                </select>
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Tipo de Carta</label>
                <select class="search-type" style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
                    <option value="all">Cualquiera</option>
                    <option value="Creature">Criatura</option>
                    <option value="Instant">Instantáneo</option>
                    <option value="Sorcery">Conjuro</option>
                    <option value="Artifact">Artefacto</option>
                    <option value="Enchantment">Encantamiento</option>
                    <option value="Planeswalker">Planeswalker</option>
                    <option value="Land">Tierra</option>
                </select>
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Rareza</label>
                <select class="search-rarity" style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
                    <option value="all">Cualquiera</option>
                    <option value="common">Común</option>
                    <option value="uncommon">Infrecuente</option>
                    <option value="rare">Rara</option>
                    <option value="mythic">Mítica</option>
                </select>
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Set</label>
                <select class="search-set" style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
                    <option value="all">Todos (Activos)</option>
                    ${setOptions}
                </select>
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Valor de Maná (MV)</label>
                <input type="number" class="search-mv" min="0" placeholder="Ej. 3" style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
            </div>

            <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">Keywords</label>
                <input type="text" class="search-keywords" placeholder="Ej. Flying..." style="padding: 0.5rem; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-color); color: #fff; width: 100%;">
            </div>

            <button class="btn-reset-filters save-btn" style="width: 100%; background: #666; color: #fff; margin-top: 1rem;">Limpiar Filtros</button>
        </div>
    `;

    const uiState = { name: '', oracleText: '', keywords: '', type: 'all', rarity: 'all', set: 'all', manaValue: '', colors: [], colorMode: 'includes' };

    const elName = containerElement.querySelector('.search-name');
    const elOracle = containerElement.querySelector('.search-oracle');
    const elKeywords = containerElement.querySelector('.search-keywords');
    const elType = containerElement.querySelector('.search-type');
    const elRarity = containerElement.querySelector('.search-rarity');
    const elSet = containerElement.querySelector('.search-set');
    const elMv = containerElement.querySelector('.search-mv');
    const elColorMode = containerElement.querySelector('.search-colormode');
    const btnReset = containerElement.querySelector('.btn-reset-filters');
    const manaBtns = containerElement.querySelectorAll('.mana-btn');

    const executeFilter = () => { onFilterCallback(filterCards(allCards, uiState)); };
    const debouncedFilter = debounce(executeFilter, 300);

    btnReset.addEventListener('click', () => {
        uiState.name = ''; uiState.oracleText = ''; uiState.keywords = ''; uiState.type = 'all'; uiState.rarity = 'all'; uiState.set = 'all'; uiState.manaValue = ''; uiState.colors = []; uiState.colorMode = 'includes';
        elName.value = ''; elOracle.value = ''; elKeywords.value = ''; elType.value = 'all'; elRarity.value = 'all'; elSet.value = 'all'; elMv.value = ''; elColorMode.value = 'includes';
        manaBtns.forEach(btn => { btn.style.borderColor = 'transparent'; btn.style.boxShadow = 'none'; });
        executeFilter();
    });

    elName.addEventListener('input', (e) => { uiState.name = e.target.value; debouncedFilter(); });
    elOracle.addEventListener('input', (e) => { uiState.oracleText = e.target.value; debouncedFilter(); });
    elKeywords.addEventListener('input', (e) => { uiState.keywords = e.target.value; debouncedFilter(); });
    elType.addEventListener('change', (e) => { uiState.type = e.target.value; executeFilter(); });
    elRarity.addEventListener('change', (e) => { uiState.rarity = e.target.value; executeFilter(); });
    elSet.addEventListener('change', (e) => { uiState.set = e.target.value; executeFilter(); });
    elMv.addEventListener('input', (e) => { uiState.manaValue = e.target.value; debouncedFilter(); });
    elColorMode.addEventListener('change', (e) => { uiState.colorMode = e.target.value; executeFilter(); });

    manaBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetButton = e.target.closest('button');
            if (!targetButton) return;
            const color = targetButton.getAttribute('data-color');
            const idx = uiState.colors.indexOf(color);
            if (idx > -1) {
                uiState.colors.splice(idx, 1);
                targetButton.style.borderColor = 'transparent'; targetButton.style.boxShadow = 'none';
            } else {
                uiState.colors.push(color);
                targetButton.style.borderColor = 'var(--accent-color)'; targetButton.style.boxShadow = '0 0 10px var(--accent-color)';
            }
            executeFilter();
        });
    });
}
