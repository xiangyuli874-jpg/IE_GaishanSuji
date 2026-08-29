# 改善快记（Kaizen Quick Log）

一个面向生产现场的改善记录应用：现场人员可快速记录改善事项、补充前后照片，并自动整理改善表述；管理人员可筛选、维护台账并导出 Excel 清单。应用在真实手机浏览器中以全屏页面呈现，在宽屏设备中同时提供电脑端台账与移动端录入面板。

## 主要功能

- 按线体记录改善事项，支持 A/B/C/D/E/H 线、部装与底座线
- 自动匹配改善类型：LOB、线体布局、MCP、POU、品质改善及其他
- 将现场原始描述整理为规范的改善内容与改善效果
- 支持拍照或上传改善前、改善后照片
- 自动保存草稿与本地改善记录（浏览器 LocalStorage）
- 移动端查看和筛选记录，桌面端查看台账
- 已保存记录可编辑并更新原记录，不会创建重复条目
- 删除记录前要求确认，避免误删
- 按线体或筛选结果导出包含照片的 Excel 改善清单
- 可选接入 AI 服务：通过 `VITE_AI_ENDPOINT` 配置接口

## 技术栈

- React 19 + TypeScript + Vite
- ExcelJS（Excel 导出）
- Playwright（运行时测试）

## 本地运行

```bash
npm install
npm run dev
```

运行时完整性检查会在开发和构建前自动执行。单独检查可运行：

```bash
npm run check:runtime
```

## 验证与构建

```bash
npm run test:runtime
npm run build
npm run test:sites
```

构建结果位于 `dist/`，该目录为生成文件，不纳入版本控制。

## Vercel 部署

仓库已配置 Vercel。Vercel 使用以下构建命令，生成可直接部署的静态资源：

```bash
npm run build:vercel
```

本地的 `npm run build` 仍会额外准备 Sites Worker 输出；两种构建方式均会执行 TypeScript 与 Vite 编译。

## 可选 AI 接口

在项目根目录创建未提交的 `.env.local`：

```dotenv
VITE_AI_ENDPOINT=https://your-api.example.com/optimize
```

接口接收 `{ raw, type, line }`，并返回 `{ content, effect }`。未配置时，应用使用本地规则引擎整理内容，无需联网。

## 数据说明

改善记录与草稿仅保存在当前浏览器的 LocalStorage 中。编辑会直接更新对应记录，删除操作不可恢复；清除浏览器站点数据也会移除这些本地记录。导出的 Excel 可用于留档。
