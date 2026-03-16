# 旺旺 (WangWang) - AI Workflow Canvas

> ⚠️ **Development Status**: This project is currently under active development (WIP). Features and APIs may change frequently.

## 简介 (Introduction)

旺旺是一个基于 React Flow 的可视化 AI 工作流编排平台。它允许用户通过拖拽节点（文本、图片等）来构建复杂的创意工作流，并集成了 AI 模型（如 DeepSeek、OpenAI）进行内容生成。

## 核心功能 (Core Features)

- **可视化画布**: 基于 React Flow 的无限画布，支持节点拖拽、缩放、连线。
- **多类型节点**:
  - 📝 **文本节点**: 支持 AI 文本生成、联网搜索（模拟）、Markdown 渲染。
  - 🖼️ **图片节点**: 支持图片上传、旋转、缩放、预览。
- **交互体验**:
  - 双击空白处/连线拖拽创建新组件。
  - 节点自定义工具栏（旋转、缩放等）。
  - 深色模式 UI 设计。
- **API 集成**: 支持配置 OpenAI 兼容接口（如 DeepSeek），自定义模型参数。

## 技术栈 (Tech Stack)

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, React Flow (@xyflow/react)
- **Backend**: Express.js (轻量级后端，用于代理 API 请求和项目存储)
- **Icons**: Lucide React

## 快速开始 (Getting Started)

1.  **安装依赖**:
    ```bash
    npm install
    ```

2.  **启动开发服务器**:
    ```bash
    # 同时启动前端和后端
    npm run dev
    ```

3.  **访问应用**:
    打开浏览器访问 `http://localhost:5173`

## 项目结构 (Project Structure)

```
src/
├── components/
│   ├── nodes/          # 自定义节点组件 (TextNode, ImageNode)
│   └── ...
├── pages/
│   ├── Canvas.tsx      # 主画布页面
│   ├── Settings.tsx    # 设置页面
│   └── ...
├── api/                # 后端路由 (Express)
└── ...
```

## 待办事项 (Todo)

- [ ] 完善更多节点类型（剧本、分镜、视频）。
- [ ] 增强后端存储能力（目前为内存/文件存储）。
- [ ] 优化移动端适配。
- [ ] 添加更多 AI 模型支持。

---

*Created with ❤️ by Trae AI Pair Programmer*
