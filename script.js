// ========================================
// NBA历史球星模拟对战 - 游戏逻辑
// 规则：两边轮流抽队伍，从中选人
// ========================================

// API配置
const API_BASE_URL = 'http://localhost:5000';

// 游戏状态
const gameState = {
    phase: 'selection', // 'selection' | 'battle'
    currentPlayer: 1, // 1 或 2
    round: 1, // 当前轮次 (1-5)
    totalRounds: 5, // 总共5轮
    
    // 选人顺序: 1-2-1-2-1-2-1-2-1-2 (简单轮流)
    turnOrder: [1, 2, 1, 2, 1, 2, 1, 2, 1, 2],
    currentTurn: 0,
    
    // 当前阶段
    selectionPhase: 'draw', // 'draw' = 抽队伍, 'pick' = 选球员
    
    // 当前抽中的队伍
    drawnTeam: null,
    
    // 玩家名称（可自定义）
    playerNames: {
        1: 'A组',
        2: 'B组'
    },
    
    // 玩家数据
    players: {
        1: {
            budget: 11,
            roster: {
                PG: null,
                SG: null,
                SF: null,
                PF: null,
                C: null
            },
            usedTeams: [] // 已使用的队伍
        },
        2: {
            budget: 11,
            roster: {
                PG: null,
                SG: null,
                SF: null,
                PF: null,
                C: null
            },
            usedTeams: []
        }
    },
    
    // 已选择的球员ID
    selectedPlayerIds: new Set(),
    
    // 当前选中待分配位置的球员
    pendingPlayer: null,
    
    // 对战数据
    battle: {
        team1Wins: 0,
        team2Wins: 0,
        gamesPlayed: 0
    }
};

// 位置名称（伪装为岗位名称，带编号）
const positionNames = {
    PG: '1项目',
    SG: '2技术',
    SF: '3运营',
    PF: '4市场',
    C: '5财务'
};

// 获取玩家名称
function getPlayerName(playerNum) {
    return gameState.playerNames[playerNum] || `玩家${playerNum}`;
}

// 更新玩家名称
function updatePlayerName(playerNum, name) {
    const trimmedName = name.trim();
    gameState.playerNames[playerNum] = trimmedName || `玩家${playerNum}`;
    updateUI();
}

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
});

function initializeGame() {
    renderTeamGrid();
    updateUI();
}

// ========================================
// 渲染函数
// ========================================

// 渲染队伍选择网格
function renderTeamGrid() {
    const grid = document.getElementById('teams-grid');
    if (!grid) return;
    
    // 获取所有已使用的队伍
    const usedTeams = new Set([
        ...gameState.players[1].usedTeams,
        ...gameState.players[2].usedTeams
    ]);
    
    grid.innerHTML = NBA_TEAMS.map((team, index) => {
        const isUsed = usedTeams.has(team.id);
        const players = getPlayersByTeam(team.id);
        const deptCode = getDeptCode(team.id, index);
        
        return `
            <div class="team-card ${isUsed ? 'used' : ''}" 
                 onclick="${isUsed ? '' : `drawTeam('${team.id}')`}"
                 data-team-id="${team.id}">
                <div class="team-logo dept-code">${deptCode}</div>
                <div class="team-name">${team.name}</div>
                <div class="team-players-count">${players.length}名人员</div>
                ${isUsed ? '<div class="used-badge">已选</div>' : ''}
            </div>
        `;
    }).join('');
}

// 获取部门代号（办公风格）
function getDeptCode(teamId, index) {
    const deptCodes = {
        'ATL': 'D01', 'BOS': 'D02', 'BKN': 'D03', 'CHA': 'D04', 'CHI': 'D05',
        'CLE': 'D06', 'DAL': 'D07', 'DEN': 'D08', 'DET': 'D09', 'GSW': 'D10',
        'HOU': 'D11', 'IND': 'D12', 'LAC': 'D13', 'LAL': 'D14', 'MEM': 'D15',
        'MIA': 'D16', 'MIL': 'D17', 'MIN': 'D18', 'NOP': 'D19', 'NYK': 'D20',
        'OKC': 'D21', 'ORL': 'D22', 'PHI': 'D23', 'PHX': 'D24', 'POR': 'D25',
        'SAC': 'D26', 'SAS': 'D27', 'TOR': 'D28', 'UTA': 'D29', 'WAS': 'D30'
    };
    return deptCodes[teamId] || `D${String(index + 1).padStart(2, '0')}`;
}

