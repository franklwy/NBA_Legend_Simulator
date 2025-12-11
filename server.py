# ========================================
# NBA历史球星模拟对战 - 后端服务器
# 使用 DeepSeek V3.2 思考模式进行智能对战模拟
# ========================================

import os
import sys
import json
import httpx
import re
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from openai import OpenAI

# 确保日志立即输出（禁用缓冲）
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

# 获取当前脚本所在目录
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder='.')
CORS(app)

# DeepSeek API 配置（不要在代码中硬编码密钥）
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# 创建不使用代理的HTTP客户端
http_client = httpx.Client(
    timeout=httpx.Timeout(300.0, connect=60.0),
    proxy=None,  # 禁用代理
    trust_env=False,  # 不读取系统代理设置
)

# 初始化 OpenAI 客户端 (绕过系统代理)
client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
    http_client=http_client,
    max_retries=3  # 自动重试3次
)

# 静态文件服务
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

# 模拟整个系列赛（简化版 - 直接输出结果和统计）
@app.route('/api/simulate-series', methods=['POST'])
def simulate_series():
    """模拟整个BO7系列赛 - 简化版，直接输出结果"""
    try:
        data = request.json
        team1 = data.get('team1', {})
        team2 = data.get('team2', {})
        player_names = data.get('playerNames', {'1': 'A组', '2': 'B组'})
        
        # 构建简化版系列赛提示词
        prompt = build_simple_series_prompt(team1, team2, player_names)
        
        # 系统提示词
        system_prompt = """你是一位顶级NBA战术分析师和数据专家，拥有深厚的篮球战术理解和历史知识。你需要模拟NBA总决赛BO7系列赛。

【⚠️ 核心规则 - 严格按赛季状态模拟】
球员名称格式为"XX赛季的XX球员"，必须严格按照该赛季该球队的真实状态模拟！

🔴 **同一球员不同赛季差异巨大，必须区分：**
- 火箭大梦(1994) vs 猛龙大梦(2001)：巅峰统治力 vs 职业末期角色球员
- 热火詹姆斯(2013) vs 湖人詹姆斯(2023)：巅峰身体素质 vs 老年智慧型打法
- 公牛乔丹(1996) vs 奇才乔丹(2002)：历史最佳 vs 退役复出
- 湖人科比(2006) vs 湖人科比(2015)：得分王 vs 跟腱断裂后
- 马刺邓肯(2003) vs 马刺邓肯(2015)：攻防一体 vs 防守蓝领

📊 **模拟时必须考虑该赛季的：**
- 球员年龄和身体状态（爆发力、速度、耐久性）
- 在球队的角色定位（核心/二当家/角色球员）
- 该赛季的真实数据表现（得分、效率、出场时间）
- 伤病影响（大伤后的球员能力会明显下降）
- 球队体系中的战术地位

【🏀 球队战术体系分析维度】
你必须从以下维度深入分析双方球队，并据此模拟比赛：

1. **空间与投射**
   - 场上球员的三分/中投威胁如何？能否拉开空间？
   - 是否有多个投射点？还是空间拥挤？
   - 内线球员是否有投射能力？会不会堵塞禁区？

2. **组织与传球**
   - 谁是主要组织者？组织能力如何？
   - 传球视野和失误控制
   - 是否有多个持球点？还是过度依赖单一组织者？

3. **进攻火力**
   - 得分手段是否多样？（突破、中投、三分、背身）
   - 进攻效率和终结能力
   - 关键时刻的得分能力（clutch能力）

4. **防守体系**
   - 个人防守能力：护框、外线防守、协防意识
   - 是否有防守漏洞？错位会被针对吗？
   - 篮板球控制能力

5. **球权分配与化学反应**
   - 核心球员是谁？球权如何分配？
   - 多个球星是否能共存？会不会球权冲突？
   - 球员打法是否兼容？是否互补？

6. **球星成色与赛季状态**
   - 该赛季球员处于什么阶段？（巅峰/上升期/下滑期/末期）
   - 球员的历史地位和荣誉
   - 季后赛/总决赛大赛经验
   - 领袖气质和关键球能力
   - ⚠️ 注意：同一球员不同赛季实力可能天差地别！

【🎯 模拟原则】
1. 阵容搭配合理的球队有优势（空间+组织+防守平衡）
2. 球星扎堆但不兼容的阵容会有问题（球权冲突、空间拥挤）
3. 有明显防守漏洞的球队会被针对
4. 系列赛要有起伏，体现真实的竞技对抗
5. 考虑主场优势（1、2、5、7场为team1主场）

【🏆 FMVP评选标准】
- 必须来自冠军球队
- 综合考虑：场均数据、关键比赛表现、对胜利的贡献度
- 不一定是数据最好的球员，而是对夺冠贡献最大的球员

【重要】你必须严格按照JSON格式返回结果。"""
        
        def generate():
            try:
                # 首先发送完整的提示词
                yield f"data: {json.dumps({'type': 'prompt', 'systemPrompt': system_prompt, 'userPrompt': prompt}, ensure_ascii=False)}\n\n"
                
                response = client.chat.completions.create(
                    model="deepseek-reasoner",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    stream=True
                )
                
                reasoning_content = ""
                final_content = ""
                
                for chunk in response:
                    delta = chunk.choices[0].delta
                    if delta.reasoning_content:
                        reasoning_content += delta.reasoning_content
                        yield f"data: {json.dumps({'type': 'reasoning', 'content': delta.reasoning_content}, ensure_ascii=False)}\n\n"
                    elif delta.content:
                        final_content += delta.content
                        yield f"data: {json.dumps({'type': 'content', 'content': delta.content}, ensure_ascii=False)}\n\n"
                
                # 发送最终结果
                result = extract_json(final_content)
                yield f"data: {json.dumps({'type': 'result', 'data': result}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)}, ensure_ascii=False)}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


