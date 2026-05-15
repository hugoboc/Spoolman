# NFC Klipper Active Spool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add URL-based NFC tags for reusable filament boxes so a scanned box can assign a Spoolman spool or activate the assigned spool in one configured Klipper/Moonraker printer.

**Architecture:** Spoolman stores global Moonraker settings and first-class NFC box records. Each box has a server-generated UUID token used by the NFC URL, and an optional assigned `spool_id`. The scan page loads box state by token, lets the user assign, clear, or activate, and activation delegates to a small Moonraker client helper.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Alembic, httpx, Pydantic, React 19, Refine, Ant Design, TanStack Query, TypeScript.

---

## Progress Tracker

- [x] **Phase 1: Configuration and Moonraker Client**
  - [x] Task 1: Register Moonraker and NFC settings
  - [x] Task 2: Add Moonraker client helper
- [x] **Phase 2: NFC Box Data Layer**
  - [x] Task 3: Add NFC box database model and migration
  - [x] Task 4: Add NFC box database helpers
  - [x] Task 5: Add NFC box response models
- [x] **Phase 3: Backend API**
  - [x] Task 6: Add NFC box management API
  - [x] Task 7: Add NFC scan and action API
- [x] **Phase 4: Settings and Management UI**
  - [x] Task 8: Add settings UI fields
  - [x] Task 9: Add NFC boxes management page
- [ ] **Phase 5: Scan UI**
  - [ ] Task 10: Add NFC box scan page
- [ ] **Phase 6: Verification**
  - [ ] Task 11: Final verification

---

## Phase 1: Configuration and Moonraker Client

**Goal:** Add the global settings and low-level Moonraker integration needed before any NFC box workflow can activate a printer spool.

### Task 1: Register Moonraker and NFC Settings

**Files:**
- Modify: `spoolman/settings.py`
- Test: `tests_integration/tests/setting/test_get.py`

**Step 1: Write the failing test**

Add a test that the new settings exist:

```python
def test_get_nfc_moonraker_settings_defaults():
    """Test getting NFC/Moonraker settings defaults."""
    expectations = {
        "moonraker_url": ('""', "string"),
        "moonraker_api_key": ('""', "string"),
        "nfc_box_sync_location": ("true", "boolean"),
    }

    for key, (expected_value, expected_type) in expectations.items():
        result = httpx.get(f"{URL}/api/v1/setting/{key}")
        result.raise_for_status()
        body = result.json()
        assert body["value"] == expected_value
        assert body["is_set"] is False
        assert body["type"] == expected_type
```

**Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest tests_integration/tests/setting/test_get.py::test_get_nfc_moonraker_settings_defaults -v
```

Expected: FAIL with 404 or unknown setting.

**Step 3: Implement settings**

In `spoolman/settings.py`, add near `base_url`:

```python
register_setting("moonraker_url", SettingType.STRING, json.dumps(""))
register_setting("moonraker_api_key", SettingType.STRING, json.dumps(""))
register_setting("nfc_box_sync_location", SettingType.BOOLEAN, json.dumps(obj=True))
```

**Step 4: Run test to verify it passes**

Run:

```bash
python -m pytest tests_integration/tests/setting/test_get.py::test_get_nfc_moonraker_settings_defaults -v
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/settings.py tests_integration/tests/setting/test_get.py
git commit -m "feat: add nfc moonraker settings"
```

### Task 2: Add Moonraker Client Helper

**Files:**
- Create: `spoolman/moonraker.py`
- Test: `tests/test_moonraker.py`

**Step 1: Write the failing unit tests**

Create `tests/test_moonraker.py`. Avoid adding a new HTTP mocking dependency; monkeypatch `httpx.AsyncClient`.

```python
from types import SimpleNamespace

import pytest

from spoolman.moonraker import MoonrakerError, set_active_spool


class FakeResponse:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            import httpx

            request = httpx.Request("POST", "http://printer.local/server/spoolman/spool_id")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("boom", request=request, response=response)


@pytest.mark.asyncio
async def test_set_active_spool_posts_to_moonraker(monkeypatch):
    calls = []

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, json, headers):
            calls.append(SimpleNamespace(url=url, json=json, headers=headers))
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    await set_active_spool("http://printer.local/", "", 123)

    assert calls[0].url == "http://printer.local/server/spoolman/spool_id"
    assert calls[0].json == {"spool_id": 123}
    assert calls[0].headers == {}