// 渲染队伍球员列表
function renderTeamPlayers(teamId) {
    const container = document.getElementById('team-players-list');
    if (!container) return;
    
    const team = getTeamById(teamId);
    const players = getPlayersByTeam(teamId);
    const currentBudget = gameState.players[gameState.currentPlayer].budget;
    const deptCode = getDeptCode(teamId, 0);
    
    document.getElementById('drawn-team-name').textContent = `[${deptCode}] ${team.name}`;
    
    container.innerHTML = players.map(player => {
        const isSelected = gameState.selectedPlayerIds.has(player.id);
        const isUnaffordable = player.cost > currentBudget;
        
        return `
            <div class="player-card ${isSelected ? 'selected' : ''} ${isUnaffordable && !isSelected ? 'unaffordable' : ''}"
                 onclick="${isSelected || isUnaffordable ? '' : `selectPlayer(${player.id})`}"
                 data-player-id="${player.id}">
                <div class="player-card-header">
                    <div class="cost-badge cost-${player.cost}">${player.cost}</div>
                    <div class="player-info">
                        <h4>${player.name}</h4>
                        <div class="name-en">${player.nameEn}</div>
                        <div class="peak-season">巅峰: ${player.peakSeason}</div>
                    </div>
                </div>
                <div class="player-positions">
                    ${player.positions.map(pos => `<span class="position-tag">${positionNames[pos]}</span>`).join('')}
                </div>
                <div class="player-stats">
                    <span><span class="icon">🏆</span> ${player.championships}冠</span>
                    <span><span class="icon">⭐</span> ${player.allStar}次全明星</span>
                    ${player.mvp > 0 ? `<span><span class="icon">🏅</span> ${player.mvp}MVP</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// 更新UI
function updateUI() {
    // 更新当前玩家
    const currentPlayer = gameState.turnOrder[gameState.currentTurn];
    gameState.currentPlayer = currentPlayer;
    
    // 更新回合显示
    document.getElementById('current-player').textContent = getPlayerName(currentPlayer);
    document.getElementById('current-player').className = `turn-player player${currentPlayer}`;
    document.getElementById('round-number').textContent = Math.floor(gameState.currentTurn / 2) + 1;
    
    // 更新阶段提示
    const phaseText = gameState.selectionPhase === 'draw' ? '选择部门' : '分配人员';
    document.getElementById('phase-text').textContent = phaseText;
    
    // 更新预算显示
    document.getElementById('player1-budget').textContent = gameState.players[1].budget;
    document.getElementById('player2-budget').textContent = gameState.players[2].budget;
    
    // 更新玩家区域高亮
    document.getElementById('player1-section').classList.toggle('active', currentPlayer === 1);
    document.getElementById('player2-section').classList.toggle('active', currentPlayer === 2);
    
    // 更新阵容显示
    updateRosterDisplay(1);
    updateRosterDisplay(2);
    
    // 更新选择区域显示
    updateSelectionArea();
    
    // 检查游戏是否结束
    if (gameState.currentTurn >= 10) {
        startBattlePhase();
    }
}

// 更新选择区域
function updateSelectionArea() {
    const teamSelectArea = document.getElementById('team-select-area');
    const playerSelectArea = document.getElementById('player-select-area');
    
    if (gameState.selectionPhase === 'draw') {
        teamSelectArea.classList.remove('hidden');
        playerSelectArea.classList.add('hidden');
        renderTeamGrid();
    } else {
        teamSelectArea.classList.add('hidden');
        playerSelectArea.classList.remove('hidden');
    }
}

// 更新阵容显示
function updateRosterDisplay(playerNum) {
    const roster = gameState.players[playerNum].roster;
    const container = document.getElementById(`player${playerNum}-roster`);
    
    Object.keys(roster).forEach(position => {
        const slot = container.querySelector(`[data-position="${position}"]`);
        const player = roster[position];
        
        if (player) {
            slot.classList.add('filled');
            slot.innerHTML = `
                <span class="position-label">${positionNames[position]}</span>
                <span class="player-name">${player.name}</span>
                <span class="cost-badge cost-${player.cost}" style="width:30px;height:30px;font-size:0.9rem;">${player.cost}</span>
            `;
        } else {
            slot.classList.remove('filled');
            slot.innerHTML = `
                <span class="position-label">${positionNames[position]}</span>
                <span class="player-name empty">空缺</span>
            `;
        }
    });
    
    // 更新已使用队伍列表
    const usedTeamsContainer = document.getElementById(`player${playerNum}-used-teams`);
    if (usedTeamsContainer) {
        const usedTeams = gameState.players[playerNum].usedTeams;
        usedTeamsContainer.innerHTML = usedTeams.map((teamId, idx) => {
            const deptCode = getDeptCode(teamId, idx);
            return `<span class="used-team-badge">${deptCode}</span>`;
        }).join('');
    }
}

// ========================================
// 抽队逻辑
// ========================================

// 抽取队伍
function drawTeam(teamId) {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'draw') return;
    
    const team = getTeamById(teamId);
    if (!team) return;
    
    // 检查队伍是否已被使用
    const usedTeams = new Set([
        ...gameState.players[1].usedTeams,
        ...gameState.players[2].usedTeams
    ]);
    
    if (usedTeams.has(teamId)) {
        showToast('该部门已被分配');
        return;
    }
    
    // 记录抽中的队伍
    gameState.drawnTeam = teamId;
    gameState.players[gameState.currentPlayer].usedTeams.push(teamId);
    
    // 切换到选球员阶段
    gameState.selectionPhase = 'pick';
    
    // 渲染队伍球员
    renderTeamPlayers(teamId);
    
    updateUI();
    showToast(`${getPlayerName(gameState.currentPlayer)} 选择了 ${team.name} 部门`);
}

// 随机抽取队伍
function randomDrawTeam() {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'draw') return;
    
    // 获取可用队伍
    const usedTeams = new Set([
        ...gameState.players[1].usedTeams,
        ...gameState.players[2].usedTeams
    ]);
    
    const availableTeams = NBA_TEAMS.filter(t => !usedTeams.has(t.id));
    
    if (availableTeams.length === 0) {
        showToast('没有可用的部门了');
        return;
    }
    
    // 随机选择
    const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
    
    // 动画效果
    animateRandomDraw(randomTeam.id);
}

// 随机抽取动画
function animateRandomDraw(finalTeamId) {
    const teamCards = document.querySelectorAll('.team-card:not(.used)');
    let count = 0;
    const maxCount = 15;
    
    const interval = setInterval(() => {
        // 移除之前的高亮
        teamCards.forEach(card => card.classList.remove('highlight'));
        
        // 随机高亮一个
        const randomIndex = Math.floor(Math.random() * teamCards.length);
        teamCards[randomIndex].classList.add('highlight');
        
        count++;
        
        if (count >= maxCount) {
            clearInterval(interval);
            // 最终选中
            setTimeout(() => {
                teamCards.forEach(card => card.classList.remove('highlight'));
                drawTeam(finalTeamId);
            }, 200);
        }
    }, 100);
}

// ========================================
// 选人逻辑
// ========================================

// 选择球员
function selectPlayer(playerId) {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'pick') return;
    
    const player = PLAYERS.find(p => p.id === playerId);
    if (!player) return;
    
    // 检查是否已被选择
    if (gameState.selectedPlayerIds.has(playerId)) {
        showToast('该员工已被分配');
        return;
    }
    
    // 检查预算
    const currentBudget = gameState.players[gameState.currentPlayer].budget;
    if (player.cost > currentBudget) {
        showToast('预算不足，请选择其他人员');
        return;
    }
    
    // 保存待选球员，显示位置选择器
    gameState.pendingPlayer = player;
    showPositionSelector(player);
}

// 添加自定义1分球员
function addCustomPlayer() {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'pick') {
        showToast('当前不是选人阶段！');
        return;
    }
    
    const seasonInput = document.getElementById('custom-season');
    const nameInput = document.getElementById('custom-name');
    const nameEnInput = document.getElementById('custom-name-en');
    const scoreInput = document.getElementById('custom-score');
    const positionSelect = document.getElementById('custom-position');
    
    const season = seasonInput.value.trim();
    const name = nameInput.value.trim();
    const nameEn = nameEnInput.value.trim() || name; // 如果没有英文名，使用中文名
    const score = parseInt(scoreInput.value);
    const position = positionSelect.value;
    
    // 验证输入
    if (!season) {
        showToast('请输入入职年份');
        seasonInput.focus();
        return;
    }
    
    if (!name) {
        showToast('请输入员工姓名');
        nameInput.focus();
        return;
    }
    
    if (!position) {
        showToast('请选择岗位');
        positionSelect.focus();
        return;
    }
    
    // 检查位置是否已占用
    const roster = gameState.players[gameState.currentPlayer].roster;
    if (roster[position] !== null) {
        showToast('该岗位已有人员');
        return;
    }
    
    // 检查预算
    const cost = score;
    const currentBudget = gameState.players[gameState.currentPlayer].budget;
    if (cost > currentBudget) {
        showToast('预算不足');
        return;
    }
    
    // 创建自定义球员对象（格式与其他球员一致）
    const customPlayer = {
        id: `custom_${Date.now()}`, // 唯一ID
        name: name,
        nameEn: nameEn,
        cost: cost,
        positions: [position],
        peakTeam: gameState.drawnTeam, // 当前抽中的队伍
        peakSeason: season,
        championships: 0,
        allStar: 0,
        mvp: 0,
        fmvp: 0,
        isCustom: true // 标记为自定义球员
    };
    
    // 分配球员
    const currentPlayerNum = gameState.currentPlayer;
    roster[position] = customPlayer;
    gameState.players[currentPlayerNum].budget -= cost;
    gameState.selectedPlayerIds.add(customPlayer.id);
    
    // 清除输入框
    seasonInput.value = '';
    nameInput.value = '';
    nameEnInput.value = '';
    scoreInput.value = '1';
    positionSelect.value = '';
    
    // 清除状态
    gameState.drawnTeam = null;
    
    // 进入下一轮（与assignPosition保持一致）
    gameState.currentTurn++;
    gameState.selectionPhase = 'draw';
    
    // 更新UI
    updateUI();
    
    showToast(`${getPlayerName(currentPlayerNum)} 添加了外包人员: ${name}`);
}

// 显示位置选择器
function showPositionSelector(player) {
    const selector = document.getElementById('position-selector');
    const playerNameEl = document.getElementById('selected-player-name');
    const buttonsContainer = document.getElementById('position-buttons');
    
    playerNameEl.textContent = `为 ${player.name} 分配岗位`;
    
    const roster = gameState.players[gameState.currentPlayer].roster;
    
    buttonsContainer.innerHTML = player.positions.map(pos => {
        const isOccupied = roster[pos] !== null;
        return `
            <button class="pos-btn" 
                    onclick="assignPosition('${pos}')" 
                    ${isOccupied ? 'disabled' : ''}>
                ${positionNames[pos]}
                ${isOccupied ? '(已占用)' : ''}
            </button>
        `;
    }).join('');
    
    selector.classList.remove('hidden');
}

