import os

files = [
    'js/screens/explore.js',
    'js/screens/collection.js',
    'js/screens/decks.js'
]

portal_code = """let ghostPortal = null;
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
            portal.innerHTML = `
            <div class="ghost-preview-card-container dfc-wrapper" style="top: ${centerY}px; left: ${centerX}px;">
              <div class="card-flipper ghost-flipper ${isFlipped ? 'is-flipped' : ''}" style="width: 100%; height: 100%;">
                <div class="card-face card-front" style="width: 100%; height: 100%;">
                  <img src="${imgFront.src}">
                </div>
                <div class="card-face card-back" style="width: 100%; height: 100%;">
                  <img src="${imgBack.src}">
                </div>
              </div>
              <button class="flip-btn ghost-flip-btn">↻</button>
            </div>`;
            
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
            portal.innerHTML = `<img src="${imgEl.src}" class="ghost-preview-card-container" style="top: ${centerY}px; left: ${centerX}px;">`;
        }
    }
}

function hideGhostPortal() {
    const portal = document.getElementById('ghost-portal');
    if (portal) portal.innerHTML = '';
}
"""

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        code = file.read()
    
    # Fix collection.js duplicate imports
    if 'collection.js' in f:
        import_block = """import { state } from '../utils/state.js';
import { renderSearchUI, filterCards, parseDecklistText } from '../components/searchEngine.js';
import { updateInventoryCount, clearNewStatus, saveToInventory, removeFromInventory, clearInventory } from '../utils/db.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';"""
        while code.count(import_block) > 1:
            code = code.replace(import_block + '\n' + import_block, import_block)
            code = code.replace(import_block + '\r\n' + import_block, import_block)
    
    start_str1 = '// Ghost Portal Zoom (Escape Overflow)'
    start_str2 = '// Ghost Portal Zoom'
    start_str3 = 'let ghostPortal = null;'
    
    idx = code.find(start_str1)
    if idx == -1: idx = code.find(start_str2)
    if idx == -1: idx = code.find(start_str3)
    
    if idx != -1:
        before = code[:idx]
        new_code = before + '\n// Ghost Portal Zoom\n' + portal_code
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_code)
        print(f"Fixed {f}")
    else:
        print(f"Could not find portal block in {f}")
