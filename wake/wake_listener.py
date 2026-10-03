# AERO original portions: Copyright (c) 2026 Aeolus. See LICENSE and THIRD_PARTY_NOTICES.md.
"""Offline wake-word sidecar for Aero on Windows.

Vosk and sounddevice stay entirely local.  When the configured phrase is
recognized, the input stream is closed before Ctrl+Shift+V is sent so Codex
Voice can acquire the microphone without racing the listener.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import queue
import re
import sys
import threading
import time
from pathlib import Path
from typing import Any

import sounddevice as sd
from vosk import KaldiRecognizer, Model

VK_CONTROL = 0x11
VK_SHIFT = 0x10
VK_V = 0x56
KEYEVENTF_KEYUP = 0x0002
ERROR_ALREADY_EXISTS = 183
MUTEX_NAME = "Local\\AeroWakeListener"


def emit(event: str, **payload: Any) -> None:
    # ASCII-escaped JSON is stable even when Windows launches the sidecar with
    # a legacy console code page. Electron decodes the JSON back to Unicode.
    print(json.dumps({"event": event, **payload}, ensure_ascii=True), flush=True)


def normalize(text: str) -> str:
    return re.sub(r"[\s\W_]", "", text, flags=re.UNICODE).lower()


def press_codex_voice_hotkey() -> None:
    """Send Aero's displayed Codex Voice hotkey: Ctrl+Shift+V."""
    user32 = ctypes.windll.user32
    for key in (VK_CONTROL, VK_SHIFT, VK_V):
        user32.keybd_event(key, 0, 0, 0)
    for key in (VK_V, VK_SHIFT, VK_CONTROL):
        user32.keybd_event(key, 0, KEYEVENTF_KEYUP, 0)


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        config = json.load(stream)
    for field in ("wakePhrase", "modelPath"):
        if not str(config.get(field, "")).strip():
            raise ValueError(f"config is missing {field}")
    return config


def input_devices() -> list[dict[str, Any]]:
    devices = sd.query_devices()
    host_apis = sd.query_hostapis()
    result: list[dict[str, Any]] = []
    for index, device in enumerate(devices):
        channels = int(device.get("max_input_channels", 0))
        if channels <= 0:
            continue
        host_index = int(device.get("hostapi", -1))
        host_name = "Unknown"
        if 0 <= host_index < len(host_apis):
            host_name = str(host_apis[host_index].get("name", "Unknown"))
        name = str(device.get("name", f"Input {index}"))
        result.append({
            "id": f"{host_name}\u241f{name}",
            "index": index,
            "name": name,
            "hostApi": host_name,
            "channels": channels,
            "defaultSampleRate": int(float(device.get("default_samplerate", 16000))),
        })
    return result


def resolve_input_device(selection: Any, devices: list[dict[str, Any]] | None = None) -> tuple[int | None, dict[str, Any] | None]:
    available = devices if devices is not None else input_devices()
    if selection is None:
        return None, None
    if isinstance(selection, int) or (isinstance(selection, str) and selection.isdigit()):
        index = int(selection)
        match = next((item for item in available if item["index"] == index), None)
        if not match:
            raise ValueError(f"input device {index} is not available")
        return index, match
    if isinstance(selection, dict):
        key = str(selection.get("id", ""))
        if key:
            match = next((item for item in available if item["id"] == key), None)
            if match:
                return int(match["index"]), match
        fallback = selection.get("index")
        if isinstance(fallback, int):
            match = next((item for item in available if item["index"] == fallback), None)
            if match:
                return fallback, match
        label = selection.get("name") or key or fallback
        raise ValueError(f"configured input device is not available: {label}")
    raise ValueError("inputDevice must be null, an index, or a device descriptor")


class SingleInstanceMutex:
    def __init__(self) -> None:
        self.handle: int | None = None
        self.kernel32: Any | None = None

    def __enter__(self) -> "SingleInstanceMutex":
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool
        handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if not handle:
            raise OSError("failed to create wake-listener mutex")
        if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(handle)
            raise RuntimeError("another Aero wake listener is already running")
        self.handle = handle
        self.kernel32 = kernel32
        return self

    def __exit__(self, _type: Any, _value: Any, _traceback: Any) -> None:
        if self.handle and self.kernel32:
            self.kernel32.CloseHandle(self.handle)
            self.handle = None
            self.kernel32 = None


def watch_control_input(stop_event: threading.Event) -> None:
    try:
        for line in sys.stdin:
            if line.strip().lower() == "stop":
                stop_event.set()
                return
    except (OSError, ValueError):
        return


