// ========================================
// NBA历史球星模拟对战 - 游戏逻辑
// 规则：两边轮流抽队伍，从中选人
// ========================================

// API配置
const API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:5000' 
    : window.location.origin;

// ========================================
// 多人在线 - WebSocket 配置
// ========================================
let socket = null;
let onlineMode = false;
let roomId = null;
let myPlayerNum = null;
let isReady = false;

// 初始化 Socket.IO 连接
function initSocket() {
    if (socket && socket.connected) return;
    
    socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
        console.log('[WebSocket] 已连接到服务器');
    });
    
    socket.on('disconnect', () => {
        console.log('[WebSocket] 与服务器断开连接');
        showToast('与服务器断开连接', 'error');
    });
    
    socket.on('error', (data) => {
        console.error('[WebSocket] 错误:', data.message);
        showToast(data.message, 'error');
    });
    
    // 房间事件
    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoined);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_left', handlePlayerLeft);
    socket.on('player_ready', handlePlayerReady);
    
    // 游戏事件
    socket.on('team_selected', handleTeamSelected);
    socket.on('player_selected', handlePlayerSelected);
    socket.on('turn_skipped', handleTurnSkipped);
    socket.on('battle_ready', handleBattleReady);
    
    // 对战模拟事件
    socket.on('battle_started', handleBattleStarted);
    socket.on('battle_stream', handleBattleStream);
}

// 房间事件处理
function handleRoomCreated(data) {
    console.log('[房间] 房间已创建:', data);
    roomId = data.room_id;
    myPlayerNum = data.player_num;
    updateWaitingRoom(data.room_state);
    showWaitingRoom();
}

function handleRoomJoined(data) {
    console.log('[房间] 已加入房间:', data);
    roomId = data.room_id;
    myPlayerNum = data.player_num;
    updateWaitingRoom(data.room_state);
    showWaitingRoom();
}

function handlePlayerJoined(data) {
    console.log('[房间] 玩家加入:', data);
    updateWaitingRoom(data.room_state);
    showToast(`${data.player_name} 加入了房间`, 'success');
}

function handlePlayerLeft(data) {
    console.log('[房间] 玩家离开:', data);
    showToast(data.message, 'warning');
    // 如果对方离开,回到房间大厅
    if (data.player_num !== myPlayerNum) {
        leaveRoom();
    }
}

function handlePlayerReady(data) {
    console.log('[房间] 玩家准备:', data);
    updateWaitingRoom(data.room_state);
    
    // 如果双方都准备好了,开始游戏
    if (data.room_state.game_state.phase === 'selection') {
        startOnlineGame(data.room_state);
    }
}

// 游戏事件处理
function handleTeamSelected(data) {
    console.log('[游戏] 队伍已选择:', data);
    
    // 先同步游戏状态
    syncGameState(data.room_state);
    
    // 如果是当前玩家选择的队伍，显示球员列表
    if (data.player_num == myPlayerNum) {
        renderTeamPlayers(data.team_code);
    }
    
    showToast(`${getPlayerName(data.player_num)} 选择了队伍`, 'info');
}

function handlePlayerSelected(data) {
    console.log('[游戏] 球员已选择:', data);
    console.log('[游戏] 服务器返回的 current_player:', data.room_state.game_state.current_player);
    
    // 隐藏位置选择器
    const selector = document.getElementById('position-selector');
    if (selector) {
        selector.classList.add('hidden');
    }
    gameState.pendingPlayer = null;
    
    // 同步游戏状态
    syncGameState(data.room_state);
    
    console.log('[游戏] 同步后 gameState.currentPlayer:', gameState.currentPlayer);
    
    showToast(`${getPlayerName(data.player_num)} 选择了 ${data.player_data.name}`, 'success');
}

function handleTurnSkipped(data) {
    console.log('[游戏] 回合跳过:', data);
    
    // 同步游戏状态
    syncGameState(data.room_state);
    
    showToast(`${getPlayerName(data.player_num)} 跳过了回合`, 'info');
}

function handleBattleReady(data) {
    console.log('[游戏] 准备对战:', data);
    // 这里可以触发对战模拟
    showToast('双方阵容已满,准备开始对战!', 'success');
}

// 对战开始事件
function handleBattleStarted(data) {
    console.log('[对战] 对战开始:', data);
    
    // 禁用按钮，显示状态
    const simulateBtn = document.getElementById('simulate-btn');
    if (simulateBtn) {
        simulateBtn.disabled = true;
        simulateBtn.textContent = '数据分析中...';
    }
    
    // 清空日志
    const logContent = document.getElementById('log-content');
    if (logContent) {
        logContent.innerHTML = '';
    }
    
    // 重置比分
    gameState.battle = {
        team1Wins: 0,
        team2Wins: 0,
        gamesPlayed: 0
    };
    updateBattleScore();
    
    // 创建思考框
    createThinkingBox();
    
    showToast('对战模拟开始，双方都可以看到结果', 'info');
}