// 分配位置
function assignPosition(position) {
    const player = gameState.pendingPlayer;
    if (!player) return;
    
    const currentPlayerNum = gameState.currentPlayer;
    const roster = gameState.players[currentPlayerNum].roster;
    
    // 检查位置是否已占用
    if (roster[position] !== null) {
        showToast('该岗位已有人员');
        return;
    }
    
    // 分配球员
    roster[position] = player;
    gameState.players[currentPlayerNum].budget -= player.cost;
    gameState.selectedPlayerIds.add(player.id);
    
    // 清除待选球员
    gameState.pendingPlayer = null;
    gameState.drawnTeam = null;
    
    // 隐藏位置选择器
    document.getElementById('position-selector').classList.add('hidden');
    
    // 进入下一轮
    gameState.currentTurn++;
    gameState.selectionPhase = 'draw';
    
    // 更新UI
    updateUI();
    
    showToast(`${getPlayerName(currentPlayerNum)} 分配 ${player.name} 至${positionNames[position]}岗位`);
}

// 取消选择
function cancelSelection() {
    gameState.pendingPlayer = null;
    document.getElementById('position-selector').classList.add('hidden');
}

// 重新抽取队伍
function redrawTeam() {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'pick') return;
    
    // 移除当前已抽取的队伍
    const currentTeamId = gameState.drawnTeam;
    if (currentTeamId) {
        const usedTeams = gameState.players[gameState.currentPlayer].usedTeams;
        const index = usedTeams.indexOf(currentTeamId);
        if (index > -1) {
            usedTeams.splice(index, 1);
        }
    }
    
    // 清除状态，返回抽取阶段
    gameState.drawnTeam = null;
    gameState.selectionPhase = 'draw';
    
    updateUI();
    showToast(`${getPlayerName(gameState.currentPlayer)} 重新选择部门`);
}

// 跳过选人（如果队伍没有合适的球员）
function skipPick() {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'pick') return;
    
    showToast(`${getPlayerName(gameState.currentPlayer)} 跳过本轮分配`);
    
    gameState.drawnTeam = null;
    gameState.currentTurn++;
    gameState.selectionPhase = 'draw';
    
    updateUI();
}

// ========================================
// 对战模拟 (DeepSeek AI 驱动)
// ========================================

// 开始对战阶段
function startBattlePhase() {
    gameState.phase = 'battle';
    
    // 更新阶段指示器
    document.getElementById('phase-select').classList.remove('active');
    document.getElementById('phase-battle').classList.add('active');
    
    // 隐藏选人区域，显示对战区域
    document.getElementById('selection-area').classList.add('hidden');
    document.getElementById('turn-indicator').classList.add('hidden');
    document.getElementById('battle-area').classList.remove('hidden');
    
    // 更新对战界面的玩家名称
    document.getElementById('battle-player1-name').textContent = getPlayerName(1);
    document.getElementById('battle-player2-name').textContent = getPlayerName(2);
    document.getElementById('battle-roster1-title').textContent = `${getPlayerName(1)}阵容`;
    document.getElementById('battle-roster2-title').textContent = `${getPlayerName(2)}阵容`;
    
    // 渲染对战阵容
    renderBattleRosters();
    
    // 重置对战数据
    gameState.battle = {
        team1Wins: 0,
        team2Wins: 0,
        gamesPlayed: 0
    };
    
    updateBattleScore();
}

// 渲染对战阵容
function renderBattleRosters() {
    [1, 2].forEach(playerNum => {
        const roster = gameState.players[playerNum].roster;
        const container = document.getElementById(`battle-roster${playerNum}`);
        let totalCost = 0;
        
        container.innerHTML = Object.entries(roster).map(([pos, player]) => {
            if (player) {
                totalCost += player.cost;
                
                // 获取赛季和队伍信息
                const season = player.peakSeason || '未知';
                let teamName = '未知';
                if (player.peakTeam) {
                    const team = getTeamById(player.peakTeam);
                    teamName = team ? team.name : '未知';
                } else if (player.team) {
                    const team = getTeamById(player.team);
                    teamName = team ? team.name : '未知';
                }
                
                return `
                    <div class="team-player">
                        <span class="position">${positionNames[pos]}</span>
                        <span class="name">${player.name}</span>
                        <span class="season-team">${season} · ${teamName}</span>
                        <span class="cost">${player.cost}分</span>
                    </div>
                `;
            }
            return '';
        }).join('');
        
        document.getElementById(`team${playerNum}-total`).textContent = totalCost + '分';
    });
}

// 更新对战比分
function updateBattleScore() {
    document.getElementById('team1-wins').textContent = gameState.battle.team1Wins;
    document.getElementById('team2-wins').textContent = gameState.battle.team2Wins;
}

// 使用 AI 模拟整个系列赛
async function simulateSeries() {
    const simulateBtn = document.getElementById('simulate-btn');
    simulateBtn.disabled = true;
    simulateBtn.textContent = '数据分析中...';
    
    const logContent = document.getElementById('log-content');
    logContent.innerHTML = '';
    
    // 重置比分
    gameState.battle = {
        team1Wins: 0,
        team2Wins: 0,
        gamesPlayed: 0
    };
    updateBattleScore();
    
    // 准备队伍数据
    const team1Data = gameState.players[1].roster;
    const team2Data = gameState.players[2].roster;
    
    // 显示分析中提示
    const thinkingEntry = document.createElement('div');
    thinkingEntry.className = 'log-entry ai-thinking';
    thinkingEntry.innerHTML = `
        <div class="log-game-num">正在进行绩效评估分析...</div>
        <div class="thinking-content" id="thinking-content">
            <div class="thinking-spinner"></div>
            <div class="thinking-text" id="thinking-text">AI正在分析双方团队配置...</div>
        </div>
    `;
    logContent.appendChild(thinkingEntry);
    
    try {
        // 调用整个系列赛API
        const response = await fetch(`${API_BASE_URL}/api/simulate-series`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                team1: team1Data,
                team2: team2Data,
                playerNames: gameState.playerNames
            })
        });
        
        if (!response.ok) {
            throw new Error(`API请求失败 (${response.status})`);
        }
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let reasoningText = '';
        let resultData = null;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.type === 'reasoning') {
                            reasoningText += parsed.content;
                            const thinkingTextEl = document.getElementById('thinking-text');
                            if (thinkingTextEl) {
                                thinkingTextEl.innerHTML = formatThinking(reasoningText);
                            }
                        } else if (parsed.type === 'result') {
                            resultData = parsed.data;
                        } else if (parsed.type === 'error') {
                            throw new Error(parsed.error);
                        }
                    } catch (e) {
                        console.warn('Parse error:', e.message);
                    }
                }
            }
        }
        
        // 移除思考区域
        thinkingEntry.remove();
        
        // 显示结果
        if (resultData) {
            displaySeriesResult(resultData, logContent);
        } else {
            throw new Error('未收到有效结果');
        }
        
    } catch (error) {
        console.error('AI模拟失败:', error);
        thinkingEntry.remove();
        showToast('数据分析失败: ' + error.message);
        // 使用本地模拟
        await simulateSeriesLocal();
    }
    
    simulateBtn.disabled = false;
    simulateBtn.textContent = '重新评估';
}

