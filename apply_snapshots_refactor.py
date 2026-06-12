import os
import re

file_path = 'js/screens/tournaments.js'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add the helper function
snapshot_func = """function captureDeckSnapshots(t, rIndex) {
    if (!t.rounds || !t.rounds[rIndex]) return;
    t.rounds[rIndex].deckSnapshots = {};
    t.players.forEach(p => {
        t.rounds[rIndex].deckSnapshots[p.id] = {
            name: p.deckName || 'Sin nombre',
            colors: [...(p.deckColors || [])],
            decklist: p.decklist || ''
        };
    });
}

// ── Modals & Algorithms ──────────────────────────────────────────────────────
"""
code = code.replace("// ── Modals & Algorithms ──────────────────────────────────────────────────────", snapshot_func)

# 2. Add capture call in generation
old_gen = """            t.rounds = generateRoundRobinPairings(t.players, t.isDoubleRound);
            t.currentRoundIndex = 0;
            t.status = 'active';
            await saveTournament(t);"""
new_gen = """            t.rounds = generateRoundRobinPairings(t.players, t.isDoubleRound);
            t.currentRoundIndex = 0;
            t.status = 'active';
            captureDeckSnapshots(t, 0);
            await saveTournament(t);"""
code = code.replace(old_gen, new_gen)

# 3. Add capture call in advance round
old_adv = """            if (t.currentRoundIndex < t.rounds.length - 1) {
                t.currentRoundIndex++;
                await saveTournament(t);"""
new_adv = """            if (t.currentRoundIndex < t.rounds.length - 1) {
                t.currentRoundIndex++;
                captureDeckSnapshots(t, t.currentRoundIndex);
                await saveTournament(t);"""
code = code.replace(old_adv, new_adv)

# 4. Update the visualizer HTML initialization
old_html = """                <div id="visualizer-header-row" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem; gap: 1rem;">
                    <h2 id="visualizer-title" style="color: var(--accent-color); margin: 0;">Mazo de Jugador</h2>
                    <div id="visualizer-stats" style="display: flex; gap: 2rem; align-items: center;"></div>
                </div>"""
new_html = """                <div id="visualizer-header-row" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem; gap: 1rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.8rem; flex: 1; min-width: 300px;">
                        <h2 id="visualizer-title" style="color: var(--accent-color); margin: 0;">Mazo de Jugador</h2>
                        <div id="visualizer-tabs" style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: thin; scrollbar-color: var(--accent-color) transparent;"></div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.8rem; align-items: flex-end;">
                        <button id="visualizer-copy-btn" class="lol-btn" style="padding: 0.4rem 1rem; font-size: 0.85rem;"><i class="fas fa-clipboard"></i> Copiar Lista</button>
                        <div id="visualizer-stats" style="display: flex; gap: 2rem; align-items: center;"></div>
                    </div>
                </div>"""
code = code.replace(old_html, new_html)

# 5. Refactor openVisualizerModal
old_vis = re.search(r'function openVisualizerModal\(playerId, tournament\) \{.*?\n\}\n(?=\n/\*\*)', code, re.DOTALL)

