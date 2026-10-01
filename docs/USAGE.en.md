# Using AERO

[简体中文](USAGE.md) · **English**

[Product overview](../README.en.md) · [Developer guide](DEVELOPMENT.en.md)

The application interface is currently in Chinese. Chinese control labels are included below to help you find the corresponding settings.

## Install and launch

Currently supported on Windows from source; there is no installer. Prepare Node.js 24 LTS, npm and a signed-in Codex Desktop. Follow the applicable [licensing terms](../LICENSE) when obtaining the source. From the repository root:

```powershell
npm.cmd ci
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
2. Open AERO Settings → Voice (`设置 → 语音`). Use One-click setup (`一键配置`) to install the runtime and English Vosk model, or choose existing Python and model paths. Initial setup requires internet access.
3. Select your microphone, set the phrase to `Hey Codex`, click Check configuration (`检查配置`), then enable Listen (`监听`) and confirm Listening (`监听中`). Device indices may change across computers or system configurations; do not reuse someone else's index. A successful environment check is not proof of a successful spoken wake-up.
4. Say `Hey Codex`. On detection, the listener releases the microphone, sends the hotkey and exits.
5. When Codex Voice ends, click Restart listening (`重新监听`). Automatic resumption is not implemented because there is no reliable session-end signal.

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
