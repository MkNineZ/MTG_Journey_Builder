import { getAllTournaments, getTournament, saveTournament, deleteTournament } from '../utils/db.js';
import { parseDecklistText } from '../components/searchEngine.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn, getCardArtCropUrl, getCardArtCropUrlEn } from '../utils/api.js';

let activeTournamentId = null;
let currentTab = 'standings'; // 'standings', 'bracket', 'participants'

export async function initTournaments() {
    const container = document.getElementById('tournaments');
    if (!container) return;

    container.innerHTML = `
        <div class="lol-header">
            <div>
                <h1 style="margin: 0;">Centro de Torneos</h1>
                <p style="color: var(--text-secondary); margin-top: 5px;">Gestiona tus eventos, jugadores y clasificaciones</p>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <select id="tournament-selector" class="settings-select" style="width: 250px;">
                    <option value="">Cargando torneos...</option>
                </select>
                <button id="btn-new-tournament" class="btn-mythic-accent">Nuevo Torneo</button>
            </div>
        </div>

        <div class="lol-tabs-container">
            <button class="lol-tab-btn active" data-tab="standings">Clasificación</button>
            <button class="lol-tab-btn" data-tab="bracket">Cuadro</button>
            <button class="lol-tab-btn" data-tab="participants">Participantes y Mazos</button>
        </div>

        <div id="tournament-content" style="margin-top: 2rem;"></div>

        <!-- Create Tournament Modal -->
        <div id="create-tourney-modal" class="deck-modal-overlay" style="display: none;">
            <div class="deck-modal-content" style="max-width: 500px;">
                <button id="create-tourney-close" class="deck-modal-close">&times;</button>
                <h2 style="color: var(--accent-color); margin-bottom: 1rem;">Crear Torneo</h2>
                
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Nombre del Evento</label>
                        <input type="text" id="create-tourney-name" class="settings-select" style="width: 100%; box-sizing: border-box;" placeholder="Ej. Liga MTG 2026">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Formato</label>
                        <select id="create-tourney-format" class="settings-select" style="width: 100%; box-sizing: border-box;">
                            <option value="round_robin">Liga / Round Robin</option>
                        </select>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="create-tourney-double" style="width: 18px; height: 18px; accent-color: var(--accent-color);">
                        <label style="color: var(--text-primary);">Ida y Vuelta</label>
                    </div>
                    <button id="create-tourney-save" class="save-btn" style="width: 100%; margin-top: 1rem;">Crear Evento</button>
                </div>
            </div>
        </div>

        <!-- Add Player / Edit Decklist Modal -->
        <div id="tourney-modal" class="deck-modal-overlay" style="display: none;">
            <div class="deck-modal-content" style="max-width: 500px;">
                <button id="tourney-modal-close" class="deck-modal-close">&times;</button>
                <h2 id="tourney-modal-title" style="color: var(--accent-color); margin-bottom: 1rem;">Añadir Jugador</h2>
                
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Nombre del Jugador</label>
                        <input type="text" id="tourney-player-name" class="settings-select" style="width: 100%; box-sizing: border-box;" placeholder="Ej. Faker">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Nombre del Mazo</label>
                        <input type="text" id="tourney-deck-name" class="settings-select" style="width: 100%; box-sizing: border-box;" placeholder="Ej. Abzan Midrange">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Colores del Mazo</label>
                        <div style="display: flex; gap: 10px; align-items: center;" id="tourney-deck-colors">
                            <button class="mana-btn" data-color="W" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #fffddd; padding: 3px; cursor: pointer; transition: 0.2s;" title="Blanco"><img src="https://svgs.scryfall.io/card-symbols/W.svg" style="width:100%;height:100%; pointer-events:none;"></button>
                            <button class="mana-btn" data-color="U" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #c1d8e9; padding: 3px; cursor: pointer; transition: 0.2s;" title="Azul"><img src="https://svgs.scryfall.io/card-symbols/U.svg" style="width:100%;height:100%; pointer-events:none;"></button>
                            <button class="mana-btn" data-color="B" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #bab1ab; padding: 3px; cursor: pointer; transition: 0.2s;" title="Negro"><img src="https://svgs.scryfall.io/card-symbols/B.svg" style="width:100%;height:100%; pointer-events:none;"></button>
                            <button class="mana-btn" data-color="R" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #f9aa8f; padding: 3px; cursor: pointer; transition: 0.2s;" title="Rojo"><img src="https://svgs.scryfall.io/card-symbols/R.svg" style="width:100%;height:100%; pointer-events:none;"></button>
                            <button class="mana-btn" data-color="G" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; background: #9bd3ae; padding: 3px; cursor: pointer; transition: 0.2s;" title="Verde"><img src="https://svgs.scryfall.io/card-symbols/G.svg" style="width:100%;height:100%; pointer-events:none;"></button>
                        </div>
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Lista del Mazo (Texto Plano)</label>
                        <textarea id="tourney-player-decklist" class="settings-select" style="width: 100%; height: 200px; resize: vertical; box-sizing: border-box; font-family: monospace;" placeholder="4x Siege Rhino\n2x Hero's Downfall..."></textarea>
                    </div>
                    <button id="tourney-modal-save" class="save-btn" style="width: 100%; margin-top: 1rem;">Guardar Jugador</button>
                </div>
            </div>
        </div>

        <!-- Deck Visualizer Modal -->
        <div id="visualizer-modal" class="deck-modal-overlay" style="display: none; z-index: 10000;">
            <div class="deck-modal-content" style="width: 90%; max-width: 1000px; max-height: 85vh; display: flex; flex-direction: column;">
                <button id="visualizer-close" class="deck-modal-close">&times;</button>
                <div id="visualizer-header-row" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem; gap: 1rem;">
                    <div style="display: flex; flex-direction: column; gap: 0.8rem; flex: 1; min-width: 300px;">
                        <h2 id="visualizer-title" style="color: var(--accent-color); margin: 0;">Mazo de Jugador</h2>
                        <div id="visualizer-tabs" style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 5px; scrollbar-width: thin; scrollbar-color: var(--accent-color) transparent;"></div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.8rem; align-items: flex-end;">
                        <button id="visualizer-copy-btn" class="lol-btn" style="padding: 0.4rem 1rem; font-size: 0.85rem;"><i class="fas fa-clipboard"></i> Copiar Lista</button>
                        <div id="visualizer-stats" style="display: flex; gap: 2rem; align-items: center;"></div>
                    </div>
                </div>
                <div id="visualizer-grid" style="flex: 1; overflow-y: auto; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px;">
                    <!-- Cards injected here -->
                </div>
            </div>
        </div>
    `;

    bindStaticListeners();
    await refreshTournamentsList();
}