new_vis = """function openVisualizerModal(playerId, tournament) {
    const player = tournament.players.find(p => p.id === playerId);
    if (!player) return;

    document.getElementById('visualizer-modal').style.display = 'flex';
    const tabsContainer = document.getElementById('visualizer-tabs');
    tabsContainer.innerHTML = '';
    
    // Prepare deck objects
    const activeDeck = {
        name: player.deckName,
        colors: player.deckColors || [],
        decklist: player.decklist || ''
    };
    
    const availableDecks = [ { label: 'Mazo Activo', data: activeDeck, id: 'tab-active' } ];
    
    if (tournament.rounds) {
        tournament.rounds.forEach((round, index) => {
            if (round.deckSnapshots && round.deckSnapshots[playerId]) {
                availableDecks.push({
                    label: `Jornada ${index + 1}`,
                    data: round.deckSnapshots[playerId],
                    id: `tab-j${index + 1}`
                });
            }
        });
    }

    // Render tabs
    availableDecks.forEach((deckTab, idx) => {
        const btn = document.createElement('button');
        btn.className = `lol-tab-btn ${idx === 0 ? 'active' : ''}`;
        btn.style.padding = '0.3rem 0.8rem';
        btn.style.fontSize = '0.85rem';
        btn.textContent = deckTab.label;
        btn.onclick = () => {
            Array.from(tabsContainer.children).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderVisualizerDeck(deckTab.data, player.name);
        };
        tabsContainer.appendChild(btn);
    });

    // Copy Button setup
    const copyBtn = document.getElementById('visualizer-copy-btn');
    copyBtn.onclick = () => {
        const activeTabBtn = tabsContainer.querySelector('.active');
        const activeTabIndex = Array.from(tabsContainer.children).indexOf(activeTabBtn);
        const textToCopy = availableDecks[activeTabIndex]?.data.decklist || '';
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            copyBtn.style.color = '#2ecc71';
            copyBtn.style.borderColor = '#2ecc71';
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.color = '';
                copyBtn.style.borderColor = '';
            }, 2000);
        });
    };

    // Render initial deck
    renderVisualizerDeck(availableDecks[0].data, player.name);
}

function renderVisualizerDeck(deckData, playerName) {
    const title = document.getElementById('visualizer-title');
    const colorsHtml = (deckData.colors || []).map(c => 
        `<img src="https://svgs.scryfall.io/card-symbols/${c}.svg" style="width: 24px; height: 24px;" title="${c}">`
    ).join('');
    
    title.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;">${deckData.name || 'Mazo de ' + playerName} <div style="display: flex; gap: 5px; margin-left: 10px;">${colorsHtml}</div></div>`;

    const grid = document.getElementById('visualizer-grid');
    grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">Cargando mazo...</p>';
    
    const statsContainer = document.getElementById('visualizer-stats');
    statsContainer.innerHTML = '';
    
    // Parse decklist
    const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));
    const { parsed, unknown, errors } = parseDecklistText(deckData.decklist, allAvailableCards);

    if (parsed.length === 0 && (!unknown || unknown.length === 0)) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">La lista está vacía o no contiene cartas válidas del pool actual.</p>';
        return;
    }

    // Build mana curve
    const curve = Array(8).fill(0);
    parsed.forEach(card => {
        const type = card.type || card.type_line || '';
        if (type.toLowerCase().includes('land') || type.toLowerCase().includes('tierra')) return;
        const cmc = card.convertedManaCost !== undefined ? card.convertedManaCost : (card.manaValue || card.cmc || 0);
        const index = Math.min(parseInt(cmc) || 0, 7);
        curve[index] += card.count;
    });
    const maxVal = Math.max(...curve, 1);
    const curveHtml = curve.map((c, i) => {
        const label = `<img src="https://svgs.scryfall.io/card-symbols/${i}.svg" class="mana-sym" style="width:13px;height:13px" onerror="this.outerHTML='${i===7?'7+':i}'">`;
        return `<div class="curve-bar-col" style="display: flex; flex-direction: column; align-items: center; width: 20px; gap: 3px;">
            <div class="curve-bar-count" style="font-size: 0.7rem; color: var(--text-secondary);">${c||''}</div>
            <div class="curve-bar-wrap" style="height: 60px; width: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden;">
                <div class="curve-bar" style="width: 100%; background: var(--accent-color); border-radius: 4px; transition: height 0.5s ease; height: ${(c/maxVal)*100}%"></div>
            </div>
            ${label}
        </div>`;
    }).join('');
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; background: rgba(0,0,0,0.3); padding: 10px 15px; border-radius: 12px; border: 1px solid var(--border-color);">
            <div style="margin-right: 15px; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;">Curva de Maná</div>
            ${curveHtml}
        </div>
    `;

    let html = '';
    const allCards = [...parsed, ...(unknown || [])];

    allCards.forEach(card => {
        const badgeHTML = `
            <div style="position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); border: 1px solid var(--accent-color); color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.85rem; font-weight: bold; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.8); white-space: nowrap;">
                x${card.count}
            </div>
        `;
        
        if (card.isUnknown) {
            html += `
                <div style="position: relative; aspect-ratio: 63/88; background: linear-gradient(135deg, rgba(30,20,10,0.8), rgba(0,0,0,0.9)); border: 1px solid var(--accent-color); border-radius: 4.75% / 3.5%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10px; box-shadow: inset 0 0 20px rgba(133, 109, 64, 0.2); transition: transform 0.2s, box-shadow 0.2s, z-index 0s;"
                     onmouseover="this.style.transform='scale(${state.hoverZoom || 1.1})'; this.style.boxShadow='0 10px 20px rgba(0,0,0,0.5), 0 0 15px rgba(255, 250, 141, 0.3)'; this.style.zIndex='100';"
                     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='inset 0 0 20px rgba(133, 109, 64, 0.2)'; this.style.zIndex='';">
                    <i class="fas fa-question-circle" style="font-size: 2.5rem; color: var(--accent-secondary); margin-bottom: 0.5rem; opacity: 0.5;"></i>
                    <span style="color: var(--accent-color); font-weight: bold; font-size: 0.9rem; text-shadow: 0 2px 4px rgba(0,0,0,0.8); word-wrap: break-word; width: 100%;">${card.name}</span>
                    ${badgeHTML}
                </div>
            `;
        } else {
            const imgUrl = getCardImageUrl(card, state.language || 'en');
            const fallbackUrl = getCardImageUrlEn(card);
            
            html += `
                <div style="position: relative; aspect-ratio: 63/88; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s, z-index 0s;"
                     onmouseover="this.style.transform='scale(${state.hoverZoom || 1.1})'; this.style.boxShadow='0 10px 20px rgba(0,0,0,0.5), 0 0 15px rgba(255, 250, 141, 0.3)'; this.style.zIndex='100';"
                     onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'; this.style.zIndex='';">
                    <div style="width: 100%; height: 100%;"
                         onmouseenter="if(!window.tourneyHoverImg){window.tourneyHoverImg=document.createElement('img');window.tourneyHoverImg.className='card-hover-preview';window.tourneyHoverImg.style.zIndex='11000';document.body.appendChild(window.tourneyHoverImg);} window.tourneyHoverImg.src='${imgUrl}'; window.tourneyHoverImg.onerror=function(){if(this.src!=='${fallbackUrl}')this.src='${fallbackUrl}'}; window.tourneyHoverImg.style.display='block'; const rect=this.getBoundingClientRect(); const zoom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom')||'1.4'); const tw=rect.width*zoom; const th=rect.height*zoom; window.tourneyHoverImg.style.left=(rect.left+(rect.width/2)-(tw/2))+'px'; window.tourneyHoverImg.style.top=(rect.top+(rect.height/2)-(th/2))+'px'; requestAnimationFrame(()=>window.tourneyHoverImg.classList.add('visible')); this.children[0].style.opacity='0';"
                         onmouseleave="if(window.tourneyHoverImg){window.tourneyHoverImg.classList.remove('visible'); window.tourneyHoverImg.style.display='none';} this.children[0].style.opacity='1';">
                        <img src="${imgUrl}" alt="${card.name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4.75% / 3.5%; display: block; transition: opacity 0.15s ease;" onerror="this.onerror=null;this.src='${fallbackUrl}'">
                    </div>
                    ${badgeHTML}
                </div>
            `;
        }
    });

    grid.innerHTML = html;
}
"""

if old_vis:
    code = code.replace(old_vis.group(0), new_vis)
else:
    print("WARNING: Could not find openVisualizerModal regex match.")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patch applied for deck snapshots.")
