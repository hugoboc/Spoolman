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
