SecMind-AGI——基于多智能体与RAG的智能安全研判系统
SecMind-AGI（智能安全研判系统）是一款面向网络安全日志分析与态势研判场景的轻量化SOC原型系统，基于前后端分离架构构建，整合多智能体协同与RAG检索增强技术，实现安全日志解析、结构化检索、智能研判、态势可视化的全流程闭环，支持远程模型与本地模型双模式部署，兼顾易用性与扩展性。
核心技术架构：
- 后端：Django + django-ninja 构建高效API服务，结合ChromaDB向量库、LlamaIndex检索框架与多厂商LLM路由，实现高可用的智能研判能力
- 前端：Vue 3 + Pinia + Naive UI 构建现代化交互界面，搭配ECharts数据可视化与Three.js拓扑渲染，打造沉浸式安全态势管控体验
当前版本已完成全链路功能闭环，支持登录鉴权、流式智能问答、会话管理、多格式附件解析、结构化情报检索、多智能体协同研判、态势看板展示与情报查询导出，默认采用SiliconFlow远程服务提供模型能力，同时保留本地Ollama模型部署选项，可根据实际需求灵活切换。
一、项目定位
本项目聚焦网络安全运营场景的智能化升级，核心定位是打造一款“轻量化、可落地、高可解释”的智能安全研判原型系统，核心价值在于实现“数据接入-智能检索-协同研判-态势展示-导出复盘”的全流程软件工程闭环，而非单一算法验证，可用于安全运营场景落地、技术学习与相关赛事演示。
三大核心层面：
1. 数据层：统一JSONL格式情报数据接入，实现结构化字段沉淀与标准化管理，支持多格式文件解析与知识库导入
2. 能力层：融合向量检索、规则匹配、多LLM厂商路由与多智能体协同技术，提升安全研判的准确性与效率
3. 交互层：设计流式终端、可解释研判过程、态势看板下钻与可配置运维入口，降低安全运营人员的使用成本
二、核心功能模块
2.1 后端核心能力
- 鉴权与会话：支持API Key登录认证，默认密码为secret，会话上下文基于SQLite持久化，支持历史读取、清空与会话重命名
- 流式交互：提供SSE流式聊天接口，支持单模型（single）与多智能体（multi_agent）两种交互模式，响应迅速且支持实时反馈
- 文件解析：通过/api/upload_file接口支持多格式附件解析，涵盖.txt/.md/.log/.json/.jsonl等12种常用格式，满足安全日志与情报导入需求
- 检索能力：集成TopKLogSystem本地知识库检索与博查Web Search API联网检索，支持本地与远程两种embedding模式，可在系统设置页灵活切换
- 模型路由：已实现Ollama、OpenAI、DeepSeek、Minimax、SiliconFlow等多厂商模型路由，适配不同部署场景需求
- 错误处理：支持OpenAI-compatible错误结构化透传，包含provider、model、status_code等关键信息，便于问题排查
- 系统监控：提供/api/health进程存活检查与/api/ready组件就绪检查，支持运行时配置回填与双链路连通性测试
2.2 检索与证据链体系
基于Ollama Embeddings + ChromaDB + LlamaIndex构建高性能检索系统，默认初始化参数如下：
- 生成模型：deepseek-ai/DeepSeek-V3.2（SiliconFlow远程服务）
- 嵌入模型：Qwen/Qwen3-Embedding-8B（SiliconFlow远程服务）
检索核心特性：
- JSON/JSONL结构化加载：将search_content字段作为向量输入，关键结构化字段写入metadata，提升检索精准度
- 多阶段检索流程：意图信号提取→精确召回（如CVE、IP等）→向量召回→关键词融合重排→分组聚合→证据链输出
- 标准化返回结构：包含group_key、group_type、member_count、entity_summary、evidence_chain，实现研判过程可解释
2.3 前端交互功能
- 路由与权限：设计/login、/dashboard、/chat、/intel、/settings五大核心路由，未登录状态自动跳转至登录页，保障系统安全
- 全局布局：采用侧边导航+顶部态势栏+主内容区的经典布局，适配不同屏幕尺寸，操作便捷
- 研判终端：支持会话创建、切换、搜索、重命名、删除与清空，实现流式消息展示、附件上传与多智能体过程可视化
- 消息操作：支持消息复制、最近一条用户消息编辑重问、最后一轮回复重新生成，提升交互灵活性
- 态势看板：集成拓扑图、威胁雷达、日志流入、分类分布四大图表，支持全屏展示（含降级方案）、节点搜索、风险分级过滤与下钻跳转
- 系统设置：支持模型Provider、模型、Embedding模式配置，提供双链路连通性测试（显示时延）、会话HTML导出与退出登录二次确认
- 状态持久化：通过Pinia+localStorage保存登录态、会话草稿、模型配置等信息，提升使用体验
2.4 情报查询与导出
情报查询页（IntelQuery）采用Data Grid + Master-Detail主从分析布局，核心功能包括：
- 多条件筛选：支持关键词、类型、风险等级、来源、时间范围等多维度筛选，支持排序字段与排序方向自定义
- 高效交互：支持分页、详情异步加载、请求取消与字段高亮，提升查询效率
- 灵活导出：支持CSV/JSON双格式导出，可选择导出范围（all/current_page）、字段筛选与是否包含详情，支持文件名前缀自定义
- 链路联动：支持将查询结果一键发送至研判终端，复用会话链路，实现研判闭环
2.5 工程化特色功能
后端优化：流式接口兼容ASGI/WSGI双上下文，避免事件循环阻塞；文件上传增加ZIP结构校验，防止压缩炸弹；本地模型不可用时自动降级至远程服务，提升系统可用性；会话历史协议转义，避免解析异常。
检索优化：支持意图信号精准提取，精确命中结果强制高分排序；融合多维度因子进行结果重排，支持松弛召回二次检索，提升召回鲁棒性；远程与本地embedding模式共用一套融合策略，保证结果口径一致。
前端优化：流式渲染采用批量刷帧策略，减少页面抖动；路由守卫实现登录态同步与配置自动回填；全局错误统一处理，图表全屏支持降级方案，提升系统兼容性与用户体验。
三、架构设计
系统采用分层架构设计，清晰划分各模块职责，确保可扩展性与可维护性，架构流程如下：
Browser (Vue 3 安全研判控制台)
  -> Django Ninja API (/api/*)
    -> APIKey鉴权 + 会话管理 (SQLite)
    -> TopKLogSystem 检索引擎
      -> ChromaDB 向量存储 (./data/vector_stores)
      -> data/log JSONL 知识库
    -> 可选Web检索 (博查API)
    -> LLM Provider 路由
      -> Ollama (本地部署)
      -> OpenAI-compatible 远程服务
    -> 多智能体编排器 (RAG内部证据 + WEB外部情报 → 汇总研判)
说明：代码层已完整支持多厂商模型路由，当前默认部署口径为SiliconFlow的deepseek-ai/DeepSeek-V3.2，其余厂商选项作为兼容扩展入口保留，可根据实际需求配置启用。
四、技术栈详解
4.1 后端技术栈（requirements.txt）
- 核心框架：Django 5.2.7、django-ninja 1.4.4
- 跨域支持：django-cors-headers 4.9.0
- 向量库与检索：ChromaDB 1.2.0、LlamaIndex 0.14.5
- LLM相关：LangChain 0.3.25、langchain-ollama 0.3.8、OpenAI 1.109.1
- 工具类：requests 2.32.5、pandas 2.2.3、python-docx 1.2.0、PyPDF2 3.0.1
4.2 前端技术栈（package.json）
- 核心框架：Vue 3.5.18、Pinia 3.0.3、Vue Router 4.5.1
- UI组件：Naive UI 2.44.1
- 数据可视化：ECharts 6.0.0、Three.js 0.183.2
- 工具类：Axios 1.11.0、@vueuse/core 14.2.1、marked 16.4.1、highlight.js 11.11.1
- 构建工具：Vite 7.1.12
五、快速部署指南（Linux系统，零基础友好）
5.1 基础依赖安装（Ubuntu/Debian）
打开终端，执行以下命令安装基础依赖：
sudo apt update
sudo apt install -y curl git build-essential ca-certificates
sudo apt install -y python3 python3-venv python3-pip
检查Python版本（建议3.12及以上）：
python3 --version
5.2 Node.js安装（推荐nvm方式）
安装nvm版本管理工具：
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
使nvm生效（或重新打开终端）：
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
安装Node.js 20（兼容18+版本）并切换使用：
nvm install 20
nvm use 20
检查Node与npm版本：
node -v
npm -v
5.3 项目代码获取
克隆自己仓库中的项目代码（替换为你的仓库地址）：
git clone https://github.com/Gbaijie/sec-mind-agi.git
cd sec-mind-agi
5.4 后端环境配置（二选一）
方法一：本地创建Python虚拟环境（推荐零基础）
进入后端目录，创建并激活虚拟环境，安装依赖：
cd django_backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
初始化数据库并启动后端：
python manage.py migrate
python manage.py runserver
启动成功提示：Starting development server at http://127.0.0.1:8081/（默认端口8081，可通过DJANGO_PORT环境变量修改）。
方法二：使用conda-pack压缩包（已有环境包）
# 1. 创建解压目录
mkdir -p ~/sec-mind-agi-env
# 2. 解压环境包（替换archive.tar.gz为实际文件名）
tar -xzf ~/packages/archive.tar.gz -C ~/sec-mind-agi-env
# 3. 激活环境
source ~/sec-mind-agi-env/bin/activate
# 4. 修复环境路径（首次使用）
~/sec-mind-agi-env/bin/conda-unpack
# 5. 启动后端
python manage.py migrate
python manage.py runserver
5.5 前端启动
重新打开一个终端（不关闭后端），进入前端目录启动服务：
cd sec-mind-agi/vue_frontend
npm install
npm run dev
前端默认访问地址：http://localhost:8082（已配置代理，/api请求自动转发至后端8081端口）。
5.6 可选：本地模型部署（Ollama）
若需启用本地向量检索与模型能力，安装Ollama并下载对应模型：
# 安装Ollama
curl -fsSL https://ollama.com/install.sh | sh
# 下载所需模型
ollama pull deepseek-r1:7b
ollama pull qwen3-embedding:4b
5.7 环境变量配置（可选）
在django_backend目录下创建.env文件，可配置以下常用变量（默认值已优化，按需修改）：
- AUTH_PASSWORD：登录密码，默认secret
- DJANGO_PORT：后端端口，默认8081
- SILICONFLOW_API_KEY、BOCHA_API_KEY：服务端默认密钥，可自动回填至前端
- REMOTE_RETRIEVAL_ENABLE_RELAXED：是否启用松弛召回，默认关闭
- QUERY_RECORD_CACHE_REFRESH_SECONDS：缓存刷新窗口，默认30秒
5.8 首次登录与配置
1. 浏览器访问http://localhost:8082，输入自定义用户名与默认密码secret登录
2. 进入系统设置页，完成基础配置：
        
  - Provider选择siliconflow，Model选择DeepSeek-V3.2
  - Embedding模式选择siliconflow，Embedding模型选择Qwen/Qwen3-Embedding-8B
  - 填入SiliconFlow API Key与博查Web Search API Key
5.9 系统自检（推荐）
执行以下命令，检查后端服务状态：
curl http://localhost:8081/api/health
curl http://localhost:8081/api/ready
