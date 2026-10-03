from unittest.mock import patch
from contextlib import nullcontext

import wake_listener


def test_normalize() -> None:
    assert wake_listener.normalize("Hey, Codex!") == "heycodex"


def test_hotkey_order() -> None:
    calls: list[tuple[int, int]] = []

    class FakeUser32:
        def keybd_event(self, key: int, _scan: int, flags: int, _extra: int) -> None:
            calls.append((key, flags))

    class FakeWindll:
        user32 = FakeUser32()

    with patch.object(wake_listener.ctypes, "windll", FakeWindll(), create=True):
        wake_listener.press_codex_voice_hotkey()

    assert calls == [
        (wake_listener.VK_CONTROL, 0),
        (wake_listener.VK_SHIFT, 0),
        (wake_listener.VK_V, 0),
        (wake_listener.VK_V, wake_listener.KEYEVENTF_KEYUP),
        (wake_listener.VK_SHIFT, wake_listener.KEYEVENTF_KEYUP),
        (wake_listener.VK_CONTROL, wake_listener.KEYEVENTF_KEYUP),
    ]


def test_resolve_device_prefers_stable_id() -> None:
    devices = [
        {"id": "WASAPI␟Realtek Array", "index": 4, "name": "Realtek Array"},
        {"id": "MME␟Realtek Array", "index": 1, "name": "Realtek Array"},
    ]
    index, device = wake_listener.resolve_input_device(
        {"id": "WASAPI␟Realtek Array", "index": 1}, devices
    )
    assert index == 4
    assert device == devices[0]


def test_wake_test_never_sends_hotkey() -> None:
    events = []

    class Recognizer:
        def AcceptWaveform(self, _data):
            return True

        def Result(self):
            return '{"text":"hey codex"}'

    class Stream:
        def __init__(self, **kwargs):
            self.callback = kwargs["callback"]

        def __enter__(self):
            self.callback(b"mock audio", 1, None, None)
            return self

        def __exit__(self, *_args):
            return False

    class Thread:
        def __init__(self, **_kwargs):
            pass

        def start(self):
            pass

    config = {"wakePhrase": "Hey Codex", "modelPath": ".", "inputDevice": None}
    with patch.object(wake_listener, "Model"), \
        patch.object(wake_listener, "KaldiRecognizer", return_value=Recognizer()), \
        patch.object(wake_listener, "resolve_input_device", return_value=(0, {"name": "fixture"})), \
        patch.object(wake_listener.sd, "RawInputStream", Stream), \
        patch.object(wake_listener, "SingleInstanceMutex", return_value=nullcontext()), \
        patch.object(wake_listener.threading, "Thread", Thread), \
        patch.object(wake_listener, "emit", side_effect=lambda name, **data: events.append((name, data))), \
        patch.object(wake_listener, "press_codex_voice_hotkey") as hotkey:
        assert wake_listener.listen(config, test_wake=True) == 0
        hotkey.assert_not_called()
        assert events[-2][0] == "microphone-released"
        assert events[-1] == ("test-complete", {"matched": True, "cancelled": False})
        events.clear()
        with patch.object(wake_listener.time, "monotonic", side_effect=[0, 31]):
            assert wake_listener.listen(config, test_wake=True) == 0
        hotkey.assert_not_called()
        assert events[-1][1]["matched"] is False


if __name__ == "__main__":
    test_normalize()
    test_hotkey_order()
    test_resolve_device_prefers_stable_id()
    test_wake_test_never_sends_hotkey()
    print("TESTS_OK")
