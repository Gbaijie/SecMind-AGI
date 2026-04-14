# DeepSOC 智能安全运营中心系统

DeepSOC 是一个面向网络安全日志分析场景的 SOC（Security Operations Center）原型系统，采用前后端分离架构：

- 后端：Django + django-ninja + ChromaDB + LlamaIndex + Ollama / OpenAI-compatible LLM
- 前端：Vue 3 + Pinia + Naive UI + ECharts + Three.js

当前版本已具备可演示、可迭代的最小可用能力，可支撑比赛场景下的完整链路展示：登录鉴权、流式分析、会话管理、附件解析、结构化检索、多智能体协同、态势看板与拓扑可视化。

---

## 1. 参赛定位

本项目定位于“软件应用与开发赛道”的安全运营原型系统，核心价值不是单点算法，而是完整的软件工程闭环：

1. 数据层：统一 JSONL 情报数据接入，支持结构化字段沉淀。
2. 能力层：向量检索 + 规则融合 + 多模型路由 + 多智能体推理。
3. 交互层：流式终端 + 可解释过程 + 看板下钻 + 配置化运维入口。

---

## 2. 已实现能力总览

### 2.1 后端能力

- API Key 登录认证，默认密码为 `secret`。
- SSE 流式聊天接口，支持单模型与多智能体两种模式。
- 会话上下文持久化（SQLite），支持历史读取与清空。
- 支持“编辑后续回答”和“重新生成最后一轮回复”。
- 文件附件解析：支持 `.txt`、`.docx`、`.xlsx`。
- 本地知识库检索（TopKLogSystem）+ 可选联网检索（博查 Web Search API）。
- 多 provider 模型路由：`ollama`、`openai`、`deepseek`、`minimax`、`siliconflow`。
- OpenAI-compatible 异常结构化透传（provider/model/status_code/error_code/message/request_id）。
- 仪表盘聚合接口直接读取 `django_backend/data/log` 下的 JSONL 数据。

### 2.2 检索与证据链能力

- 向量库技术栈：Ollama Embeddings + ChromaDB + LlamaIndex。
- 支持 JSONL 结构化加载：`search_content` 入向量，关键字段进入 metadata。
- 检索流程：意图信号提取 -> 召回（向量 + 精确特征）-> 重排 -> 分组聚合 -> 证据链输出。
- 返回结果已结构化：`group_key`、`group_type`、`member_count`、`entity_summary`、`evidence_chain`。

### 2.3 前端能力

- 路由与权限：`/login`、`/dashboard`、`/chat`、`/settings`，未登录自动跳转登录页。
- 全局布局：侧边导航 + 顶部态势栏 + 主内容区。
- 分析终端：会话创建/切换/搜索/删除/清空、流式消息、附件输入、多智能体过程展示。
- 消息操作：复制、编辑、重新生成，Markdown + 代码高亮渲染。
- 仪表盘：拓扑图、威胁雷达、日志流入、分类分布、指标动画与全屏下钻。
- 设置页：Provider/模型/API Key 配置、会话 HTML 导出、退出登录。
- 状态持久化：Pinia + localStorage（登录态、会话草稿、模型配置等）。

### 2.4 情报查询页（新增）

- 新增 `IntelQuery` 情报查询页，提供 Data Grid + Master-Detail 主从分析界面。
- 支持关键词、数据类型、风险等级、来源、时间范围、排序字段与排序方向筛选。
- 查询结果区支持横向滚动查看宽表字段，详情区支持独立滚动浏览原始内容。
- 支持一键发送到分析终端，复用现有会话跳转链路进行进一步研判。
- 导出入口已升级为居中悬浮导出面板，可配置导出格式、导出范围、字段选择、是否包含详情以及文件名前缀。

---

## 3. 系统架构（当前实现）

```text
Browser (Vue 3 SOC Console)
  -> Django Ninja API (/api/*)
    -> APIKey/Auth + Session (SQLite)
    -> TopKLogSystem
      -> ChromaDB Vector Store (./data/vector_stores)
      -> data/log JSONL Knowledge Base
    -> Optional Web Search (Bocha API)
    -> LLM Provider Router
      -> Ollama (local)
      -> OpenAI-compatible Providers
    -> Multi-Agent Orchestrator (RAG + WEB -> Synthesis)
```