// 显示系列赛结果
function displaySeriesResult(result, logContent) {
    // 显示系列赛开始
    const startEntry = document.createElement('div');
    startEntry.className = 'log-entry series-start';
    startEntry.innerHTML = `
        <div class="log-game-num">季度绩效对比评估结果</div>
        <div class="series-intro">BO7评估完成，最终比分 ${result.finalScore?.team1Wins || 0} - ${result.finalScore?.team2Wins || 0}</div>
    `;
    logContent.appendChild(startEntry);
    
    // 显示每场比赛结果
    if (result.games && result.games.length > 0) {
        result.games.forEach(game => {
            const winner = game.winner;
            if (winner === 1) {
                gameState.battle.team1Wins++;
            } else {
                gameState.battle.team2Wins++;
            }
            
            const gameEntry = document.createElement('div');
            gameEntry.className = `log-entry game-entry player${winner}-win`;
            gameEntry.innerHTML = `
                <div class="game-header">
                    <div class="log-game-num">第${game.gameNumber}轮评估</div>
                    <div class="game-final-score">
                        <span class="team-label">${getPlayerName(1)}</span>
                        <span class="score ${winner === 1 ? 'winner' : ''}">${game.score?.team1 || 0}</span>
                        <span class="vs">-</span>
                        <span class="score ${winner === 2 ? 'winner' : ''}">${game.score?.team2 || 0}</span>
                        <span class="team-label">${getPlayerName(2)}</span>
                    </div>
                </div>
                
                ${game.team1Stats && game.team1Stats.length > 0 ? `
                <div class="team-stats-section">
                    <div class="stats-title">${getPlayerName(1)} 数据统计</div>
                    ${renderSimplePlayerStats(game.team1Stats)}
                </div>` : ''}
                
                ${game.team2Stats && game.team2Stats.length > 0 ? `
                <div class="team-stats-section">
                    <div class="stats-title">${getPlayerName(2)} 数据统计</div>
                    ${renderSimplePlayerStats(game.team2Stats)}
                </div>` : ''}
            `;
            logContent.appendChild(gameEntry);
        });
    }
    
    updateBattleScore();
    
    // 显示FMVP
    if (result.fmvp) {
        const fmvpEntry = document.createElement('div');
        fmvpEntry.className = 'log-entry fmvp-award';
        fmvpEntry.innerHTML = `
            <div class="log-game-num">★ 季度最佳员工</div>
            <div class="fmvp-content">
                <div class="fmvp-name">${result.fmvp.name}</div>
                ${result.fmvp.avgStats ? `
                <div class="fmvp-stats">
                    场均 ${result.fmvp.avgStats.points || 0}分 ${result.fmvp.avgStats.rebounds || 0}篮板 ${result.fmvp.avgStats.assists || 0}助攻
                </div>` : ''}
            </div>
        `;
        logContent.appendChild(fmvpEntry);
    }
    
    // 显示总结
    if (result.summary) {
        const summaryEntry = document.createElement('div');
        summaryEntry.className = 'log-entry series-summary';
        summaryEntry.innerHTML = `
            <div class="log-game-num">评估总结</div>
            <div class="summary-text">${result.summary}</div>
        `;
        logContent.appendChild(summaryEntry);
    }
    
    // 显示冠军
    const champion = result.champion || (gameState.battle.team1Wins >= 4 ? 1 : 2);
    showChampion(champion, result.fmvp);
}

