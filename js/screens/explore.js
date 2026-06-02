import { state } from '../utils/state.js';
import { renderSearchUI } from '../components/searchEngine.js';
import { updateInventoryCount } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

let currentFilteredCards = [];
let currentExploreModalIndex = -1;
const openAccordions = new Set();
let lastSetsSignature = '';

export function initExplore() {
    const container = document.getElementById('explore');
    
    // Base layout
    container.innerHTML = `
        <div class="app-columns-layout">
            <div id="explore-search" class="app-sidebar-filters"></div>
            
            <div class="app-main-content">
                <div class="explore-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2 style="margin: 0; font-size: 1.5rem;">Explorar Sets</h2>
                    <div id="explore-info" style="color: var(--text-secondary); font-size: 0.9rem;"></div>
                </div>
                <div id="explore-results" style="margin-top: 1rem;"></div>
            </div>
        </div>
        
        <div id="explore-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.9); backdrop-filter: blur(15px); z-index: 10000; justify-content: center; align-items: center;">
            <div id="explore-modal-content" style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 24px; padding: 3rem; display: flex; flex-wrap: wrap; gap: 3rem; max-width: 1000px; width: 95%; max-height: 90vh; overflow-y: auto; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.8);"></div>
        </div>
    `;

    const resultsContainer = document.getElementById('explore-results');
    const infoContainer = document.getElementById('explore-info');
    const searchContainer = document.getElementById('explore-search');
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

    const render = ({ inventory, activeSetsData }) => {
        if (!activeSetsData || activeSetsData.length === 0) {
            infoContainer.innerHTML = '';
            const emptyHTML = `
                <div style="text-align: center; margin-top: 4rem; grid-column: 1 / -1;">
                    <p style="color: var(--text-secondary)">No hay sets sincronizados. Ve a la pestaña de <strong>Configuración</strong>.</p>
                </div>
            `;
            if (lastRenderedHTML !== emptyHTML) {
                resultsContainer.innerHTML = emptyHTML;
                lastRenderedHTML = emptyHTML;
            }
            return;
        }

        // Flatten all cards from all active sets
        const allCards = activeSetsData.flatMap(set => (set.cards || []).map(c => {
            const exactCmc = c.convertedManaCost !== undefined ? c.convertedManaCost : (c.manaValue !== undefined ? c.manaValue : (c.cmc !== undefined ? c.cmc : 0));
            return {
                ...c,
                setCode: set.code,
                manaValue: exactCmc
            };
        }));

        // Remove duplicate UUIDs if any
        const uniqueCards = Array.from(new Map(allCards.map(c => [c.uuid, c])).values());

        const onFilter = (filtered) => {
            currentFilteredCards = filtered;
            infoContainer.innerHTML = `Mostrando <strong>${filtered.length}</strong> de ${uniqueCards.length} cartas disponibles.`;
            
            // Group by set
            const grouped = {};
            filtered.forEach(c => {
                if (!grouped[c.setCode]) grouped[c.setCode] = [];
                grouped[c.setCode].push(c);
            });

            const setNames = {};
            state.activeSetsData.forEach(s => { setNames[s.code] = s.name; });

            const newHTML = Object.keys(grouped).map(setCode => {
                const cards = grouped[setCode];
                const setName = setNames[setCode] || setCode;
                const cardsHTML = cards.map(c => {
                    const owned = inventory.find(i => i.uuid === c.uuid);
                    return renderCard(c, owned);
                }).join('');
                
                const isOpen = openAccordions.has(setCode);
                return `
                    <div class="set-accordion ${isOpen ? 'open' : ''}" data-set-code="${setCode}">
                        <div class="set-accordion-header">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <i class="ss ss-${setCode.toLowerCase()} ss-mtg ss-2x" style="color: var(--accent-color);"></i>
                                <h3 style="margin: 0; font-family: var(--font-heading);">${setName}</h3>
                            </div>
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <span style="color: var(--text-secondary);">${cards.length} cartas</span>
                                <i class="fas fa-chevron-down accordion-icon" style="transition: transform 0.3s;"></i>
                            </div>
                        </div>
                        <div class="set-accordion-content">
                            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem;">
                                ${cardsHTML}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            if (lastRenderedHTML !== newHTML) {
                resultsContainer.style.display = 'block';
                resultsContainer.innerHTML = newHTML;
                lastRenderedHTML = newHTML;
            }
        };

        const currentSetsSignature = (activeSetsData || []).map(s => s.code).join(',');
        if (currentSetsSignature !== lastSetsSignature) {
            lastSetsSignature = currentSetsSignature;
            renderSearchUI(searchContainer, uniqueCards, onFilter);
            onFilter(uniqueCards);
        } else {
            onFilter(currentFilteredCards);
        }
    };

    // Modal Interaction and Accordion Event Delegation
    container.addEventListener('click', (e) => {
        // Toggle accordion
        const header = e.target.closest('.set-accordion-header');
        if (header) {
            const accordion = header.parentElement;
            const setCode = accordion.dataset.setCode;
            accordion.classList.toggle('open');
            if (accordion.classList.contains('open')) {
                openAccordions.add(setCode);
            } else {
                openAccordions.delete(setCode);
            }
            return;
        }

        const cardEl = e.target.closest('.library-card');
        if (!cardEl) return;
        const uuid = cardEl.dataset.uuid;
        const cardData = currentFilteredCards.find(c => c.uuid === uuid);
        if (cardData) {
            openModal(cardData);
        }
    });

    state.subscribe(render);
    render(state);
}

function renderCard(c, owned) {
    const lang = state.language || 'en';
    const rarity = c.rarity.toLowerCase();
    const rarityColors = { common: '#fff', uncommon: '#3498db', rare: '#f1c40f', mythic: '#e74c3c' };
    const color = rarityColors[rarity] || '#fff';
    
    const imgUrl      = getCardImageUrl(c, lang);
    const fallbackUrl = getCardImageUrlEn(c);
    const isOwned     = !!owned;
    const styleOwned = isOwned ? '' : 'filter: grayscale(60%) brightness(0.7); opacity: 0.8;';

    return `
        <div class="library-card card-skeleton" data-uuid="${c.uuid}" data-rarity="${rarity}" style="position: relative; cursor: pointer; border: 2px solid ${isOwned ? color : '#333'}; border-radius: 12px; overflow: hidden; background: #000; transition: all 0.3s ease; ${styleOwned}">
            ${isOwned ? `<div class="card-badge-count" style="position: absolute; top: 10px; right: 10px; background: var(--accent-color); color: #000; padding: 0.3rem 0.7rem; border-radius: 8px; font-weight: 900; font-size: 0.9rem; z-index: 10; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">x${owned.count}</div>` : ''}
            <img src="${imgUrl}" alt="${c.name}" loading="lazy" style="width: 100%; display: block; opacity: 0; transition: opacity 0.3s ease;" onload="this.style.opacity=1; this.parentElement.classList.remove('card-skeleton');" onerror="this.onerror=null; this.src='${fallbackUrl}';">
            <div style="padding: 0.7rem; background: rgba(0,0,0,0.85); display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 2;">
                <i class="ss ss-${c.setCode.toLowerCase()} ss-mtg" style="font-size: 1.2rem; color: ${isOwned ? color : '#555'};"></i>
                <span style="color: ${isOwned ? color : '#555'}; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${rarity}</span>
            </div>
        </div>
    `;
}

function updateCardDOMState(uuid, count, rarity) {
    const cards = document.querySelectorAll(`.library-card[data-uuid="${uuid}"]`);
    cards.forEach(cardEl => {
        const rarityColors = { common: '#fff', uncommon: '#3498db', rare: '#f1c40f', mythic: '#e74c3c' };
        const color = rarityColors[rarity.toLowerCase()] || '#fff';
        let badge = cardEl.querySelector('.card-badge-count');
        const icon = cardEl.querySelector('.ss-mtg');
        const text = cardEl.querySelector('span');

        if (count > 0) {
            cardEl.style.border = `2px solid ${color}`;
            cardEl.style.filter = '';
            cardEl.style.opacity = '';
            if (icon) icon.style.color = color;
            if (text) text.style.color = color;

            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'card-badge-count';
                badge.style.cssText = `position: absolute; top: 10px; right: 10px; background: var(--accent-color); color: #000; padding: 0.3rem 0.7rem; border-radius: 8px; font-weight: 900; font-size: 0.9rem; z-index: 10; box-shadow: 0 5px 15px rgba(0,0,0,0.5);`;
                cardEl.insertBefore(badge, cardEl.firstChild);
            }
            badge.innerText = `x${count}`;
            badge.style.display = 'block';
        } else {
            cardEl.style.border = `2px solid #333`;
            cardEl.style.filter = 'grayscale(60%) brightness(0.7)';
            cardEl.style.opacity = '0.8';
            if (icon) icon.style.color = '#555';
            if (text) text.style.color = '#555';
            if (badge) {
                badge.style.display = 'none';
            }
        }
    });
}