@pytest.mark.asyncio
async def test_set_active_spool_sends_api_key(monkeypatch):
    calls = []

    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, json, headers):
            calls.append(headers)
            return FakeResponse()

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    await set_active_spool("http://printer.local", "secret", 123)

    assert calls[0]["X-Api-Key"] == "secret"


@pytest.mark.asyncio
async def test_set_active_spool_raises_on_failure(monkeypatch):
    class FakeClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, json, headers):
            return FakeResponse(500)

    monkeypatch.setattr("httpx.AsyncClient", FakeClient)

    with pytest.raises(MoonrakerError, match="500"):
        await set_active_spool("http://printer.local", "", 123)
```

**Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest tests/test_moonraker.py -v
```

Expected: FAIL because `spoolman.moonraker` does not exist.

**Step 3: Implement helper**

Create `spoolman/moonraker.py`:

```python
"""Helpers for Moonraker integration."""

import httpx


class MoonrakerError(RuntimeError):
    """Raised when a Moonraker request fails."""


async def set_active_spool(moonraker_url: str, api_key: str, spool_id: int) -> None:
    """Set the active Spoolman spool in Moonraker."""
    base_url = moonraker_url.rstrip("/")
    headers = {"X-Api-Key": api_key} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{base_url}/server/spoolman/spool_id",
                json={"spool_id": spool_id},
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise MoonrakerError(f"Moonraker returned HTTP {exc.response.status_code}.") from exc
    except httpx.HTTPError as exc:
        raise MoonrakerError(f"Moonraker request failed: {exc!s}") from exc
```

**Step 4: Run test to verify it passes**

Run:

```bash
python -m pytest tests/test_moonraker.py -v
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/moonraker.py tests/test_moonraker.py
git commit -m "feat: add moonraker active spool client"
```

## Phase 2: NFC Box Data Layer

**Goal:** Add the persistent NFC box entity and backend data helpers before exposing routes or UI.

### Task 3: Add NFC Box Database Model and Migration

**Files:**
- Modify: `spoolman/database/models.py`
- Create: `migrations/versions/2026_04_27_0001-202604270001_add_nfc_boxes.py`

**Step 1: Add model**

In `spoolman/database/models.py`, add `DateTime` import only if needed by the local style. Then add:

```python
class NfcBox(Base):
    __tablename__ = "nfc_box"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    registered: Mapped[datetime] = mapped_column()
    token: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    spool_id: Mapped[int | None] = mapped_column(ForeignKey("spool.id"), unique=True)
    spool: Mapped[Optional["Spool"]] = relationship()
    comment: Mapped[str | None] = mapped_column(String(1024))
```

Place it after `Spool` so the relationship target is already defined.

**Step 2: Add migration**

Create `migrations/versions/2026_04_27_0001-202604270001_add_nfc_boxes.py`:

```python
"""Add NFC boxes.

Revision ID: 202604270001
Revises: 415a8f855e14
Create Date: 2026-04-27 00:01:00.000000
"""

import sqlalchemy as sa
from alembic import op

revision = "202604270001"
down_revision = "415a8f855e14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Perform the upgrade."""
    op.create_table(
        "nfc_box",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("registered", sa.DateTime(), nullable=False),
        sa.Column("token", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("spool_id", sa.Integer(), nullable=True),
        sa.Column("comment", sa.String(length=1024), nullable=True),
        sa.ForeignKeyConstraint(["spool_id"], ["spool.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("spool_id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_nfc_box_id"), "nfc_box", ["id"], unique=False)
    op.create_index(op.f("ix_nfc_box_token"), "nfc_box", ["token"], unique=False)


def downgrade() -> None:
    """Perform the downgrade."""
    op.drop_index(op.f("ix_nfc_box_token"), table_name="nfc_box")
    op.drop_index(op.f("ix_nfc_box_id"), table_name="nfc_box")
    op.drop_table("nfc_box")
```

**Step 3: Verify migration imports**

Run:

```bash
python -m compileall spoolman/database/models.py migrations/versions/2026_04_27_0001-202604270001_add_nfc_boxes.py
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/database/models.py migrations/versions/2026_04_27_0001-202604270001_add_nfc_boxes.py
git commit -m "feat: add nfc box model"
```