function bindStaticListeners() {
    document.querySelectorAll('.lol-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.lol-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            renderCurrentTab();
        });
    });

    document.getElementById('btn-new-tournament').addEventListener('click', () => {
        document.getElementById('create-tourney-name').value = '';
        document.getElementById('create-tourney-double').checked = false;
        document.getElementById('create-tourney-modal').style.display = 'flex';
    });

    document.getElementById('create-tourney-close').addEventListener('click', () => {
        document.getElementById('create-tourney-modal').style.display = 'none';
    });

    document.getElementById('create-tourney-save').addEventListener('click', async () => {
        const name = document.getElementById('create-tourney-name').value.trim();
        const double = document.getElementById('create-tourney-double').checked;
        if (!name) return alert('El nombre es obligatorio');
        
        const newT = {
            name,
            status: 'draft',
            format: 'round_robin',
            isDoubleRound: double,
            players: [],
            matches: [],
            rounds: []
        };
        const id = await saveTournament(newT);
        activeTournamentId = id;
        document.getElementById('create-tourney-modal').style.display = 'none';
        await refreshTournamentsList();
    });

    document.getElementById('tournament-selector').addEventListener('change', (e) => {
        activeTournamentId = e.target.value;
        renderCurrentTab();
    });

    document.getElementById('tourney-modal-close').addEventListener('click', () => {
        document.getElementById('tourney-modal').style.display = 'none';
    });

    document.getElementById('visualizer-close').addEventListener('click', () => {
        document.getElementById('visualizer-modal').style.display = 'none';
    });
}