// 对战流式数据
function handleBattleStream(data) {
    console.log('[对战] 收到流式数据:', data.type);
    
    if (data.type === 'reasoning') {
        // 更新思考内容
        const thinkingContentEl = document.getElementById('thinking-content');
        if (thinkingContentEl) {
            const spinner = thinkingContentEl.querySelector('.thinking-spinner');
            if (spinner) spinner.remove();
            
            if (!thinkingContentEl.dataset.content) {
                thinkingContentEl.dataset.content = '';
            }
            thinkingContentEl.dataset.content += data.content;
            thinkingContentEl.textContent = thinkingContentEl.dataset.content;
            thinkingContentEl.scrollTop = thinkingContentEl.scrollHeight;
        }
    } else if (data.type === 'content') {
        // 收集生成的内容
        if (!window.battleContentBuffer) {
            window.battleContentBuffer = '';
            
            // 第一次收到 content 时，更新思考状态并创建实时输出区域
            const statusEl = document.getElementById('thinking-status');
            if (statusEl) {
                statusEl.textContent = '✓ 思考完成';
                statusEl.classList.add('completed');
            }
            
            // 默认折叠思考框
            const thinkingBody = document.getElementById('thinking-body');
            const toggleIcon = document.getElementById('thinking-toggle-icon');
            if (thinkingBody && toggleIcon) {
                thinkingBody.classList.add('collapsed');
                toggleIcon.textContent = '▶';
            }
            
            // 创建实时输出区域
            createLiveOutputBox();
        }
        
        window.battleContentBuffer += data.content;
        
        // 实时显示输出内容
        const liveOutputEl = document.getElementById('live-output-content');
        if (liveOutputEl) {
            liveOutputEl.textContent = window.battleContentBuffer;
            liveOutputEl.scrollTop = liveOutputEl.scrollHeight;
        }
    } else if (data.type === 'result') {
        // 显示最终结果
        const logContent = document.getElementById('log-content');
        if (logContent && data.data) {
            // 移除实时输出区域
            const liveOutputBox = document.getElementById('live-output-box');
            if (liveOutputBox) {
                liveOutputBox.remove();
            }
            
            // 显示对战结果
            displaySeriesResult(data.data, logContent);
            
            // 显示冠军
            const champion = data.data.champion;
            const fmvp = data.data.fmvp;
            showChampion(champion, fmvp);
        }
        
        // 恢复按钮
        const simulateBtn = document.getElementById('simulate-btn');
        if (simulateBtn) {
            simulateBtn.disabled = false;
            simulateBtn.textContent = '开始绩效评估';
        }
        
        // 清理缓冲
        window.battleContentBuffer = '';
    } else if (data.type === 'error') {
        console.error('[对战] 错误:', data.error);
        showToast('对战模拟失败: ' + data.error, 'error');
        
        // 恢复按钮
        const simulateBtn = document.getElementById('simulate-btn');
        if (simulateBtn) {
            simulateBtn.disabled = false;
            simulateBtn.textContent = '开始绩效评估';
        }
    }
}

// 创建思考框
function createThinkingBox() {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    const thinkingEntry = document.createElement('div');
    thinkingEntry.className = 'thinking-box';
    thinkingEntry.innerHTML = `
        <div class="thinking-header" onclick="toggleThinkingBox()" title="点击展开/折叠思考过程">
            <div class="thinking-title">
                <span class="thinking-icon">💭</span>
                <span class="thinking-label">AI思考过程</span>
                <span class="thinking-status" id="thinking-status">思考中...</span>
                <span class="thinking-hint">(点击展开/折叠)</span>
            </div>
            <span class="thinking-toggle" id="thinking-toggle-icon">▼</span>
        </div>
        <div class="thinking-body" id="thinking-body">
            <div class="thinking-content" id="thinking-content">
                <div class="thinking-spinner"></div>
            </div>
        </div>
    `;
    logContent.appendChild(thinkingEntry);
}

// 创建实时输出框
function createLiveOutputBox() {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    // 检查是否已存在
    if (document.getElementById('live-output-box')) return;
    
    const liveOutputBox = document.createElement('div');
    liveOutputBox.id = 'live-output-box';
    liveOutputBox.className = 'live-output-box';
    liveOutputBox.innerHTML = `
        <div class="live-output-header">
            <div class="live-output-title">
                <span class="live-output-icon">📝</span>
                <span class="live-output-label">正在生成结果...</span>
                <span class="live-output-hint">实时输出</span>
            </div>
        </div>
        <div class="live-output-content" id="live-output-content"></div>
    `;
    logContent.appendChild(liveOutputBox);
    
    // 滚动到底部
    logContent.scrollTop = logContent.scrollHeight;
}

// ========================================
// 显示模式配置
// ========================================
let displayMode = localStorage.getItem('displayMode') || 'office'; // 'office' 或 'nba'

