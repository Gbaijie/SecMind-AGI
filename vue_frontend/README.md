# DeepSOC 前端

这是 DeepSOC 智能安全运营中心系统的 Vue 3 前端。当前前端不是模板壳，而是已经完成登录、仪表盘、分析终端和系统设置的可运行 SOC 控制台。

## 已实现页面

- `/login`：登录页，登录后进入主控制台。
- `/dashboard`：安全态势大屏，包含全局拓扑、威胁雷达、日志流入图和类别分布图。
- `/chat`：分析终端，支持会话切换、流式问答、多智能体模式和附件上传。
- `/settings`：系统设置，支持 Provider/模型/API Key 配置与会话导出。

## 主要能力

- Vue Router 路由守卫，未登录时会被拦截到登录页。
- Pinia 状态管理，支持会话、草稿、模型参数和登录态持久化。
- SSE 流式聊天，支持 `think`、`content`、`metadata`、`error`、`done` 事件。
- 多智能体模式，前端可为 RAG / Web / Synthesis 分别指定模型。
- 附件上传，支持 `.txt`、`.docx`、`.xlsx`。
- Markdown 渲染和代码高亮，便于展示安全分析结果。

## 开发脚本

```bash
npm install
npm run dev
npm run build
npm run preview
```

开发服务器默认运行在 `http://localhost:8082`，并将 `/api` 代理到后端 `http://localhost:8081`。

## 代码入口

- 应用入口：`src/main.js`
- 根容器：`src/App.vue`
- 路由：`src/router.js`
- API 封装：`src/api.js`
- 主要页面：`src/views/`
- 主要组件：`src/components/`

## 说明

如果你正在查看仓库根目录的主 README，那里包含完整的前后端说明、接口列表和部署步骤；这个文件只保留前端快速说明，避免重复过长。