async function refreshTournamentsList() {
    const all = await getAllTournaments();
    const select = document.getElementById('tournament-selector');
    
    if (all.length === 0) {
        select.innerHTML = '<option value="">No hay torneos</option>';
        activeTournamentId = null;
        renderCurrentTab();
        return;
    }

    select.innerHTML = all.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    if (!activeTournamentId || !all.find(t => t.id === activeTournamentId)) {
        activeTournamentId = all[0].id;
    }
    select.value = activeTournamentId;
    
    renderCurrentTab();
}

async function renderCurrentTab() {
    const content = document.getElementById('tournament-content');
    if (!activeTournamentId) {
        content.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 3rem;">No hay torneos activos. Crea uno para empezar.</p>';
        return;
    }

    const t = await getTournament(activeTournamentId);
    if (!t) return;

    if (currentTab === 'standings') renderStandings(t, content);
    else if (currentTab === 'participants') renderParticipants(t, content);
    else if (currentTab === 'bracket') renderBracket(t, content);
}

// ── Tab Renderers ────────────────────────────────────────────────────────────

function renderStandings(t, container) {
    if (!t.players || t.players.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; margin-top: 3rem;">
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">No hay jugadores inscritos en este torneo.</p>
                <button class="lol-btn btn-add-player" style="margin: 0 auto;">Añadir Primer Jugador</button>
            </div>`;
        bindDynamicListeners(t);
        return;
    }

    // Calculate dynamic stats based on completed matches in active tournament
    let standings = t.players.map(p => ({ ...p, matchPoints: 0, matchWins: 0, matchLosses: 0, gameWins: 0, gameLosses: 0 }));
    
    if (t.status === 'active' && t.rounds) {
        t.rounds.forEach(round => {
            round.matches.forEach(match => {
                if (match.status === 'completed' && match.playerA && match.playerB) {
                    const p1 = standings.find(x => x.id === match.playerA);
                    const p2 = standings.find(x => x.id === match.playerB);
                    if (p1 && p2) {
                        p1.gameWins += match.scoreA;
                        p1.gameLosses += match.scoreB;
                        p2.gameWins += match.scoreB;
                        p2.gameLosses += match.scoreA;
                        
                        if (match.winnerId === p1.id) {
                            p1.matchPoints += 3;
                            p1.matchWins++;
                            p2.matchLosses++;
                        } else if (match.winnerId === p2.id) {
                            p2.matchPoints += 3;
                            p2.matchWins++;
                            p1.matchLosses++;
                        }
                    }
                }
            });
        });
    }

    const sorted = standings.sort((a, b) => {
        if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
        const diffA = a.gameWins - a.gameLosses;
        const diffB = b.gameWins - b.gameLosses;
        if (diffB !== diffA) return diffB - diffA;
        return b.matchWins - a.matchWins;
    });

    let html = `
        <table class="lol-table">
            <thead>
                <tr>
                    <th style="width: 80px; text-align: center;">Pos</th>
                    <th>Jugador</th>
                    <th>Mazo</th>
                    <th style="text-align: center;">Puntos</th>
                    <th style="text-align: center;">Partidas (V-D)</th>
                    <th style="text-align: center;">Juegos (V-D)</th>
                    <th style="text-align: right;">Dif. Juegos</th>
                </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach((p, index) => {
        const color = index === 0 ? 'var(--accent-color)' : 'var(--text-primary)';
        const diff = p.gameWins - p.gameLosses;
        const diffStr = diff > 0 ? `+${diff}` : diff.toString();
        
        const colorsHtml = (p.deckColors || []).map(c => 
            `<img src="https://svgs.scryfall.io/card-symbols/${c}.svg" style="width: 16px; height: 16px;" title="${c}">`
        ).join('');
        
        const deckInfoHtml = p.deckName || p.deckColors?.length ? 
            `<div style="display: flex; align-items: center; gap: 8px;"><span style="color: var(--accent-color);">${p.deckName || 'Mazo sin nombre'}</span> <div style="display: flex; gap: 3px;">${colorsHtml}</div></div>` 
            : `<span style="color: var(--text-secondary); font-style: italic;">Sin mazo</span>`;

        html += `
            <tr class="lol-row">
                <td style="text-align: center; font-family: var(--font-heading); font-size: 1.2rem; color: ${color};">${index + 1}</td>
                <td style="font-weight: 600;">${p.name}</td>
                <td>${deckInfoHtml}</td>
                <td style="text-align: center; font-weight: bold; color: var(--accent-color); font-size: 1.1rem;">${p.matchPoints}</td>
                <td style="text-align: center; color: var(--text-secondary);">${p.matchWins} - ${p.matchLosses}</td>
                <td style="text-align: center; color: var(--text-secondary);">${p.gameWins} - ${p.gameLosses}</td>
                <td style="text-align: right; color: ${diff > 0 ? '#2ecc71' : (diff < 0 ? '#e74c3c' : 'var(--text-secondary)')}; font-weight: bold;">${diffStr}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;

    if (t.status === 'draft') {
        html += `
            <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
                <button class="lol-btn btn-add-player"><i class="fas fa-plus"></i> Añadir Jugador</button>
                <button class="save-btn btn-generate-bracket"><i class="fas fa-play"></i> Generar Emparejamientos</button>
            </div>
        `;
    } else {
        html += `
            <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
                <button class="lol-btn btn-reset-tourney" style="border-color: #e74c3c; color: #e74c3c;"><i class="fas fa-undo"></i> Reiniciar Torneo</button>
            </div>
        `;
    }

    container.innerHTML = html;
    bindDynamicListeners(t);
}

function renderParticipants(t, container) {
    const isDraft = t.status === 'draft';
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0; color: var(--text-secondary);">Participantes (${t.players?.length || 0})</h3>
            ${isDraft ? `<button class="lol-btn btn-add-player"><i class="fas fa-plus"></i> Añadir Jugador</button>` : ''}
        </div>
        <div class="lol-grid">
    `;

    if (!t.players || t.players.length === 0) {
        html += `<p style="color: var(--text-secondary); grid-column: 1 / -1;">No hay participantes.</p>`;
    } else {
        const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));
        
        t.players.forEach(p => {
            let bgImage = 'background: rgba(0,0,0,0.5);';
            const { parsed } = parseDecklistText(p.decklist, allAvailableCards);
            if (parsed && parsed.length > 0) {
                const randomCard = parsed[Math.floor(Math.random() * parsed.length)];
                const artUrl = getCardArtCropUrl(randomCard, state.language || 'en');
                bgImage = `background: linear-gradient(rgba(15,15,15,0.6), rgba(15,15,15,0.8)), url('${artUrl}'); background-size: cover; background-position: center;`;
            }

            const colorsHtml = (p.deckColors || []).map(c => 
                `<img src="https://svgs.scryfall.io/card-symbols/${c}.svg" style="width: 20px; height: 20px;" title="${c}">`
            ).join('');

            html += `
                <div class="lol-card" style="${bgImage}">
                    <div class="lol-card-header">
                        <strong style="font-size: 1.2rem; color: var(--text-primary);">${p.name}</strong>
                        <span style="color: var(--accent-secondary); font-family: var(--font-heading);">${p.stats?.wins || 0}V - ${p.stats?.losses || 0}D</span>
                    </div>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; padding: 1rem 0;">
                        <h4 style="color: var(--accent-color); margin: 0; font-size: 1.1rem; text-align: center;">${p.deckName || 'Mazo sin nombre'}</h4>
                        <div style="display: flex; gap: 5px;">${colorsHtml}</div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 0.5rem;">
                        <button class="lol-btn btn-view-visual" data-player-id="${p.id}" style="flex: 1; border-color: var(--text-secondary); color: var(--text-secondary);">
                            <i class="fas fa-eye"></i> Ver Mazo
                        </button>
                        <button class="lol-btn btn-edit-deck" data-player-id="${p.id}" style="flex: 1;">
                            <i class="fas fa-edit"></i> Editar Mazo
                        </button>
                        ${isDraft ? `
                            <button class="lol-btn btn-delete-player" data-player-id="${p.id}" style="border-color: #e74c3c; color: #e74c3c;" title="Eliminar">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
    bindDynamicListeners(t);
}

function renderBracket(t, container) {
    if (t.status === 'draft' || !t.rounds) {
        container.innerHTML = `
            <div style="text-align: center; margin-top: 3rem; padding: 2rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px dashed var(--border-color);">
                <i class="fas fa-calendar-alt" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
                <h2>Emparejamientos Pendientes</h2>
                <p style="color: var(--text-secondary);">Genera los emparejamientos en la pestaña "Clasificación" para ver las jornadas aquí.</p>
            </div>
        `;
        return;
    }

    // Compatibilidad para torneos viejos sin formato estructurado o sin currentRoundIndex
    if (t.rounds.length > 0 && Array.isArray(t.rounds[0])) {
        t.rounds = t.rounds.map(r => ({
            format: 'bo3',
            matches: r.map(m => ({ ...m, scoreA: 0, scoreB: 0, winnerId: null, status: m.playerA && m.playerB ? 'pending' : 'completed' }))
        }));
    }
    if (t.currentRoundIndex === undefined) t.currentRoundIndex = 0;

    let html = `<div style="display: flex; flex-direction: column; gap: 2rem;">`;
    
    t.rounds.forEach((round, rIndex) => {
        const isActive = rIndex === t.currentRoundIndex;
        const isPast = rIndex < t.currentRoundIndex;
        const isFuture = rIndex > t.currentRoundIndex;
        
        if (isFuture) return; // Hide future rounds

        let formatSelect = '';
        if (isActive) {
            formatSelect = `
                <select class="settings-select round-format-selector" data-rindex="${rIndex}" style="margin-left: 1rem; padding: 0.2rem 0.5rem; width: auto; font-size: 0.9rem;">
                    <option value="bo1" ${round.format === 'bo1' ? 'selected' : ''}>Bo1 (Al mejor de 1)</option>
                    <option value="bo3" ${round.format === 'bo3' ? 'selected' : ''}>Bo3 (Al mejor de 3)</option>
                    <option value="bo5" ${round.format === 'bo5' ? 'selected' : ''}>Bo5 (Al mejor de 5)</option>
                </select>
            `;
        } else {
            formatSelect = `<span style="color: var(--text-secondary); margin-left: 1rem; font-size: 0.9rem; font-weight: normal;">(${round.format.toUpperCase()})</span>`;
        }

        html += `<div style="background: ${isActive ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${isActive ? 'var(--accent-color)' : 'var(--border-color)'}; border-radius: 8px; padding: 1.5rem; position: relative; box-shadow: ${isActive ? '0 0 15px rgba(196,160,82,0.1)' : 'none'};">
            ${isActive ? '<div style="position: absolute; top: -10px; right: 20px; background: var(--accent-color); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;">EN JUEGO</div>' : ''}
            <h3 style="color: var(--accent-secondary); margin-top: 0; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem; display: flex; align-items: center;">
                Jornada ${rIndex + 1} ${formatSelect}
            </h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;
        
        let allCompleted = true;

        round.matches.forEach((match, mIndex) => {
            if (match.status !== 'completed') allCompleted = false;

            const p1Name = match.playerA ? t.players.find(p => p.id === match.playerA)?.name : 'Descanso (Bye)';
            const p2Name = match.playerB ? t.players.find(p => p.id === match.playerB)?.name : 'Descanso (Bye)';
            const isBye = !match.playerA || !match.playerB;
            
            html += `
                <div class="match-container" data-rindex="${rIndex}" data-mindex="${mIndex}" style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.8rem; border-radius: 4px; border-left: 3px solid ${match.status === 'completed' ? '#2ecc71' : 'var(--text-secondary)'};">
            `;

            if (isBye) {
                html += `
                    <div style="flex: 1; text-align: right; color: var(--text-primary); font-weight: 600;">${p1Name}</div>
                    <div style="width: 100px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">(Descanso)</div>
                    <div style="flex: 1; text-align: left; color: var(--text-primary); font-weight: 600;">${p2Name}</div>
                `;
            } else if (match.status === 'completed') {
                const p1Winner = match.winnerId === match.playerA;
                const p2Winner = match.winnerId === match.playerB;
                html += `
                    <div style="flex: 1; text-align: right; color: ${p1Winner ? 'var(--accent-color)' : 'var(--text-primary)'}; font-weight: ${p1Winner ? 'bold' : 'normal'}; font-size: ${p1Winner ? '1.1rem' : '1rem'};">${p1Name}</div>
                    <div style="width: 100px; text-align: center; color: #fff; font-family: var(--font-heading); font-size: 1.2rem; display: flex; justify-content: center; gap: 10px;">
                        <span>${match.scoreA}</span> - <span>${match.scoreB}</span>
                    </div>
                    <div style="flex: 1; text-align: left; color: ${p2Winner ? 'var(--accent-color)' : 'var(--text-primary)'}; font-weight: ${p2Winner ? 'bold' : 'normal'}; font-size: ${p2Winner ? '1.1rem' : '1rem'};">${p2Name}</div>
                `;
            } else {
                html += `
                    <div style="flex: 1; text-align: right; color: var(--text-primary); font-weight: 600;">${p1Name}</div>
                    <div class="match-actions" style="width: 150px; text-align: center;">
                        <button class="lol-btn btn-record-match" data-rindex="${rIndex}" data-mindex="${mIndex}" style="padding: 0.4rem 1rem; font-size: 0.85rem; border-color: var(--accent-secondary); color: var(--accent-secondary);">Registrar</button>
                    </div>
                    <div class="match-editor" style="width: 250px; text-align: center; display: none; gap: 5px; justify-content: center; align-items: center;">
                        <select class="score-select score-a settings-select" style="width: 50px; padding: 0.2rem;"></select>
                        <span>-</span>
                        <select class="score-select score-b settings-select" style="width: 50px; padding: 0.2rem;"></select>
                        <button class="save-btn btn-save-match" data-rindex="${rIndex}" data-mindex="${mIndex}" style="padding: 0.2rem 0.6rem; font-size: 0.8rem; margin-left: 5px;">Guardar</button>
                    </div>
                    <div style="flex: 1; text-align: left; color: var(--text-primary); font-weight: 600;">${p2Name}</div>
                `;
            }

            html += `</div>`;
        });
        
        html += `</div>`;
        
        if (isActive) {
            html += `
                <div style="margin-top: 1.5rem; display: flex; justify-content: center;">
                    <button class="save-btn btn-advance-round" ${!allCompleted ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : 'style="background: #2ecc71; color: #111;"'}>Cerrar Jornada y Avanzar</button>
                </div>
            `;
        }

        html += `</div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
    
    // Unbind / Bind specific listeners for this view
    bindBracketListeners(t);
}

function bindBracketListeners(t) {
    // Selector de formato de ronda
    document.querySelectorAll('.round-format-selector').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const rIndex = parseInt(e.target.dataset.rindex);
            t.rounds[rIndex].format = e.target.value;
            await saveTournament(t);
            renderBracket(t, document.getElementById('tournament-content'));
        });
    });

    // Abrir editor de partido
    document.querySelectorAll('.btn-record-match').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const container = e.target.closest('.match-container');
            const rIndex = parseInt(e.target.dataset.rindex);
            const format = t.rounds[rIndex].format || 'bo3';
            
            container.querySelector('.match-actions').style.display = 'none';
            const editor = container.querySelector('.match-editor');
            editor.style.display = 'flex';
            
            const selA = editor.querySelector('.score-a');
            const selB = editor.querySelector('.score-b');
            
            let maxScore = 2;
            if (format === 'bo1') maxScore = 1;
            else if (format === 'bo5') maxScore = 3;
            
            let opts = '';
            for(let i=0; i<=maxScore; i++) opts += `<option value="${i}">${i}</option>`;
            
            selA.innerHTML = opts;
            selB.innerHTML = opts;
        });
    });

    // Guardar partido
    document.querySelectorAll('.btn-save-match').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const container = e.target.closest('.match-container');
            const rIndex = parseInt(e.target.dataset.rindex);
            const mIndex = parseInt(e.target.dataset.mindex);
            
            const scoreA = parseInt(container.querySelector('.score-a').value);
            const scoreB = parseInt(container.querySelector('.score-b').value);
            
            if (scoreA === scoreB) {
                return alert('Los empates no están permitidos. Un jugador debe tener más victorias.');
            }

            const match = t.rounds[rIndex].matches[mIndex];
            match.scoreA = scoreA;
            match.scoreB = scoreB;
            match.winnerId = scoreA > scoreB ? match.playerA : match.playerB;
            match.status = 'completed';
            
            await saveTournament(t);
            renderBracket(t, document.getElementById('tournament-content'));
        });
    });

    // Avanzar Ronda
    const btnAdvance = document.querySelector('.btn-advance-round');
    if (btnAdvance) {
        btnAdvance.addEventListener('click', async () => {
            if (btnAdvance.hasAttribute('disabled')) return;
            
            if (t.currentRoundIndex < t.rounds.length - 1) {
                t.currentRoundIndex++;
                captureDeckSnapshots(t, t.currentRoundIndex);
                await saveTournament(t);
                renderBracket(t, document.getElementById('tournament-content'));
            } else {
                alert('¡El torneo ha finalizado! Todas las jornadas han sido completadas.');
                t.status = 'completed';
                await saveTournament(t);
                currentTab = 'standings';
                document.querySelectorAll('.lol-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.lol-tab-btn[data-tab="standings"]').classList.add('active');
                renderCurrentTab();
            }
        });
    }
}


