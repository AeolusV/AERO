# Using AERO

[简体中文](USAGE.md) · **English**

[Product overview](../README.en.md) · [Developer guide](DEVELOPMENT.en.md)

The application interface is currently in Chinese. Chinese control labels are included below to help you find the corresponding settings.

## Install and launch

Currently supported on Windows from source; there is no installer. Prepare Node.js 24 LTS, npm and a signed-in Codex Desktop. Follow the applicable [licensing terms](../LICENSE) when obtaining the source. From the repository root:

```powershell
npm.cmd ci
npm.cmd run runtime:electron
npm.cmd run build
npm.cmd start
```

`start` loads the built interface. Rebuild after source changes. Use `npm.cmd run dev` for development; `preview` is not the desktop application launch command.

## Bars and system tray

- Click a task light to return to its thread; hover for the workspace and thread names.
- Switch between the full and mini bars. The mini bar has six lights and a return button, can be dragged freely and snaps to screen edges.
- Settings control order, visibility, each bar's theme, light colors, brand colors and sounds.
- Closing the bar hides it to the system tray; it does not exit the application. The tray menu can show the window, open voice entry or exit completely.
- Exiting AERO stops the wake listener it manages. Check voice settings to know whether listening is active; hiding the bar does not stop listening.

Default light colors are white / blue / green / yellow / pink for idle / thinking / complete / needs input / error. Status comes from backend metadata and local structured events, not a direct mirror of Desktop's internal state; updates may be delayed.

## Optional: local voice wake-up

1. Explicitly bind Voice to `Ctrl+Shift+V` in Codex Desktop. AERO will not change this setting for you.
2. Open Settings → Voice (`设置 → 语音`) and click Prepare voice (`准备语音`). Existing Python and English model paths can be selected under Advanced settings (`高级设置`). Initial downloads require internet access.
3. Select your microphone, set the phrase to `Hey Codex`, and click Try wake-up (`试试唤醒`). When you see Heard you (`听到了`), enable Listen (`监听`). Device indices may change across computers; choose the microphone you actually use on this computer.
4. Say `Hey Codex`. On detection, the listener releases the microphone, sends the hotkey and exits.
5. When Codex Voice ends, click Restart listening (`重新监听`). Automatic resumption is not implemented because there is no reliable session-end signal.

### First-time setup and wake-word test

No preinstalled Python is needed. One-click setup downloads isolated Python 3.12.10, Vosk 0.3.45, sounddevice 0.5.5 and the English model into `wake-runtime` under AERO's user data directory, outside the source repository. The Python and English model fields show their actual paths. Initial setup needs internet access; subsequent wake recognition runs offline. The model ZIP is about 40 MB; the runtime is downloaded separately.

The model is **vosk-model-small-en-us-0.15**: [official model list](https://alphacephei.com/vosk/models) · [English model download](https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip). ZIP SHA-256: `30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498`.

Select a microphone, turn off listening and end Codex Voice before clicking Try wake-up (`试试唤醒`). Once the model loads, you have 30 seconds to say the phrase. The UI shows Heard you (`听到了`) or Didn't catch that (`没听清`); Pause listening (`暂停聆听`) cancels it. This local try-out sends no hotkey, opens no Voice session, records no raw audio or routine transcripts, and does not automatically enable listening. Configuration checks and diagnostic records are available under Advanced settings (`高级设置`).

A passing test confirms local recognition only, not activation of Codex Voice. Next, confirm `Ctrl+Shift+V` is bound in Codex and enable normal listening. Re-listening after Voice still requires a manual action.

### If one-click setup fails

Check the download status or open records in Advanced settings. Confirm access to GitHub, Python dependency sources and the model URL above, then retry Prepare voice (`准备语音`) or Set up again (`重新配置`). Keep Windows security protection enabled. Existing runtime and complete model files are reused; a model that fails checksum verification is not enabled directly.

For manual setup, install `vosk==0.3.45` and `sounddevice==0.5.5` in your own isolated Python 3.12 environment. Download and extract the official model. Select that environment's `python.exe` and the extracted `vosk-model-small-en-us-0.15` folder in AERO. The model folder should contain `am/final.mdl` and `conf/mfcc.conf`; do not select the ZIP or its parent folder. Select the microphone, check configuration and test wake-up.

Beta 2 has been checked for first-time downloads, checksums, model loading and repeat installation in an isolated directory. Human pronunciation and the full Desktop Voice activation flow remain unaccepted in this round.

If continuous wake-word listening is unnecessary, turn listening off and use the bar's voice button or the tray's voice entry to send the hotkey. Hiding to the tray does not stop an active listener; exiting AERO does.

For manual setup, the Python path must point to an executable with `vosk` and `sounddevice` installed. The model path must point to the extracted English Vosk model folder, not its archive. Check these paths and the log if configuration fails; there is no need to repeatedly start listening or modify global Python installations.

Local wake-word detection uploads no audio and makes no OpenAI API calls. Raw audio and routine transcripts are not recorded by default. Codex Voice is a separate feature, subject to its own connection requirements and usage limits. The voice button only attempts to send the checked hotkey; it does not guarantee Desktop has entered a Voice session.

## Troubleshooting

**The built interface is missing:** run `npm.cmd run build` from the repository root, then `npm.cmd start` after a successful build.

**The development interface fails to load:** confirm `npm.cmd run dev` started successfully and no other service occupies `127.0.0.1:5173`. The default configuration does not silently switch to a different port.

**Cannot connect to Codex:** confirm Desktop is installed, signed in and working. The protocol is experimental and updates may require adaptation. Do not upload login files while troubleshooting.

**Light colors do not update immediately:** local events and thread metadata may refresh with a delay. If status remains inconsistent with the actual task, report versions and reproduction steps. Campaign illustrations are not live status evidence.

**Reasoning effort does not match the composer:** choices follow the default model's capabilities. If Desktop exclusively owns a task, the change may fall back to a default for later submissions rather than updating the current composer.

**Wake-up does nothing:** check the shortcut, microphone, Python and model paths. Inspect status and logs in voice settings. Listener exit after a successful trigger is normal; resume it manually.

## Local data and feedback

Appearance and control preferences are saved in Electron local storage. Window position, voice configuration and logs live in Electron's user-data directory. Open voice logs directly from settings. Deleting the entire user-data directory is not recommended as a troubleshooting step.

In [Issues](https://github.com/AeolusV/AERO/issues), include Windows, Node and Codex Desktop versions, reproduction steps, expected behavior and actual behavior. Redact logs and screenshots first: do not include credentials, login configuration, private threads or personal workspace paths.
