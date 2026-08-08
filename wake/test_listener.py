from unittest.mock import patch

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


if __name__ == "__main__":
    test_normalize()
    test_hotkey_order()
    test_resolve_device_prefers_stable_id()
    print("TESTS_OK")
