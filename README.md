# “我们的生活” V1.0

只属于两个人的私人生活管理微信小程序（当前阶段：微信小程序 + 微信云开发 CloudBase）。

## 技术栈

- 微信小程序原生 + TypeScript（开发者工具内置编译器）
- 微信云开发：云函数（Node.js + TypeScript 打包部署）+ 云数据库 + 云存储
- 本地工具：Node.js、npm、Git、CloudBase CLI

## 目录结构

```text
apps/miniprogram/          微信开发者工具打开的项目根
  miniprogram/             小程序前端（TS）
  cloudfunctions/          云函数（esbuild 打包为 dist/index.js 后上传）
packages/                  跨端共享代码
  types/                   类型与常量（同步到小程序 lib/shared）
  design-tokens/           设计 Token
scripts/                   环境检查 / 共享代码同步 / 云函数构建
docs/                      环境、架构、数据模型、操作手册
tests/                     跨 Space 安全测试
```

## 快速开始（开发机已具备 Node 24 / npm / Git / CloudBase CLI）

```powershell
npm install            # 安装构建与测试工具（项目根目录）
cd apps/miniprogram
npm install            # 安装小程序 API 类型（编辑器智能提示用）
cd ../..
npm run sync           # 同步共享包到小程序 lib/shared
npm run typecheck      # 类型检查
npm test               # 跨 Space 安全测试
npm run build          # 打包云函数（cloudfunctions/*/dist/index.js）
```

之后用微信开发者工具导入 `apps/miniprogram`，开通云开发，创建集合、设置安全规则、部署云函数。详细步骤见 [docs/04-开发者操作手册.md](docs/04-开发者操作手册.md)。

## 当前状态

- [x] 环境检查（Node / npm / Git / CloudBase CLI）
- [x] 项目骨架与 Git 仓库
- [x] 第一阶段云函数：登录、创建空间、邀请码绑定、空间信息
- [x] 第一阶段小程序页面：登录、创建空间、加入空间、首页
- [x] 跨 Space 安全测试
- [x] 微信开发者工具安装、云开发环境创建
- [x] 集合创建 / 安全规则 / 索引配置（已自动配置并验证）
- [x] 云函数部署与双人绑定验证（真实云环境双账号 E2E）

> 注意：微信小程序不支持“目录式导入”（`lib/shared/types` 会被当作不存在的
> `lib/shared/types.js`）。小程序端导入共享模块必须写完整文件路径，例如
> `../lib/shared/types/index`。

## 隐私承诺

所有私人数据仅允许绑定后的两个微信账号访问；不向第三方同步、不出售、不用于广告、不用于 AI 分析或训练。
