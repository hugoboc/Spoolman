"""Integration tests for the NFC box management API endpoints."""

from uuid import uuid4

import httpx

from ..conftest import URL


def _box_name(label: str) -> str:
    return f"{label} {uuid4()}"


def test_create_nfc_box_generates_token():
    """Test creating an NFC box with a generated token."""
    result = httpx.post(
        f"{URL}/api/v1/nfc-box",
        json={"name": _box_name("Box 01"), "comment": "Reusable drybox"},
    )
    result.raise_for_status()
    body = result.json()

    assert body["id"] > 0
    assert body["name"].startswith("Box 01")
    assert body["comment"] == "Reusable drybox"
    assert len(body["token"]) == 36
    assert body["spool"] is None

    httpx.delete(f"{URL}/api/v1/nfc-box/{body['id']}").raise_for_status()


def test_create_nfc_box_rejects_duplicate_name():
    """Test creating an NFC box rejects duplicate names."""
    name = _box_name("Box 02")
    first = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": name})
    first.raise_for_status()
    box_id = first.json()["id"]

    duplicate = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": name})

    assert duplicate.status_code == 400
    assert "box" in duplicate.json()["message"].lower()

    httpx.delete(f"{URL}/api/v1/nfc-box/{box_id}").raise_for_status()


def test_update_nfc_box():
    """Test updating editable NFC box fields."""
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": _box_name("Box 03")}).json()
    new_name = _box_name("Box 03 Renamed")

    result = httpx.patch(
        f"{URL}/api/v1/nfc-box/{box['id']}",
        json={"name": new_name, "comment": "Updated comment"},
    )
    result.raise_for_status()
    body = result.json()

    assert body["id"] == box["id"]
    assert body["token"] == box["token"]
    assert body["name"] == new_name
    assert body["comment"] == "Updated comment"

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()


def test_find_nfc_boxes_includes_created_box():
    """Test finding NFC boxes includes created boxes."""
    name = _box_name("Box 04")
    box = httpx.post(f"{URL}/api/v1/nfc-box", json={"name": name}).json()

    result = httpx.get(f"{URL}/api/v1/nfc-box")
    result.raise_for_status()

    assert any(item["id"] == box["id"] and item["name"] == name for item in result.json())

    httpx.delete(f"{URL}/api/v1/nfc-box/{box['id']}").raise_for_status()
