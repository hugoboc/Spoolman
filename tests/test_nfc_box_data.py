from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from spoolman.api.v1.models import NfcBox as NfcBoxResponse
from spoolman.database import models, nfc_box


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