### Task 4: Add NFC Box Database Helpers

**Files:**
- Create: `spoolman/database/nfc_box.py`
- Test: `tests_integration/tests/nfc_box/test_api.py` in later API task

**Step 1: Implement helper module**

Create `spoolman/database/nfc_box.py`:

```python
"""Helper functions for interacting with NFC box database objects."""

from datetime import datetime
from uuid import uuid4

import sqlalchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from spoolman.database import models
from spoolman.exceptions import ItemCreateError, ItemNotFoundError


async def create(*, db: AsyncSession, name: str, comment: str | None = None) -> models.NfcBox:
    """Create an NFC box with a server-generated token."""
    item = models.NfcBox(
        registered=datetime.utcnow().replace(microsecond=0),
        token=str(uuid4()),
        name=name,
        comment=comment,
    )
    db.add(item)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ItemCreateError("Failed to create NFC box.") from exc
    return item


async def get_by_id(db: AsyncSession, box_id: int) -> models.NfcBox:
    """Get an NFC box by numeric ID."""
    item = await db.get(models.NfcBox, box_id, options=[joinedload("*")])
    if item is None:
        raise ItemNotFoundError(f"No NFC box with ID {box_id} found.")
    return item


async def get_by_token(db: AsyncSession, token: str) -> models.NfcBox:
    """Get an NFC box by token."""
    rows = await db.execute(
        sqlalchemy.select(models.NfcBox)
        .where(models.NfcBox.token == token)
        .options(joinedload("*")),
    )
    item = rows.unique().scalar_one_or_none()
    if item is None:
        raise ItemNotFoundError("NFC box not found.")
    return item


async def find(db: AsyncSession) -> list[models.NfcBox]:
    """Find all NFC boxes."""
    rows = await db.execute(
        sqlalchemy.select(models.NfcBox).order_by(models.NfcBox.name).options(joinedload(models.NfcBox.spool)),
    )
    return list(rows.unique().scalars().all())


async def update(*, db: AsyncSession, box_id: int, data: dict) -> models.NfcBox:
    """Update editable NFC box fields."""
    item = await get_by_id(db, box_id)
    for key, value in data.items():
        setattr(item, key, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ItemCreateError("Failed to update NFC box.") from exc
    return item


async def delete(db: AsyncSession, box_id: int) -> None:
    """Delete an NFC box and invalidate its token."""
    item = await get_by_id(db, box_id)
    await db.delete(item)
    await db.commit()


async def assign_spool(
    *,
    db: AsyncSession,
    box: models.NfcBox,
    spool: models.Spool,
    sync_location: bool,
) -> models.NfcBox:
    """Assign a spool to a box, moving it from any previous box."""
    rows = await db.execute(sqlalchemy.select(models.NfcBox).where(models.NfcBox.spool_id == spool.id))
    previous_box = rows.scalar_one_or_none()
    if previous_box is not None and previous_box.id != box.id:
        previous_box.spool_id = None
        if sync_location and spool.location == previous_box.name:
            spool.location = None

    old_spool = box.spool
    if old_spool is not None and old_spool.id != spool.id and sync_location and old_spool.location == box.name:
        old_spool.location = None

    box.spool = spool
    if sync_location:
        spool.location = box.name
    await db.commit()
    return box


async def clear_spool(*, db: AsyncSession, box: models.NfcBox, sync_location: bool) -> models.NfcBox:
    """Clear the assigned spool from a box."""
    old_spool = box.spool
    if old_spool is not None and sync_location and old_spool.location == box.name:
        old_spool.location = None
    box.spool_id = None
    await db.commit()
    return box
```

**Step 2: Compile helpers**

Run:

```bash
python -m compileall spoolman/database/nfc_box.py
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/database/nfc_box.py
git commit -m "feat: add nfc box database helpers"
```

### Task 5: Add NFC Box Response Models

**Files:**
- Modify: `spoolman/api/v1/models.py`

**Step 1: Add response models**

In `spoolman/api/v1/models.py`, add after `Spool`:

