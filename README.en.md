# AERO

[简体中文](README.md) · **English**

### Keep your tasks in sight. Keep your focus yours.

A lightweight desktop companion for Codex Desktop. **By Aeolus.**

[Get started](#get-started) · [User guide](docs/USAGE.en.md) · [Developer guide](docs/DEVELOPMENT.en.md) · [Feedback](https://github.com/AeolusV/AERO/issues) · [License](LICENSE)

![AERO: Keep your tasks in sight](docs/images/aero-promo-hero-en.png)

Stay with your work, without repeatedly switching back to Codex.

Keep designing, writing or exploring your next idea. A lightweight floating bar keeps running tasks, finished work and requests for your attention in view. When you are needed, one click takes you back to the right task.

![AERO full bar](docs/images/aero-full.png)

## Less switching. More focus.

![AERO mini bar](docs/images/aero-promo-mini-en.png)

**Expand when you need control.** Check tasks, choose reasoning effort, or start, continue and interrupt work. Keep everyday actions within reach and hide the rest.

**Collapse when you need focus.** Six task lights. One return button. Drag it where it feels right, or let it settle at a screen edge. Expand again with a click.

<p align="center">
  <img src="docs/images/aero-mini.png" width="360" alt="Six task lights and one return button" />
</p>

Hover for the workspace and task names. Click to return to the conversation. An optional gentle completion sound means you do not have to keep watching the screen.

## Task status at a glance

One light, one state. The same colors mean the same thing in either bar. Choose your own palette to make AERO feel at home on your desktop.

| Status | Default color | Meaning |
| --- | --- | --- |
| Idle | White | No work in progress |
| Thinking | Blue | Codex is working |
| Complete | Green | Ready for you to review |
| Needs input | Yellow | Your reply or approval is needed |
| Error | Pink | Something needs attention |

## Make it yours

Cool white or dark. Soft light, a touch of translucency, and unhurried transitions. AERO stays on your desktop while leaving room for your work.

- Choose light or dark appearances separately for each bar.
- Drag controls into order, keep your favorites and find a comfortable size.
- Pick light colors from presets or enter your own.
- Choose Air, Mint, Sunset or Mono logo colors, a transparent background, or no logo at all.
- Prefer quiet? Turn sounds off. Need more space? Hide AERO to the system tray.

![AERO appearance settings](docs/images/aero-settings.png)

## Everyday controls, within reach

Move between tasks, start a new idea or continue unfinished work. Choose reasoning effort, branch or archive tasks, copy Markdown, or open a working folder or terminal. Everyday actions need not sit behind layers of windows.

You choose the controls and their order. Effort levels follow the model's capabilities; approval controls act only on a specific request currently received.

## Say hello. Start talking.

![AERO local voice wake-up](docs/images/aero-promo-voice-en.png)

Sometimes, saying it feels more natural than typing it.

Enable local wake-up and say **“Hey Codex”** to have AERO call up Codex Voice. Prefer not to listen continuously? Use the voice button on the bar or in the tray menu instead.

Wake-word recognition stays on your computer. It uploads no audio, makes no OpenAI API calls and consumes no Codex tokens or cloud voice quota. Codex Voice runs separately and follows its own usage rules and limits.

![AERO voice settings](docs/images/aero-voice.png)

Open Settings → Voice (`设置 → 语音`), use one-click setup, choose your microphone and enable listening. Initial setup requires internet access for downloads; wake-word recognition can then run offline. First bind Voice to `Ctrl+Shift+V` in Codex. AERO will not change that setting for you.

After wake-up, AERO releases the microphone and stops listening so Codex Voice can take over. When the conversation ends, click Restart listening (`重新监听`). Hiding AERO to the tray keeps listening active; turning listening off or exiting stops it. Raw audio and routine transcripts are not saved by default.

[Voice setup guide](docs/USAGE.en.md#optional-local-voice-wake-up)

## Get started

AERO runs on Windows alongside an installed, signed-in Codex Desktop. It is currently available from source, with no installer. Prepare Node.js 24 LTS and npm, and read the [licensing terms](LICENSE) first.

```powershell
git clone https://github.com/AeolusV/AERO.git
Set-Location AERO
npm.cmd ci
npm.cmd run runtime:electron
npm.cmd run build
npm.cmd start
```

Choose an appearance you like and put your favorite controls within reach. Voice wake-up is optional; you do not need it to use the task bar.

[Usage and troubleshooting](docs/USAGE.en.md) · [Developer guide](docs/DEVELOPMENT.en.md)

<details>
<summary>Before you begin</summary>

- AERO is an independent project, not an official OpenAI product. It does not modify the Codex installation.
- The verified Codex Desktop version is `26.928.3736.0`. Codex updates may affect connection or individual features; task status can sometimes refresh with a delay.
- Reasoning choices follow the default model. In some cases, a choice applies only to later submissions rather than changing the current Codex composer.
- Voice requires Codex to support Voice and receive its hotkey. Sending the shortcut does not guarantee Voice has opened.
- Smart-home control is not available.
- This overview and the guides are bilingual; the application interface is currently Chinese.
- Campaign images are AI-assisted visuals; interface screenshots show demonstration tasks. The application is the reference for actual appearance and behavior.

Have a question or found a problem? Share it in [Issues](https://github.com/AeolusV/AERO/issues), including your versions and what happened. Do not include credentials, private conversations or sensitive logs.

</details>

## By Aeolus

Copyright © 2026 Aeolus.

AERO is source available with author authorization required, not permissively licensed open source. Copying, distributing or modifying original content requires prior, explicit written permission from Aeolus, except for acts already authorized by law or the hosting platform. Attribution is not a substitute for permission.

[Request authorization](https://github.com/AeolusV/AERO/discussions) · [LICENSE](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
