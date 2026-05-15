"""Helper functions for interacting with NFC box database objects."""

from datetime import datetime, timezone
from uuid import uuid4

import sqlalchemy
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from spoolman.database import models
from spoolman.exceptions import ItemCreateError, ItemNotFoundError


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
        previous_box.spool = None
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
    box.spool = None
    await db.commit()
    return box