// ── Event Listeners & Logic ──────────────────────────────────────────────────

function bindDynamicListeners(t) {
    document.querySelectorAll('.btn-add-player').forEach(btn => {
        btn.addEventListener('click', () => openPlayerModal(null));
    });

    document.querySelectorAll('.btn-edit-deck').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.closest('.btn-edit-deck').dataset.playerId;
            openPlayerModal(playerId);
        });
    });

    document.querySelectorAll('.btn-delete-player').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const playerId = e.target.closest('.btn-delete-player').dataset.playerId;
            if (confirm("¿Seguro que quieres eliminar a este jugador?")) {
                t.players = t.players.filter(p => p.id !== playerId);
                await saveTournament(t);
                renderCurrentTab();
            }
        });
    });

    document.querySelectorAll('.btn-view-visual').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const playerId = e.target.closest('.btn-view-visual').dataset.playerId;
            openVisualizerModal(playerId, t);
        });
    });

    const genBtn = document.querySelector('.btn-generate-bracket');
    if (genBtn) {
        genBtn.addEventListener('click', async () => {
            if (t.players.length < 2) return alert('Se necesitan al menos 2 jugadores para generar un torneo.');
            
            t.rounds = generateRoundRobinPairings(t.players, t.isDoubleRound);
            t.currentRoundIndex = 0;
            t.status = 'active';
            captureDeckSnapshots(t, 0);
            await saveTournament(t);
            renderCurrentTab();
        });
    }

    const resetBtn = document.querySelector('.btn-reset-tourney');
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (confirm("¡ATENCIÓN!\n\nVas a reiniciar el torneo al estado de borrador.\nEsto borrará todas las jornadas, emparejamientos y estadísticas de victorias/derrotas actuales.\n\n¿Estás completamente seguro?")) {
                t.status = 'draft';
                t.rounds = [];
                t.matches = [];
                t.players.forEach(p => {
                    p.stats = { wins: 0, losses: 0 };
                });
                await saveTournament(t);
                renderCurrentTab();
            }
        });
    }

    const recordBtn = document.querySelector('.btn-record-match');
    if (recordBtn) recordBtn.addEventListener('click', () => {
        alert('Funcionalidad de Registrar Partida en desarrollo.');
    });
}

