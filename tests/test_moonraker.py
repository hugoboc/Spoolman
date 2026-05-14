from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from spoolman.moonraker import MoonrakerError, set_active_spool


class FakeResponse:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "http://printer.local/server/spoolman/spool_id")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("boom", request=request, response=response)


@pytest.mark.asyncio
async def test_set_active_spool_posts_to_moonraker(monkeypatch):
    calls: list[SimpleNamespace] = []

    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            calls.append(SimpleNamespace(url=url, json=json, headers=headers))
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    await set_active_spool("http://printer.local/", "", 123)

    assert calls[0].url == "http://printer.local/server/spoolman/spool_id"
    assert calls[0].json == {"spool_id": 123}
    assert calls[0].headers == {}


@pytest.mark.asyncio
async def test_set_active_spool_sends_api_key(monkeypatch):
    calls: list[dict[str, str]] = []

    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            assert url == "http://printer.local/server/spoolman/spool_id"
            assert json == {"spool_id": 123}
            calls.append(headers)
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    await set_active_spool("http://printer.local", "secret", 123)

    assert calls[0]["X-Api-Key"] == "secret"


@pytest.mark.asyncio
async def test_set_active_spool_raises_on_failure(monkeypatch):
    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, url: str, json: dict[str, Any], headers: dict[str, str]) -> FakeResponse:
            assert url == "http://printer.local/server/spoolman/spool_id"
            assert json == {"spool_id": 123}
            assert headers == {}
            return FakeResponse(500)

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    with pytest.raises(MoonrakerError, match="500"):
        await set_active_spool("http://printer.local", "", 123)
