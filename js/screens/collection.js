import { state } from '../utils/state.js';
import { renderSearchUI, filterCards, parseDecklistText } from '../components/searchEngine.js';
import { updateInventoryCount, clearNewStatus, saveToInventory, removeFromInventory, clearInventory } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

let currentFilteredCards = [];
let currentCollectionModalIndex = -1;

// ── Ghost Portal Zoom (Escape Overflow) ───────────────────────────────────────
let ghostPortal = null;
function getGhostPortal() {
    let portal = document.getElementById('ghost-portal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'ghost-portal';
        document.body.appendChild(portal);
    }
    return portal;
}

function showGhostPortal(cardEl) {
    const portal = getGhostPortal();
    portal.innerHTML = '';
    
    const rect = cardEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dfcWrapper = cardEl.querySelector('.dfc-wrapper');
    if (dfcWrapper) {
        const cardFlipper = dfcWrapper.querySelector('.card-flipper');
        const isFlipped = cardFlipper && cardFlipper.classList.contains('is-flipped');
        
        const imgFront = dfcWrapper.querySelector('.card-front img');
        const imgBack = dfcWrapper.querySelector('.card-back img');
        
        if (imgFront && imgBack) {
            portal.innerHTML = \
            <div class=\"ghost-preview-card-container dfc-wrapper\" style=\"top: \px; left: \px;\">
              <div class=\"card-flipper ghost-flipper \\" style=\"width: 100%; height: 100%;\">
                <div class=\"card-face card-front\" style=\"width: 100%; height: 100%;\">
                  <img src=\"\\">
                </div>
                <div class=\"card-face card-back\" style=\"width: 100%; height: 100%;\">
                  <img src=\"\\">
                </div>
              </div>
              <button class=\"flip-btn ghost-flip-btn\">?</button>
            </div>\;
            
            const ghostFlipBtn = portal.querySelector('.ghost-flip-btn');
            ghostFlipBtn.onclick = (event) => {
                event.stopPropagation();
                portal.querySelector('.ghost-flipper').classList.toggle('is-flipped');
                if (cardFlipper) cardFlipper.classList.toggle('is-flipped');
            };
        }
    } else {
        const imgEl = cardEl.querySelector('img');
        if (imgEl) {
            portal.innerHTML = \<img src=\"\\" class=\"ghost-preview-card-container\" style=\"top: \px; left: \px;\">\;
        }
    }
}

function hideGhostPortal() {
    const portal = document.getElementById('ghost-portal');
    if (portal) portal.innerHTML = '';
}