def check_config(config: dict[str, Any]) -> dict[str, Any]:
    model_path = Path(str(config["modelPath"])).expanduser().resolve()
    if not model_path.is_dir():
        raise ValueError(f"model folder does not exist: {model_path}")
    device_index, device = resolve_input_device(config.get("inputDevice"))
    # Loading the model catches incomplete or incompatible folders without
    # opening the microphone.
    Model(str(model_path))
    return {"modelPath": str(model_path), "deviceIndex": device_index, "device": device}


def listen(config: dict[str, Any], *, no_hotkey: bool = False, test_wake: bool = False) -> int:
    phrase_text = str(config["wakePhrase"]).strip()
    phrase = normalize(phrase_text)
    aliases = [normalize(str(item)) for item in config.get("wakePhraseAliases", [])]
    accepted = [item for item in [phrase, *aliases] if item]
    if not accepted:
        raise ValueError("wakePhrase cannot be empty")

    model_path = Path(str(config["modelPath"])).expanduser().resolve()
    if not model_path.is_dir():
        raise ValueError(f"model folder does not exist: {model_path}")
    sample_rate = int(config.get("sampleRate", 16000))
    device_index, device = resolve_input_device(config.get("inputDevice"))
    recognizer = KaldiRecognizer(Model(str(model_path)), sample_rate)
    diagnostic = bool(config.get("diagnosticTranscripts", False))
    audio_queue: queue.Queue[bytes] = queue.Queue(maxsize=16)
    stop_event = threading.Event()
    matched = False

    def callback(indata: Any, _frames: int, _time_info: Any, status: Any) -> None:
        if status:
            emit("audio-status", message=str(status))
        frame = bytes(indata)
        try:
            audio_queue.put_nowait(frame)
        except queue.Full:
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                pass
            audio_queue.put_nowait(frame)

    threading.Thread(target=watch_control_input, args=(stop_event,), daemon=True).start()
    emit("starting", wakePhrase=phrase_text)
    with SingleInstanceMutex():
        with sd.RawInputStream(
            samplerate=sample_rate,
            blocksize=8000,
            device=device_index,
            dtype="int16",
            channels=1,
            callback=callback,
        ):
            emit("ready", wakePhrase=phrase_text, device=device)
            deadline = time.monotonic() + 30 if test_wake else None
            while not stop_event.is_set() and not matched and (deadline is None or time.monotonic() < deadline):
                try:
                    data = audio_queue.get(timeout=0.25)
                except queue.Empty:
                    continue
                if not recognizer.AcceptWaveform(data):
                    continue
                transcript = str(json.loads(recognizer.Result()).get("text", ""))
                heard = normalize(transcript)
                if diagnostic and transcript:
                    emit("recognized", text=transcript)
                matched = any(item in heard for item in accepted)

        # RawInputStream has closed here.  Only now may Codex Voice request the
        # same microphone.
        emit("microphone-released", reason="triggered" if matched else "stopped")
        if test_wake:
            emit("test-complete", matched=matched, cancelled=stop_event.is_set())
            return 0
        if matched:
            emit("triggered", wakePhrase=phrase_text)
            if not no_hotkey:
                press_codex_voice_hotkey()
            emit("hotkey-sent", hotkey="Ctrl+Shift+V", simulated=no_hotkey)
            return 0

    emit("stopped", reason="requested")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Aero local wake listener")
    parser.add_argument("--config", help="Aero wake-listener JSON configuration")
    parser.add_argument("--list-devices-json", action="store_true")
    parser.add_argument("--check", action="store_true", help="validate config and model without opening the microphone")
    parser.add_argument("--simulate-trigger", action="store_true", help="emit the handoff sequence without opening the microphone")
    parser.add_argument("--no-hotkey", action="store_true", help="do not send Ctrl+Shift+V (tests only)")
    parser.add_argument("--test-wake", action="store_true", help="listen for at most 30 seconds; never send a hotkey")
    args = parser.parse_args()

    if args.list_devices_json:
        emit("devices", devices=input_devices())
        return 0
    if not args.config:
        raise ValueError("--config is required")
    config = load_config(Path(args.config).resolve())
    if args.check:
        emit("check-complete", **check_config(config))
        return 0
    if args.simulate_trigger:
        emit("starting", wakePhrase=config["wakePhrase"])
        emit("microphone-released", reason="triggered")
        emit("triggered", wakePhrase=config["wakePhrase"])
        if not (args.no_hotkey or args.test_wake):
            press_codex_voice_hotkey()
        emit("hotkey-sent", hotkey="Ctrl+Shift+V", simulated=args.no_hotkey or args.test_wake)
        return 0
    return listen(config, no_hotkey=args.no_hotkey or args.test_wake, test_wake=args.test_wake)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001 - sidecar must report failures to Electron.
        emit("error", message=str(error), errorType=type(error).__name__)
        raise SystemExit(1)
