# NFC SwitchBot Dry Box Sensors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add latest temperature, humidity, battery, and refresh status from mapped SwitchBot sensors to NFC dry boxes.

**Architecture:** Store SwitchBot credentials in settings, store a SwitchBot device mapping and latest cached reading on each `nfc_box`, and expose backend refresh endpoints. The frontend displays cached values and asks Spoolman to refresh; it never calls SwitchBot directly.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic, Pydantic v2, httpx, pytest/pytest-asyncio, React, TypeScript, Refine, Ant Design.

---

## Task 1: Add SwitchBot Client Helper

**Files:**
- Create: `tests/test_switchbot.py`
- Create: `spoolman/switchbot.py`

**Step 1: Write failing tests for signing, device list, status parsing, and failures**

Create `tests/test_switchbot.py`:

```python
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from spoolman.switchbot import SwitchBotError, SwitchBotSensorStatus, get_device_status, list_devices


class FakeResponse:
    def __init__(self, payload: dict[str, Any], status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://api.switch-bot.com/v1.1/devices")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("boom", request=request, response=response)


@pytest.mark.asyncio
async def test_list_devices_sends_signed_headers(monkeypatch):
    calls: list[SimpleNamespace] = []

    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
            calls.append(SimpleNamespace(url=url, headers=headers))
            return FakeResponse(
                {
                    "statusCode": 100,
                    "body": {
                        "deviceList": [
                            {"deviceId": "abc", "deviceName": "Box 01", "deviceType": "Meter"}
                        ],
                    },
                    "message": "success",
                }
            )

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)
    monkeypatch.setattr("spoolman.switchbot._timestamp_ms", lambda: "1700000000000")
    monkeypatch.setattr("spoolman.switchbot._nonce", lambda: "nonce")

    devices = await list_devices("token", "secret")

    assert devices == [{"deviceId": "abc", "deviceName": "Box 01", "deviceType": "Meter"}]
    assert calls[0].url == "https://api.switch-bot.com/v1.1/devices"
    assert calls[0].headers["Authorization"] == "token"
    assert calls[0].headers["t"] == "1700000000000"
    assert calls[0].headers["nonce"] == "nonce"
    assert calls[0].headers["sign"]


@pytest.mark.asyncio
async def test_get_device_status_parses_meter_status(monkeypatch):
    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
            assert url == "https://api.switch-bot.com/v1.1/devices/abc/status"
            return FakeResponse(
                {
                    "statusCode": 100,
                    "body": {
                        "deviceId": "abc",
                        "deviceType": "Meter",
                        "temperature": 22.4,
                        "humidity": 31,
                        "battery": 87,
                    },
                    "message": "success",
                }
            )

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    status = await get_device_status("token", "secret", "abc")

    assert status == SwitchBotSensorStatus(
        device_id="abc",
        temperature=22.4,
        humidity=31.0,
        battery=87,
    )


@pytest.mark.asyncio
async def test_get_device_status_rejects_missing_sensor_fields(monkeypatch):
    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
            return FakeResponse({"statusCode": 100, "body": {"deviceId": "abc"}, "message": "success"})

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    with pytest.raises(SwitchBotError, match="temperature"):
        await get_device_status("token", "secret", "abc")


@pytest.mark.asyncio
async def test_switchbot_non_success_status_raises(monkeypatch):
    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
            return FakeResponse({"statusCode": 190, "message": "Unauthorized"})

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    with pytest.raises(SwitchBotError, match="Unauthorized"):
        await list_devices("token", "bad-secret")
```

**Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests/test_switchbot.py -q
```

Expected: FAIL because `spoolman.switchbot` does not exist.

**Step 3: Implement the helper**

Create `spoolman/switchbot.py`:

```python
"""Helpers for SwitchBot OpenAPI integration."""

import base64
import hashlib
import hmac
import time
from dataclasses import dataclass
from uuid import uuid4

import httpx


SWITCHBOT_API_BASE_URL = "https://api.switch-bot.com/v1.1"


class SwitchBotError(RuntimeError):
    """Raised when a SwitchBot request or response is invalid."""


@dataclass(frozen=True)
class SwitchBotSensorStatus:
    """Normalized temperature/humidity sensor status."""

    device_id: str
    temperature: float
    humidity: float
    battery: int | None = None


