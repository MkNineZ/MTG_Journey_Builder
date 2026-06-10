const fs = require('fs');
const files = [
    'C:/Users/PC/Documents/GitHub/MTG_Journey_Builder/js/screens/explore.js',
    'C:/Users/PC/Documents/GitHub/MTG_Journey_Builder/js/screens/collection.js',
    'C:/Users/PC/Documents/GitHub/MTG_Journey_Builder/js/screens/decks.js'
];

const portalCode = `let ghostPortal = null;
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
            portal.innerHTML = \`
            <div class="ghost-preview-card-container dfc-wrapper" style="top: \${centerY}px; left: \${centerX}px;">
              <div class="card-flipper ghost-flipper \${isFlipped ? 'is-flipped' : ''}" style="width: 100%; height: 100%;">
                <div class="card-face card-front" style="width: 100%; height: 100%;">
                  <img src="\${imgFront.src}">
                </div>
                <div class="card-face card-back" style="width: 100%; height: 100%;">
                  <img src="\${imgBack.src}">
                </div>
              </div>
              <button class="flip-btn ghost-flip-btn">↻</button>
            </div>\`;
            
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
            portal.innerHTML = \`<img src="\${imgEl.src}" class="ghost-preview-card-container" style="top: \${centerY}px; left: \${centerX}px;">\`;
        }
    }
}

function hideGhostPortal() {
    const portal = document.getElementById('ghost-portal');
    if (portal) portal.innerHTML = '';
}
`;

for (let file of files) {
    let code = fs.readFileSync(file, 'utf8');
    
    // In collection.js, fix the duplicate import issue
    if (file.includes('collection.js')) {
        const importBlock = `import { state } from '../utils/state.js';
import { renderSearchUI, filterCards, parseDecklistText } from '../components/searchEngine.js';
import { updateInventoryCount, clearNewStatus, saveToInventory, removeFromInventory, clearInventory } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';`;
        while (code.indexOf(importBlock) !== code.lastIndexOf(importBlock)) {
            code = code.replace(importBlock + '\r\n' + importBlock, importBlock);
            code = code.replace(importBlock + '\n' + importBlock, importBlock);
        }
    }
    
    const startStr1 = '// Ghost Portal Zoom (Escape Overflow)';
    const startStr2 = '// Ghost Portal Zoom';
    const startStr3 = 'let ghostPortal = null;';
    
    let startIndex = code.indexOf(startStr1);
    if (startIndex === -1) startIndex = code.indexOf(startStr2);
    if (startIndex === -1) startIndex = code.indexOf(startStr3);
    
    if (startIndex !== -1) {
        const before = code.substring(0, startIndex);
        fs.writeFileSync(file, before + '\n// Ghost Portal Zoom\n' + portalCode);
    }
}
console.log('Fixed all files');
