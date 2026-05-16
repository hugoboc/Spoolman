"""Integration tests for NFC scan and action API endpoints."""

from typing import Any
from uuid import uuid4

import httpx

from ..conftest import URL


def _box_name(label: str) -> str:
    return f"{label} {uuid4()}"


def _create_spool(filament_id: int, **params: object) -> dict[str, Any]:
    result = httpx.post(f"{URL}/api/v1/spool", json={"filament_id": filament_id, **params})
    result.raise_for_status()
    return result.json()


def _clear_setting(key: str) -> None:
    result = httpx.post(f"{URL}/api/v1/setting/{key}", json="")
    if result.status_code != 404:
        result.raise_for_status()


def test_get_nfc_box_by_token_returns_assigned_spool(random_filament: dict[str, Any]):
    """Test getting an NFC box by token includes the assigned spool."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Token")}).json()
    spool = _create_spool(random_filament["id"])

    assign = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": spool["id"]})
    assign.raise_for_status()

    result = httpx.get(f"{URL}/api/v1/nfc/box/{box['token']}")
    result.raise_for_status()
    body = result.json()

    assert body["id"] == box["id"]
    assert body["spool"]["id"] == spool["id"]
    assert body["spool"]["location"] == body["name"]

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_assigning_spool_moves_it_between_boxes(random_filament: dict[str, Any]):
    """Test assigning a spool to another box clears the previous assignment."""
    first_box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Move A")}).json()
    second_box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Move B")}).json()
    spool = _create_spool(random_filament["id"])

    httpx.post(f"{URL}/api/v1/nfc/box/{first_box['token']}/assign", json={"spool_id": spool["id"]}).raise_for_status()
    httpx.post(
        f"{URL}/api/v1/nfc/box/{second_box['token']}/assign",
        json={"spool_id": spool["id"]},
    ).raise_for_status()

    first = httpx.get(f"{URL}/api/v1/nfc/box/{first_box['token']}").json()
    second = httpx.get(f"{URL}/api/v1/nfc/box/{second_box['token']}").json()

    assert first["spool"] is None
    assert second["spool"]["id"] == spool["id"]
    assert second["spool"]["location"] == second["name"]

    httpx.delete(f"{URL}/api/v1/nfc-box/{first_box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/nfc-box/{second_box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_creating_spool_with_nfc_box_location_assigns_box(random_filament: dict[str, Any]):
    """Test creating a spool in an NFC box location assigns that box."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Create Location")}).json()

    spool = _create_spool(random_filament["id"], location=box["name"])
    scanned_box = httpx.get(f"{URL}/api/v1/nfc/box/{box['token']}")
    scanned_box.raise_for_status()

    assert scanned_box.json()["spool"]["id"] == spool["id"]

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_updating_spool_to_occupied_nfc_box_clears_displaced_location(random_filament: dict[str, Any]):
    """Test moving a spool into an occupied NFC box clears the displaced spool's synced location."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Replace")}).json()
    first_spool = _create_spool(random_filament["id"])
    second_spool = _create_spool(random_filament["id"])
    httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": first_spool["id"]}).raise_for_status()

    update = httpx.patch(f"{URL}/api/v1/spool/{second_spool['id']}", json={"location": box["name"]})
    update.raise_for_status()
    scanned_box = httpx.get(f"{URL}/api/v1/nfc/box/{box['token']}").json()
    displaced_spool = httpx.get(f"{URL}/api/v1/spool/{first_spool['id']}").json()

    assert scanned_box["spool"]["id"] == second_spool["id"]
    assert displaced_spool.get("location") is None

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{first_spool['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{second_spool['id']}").raise_for_status()


def test_clear_nfc_box_removes_assignment_and_location(random_filament: dict[str, Any]):
    """Test clearing a box removes its assignment and synced spool location."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Clear")}).json()
    spool = _create_spool(random_filament["id"])
    httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": spool["id"]}).raise_for_status()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/clear")
    result.raise_for_status()
    body = result.json()
    spool_result = httpx.get(f"{URL}/api/v1/spool/{spool['id']}")
    spool_result.raise_for_status()

    assert body["spool"] is None
    assert spool_result.json().get("location") is None

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_activate_empty_box_is_rejected():
    """Test activating an unassigned NFC box is rejected."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Empty")}).json()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/activate")

    assert result.status_code == 400
    assert "assigned" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()


def test_activate_archived_spool_is_rejected(random_filament: dict[str, Any]):
    """Test activating an archived assigned spool is rejected."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box Archived")}).json()
    spool = _create_spool(random_filament["id"], archived=True)
    httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": spool["id"]}).raise_for_status()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/activate")

    assert result.status_code == 400
    assert "archived" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()


def test_activate_without_moonraker_url_is_rejected(random_filament: dict[str, Any]):
    """Test activating an assigned spool without Moonraker configuration is rejected."""
    _clear_setting("moonraker_url")
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box No Moonraker")}).json()
    spool = _create_spool(random_filament["id"])
    httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/assign", json={"spool_id": spool["id"]}).raise_for_status()

    result = httpx.post(f"{URL}/api/v1/nfc/box/{box['token']}/activate")

    assert result.status_code == 400
    assert "moonraker" in result.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
    httpx.delete(f"{URL}/api/v1/spool/{spool['id']}").raise_for_status()
