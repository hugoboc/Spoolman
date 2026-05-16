"""Helper functions for interacting with NFC box database objects."""

import json
from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from spoolman.database import models, setting
from spoolman.exceptions import ItemCreateError, ItemNotFoundError
from spoolman.settings import parse_setting


def utcnow() -> datetime:
    """Return a timezone-naive UTC timestamp without microseconds."""
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


async def create(*, db: AsyncSession, name: str, comment: str | None = None) -> models.NfcBox:
    """Create an NFC box with a server-generated token."""
    item = models.NfcBox(
        registered=utcnow(),
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
        sqlalchemy.select(models.NfcBox)
        .order_by(models.NfcBox.name)
        .options(
            joinedload(models.NfcBox.spool)
            .joinedload(models.Spool.filament)
            .joinedload(models.Filament.vendor),
        ),
    )
    return list(rows.unique().scalars().all())


async def update(*, db: AsyncSession, box_id: int, data: dict) -> models.NfcBox:
    """Update editable NFC box fields."""
    item = await get_by_id(db, box_id)
    old_name = item.name
    for key, value in data.items():
        setattr(item, key, value)
    if "name" in data and data["name"] != old_name:
        if item.spool is not None and item.spool.location == old_name:
            item.spool.location = data["name"]
        await rename_location_settings(db=db, current_name=old_name, new_name=data["name"])
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ItemCreateError("Failed to update NFC box.") from exc
    return item


async def delete(db: AsyncSession, box_id: int) -> None:
    """Delete an NFC box and invalidate its token."""
    item = await get_by_id(db, box_id)
    if item.spool is not None and item.spool.location == item.name:
        item.spool.location = None
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
    return await move_spool_to_box(db=db, box=box, spool=spool, sync_location=sync_location)


async def move_spool_to_box(
    *,
    db: AsyncSession,
    box: models.NfcBox,
    spool: models.Spool,
    sync_location: bool,
) -> models.NfcBox:
    """Move a spool into a box, clearing conflicting NFC box assignments."""
    rows = await db.execute(sqlalchemy.select(models.NfcBox).where(models.NfcBox.spool_id == spool.id))
    previous_box = rows.scalar_one_or_none()
    if previous_box is not None and previous_box.id != box.id:
        previous_box.spool = None
        if sync_location and spool.location == previous_box.name:
            spool.location = None

    old_spool = box.spool
    if old_spool is not None and old_spool.id != spool.id and sync_location and old_spool.location == box.name:
        old_spool.location = None

    if old_spool is not None and old_spool.id != spool.id:
        box.spool = None
        await db.flush()

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
    box.spool = None
    await db.commit()
    return box


async def sync_spool_location_assignment(*, db: AsyncSession, spool: models.Spool) -> None:
    """Sync NFC box assignment from a spool's current location."""
    rows = await db.execute(sqlalchemy.select(models.NfcBox).where(models.NfcBox.spool_id == spool.id))
    current_box = rows.scalar_one_or_none()

    target_box: models.NfcBox | None = None
    if spool.location:
        rows = await db.execute(
            sqlalchemy.select(models.NfcBox)
            .where(models.NfcBox.name == spool.location)
            .options(joinedload(models.NfcBox.spool)),
        )
        target_box = rows.unique().scalar_one_or_none()

    if target_box is not None:
        await move_spool_to_box(db=db, box=target_box, spool=spool, sync_location=True)
    elif current_box is not None:
        current_box.spool = None
        await db.commit()


async def rename_location_settings(*, db: AsyncSession, current_name: str, new_name: str) -> None:
    """Rename NFC box location entries in location-related settings."""
    locations_def = parse_setting("locations")
    try:
        loc_setting = await setting.get(db, locations_def)
        locations: list[str] = json.loads(loc_setting.value)
    except ItemNotFoundError:
        locations = []

    if current_name in locations:
        renamed_locations: list[str] = []
        for location in locations:
            renamed_location = new_name if location == current_name else location
            if renamed_location not in renamed_locations:
                renamed_locations.append(renamed_location)
        await setting.update(db=db, definition=locations_def, value=json.dumps(renamed_locations))

    spoolorders_def = parse_setting("locations_spoolorders")
    try:
        order_setting = await setting.get(db, spoolorders_def)
        spoolorders: dict[str, list[int]] = json.loads(order_setting.value)
    except ItemNotFoundError:
        spoolorders = {}

    if current_name in spoolorders:
        current_order = spoolorders.pop(current_name)
        existing_order = spoolorders.get(new_name, [])
        spoolorders[new_name] = existing_order + [
            spool_id for spool_id in current_order if spool_id not in existing_order
        ]
        await setting.update(db=db, definition=spoolorders_def, value=json.dumps(spoolorders))
