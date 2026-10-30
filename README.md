# 肉了个肉

羊了个羊玩法的网页消除小游戏，单个 `index.html`，直接用浏览器打开就能玩。

- 第 1 关：热身关
- 第 2 关：地狱关，每天 0 点更新（关卡池里有 31 关，都经过求解器筛选和验证；用完后循环，循环时会重新映射图案）
- 道具：移出 / 撤回 / 洗牌，各能用一次；满槽后可以复活一次
- 今日通关人数：需要接 Cloudflare D1（见下文）

## 部署到 GitHub Pages

1. 把整个文件夹推到 GitHub 仓库。
2. 进入仓库 Settings → Pages，Source 选 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`。
3. 等一两分钟后，访问 `https://<用户名>.github.io/<仓库名>/`。

`index.html` 已经内置了所有图片和关卡数据，不依赖其他文件；`.nojekyll` 用于让 Pages 原样发布。

## 今日通关人数（Cloudflare D1）

后端代码在 `cloudflare/` 目录，步骤见 `cloudflare/部署说明.txt`。部署完成后，把 `index.html` 开头 `CONFIG` 里的

```js
statsApi: null,
```

改成你的 Worker 地址，例如 `statsApi: 'https://rou-stats.xxx.workers.dev',`。同一台设备每天只计一次通关。

## 可以改的地方（都在 `index.html` 开头的 `CONFIG`）

- `title`：标题
- `tiles`：16 个图案（图片的 data URI，也可以换成图片地址或 emoji）
- `firstIssueDate`：第 1 期的日期
- `statsApi`：通关人数接口

## 目录

```
index.html                 游戏本体
cloudflare/                通关人数接口（Worker + D1）
tools/level-generator/     地狱关卡生成器、求解器和验证脚本（Node.js）
  levels.jsonl             31 关的数据和每关的完整通关路径
  summary.json             难度与验证统计
assets/                    裁剪后的图案和图标原图（游戏里已经内置，这里留作备份）
```

## 生成更多关卡

```bash
cd tools/level-generator
npm install                      # 只有 testgame.js 需要 playwright
node pool.js 1000 1030 new.jsonl # 生成种子 1000~1029，平均约 1 分钟一关
cat new.jsonl >> levels.jsonl
node inject.js                   # 写进 ../../index.html
node testgame.js                 # 在真实页面里按通关路径逐关回放验证
node summarize.js                # 重新统计难度指标
```