function captureDeckSnapshots(t, rIndex) {
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


let currentPlayerEditingId = null;

async function openPlayerModal(playerId) {
    const modal = document.getElementById('tourney-modal');
    const title = document.getElementById('tourney-modal-title');
    const nameInput = document.getElementById('tourney-player-name');
    const deckNameInput = document.getElementById('tourney-deck-name');
    const deckInput = document.getElementById('tourney-player-decklist');
    const colorBtns = document.querySelectorAll('#tourney-deck-colors .mana-btn');
    
    currentPlayerEditingId = playerId;
    
    const t = await getTournament(activeTournamentId);
    
    // Reset colors
    colorBtns.forEach(btn => {
        btn.classList.remove('selected-color');
        btn.style.borderColor = 'transparent';
        btn.onclick = () => {
            btn.classList.toggle('selected-color');
            btn.style.borderColor = btn.classList.contains('selected-color') ? 'var(--accent-color)' : 'transparent';
        };
    });
    
    // Si el torneo ya empezó, no dejar editar el nombre del jugador.
    if (t.status === 'active' && playerId) {
        nameInput.disabled = true;
        nameInput.style.opacity = '0.5';
    } else {
        nameInput.disabled = false;
        nameInput.style.opacity = '1';
    }

    if (playerId) {
        title.textContent = 'Editar Jugador / Mazo';
        const p = t.players.find(x => x.id === playerId);
        nameInput.value = p.name;
        deckNameInput.value = p.deckName || '';
        deckInput.value = p.decklist || '';
        if (p.deckColors) {
            colorBtns.forEach(btn => {
                if (p.deckColors.includes(btn.dataset.color)) {
                    btn.classList.add('selected-color');
                    btn.style.borderColor = 'var(--accent-color)';
                }
            });
        }
    } else {
        title.textContent = 'Añadir Nuevo Jugador';
        nameInput.value = '';
        deckNameInput.value = '';
        deckInput.value = '';
    }
    
    modal.style.display = 'flex';
    
    const saveBtn = document.getElementById('tourney-modal-save');
    saveBtn.onclick = async () => {
        const name = nameInput.value.trim();
        const deckName = deckNameInput.value.trim();
        const deck = deckInput.value.trim();
        const deckColors = Array.from(document.querySelectorAll('#tourney-deck-colors .selected-color')).map(b => b.dataset.color);
        
        if (!nameInput.disabled && !name) return alert('El nombre es obligatorio');
        
        const currentT = await getTournament(activeTournamentId);
        
        if (currentPlayerEditingId) {
            const p = currentT.players.find(x => x.id === currentPlayerEditingId);
            if (p) {
                if (!nameInput.disabled) p.name = name;
                p.deckName = deckName;
                p.deckColors = deckColors;
                p.decklist = deck;
            }
        } else {
            currentT.players.push({
                id: crypto.randomUUID(),
                name,
                deckName,
                deckColors,
                decklist: deck,
                stats: { wins: 0, losses: 0 }
            });
        }
        
        await saveTournament(currentT);
        modal.style.display = 'none';
        renderCurrentTab();
    };
}

function openVisualizerModal(playerId, tournament) {
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

/**
 * Generates Round Robin Pairings using the Circle Method.
 * @param {Array} players - Array of player objects.
 * @param {boolean} isDoubleRound - If true, generates home-and-away (duplicates matches swapping A and B).
 * @returns {Array} Array of rounds, where each round is an array of match objects {playerA, playerB}. Null means Bye.
 */
function generateRoundRobinPairings(players, isDoubleRound) {
    const ids = players.map(p => p.id);
    if (ids.length % 2 !== 0) {
        ids.push(null); // Add a 'Bye'
    }

    const rounds = [];
    const numRounds = ids.length - 1;
    const halfSize = ids.length / 2;

    const currentIds = [...ids];

    for (let round = 0; round < numRounds; round++) {
        const matches = [];
        for (let i = 0; i < halfSize; i++) {
            const a = currentIds[i];
            const b = currentIds[currentIds.length - 1 - i];
            // Para alternar local/visitante de forma aproximada:
            if (round % 2 === 1 && i === 0) {
                matches.push({ playerA: b, playerB: a });
            } else {
                matches.push({ playerA: a, playerB: b });
            }
        }
        rounds.push({ 
            format: 'bo3', 
            matches: matches.map(m => ({
                playerA: m.playerA,
                playerB: m.playerB,
                scoreA: 0,
                scoreB: 0,
                winnerId: null,
                status: (m.playerA && m.playerB) ? 'pending' : 'completed' // Byes auto-complete
            }))
        });

        // Rotar array (manteniendo el índice 0 fijo)
        currentIds.splice(1, 0, currentIds.pop());
    }

    if (isDoubleRound) {
        const secondHalf = [];
        rounds.forEach(r => {
            const swappedMatch = r.matches.map(m => ({ 
                playerA: m.playerB, 
                playerB: m.playerA,
                scoreA: 0,
                scoreB: 0,
                winnerId: null,
                status: (m.playerB && m.playerA) ? 'pending' : 'completed'
            }));
            secondHalf.push({ format: 'bo3', matches: swappedMatch });
        });
        return [...rounds, ...secondHalf];
    }

    return rounds;
}