def _timestamp_ms() -> str:
    return str(int(time.time() * 1000))


def _nonce() -> str:
    return str(uuid4())


def _headers(token: str, secret: str) -> dict[str, str]:
    timestamp = _timestamp_ms()
    nonce = _nonce()
    message = f"{token}{timestamp}{nonce}".encode()
    digest = hmac.new(secret.encode(), msg=message, digestmod=hashlib.sha256).digest()
    return {
        "Authorization": token,
        "sign": base64.b64encode(digest).decode(),
        "t": timestamp,
        "nonce": nonce,
        "Content-Type": "application/json",
    }


def _validate_response(payload: dict) -> dict:
    if payload.get("statusCode") != 100:
        raise SwitchBotError(payload.get("message") or "SwitchBot request failed.")
    body = payload.get("body")
    if not isinstance(body, dict):
        raise SwitchBotError("SwitchBot response did not include a body.")
    return body


async def list_devices(token: str, secret: str) -> list[dict]:
    """Return SwitchBot devices available to the account."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{SWITCHBOT_API_BASE_URL}/devices", headers=_headers(token, secret))
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise SwitchBotError(f"SwitchBot returned HTTP {exc.response.status_code}.") from exc
    except httpx.HTTPError as exc:
        raise SwitchBotError(f"SwitchBot request failed: {exc!s}") from exc

    body = _validate_response(response.json())
    devices = body.get("deviceList", [])
    if not isinstance(devices, list):
        raise SwitchBotError("SwitchBot device list was invalid.")
    return devices


async def get_device_status(token: str, secret: str, device_id: str) -> SwitchBotSensorStatus:
    """Return normalized status for one SwitchBot temperature/humidity sensor."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{SWITCHBOT_API_BASE_URL}/devices/{device_id}/status",
                headers=_headers(token, secret),
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise SwitchBotError(f"SwitchBot returned HTTP {exc.response.status_code}.") from exc
    except httpx.HTTPError as exc:
        raise SwitchBotError(f"SwitchBot request failed: {exc!s}") from exc

    body = _validate_response(response.json())
    try:
        temperature = float(body["temperature"])
        humidity = float(body["humidity"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SwitchBotError("SwitchBot status did not include temperature and humidity.") from exc

    battery = body.get("battery")
    return SwitchBotSensorStatus(
        device_id=str(body.get("deviceId") or device_id),
        temperature=temperature,
        humidity=humidity,
        battery=int(battery) if battery is not None else None,
    )
```

**Step 4: Run tests to verify pass**

Run:

```bash
python -m pytest tests/test_switchbot.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/test_switchbot.py spoolman/switchbot.py
git commit -m "feat: add switchbot api helper"
```

## Task 2: Add Settings, Database Fields, and Response Model

**Files:**
- Modify: `spoolman/settings.py`
- Modify: `spoolman/database/models.py`
- Modify: `spoolman/api/v1/models.py`
- Modify: `spoolman/api/v1/nfc_box.py`
- Modify: `spoolman/database/nfc_box.py`
- Create: `migrations/versions/2026_05_16_0001-202605160001_add_nfc_box_sensor_fields.py`
- Test: `tests/test_nfc_box_data.py`
- Test: `tests_integration/tests/setting/test_get.py`
- Test: `tests_integration/tests/nfc_box/test_api.py`

**Step 1: Write failing data/model tests**

Append to `tests/test_nfc_box_data.py`:

```python
@pytest.mark.asyncio
async def test_nfc_box_response_model_includes_sensor_fields(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box Sensor", comment="Shelf A")
    await nfc_box.update(
        db=db_session,
        box_id=box.id,
        data={
            "switchbot_device_id": "dev-1",
            "switchbot_device_name": "Sensor 1",
            "last_temperature": 21.5,
            "last_humidity": 34.0,
            "last_battery": 92,
            "last_sensor_error": "stale",
        },
    )

    response = NfcBoxResponse.from_db(await nfc_box.get_by_id(db_session, box.id))

    assert response.switchbot_device_id == "dev-1"
    assert response.switchbot_device_name == "Sensor 1"
    assert response.last_temperature == 21.5
    assert response.last_humidity == 34.0
    assert response.last_battery == 92
    assert response.last_sensor_error == "stale"
```

Add to `tests_integration/tests/setting/test_get.py` in the NFC/Moonraker defaults test:

```python
"switchbot_token": ('""', "string"),
"switchbot_secret": ('""', "string"),
```

Add to `tests_integration/tests/nfc_box/test_api.py`:

```python
def test_create_and_update_nfc_box_switchbot_mapping():
    """Test creating and updating SwitchBot sensor mapping."""
    box = httpx.post(
        f"{URL}/api/v1/nfc-box",
        json={"name": _box_name("Box Sensor"), "switchbot_device_id": "dev-1"},
    )
    box.raise_for_status()
    body = box.json()

    assert body["switchbot_device_id"] == "dev-1"
    assert "last_temperature" not in body

    result = httpx.patch(
        f"{URL}/api/v1/nfc-box/{body['id']}",
        json={"switchbot_device_id": "dev-2"},
    )
    result.raise_for_status()

    assert result.json()["switchbot_device_id"] == "dev-2"

    httpx.delete(f"{URL}/api/v1/nfc-box/{body['id']}").raise_for_status()
```

**Step 2: Run targeted tests to verify failure**

Run:

```bash
python -m pytest tests/test_nfc_box_data.py::test_nfc_box_response_model_includes_sensor_fields -q
```

Expected: FAIL because the model fields do not exist.

**Step 3: Implement settings and schema fields**

In `spoolman/settings.py`, add:

```python
register_setting("switchbot_token", SettingType.STRING, json.dumps(""))
register_setting("switchbot_secret", SettingType.STRING, json.dumps(""))
```

In `spoolman/database/models.py`, extend `NfcBox`:

```python
switchbot_device_id: Mapped[str | None] = mapped_column(String(128))
switchbot_device_name: Mapped[str | None] = mapped_column(String(128))
last_temperature: Mapped[float | None] = mapped_column()
last_humidity: Mapped[float | None] = mapped_column()
last_battery: Mapped[int | None] = mapped_column(Integer)
last_sensor_refresh: Mapped[datetime | None] = mapped_column()
last_sensor_error: Mapped[str | None] = mapped_column(String(256))
```

Create Alembic migration:

```python
"""Add NFC box sensor fields.

Revision ID: 202605160001
Revises: 202604270001
Create Date: 2026-05-16 00:01:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "202605160001"
down_revision = "202604270001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.add_column("nfc_box", sa.Column("switchbot_device_id", sa.String(length=128), nullable=True))
    op.add_column("nfc_box", sa.Column("switchbot_device_name", sa.String(length=128), nullable=True))
    op.add_column("nfc_box", sa.Column("last_temperature", sa.Float(), nullable=True))
    op.add_column("nfc_box", sa.Column("last_humidity", sa.Float(), nullable=True))
    op.add_column("nfc_box", sa.Column("last_battery", sa.Integer(), nullable=True))
    op.add_column("nfc_box", sa.Column("last_sensor_refresh", sa.DateTime(), nullable=True))
    op.add_column("nfc_box", sa.Column("last_sensor_error", sa.String(length=256), nullable=True))


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_column("nfc_box", "last_sensor_error")
    op.drop_column("nfc_box", "last_sensor_refresh")
    op.drop_column("nfc_box", "last_battery")
    op.drop_column("nfc_box", "last_humidity")
    op.drop_column("nfc_box", "last_temperature")
    op.drop_column("nfc_box", "switchbot_device_name")
    op.drop_column("nfc_box", "switchbot_device_id")
```

Extend `spoolman/api/v1/models.py::NfcBox` and `from_db()`:

```python
switchbot_device_id: str | None = Field(None, description="Mapped SwitchBot device ID.")
switchbot_device_name: str | None = Field(None, description="Cached SwitchBot device name.")
last_temperature: float | None = Field(None, description="Last cached temperature reading.")
last_humidity: float | None = Field(None, description="Last cached humidity reading.")
last_battery: int | None = Field(None, description="Last cached sensor battery percentage.")
last_sensor_refresh: SpoolmanDateTime | None = Field(None, description="When the sensor was last refreshed.")
last_sensor_error: str | None = Field(None, max_length=256, description="Last sensor refresh error.")
```

Set each field from `item` in `from_db()`.

Extend create/update parameter models in `spoolman/api/v1/nfc_box.py`:

```python
switchbot_device_id: str | None = Field(None, max_length=128)
```

Update `spoolman/database/nfc_box.py::create()` to accept and set `switchbot_device_id`.

**Step 4: Run tests**

Run:

```bash
python -m pytest tests/test_nfc_box_data.py tests_integration/tests/setting/test_get.py tests_integration/tests/nfc_box/test_api.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add spoolman/settings.py spoolman/database/models.py spoolman/api/v1/models.py spoolman/api/v1/nfc_box.py spoolman/database/nfc_box.py migrations/versions/2026_05_16_0001-202605160001_add_nfc_box_sensor_fields.py tests/test_nfc_box_data.py tests_integration/tests/setting/test_get.py tests_integration/tests/nfc_box/test_api.py
git commit -m "feat: add nfc box sensor fields"
```

## Task 3: Add Sensor Refresh Data Helpers

**Files:**
- Modify: `spoolman/database/nfc_box.py`
- Test: `tests/test_nfc_box_data.py`

**Step 1: Write failing helper tests**

Append:

```python
@pytest.mark.asyncio
async def test_update_sensor_reading_sets_values_and_clears_error(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box Sensor", comment=None, switchbot_device_id="dev-1")
    box.last_sensor_error = "old error"

    updated = await nfc_box.update_sensor_reading(
        db=db_session,
        box=box,
        temperature=22.2,
        humidity=33.0,
        battery=88,
        device_name="Sensor A",
    )

    assert updated.last_temperature == 22.2
    assert updated.last_humidity == 33.0
    assert updated.last_battery == 88
    assert updated.switchbot_device_name == "Sensor A"
    assert updated.last_sensor_refresh is not None
    assert updated.last_sensor_error is None


@pytest.mark.asyncio
async def test_record_sensor_error_preserves_previous_reading(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box Sensor", comment=None, switchbot_device_id="dev-1")
    await nfc_box.update_sensor_reading(
        db=db_session,
        box=box,
        temperature=22.2,
        humidity=33.0,
        battery=88,
        device_name="Sensor A",
    )

    updated = await nfc_box.record_sensor_error(db=db_session, box=box, error="SwitchBot failed")

    assert updated.last_temperature == 22.2
    assert updated.last_humidity == 33.0
    assert updated.last_battery == 88
    assert updated.last_sensor_error == "SwitchBot failed"
```

**Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests/test_nfc_box_data.py::test_update_sensor_reading_sets_values_and_clears_error tests/test_nfc_box_data.py::test_record_sensor_error_preserves_previous_reading -q
```

Expected: FAIL because helper functions do not exist.

**Step 3: Implement helpers**

Add to `spoolman/database/nfc_box.py`:

```python
async def update_sensor_reading(
    *,
    db: AsyncSession,
    box: models.NfcBox,
    temperature: float,
    humidity: float,
    battery: int | None,
    device_name: str | None = None,
) -> models.NfcBox:
    """Store the latest successful sensor reading for an NFC box."""
    box.last_temperature = temperature
    box.last_humidity = humidity
    box.last_battery = battery
    box.last_sensor_refresh = utcnow()
    box.last_sensor_error = None
    if device_name:
        box.switchbot_device_name = device_name
    await db.commit()
    return box


async def record_sensor_error(*, db: AsyncSession, box: models.NfcBox, error: str) -> models.NfcBox:
    """Store the latest sensor refresh error without clearing previous readings."""
    box.last_sensor_error = error[:256]
    await db.commit()
    return box
```

**Step 4: Run tests**

Run:

```bash
python -m pytest tests/test_nfc_box_data.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add spoolman/database/nfc_box.py tests/test_nfc_box_data.py
git commit -m "feat: cache nfc box sensor readings"
```

## Task 4: Add SwitchBot Settings Reader and Refresh Service

**Files:**
- Create: `spoolman/nfc_sensor.py`
- Test: `tests/test_nfc_sensor.py`

**Step 1: Write failing service tests**

Create `tests/test_nfc_sensor.py`:

```python
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from spoolman import nfc_sensor
from spoolman.database import models, nfc_box, setting
from spoolman.settings import parse_setting
from spoolman.switchbot import SwitchBotError, SwitchBotSensorStatus


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()


async def set_json_setting(db: AsyncSession, key: str, value: str) -> None:
    await setting.update(db=db, definition=parse_setting(key), value=value)


@pytest.mark.asyncio
async def test_refresh_box_sensor_updates_cached_reading(db_session: AsyncSession, monkeypatch):
    await set_json_setting(db_session, "switchbot_token", '"token"')
    await set_json_setting(db_session, "switchbot_secret", '"secret"')
    box = await nfc_box.create(db=db_session, name="Box Sensor", switchbot_device_id="dev-1")

    async def fake_status(token: str, secret: str, device_id: str) -> SwitchBotSensorStatus:
        assert (token, secret, device_id) == ("token", "secret", "dev-1")
        return SwitchBotSensorStatus(device_id="dev-1", temperature=22.0, humidity=35.0, battery=90)

    monkeypatch.setattr("spoolman.nfc_sensor.get_device_status", fake_status)

    updated = await nfc_sensor.refresh_box_sensor(db=db_session, box=box)

    assert updated.last_temperature == 22.0
    assert updated.last_humidity == 35.0
    assert updated.last_battery == 90
    assert updated.last_sensor_error is None


@pytest.mark.asyncio
async def test_refresh_box_sensor_records_switchbot_error(db_session: AsyncSession, monkeypatch):
    await set_json_setting(db_session, "switchbot_token", '"token"')
    await set_json_setting(db_session, "switchbot_secret", '"secret"')
    box = await nfc_box.create(db=db_session, name="Box Sensor", switchbot_device_id="dev-1")

    async def fake_status(token: str, secret: str, device_id: str) -> SwitchBotSensorStatus:
        raise SwitchBotError("boom")

    monkeypatch.setattr("spoolman.nfc_sensor.get_device_status", fake_status)

    with pytest.raises(nfc_sensor.NfcSensorError, match="boom"):
        await nfc_sensor.refresh_box_sensor(db=db_session, box=box)

    assert box.last_sensor_error == "boom"
```

**Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests/test_nfc_sensor.py -q
```

Expected: FAIL because `spoolman.nfc_sensor` does not exist.

**Step 3: Implement service**

Create `spoolman/nfc_sensor.py`:

```python
"""NFC box sensor refresh orchestration."""

import json
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.database import nfc_box, setting
from spoolman.database.models import NfcBox
from spoolman.exceptions import ItemNotFoundError
from spoolman.settings import parse_setting
from spoolman.switchbot import SwitchBotError, get_device_status, list_devices


class NfcSensorError(RuntimeError):
    """Raised when an NFC box sensor refresh cannot complete."""


async def _setting_value(db: AsyncSession, key: str) -> str:
    definition = parse_setting(key)
    try:
        item = await setting.get(db, definition)
        raw_value = item.value
    except ItemNotFoundError:
        raw_value = definition.default
    value = json.loads(raw_value)
    return cast(str, value) if isinstance(value, str) else ""


async def _credentials(db: AsyncSession) -> tuple[str, str]:
    token = await _setting_value(db, "switchbot_token")
    secret = await _setting_value(db, "switchbot_secret")
    if not token or not secret:
        raise NfcSensorError("SwitchBot token and secret are not configured.")
    return token, secret


async def get_switchbot_devices(db: AsyncSession) -> list[dict]:
    """Return devices from SwitchBot using configured credentials."""
    token, secret = await _credentials(db)
    try:
        return await list_devices(token, secret)
    except SwitchBotError as exc:
        raise NfcSensorError(str(exc)) from exc


async def refresh_box_sensor(*, db: AsyncSession, box: NfcBox) -> NfcBox:
    """Refresh and cache one NFC box sensor reading."""
    if not box.switchbot_device_id:
        raise NfcSensorError("No SwitchBot device is mapped to this NFC box.")

    token, secret = await _credentials(db)
    try:
        status = await get_device_status(token, secret, box.switchbot_device_id)
    except SwitchBotError as exc:
        await nfc_box.record_sensor_error(db=db, box=box, error=str(exc))
        raise NfcSensorError(str(exc)) from exc

    return await nfc_box.update_sensor_reading(
        db=db,
        box=box,
        temperature=status.temperature,
        humidity=status.humidity,
        battery=status.battery,
    )
```

**Step 4: Run tests**

Run:

```bash
python -m pytest tests/test_nfc_sensor.py tests/test_switchbot.py tests/test_nfc_box_data.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add spoolman/nfc_sensor.py tests/test_nfc_sensor.py
git commit -m "feat: add nfc sensor refresh service"
```

## Task 5: Add Sensor API Endpoints

**Files:**
- Create: `spoolman/api/v1/switchbot.py`
- Modify: `spoolman/api/v1/router.py`
- Modify: `spoolman/api/v1/nfc_box.py`
- Modify: `spoolman/api/v1/nfc.py`
- Test: `tests_integration/tests/nfc_box/test_scan_actions.py`
- Test: `tests_integration/tests/nfc_box/test_api.py`

**Step 1: Write failing integration tests**

Add tests using monkeypatchable unit coverage where possible. If full integration cannot mock SwitchBot easily, add direct endpoint tests through FastAPI test client if the repository has one; otherwise add unit tests around route functions. Cover:

```python
def test_refresh_nfc_box_without_device_mapping_is_rejected():
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box No Sensor")}).json()

    result = httpx.post(f"{URL}/api/v1/nfc-box/{box['id']}/sensor-refresh")

    assert result.status_code == 400
    assert "switchbot" in result.json()["message"].lower() or "sensor" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
```

Also cover token-based refresh:

```python
def test_refresh_scanned_nfc_box_without_device_mapping_is_rejected():
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Scan No Sensor")}).json()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/sensor-refresh")

    assert result.status_code == 400
    assert "sensor" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
```

**Step 2: Run tests to verify failure**

Run:

```bash
python -m pytest tests_integration/tests/nfc_box/test_api.py tests_integration/tests/nfc_box/test_scan_actions.py -q
```

Expected: FAIL because endpoints do not exist.

**Step 3: Implement routes**

Create `spoolman/api/v1/switchbot.py`:

```python
"""SwitchBot integration endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message
from spoolman.database.database import get_db_session
from spoolman.nfc_sensor import NfcSensorError, get_switchbot_devices

router = APIRouter(prefix="/switchbot", tags=["switchbot"])


@router.get("/devices", responses={400: {"model": Message}, 502: {"model": Message}})
async def devices(db: Annotated[AsyncSession, Depends(get_db_session)]) -> list[dict] | JSONResponse:
    try:
        return await get_switchbot_devices(db)
    except NfcSensorError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
```

Update `spoolman/api/v1/router.py`:

```python
from . import ..., switchbot
...
app.include_router(switchbot.router)
```

Add to `spoolman/api/v1/nfc_box.py`:

```python
from spoolman.nfc_sensor import NfcSensorError, refresh_box_sensor


@router.post("/{box_id}/sensor-refresh", response_model=NfcBox, response_model_exclude_none=True)
async def refresh_sensor(db: Annotated[AsyncSession, Depends(get_db_session)], box_id: int) -> NfcBox | JSONResponse:
    item = await nfc_box.get_by_id(db, box_id)
    try:
        refreshed = await refresh_box_sensor(db=db, box=item)
    except NfcSensorError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    return NfcBox.from_db(refreshed)
```

Add to `spoolman/api/v1/nfc.py`:

```python
from spoolman.nfc_sensor import NfcSensorError, refresh_box_sensor


@router.post("/box/{token}/sensor-refresh", response_model=NfcBox, response_model_exclude_none=True)
async def refresh_box_sensor_by_token(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    token: str,
) -> NfcBox | JSONResponse:
    box = await nfc_box.get_by_token(db, token)
    try:
        refreshed = await refresh_box_sensor(db=db, box=box)
    except NfcSensorError as exc:
        return JSONResponse(status_code=400, content=Message(message=str(exc)).dict())
    return NfcBox.from_db(refreshed)
```

**Step 4: Run tests**

Run:

```bash
python -m pytest tests/test_nfc_sensor.py tests_integration/tests/nfc_box/test_api.py tests_integration/tests/nfc_box/test_scan_actions.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add spoolman/api/v1/switchbot.py spoolman/api/v1/router.py spoolman/api/v1/nfc_box.py spoolman/api/v1/nfc.py tests_integration/tests/nfc_box/test_api.py tests_integration/tests/nfc_box/test_scan_actions.py
git commit -m "feat: add nfc box sensor refresh api"
```

## Task 6: Add Frontend Types and Settings Fields

**Files:**
- Modify: `client/src/pages/nfcBoxes/model.ts`
- Modify: `client/src/pages/settings/generalSettings.tsx`
- Modify: `client/public/locales/en/common.json`

**Step 1: Update TypeScript model**

Extend `INfcBox`:

```ts
switchbot_device_id?: string;
switchbot_device_name?: string;
last_temperature?: number;
last_humidity?: number;
last_battery?: number;
last_sensor_refresh?: string;
last_sensor_error?: string;
```

**Step 2: Add settings fields**

In `generalSettings.tsx`:

- Add `useSetSetting("switchbot_token")`.
- Add `useSetSetting("switchbot_secret")`.
- Populate form initial values from settings.
- Persist changed values in `onFinish`.
- Add `Input.Password` controls for token and secret near the Moonraker fields.

Use this shape:

```tsx
<Form.Item
  label={t("settings.general.switchbot_token.label")}
  tooltip={t("settings.general.switchbot_token.tooltip")}
  name="switchbot_token"
>
  <Input.Password />
</Form.Item>
```

**Step 3: Add English translations**

Add keys under `settings.general`:

```json
"switchbot_token": {
  "label": "SwitchBot token",
  "tooltip": "Open token from SwitchBot developer options."
},
"switchbot_secret": {
  "label": "SwitchBot secret",
  "tooltip": "Secret key used to sign SwitchBot API v1.1 requests."
}
```

**Step 4: Verify TypeScript**

Run:

```bash
cd client
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add client/src/pages/nfcBoxes/model.ts client/src/pages/settings/generalSettings.tsx client/public/locales/en/common.json
git commit -m "feat: add switchbot settings ui"
```

## Task 7: Add NFC Boxes Sensor Display and Refresh Action

**Files:**
- Modify: `client/src/pages/nfcBoxes/index.tsx`
- Modify: `client/public/locales/en/common.json`

**Step 1: Add small format helpers in the page**

Use local helpers near the top:

```ts
function formatTemperature(value?: number): string {
  return value === undefined ? "—" : `${value.toFixed(1)} °C`;
}

function formatHumidity(value?: number): string {
  return value === undefined ? "—" : `${Math.round(value)}%`;
}

function formatBattery(value?: number): string {
  return value === undefined ? "—" : `${value}%`;
}
```

**Step 2: Add refresh state and handler**

```tsx
const [refreshingSensorBoxId, setRefreshingSensorBoxId] = useState<number | null>(null);

const handleRefreshSensor = async (box: INfcBox) => {
  setRefreshingSensorBoxId(box.id);
  try {
    const res = await fetch(`${getAPIURL()}/nfc-box/${box.id}/sensor-refresh`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      await invalidate({ resource: "nfc-box", invalidates: ["list"] });
    } else {
      messageApi.error(body?.message ?? t("nfc_boxes.sensor_refresh_failed"));
    }
  } finally {
    setRefreshingSensorBoxId(null);
  }
};
```

**Step 3: Add table columns and edit/create fields**

Add columns for:

- Sensor device ID/name
- Temperature
- Humidity
- Battery
- Last refresh / error
- Refresh button in actions, disabled if no `switchbot_device_id`

Add `switchbot_device_id` input to create/edit forms:

```tsx
<Form.Item
  label={t("nfc_boxes.fields.switchbot_device_id")}
  name="switchbot_device_id"
  rules={[{ max: 128 }]}
>
  <Input maxLength={128} />
</Form.Item>
```

**Step 4: Add translations**

Add keys:

```json
"sensor_refresh": "Refresh sensor",
"sensor_refresh_failed": "Unable to refresh sensor",
"sensor_not_mapped": "No sensor mapped",
"fields": {
  "switchbot_device_id": "SwitchBot device ID",
  "temperature": "Temperature",
  "humidity": "Humidity",
  "battery": "Battery",
  "sensor_status": "Sensor status"
}
```

Merge into the existing `nfc_boxes` object without replacing existing keys.

**Step 5: Verify**

Run:

```bash
cd client
npm run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add client/src/pages/nfcBoxes/index.tsx client/public/locales/en/common.json
git commit -m "feat: show nfc box sensor readings"
```

## Task 8: Add Scan Page Sensor Status and On-Open Refresh

**Files:**
- Modify: `client/src/pages/nfcBoxScan/index.tsx`
- Modify: `client/public/locales/en/common.json`

**Step 1: Add sensor refresh state**

Add:

```ts
const [isSensorRefreshing, setIsSensorRefreshing] = useState(false);
const [sensorMessage, setSensorMessage] = useState<string | null>(null);
```

**Step 2: Add token refresh helper**

```ts
const refreshSensor = useCallback(async (box: INfcBox) => {
  if (!box.switchbot_device_id) return;
  setIsSensorRefreshing(true);
  setSensorMessage(null);
  try {
    const res = await fetch(`${apiUrl}/nfc/box/${token}/sensor-refresh`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSensorMessage(body?.message ?? `HTTP ${res.status}`);
      return;
    }
    const refreshedBox: INfcBox = body;
    setPageState(refreshedBox.spool ? { kind: "assigned", box: refreshedBox } : { kind: "empty", box: refreshedBox });
  } catch (err) {
    setSensorMessage(String(err));
  } finally {
    setIsSensorRefreshing(false);
  }
}, [apiUrl, token]);
```

After `fetchBox()` gets a successful box, call `void refreshSensor(box)` if the box has a device ID. Avoid loops by not putting the call in an effect that depends on `pageState`.

**Step 3: Render a reusable sensor status panel**

Add a small local render helper:

```tsx
const renderSensorStatus = (box: INfcBox) => {
  if (!box.switchbot_device_id) {
    return <Alert type="info" showIcon message={t("nfc_scan.sensor_not_mapped")} />;
  }

  const description = [
    box.last_temperature !== undefined ? `${box.last_temperature.toFixed(1)} °C` : null,
    box.last_humidity !== undefined ? `${Math.round(box.last_humidity)}% RH` : null,
    box.last_battery !== undefined ? `${box.last_battery}% battery` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Alert
      type={box.last_sensor_error || sensorMessage ? "warning" : "info"}
      showIcon
      message={isSensorRefreshing ? t("nfc_scan.sensor_refreshing") : t("nfc_scan.sensor_status")}
      description={sensorMessage || box.last_sensor_error || description || t("nfc_scan.sensor_no_reading")}
    />
  );
};
```

Place the panel in both empty and assigned box views below the box title and before action buttons.

**Step 4: Add translations**

Add under `nfc_scan`:

```json
"sensor_status": "Dry box sensor",
"sensor_refreshing": "Refreshing dry box sensor",
"sensor_not_mapped": "No sensor is mapped to this dry box.",
"sensor_no_reading": "No sensor reading has been cached yet."
```

**Step 5: Verify**

Run:

```bash
cd client
npm run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add client/src/pages/nfcBoxScan/index.tsx client/public/locales/en/common.json
git commit -m "feat: refresh sensor readings on nfc scan"
```

## Task 9: Full Verification

**Files:**
- No new files unless fixes are required.

**Step 1: Run backend unit tests**

Run:

```bash
python -m pytest tests/test_switchbot.py tests/test_nfc_sensor.py tests/test_nfc_box_data.py tests/test_moonraker.py -q
```

Expected: PASS.

**Step 2: Run NFC integration tests**

Run:

```bash
python -m pytest tests_integration/tests/setting/test_get.py tests_integration/tests/nfc_box/test_api.py tests_integration/tests/nfc_box/test_scan_actions.py -q
```

Expected: PASS, or document if the integration harness requires Docker services.

**Step 3: Run frontend build**

Run:

```bash
cd client
npm run build
```

Expected: PASS.

**Step 4: Check worktree**

Run:

```bash
git status --short
```

Expected: clean.

**Step 5: Manual smoke test**

With a running local app:

1. Open Settings and save SwitchBot token/secret.
2. Create or edit an NFC box with a known `switchbot_device_id`.
3. Click refresh in the NFC Boxes table and confirm temperature, humidity, battery, and timestamp update.
4. Open `/nfc/box/{token}` and confirm cached values appear and refresh starts.
5. Temporarily set a bad secret and confirm the old reading remains while the sensor error is shown.

**Step 6: Final commit if fixes were needed**

If verification required follow-up fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize switchbot sensor integration"
```
