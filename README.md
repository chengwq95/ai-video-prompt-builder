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

## 输入 · Inputs

- 角色:名字、代词(He / She / They)、职业、年龄段、族裔/长相、性格
- 固定造型:发型、眼镜/配饰、服装、工牌/挂绳、鞋子
- 画风:5 个预设(软萌黏土 3D · 皮克斯风 3D · 日系动漫 · 写实电影感 · 扁平插画)+ 可编辑的画风描述和「风格锁定要点」
- 场景:地点简称、场景描述、窗户/光线方向
- 5 个镜头 S01–S05:景别、镜头运动、一个主要动作、旁白
- 画面比例:16:9 / 9:16 / 1:1

## 输出 · Outputs(随输入实时更新,每张卡片可一键复制)

1. **角色主图**:风格 → 人物 → 造型 → 姿势与背景 → 规则,五段按颜色区分
2. **近景肖像(可选)**:特写时用来锁脸
3. **空背景**:无人、无文字、无 logo
4. **分镜脚本表**:镜头 / 时长 / 景别 / 镜头运动 / 动作 / 旁白,可复制为 TSV 直接贴进 Excel / Google 表格
5. **每个镜头的静帧提示词**:用「在已通过的图上修改」的写法,附带风格锁定句,并标明这一镜要上传哪张参考图
6. **每个镜头的图生视频提示词**:镜头 + 一个动作 + 锁定 + 规则,结尾固定为 "One continuous shot, calm pacing, no cuts. He never looks at the camera."

另有:载入示例、重置、导出全部提示词、出片小贴士、中文 / EN 界面切换;输入自动保存在浏览器里(localStorage),刷新不会丢。

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