---

## 4. 后端实现说明

### 4.1 核心接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/login` | POST | 登录并签发 API Key |
| `/api/chat` | POST | 流式问答（SSE），支持单模型/多智能体 |
| `/api/history` | GET | 获取指定会话历史（`session_id`） |
| `/api/history` | DELETE | 清空指定会话历史（`session_id`） |
| `/api/upload_file` | POST | 上传并解析 `.txt/.docx/.xlsx` |
| `/api/dashboard/stats` | GET | 仪表盘聚合数据 |
| `/api/query/logs` | GET | 情报查询列表（支持分页、过滤、排序） |
| `/api/query/logs/{record_id}` | GET | 情报记录详情 |
| `/api/query/facets` | GET | 情报查询分面统计 |
| `/api/query/export` | GET | 情报查询导出（CSV / JSON，可配置字段与范围） |
| `/api/health` | GET | 基础健康检查（进程存活） |
| `/api/ready` | GET | 就绪检查（DB + 向量检索组件） |

### 4.2 认证与会话

- 认证方式：`Authorization: Bearer <api_key>`。
- API Key 与会话均落库在 SQLite。
- 会话上下文采用文本化存储（`用户：...` / `回复：...`），并支持解析为历史消息列表。

### 4.3 检索系统 TopKLogSystem

- 向量库默认路径：`django_backend/data/vector_stores`。
- 数据加载支持：`.txt`、`.md`、`.json`、`.jsonl`、`.csv`、`.log`、`.xml`、`.yaml`、`.yml`、`.docx`、`.pdf`。
- JSON/JSONL 结构化处理：
  - `search_content` 作为向量文本。
  - `_id`、`db_type`、`risk_level`、`cve_id`、`ioc_value`、`source`、`confidence`、`raw_content_hash`、`mitre_attack_id`、`tags` 等进入 metadata。
  - 自动写入 `record_file`、`record_line` 便于追溯。
- 检索结果经过重排和分组后返回，优先按 `cve_id` / `ioc_value` / `raw_content_hash` / `tags` 聚合为证据簇。

### 4.4 多智能体编排

- 编排器并发运行：
  - `VectorAgent`（RAG，内部证据提取）
  - `SearchAgent`（WEB，外部情报提取）
- 汇总阶段：`SynthesisAgent` 消费前置 JSON 报文并输出最终结论。
- 事件流：RAG/WEB 完成后再启动 Synthesis，前端可按 agent 状态可视化展示全过程。

### 4.5 模型与联网检索

- Provider 路由：`ollama`、`openai`、`deepseek`、`minimax`、`siliconflow`。
- OpenAI-compatible 调用失败时返回结构化错误详情。
- 联网检索当前实现使用博查接口（`BOCHA_API_KEY`），不再以 DuckDuckGo 作为主路径。

---

## 5. 前端实现说明

### 5.1 目录分层与组织

前端源码位于 `vue_frontend/src`，当前采用“页面编排 + 领域组件 + 组合式逻辑”组织方式：

- `layouts/`：仅保留 `GlobalLayout.vue` 作为统一应用壳（侧栏、顶部、内容区）。
- `views/`：页面入口层（`Login`、`Dashboard`、`ChatPage`、`IntelQuery`、`Settings`）。
- `components/`：可复用 UI 组件与业务组件（聊天、图表、拓扑、情报子模块、布局片段）。
- `composables/`：业务逻辑抽离（聊天会话流、设置、看板数据、全屏控制、情报查询等）。
- `stores/`：Pinia 状态中心（`auth`、`app`、`chat`）。
- `assets/` 与 `constants/`：全局样式令牌、静态资源与图表色板常量。

### 5.2 路由与导航守卫

- 路由入口：`/login`、`/dashboard`、`/chat`、`/intel`、`/settings`。
- 路由采用按页面懒加载（dynamic import），减少初始包体积。
- 导航守卫逻辑：
  - 访问受保护页面时，若未登录则重定向到 `/login`。
  - 已登录状态访问 `/login` 时自动回跳 `/dashboard`。
