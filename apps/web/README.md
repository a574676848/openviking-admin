# OpenViking Admin Web

企业级私域 AI 知识管理平台前端，基于 Next.js 16 (App Router) 构建。

## 技术栈

- **框架**: Next.js 16 + React 19
- **样式**: Tailwind CSS 4 + Framer Motion
- **图标**: Lucide React (strokeWidth: 1.5)
- **图表**: react-force-graph-2d (知识图谱可视化)
- **通知**: Sonner (Toast)
- **字体**: Geist, Geist Mono, Space Grotesk

## 路由体系

```
app/
├── page.tsx              # 首页 (根据角色自动重定向)
├── login/page.tsx        # 登录页 (含 SSO 入口 + VikingWatcher)
├── error.tsx             # 错误边界
├── loading.tsx           # 加载状态
├── not-found.tsx         # 404
│
├── platform/             # 超管平台 (Starry 浩瀚星空)
│   ├── layout.tsx        # 侧边栏 (7 菜单项, 角色守卫，放行 /platform/login)
│   ├── dashboard/        # 平台总览 (Bento Grid)
│   ├── tenants/          # 租户管理
│   ├── users/            # 全局用户
│   ├── system/           # 全局系统监控
│   ├── audit/            # 全局审计日志
│   ├── settings/         # 平台设置
│   ├── analytics/        # 全局数据分析
│   └── login/            # 平台登录页
│
├── console/              # 租户工作台 (星智流光)
│   ├── layout.tsx        # 侧边栏 (12 菜单项)
│   ├── dashboard/        # 租户工作台 (ScrambleNumber 特效)
│   ├── knowledge-bases/  # 知识库管理
│   ├── knowledge-bases/new/
│   ├── knowledge-tree/   # 图谱知识树
│   ├── documents/        # 文档处理中心
│   ├── documents/import/ # 文档导入
│   ├── documents/reindex/
│   ├── search/           # 智能检索分析
│   ├── analysis/         # 无答案洞察
│   ├── qa/               # 沙盒问答调试
│   ├── users/            # 租户内用户
│   ├── webdav/           # WebDAV 配置
│   ├── audit/            # 租户审计
│   ├── system/           # 系统状态
│   ├── mcp/              # MCP 智能助手
│   ├── integrations/     # 集成配置
│   └── graph/            # 知识图谱可视化
```

## 角色路由逻辑

- `super_admin` → `/platform/dashboard`
- `平台超管登录入口` → `/platform/login`
- 其他角色 → `/console/dashboard`
- 未登录 → `/login`

## 核心组件

| 组件 | 路径 | 功能 |
|------|------|------|
| `AppProvider` | `components/app-provider.tsx` | 全局状态 (user, theme, login/logout) |
| `VikingWatcher` | `components/watcher.tsx` | 登录页"守望者"眼睛组件 (跟随鼠标/追踪粒子/密码闭眼) |
| `MeteorShower` | `components/ui/meteor-shower.tsx` | “浩瀚星空”主题专属背景流星特效 |
| `DataWisps` | `components/ui/data-wisps.tsx` | “星智流光”主题专属背景数据萤火虫生态特效 |
| `ThemeSwitcher` | `components/theme-switcher.tsx` | 主题切换 (neo-brutalism / starry) |
| `DataTable` | `components/ui/DataTable.tsx` | 通用数据表格 |
| `FormModal` | `components/ui/FormModal.tsx` | 表单弹窗 |
| `ScrambleText` | `components/ui/ScrambleText.tsx` | 文字乱码解码特效 |
| `TerminalOverlay` | `components/ui/TerminalOverlay.tsx` | 终端彩蛋覆盖层 |
| `ConfirmProvider` | `components/ui/ConfirmProvider.tsx` | 确认对话框 |

## API 代理

`next.config.ts` 配置了 `/api/:path*` → `http://localhost:6001` 的 rewrite 代理，前端无需直接调用后端地址。

## 快速开始

```bash
# 安装依赖 (在项目根目录)
pnpm install

# 配置环境
# 编辑 .env.local
# BACKEND_URL=http://localhost:6001
# NEXT_PUBLIC_APP_NAME=OpenViking Admin

# 启动开发服务
pnpm dev
```

服务默认运行在 `http://localhost:6002`。

## 设计规范

详见 [前端 UI/UX 设计规范](../../docs/DESIGN.md)。

## 详细文档

- [API 参考手册](../../docs/API_REFERENCE.md)
- [SSO 集成指南](../../docs/SSO_INTEGRATION.md)
- [配置参考](../../docs/CONFIGURATION.md)
- [部署指南](../../docs/DEPLOYMENT.md)
