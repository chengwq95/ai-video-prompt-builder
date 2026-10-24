# AI 视频提示词生成器 · AI Video Prompt Builder

一个纯前端的单页工具,配合「AI 短视频制作教程」使用:填一次角色和 5 个分镜,自动生成做短视频每一步要用的**英文**提示词,一键复制到 Magnific(原 Freepik)、Grok、Kling、Veo、Runway、Higgsfield、ChatGPT、Gemini 等工具。

A single-page tool that goes with the AI short-video tutorial: fill in your character and five shots once, and get copy-ready **English** prompts for every step.

**在线使用 / Live:** `https://chengwq95.github.io/ai-video-prompt-builder/`(开启 GitHub Pages 后可用 / once Pages is enabled)

姊妹工具 / Sister tool: [图片提示词实验室 Prompt Lab](https://chengwq95.github.io/prompt-lab/)

---

## 制作流程 · Workflow

```
故事 → 角色设定 → 风格 + 角色主图 → 分镜脚本 → 静帧 → 图生视频 → 剪映剪辑
Story → Character sheet → Style + master image → Director script → Stills → Image-to-video → CapCut edit
```

## 功能 · Features

- **新手友好**:首页「三步上手」+ 1 分钟**新手引导**(高亮逐步讲解,手机上是底部卡片),顶栏「Guide」随时再看
- **6 个示例**(下拉选择,全部虚构):交易监控分析师、教长辈用手机银行、识破诈骗电话、上班第一天、下班前清理桌面、节日祝福;覆盖 5 种画风和 3 种画面形状
- **多个项目**:每个视频一个项目,可新建、复制、重命名、删除;选示例会作为新项目打开,不会覆盖你的内容
- **镜头数量可调**:1–12 个镜头,可增删、上移
- **按工具调整写法**:通用 / Magnific / Grok / ChatGPT / Gemini / Kling / Veo / Runway / Higgsfield
  - 聊天式工具(Grok、ChatGPT、Gemini)用请求句,并用文字写明画面形状
  - Kling、Runway、Higgsfield 的视频提示词更精简;Kling 额外给出反向提示词
  - 会生成声音的工具(Veo、Grok、Gemini)要求只保留安静环境声,旁白之后在剪映里配
- **进度追踪**:每段提示词可「标记完成」,进度条显示下一步并一键跳转
- 顶栏切换 **EN / 中文**(默认英文)和 **Morning / Night** 日夜主题(默认跟随系统)
- 所有内容自动保存在浏览器里(localStorage),刷新不会丢

## 输出 · Outputs

1. **角色主图**:风格 → 人物 → 造型 → 姿势与背景 → 规则,五段按颜色区分
2. **近景肖像(可选)**:特写时用来锁脸
3. **空背景**:无人、无文字、无 logo
4. **分镜脚本表**:可复制为 TSV 直接贴进 Excel / Google 表格
5. **每个镜头的静帧提示词**:「在已通过的图上修改」的写法 + 风格锁定句,并标明要上传哪张参考图
6. **每个镜头的图生视频提示词**:镜头 + 一个动作 + 锁定 + 规则,结尾固定为 "One continuous shot, calm pacing, no cuts. He never looks at the camera."

## 提示词里已经写进去的经验

- 上传的图决定输出的画面比例,所以主图、背景都按视频比例生成
- 「保持一切完全不变,只改一两处」比「换个新角度」更稳
- 特写容易变写实,特写镜头会自动再强调一遍画风
- 角色爱看镜头,每段视频提示词都写明 never looks at the camera
- 动作越简单越好(「点按钮」会变成戳屏幕),页面会提示

⚠️ 只用虚构数据:不要填真实客户姓名、账号、金额或系统截图。

## 使用方法

无需安装、无需构建,单文件 HTML,双击 `index.html` 或用浏览器打开即可,手机上也能用。

## 部署到 GitHub Pages

1. 仓库 Settings → Pages
2. Source 选择 `main` 分支、`/ (root)` 目录
3. 保存后等 1–2 分钟,即可通过 `https://chengwq95.github.io/ai-video-prompt-builder/` 访问
