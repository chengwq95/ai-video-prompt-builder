# Video Prompt Builder

A single-page tool that goes with the AI short-video tutorial. Fill in your character and shots once, and get copy-ready **English** prompts for every step of making a short AI video — for Magnific (formerly Freepik), Grok, ChatGPT, Gemini, Kling, Veo, Runway, Higgsfield and similar tools.

**Live:** https://ai-video-prompt-builder.pages.dev/

Companion tool: [Image Prompt Builder](https://image-prompt-builder.pages.dev/) — build AI image prompts from four blocks.

---

## Workflow

```
Story → Character sheet → Style + master image → Director script → Stills → Image-to-video → CapCut edit
```

## Features

- **Beginner-friendly**: a 3-step quick start and a 1-minute **guided tour** that highlights each part of the page (a bottom sheet on phones). Reopen it any time from **Guide** in the top bar.
- **Six examples** (all fictional), each opening as a new project: a transaction monitoring analyst, helping a senior with mobile banking, spotting a scam call, a first day at work, a clean desk before going home, and a festive greeting. They cover five art styles and all three video shapes.
- **Multiple projects**: one project per video. Create, duplicate, rename or delete them; opening an example never overwrites your work.
- **Adjustable shots**: 1–12 shots, with add, remove and move-up.
- **Prompts adapted to your tool**: Any tool / Magnific / Grok / ChatGPT / Gemini / Kling / Veo / Runway / Higgsfield
  - Chat tools (Grok, ChatGPT, Gemini) get polite requests, with the video shape spelled out in words.
  - Kling, Runway and Higgsfield get shorter video prompts; Kling also gets a negative prompt.
  - Tools that generate sound (Veo, Grok, Gemini) are asked for quiet room ambience only, so you can add narration later in CapCut.
- **Progress tracking**: mark each prompt as done; the progress bar shows the next step and jumps to it.
- **EN / 中文** interface switch (English by default) and **Morning / Night** themes (follows your system until you choose).
- Everything is saved in your browser (`localStorage`), so a refresh doesn't lose your work.

## Outputs

1. **Character master image** — Style → Who → Look → Pose & background → Rules, color-coded
2. **Close-up portrait (optional)** — a face reference for close-ups
3. **Empty background** — no people, no text, no logos
4. **Director script** — Shot / Length / Shot size / Camera / Action / Voice & sound; copy as TSV to paste into Excel or Google Sheets
5. **Still-image prompt per shot** — the "edit an approved image" pattern plus a style-lock sentence, and which reference image to upload
6. **Image-to-video prompt per shot** — Camera + One action + Lock + Rules, always ending with "One continuous shot, calm pacing, no cuts. He never looks at the camera."

## Lessons built into the prompts

- The uploaded image decides the output shape, so the master image and background are made in the video's ratio.
- "Keep everything exactly the same, except for one or two things" works better than asking for a new angle.
- Close-ups drift toward realism, so close-up prompts restate the art style firmly.
- Characters tend to look at the camera, so every video prompt says they never do.
- Keep actions simple ("click a button" often turns into poking the screen) — the page warns you.

⚠️ Use fictional data only: no real customer names, account numbers, amounts or system screenshots.

## How to use

No install, no build step. It's a single HTML file: open `index.html` in any browser, on desktop or phone.

## Deploy to GitHub Pages

1. Repository **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. Save and wait 1–2 minutes, then open `https://chengwq95.github.io/ai-video-prompt-builder/`