// 术语映射表
const terminology = {
    office: {
        // 页面标题
        pageTitle: 'Q4季度人员绩效对比分析系统 - 企业管理平台',
        mainTitle: 'Q4季度人员绩效对比分析',
        subtitle: '资源配置 · 团队组建 · 绩效模拟',
        
        // 导航栏
        systemName: '企业资源管理系统 v3.2.1',
        nav1: '绩效分析',
        nav2: '人员配置',
        userRole: '管理员',
        
        // 阶段指示器
        phase1: '资源配置',
        phase2: '绩效评估',
        
        // 玩家面板
        defaultPlayer1: 'A组',
        defaultPlayer2: 'B组',
        budgetLabel: '剩余预算',
        usedTeamsLabel: '已选部门:',
        emptySlot: '待分配',
        
        // 位置名称
        position: {
            PG: '1项目',
            SG: '2技术',
            SF: '3运营',
            PF: '4市场',
            C: '5财务'
        },
        
        // 回合指示器
        currentTurn: '当前操作',
        roundText: '轮',
        phaseHint: '选择部门',
        
        // 选择区域
        teamSelectTitle: '选择业务部门',
        teamSelectHint: '点击选择部门，或点击随机分配',
        randomBtn: '随机分配',
        teamCount: '名人员',
        
        // 球员选择
        playerSelectHint: '选择一名员工加入团队（按绩效评级计算）',
        redrawBtn: '重新抽取',
        skipBtn: '跳过本轮',
        customBadge: '添加外包人员',
        customHint: '输入任意员工信息，按基础评级计算',
        customSeasonPlaceholder: '入职年份 (如: 2015)',
        customNamePlaceholder: '姓名 (如: 张三)',
        customNameEnPlaceholder: '工号 (如: EMP001)',
        
        // 对战区域
        battleTitle: '季度绩效对比评估 BO7',
        rosterTitle: '人员配置',
        totalLabel: '总评分',
        gameLog: '评估报告',
        simulateBtn: '开始绩效评估',
        restartBtn: '重新配置',
        championTitle: '优秀团队',
        
        // 管理面板
        adminTitle: '球员数据管理',
        
        // 消息提示
        positionAssign: '分配岗位',
        positionAssignHint: '为 {name} 分配岗位',
        
        // 其他
        cost: '分',
        championship: '冠',
        allStar: '次全明星',
        mvp: 'MVP',
        peak: '巅峰:',
        
        // 动态文本
        teamUsed: '该部门已被分配',
        teamSelected: '部门',
        noTeamsAvailable: '没有可用的部门了',
        playerUsed: '该员工已被分配',
        enterPlayerName: '请输入员工姓名',
        redrawTeamToast: '重新选择部门',
        assignPersonnel: '分配人员',
        bestEmployee: '季度最佳员工',
        bestEmployeeBadge: '最佳员工',
        
        // 阶段提示
        phaseDrawTeam: '选择部门',
        phasePickPlayer: '分配人员'
    },
    nba: {
        // 页面标题
        pageTitle: 'NBA历史球星模拟对战游戏',
        mainTitle: 'NBA历史球星模拟对战',
        subtitle: '组队 · 对战 · 称霸',
        
        // 导航栏
        systemName: 'NBA历史球星对战系统 v1.0',
        nav1: '开始游戏',
        nav2: '球员管理',
        userRole: '玩家',
        
        // 阶段指示器
        phase1: '选择球员',
        phase2: '模拟对战',
        
        // 玩家面板
        defaultPlayer1: '玩家1',
        defaultPlayer2: '玩家2',
        budgetLabel: '剩余预算',
        usedTeamsLabel: '已选球队:',
        emptySlot: '未选择',
        
        // 位置名称
        position: {
            PG: '控球后卫',
            SG: '得分后卫',
            SF: '小前锋',
            PF: '大前锋',
            C: '中锋'
        },
        
        // 回合指示器
        currentTurn: '当前回合',
        roundText: '轮',
        phaseHint: '抽取球队',
        
        // 选择区域
        teamSelectTitle: '选择NBA球队',
        teamSelectHint: '点击选择球队，或点击随机抽取',
        randomBtn: '随机抽取',
        teamCount: '名球员',
        
        // 球员选择
        playerSelectHint: '选择一名球员加入阵容',
        redrawBtn: '重新抽取',
        skipBtn: '跳过本轮',
        customBadge: '自定义球员',
        customHint: '输入任意球员信息，按基础评分计算',
        customSeasonPlaceholder: '赛季 (如: 2015-16)',
        customNamePlaceholder: '姓名 (如: 张伟)',
        customNameEnPlaceholder: '英文名 (如: Zhang Wei)',
        
        // 对战区域
        battleTitle: 'NBA对战模拟 BO7',
        rosterTitle: '阵容',
        totalLabel: '总评分',
        gameLog: '比赛日志',
        simulateBtn: '开始对战',
        restartBtn: '重新开始',
        championTitle: '冠军',
        
        // 管理面板
        adminTitle: '球员数据管理',
        
        // 消息提示
        positionAssign: '分配位置',
        positionAssignHint: '为 {name} 分配位置',
        
        // 其他
        cost: '分',
        championship: '冠',
        allStar: '次全明星',
        mvp: 'MVP',
        peak: '巅峰:',
        
        // 动态文本
        teamUsed: '该球队已被选择',
        teamSelected: '球队',
        noTeamsAvailable: '没有可用的球队了',
        playerUsed: '该球员已被选择',
        enterPlayerName: '请输入球员姓名',
        redrawTeamToast: '重新抽取球队',
        assignPersonnel: '选择球员',
        bestEmployee: '总决赛MVP',
        bestEmployeeBadge: 'FMVP',
        
        // 阶段提示
        phaseDrawTeam: '抽取球队',
        phasePickPlayer: '选择球员'
    }
};

// 获取当前术语
function getTerms() {
    return terminology[displayMode];
}

// 切换显示模式
function toggleDisplayMode() {
    displayMode = displayMode === 'office' ? 'nba' : 'office';
    localStorage.setItem('displayMode', displayMode);
    applyDisplayMode();
}

