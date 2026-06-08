import { getAllTournaments, getTournament, saveTournament, deleteTournament } from '../utils/db.js';
import { parseDecklistText } from '../components/searchEngine.js';
import { state } from '../utils/state.js';
import { getCardImageUrl, getCardImageUrlEn } from '../utils/api.js';

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

        html += `
            <tr class="lol-row">
                <td style="text-align: center; font-family: var(--font-heading); font-size: 1.2rem; color: ${color};">${index + 1}</td>
                <td style="font-weight: 600;">${p.name}</td>
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
        t.players.forEach(p => {
            html += `
                <div class="lol-card">
                    <div class="lol-card-header">
                        <strong style="font-size: 1.2rem; color: var(--text-primary);">${p.name}</strong>
                        <span style="color: var(--accent-secondary); font-family: var(--font-heading);">${p.stats?.wins || 0}V - ${p.stats?.losses || 0}D</span>
                    </div>
                    <div style="flex-grow: 1;">
                        <textarea readonly class="settings-select" style="width: 100%; height: 120px; resize: none; font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.3); color: var(--text-secondary); border: none;">${p.decklist || 'Sin lista registrada'}</textarea>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 0.5rem;">
                        <button class="lol-btn btn-view-visual" data-player-id="${p.id}" style="flex: 1; border-color: var(--text-secondary); color: var(--text-secondary);">
                            <i class="fas fa-eye"></i> Visual
                        </button>
                        <button class="lol-btn btn-edit-deck" data-player-id="${p.id}" style="flex: 1;">
                            <i class="fas fa-edit"></i> Editar
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
    const deckInput = document.getElementById('tourney-player-decklist');
    
    currentPlayerEditingId = playerId;
    
    const t = await getTournament(activeTournamentId);
    
    // Si el torneo ya empezó, no dejar editar el nombre. Solo el mazo.
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
        deckInput.value = p.decklist || '';
    } else {
        title.textContent = 'Añadir Nuevo Jugador';
        nameInput.value = '';
        deckInput.value = '';
    }
    
    modal.style.display = 'flex';
    
    const saveBtn = document.getElementById('tourney-modal-save');
    saveBtn.onclick = async () => {
        const name = nameInput.value.trim();
        const deck = deckInput.value.trim();
        if (!nameInput.disabled && !name) return alert('El nombre es obligatorio');
        
        const currentT = await getTournament(activeTournamentId);
        
        if (currentPlayerEditingId) {
            const p = currentT.players.find(x => x.id === currentPlayerEditingId);
            if (p) {
                if (!nameInput.disabled) p.name = name;
                p.decklist = deck;
            }
        } else {
            currentT.players.push({
                id: crypto.randomUUID(),
                name,
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
    title.textContent = `Mazo de ${player.name}`;

    const grid = document.getElementById('visualizer-grid');
    grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">Cargando mazo...</p>';
    document.getElementById('visualizer-modal').style.display = 'flex';

    // Parse decklist
    const allAvailableCards = (state.activeSetsData || []).flatMap(s => (s.cards || []).map(c => ({...c, setCode: s.code})));
    const { parsed, errors } = parseDecklistText(player.decklist, allAvailableCards);

    if (parsed.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">La lista está vacía o no contiene cartas válidas del pool actual.</p>';
        return;
    }

    let html = '';
    if (errors > 0) {
        html += `<div style="grid-column: 1 / -1; padding: 10px; background: rgba(231, 76, 60, 0.2); border: 1px solid #e74c3c; border-radius: 8px; color: #fff; margin-bottom: 1rem;">
            <i class="fas fa-exclamation-triangle"></i> Hubo ${errors} carta(s) no reconocidas en el texto.
        </div>`;
    }

    parsed.forEach(card => {
        const imgUrl = getCardImageUrl(card, state.language || 'en');
        const fallbackUrl = getCardImageUrlEn(card);
        
        html += `
            <div class="deck-inv-card" style="position: relative;">
                <img src="${imgUrl}" alt="${card.name}" loading="lazy" class="deck-inv-img" style="width: 100%; border-radius: 4.75% / 3.5%; display: block;" onerror="this.onerror=null;this.src='${fallbackUrl}'">
                <div class="card-quantity-badge" style="position: absolute; top: -5px; right: -5px; background: rgba(0,0,0,0.8); border: 1px solid var(--accent-color); color: #fff; padding: 2px 6px; border-radius: 10px; font-size: 0.8rem; font-weight: bold; z-index: 10;">
                    x${card.count}
                </div>
            </div>
        `;
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
