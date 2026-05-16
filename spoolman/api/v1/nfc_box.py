"""NFC box management endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, NfcBox
from spoolman.database import nfc_box
from spoolman.database.database import get_db_session
from spoolman.exceptions import ItemCreateError

router = APIRouter(prefix="/nfc-box", tags=["nfc-box"])

# ruff: noqa: D103


class NfcBoxCreateParameters(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    comment: str | None = Field(None, max_length=1024)


class NfcBoxUpdateParameters(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    comment: str | None = Field(None, max_length=1024)


@router.get("", response_model=list[NfcBox], response_model_exclude_none=True)
async def find(db: Annotated[AsyncSession, Depends(get_db_session)]) -> JSONResponse:
    items = await nfc_box.find(db)
    return JSONResponse(
        content=jsonable_encoder((NfcBox.from_db(item) for item in items), exclude_none=True),
        headers={"x-total-count": str(len(items))},
    )


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


@router.delete("/{box_id}", response_model=None, responses={200: {"model": Message}, 400: {"model": Message}, 404: {"model": Message}})
async def delete(db: Annotated[AsyncSession, Depends(get_db_session)], box_id: int) -> Message | JSONResponse:
    item = await nfc_box.get_by_id(db, box_id)
    if item.spool is not None:
        return JSONResponse(
            status_code=400,
            content=Message(message="Cannot delete a dry box that has a spool assigned. Clear the box first.").dict(),
        )
    await nfc_box.delete(db, box_id)
    return Message(message="Success!")