// 应用显示模式
function applyDisplayMode() {
    const terms = getTerms();
    
    // 更新页面标题
    document.title = terms.pageTitle;
    
    // 更新主标题
    const mainTitle = document.querySelector('.title');
    if (mainTitle) mainTitle.textContent = terms.mainTitle;
    
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = terms.subtitle;
    
    // 更新导航栏
    const systemName = document.querySelector('.system-name');
    if (systemName) systemName.textContent = terms.systemName;
    
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[0]) navItems[0].textContent = terms.nav1;
    if (navItems[1]) navItems[1].textContent = terms.nav2;
    
    const userInfo = document.querySelector('.user-info');
    if (userInfo) userInfo.textContent = terms.userRole;
    
    // 更新模式切换按钮
    const modeToggleBtn = document.getElementById('mode-toggle-btn');
    if (modeToggleBtn) {
        const icon = modeToggleBtn.querySelector('.mode-icon');
        const text = modeToggleBtn.querySelector('.mode-text');
        if (displayMode === 'office') {
            icon.textContent = '🏀';
            text.textContent = '切换为NBA模式';
        } else {
            icon.textContent = '💼';
            text.textContent = '切换为办公模式';
        }
    }
    
    // 更新阶段指示器
    const phase1Text = document.querySelector('#phase-select .phase-text');
    const phase2Text = document.querySelector('#phase-battle .phase-text');
    if (phase1Text) phase1Text.textContent = terms.phase1;
    if (phase2Text) phase2Text.textContent = terms.phase2;
    
    // 更新预算标签
    document.querySelectorAll('.budget-label').forEach(el => {
        el.textContent = terms.budgetLabel;
    });
    
    // 更新已选部门/球队标签
    document.querySelectorAll('.used-teams-label').forEach(el => {
        el.textContent = terms.usedTeamsLabel;
    });
    
    // 更新位置标签
    updatePositionLabels();
    
    // 更新回合指示器
    const currentTurnEl = document.querySelector('.current-turn');
    if (currentTurnEl) currentTurnEl.textContent = terms.currentTurn;
    
    // 更新选择区域
    const teamSelectTitle = document.querySelector('#team-select-area .section-header h3');
    if (teamSelectTitle) teamSelectTitle.textContent = terms.teamSelectTitle;
    
    const teamSelectHint = document.querySelector('#team-select-area .section-header p');
    if (teamSelectHint) teamSelectHint.textContent = terms.teamSelectHint;
    
    const randomBtn = document.querySelector('#team-select-area .random-btn');
    if (randomBtn) randomBtn.textContent = terms.randomBtn;
    
    // 更新球员选择区域
    const playerSelectHint = document.querySelector('#player-select-area .section-header p');
    if (playerSelectHint) playerSelectHint.textContent = terms.playerSelectHint;
    
    const redrawBtn = document.querySelector('.redraw-btn');
    if (redrawBtn) redrawBtn.textContent = terms.redrawBtn;
    
    const skipBtn = document.querySelector('.skip-btn');
    if (skipBtn) skipBtn.textContent = terms.skipBtn;
    
    // 更新自定义输入区域
    const customBadge = document.querySelector('.custom-badge');
    if (customBadge) customBadge.textContent = terms.customBadge;
    
    const customHint = document.querySelector('.custom-hint');
    if (customHint) customHint.textContent = terms.customHint;
    
    const customSeason = document.getElementById('custom-season');
    if (customSeason) customSeason.placeholder = terms.customSeasonPlaceholder;
    
    const customName = document.getElementById('custom-name');
    if (customName) customName.placeholder = terms.customNamePlaceholder;
    
    const customNameEn = document.getElementById('custom-name-en');
    if (customNameEn) customNameEn.placeholder = terms.customNameEnPlaceholder;
    
    // 更新对战区域
    const battleTitle = document.querySelector('.battle-header h2');
    if (battleTitle) battleTitle.textContent = terms.battleTitle;
    
    const gameLogTitle = document.querySelector('#game-log h3');
    if (gameLogTitle) gameLogTitle.textContent = terms.gameLog;
    
    const simulateBtn = document.getElementById('simulate-btn');
    if (simulateBtn) simulateBtn.textContent = terms.simulateBtn;
    
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.textContent = terms.restartBtn;
    
    // 更新总评分标签
    document.querySelectorAll('.stat-label').forEach(el => {
        if (el.textContent.includes('总评分') || el.textContent.includes('总分')) {
            el.textContent = terms.totalLabel;
        }
    });
    
    // 更新位置选择器标题
    const positionSelectorTitle = document.querySelector('#position-selector h3');
    if (positionSelectorTitle) positionSelectorTitle.textContent = terms.positionAssign;
    
    // 重新渲染队伍网格和球员列表（如果有的话）
    renderTeamGrid();
    if (gameState.drawnTeam) {
        renderTeamPlayers(gameState.drawnTeam);
    }
}

// 更新位置标签
function updatePositionLabels() {
    const terms = getTerms();
    document.querySelectorAll('.position-label').forEach(el => {
        const posText = el.textContent;
        // 提取位置代码（如 "1项目" -> 找到对应的 PG）
        if (posText.includes('1') || posText.includes('控球')) {
            el.textContent = terms.position.PG;
        } else if (posText.includes('2') || posText.includes('得分')) {
            el.textContent = terms.position.SG;
        } else if (posText.includes('3') || posText.includes('小前')) {
            el.textContent = terms.position.SF;
        } else if (posText.includes('4') || posText.includes('大前')) {
            el.textContent = terms.position.PF;
        } else if (posText.includes('5') || posText.includes('中锋')) {
            el.textContent = terms.position.C;
        }
    });
}

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

// 位置名称（动态获取）
function getPositionNames() {
    return getTerms().position;
}

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
// 房间管理函数
// ========================================

// 显示房间模式选择界面
function showRoomLobby() {
    document.getElementById('room-lobby').style.display = 'flex';
    document.querySelector('.container').style.display = 'none';
}

// 隐藏房间界面,显示游戏界面
function hideRoomLobby() {
    document.getElementById('room-lobby').style.display = 'none';
    document.querySelector('.container').style.display = 'block';
}

