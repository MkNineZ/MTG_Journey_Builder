import { getAllDecks, getDeck, saveDeck, deleteDeck } from '../utils/db.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn, getCardArtCropUrl, getCardArtCropUrlEn } from '../utils/api.js';
import { filterCards, renderSearchUI } from '../components/searchEngine.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
const MAX_COPIES  = 4;
const MAIN_MIN    = 60;
const SIDE_MAX    = 15;
const FORMATS     = ['clasico', 'commander'];
const FORMAT_LABELS = { clasico: 'Clásico', commander: 'Commander / EDH' };

// ── Module State ──────────────────────────────────────────────────────────────
let view        = 'list';
let currentDeck = null;
let currentZone = 'mainboard';
let statsOpen   = false;
let filteredInv = []; // current filtered inventory for the editor
let handHistory = [];

// ── Hover preview element ─────────────────────────────────────────────────────
let hoverImg = null;
function getHoverImg() {
    if (!hoverImg) {
        hoverImg = document.createElement('img');
        hoverImg.className = 'card-hover-preview';
        document.body.appendChild(hoverImg);
    }
    return hoverImg;
}
function showHoverPreview(card, evt) {
    const img = getHoverImg();
    const lang = state.language || 'en';
    const localizedUrl = getCardImageUrl(card, lang);
    const fallbackUrl = getCardImageUrlEn(card);
    
    if (img.dataset.cardId !== card.uuid) {
        img.src = localizedUrl;
        img.dataset.cardId = card.uuid;

        img.onerror = function() {
            if (this.src !== fallbackUrl) {
                this.src = fallbackUrl;
            }
        };
    }
    
    img.style.display = 'block';
    positionHoverPreview(evt);
    requestAnimationFrame(() => {
        img.classList.add('visible');
    });
}
function positionHoverPreview(evt) {
    const img = getHoverImg();
    const itemEl = evt.target.closest('.deck-entry-name[data-uuid]') || evt.target.closest('.deck-entry-row') || evt.target.closest('li');
    const sidebarEl = document.querySelector('.app-sidebar-deckboard') || document.getElementById('de-sidebar');
    
    if (!itemEl || !sidebarEl) return;
    
    const rect = itemEl.getBoundingClientRect();
    const colRect = sidebarEl.getBoundingClientRect();
    
    const zoomStr = getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom') || '1.4';
    const zoom = parseFloat(zoomStr) || 1.4;
    const imgWidth = 220 * zoom; 
    const imgHeight = imgWidth * (3.5 / 2.5); // Magic MTG ratio (88x63)
    
    const gap = 15;
    let x = colRect.left - imgWidth - gap;
    
    // Alineación vertical: centro de la previsualización con el borde superior del item
    let y = rect.top - (imgHeight / 2);
    
    // Boundary checks
    if (y < 10) y = 10;
    if (y + imgHeight > window.innerHeight) y = window.innerHeight - imgHeight - 10;
    if (x < 10) x = 10;

    img.style.left = x + 'px';
    img.style.top  = y + 'px';
}
function hideHoverPreview() {
    const img = getHoverImg();
    img.classList.remove('visible');
    const hint = document.getElementById('flip-hint');
    if (hint) hint.style.opacity = '0';
    setTimeout(() => { if (!img.classList.contains('visible')) img.style.display = 'none'; }, 160);
}

// ── Ghost Portal Zoom (Escape Overflow) ───────────────────────────────────────

// Ghost Portal Zoom
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