def build_simple_series_prompt(team1, team2, player_names):
    """构建简化版系列赛的提示词 - 只要结果和统计"""
    p1_name = player_names.get('1', 'A组')
    p2_name = player_names.get('2', 'B组')
    
    team1_desc = format_team(team1, p1_name)
    team2_desc = format_team(team2, p2_name)
    team1_players = format_player_list(team1)
    team2_players = format_player_list(team2)
    
    return f"""请模拟NBA总决赛BO7系列赛，进行深度战术分析后给出结果。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【{p1_name}阵容】
{team1_desc}

【{p2_name}阵容】
{team2_desc}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【请先分析以下维度，再模拟比赛】

📊 **空间分析**：各队有几个可靠的投射点？内线是否会堵塞空间？

🎯 **组织分析**：谁是主要组织者？是否有足够的传球和控球能力？

⚔️ **进攻火力**：得分手段是否多样？关键时刻谁来终结？

🛡️ **防守体系**：各位置防守能力如何？是否有明显漏洞会被针对？

🤝 **化学反应**：球星之间是否兼容？球权如何分配？打法是否互补？

⭐ **球星成色与赛季状态**：球员处于巅峰还是末期？该赛季的真实能力如何？

【比赛规则】
- 10名球员全部打满48分钟，无换人
- 第1、2、5、7场为{p1_name}主场，第3、4、6场为{p2_name}主场
- 主场球队有轻微优势
- 系列赛先赢4场者夺冠

【数据要求 - 严格按赛季状态】
⚠️ 同一球员不同赛季能力差异巨大！必须按标注赛季模拟：
- 巅峰赛季球员：高得分、高效率、全面数据
- 新秀/成长期球员：潜力但不稳定，数据有起伏
- 职业末期球员：数据明显下滑，体能受限，但可能有经验优势
- 伤病赛季球员：能力大打折扣

📊 数据规范：
- 每位球员的数据必须符合其标注赛季的历史真实水平
- 巅峰球星得分20-35分，角色球员8-15分
- 五名球员得分之和必须等于球队总得分

请严格按照以下JSON格式返回结果：
{{
    "teamAnalysis": {{
        "team1": {{
            "spacing": "空间评价(优秀/良好/一般/较差)",
            "playmaking": "组织评价", 
            "offense": "进攻评价",
            "defense": "防守评价",
            "chemistry": "化学反应评价",
            "starPower": "球星成色评价",
            "strengths": "主要优势",
            "weaknesses": "主要弱点"
        }},
        "team2": {{
            "spacing": "空间评价",
            "playmaking": "组织评价",
            "offense": "进攻评价", 
            "defense": "防守评价",
            "chemistry": "化学反应评价",
            "starPower": "球星成色评价",
            "strengths": "主要优势",
            "weaknesses": "主要弱点"
        }},
        "keyMatchups": "关键对位分析，哪些对位决定比赛走向",
        "prediction": "赛前预测和理由"
    }},
    "champion": 1或2,
    "finalScore": {{"team1Wins": 胜场数, "team2Wins": 胜场数}},
    "games": [
        {{
            "gameNumber": 场次,
            "winner": 1或2,
            "score": {{"team1": 得分, "team2": 得分}},
            "keyFactor": "本场胜负关键因素(30字内)",
            "team1Stats": [
                {{"name": "球员名", "points": 得分, "rebounds": 篮板, "assists": 助攻, "steals": 抢断, "blocks": 盖帽, "fgm": 投篮命中, "fga": 投篮出手, "tpm": 三分命中, "tpa": 三分出手}}
            ],
            "team2Stats": [
                {{"name": "球员名", "points": 得分, "rebounds": 篮板, "assists": 助攻, "steals": 抢断, "blocks": 盖帽, "fgm": 投篮命中, "fga": 投篮出手, "tpm": 三分命中, "tpa": 三分出手}}
            ]
        }}
    ],
    "fmvp": {{
        "name": "总决赛MVP球员名",
        "team": 1或2,
        "avgStats": {{"points": 场均得分, "rebounds": 场均篮板, "assists": 场均助攻}},
        "reason": "获选理由(50字内，说明为何是他而不是其他人)"
    }},
    "summary": "系列赛总结(100字左右)，包含关键转折点和决定性因素"
}}

【{p1_name}球员】：{team1_players}
【{p2_name}球员】：{team2_players}

【⚠️ 数据校验】
1. 每队5名球员的得分之和 = 球队总得分
2. 投篮命中数要合理：fgm ≤ fga，tpm ≤ tpa
3. 得分公式：points = (fgm - tpm) × 2 + tpm × 3 + 罚球得分
4. FMVP必须来自冠军球队"""


