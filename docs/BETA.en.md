# AERO · 0.1.0 Beta 2

[简体中文](BETA.md) · **English**

Keep your tasks in sight. Keep your focus yours.

AERO brings a lightweight floating bar to Codex Desktop on Windows. Expand for everyday controls. Collapse to six quiet task lights while you stay with your work.

## Beta 2: an easier start for voice wake-up

New users no longer inherit prototype paths from a developer's computer. One-click setup downloads an isolated runtime and English model without installing global Python launchers or registering Python in Windows. Settings explain the model name and size; the user guide includes official download links, manual setup and retry instructions.

Test wake-up is new: once the model loads, say the phrase within 30 seconds to check local recognition. Testing sends no hotkey and opens no Codex Voice session. It releases the microphone on completion and can be stopped at any time. Enable normal listening after a passing test.

## What's inside

- Two bar sizes, free dragging, edge snapping and a quick way to switch.
- Consistent task lights, workspace and thread tooltips, and an optional completion sound.
- Light and dark appearances, custom light colors and drag-to-reorder controls.
- Everyday Codex actions and a Windows tray menu.
- Optional local “Hey Codex” wake-up. Listening does not upload audio; on activation it releases the microphone and opens Codex Voice using the keyboard shortcut.

## Get started

Follow the [download guide](DOWNLOADS.en.md) for the Windows x64 portable package. Extract the whole folder and run `AERO.exe`; no installation is needed. Voice wake-up requires a local runtime, model and microphone setup, covered in the [user guide](USAGE.en.md).

## Before you try it

This is an unsigned early beta. Windows may show security warnings; keep system protection enabled. Automated checks cover regression tests, type checks, builds and isolated packaged startup, not acceptance of every real desktop feature.

Real voice wake-up and the full desktop interaction flow are not undergoing human acceptance testing in this round. Codex updates may affect connection or controls. Automatic re-listening after voice ends is not implemented; restart listening in settings when needed. Offline wake-up does not call the OpenAI API; Codex Voice itself remains subject to Codex's usage rules.

Found a problem? Share the AERO and Codex versions, steps, expected result and actual behavior in [Issues](https://github.com/AeolusV/AERO/issues). Do not include secrets, private conversations or raw audio.

By Aeolus. Copying, distributing or modifying original portions requires author permission; see the [license](../LICENSE).