// 切换房间模式
function showRoomMode(mode) {
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    if (mode === 'single') {
        document.getElementById('single-mode-panel').style.display = 'block';
        document.getElementById('online-mode-panel').style.display = 'none';
    } else {
        document.getElementById('single-mode-panel').style.display = 'none';
        document.getElementById('online-mode-panel').style.display = 'block';
        // 初始化 Socket 连接
        initSocket();
    }
}

// 开始单机模式
function startSingleMode() {
    onlineMode = false;
    hideRoomLobby();
    resetGame();
}

// 创建在线房间
function createOnlineRoom() {
    const playerName = document.getElementById('lobby-player-name').value.trim() || '玩家1';
    
    if (!socket || !socket.connected) {
        showToast('正在连接服务器,请稍候...', 'info');
        initSocket();
        setTimeout(() => createOnlineRoom(), 1000);
        return;
    }
    
    socket.emit('create_room', { player_name: playerName });
}

// 加入在线房间
function joinOnlineRoom() {
    const roomIdInput = document.getElementById('room-id-input').value.trim();
    const playerName = document.getElementById('lobby-player-name').value.trim() || '玩家2';
    
    if (!roomIdInput) {
        showToast('请输入房间号', 'error');
        return;
    }
    
    if (!socket || !socket.connected) {
        showToast('正在连接服务器,请稍候...', 'info');
        initSocket();
        setTimeout(() => joinOnlineRoom(), 1000);
        return;
    }
    
    socket.emit('join_room', { room_id: roomIdInput, player_name: playerName });
}

// 显示等待房间
function showWaitingRoom() {
    document.getElementById('online-mode-panel').style.display = 'none';
    document.getElementById('single-mode-panel').style.display = 'none';
    document.getElementById('waiting-room').style.display = 'block';
    document.getElementById('current-room-id').textContent = roomId;
}

// 更新等待房间状态
function updateWaitingRoom(roomState) {
    const player1 = roomState.players['1'];
    const player2 = roomState.players['2'];
    
    // 更新玩家1信息
    document.getElementById('waiting-player1-name').textContent = player1 ? player1.name : '等待中...';
    document.getElementById('waiting-player1-status').textContent = player1?.ready ? '✅ 已准备' : '⏳ 未准备';
    
    // 更新玩家2信息
    document.getElementById('waiting-player2-name').textContent = player2 ? player2.name : '等待加入...';
    document.getElementById('waiting-player2-status').textContent = player2?.ready ? '✅ 已准备' : '⏳ 未准备';
    
    // 更新提示信息
    const hintEl = document.getElementById('waiting-hint');
    const readyBtn = document.getElementById('ready-btn');
    
    if (!player2) {
        hintEl.textContent = `分享房间号 ${roomId} 给好友,等待对方加入...`;
        readyBtn.disabled = true;
    } else if (player1.ready && player2.ready) {
        hintEl.textContent = '游戏即将开始...';
        readyBtn.disabled = true;
    } else {
        hintEl.textContent = '双方准备后开始游戏';
        readyBtn.disabled = false;
    }
    
    // 更新准备按钮状态
    const myReady = roomState.players[myPlayerNum]?.ready;
    if (myReady) {
        readyBtn.textContent = '✅ 已准备';
        readyBtn.classList.add('ready');
    } else {
        readyBtn.textContent = '准备';
        readyBtn.classList.remove('ready');
    }
}

// 切换准备状态
function toggleReady() {
    if (!socket || !roomId) return;
    
    socket.emit('ready', {
        room_id: roomId,
        player_num: myPlayerNum
    });
}

// 离开房间
function leaveRoom() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    
    roomId = null;
    myPlayerNum = null;
    isReady = false;
    onlineMode = false;
    
    // 重置界面
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('online-mode-panel').style.display = 'block';
    document.getElementById('room-id-input').value = '';
    
    showToast('已离开房间', 'info');
}

// 开始在线游戏
function startOnlineGame(roomState) {
    onlineMode = true;
    
    // 更新玩家名称
    gameState.playerNames['1'] = roomState.players['1'].name;
    gameState.playerNames['2'] = roomState.players['2'].name;
    
    // 同步游戏状态
    syncGameState(roomState);
    
    // 显示游戏界面
    hideRoomLobby();
    
    // 确保显示选择区域
    const selectionArea = document.getElementById('selection-area');
    if (selectionArea) {
        selectionArea.style.display = 'block';
        selectionArea.classList.remove('hidden');
    }
    
    // 确保显示回合指示器
    const turnIndicator = document.getElementById('turn-indicator');
    if (turnIndicator) {
        turnIndicator.style.display = 'flex';
        turnIndicator.classList.remove('hidden');
    }
    
    // 隐藏对战区域
    const battleArea = document.getElementById('battle-area');
    if (battleArea) {
        battleArea.style.display = 'none';
    }
    
    // 初始化游戏界面
    initializeGame();
    
    showToast('游戏开始!', 'success');
}