- 未匹配路径统一回退到看板入口。

### 5.3 状态管理（Pinia）

- `authStore`：认证凭据与登录态同步（`apiKey`、`isAuthenticated`）。
- `appStore`：应用级 UI 与模型配置状态（加载、错误、检索开关、编辑态、LLM 配置、API Key）。
- `chatStore`：会话列表、消息流、草稿、分析下钻上下文与历史。

本轮重构后的状态管理特征：

- 删除未使用的侧栏状态字段，避免全局状态冗余。
- 收敛 `chatStore` 对外暴露接口，仅保留实际被业务调用的方法。
- 会话草稿与分析下钻上下文继续保持本地持久化。

### 5.4 核心页面与组件机制

- Chat：
  - `ChatPage` 负责会话侧栏与终端编排；`Chat.vue` 负责终端消息渲染与输入交互。
  - 通过 `useChatSession` 统一处理历史加载、流式响应、多智能体状态、编辑重提交流程。
- Dashboard：
  - 拓扑与三张图表均支持全屏、引导提示和分析下钻。
  - 重型组件（拓扑/图表）改为异步组件加载，提升路由首屏加载效率。
- IntelQuery：
  - 统一在 `useIntelQuery` 中处理筛选、分页、详情请求、导出参数编排与取消请求。
- Settings：
  - 配置模型与密钥、连通性探测、会话导出、登出操作。
  - 清理了历史遗留的弹窗状态逻辑，保持页面逻辑单一。

### 5.5 UI 规范与构建运行

- UI 基线：`main.js` 通过 `NConfigProvider` 统一注入 Naive UI 主题覆盖。
- 样式令牌：`src/assets/styles.css` 提供全局设计变量；页面样式优先复用变量，减少硬编码色值。
- 组件脚本：所有 `.vue` 组件采用 `script setup` + Composition API。

前端运行命令：

```bash
cd vue_frontend
npm install
npm run dev
```

构建与预览：

```bash
npm run build
npm run preview
```

---

## 6. 多智能体 SSE 事件约定

### 6.1 多智能体模式

- `agent_chunk`

```json
{"type":"agent_chunk","agent_id":"rag|web|synthesis","content":"..."}
```

- `agent_status`

```json
{"type":"agent_status","agent_id":"...","status":"started|done|error","error":"...","error_detail":{}}
```

- 结束事件

```json
{"type":"done"}
```

### 6.2 单模型模式

- 主要返回 `content` 分片事件。
- 异常时返回 `error` 事件（`message` + 兼容字段 `chunk`，可能携带结构化 `error_detail`）。

---

## 7. 数据资产与目录

当前仓库中，知识数据已统一为 JSONL 文件（非 CSV），核心目录如下：

| 目录 | 说明 |
|---|---|
| `django_backend/data/log/CVE&漏洞情报库/` | CVE 漏洞情报 |
| `django_backend/data/log/IOC 规则样本库/` | IOC 指标样本 |
| `django_backend/data/log/常见Web攻击模式库/` | 常见 Web 攻击模式 |
| `django_backend/data/log/安全处置策略与案例库/` | 处置策略 + 案例（物理目录合并） |

说明：项目逻辑上覆盖“案例库 + 策略库”两类知识，但在当前仓库中合并存放在同一物理目录。

### 7.1 JSONL 统一字段（当前实现）

- 主键与追溯：`_id`、`raw_content_hash`、`source`、`fetched_at`
- 检索语义：`search_content`
- 结构化标签：`db_type`、`risk_level`、`cve_id`、`ioc_value`、`mitre_attack_id`、`tags`
- 质量与可信度：`confidence`、`verified`

---

## 8. 技术栈

### 8.1 后端

- Django 5.2.7
- django-ninja 1.4.4
- django-cors-headers 4.9.0
- chromadb 1.2.0
- llama-index 0.14.5
- langchain-ollama 0.3.8
- openai 1.109.1
- requests 2.32.5

### 8.2 前端

