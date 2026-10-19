# 我们的生活 · Our Life

> 只属于两个人的私密生活管理系统 —— 微信小程序 + 云开发全栈项目

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-green)](https://mp.weixin.qq.com/)
[![CloudBase](https://img.shields.io/badge/Tencent-CloudBase-orange)](https://cloudbase.net/)
[![Version](https://img.shields.io/badge/version-1.2.0-brightgreen)]()

双人私密生活管理微信小程序，覆盖日历、生理期、节假日、每日菜单、餐厅收藏、纪念日、旅行计划等日常场景。采用前后端分离 + 云函数架构，内置跨空间权限隔离与自动化安全测试。

## 命名规范

| 项 | 规则 | 当前值 |
| --- | --- | --- |
| 官方显示名 | 中文名，简洁有识别度 | 我们的生活 |
| 代码标识 | 小写英文连字符（slug） | our-life |
| 版本号 | 语义化版本 v主.次.修订 | v1.2.0 |
| 产物/备份文件 | 中文名-代码名-版本-日期.zip | 我们的生活-our-life-v1.2.0-2026-08-16.zip |
| 云函数 | 小写英文连字符 | auth-login / restaurant-search / … |
| Git 提交 | conventional commits | feat: / fix: / style: / chore: … |
| 文档 | 两位数字编号 + 中文标题 | docs/00-… ~ docs/16-… |

## 技术栈

- 微信小程序原生 + TypeScript（开发者工具内置编译器）
- 微信云开发：云函数（Node.js + TypeScript 打包部署）+ 云数据库 + 云存储
- 本地工具：Node.js、npm、Git、CloudBase CLI

## 目录结构

```text
apps/miniprogram/          微信开发者工具打开的项目根
  miniprogram/             小程序前端（TS）
  cloudfunctions/          云函数（esbuild 打包为 dist/index.js 后上传）
    _shared/               共享业务逻辑（Service 层 + Repo 数据访问层，未来 APP 复用）
packages/                  跨端共享代码
  types/                   类型与常量（同步到小程序 lib/shared）
  design-tokens/           设计 Token
scripts/                   环境检查 / 共享代码同步 / 云函数构建 / 节假日导入 / 备份
docs/                      环境、架构、数据模型、操作手册
tests/                     跨 Space 安全测试
tsconfig.json              小程序无关代码（packages / tests）类型检查
tsconfig.cloud.json        云函数 + _shared + 云端 E2E 类型检查
```

## 快速开始（开发机已具备 Node 24 / npm / Git / CloudBase CLI）

```powershell
npm install            # 安装构建与测试工具（项目根目录）
cd apps/miniprogram
npm install            # 安装小程序 API 类型（编辑器智能提示用）
cd ../..
npm run sync           # 同步共享包到小程序 lib/shared
npm run typecheck      # 类型检查（前端无关代码 + 云函数）
npm test               # 跨 Space 安全测试
npm run build          # 打包云函数（cloudfunctions/*/dist/index.js）
```

之后用微信开发者工具导入 `apps/miniprogram`，开通云开发，创建集合、设置安全规则、部署云函数。详细步骤见 [docs/04-开发者操作手册.md](docs/04-开发者操作手册.md)。

## 架构分层与未来 APP 扩展

调用链自上而下：页面 → 小程序 Service 层 → API 封装（wx.cloud）→ 云函数薄入口 →
`cloudfunctions/_shared` 共享业务逻辑（SpaceService 等）→ Repo 数据访问层
（CloudRepo 生产 / MemoryRepo 测试）→ 云数据库（客户端不可直连）。

未来开发 iOS / Android APP 时**不需要重写后端**：

1. `packages/types` 与 `packages/design-tokens` 是纯 TS 共享包，APP 可直接以 npm 依赖复用；
2. 业务规则全部在 `cloudfunctions/_shared`，APP 端通过云函数（或 CloudBase HTTP 访问）
   走同一套身份→空间→权限链路，数据库安全规则不变；
3. APP 端只需新写“页面 + Service + API 适配层”三部分，替换 `api/cloud.ts` 的
   wx.cloud 实现即可，业务类型与数据模型零改动。

云端回归可用 `npm run test:e2e`（连接真实云环境，建临时空间并自动清理）。

## 当前状态

- [x] 环境检查（Node / npm / Git / CloudBase CLI）
- [x] 项目骨架与 Git 仓库
- [x] 第一阶段云函数：登录、创建空间、邀请码绑定、空间信息
- [x] 第一阶段小程序页面：登录、创建空间、加入空间、首页
- [x] 跨 Space 安全测试
- [x] 微信开发者工具安装、云开发环境创建
- [x] 集合创建 / 安全规则 / 索引配置（已自动配置并验证）
- [x] 云函数部署与双人绑定验证（真实云环境双账号 E2E）
- [x] 第三阶段：生理期（最近 2 次实际 + 22 天预测 + 1 天休息标记 + 显示开关）
- [x] 第三阶段：2026 官方节假日 / 调休（holiday_calendar 种子数据 + 日历标签）
- [x] 第三阶段：日历视觉（生理期红 / 休息蓝 / 节假日与调休标签 / 首页今日摘要）
- [x] 生理期口径调整：预计开始日 = 最近实际“结束日”+ 22 天，预计持续 7 天
- [x] 节假日年度机制：任意年份官方数据一条命令导入（scripts/import-holidays.cjs），带 source/version 可追溯
- [x] 第四阶段：今日菜单（预选素材库 + 今日上架/下架 + 随机选择 + 🍴 日历联动）
- [x] 第四阶段：14 天自动清理 + 72 小时回收站（恢复/永久删除仅主账号，daily-maintenance 定时任务）
- [x] 第五阶段：漂亮饭（餐厅资料/收藏/上架下架 + 临时行程 + 🍴 日历联动 + 回收站）
- [x] 第五阶段：餐厅搜索（腾讯位置服务 POI，个人开发者免费配额）、菜单 OCR（微信云调用，草稿确认制）、图片上传（压缩 + 临时地址）、“怎么去”（wx.openLocation，不保存位置）

## 漂亮饭外部服务

搜索 / OCR / 图片存储的免费配额与配置步骤见
[docs/07-漂亮饭配置.md](docs/07-漂亮饭配置.md)：个人开发者可免费使用
腾讯位置服务（地点搜索 200 次/日、路线规划 6000 次/日）与微信云调用 OCR（500 次/天）。

## 节假日年度更新

国务院每年（一般 11 月）发布下一年放假安排，只有文字公告、没有公开 API，
因此采用“每年一条命令导入”的方式：整理成 JSON 后运行
`node scripts/import-holidays.cjs holidays-2027.json`，双端立即生效。
详细步骤见 [docs/06-节假日年度更新.md](docs/06-节假日年度更新.md)。

> 注意：微信小程序不支持“目录式导入”（`lib/shared/types` 会被当作不存在的
> `lib/shared/types.js`）。小程序端导入共享模块必须写完整文件路径，例如
> `../lib/shared/types/index`。

## 隐私承诺

所有私人数据仅允许绑定后的两个微信账号访问；不向第三方同步、不出售、不用于广告、不用于 AI 分析或训练。