def format_team(team, team_name):
    """格式化球队阵容描述 - 简洁格式，让AI客观判断球员实力"""
    positions = {
        'PG': '控球后卫',
        'SG': '得分后卫', 
        'SF': '小前锋',
        'PF': '大前锋',
        'C': '中锋'
    }
    
    lines = []
    
    for pos, pos_name in positions.items():
        player = team.get(pos)
        if player:
            peak_season = player.get('peakSeason', '未知')
            # 只提供球员名字和赛季，让AI根据历史知识客观判断
            lines.append(f"- {pos_name}: {peak_season}赛季的{player['name']} ({player['nameEn']})")
    
    return "\n".join(lines)


def format_player_list(team):
    """格式化球员列表 - 简洁格式"""
    positions = ['PG', 'SG', 'SF', 'PF', 'C']
    players = []
    for pos in positions:
        player = team.get(pos)
        if player:
            peak = player.get('peakSeason', '未知')
            players.append(f"{peak}赛季的{player['name']}")
    return "、".join(players)


def extract_json(text):
    """从文本中提取JSON"""
    import re
    
    # 尝试直接解析
    try:
        return json.loads(text)
    except:
        pass
    
    # 尝试提取JSON块
    json_patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
        r'\{[\s\S]*\}'
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            try:
                return json.loads(match)
            except:
                continue
    
    # 返回默认结果（系列赛格式）
    print("[extract_json] WARNING: 使用默认结果", flush=True)
    return {
        "teamAnalysis": {
            "team1": {"spacing": "未知", "playmaking": "未知", "offense": "未知", "defense": "未知", "chemistry": "未知", "starPower": "未知", "strengths": "未知", "weaknesses": "未知"},
            "team2": {"spacing": "未知", "playmaking": "未知", "offense": "未知", "defense": "未知", "chemistry": "未知", "starPower": "未知", "strengths": "未知", "weaknesses": "未知"},
            "keyMatchups": "未知",
            "prediction": "未知"
        },
        "champion": 1,
        "finalScore": {"team1Wins": 4, "team2Wins": 0},
        "games": [],
        "fmvp": {"name": "未知MVP", "team": 1, "avgStats": {"points": 0, "rebounds": 0, "assists": 0}, "reason": "AI未能生成详细结果"},
        "summary": "AI未能生成详细结果，使用默认数据"
    }