- Vue 3.5.18
- Pinia 3.0.3
- Vue Router 4.5.1
- Naive UI 2.44.1
- Axios 1.11.0
- ECharts 6.0.0
- Three.js 0.183.2
- VueUse 14.2.1
- Marked 16.4.1
- Highlight.js 11.11.1
- Vite 7.1.12

---

## 9. 快速开始

### 9.1 后端

```bash
cd django_backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

说明：默认端口为 `8081`，可通过环境变量 `DJANGO_PORT` 覆盖。

建议启动前加载 `.env`（可复制 `django_backend/.env.example`）：

```bash
cd django_backend
cp .env.example .env
python manage.py runserver
```

健康检查：

```bash
curl http://localhost:8081/api/health
curl http://localhost:8081/api/ready
```

### 9.2 前端

```bash
cd vue_frontend
npm install
npm run dev
```

默认前端地址：`http://localhost:8082`。

前端已配置 Vite 代理：`/api -> http://localhost:8081`。

构建与预览：

```bash
npm run build
npm run preview
```

### 9.3 本地模型准备（Ollama）

```bash
ollama pull deepseek-r1:7b
ollama pull bge-large:latest
```

### 9.4 登录

- 用户名：自定义
- 密码：默认 `secret`（可通过环境变量 `AUTH_PASSWORD` 覆盖）

---

## 10. 环境变量

可选配置如下（也可在前端设置页填写）：

后端提供示例模板：`django_backend/.env.example`

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `CORS_ALLOW_CREDENTIALS`
- `AUTH_PASSWORD`
- `UPLOAD_MAX_BYTES`
- `MAX_OFFICE_UNCOMPRESSED_SIZE`
- `MAX_OFFICE_ARCHIVE_ENTRIES`
- `TOKEN_EXPIRY_SECONDS`
- `RATE_LIMIT_MAX`
- `RATE_LIMIT_INTERVAL`
- `CACHE_MAX_SIZE`
- `CACHE_EXPIRY`
- `SSE_IDLE_TIMEOUT_MS`
- `SSE_MAX_RETRIES`
- `SSE_BUFFER_LIMIT_BYTES`

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `MINIMAX_API_KEY`
- `SILICONFLOW_API_KEY`
- `BOCHA_API_KEY`
- `DJANGO_PORT`

---

## 11. 当前目录结构

```text
.
├── django_backend
│   ├── deepseek_api
│   │   ├── api.py
│   │   ├── services.py
│   │   ├── dashboard_stats.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── agents/
│   ├── deepseek_project
│   ├── data/log
│   │   ├── CVE&漏洞情报库
│   │   ├── IOC 规则样本库
│   │   ├── 常见Web攻击模式库
│   │   └── 安全处置策略与案例库
│   ├── topklogsystem.py
│   └── manage.py
└── vue_frontend
    ├── src
    │   ├── components/
    │   ├── composables/
    │   ├── layouts/
    │   ├── stores/
    │   └── views/
    └── vite.config.js
```

---

## 12. 已知问题与边界

1. Three.js 拓扑与背景粒子动画在低性能设备上可能存在 GPU/CPU 压力。
2. 会话列表当前由前端本地维护，后端未提供“会话列表查询”接口。
3. 看板属于结构化聚合呈现，深度研判能力仍依赖检索质量和模型能力。

---

## 13. 下一步迭代建议

1. 扩充情报数据规模，完善标签与置信度治理。
2. 增加统一事件 Schema（IOC/CVE/节点/边/处置优先级）。
3. 将拓扑从聚合关系升级为攻击链语义图。
4. 增加编排观测能力（trace、耗时、失败率、重试路径）。
5. 持续推进前端性能治理（降采样、节流、按需渲染）。

---

## 14. 答辩可陈述亮点（建议）

可重点强调以下三点工程价值：

1. 不是“单轮问答演示”，而是具备完整状态管理与证据可追溯的软件系统。
2. 不是“文本拼接多模型”，而是具备角色约束与可解释过程的多智能体编排。
3. 不是“静态看板”，而是具备从态势可视化到分析终端的下钻闭环。
