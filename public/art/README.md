# 美术资源目录

把图片直接丢进这个文件夹，按下面命名约定，前端会自动加载。
缺图时自动回退到「药名首字书法字」占位，不会显示裂图。

## 命名约定

### 药卡立绘
`<herbKey>.<ext>`（.png / .jpg / .jpeg / .webp 均可，前端按此顺序自动尝试，找到即用）

herbKey 见 `src/data/herbs.ts` 的键名，例如：
- `mahuang.png`   → 麻黄立绘
- `guizhi.png`    → 桂枝
- `gancao.png`    → 甘草
- `huangqin.png`   → 黄芩
- `chaihu.png`    → 柴胡
- …（共 18 味，键名见 herbs.ts）

### BOSS 病证肖像
`boss-<id>.<ext>`

id 见 BOSS 卡的 `id` 字段。例如教学关 `boss-fenghan_biaoshi.png`。
AI 生成的今日 BOSS 的 id 不固定，可后补。

## 建议规格

- 药卡立绘：竖向，比例约 3:4，至少 400×533 px（卡牌显示区会被裁切到 art 区）
- BOSS 肖像：方形，至少 200×200 px（圆形裁切）
- 画风：中式二次元 / 三国杀工笔水墨风格，统一为佳

## 技术说明（给开发者）

- Vite 会把 `public/` 下的文件原样拷到 `dist/` 根，访问路径 `/art/<name>.<ext>`。
- `<ArtImg>` 组件（`src/client/Game.tsx`）按 png→jpg→jpeg→webp 顺序尝试；全失败则隐藏 `<img>`，露出下层「药名首字书法字」占位，不会显示裂图。
- 放图无需改代码：把任意上述格式的图丢进 `public/art/` 即可。
- 后端 Hono `serveStatic` 已托管 `dist/`，prod 自动可用。

## 页面美术接口清单（交付给美术）

下面这些资源位已经在前端接好。每个资源都可以只提供 `.png`，也可以使用 `.jpg` / `.jpeg` / `.webp`；没有图片时会保留文字占位。

| 文件名 | 插入位置 | 建议画面 |
|---|---|---|
| `board-bg.webp` | 全屏棋盘背景（可选，后续接入） | 深色药局木桌、边缘留暗角，中心给战场留空 |
| `boss-fenghan_biaoshi.png` | 教学关 BOSS 圆形肖像 | 风寒束表的病邪拟人像：青灰风、白雾、紧束经脉 |
| `boss-<动态id>.png` | 今日病证 BOSS 圆形肖像 | 对应医案的病机意象，主体脸部/胸像居中 |
| `<herbKey>.png` | 药牌上半部立绘、战场槽位 | 单味中药拟人或药材特写，竖构图，主体居中 |

药牌目前使用的 `herbKey`：`mahuang`、`guizhi`、`xingren`、`gancao`、`jinyinhua`、`lianqiao`、`bohe`、`ganjiang`、`fuzi`、`danggui`、`maidong`、`chenpi`、`chuanxiong`、`fuling`、`chaihu`、`huangqin`、`renshen`、`laifuzi`、`haizao`。建议所有药牌采用同一套边框和光照方向，图片本身不要绘制文字，名称、功效、药力由 UI 叠加。

尺寸建议：药牌 400×533 px（3:4）；BOSS 头像 512×512 px；背景 1920×1080 px。透明 PNG 最适合药材立绘。药牌安全区为画面中央 80%，四角会被卡框裁切。