# 健康检查
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "NBA模拟对战服务运行中"})


# ========================================
# 球员管理 API
# ========================================

@app.route('/api/players', methods=['GET', 'POST'])
def manage_players():
    """获取所有球员或添加新球员"""
    if request.method == 'GET':
        # 前端直接使用已加载的 PLAYERS 数据，这个接口仅用于备用
        return jsonify({'success': True, 'message': '请使用前端已加载的 PLAYERS 数据'})
    
    elif request.method == 'POST':
        # 添加新球员
        try:
            data = request.json
            required_fields = ['name', 'nameEn', 'cost', 'positions', 'team', 'peakSeason', 'championships', 'allStar', 'mvp', 'fmvp']
            
            # 验证必填字段
            for field in required_fields:
                if field not in data:
                    return jsonify({'success': False, 'error': f'缺少必填字段: {field}'})
            
            # 读取现有文件
            players_file = os.path.join(SCRIPT_DIR, 'players.js')
            with open(players_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 找到最大ID
            id_pattern = r'id:\s*(\d+)'
            existing_ids = [int(m) for m in re.findall(id_pattern, content)]
            new_id = max(existing_ids) + 1 if existing_ids else 1
            
            # 构造新球员数据
            positions_str = json.dumps(data['positions'])
            new_player = f'''    {{ id: {new_id}, name: "{data['name']}", nameEn: "{data['nameEn']}", cost: {data['cost']}, positions: {positions_str}, team: "{data['team']}", peakSeason: "{data['peakSeason']}", championships: {data['championships']}, allStar: {data['allStar']}, mvp: {data['mvp']}, fmvp: {data['fmvp']} }},'''
            
            # 找到对应球队的位置并插入
            team_markers = {
                "CHI": "// ===== 芝加哥公牛 CHI",
                "LAL": "// ===== 洛杉矶湖人 LAL",
                "BOS": "// ===== 波士顿凯尔特人 BOS",
                "OKC": "// ===== 俄克拉荷马雷霆 OKC",
                "GSW": "// ===== 金州勇士 GSW",
                "HOU": "// ===== 休斯顿火箭 HOU",
                "DAL": "// ===== 达拉斯独行侠 DAL",
                "SAS": "// ===== 圣安东尼奥马刺 SAS",
                "DEN": "// ===== 丹佛掘金 DEN",
                "PHI": "// ===== 费城76人 PHI",
                "MIL": "// ===== 密尔沃基雄鹿 MIL",
                "MIA": "// ===== 迈阿密热火 MIA",
                "CLE": "// ===== 克利夫兰骑士 CLE",
                "PHX": "// ===== 菲尼克斯太阳 PHX",
                "IND": "// ===== 印第安纳步行者 IND",
                "MIN": "// ===== 明尼苏达森林狼 MIN",
                "NYK": "// ===== 纽约尼克斯 NYK",
                "DET": "// ===== 底特律活塞 DET",
                "POR": "// ===== 波特兰开拓者 POR",
                "UTA": "// ===== 犹他爵士 UTA",
                "TOR": "// ===== 多伦多猛龙 TOR",
                "ATL": "// ===== 亚特兰大老鹰 ATL",
                "ORL": "// ===== 奥兰多魔术 ORL",
                "NOP": "// ===== 新奥尔良鹈鹕 NOP",
                "LAC": "// ===== 洛杉矶快船 LAC",
                "SAC": "// ===== 萨克拉门托国王 SAC",
                "WAS": "// ===== 华盛顿奇才 WAS",
                "MEM": "// ===== 孟菲斯灰熊 MEM",
                "CHA": "// ===== 夏洛特黄蜂 CHA",
                "BKN": "// ===== 布鲁克林篮网 BKN",
            }
            
            team = data['team']
            team_marker = team_markers.get(team)
            if not team_marker:
                return jsonify({'success': False, 'error': f'未知球队代码: {team}'})
            
            # 找到球队位置
            start = content.find(team_marker)
            if start == -1:
                return jsonify({'success': False, 'error': f'找不到球队标记: {team}'})
            
            # 找下一个球队标记
            next_team_pos = len(content)
            for other_team, marker in team_markers.items():
                if other_team != team:
                    pos = content.find(marker, start + 1)
                    if pos != -1 and pos < next_team_pos:
                        next_team_pos = pos
            
            # 在该球队最后一个球员后插入
            section = content[start:next_team_pos]
            last_player_end = section.rfind('},')
            if last_player_end != -1:
                insert_pos = start + last_player_end + 2
                content = content[:insert_pos] + '\n' + new_player + content[insert_pos:]
                
                # 写入文件
                with open(players_file, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                return jsonify({'success': True, 'playerId': new_id, 'message': '球员添加成功'})
            
            return jsonify({'success': False, 'error': '找不到插入位置'})
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})