// 渲染简化版球员数据统计表格
function renderSimplePlayerStats(stats) {
    if (!stats || stats.length === 0) return '';
    
    return `
        <table class="player-stats-table">
            <thead>
                <tr>
                    <th>球员</th>
                    <th>得分</th>
                    <th>篮板</th>
                    <th>助攻</th>
                    <th>抢断</th>
                    <th>盖帽</th>
                    <th>投篮</th>
                    <th>三分</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(p => `
                    <tr>
                        <td class="player-name-cell">${p.name}</td>
                        <td class="pts-cell">${p.points || 0}</td>
                        <td>${p.rebounds || 0}</td>
                        <td>${p.assists || 0}</td>
                        <td>${p.steals || 0}</td>
                        <td>${p.blocks || 0}</td>
                        <td>${p.fgm || 0}/${p.fga || 0}</td>
                        <td>${p.tpm || 0}/${p.tpa || 0}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 模拟单场比赛 (带重试)
async function simulateSingleGame(team1Data, team2Data, gameNumber, logContent, retryCount = 0) {
    const maxRetries = 2;
    const seriesScore = {
        team1: gameState.battle.team1Wins,
        team2: gameState.battle.team2Wins
    };
    
    // 添加AI思考区域
    let thinkingEntry = document.getElementById(`thinking-game-${gameNumber}`);
    if (!thinkingEntry) {
        thinkingEntry = document.createElement('div');
        thinkingEntry.className = 'log-entry ai-thinking';
        thinkingEntry.id = `thinking-game-${gameNumber}`;
        logContent.appendChild(thinkingEntry);
    }
    
    thinkingEntry.innerHTML = `
        <div class="log-game-num">第${gameNumber}轮评估 - 数据分析中...${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}</div>
        <div class="thinking-content" id="thinking-content-${gameNumber}">
            <div class="thinking-spinner"></div>
            <div class="thinking-text">正在进行第${gameNumber}轮绩效评估...</div>
        </div>
    `;
    logContent.scrollTop = logContent.scrollHeight;
    
    try {
        // 调用单场比赛API
        const response = await fetch(`${API_BASE_URL}/api/simulate-game-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                team1: team1Data,
                team2: team2Data,
                gameNumber: gameNumber,
                seriesScore: seriesScore,
                playerNames: gameState.playerNames
            })
        });
        
        if (!response.ok) {
            throw new Error(`第${gameNumber}场API请求失败 (${response.status})`);
        }
        
        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let reasoningText = '';
        let contentText = ''; // 存储生成的JSON文本
        let resultData = null;
        let hasError = false;
        let errorMessage = '';
        let isGeneratingContent = false;
        
        const thinkingTextEl = document.getElementById(`thinking-content-${gameNumber}`);
        let contentTextEl = null; // 用于显示生成中的内容
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        console.log(`[Game ${gameNumber}] Stream ended`);
                        continue;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`[Game ${gameNumber}] 收到类型:`, parsed.type);
                        
                        if (parsed.type === 'prompt') {
                            // 显示本场比赛的提示词
                            displayPrompts(parsed.systemPrompt, parsed.userPrompt, gameNumber);
                        } else                         if (parsed.type === 'reasoning') {
                            reasoningText += parsed.content;
                            if (thinkingTextEl) {
                                thinkingTextEl.innerHTML = `
                                    <div class="thinking-label">第${gameNumber}轮 数据分析过程</div>
                                    <div class="thinking-text">${formatThinking(reasoningText)}</div>
                                `;
                            }
                            logContent.scrollTop = logContent.scrollHeight;
                        } else if (parsed.type === 'content') {
                            // 收集AI生成的内容
                            contentText += parsed.content;
                            console.log(`[Game ${gameNumber}] Content累计长度:`, contentText.length);
                        } else if (parsed.type === 'result') {
                            console.log(`[Game ${gameNumber}] Result received:`, parsed.data);
                            console.log(`[Game ${gameNumber}] Result winner:`, parsed.data?.winner);
                            console.log(`[Game ${gameNumber}] Result score:`, parsed.data?.score);
                            resultData = parsed.data;
                        } else if (parsed.type === 'error') {
                            hasError = true;
                            errorMessage = parsed.error;
                            console.error(`[Game ${gameNumber}] Error:`, parsed.error);
                        }
                    } catch (e) {
                        console.warn(`[Game ${gameNumber}] Parse error:`, e.message, 'Data:', data.substring(0, 100));
                    }
                }
            }
        }
        
        console.log(`[Game ${gameNumber}] Final resultData:`, resultData);
        
        // 检查是否有错误
        if (hasError) {
            throw new Error(errorMessage);
        }
        
        // 移除生成区域
        const genEl = document.getElementById(`generating-content-${gameNumber}`);
        if (genEl) {
            genEl.remove();
        }
        
        // 将思考区域转换为可折叠形式（保留思考内容）
        const thinkingEl = document.getElementById(`thinking-game-${gameNumber}`);
        if (thinkingEl && reasoningText) {
            thinkingEl.innerHTML = `
                <div class="thinking-collapsed" onclick="toggleThinking(${gameNumber})">
                    <span class="thinking-toggle" id="thinking-toggle-${gameNumber}">▶</span>
                    <span class="thinking-summary">第${gameNumber}轮 分析日志 (点击展开/收起)</span>
                </div>
                <div class="thinking-detail hidden" id="thinking-detail-${gameNumber}">
                    ${formatThinking(reasoningText)}
                </div>
            `;
        } else if (thinkingEl) {
            thinkingEl.remove();
        }
        
        // 处理单场比赛结果
        console.log(`[Game ${gameNumber}] 准备显示结果, resultData:`, resultData);
        if (resultData) {
            console.log(`[Game ${gameNumber}] 调用 displaySingleGameResult...`);
            await displaySingleGameResult(resultData, gameNumber, logContent);
            console.log(`[Game ${gameNumber}] displaySingleGameResult 完成`);
        } else {
            console.error(`[Game ${gameNumber}] resultData 为空!`);
            throw new Error(`第${gameNumber}场未收到有效结果`);
        }
        
    } catch (error) {
        console.error(`第${gameNumber}场模拟失败:`, error);
        
        // 重试逻辑
        if (retryCount < maxRetries) {
            const thinkingTextEl = document.getElementById(`thinking-content-${gameNumber}`);
            if (thinkingTextEl) {
                thinkingTextEl.innerHTML = `
                    <div class="thinking-label">⚠️ 连接失败，${3}秒后重试...</div>
                    <div class="thinking-text">${error.message}</div>
                `;
            }
            await sleep(3000);
            return simulateSingleGame(team1Data, team2Data, gameNumber, logContent, retryCount + 1);
        }
        
        // 重试失败后，使用本地模拟
        const thinkingEl = document.getElementById(`thinking-game-${gameNumber}`);
        if (thinkingEl) {
            thinkingEl.remove();
        }
        
        showToast(`第${gameNumber}轮评估连接失败，使用本地分析`);
        await simulateGameLocalFallback(gameNumber, logContent);
    }
}

// 本地模拟单场比赛 (备用)
async function simulateGameLocalFallback(gameNumber, logContent) {
    const team1Power = calculateTeamPower(1);
    const team2Power = calculateTeamPower(2);
    
    const randomFactor1 = 0.85 + Math.random() * 0.3;
    const randomFactor2 = 0.85 + Math.random() * 0.3;
    
    const adjustedPower1 = team1Power * randomFactor1;
    const adjustedPower2 = team2Power * randomFactor2;
    
    const totalPower = adjustedPower1 + adjustedPower2;
    const team1WinChance = adjustedPower1 / totalPower;
    
    const winner = Math.random() < team1WinChance ? 1 : 2;
    
    const baseScore = 90 + Math.floor(Math.random() * 30);
    const scoreDiff = 3 + Math.floor(Math.random() * 20);
    const winnerScore = baseScore + scoreDiff;
    const loserScore = baseScore;
    
    const result = {
        winner: winner,
        score: {
            team1: winner === 1 ? winnerScore : loserScore,
            team2: winner === 2 ? winnerScore : loserScore
        },
        quarterScores: {
            team1: [Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20],
            team2: [Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20, Math.floor(Math.random() * 15) + 20]
        },
        narrative: '(本地模拟) 这是一场激烈的对决...',
        mvp: {
            name: '本地MVP',
            performance: '表现出色'
        }
    };
    
    // 调整节得分使其符合总分
    const team1Total = result.score.team1;
    const team2Total = result.score.team2;
    result.quarterScores.team1[3] = team1Total - result.quarterScores.team1[0] - result.quarterScores.team1[1] - result.quarterScores.team1[2];
    result.quarterScores.team2[3] = team2Total - result.quarterScores.team2[0] - result.quarterScores.team2[1] - result.quarterScores.team2[2];
    
    await displaySingleGameResult(result, gameNumber, logContent);
}

// 显示单场比赛结果
async function displaySingleGameResult(result, gameNumber, logContent) {
    console.log(`[displaySingleGameResult] Game ${gameNumber} - Result:`, result);
    console.log(`[displaySingleGameResult] winner: ${result.winner}, score: ${JSON.stringify(result.score)}`);
    
    const winner = result.winner;
    
    // 更新比分
    if (winner === 1) {
        gameState.battle.team1Wins++;
    } else {
        gameState.battle.team2Wins++;
    }
    updateBattleScore();
    
    // 创建比赛结果条目
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry game-entry player${winner}-win`;
    
    logEntry.innerHTML = `
        <div class="game-header">
            <div class="log-game-num">第${gameNumber}轮评估</div>
            <div class="game-final-score">
                <span class="team-label">${getPlayerName(1)}</span>
                <span class="score ${winner === 1 ? 'winner' : ''}">${result.score?.team1 || 0}</span>
                <span class="vs">-</span>
                <span class="score ${winner === 2 ? 'winner' : ''}">${result.score?.team2 || 0}</span>
                <span class="team-label">${getPlayerName(2)}</span>
            </div>
            <div class="series-status">
                累计评估 ${gameState.battle.team1Wins} - ${gameState.battle.team2Wins}
            </div>
        </div>
        
        ${result.quarterScores ? `
        <div class="quarter-scores">
            <table>
                <tr>
                    <th></th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>合计</th>
                </tr>
                <tr>
                    <td>${getPlayerName(1)}</td>
                    ${result.quarterScores.team1.map(q => `<td>${q}</td>`).join('')}
                    <td class="total">${result.score?.team1 || 0}</td>
                </tr>
                <tr>
                    <td>${getPlayerName(2)}</td>
                    ${result.quarterScores.team2.map(q => `<td>${q}</td>`).join('')}
                    <td class="total">${result.score?.team2 || 0}</td>
                </tr>
            </table>
        </div>` : ''}
        
        ${result.mvp || result.gameMvp ? `
        <div class="game-mvp">
            <span class="mvp-badge">★ 本轮最佳</span>
            <span class="mvp-name">${(result.mvp || result.gameMvp).name}</span>
            ${(result.mvp || result.gameMvp).performance ? `<span class="mvp-perf">${(result.mvp || result.gameMvp).performance}</span>` : ''}
        </div>` : ''}
        
        ${result.narrative ? `
        <div class="game-narrative">
            <div class="narrative-title">评估过程</div>
            <div class="narrative-text">${result.narrative}</div>
        </div>` : ''}
        
        ${result.keyMoments && result.keyMoments.length > 0 ? `
        <div class="key-moments">
            <div class="moments-title">关键节点</div>
            <ul class="moments-list">
                ${result.keyMoments.map(m => `<li>${m}</li>`).join('')}
            </ul>
        </div>` : ''}
        
        ${result.surpriseEvents && result.surpriseEvents.length > 0 ? `
        <div class="surprise-events">
            <div class="surprise-title">特殊因素</div>
            <div class="surprise-list">
                ${result.surpriseEvents.map(e => `
                    <div class="surprise-item">
                        <span class="surprise-type">${getSurpriseIcon(e.type)} ${e.type}</span>
                        <span class="surprise-player">👤 ${e.player}</span>
                        <p class="surprise-desc">${e.description}</p>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}
        
        ${result.team1Stats && result.team1Stats.length > 0 ? `
        <div class="team-stats-section">
            <div class="stats-title">📊 ${getPlayerName(1)} 球员数据</div>
            ${renderPlayerStats(result.team1Stats)}
        </div>` : ''}
        
        ${result.team2Stats && result.team2Stats.length > 0 ? `
        <div class="team-stats-section">
            <div class="stats-title">📊 ${getPlayerName(2)} 球员数据</div>
            ${renderPlayerStats(result.team2Stats)}
        </div>` : ''}
        
        ${result.analysis ? `
        <div class="game-analysis">
            <div class="analysis-title">评估分析</div>
            <div class="analysis-text">${result.analysis}</div>
        </div>` : ''}
    `;
    
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// 格式化思考内容
function formatThinking(text) {
    const maxLength = 500;
    let formatted = text;
    if (formatted.length > maxLength) {
        formatted = '...' + formatted.slice(-maxLength);
    }
    return formatted.replace(/\n/g, '<br>');
}

// 显示AI模拟结果
async function displayAIResult(result, logContent) {
    const thinkingEntry = logContent.querySelector('.ai-thinking');
    if (thinkingEntry) {
        thinkingEntry.remove();
    }
    
    // 显示赛前分析
    if (result.previewAnalysis) {
        const previewEntry = document.createElement('div');
        previewEntry.className = 'log-entry preview-analysis';
        previewEntry.innerHTML = `
            <div class="log-game-num">评估前瞻</div>
            <div class="preview-text">${result.previewAnalysis}</div>
        `;
        logContent.appendChild(previewEntry);
        logContent.scrollTop = logContent.scrollHeight;
        await sleep(1000);
    }
    
    // 显示每场比赛
    if (result.games && result.games.length > 0) {
        for (const game of result.games) {
            await sleep(800);
            
            const winner = game.winner;
            if (winner === 1) {
                gameState.battle.team1Wins++;
            } else {
                gameState.battle.team2Wins++;
            }
            updateBattleScore();
            
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry game-entry player${winner}-win`;
            logEntry.innerHTML = `
                <div class="game-header">
                    <div class="log-game-num">第${game.gameNumber}轮评估</div>
                    <div class="game-final-score">
                        <span class="team-label">${getPlayerName(1)}</span>
                        <span class="score ${winner === 1 ? 'winner' : ''}">${game.score.team1}</span>
                        <span class="vs">-</span>
                        <span class="score ${winner === 2 ? 'winner' : ''}">${game.score.team2}</span>
                        <span class="team-label">${getPlayerName(2)}</span>
                    </div>
                </div>
                
                ${game.quarterScores ? `
                <div class="quarter-scores">
                    <table>
                        <tr>
                            <th></th><th>P1</th><th>P2</th><th>P3</th><th>P4</th><th>合计</th>
                        </tr>
                        <tr>
                            <td>${getPlayerName(1)}</td>
                            ${game.quarterScores.team1.map(q => `<td>${q}</td>`).join('')}
                            <td class="total">${game.score.team1}</td>
                        </tr>
                        <tr>
                            <td>${getPlayerName(2)}</td>
                            ${game.quarterScores.team2.map(q => `<td>${q}</td>`).join('')}
                            <td class="total">${game.score.team2}</td>
                        </tr>
                    </table>
                </div>` : ''}
                
                ${game.gameMvp || game.mvp ? `
                <div class="game-mvp">
                    <span class="mvp-badge">★ 本轮最佳</span>
                    <span class="mvp-name">${(game.gameMvp || game.mvp).name}</span>
                    ${(game.gameMvp || game.mvp).performance ? `<span class="mvp-perf">${(game.gameMvp || game.mvp).performance}</span>` : ''}
                </div>` : ''}
                
                ${game.narrative ? `
                <div class="game-narrative">
                    <div class="narrative-title">📖 比赛过程</div>
                    <div class="narrative-text">${game.narrative}</div>
                </div>` : ''}
                
                ${game.keyMoments && game.keyMoments.length > 0 ? `
                <div class="key-moments">
                    <div class="moments-title">🔥 关键时刻</div>
                    <ul class="moments-list">
                        ${game.keyMoments.map(m => `<li>${m}</li>`).join('')}
                    </ul>
                </div>` : ''}
                
                ${game.team1Stats && game.team1Stats.length > 0 ? `
                <div class="team-stats-section">
                    <div class="stats-title">📊 ${getPlayerName(1)} 球员数据</div>
                    ${renderPlayerStats(game.team1Stats)}
                </div>` : ''}
                
                ${game.team2Stats && game.team2Stats.length > 0 ? `
                <div class="team-stats-section">
                    <div class="stats-title">📊 ${getPlayerName(2)} 球员数据</div>
                    ${renderPlayerStats(game.team2Stats)}
                </div>` : ''}
            `;
            logContent.appendChild(logEntry);
            logContent.scrollTop = logContent.scrollHeight;
        }
    }
    
    await sleep(500);
    
    // 显示总决赛MVP
    if (result.fmvp) {
        const fmvpEntry = document.createElement('div');
        fmvpEntry.className = 'log-entry fmvp-award';
        fmvpEntry.innerHTML = `
            <div class="log-game-num">★ 季度最佳员工</div>
            <div class="fmvp-content">
                <div class="fmvp-name">${result.fmvp.name}</div>
                ${result.fmvp.avgStats ? `
                <div class="fmvp-stats">
                    平均绩效 ${result.fmvp.avgStats.points} ${result.fmvp.avgStats.rebounds} ${result.fmvp.avgStats.assists}
                </div>` : ''}
                <div class="fmvp-reason">${result.fmvp.reason}</div>
            </div>
        `;
        logContent.appendChild(fmvpEntry);
    }
    
    // 显示系列赛总结
    if (result.seriesSummary || result.seriesAnalysis) {
        const summaryEntry = document.createElement('div');
        summaryEntry.className = 'log-entry series-summary';
        summaryEntry.innerHTML = `
            <div class="log-game-num">评估总结</div>
            <div class="summary-text">${result.seriesSummary || result.seriesAnalysis}</div>
        `;
        logContent.appendChild(summaryEntry);
    }
    
    await sleep(300);
    
    const champion = result.champion || (gameState.battle.team1Wins >= 4 ? 1 : 2);
    showChampion(champion, result.fmvp);
}

// 渲染球员数据统计表格
function renderPlayerStats(stats) {
    if (!stats || stats.length === 0) return '';
    
    return `
        <table class="player-stats-table">
            <thead>
                <tr>
                    <th>球员</th>
                    <th>位置</th>
                    <th>时间</th>
                    <th>得分</th>
                    <th>篮板</th>
                    <th>助攻</th>
                    <th>抢断</th>
                    <th>盖帽</th>
                    <th>失误</th>
                    <th>投篮</th>
                    <th>三分</th>
                    <th>罚球</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(p => `
                    <tr>
                        <td class="player-name-cell">${p.name}</td>
                        <td>${p.position || '-'}</td>
                        <td>${p.minutes || '-'}'</td>
                        <td class="pts-cell">${p.points || 0}</td>
                        <td>${p.rebounds || 0}</td>
                        <td>${p.assists || 0}</td>
                        <td>${p.steals || 0}</td>
                        <td>${p.blocks || 0}</td>
                        <td>${p.turnovers || 0}</td>
                        <td>${p.fgm || 0}/${p.fga || 0}</td>
                        <td>${p.tpm || 0}/${p.tpa || 0}</td>
                        <td>${p.ftm || 0}/${p.fta || 0}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// 本地模拟系列赛 (备用)
async function simulateSeriesLocal() {
    const logContent = document.getElementById('log-content');
    
    const team1Power = calculateTeamPower(1);
    const team2Power = calculateTeamPower(2);
    
    while (gameState.battle.team1Wins < 4 && gameState.battle.team2Wins < 4) {
        await simulateGameLocal(team1Power, team2Power);
        updateBattleScore();
        await sleep(800);
    }
    
    const winner = gameState.battle.team1Wins >= 4 ? 1 : 2;
    showChampion(winner);
}

// 计算队伍实力
function calculateTeamPower(playerNum) {
    const roster = gameState.players[playerNum].roster;
    let basePower = 0;
    
    Object.values(roster).forEach(player => {
        if (player) {
            basePower += player.cost * 15;
            basePower += player.championships * 3;
            basePower += player.allStar * 1;
            basePower += player.mvp * 5;
            basePower += player.fmvp * 8;
        }
    });
    
    return basePower;
}

// 本地模拟单场比赛
async function simulateGameLocal(team1Power, team2Power) {
    gameState.battle.gamesPlayed++;
    const gameNum = gameState.battle.gamesPlayed;
    
    const randomFactor1 = 0.85 + Math.random() * 0.3;
    const randomFactor2 = 0.85 + Math.random() * 0.3;
    
    const adjustedPower1 = team1Power * randomFactor1;
    const adjustedPower2 = team2Power * randomFactor2;
    
    const totalPower = adjustedPower1 + adjustedPower2;
    const team1WinChance = adjustedPower1 / totalPower;
    
    const winner = Math.random() < team1WinChance ? 1 : 2;
    
    if (winner === 1) {
        gameState.battle.team1Wins++;
    } else {
        gameState.battle.team2Wins++;
    }
    
    const baseScore = 90 + Math.floor(Math.random() * 30);
    const scoreDiff = 3 + Math.floor(Math.random() * 20);
    const winnerScore = baseScore + scoreDiff;
    const loserScore = baseScore;
    
    const winningRoster = Object.values(gameState.players[winner].roster).filter(p => p);
    const mvpPlayer = winningRoster[Math.floor(Math.random() * winningRoster.length)];
    
    const mvpPoints = 25 + Math.floor(Math.random() * 20);
    const mvpRebounds = 5 + Math.floor(Math.random() * 10);
    const mvpAssists = 3 + Math.floor(Math.random() * 10);
    
    const logContent = document.getElementById('log-content');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry player${winner}-win`;
    logEntry.innerHTML = `
        <div class="log-game-num">第${gameNum}场</div>
        <div class="log-score">
            ${getPlayerName(1)} ${winner === 1 ? winnerScore : loserScore} - ${winner === 2 ? winnerScore : loserScore} ${getPlayerName(2)}
        </div>
        <div class="log-highlight">
            <span class="star">⭐</span>
            <span>${mvpPlayer ? mvpPlayer.name : '未知'}: ${mvpPoints}分 ${mvpRebounds}篮板 ${mvpAssists}助攻</span>
        </div>
    `;
    logContent.appendChild(logEntry);
    logContent.scrollTop = logContent.scrollHeight;
}

// 显示冠军
function showChampion(winner, fmvp = null) {
    const logContent = document.getElementById('log-content');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry series-end';
    logEntry.innerHTML = `
        <div class="log-game-num">★ 评估结束 ★</div>
        <div class="log-score">
            ${getPlayerName(winner)} 以 ${winner === 1 ? gameState.battle.team1Wins : gameState.battle.team2Wins}-${winner === 1 ? gameState.battle.team2Wins : gameState.battle.team1Wins} 获得本季度优秀团队
        </div>
    `;
    logContent.appendChild(logEntry);
    
    const championDisplay = document.getElementById('champion-display');
    const championName = document.getElementById('champion-name');
    
    let championText = `${getPlayerName(winner)} 获得本季度优秀团队`;
    if (fmvp) {
        championText += `<br><span class="fmvp-badge">最佳员工: ${fmvp.name}</span>`;
    }
    championName.innerHTML = championText;
    championDisplay.classList.remove('hidden');
    
    createConfetti();
    
    championDisplay.onclick = () => {
        championDisplay.classList.add('hidden');
    };
}

// 生成彩带效果
function createConfetti() {
    const container = document.getElementById('confetti');
    container.innerHTML = '';
    
    const colors = ['#ca8a04', '#ea580c', '#2563eb', '#7c3aed', '#059669', '#dc2626'];
    
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
        container.appendChild(confetti);
    }
}

// 重新开始游戏
function restartGame() {
    gameState.phase = 'selection';
    gameState.currentPlayer = 1;
    gameState.currentTurn = 0;
    gameState.round = 1;
    gameState.selectionPhase = 'draw';
    gameState.drawnTeam = null;
    gameState.selectedPlayerIds.clear();
    gameState.pendingPlayer = null;
    
    gameState.players = {
        1: { budget: 11, roster: { PG: null, SG: null, SF: null, PF: null, C: null }, usedTeams: [] },
        2: { budget: 11, roster: { PG: null, SG: null, SF: null, PF: null, C: null }, usedTeams: [] }
    };
    
    gameState.battle = { team1Wins: 0, team2Wins: 0, gamesPlayed: 0 };
    
    document.getElementById('phase-select').classList.add('active');
    document.getElementById('phase-battle').classList.remove('active');
    document.getElementById('selection-area').classList.remove('hidden');
    document.getElementById('turn-indicator').classList.remove('hidden');
    document.getElementById('battle-area').classList.add('hidden');
    document.getElementById('champion-display').classList.add('hidden');
    document.getElementById('simulate-btn').disabled = false;
    document.getElementById('simulate-btn').textContent = '开始绩效评估';
    
    updateUI();
    
    showToast('系统已重置，开始新的配置');
}

// ========================================
// 调试功能
// ========================================

// 一键自动选人（调试用）
function autoFillRosters() {
    if (gameState.phase !== 'selection') {
        showToast('当前不在选人阶段');
        return;
    }
    
    // 重置游戏状态
    gameState.currentTurn = 0;
    gameState.selectionPhase = 'draw';
    gameState.drawnTeam = null;
    gameState.selectedPlayerIds.clear();
    gameState.players[1] = { budget: 11, roster: { PG: null, SG: null, SF: null, PF: null, C: null }, usedTeams: [] };
    gameState.players[2] = { budget: 11, roster: { PG: null, SG: null, SF: null, PF: null, C: null }, usedTeams: [] };
    
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const usedTeamIds = new Set();
    const usedPlayerIds = new Set();
    
    // 为每个玩家的每个位置选择球员
    for (let playerNum = 1; playerNum <= 2; playerNum++) {
        for (const pos of positions) {
            // 找一个可用的队伍
            const availableTeams = NBA_TEAMS.filter(t => !usedTeamIds.has(t.id));
            if (availableTeams.length === 0) break;
            
            const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
            usedTeamIds.add(randomTeam.id);
            gameState.players[playerNum].usedTeams.push(randomTeam.id);
            
            // 从该队伍找一个能打这个位置的球员（只选2分以内的）
            const teamPlayers = getPlayersByTeam(randomTeam.id);
            const availablePlayers = teamPlayers.filter(p => 
                p.positions.includes(pos) && 
                !usedPlayerIds.has(p.id) &&
                p.cost <= 2 &&  // 只选2分以内的球员
                p.cost <= gameState.players[playerNum].budget
            );
            
            if (availablePlayers.length > 0) {
                // 随机选一个
                const selectedPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
                
                gameState.players[playerNum].roster[pos] = selectedPlayer;
                gameState.players[playerNum].budget -= selectedPlayer.cost;
                usedPlayerIds.add(selectedPlayer.id);
                gameState.selectedPlayerIds.add(selectedPlayer.id);
            } else {
                // 如果没有合适的球员，随机选一个2分以内的球员
                const anyPlayer = teamPlayers.find(p => 
                    !usedPlayerIds.has(p.id) && 
                    p.cost <= 2 &&
                    p.cost <= gameState.players[playerNum].budget
                );
                if (anyPlayer) {
                    // 创建一个副本并强制设置位置
                    const playerCopy = { ...anyPlayer, positions: [pos] };
                    gameState.players[playerNum].roster[pos] = playerCopy;
                    gameState.players[playerNum].budget -= playerCopy.cost;
                    usedPlayerIds.add(anyPlayer.id);
                    gameState.selectedPlayerIds.add(anyPlayer.id);
                }
            }
        }
    }
    
    // 设置游戏状态为选人完成
    gameState.currentTurn = 10;
    
    // 更新UI并进入对战阶段
    updateUI();
    showToast('已自动完成人员配置');
}

// ========================================
// 工具函数
// ========================================

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('.toast-message').textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取意外因素图标
function getSurpriseIcon(type) {
    const icons = {
        '爆种': '🔥',
        '超常发挥': '🔥',
        '失常': '😰',
        '发挥失常': '😰',
        '手感冰凉': '🥶',
        '冲突': '💥',
        '技术犯规': '😤',
        '神仙球': '🎯',
        '绝杀': '🎯',
        '防守爆发': '🛡️',
        '盖帽': '🛡️',
        '抢断': '🛡️',
        '新星闪耀': '🌟',
        '关键先生': '🌟',
        '垃圾话': '😤',
        '心理博弈': '🧠',
        '逆转': '⏰',
        '大逆转': '⏰',
        '受伤': '🤕',
        '犯规麻烦': '⚠️'
    };
    
    // 查找匹配的图标
    for (const [key, icon] of Object.entries(icons)) {
        if (type.includes(key)) {
            return icon;
        }
    }
    return '🎲'; // 默认图标
}

// 显示AI提示词
function displayPrompts(systemPrompt, userPrompt, gameNumber = null) {
    const panel = document.getElementById('prompt-panel');
    const systemDisplay = document.getElementById('system-prompt-display');
    const userDisplay = document.getElementById('user-prompt-display');
    const header = panel.querySelector('.prompt-panel-header h3');
    
    // 更新标题显示当前场次
    if (gameNumber) {
        header.textContent = `📝 AI提示词 - 第${gameNumber}场`;
    } else {
        header.textContent = '📝 AI提示词';
    }
    
    if (systemPrompt) {
        systemDisplay.textContent = systemPrompt;
    }
    if (userPrompt) {
        userDisplay.textContent = userPrompt;
    }
    
    panel.classList.remove('hidden');
}

// 切换提示词面板显示/隐藏
function togglePromptPanel() {
    const content = document.getElementById('prompt-panel-content');
    const btn = document.querySelector('.prompt-toggle-btn');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        btn.textContent = '收起 ▼';
    } else {
        content.classList.add('collapsed');
        btn.textContent = '展开 ▲';
    }
}

// 切换AI思考过程展开/折叠
function toggleThinking(gameNumber) {
    const detail = document.getElementById(`thinking-detail-${gameNumber}`);
    const toggle = document.getElementById(`thinking-toggle-${gameNumber}`);
    
    if (detail && toggle) {
        if (detail.classList.contains('hidden')) {
            detail.classList.remove('hidden');
            toggle.textContent = '▼';
        } else {
            detail.classList.add('hidden');
            toggle.textContent = '▶';
        }
    }
}

// ========================================
// 球员管理功能
// ========================================

let allPlayersData = [];
let editingPlayerId = null;

// 显示/隐藏界面
function showSection(section) {
    const adminSection = document.getElementById('admin-section');
    
    if (section === 'admin') {
        adminSection.style.display = 'flex';
        loadAllPlayers();
    } else if (section === 'game') {
        // 游戏界面始终显示，不做任何处理
    }
}

// 关闭球员管理面板
function closeAdminPanel() {
    const adminSection = document.getElementById('admin-section');
    adminSection.style.display = 'none';
}

// 加载所有球员数据
async function loadAllPlayers() {
    try {
        // 使用前端已加载的 PLAYERS 数据
        allPlayersData = PLAYERS;
        
        // 填充球队筛选器
        const teamFilter = document.getElementById('admin-team-filter');
        const formTeam = document.getElementById('form-team');
        const teams = [...new Set(PLAYERS.map(p => p.team))].sort();
        
        teamFilter.innerHTML = '<option value="">所有球队</option>';
        formTeam.innerHTML = '';
        
        teams.forEach(team => {
            const teamObj = NBA_TEAMS.find(t => t.code === team);
            const teamName = teamObj ? teamObj.name : team;
            
            const option1 = document.createElement('option');
            option1.value = team;
            option1.textContent = `${teamName} (${team})`;
            teamFilter.appendChild(option1);
            
            const option2 = document.createElement('option');
            option2.value = team;
            option2.textContent = teamName;
            formTeam.appendChild(option2);
        });
        
        renderAdminTable(allPlayersData);
    } catch (error) {
        alert('加载球员数据失败: ' + error.message);
    }
}

// 渲染管理表格
function renderAdminTable(players) {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '';
    
    players.forEach(player => {
        const teamObj = NBA_TEAMS.find(t => t.code === player.team);
        const teamName = teamObj ? teamObj.name : player.team;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${player.id}</td>
            <td>${player.name}</td>
            <td>${player.nameEn}</td>
            <td>${teamName}</td>
            <td>${player.positions.join(', ')}</td>
            <td>${player.cost}分</td>
            <td>${player.allStar}</td>
            <td>${player.mvp}</td>
            <td>${player.fmvp}</td>
            <td>${player.championships}</td>
            <td>${player.peakSeason}</td>
            <td>
                <button class="btn-edit" onclick="editPlayer(${player.id})">编辑</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 筛选球员
function filterAdminPlayers() {
    const teamFilter = document.getElementById('admin-team-filter').value;
    const searchText = document.getElementById('admin-search').value.toLowerCase();
    
    let filtered = allPlayersData;
    
    if (teamFilter) {
        filtered = filtered.filter(p => p.team === teamFilter);
    }
    
    if (searchText) {
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(searchText) || 
            p.nameEn.toLowerCase().includes(searchText)
        );
    }
    
    renderAdminTable(filtered);
}

// 显示添加球员表单
function showAddPlayerForm() {
    editingPlayerId = null;
    document.getElementById('modal-title').textContent = '添加球员';
    document.getElementById('player-form').reset();
    document.getElementById('form-playerId').value = '';
    document.getElementById('player-modal').style.display = 'flex';
}

// 编辑球员
function editPlayer(playerId) {
    const player = allPlayersData.find(p => p.id === playerId);
    if (!player) return;
    
    editingPlayerId = playerId;
    document.getElementById('modal-title').textContent = '编辑球员';
    document.getElementById('form-playerId').value = playerId;
    document.getElementById('form-name').value = player.name;
    document.getElementById('form-nameEn').value = player.nameEn;
    document.getElementById('form-team').value = player.team;
    document.getElementById('form-cost').value = player.cost;
    document.getElementById('form-peakSeason').value = player.peakSeason;
    document.getElementById('form-allStar').value = player.allStar;
    document.getElementById('form-mvp').value = player.mvp;
    document.getElementById('form-fmvp').value = player.fmvp;
    document.getElementById('form-championships').value = player.championships;
    
    // 设置位置多选
    const positionsSelect = document.getElementById('form-positions');
    Array.from(positionsSelect.options).forEach(option => {
        option.selected = player.positions.includes(option.value);
    });
    
    document.getElementById('player-modal').style.display = 'flex';
}

// 关闭模态窗口
function closePlayerModal() {
    document.getElementById('player-modal').style.display = 'none';
    editingPlayerId = null;
}

// 保存球员
async function savePlayer(event) {
    event.preventDefault();
    
    const playerId = document.getElementById('form-playerId').value;
    const selectedPositions = Array.from(document.getElementById('form-positions').selectedOptions)
        .map(option => option.value);
    
    const playerData = {
        name: document.getElementById('form-name').value,
        nameEn: document.getElementById('form-nameEn').value,
        team: document.getElementById('form-team').value,
        cost: parseInt(document.getElementById('form-cost').value),
        positions: selectedPositions,
        peakSeason: document.getElementById('form-peakSeason').value,
        allStar: parseInt(document.getElementById('form-allStar').value),
        mvp: parseInt(document.getElementById('form-mvp').value),
        fmvp: parseInt(document.getElementById('form-fmvp').value),
        championships: parseInt(document.getElementById('form-championships').value)
    };
    
    try {
        let response;
        if (playerId) {
            // 更新球员
            response = await fetch(`${API_BASE_URL}/api/players/${playerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(playerData)
            });
        } else {
            // 添加球员
            response = await fetch(`${API_BASE_URL}/api/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(playerData)
            });
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            closePlayerModal();
            // 重新加载页面以更新 players.js
            window.location.reload();
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}