function openModal(cardData) {
    const modal = document.getElementById('explore-modal');
    const content = document.getElementById('explore-modal-content');
    
    const listToUse = Array.from(document.querySelectorAll('.library-card')).map(el => {
        const uuid = el.dataset.uuid;
        return state.activeSetsData.flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code}))).find(c => c.uuid === uuid);
    }).filter(Boolean);

    currentExploreModalIndex = listToUse.findIndex(c => c.uuid === cardData.uuid);

    const updateView = (data) => {
        const lang = state.language || 'en';
        const imgUrl = getCardImageUrl(data, lang);
        const fallbackUrl = getCardImageUrlEn(data);
        const inventoryItem = state.inventory.find(i => i.uuid === data.uuid);
        let currentCount = inventoryItem ? inventoryItem.count : 0;

        content.innerHTML = `
            <button id="modal-prev" class="modal-nav-btn"><i class="fas fa-chevron-left"></i></button>
            <button id="modal-next" class="modal-nav-btn"><i class="fas fa-chevron-right"></i></button>
            
            <div style="flex: 1; min-width: 350px; display: flex; justify-content: center;">
                <img src="${imgUrl}" style="width: 100%; max-width: 400px; border-radius: 20px; box-shadow: 0 20px 80px rgba(0,0,0,0.9);" onerror="this.src='${fallbackUrl}';">
            </div>
            <div style="flex: 1.2; min-width: 350px; display: flex; flex-direction: column; justify-content: center;">
                <h2 style="font-size: 2.5rem; margin-bottom: 1rem; font-family: var(--font-heading); color: #fff;">${data.name}</h2>
                <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 3rem; opacity: 0.7;">
                    <i class="ss ss-${data.setCode.toLowerCase()} ss-2x"></i>
                    <span style="font-size: 1.1rem; letter-spacing: 2px;">${data.setCode.toUpperCase()} — ${data.rarity.toUpperCase()}</span>
                </div>
                
                <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 3rem; border-radius: 30px; text-align: center; backdrop-filter: blur(5px);">
                    <p style="margin-bottom: 2rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 3px; font-size: 0.9rem;">Ejemplares en Colección</p>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 3rem;">
                        <button id="exp-dec" class="nav-btn" style="width: 60px; height: 60px; border-radius: 50%; font-size: 2rem; background: rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center;">-</button>
                        <span id="modal-count-display" style="font-size: 4.5rem; font-weight: 900; min-width: 80px;">${currentCount}</span>
                        <button id="exp-inc" class="nav-btn" style="width: 60px; height: 60px; border-radius: 50%; font-size: 2rem; background: var(--accent-color); color: #000; display: flex; justify-content: center; align-items: center;">+</button>
                    </div>
                </div>
            </div>
            <button id="exp-close" style="position: absolute; top: 2rem; right: 2rem; background: transparent; border: none; color: #fff; font-size: 2.5rem; cursor: pointer; opacity: 0.3;">✕</button>
        `;

        document.getElementById('exp-close').onclick = async () => {
            modal.style.display = 'none';
            window.removeEventListener('keydown', handleKeyNav);
            await state.loadInventory();
        };

        const navigate = (dir) => {
            currentExploreModalIndex += dir;
            if (currentExploreModalIndex < 0) currentExploreModalIndex = listToUse.length - 1;
            if (currentExploreModalIndex >= listToUse.length) currentExploreModalIndex = 0;
            updateView(listToUse[currentExploreModalIndex]);
        };

        document.getElementById('modal-prev').onclick = (e) => { e.stopPropagation(); navigate(-1); };
        document.getElementById('modal-next').onclick = (e) => { e.stopPropagation(); navigate(1); };

        document.getElementById('exp-dec').onclick = async () => {
            if (currentCount > 0) {
                currentCount--;
                document.getElementById('modal-count-display').innerText = currentCount;
                await updateInventoryCount(data, -1);
                const invItem = state.inventory.find(i => i.uuid === data.uuid);
                if (invItem) invItem.count = currentCount;
                updateCardDOMState(data.uuid, currentCount, data.rarity);
            }
        };

        document.getElementById('exp-inc').onclick = async () => {
            currentCount++;
            document.getElementById('modal-count-display').innerText = currentCount;
            await updateInventoryCount(data, 1);
            const invItem = state.inventory.find(i => i.uuid === data.uuid);
            if (invItem) invItem.count = currentCount;
            else state.inventory.push({ ...data, count: currentCount });
            updateCardDOMState(data.uuid, currentCount, data.rarity);
        };
    };

    const handleKeyNav = (e) => {
        if (e.key === 'ArrowRight') document.getElementById('modal-next').click();
        if (e.key === 'ArrowLeft') document.getElementById('modal-prev').click();
        if (e.key === 'Escape') document.getElementById('exp-close').click();
    };

    window.addEventListener('keydown', handleKeyNav);
    updateView(cardData);
    modal.style.display = 'flex';
}

// Ghost Portal Zoom (Escape Overflow)
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
    portal.src = imgEl.src;
    portal.style.width  = rect.width + 'px';
    portal.style.height = rect.height + 'px';
    portal.style.top    = rect.top + 'px';
    portal.style.left   = rect.left + 'px';
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
