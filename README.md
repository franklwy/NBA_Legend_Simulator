---
title: NBA Legend Simulator
emoji: 🏀
colorFrom: orange
colorTo: red
sdk: docker
pinned: false
license: mit
---

# 🏀 NBA 历史球星模拟对战 / NBA Legend Simulator

一个基于 Flask + 纯前端的 NBA 球星选人、对战模拟与球员数据管理工具。
使用 DeepSeek V3 Reasoner 进行智能比赛模拟。

## ✨ 主要特性

- **双人选人 + BO7 模拟**：11 分预算，蛇形选人，AI 深度模拟系列赛
- **球员管理悬浮窗**：在"人员配置"里打开/关闭，不影响主界面状态
- **数据永久化**：添加/编辑球员会直接写入 `players.js`
- **成本规则内置**：6/5/4/3/2/1 分体系，选人列表按成本→全明星→ID 排序
- **前后端一体**：Flask 提供保存/更新接口，前端直接调用
- **🆕 双模式切换**：支持办公模式和NBA模式一键切换，方便在办公室使用
- **💭 AI思考过程展示**：对战模拟时显示类似DeepSeek的思考过程，支持折叠/展开，自适应内容大小

## 🎮 球员分数体系

| 分数 | 说明 |
|------|------|
| 6分 | 乔丹、詹姆斯 |
| 5分 | 奥尼尔、邓肯、魔术师 |
| 4分 | 科比、大梦、伯德、拉塞尔、张伯伦、大O、贾巴尔、字母哥、杜兰特、库里、摩西马龙、J博士、杰里·韦斯特、贝勒、诺维斯基、约基奇 |
| 3分 | 剩余 75 大球星 |
| 2分 | 任何进过全明星的球员 |
| 1分 | 从未进过全明星的球员 |

## 🚀 快速开始

### 在 Hugging Face Space 上使用
**重要配置：** 在 Space Settings 中添加环境变量：
- `DEEPSEEK_API_KEY`: 您的 DeepSeek API Key（从 https://platform.deepseek.com/ 获取）

配置完成后，应用会自动部署并可以使用。

### 本地运行

#### 方式一：启动后端（推荐）
```powershell
# 进入项目
cd NBA

# 安装依赖
pip install -r requirements.txt

# 配置 DeepSeek（可选，用于 AI 模拟）
$env:DEEPSEEK_API_KEY = "your-api-key"

# 启动
python server.py
```
然后浏览器访问 `http://localhost:7860`。

#### 方式二：纯前端模式
直接用浏览器打开 `index.html`（无后端持久化；球员管理保存不可用）。

## 🔄 双模式切换

点击顶部导航栏右侧的**切换按钮**，可以在两种显示模式之间切换：

### 办公模式（默认） 💼
- 界面显示为"企业资源管理系统"
- 使用办公术语：绩效分析、部门、岗位、员工等
- 适合在办公室环境使用，更加低调

### NBA模式 🏀
- 界面显示为"NBA历史球星对战"
- 使用篮球术语：球员、球队、位置等
- 完整的NBA游戏体验

**特性：**
- 切换模式会自动更新所有界面文本
- 用户选择会保存到浏览器本地存储，下次打开自动恢复
- 不影响游戏数据和进度

## 🛠️ 球员管理（悬浮窗）
- 顶部导航点击"人员配置"（或"球员管理"）打开悬浮窗，右上角 "×" 关闭，主界面状态不变。
- 可筛选球队、搜索姓名，支持添加/编辑球员。
- 保存后会写入 `players.js`，并自动刷新页面加载最新数据。

## 📁 项目结构
```
NBA/
├── index.html        # 前端页面
├── styles.css        # 样式
├── script.js         # 前端逻辑
├── players.js        # 球员数据库（持久化目标）
├── server.py         # Flask 后端（保存/更新 API）
├── requirements.txt  # Python 依赖
├── start.bat / start.ps1
└── README.md
```

## 🎯 玩法规则
1) 选人阶段：蛇形顺序，11 分预算，5 个位置必须填满（PG/SG/SF/PF/C）。  
2) 对战阶段：AI 根据阵容与荣誉模拟 BO7，先拿 4 胜为冠军。

## 🔧 技术要点
- DeepSeek `deepseek-reasoner` 用于对战模拟（需配置 API Key）
- 保存接口写入同目录 `players.js`（`SCRIPT_DIR` 绝对路径，避免找不到文件）
- 选人列表排序：成本 ↓，全明星次数 ↓，ID ↑

## 📜 许可
MIT License

