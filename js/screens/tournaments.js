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
                <h2 id="visualizer-title" style="color: var(--accent-color); margin-bottom: 1rem;">Mazo de Jugador</h2>
                <div id="visualizer-stats" style="margin-bottom: 1rem; display: flex; gap: 2rem; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem;"></div>
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

    const sorted = [...t.players].sort((a, b) => {
        const aTotal = (a.stats?.wins || 0) + (a.stats?.losses || 0);
        const bTotal = (b.stats?.wins || 0) + (b.stats?.losses || 0);
        const aWr = aTotal === 0 ? 0 : (a.stats.wins / aTotal);
        const bWr = bTotal === 0 ? 0 : (b.stats.wins / bTotal);

        if (bWr !== aWr) return bWr - aWr;
        return (b.stats?.wins || 0) - (a.stats?.wins || 0);
    });

    let html = `
        <table class="lol-table">
            <thead>
                <tr>
                    <th style="width: 80px; text-align: center;">Pos</th>
                    <th>Jugador</th>
                    <th>Mazo</th>
                    <th style="text-align: center;">V - D</th>
                    <th style="text-align: right;">Win Rate</th>
                </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach((p, index) => {
        const wins = p.stats?.wins || 0;
        const losses = p.stats?.losses || 0;
        const total = wins + losses;
        const wr = total === 0 ? '0%' : Math.round((wins / total) * 100) + '%';
        const color = index === 0 ? 'var(--accent-color)' : 'var(--text-primary)';

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
                <td style="text-align: center; color: var(--text-secondary);">${wins} V - ${losses} D</td>
                <td style="text-align: right; color: var(--highlight-text);">${wr}</td>
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
                <button class="lol-btn btn-record-match"><i class="fas fa-gamepad"></i> Registrar Partida</button>
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

    let html = `<div style="display: flex; flex-direction: column; gap: 2rem;">`;
    
    t.rounds.forEach((round, rIndex) => {
        html += `<div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem;">
            <h3 style="color: var(--accent-secondary); margin-top: 0; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">Jornada ${rIndex + 1}</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;
        
        round.forEach(match => {
            const p1 = match.playerA ? t.players.find(p => p.id === match.playerA)?.name : 'Descanso (Bye)';
            const p2 = match.playerB ? t.players.find(p => p.id === match.playerB)?.name : 'Descanso (Bye)';
            
            html += `
                <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 0.8rem; border-radius: 4px;">
                    <div style="flex: 1; text-align: right; color: ${match.playerA ? 'var(--text-primary)' : 'var(--text-secondary)'}; font-weight: 600;">${p1}</div>
                    <div style="width: 50px; text-align: center; color: var(--accent-color); font-family: var(--font-heading);">VS</div>
                    <div style="flex: 1; text-align: left; color: ${match.playerB ? 'var(--text-primary)' : 'var(--text-secondary)'}; font-weight: 600;">${p2}</div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
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
            t.status = 'active';
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

    const title = document.getElementById('visualizer-title');
    const colorsHtml = (player.deckColors || []).map(c => 
        `<img src="https://svgs.scryfall.io/card-symbols/${c}.svg" style="width: 24px; height: 24px;" title="${c}">`
    ).join('');
    
    title.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;">${player.deckName || 'Mazo de ' + player.name} <div style="display: flex; gap: 5px; margin-left: 10px;">${colorsHtml}</div></div>`;

    const grid = document.getElementById('visualizer-grid');
    grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">Cargando mazo...</p>';
    
    const statsContainer = document.getElementById('visualizer-stats');
    statsContainer.innerHTML = '';
    
    document.getElementById('visualizer-modal').style.display = 'flex';

    // Parse decklist
    const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));
    const { parsed, unknown, errors } = parseDecklistText(player.decklist, allAvailableCards);

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
                <div style="position: relative; aspect-ratio: 63/88; background: transparent; border-radius: 4.75% / 3.5%; cursor: pointer;"
                     onmouseenter="if(!window.tourneyHoverImg){window.tourneyHoverImg=document.createElement('img');window.tourneyHoverImg.className='card-hover-preview';window.tourneyHoverImg.style.zIndex='11000';document.body.appendChild(window.tourneyHoverImg);} window.tourneyHoverImg.src='${imgUrl}'; window.tourneyHoverImg.onerror=function(){if(this.src!=='${fallbackUrl}')this.src='${fallbackUrl}'}; window.tourneyHoverImg.style.display='block'; const rect=this.getBoundingClientRect(); const zoom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-hover-zoom')||'1.4'); const tw=rect.width*zoom; const th=rect.height*zoom; window.tourneyHoverImg.style.left=(rect.left+(rect.width/2)-(tw/2))+'px'; window.tourneyHoverImg.style.top=(rect.top+(rect.height/2)-(th/2))+'px'; requestAnimationFrame(()=>window.tourneyHoverImg.classList.add('visible')); this.children[0].style.opacity='0';"
                     onmouseleave="if(window.tourneyHoverImg){window.tourneyHoverImg.classList.remove('visible'); setTimeout(()=>{if(!window.tourneyHoverImg.classList.contains('visible'))window.tourneyHoverImg.style.display='none';},150);} this.children[0].style.opacity='1';">
                    <img src="${imgUrl}" alt="${card.name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4.75% / 3.5%; display: block; transition: opacity 0.15s ease;" onerror="this.onerror=null;this.src='${fallbackUrl}'">
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
        rounds.push(matches);

        // Rotar array (manteniendo el índice 0 fijo)
        currentIds.splice(1, 0, currentIds.pop());
    }

    if (isDoubleRound) {
        const secondHalf = [];
        rounds.forEach(r => {
            const swappedMatch = r.map(m => ({ playerA: m.playerB, playerB: m.playerA }));
            secondHalf.push(swappedMatch);
        });
        return [...rounds, ...secondHalf];
    }

    return rounds;
}
