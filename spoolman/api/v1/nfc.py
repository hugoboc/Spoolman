"""NFC scan and action endpoints."""

import json
import logging
from typing import Annotated, cast

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

# ruff: noqa: D103


class NfcBoxAssignParameters(BaseModel):
    spool_id: int = Field(description="Spoolman spool ID to assign to the scanned box.")


async def get_setting_value(db: AsyncSession, key: str) -> str | bool:
    """Return a decoded setting value."""
    definition = parse_setting(key)
    try:
        item = await setting.get(db, definition)
        raw_value = item.value
    except ItemNotFoundError:
        raw_value = definition.default
    return cast(str | bool, json.loads(raw_value))


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
    item = await nfc_box.assign_spool(db=db, box=box, spool=spool_item, sync_location=sync_location is True)
    return NfcBox.from_db(item)


@router.post("/box/{token}/clear", response_model=NfcBox, response_model_exclude_none=True)
async def clear_box(db: Annotated[AsyncSession, Depends(get_db_session)], token: str) -> NfcBox:
    box = await nfc_box.get_by_token(db, token)
    sync_location = await get_setting_value(db, "nfc_box_sync_location")
    item = await nfc_box.clear_spool(db=db, box=box, sync_location=sync_location is True)
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
    if not isinstance(moonraker_url, str) or not moonraker_url:
        return JSONResponse(status_code=400, content=Message(message="Moonraker URL is not configured.").dict())
    if not isinstance(api_key, str):
        api_key = ""

    try:
        await set_active_spool(moonraker_url, api_key, box.spool.id)
    except MoonrakerError as exc:
        logger.warning("Failed to set active spool in Moonraker: %s", exc)
        return JSONResponse(status_code=502, content=Message(message=str(exc)).dict())

    return Message(message=f"Spool {box.spool.id} is now active in Moonraker.")