// 同步游戏状态
function syncGameState(roomState) {
    const gs = roomState.game_state;
    
    // 同步游戏阶段
    if (gs.phase) {
        gameState.phase = gs.phase;
    }
    
    // 更新当前玩家和回合（保持字符串类型以便与 myPlayerNum 比较）
    gameState.currentPlayer = gs.current_player ? parseInt(gs.current_player) : 1;
    gameState.round = gs.round;
    
    // 更新预算
    gameState.players[1].budget = gs.budgets['1'];
    gameState.players[2].budget = gs.budgets['2'];
    
    // 更新已选队伍
    gameState.players[1].usedTeams = gs.used_teams['1'];
    gameState.players[2].usedTeams = gs.used_teams['2'];
    
    // 更新阵容
    gameState.players[1].roster = gs.teams['1'];
    gameState.players[2].roster = gs.teams['2'];
    
    // 更新抽取的队伍
    gameState.drawnTeam = gs.drawn_team;
    
    // 同步选择阶段 (服务器用 selection_phase，客户端用 selectionPhase)
    if (gs.selection_phase) {
        gameState.selectionPhase = gs.selection_phase;
    }
    
    // 更新 UI
    updateUI();
    renderTeamGrid();
    
    // 检查是否可以开始对战
    if (gs.phase === 'battle') {
        console.log('[同步] 切换到对战阶段');
        gameState.phase = 'battle';
        
        // 更新阶段指示器
        document.getElementById('phase-select').classList.remove('active');
        document.getElementById('phase-battle').classList.add('active');
        
        // 隐藏选人区域
        const selectionArea = document.getElementById('selection-area');
        if (selectionArea) {
            selectionArea.style.display = 'none';
            selectionArea.classList.add('hidden');
        }
        
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator) {
            turnIndicator.style.display = 'none';
            turnIndicator.classList.add('hidden');
        }
        
        // 显示对战区域
        const battleArea = document.getElementById('battle-area');
        if (battleArea) {
            battleArea.style.display = 'block';
            battleArea.classList.remove('hidden');
        }
        
        // 更新对战界面的玩家名称
        document.getElementById('battle-player1-name').textContent = getPlayerName(1);
        document.getElementById('battle-player2-name').textContent = getPlayerName(2);
        document.getElementById('battle-roster1-title').textContent = `${getPlayerName(1)}阵容`;
        document.getElementById('battle-roster2-title').textContent = `${getPlayerName(2)}阵容`;
        
        // 渲染对战阵容
        renderBattleRosters();
    }
}

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // 先显示房间选择界面
    showRoomLobby();
    applyDisplayMode(); // 应用显示模式
});

