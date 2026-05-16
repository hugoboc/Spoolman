import json
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from spoolman.api.v1.models import NfcBox as NfcBoxResponse
from spoolman.database import models, nfc_box, setting, spool as spool_db
from spoolman.settings import parse_setting


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()


async def create_spool(db: AsyncSession, *, location: str | None = None) -> models.Spool:
    filament = models.Filament(
        registered=nfc_box.utcnow(),
        density=1.24,
        diameter=1.75,
        extra=[],
    )
    spool = models.Spool(
        registered=nfc_box.utcnow(),
        filament=filament,
        used_weight=0,
        location=location,
        archived=False,
        extra=[],
    )
    db.add(spool)
    await db.commit()
    return spool


@pytest.mark.asyncio
async def test_create_generates_token_and_gets_by_token(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01", comment="Shelf A")

    fetched = await nfc_box.get_by_token(db_session, box.token)

    assert fetched.id == box.id
    assert fetched.token != ""
    assert fetched.name == "Box 01"
    assert fetched.comment == "Shelf A"


@pytest.mark.asyncio
async def test_assign_spool_moves_existing_assignment_and_syncs_locations(db_session: AsyncSession):
    first_box = await nfc_box.create(db=db_session, name="Box 01")
    second_box = await nfc_box.create(db=db_session, name="Box 02")
    spool = await create_spool(db_session)

    await nfc_box.assign_spool(db=db_session, box=first_box, spool=spool, sync_location=True)
    await nfc_box.assign_spool(db=db_session, box=second_box, spool=spool, sync_location=True)

    assert first_box.spool_id is None
    assert second_box.spool_id == spool.id
    assert spool.location == "Box 02"


@pytest.mark.asyncio
async def test_clear_spool_clears_synced_location_only(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01")
    spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=spool, sync_location=True)

    await nfc_box.clear_spool(db=db_session, box=box, sync_location=True)

    assert box.spool_id is None
    assert spool.location is None


@pytest.mark.asyncio
async def test_clear_spool_preserves_manual_location(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01")
    spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=spool, sync_location=True)
    spool.location = "Manual Shelf"

    await nfc_box.clear_spool(db=db_session, box=box, sync_location=True)

    assert box.spool_id is None
    assert spool.location == "Manual Shelf"


@pytest.mark.asyncio
async def test_nfc_box_response_model_includes_assigned_spool(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01")
    spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=spool, sync_location=False)

    response = NfcBoxResponse.from_db(box)

    assert response.id == box.id
    assert response.token == box.token
    assert response.spool is not None
    assert response.spool.id == spool.id


@pytest.mark.asyncio
async def test_find_nfc_boxes_can_serialize_assigned_spools(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01")
    spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=spool, sync_location=False)

    found_boxes = await nfc_box.find(db_session)
    response = NfcBoxResponse.from_db(found_boxes[0])

    assert response.id == box.id
    assert response.spool is not None
    assert response.spool.id == spool.id


@pytest.mark.asyncio
async def test_creating_spool_with_nfc_box_location_assigns_box(db_session: AsyncSession):
    box = await nfc_box.create(db=db_session, name="Box 01")
    created_spool = await create_spool(db_session, location=box.name)

    await nfc_box.sync_spool_location_assignment(db=db_session, spool=created_spool)
    updated_box = await nfc_box.get_by_id(db_session, box.id)

    assert updated_box.spool_id == created_spool.id


@pytest.mark.asyncio
async def test_updating_spool_location_to_occupied_nfc_box_clears_displaced_spool_location(
    db_session: AsyncSession,
):
    box = await nfc_box.create(db=db_session, name="Box 01")
    first_spool = await create_spool(db_session)
    second_spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=first_spool, sync_location=True)

    second_spool.location = box.name
    await nfc_box.sync_spool_location_assignment(db=db_session, spool=second_spool)
    updated_box = await nfc_box.get_by_id(db_session, box.id)
    displaced_spool = await spool_db.get_by_id(db_session, first_spool.id)

    assert updated_box.spool_id == second_spool.id
    assert displaced_spool.location is None


@pytest.mark.asyncio
async def test_renaming_assigned_nfc_box_updates_synced_spool_location_and_location_settings(
    db_session: AsyncSession,
):
    box = await nfc_box.create(db=db_session, name="Box 01")
    assigned_spool = await create_spool(db_session)
    await nfc_box.assign_spool(db=db_session, box=box, spool=assigned_spool, sync_location=True)
    locations_def = parse_setting("locations")
    spoolorders_def = parse_setting("locations_spoolorders")
    await setting.update(db=db_session, definition=locations_def, value=json.dumps([box.name, "Shelf"]))
    await setting.update(db=db_session, definition=spoolorders_def, value=json.dumps({box.name: [assigned_spool.id]}))
    await db_session.commit()

    await nfc_box.update(db=db_session, box_id=box.id, data={"name": "Box 01 Renamed"})
    updated_spool = await spool_db.get_by_id(db_session, assigned_spool.id)
    locations = json.loads((await setting.get(db_session, locations_def)).value)
    spoolorders = json.loads((await setting.get(db_session, spoolorders_def)).value)

    assert updated_spool.location == "Box 01 Renamed"
    assert locations == ["Box 01 Renamed", "Shelf"]
    assert spoolorders == {"Box 01 Renamed": [assigned_spool.id]}
