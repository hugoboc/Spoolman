"""Integration tests for the Vendor API endpoint."""

import httpx

from ..conftest import URL


def test_get_currency():
    """Test getting the currency setting."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/currency")
    result.raise_for_status()

    # Verify
    setting = result.json()
    assert setting == {
        "value": '"EUR"',
        "is_set": False,
        "type": "string",
    }


def test_get_unknown():
    """Test getting an unknown setting."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/unknown")
    assert result.status_code == 404


def test_get_all():
    """Test getting all settings."""
    # Execute
    result = httpx.get(f"{URL}/api/v1/setting/")
    result.raise_for_status()

    # Verify
    settings = result.json()
    assert "currency" in settings
    assert settings["currency"] == {
        "value": '"EUR"',
        "is_set": False,
        "type": "string",
    }


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