function initializeGame() {
    applyDisplayMode(); // 应用显示模式
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
                    ${player.positions.map(pos => `<span class="position-tag">${getPositionNames()[pos]}</span>`).join('')}
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
    // 更新当前玩家（在线模式下使用服务器同步的值，单机模式下根据turnOrder计算）
    let currentPlayer;
    if (onlineMode) {
        // 在线模式：使用已同步的 currentPlayer
        currentPlayer = gameState.currentPlayer;
    } else {
        // 单机模式：根据 turnOrder 计算
        currentPlayer = gameState.turnOrder[gameState.currentTurn];
        gameState.currentPlayer = currentPlayer;
    }
    
    // 更新回合显示
    document.getElementById('current-player').textContent = getPlayerName(currentPlayer);
    document.getElementById('current-player').className = `turn-player player${currentPlayer}`;
    
    // 在线模式使用 round，单机模式计算回合数
    const roundNum = onlineMode ? gameState.round : (Math.floor(gameState.currentTurn / 2) + 1);
    document.getElementById('round-number').textContent = roundNum;
    
    // 更新阶段提示
    const terms = getTerms();
    const phaseText = gameState.selectionPhase === 'draw' ? terms.phaseDrawTeam : terms.phasePickPlayer;
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
                <span class="position-label">${getPositionNames()[position]}</span>
                <span class="player-name">${player.name}</span>
                <span class="cost-badge cost-${player.cost}" style="width:30px;height:30px;font-size:0.9rem;">${player.cost}</span>
            `;
        } else {
            slot.classList.remove('filled');
            slot.innerHTML = `
                <span class="position-label">${getPositionNames()[position]}</span>
                <span class="player-name empty">${getTerms().emptySlot}</span>
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
    
    // 在线模式下检查是否轮到自己（统一转换为数字比较）
    if (onlineMode && myPlayerNum && gameState.currentPlayer != parseInt(myPlayerNum)) {
        showToast('还没轮到你操作', 'warning');
        return;
    }
    
    // 检查队伍是否已被使用
    const usedTeams = new Set([
        ...gameState.players[1].usedTeams,
        ...gameState.players[2].usedTeams
    ]);
    
    if (usedTeams.has(teamId)) {
        showToast(getTerms().teamUsed);
        return;
    }
    
    // 在线模式：通过 WebSocket 发送
    if (onlineMode && socket) {
        socket.emit('select_team', {
            room_id: roomId,
            player_num: myPlayerNum,
            team_code: teamId
        });
        return;
    }
    
    // 单机模式：本地处理
    gameState.drawnTeam = teamId;
    gameState.players[gameState.currentPlayer].usedTeams.push(teamId);
    
    // 切换到选球员阶段
    gameState.selectionPhase = 'pick';
    
    // 渲染队伍球员
    renderTeamPlayers(teamId);
    
    updateUI();
    showToast(`${getPlayerName(gameState.currentPlayer)} 选择了 ${team.name} ${getTerms().teamSelected}`);
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
        showToast(getTerms().noTeamsAvailable);
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
        showToast(getTerms().playerUsed);
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
        showToast(getTerms().enterPlayerName);
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
    if (roster[position] !== undefined && roster[position] !== null) {
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
    
    playerNameEl.textContent = getTerms().positionAssignHint.replace('{name}', player.name);
    
    const roster = gameState.players[gameState.currentPlayer].roster;
    
    buttonsContainer.innerHTML = player.positions.map(pos => {
        // 检查位置是否被占用（考虑 undefined 和 null 都是未占用）
        const isOccupied = roster[pos] !== undefined && roster[pos] !== null;
        return `
            <button class="pos-btn" 
                    onclick="assignPosition('${pos}')" 
                    ${isOccupied ? 'disabled' : ''}>
                ${getPositionNames()[pos]}
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
    if (roster[position] !== undefined && roster[position] !== null) {
        showToast('该岗位已有人员');
        return;
    }
    
    // 在线模式：通过 WebSocket 发送
    if (onlineMode && socket) {
        socket.emit('select_player', {
            room_id: roomId,
            player_num: myPlayerNum,
            player_data: player,
            position: position
        });
        
        // 隐藏位置选择器
        document.getElementById('position-selector').classList.add('hidden');
        gameState.pendingPlayer = null;
        return;
    }
    
    // 单机模式：本地处理
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
    
    const terms = getTerms();
    const posLabel = displayMode === 'office' ? '岗位' : '位置';
    showToast(`${getPlayerName(currentPlayerNum)} 分配 ${player.name} 至${getPositionNames()[position]}${posLabel}`);
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
    showToast(`${getPlayerName(gameState.currentPlayer)} ${getTerms().redrawTeamToast}`);
}

// 跳过选人（如果队伍没有合适的球员）
function skipPick() {
    if (gameState.phase !== 'selection' || gameState.selectionPhase !== 'pick') return;
    
    // 在线模式：通过 WebSocket 发送
    if (onlineMode && socket) {
        socket.emit('skip_turn', {
            room_id: roomId,
            player_num: myPlayerNum
        });
        return;
    }
    
    // 单机模式：本地处理
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
                        <span class="position">${getPositionNames()[pos]}</span>
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
    
    // 在线模式：通过 WebSocket 请求，结果会广播给双方
    if (onlineMode && socket && roomId) {
        console.log('[对战] 在线模式：通过 WebSocket 请求对战模拟');
        socket.emit('start_battle', {
            room_id: roomId,
            team1: team1Data,
            team2: team2Data,
            playerNames: gameState.playerNames
        });
        return; // 等待服务器广播结果
    }
    
    // 创建DeepSeek风格的思考过程显示框
    const thinkingEntry = document.createElement('div');
    thinkingEntry.className = 'thinking-box';
    thinkingEntry.innerHTML = `
        <div class="thinking-header" onclick="toggleThinkingBox()" title="点击展开/折叠思考过程">
            <div class="thinking-title">
                <span class="thinking-icon">💭</span>
                <span class="thinking-label">AI思考过程</span>
                <span class="thinking-status" id="thinking-status">思考中...</span>
                <span class="thinking-hint">(点击展开/折叠)</span>
            </div>
            <span class="thinking-toggle" id="thinking-toggle-icon">▼</span>
        </div>
        <div class="thinking-body" id="thinking-body">
            <div class="thinking-content" id="thinking-content">
                <div class="thinking-spinner"></div>
            </div>
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
        let contentText = '';
        let resultData = null;
        let contentStarted = false;
        
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
                            const thinkingContentEl = document.getElementById('thinking-content');
                            if (thinkingContentEl) {
                                // 移除spinner
                                const spinner = thinkingContentEl.querySelector('.thinking-spinner');
                                if (spinner) spinner.remove();
                                
                                // 更新思考内容
                                thinkingContentEl.textContent = reasoningText;
                                
                                // 自动滚动到底部
                                thinkingContentEl.scrollTop = thinkingContentEl.scrollHeight;
                            }
                        } else if (parsed.type === 'content') {
                            // 第一次收到 content 时，创建实时输出框
                            if (!contentStarted) {
                                contentStarted = true;
                                
                                // 更新思考状态为完成
                                const statusEl = document.getElementById('thinking-status');
                                if (statusEl) {
                                    statusEl.textContent = '✓ 思考完成';
                                    statusEl.classList.add('completed');
                                }
                                
                                // 默认折叠思考框
                                const thinkingBody = document.getElementById('thinking-body');
                                const toggleIcon = document.getElementById('thinking-toggle-icon');
                                if (thinkingBody && toggleIcon) {
                                    thinkingBody.classList.add('collapsed');
                                    toggleIcon.textContent = '▶';
                                }
                                
                                // 创建实时输出区域
                                createLiveOutputBox();
                            }
                            
                            // 累积内容并实时显示
                            contentText += parsed.content;
                            const liveOutputEl = document.getElementById('live-output-content');
                            if (liveOutputEl) {
                                liveOutputEl.textContent = contentText;
                                liveOutputEl.scrollTop = liveOutputEl.scrollHeight;
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
        
        // 移除实时输出区域
        const liveOutputBox = document.getElementById('live-output-box');
        if (liveOutputBox) {
            liveOutputBox.remove();
        }
        
        // 显示结果
        if (resultData) {
            displaySeriesResult(resultData, logContent);
            
            const champion = resultData.champion;
            const fmvp = resultData.fmvp;
            showChampion(champion, fmvp);
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
    // 显示球队分析
    if (result.teamAnalysis) {
        const analysisEntry = document.createElement('div');
        analysisEntry.className = 'log-entry team-analysis';
        analysisEntry.innerHTML = `
            <div class="log-game-num">📊 赛前战术分析</div>
            <div class="analysis-content">
                <div class="team-analysis-section">
                    <h4>${getPlayerName(1)} 分析</h4>
                    <div class="analysis-grid">
                        ${result.teamAnalysis.team1 ? `
                            <div class="analysis-item"><span class="label">空间:</span> ${result.teamAnalysis.team1.spacing || '-'}</div>
                            <div class="analysis-item"><span class="label">组织:</span> ${result.teamAnalysis.team1.playmaking || '-'}</div>
                            <div class="analysis-item"><span class="label">进攻:</span> ${result.teamAnalysis.team1.offense || '-'}</div>
                            <div class="analysis-item"><span class="label">防守:</span> ${result.teamAnalysis.team1.defense || '-'}</div>
                            <div class="analysis-item"><span class="label">化学反应:</span> ${result.teamAnalysis.team1.chemistry || '-'}</div>
                            <div class="analysis-item"><span class="label">球星成色:</span> ${result.teamAnalysis.team1.starPower || '-'}</div>
                            <div class="analysis-full"><span class="label">优势:</span> ${result.teamAnalysis.team1.strengths || '-'}</div>
                            <div class="analysis-full"><span class="label">弱点:</span> ${result.teamAnalysis.team1.weaknesses || '-'}</div>
                        ` : ''}
                    </div>
                </div>
                <div class="team-analysis-section">
                    <h4>${getPlayerName(2)} 分析</h4>
                    <div class="analysis-grid">
                        ${result.teamAnalysis.team2 ? `
                            <div class="analysis-item"><span class="label">空间:</span> ${result.teamAnalysis.team2.spacing || '-'}</div>
                            <div class="analysis-item"><span class="label">组织:</span> ${result.teamAnalysis.team2.playmaking || '-'}</div>
                            <div class="analysis-item"><span class="label">进攻:</span> ${result.teamAnalysis.team2.offense || '-'}</div>
                            <div class="analysis-item"><span class="label">防守:</span> ${result.teamAnalysis.team2.defense || '-'}</div>
                            <div class="analysis-item"><span class="label">化学反应:</span> ${result.teamAnalysis.team2.chemistry || '-'}</div>
                            <div class="analysis-item"><span class="label">球星成色:</span> ${result.teamAnalysis.team2.starPower || '-'}</div>
                            <div class="analysis-full"><span class="label">优势:</span> ${result.teamAnalysis.team2.strengths || '-'}</div>
                            <div class="analysis-full"><span class="label">弱点:</span> ${result.teamAnalysis.team2.weaknesses || '-'}</div>
                        ` : ''}
                    </div>
                </div>
                ${result.teamAnalysis.keyMatchups ? `
                <div class="key-matchups">
                    <h4>🔥 关键对位</h4>
                    <p>${result.teamAnalysis.keyMatchups}</p>
                </div>` : ''}
                ${result.teamAnalysis.prediction ? `
                <div class="prediction">
                    <h4>🎯 赛前预测</h4>
                    <p>${result.teamAnalysis.prediction}</p>
                </div>` : ''}
            </div>
        `;
        logContent.appendChild(analysisEntry);
    }
    
    // 显示系列赛开始
    const startEntry = document.createElement('div');
    startEntry.className = 'log-entry series-start';
    startEntry.innerHTML = `
        <div class="log-game-num">📋 系列赛结果</div>
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
            gameEntry.className = `log-entry game-entry-compact player${winner}-win`;
            gameEntry.innerHTML = `
                <div class="game-compact-header">
                    <span class="game-number">G${game.gameNumber}</span>
                    <div class="game-score-line">
                        <span class="team-name">${getPlayerName(1)}</span>
                        <span class="score ${winner === 1 ? 'winner' : ''}">${game.score?.team1 || 0}</span>
                        <span class="vs">:</span>
                        <span class="score ${winner === 2 ? 'winner' : ''}">${game.score?.team2 || 0}</span>
                        <span class="team-name">${getPlayerName(2)}</span>
                    </div>
                    ${game.keyFactor ? `<span class="key-factor-inline">🔑 ${game.keyFactor}</span>` : ''}
                </div>
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
            <div class="log-game-num">★ ${getTerms().bestEmployee}</div>
            <div class="fmvp-content">
                <div class="fmvp-name">${result.fmvp.name}</div>
                ${result.fmvp.avgStats ? `
                <div class="fmvp-stats">
                    场均 ${result.fmvp.avgStats.points || 0}分 ${result.fmvp.avgStats.rebounds || 0}篮板 ${result.fmvp.avgStats.assists || 0}助攻
                </div>` : ''}
                ${result.fmvp.reason ? `
                <div class="fmvp-reason">${result.fmvp.reason}</div>` : ''}
            </div>
        `;
        logContent.appendChild(fmvpEntry);
    }
    
    // 显示总结
    if (result.summary) {
        const summaryEntry = document.createElement('div');
        summaryEntry.className = 'log-entry series-summary';
        summaryEntry.innerHTML = `
            <div class="log-game-num">📝 评估总结</div>
            <div class="summary-text">${result.summary}</div>
        `;
        logContent.appendChild(summaryEntry);
    }
    
    // 不在这里显示冠军，由调用方决定
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

// 格式化思考内容
function formatThinking(text) {
    const maxLength = 500;
    let formatted = text;
    if (formatted.length > maxLength) {
        formatted = '...' + formatted.slice(-maxLength);
    }
    return formatted.replace(/\n/g, '<br>');
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
        championText += `<br><span class="fmvp-badge">${getTerms().bestEmployeeBadge}: ${fmvp.name}</span>`;
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

// 切换思考框的展开/折叠
function toggleThinkingBox() {
    const body = document.getElementById('thinking-body');
    const icon = document.getElementById('thinking-toggle-icon');
    
    if (body && icon) {
        if (body.classList.contains('collapsed')) {
            body.classList.remove('collapsed');
            icon.textContent = '▼';
        } else {
            body.classList.add('collapsed');
            icon.textContent = '▶';
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