@app.route('/api/players/<int:player_id>', methods=['PUT', 'DELETE'])
def update_player(player_id):
    """修改或删除球员"""
    # 文件路径
    players_file = os.path.join(SCRIPT_DIR, 'players.js')
    
    if request.method == 'PUT':
        # 修改球员信息
        try:
            data = request.json
            
            # 读取现有文件
            with open(players_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 找到该球员的数据
            pattern = rf'\{{\s*id:\s*{player_id},\s*name:\s*"[^"]+",\s*nameEn:\s*"[^"]+",\s*cost:\s*\d+,\s*positions:\s*\[[^\]]*\],\s*team:\s*"[^"]+",\s*peakSeason:\s*"[^"]+",\s*championships:\s*\d+,\s*allStar:\s*\d+,\s*mvp:\s*\d+,\s*fmvp:\s*\d+\s*\}}'
            match = re.search(pattern, content)
            
            if not match:
                return jsonify({'success': False, 'error': f'找不到ID为 {player_id} 的球员'})
            
            old_player = match.group(0)
            
            # 构造新的球员数据（保留原有值或使用新值）
            # 提取原有值
            old_values = {}
            for key in ['name', 'nameEn', 'cost', 'team', 'peakSeason', 'championships', 'allStar', 'mvp', 'fmvp']:
                m = re.search(rf'{key}:\s*"?([^",\}}]+)"?', old_player)
                if m:
                    old_values[key] = m.group(1).strip('"')
            
            # positions 特殊处理
            pos_match = re.search(r'positions:\s*(\[[^\]]*\])', old_player)
            if pos_match:
                old_values['positions'] = pos_match.group(1)
            
            # 合并新旧值
            name = data.get('name', old_values.get('name'))
            nameEn = data.get('nameEn', old_values.get('nameEn'))
            cost = data.get('cost', old_values.get('cost'))
            positions = json.dumps(data.get('positions')) if 'positions' in data else old_values.get('positions')
            team = data.get('team', old_values.get('team'))
            peakSeason = data.get('peakSeason', old_values.get('peakSeason'))
            championships = data.get('championships', old_values.get('championships'))
            allStar = data.get('allStar', old_values.get('allStar'))
            mvp = data.get('mvp', old_values.get('mvp'))
            fmvp = data.get('fmvp', old_values.get('fmvp'))
            
            # 构造新球员数据
            new_player = f'{{ id: {player_id}, name: "{name}", nameEn: "{nameEn}", cost: {cost}, positions: {positions}, team: "{team}", peakSeason: "{peakSeason}", championships: {championships}, allStar: {allStar}, mvp: {mvp}, fmvp: {fmvp} }}'
            
            # 替换
            content = content.replace(old_player, new_player)
            
            # 写入文件
            with open(players_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return jsonify({'success': True, 'message': '球员更新成功'})
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})
    
    elif request.method == 'DELETE':
        # 删除球员
        try:
            # 读取现有文件
            with open(players_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 找到该球员的数据（包括前面的缩进和换行）
            pattern = rf'\s*\{{\s*id:\s*{player_id},[^}}]+\}},?\n?'
            content = re.sub(pattern, '', content)
            
            # 写入文件
            with open(players_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return jsonify({'success': True, 'message': '球员删除成功'})
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    print("=" * 50)
    print("NBA历史球星模拟对战 - 服务器启动")
    print("=" * 50)
    print(f"API Key: {'已配置' if DEEPSEEK_API_KEY != 'your-api-key-here' else '未配置'}")
    print("访问地址: http://localhost:5000")
    print("=" * 50)
    
    app.run(host='0.0.0.0', port=5000, debug=True)