```python
class NfcBox(BaseModel):
    id: int = Field(description="Unique internal ID of this NFC box.")
    registered: SpoolmanDateTime = Field(description="When the NFC box was registered. UTC Timezone.")
    token: str = Field(description="Server-generated token used in NFC URLs.")
    name: str = Field(max_length=64, description="User-facing box name.")
    spool: Spool | None = Field(None, description="The spool currently assigned to this box.")
    comment: str | None = Field(None, max_length=1024, description="Free text comment about this box.")

    @staticmethod
    def from_db(item: models.NfcBox) -> "NfcBox":
        """Create a Pydantic NFC box object from a database object."""
        return NfcBox(
            id=item.id,
            registered=item.registered,
            token=item.token,
            name=item.name,
            spool=Spool.from_db(item.spool) if item.spool is not None else None,
            comment=item.comment,
        )
```

**Step 2: Compile models**

Run:

```bash
python -m compileall spoolman/api/v1/models.py
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/api/v1/models.py
git commit -m "feat: add nfc box api model"
```

## Phase 3: Backend API

**Goal:** Expose NFC box management plus scan-time assign, clear, and activate actions through tested API routes.

### Task 6: Add NFC Box Management API

**Files:**
- Create: `spoolman/api/v1/nfc_box.py`
- Modify: `spoolman/api/v1/router.py`
- Test: `tests_integration/tests/nfc_box/test_api.py`

**Step 1: Write failing integration tests**

Create `tests_integration/tests/nfc_box/test_api.py` with management tests:

```python
import httpx

from ..conftest import URL


def test_create_nfc_box_generates_token():
    result = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": "Box 01", "comment": "Reusable drybox"})
    result.raise_for_status()
    body = result.json()

    assert body["id"] > 0
    assert body["name"] == "Box 01"
    assert len(body["token"]) == 36
    assert body["spool"] is None

    httpx.delete(f"{URL}/api/v1/nfc-box/{body['id']}").raise_for_status()


def test_create_nfc_box_rejects_duplicate_name():
    first = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": "Box 02"})
    first.raise_for_status()
    box_id = first.json()["id"]

    duplicate = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": "Box 02"})

    assert duplicate.status_code == 400
    assert "box" in duplicate.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box_id}").raise_for_status()
```

**Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest tests_integration/tests/nfc_box/test_api.py -v
```

Expected: FAIL with route not found.

**Step 3: Implement route**

Create `spoolman/api/v1/nfc_box.py`:

```python
"""NFC box management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, NfcBox
from spoolman.database import nfc_box
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemCreateError

router = APIRouter(prefix="/nfc-box", tags=["nfc-box"])


class NfcBoxCreateParameters(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    comment: str | None = Field(None, max_length=1024)


class NfcBoxUpdateParameters(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    comment: str | None = Field(None, max_length=1024)


@router.get("", response_model=list[NfcBox], response_model_exclude_none=True)
async def find(db: Annotated[AsyncSession, Depends(get_db_session)]) -> list[NfcBox]:
    items = await nfc_box.find(db)
    return [NfcBox.from_db(item) for item in items]


@router.post("", response_model=NfcBox, response_model_exclude_none=True, responses={400: {"model": Message}})
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: NfcBoxCreateParameters,
) -> NfcBox | JSONResponse:
    try:
        item = await nfc_box.create(db=db, name=body.name, comment=body.comment)
    except ItemCreateError:
        return JSONResponse(status_code=400, content=Message(message="Failed to create NFC box.").dict())
    return NfcBox.from_db(item)


@router.get("/{box_id}", response_model=NfcBox, response_model_exclude_none=True, responses={404: {"model": Message}})
async def get(db: Annotated[AsyncSession, Depends(get_db_session)], box_id: int) -> NfcBox:
    item = await nfc_box.get_by_id(db, box_id)
    return NfcBox.from_db(item)


@router.patch(
    "/{box_id}",
    response_model=NfcBox,
    response_model_exclude_none=True,
    responses={400: {"model": Message}, 404: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    box_id: int,
    body: NfcBoxUpdateParameters,
) -> NfcBox | JSONResponse:
    try:
        item = await nfc_box.update(db=db, box_id=box_id, data=body.model_dump(exclude_unset=True))
    except ItemCreateError:
        return JSONResponse(status_code=400, content=Message(message="Failed to update NFC box.").dict())
    return NfcBox.from_db(item)


@router.delete("/{box_id}", responses={404: {"model": Message}})
async def delete(db: Annotated[AsyncSession, Depends(get_db_session)], box_id: int) -> Message:
    await nfc_box.delete(db, box_id)
    return Message(message="Success!")
```

Modify `spoolman/api/v1/router.py`:

```python
from . import export, externaldb, field, filament, models, nfc_box, other, setting, spool, vendor
...
app.include_router(nfc_box.router)
```

**Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest tests_integration/tests/nfc_box/test_api.py -v
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/api/v1/nfc_box.py spoolman/api/v1/router.py tests_integration/tests/nfc_box/test_api.py
git commit -m "feat: add nfc box management api"
```

### Task 7: Add NFC Scan and Action API

**Files:**
- Create: `spoolman/api/v1/nfc.py`
- Modify: `spoolman/api/v1/router.py`
- Test: `tests_integration/tests/nfc_box/test_scan_actions.py`

**Step 1: Write failing integration tests**

Create `tests_integration/tests/nfc_box/test_scan_actions.py` with at least:

```python
from typing import Any

import httpx

from ..conftest import URL


def test_get_nfc_box_by_token_returns_assigned_spool(random_filament: dict[str, Any]):
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": "Box Token"}).json()
    spool = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": random_filament["id"]}).json()

    assign = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": spool["id"]})
    assign.raise_for_status()

    result = httpx.get(f"{URL}/api/v1/nfc/box/{box['token']}")
    result.raise_for_status()
    body = result.json()

    assert body["name"] == "Box Token"
    assert body["spool"]["id"] == spool["id"]

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_activate_empty_box_is_rejected():
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": "Box Empty"}).json()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/activate")

    assert result.status_code == 400
    assert "assigned" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
```

Add separate tests for moving a spool between boxes, clearing a box, archived spool activation, and missing Moonraker URL. Mocking Moonraker can be done in a unit-style FastAPI test if integration containers cannot intercept outbound HTTP.

**Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest tests_integration/tests/nfc_box/test_scan_actions.py -v
```

Expected: FAIL with route not found.

**Step 3: Implement route**

Create `spoolman/api/v1/nfc.py`:

```python
"""NFC scan and action endpoints."""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, NfcBox
from spoolman.database import nfc_box, setting, spool
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemNotFoundError
from spoolman.moonraker import MoonrakerError, set_active_spool
from spoolman.settings import parse_setting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nfc", tags=["nfc"])


class NfcBoxAssignParameters(BaseModel):
    spool_id: int = Field(description="Spoolman spool ID to assign to the scanned box.")


async def get_setting_value(db: AsyncSession, key: str):
    """Return a decoded setting value."""
    definition = parse_setting(key)
    try:
        item = await setting.get(db, definition)
        raw_value = item.value
    except ItemNotFoundError:
        raw_value = definition.default
    return json.loads(raw_value)


@router.get("/box/{token}", response_model=NfcBox, response_model_exclude_none=True, responses={404: {"model": Message}})
async def get_box(db: Annotated[AsyncSession, Depends(get_db_session)], token: str) -> NfcBox:
    item = await nfc_box.get_by_token(db, token)
    return NfcBox.from_db(item)


@router.post(
    "/box/{token}/assign",
    response_model=NfcBox,
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
async def assign_box(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    token: str,
    body: NfcBoxAssignParameters,
) -> NfcBox:
    box = await nfc_box.get_by_token(db, token)
    spool_item = await spool.get_by_id(db, body.spool_id)
    sync_location = await get_setting_value(db, "nfc_box_sync_location")
    item = await nfc_box.assign_spool(db=db, box=box, spool=spool_item, sync_location=sync_location)
    return NfcBox.from_db(item)


@router.post("/box/{token}/clear", response_model=NfcBox, response_model_exclude_none=True)
async def clear_box(db: Annotated[AsyncSession, Depends(get_db_session)], token: str) -> NfcBox:
    box = await nfc_box.get_by_token(db, token)
    sync_location = await get_setting_value(db, "nfc_box_sync_location")
    item = await nfc_box.clear_spool(db=db, box=box, sync_location=sync_location)
    return NfcBox.from_db(item)


@router.post(
    "/box/{token}/activate",
    response_model=Message,
    responses={400: {"model": Message}, 404: {"model": Message}, 502: {"model": Message}},
)
async def activate_box(db: Annotated[AsyncSession, Depends(get_db_session)], token: str) -> Message | JSONResponse:
    box = await nfc_box.get_by_token(db, token)
    if box.spool is None:
        return JSONResponse(status_code=400, content=Message(message="No spool is assigned to this NFC box.").dict())
    if box.spool.archived:
        return JSONResponse(status_code=400, content=Message(message="Assigned spool is archived.").dict())

    moonraker_url = await get_setting_value(db, "moonraker_url")
    api_key = await get_setting_value(db, "moonraker_api_key")
    if not moonraker_url:
        return JSONResponse(status_code=400, content=Message(message="Moonraker URL is not configured.").dict())

    try:
        await set_active_spool(moonraker_url, api_key, box.spool.id)
    except MoonrakerError as exc:
        logger.warning("Failed to set active spool in Moonraker: %s", exc)
        return JSONResponse(status_code=502, content=Message(message=str(exc)).dict())

    return Message(message=f"Spool {box.spool.id} is now active in Moonraker.")
```

Modify `spoolman/api/v1/router.py`:

```python
from . import export, externaldb, field, filament, models, nfc, nfc_box, other, setting, spool, vendor
...
app.include_router(nfc.router)
```

**Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest tests_integration/tests/nfc_box/test_scan_actions.py -v
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add spoolman/api/v1/nfc.py spoolman/api/v1/router.py tests_integration/tests/nfc_box/test_scan_actions.py
git commit -m "feat: add nfc box scan actions"
```

## Phase 4: Settings and Management UI

**Goal:** Surface Moonraker/NFC configuration and provide an admin page for creating boxes and copying their NFC URLs.

### Task 8: Add Settings UI Fields

**Files:**
- Modify: `client/src/pages/settings/generalSettings.tsx`
- Modify: `client/public/locales/en/common.json`

**Step 1: Update settings form state**

In `GeneralSettings`, add:

```ts
const setMoonrakerUrl = useSetSetting("moonraker_url");
const setMoonrakerApiKey = useSetSetting("moonraker_api_key");
const setNfcBoxSyncLocation = useSetSetting("nfc_box_sync_location");
```

Update form value types, `useEffect`, and `onFinish` to include those fields.

**Step 2: Add form fields**

Add after `base_url`:

```tsx
<Form.Item
  label={t("settings.general.moonraker_url.label")}
  tooltip={t("settings.general.moonraker_url.tooltip")}
  name="moonraker_url"
  rules={[{ required: false }, { pattern: /^https?:\/\/.+(?<!\/)$/ }]}
>
  <Input placeholder="http://printer.local:7125" />
</Form.Item>

<Form.Item
  label={t("settings.general.moonraker_api_key.label")}
  tooltip={t("settings.general.moonraker_api_key.tooltip")}
  name="moonraker_api_key"
>
  <Input.Password />
</Form.Item>

<Form.Item
  label={t("settings.general.nfc_box_sync_location.label")}
  tooltip={t("settings.general.nfc_box_sync_location.tooltip")}
  name="nfc_box_sync_location"
  valuePropName="checked"
>
  <Checkbox />
</Form.Item>
```

**Step 3: Add English translations**

In `client/public/locales/en/common.json`, add:

```json
"moonraker_url": {
  "label": "Moonraker URL",
  "tooltip": "Base URL for the Klipper/Moonraker printer used by NFC box activation."
},
"moonraker_api_key": {
  "label": "Moonraker API key",
  "tooltip": "Optional API key sent to Moonraker when setting the active spool."
},
"nfc_box_sync_location": {
  "label": "Sync NFC box assignments to spool locations",
  "tooltip": "When enabled, assigning a spool to an NFC box also sets the spool location to the box name."
}
```

**Step 4: Verify frontend build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add client/src/pages/settings/generalSettings.tsx client/public/locales/en/common.json
git commit -m "feat: add nfc moonraker settings ui"
```

### Task 9: Add NFC Boxes Management Page

**Files:**
- Modify: `client/src/App.tsx`
- Create: `client/src/pages/nfcBoxes/index.tsx`
- Create: `client/src/pages/nfcBoxes/model.ts`
- Create: `client/src/pages/nfcBoxes/functions.ts`
- Modify: `client/public/locales/en/common.json`

**Step 1: Add model and helpers**

Create `client/src/pages/nfcBoxes/model.ts`:

```ts
import { ISpool } from "../spools/model";

export interface INfcBox {
  id: number;
  registered: string;
  token: string;
  name: string;
  spool?: ISpool;
  comment?: string;
}
```

Create `client/src/pages/nfcBoxes/functions.ts`:

```ts
import { getBasePath } from "../../utils/url";
import { INfcBox } from "./model";

export function getNfcBoxUrl(box: INfcBox): string {
  return `${window.location.origin}${getBasePath()}/nfc/box/${box.token}`;
}
```

**Step 2: Register route/resource**

In `client/src/App.tsx`, add an icon import and resource:

```tsx
import { TagsOutlined } from "@ant-design/icons";
...
{
  name: "nfc-box",
  list: "/nfc-box",
  meta: {
    canDelete: true,
    icon: <TagsOutlined />,
  },
},
```

Add route:

```tsx
<Route path="/nfc-box" element={<LoadablePage name="nfcBoxes" />} />
```

**Step 3: Build management page**

Create `client/src/pages/nfcBoxes/index.tsx` with a Refine list/table that supports:

- Create box with name and optional comment.
- Edit name/comment.
- Delete box.
- Copy NFC URL.
- Show QR code if the project already has a QR component available.
- Show assigned spool or empty state.

Use the `nfc-box` resource and existing Ant Design patterns from spool/vendor pages.

**Step 4: Add translations**

Add an `nfc_boxes` section to `client/public/locales/en/common.json` with labels for title, create, edit, delete, copy URL, copied, empty spool, assigned spool, and validation errors.

**Step 5: Verify build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add client/src/App.tsx client/src/pages/nfcBoxes client/public/locales/en/common.json
git commit -m "feat: add nfc box management page"
```

## Phase 5: Scan UI

**Goal:** Build the NFC tag destination page used during the physical scan workflow.

### Task 10: Add NFC Box Scan Page

**Files:**
- Modify: `client/src/App.tsx`
- Create: `client/src/pages/nfcBoxScan/index.tsx`
- Modify: `client/public/locales/en/common.json`

**Step 1: Register scan route**

In `client/src/App.tsx`, add:

```tsx
<Route path="/nfc/box/:token" element={<LoadablePage name="nfcBoxScan" />} />
```

Keep it inside the existing layout for first version.

**Step 2: Build scan page**

Create `client/src/pages/nfcBoxScan/index.tsx`. The page should:

- Read `token` from `useParams`.
- Fetch `/api/v1/nfc/box/{token}`.
- Show loading, not found, empty box, assigned box, archived spool, activation success, and activation error states.
- Use a searchable spool selector modal for assignment.
- Call `/api/v1/nfc/box/{token}/assign`, `/clear`, and `/activate`.
- Provide a link to the existing create-spool page.

Use `useList<ISpool>` with `resource: "spool"` for assignment options and `allow_archived=false` by default.

**Step 3: Add translations**

Add an `nfc_scan` section to `client/public/locales/en/common.json` with labels for:

- Empty box.
- Assigned spool.
- Activate in Klipper.
- Assign spool.
- Assign different spool.
- Clear box.
- Create new spool.
- Activation success.
- Activation failure.
- Archived spool cannot be activated.

**Step 4: Verify build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

**Manual commit checkpoint**

```bash
git add client/src/App.tsx client/src/pages/nfcBoxScan client/public/locales/en/common.json
git commit -m "feat: add nfc box scan page"
```

## Phase 6: Verification

**Goal:** Run backend, frontend, and manual printer-flow checks after all feature slices are complete.

### Task 11: Final Verification

**Files:**
- No edits expected.

**Step 1: Run targeted backend tests**

Run:

```bash
python -m pytest tests/test_moonraker.py -v
python -m pytest tests_integration/tests/setting/test_get.py::test_get_nfc_moonraker_settings_defaults -v
python -m pytest tests_integration/tests/nfc_box -v
```

Expected: PASS.

**Step 2: Run frontend build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

**Step 3: Manual smoke test**

1. Configure `moonraker_url` in Settings.
2. Create NFC Box "Box 01".
3. Copy or write its NFC URL.
4. Scan/open `/nfc/box/{token}`.
5. Assign an existing spool.
6. Scan/open the URL again.
7. Tap Activate in Klipper.
8. Confirm Moonraker reports the active spool via `GET /server/spoolman/spool_id`.
9. Create a second box and assign the same spool to it.
10. Confirm the first box is cleared and the second box owns the spool.

**Manual commit checkpoint**

If any verification fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: polish nfc box activation flow"
```
