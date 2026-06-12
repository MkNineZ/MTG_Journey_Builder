import os
import re

file_path = 'js/screens/tournaments.js'

with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update bindDynamicListeners generation logic
code = code.replace(
    """    const genBtn = document.querySelector('.btn-generate-bracket');
    if (genBtn) {
        genBtn.addEventListener('click', async () => {
            if (t.players.length < 2) return alert('Se necesitan al menos 2 jugadores para generar un torneo.');
            
            t.rounds = generateRoundRobinPairings(t.players, t.isDoubleRound);
            t.status = 'active';
            await saveTournament(t);
            renderCurrentTab();
        });
    }""",
    """    const genBtn = document.querySelector('.btn-generate-bracket');
    if (genBtn) {
        genBtn.addEventListener('click', async () => {
            if (t.players.length < 2) return alert('Se necesitan al menos 2 jugadores para generar un torneo.');
            
            t.rounds = generateRoundRobinPairings(t.players, t.isDoubleRound);
            t.currentRoundIndex = 0;
            t.status = 'active';
            await saveTournament(t);
            renderCurrentTab();
        });
    }"""
)

# 2. Update generateRoundRobinPairings
code = code.replace(
    """        rounds.push(matches);""",
    """        rounds.push({ 
            format: 'bo3', 
            matches: matches.map(m => ({
                playerA: m.playerA,
                playerB: m.playerB,
                scoreA: 0,
                scoreB: 0,
                winnerId: null,
                status: (m.playerA && m.playerB) ? 'pending' : 'completed' // Byes auto-complete
            }))
        });"""
)

code = code.replace(
    """    if (isDoubleRound) {
        const secondHalf = [];
        rounds.forEach(r => {
            const swappedMatch = r.map(m => ({ playerA: m.playerB, playerB: m.playerA }));
            secondHalf.push(swappedMatch);
        });
        return [...rounds, ...secondHalf];
    }""",
    """    if (isDoubleRound) {
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
    }"""
)

# 3. Completely replace renderStandings
old_renderStandings = re.search(r'function renderStandings\(t, container\) \{.*?bindDynamicListeners\(t\);\n\}', code, re.DOTALL)
if old_renderStandings:
    new_renderStandings = """function renderStandings(t, container) {
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
}"""
    code = code.replace(old_renderStandings.group(0), new_renderStandings)


# 4. Completely replace renderBracket
old_renderBracket = re.search(r'function renderBracket\(t, container\) \{.*?container\.innerHTML = html;\n\}', code, re.DOTALL)
if old_renderBracket:
    new_renderBracket = """function renderBracket(t, container) {
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
"""
    code = code.replace(old_renderBracket.group(0), new_renderBracket)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patch applied successfully.")
