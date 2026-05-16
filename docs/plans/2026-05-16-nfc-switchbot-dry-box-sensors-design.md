# NFC SwitchBot Dry Box Sensors Design

## Goal

Add SwitchBot temperature and humidity sensor support to NFC dry boxes. A user can map each NFC box to one SwitchBot sensor, then see the latest cached temperature, humidity, battery, and refresh status from the NFC Boxes page and the scan page.

## Scope

This first version stores only the latest reading per box. It does not store historical time-series data, run background polling, send alerts, manage desiccant state, or control SwitchBot devices.

Sensor refresh is on demand:

- A user can manually refresh a box from the NFC Boxes page.
- The NFC scan page refreshes the mapped sensor when the page opens.

Boxes without a mapped SwitchBot device continue to work exactly as they do today.

## Core Decisions

- Store SwitchBot credentials server-side in Spoolman settings.
- Store a `switchbot_device_id` directly on each NFC box.
- Cache latest sensor readings on `nfc_box`, not in a separate readings table.
- Keep the frontend behind Spoolman APIs; it never calls SwitchBot directly.
- SwitchBot failures must not block spool assignment, box clearing, or Moonraker activation.
- Preserve the last successful reading when a refresh fails.

## SwitchBot API Assumptions

Use SwitchBot API v1.1.

The backend signs requests with the configured token and secret. The integration needs:

```text
GET /v1.1/devices
GET /v1.1/devices/{deviceId}/status
```

Meter-style devices return temperature, humidity, and battery status. The implementation should tolerate unsupported or incomplete responses by storing a readable sensor error instead of crashing.

Source: https://github.com/OpenWonderLabs/SwitchBotAPI

## Data Model

Extend `nfc_box`:

```text
nfc_box
- switchbot_device_id string nullable
- switchbot_device_name string nullable
- last_temperature float nullable
- last_humidity float nullable
- last_battery integer nullable
- last_sensor_refresh datetime nullable
- last_sensor_error string nullable
```

`switchbot_device_id` is user-configured. `switchbot_device_name` is cached opportunistically from SwitchBot device metadata when available.

## Settings

Add settings:

```text
switchbot_token string
switchbot_secret string
```

Both default to an empty string. Refresh endpoints reject requests with a clear error if either setting is missing.

## Backend Components

Add `spoolman/switchbot.py`, parallel to `spoolman/moonraker.py`.

Responsibilities:

- Build SwitchBot v1.1 authentication headers.
- Fetch device lists.
- Fetch one device status.
- Normalize supported sensor fields into a small internal result.
- Raise a SwitchBot-specific error with clear messages on network, authentication, or API failures.

Add NFC-box data helpers for:

- Updating SwitchBot mapping fields.
- Refreshing and storing latest sensor readings.
- Recording refresh failures without clearing previous successful readings.

## API Shape

Add SwitchBot/NFC sensor endpoints:

```text
GET  /api/v1/switchbot/devices
POST /api/v1/nfc-box/{box_id}/sensor-refresh
POST /api/v1/nfc/box/{token}/sensor-refresh
```

Extend existing NFC box create/update APIs to accept `switchbot_device_id`.

Extend existing NFC box response models to include the cached sensor fields.

Refresh endpoint behavior:

- Missing credentials returns `400`.
- Box has no device ID returns `400`.
- SwitchBot/network/API failures return an error and persist `last_sensor_error`.
- Success updates temperature, humidity, battery, device name if available, refresh timestamp, and clears `last_sensor_error`.

## UI

General settings:

- Add SwitchBot token and secret fields near the Moonraker settings.

NFC Boxes page:

- Show temperature, humidity, battery, last refresh, and sensor error/status.
- Add a refresh action per box.
- Add `switchbot_device_id` to create/edit forms.
- Optionally use `GET /api/v1/switchbot/devices` for a picker if credentials are configured; a text input is acceptable for v1.

NFC scan page:

- Show cached sensor values next to the box/spool status.
- If the box has a mapped device ID, trigger refresh after loading the box.
- Keep showing cached values while refresh is in progress.
- Show sensor errors as non-blocking status text.

## Error Handling

Sensor failures are isolated from the NFC box workflow.

- Assignment, clear, reassignment, and activation continue to work even when SwitchBot is down.
- The frontend distinguishes "no sensor mapped", "not configured", "refreshing", "stale cached value", and "refresh failed".
- The backend keeps the last successful values after failures so the UI can show stale data with its timestamp.

## Testing

Backend unit tests:

- SwitchBot signing header generation.
- Device list parsing.
- Meter status parsing.
- Unsupported/missing field handling.
- Failure mapping to SwitchBot errors.

Backend data/API tests:

- Creating/updating an NFC box with `switchbot_device_id`.
- Successful sensor refresh updates cached fields.
- Failed refresh preserves previous readings and stores `last_sensor_error`.
- Missing credentials and no device mapping return clear `400` errors.
- Token-based scan refresh works for the same mapped box.

Frontend verification:

- TypeScript/build verification.
- If practical, component tests for NFC Boxes table sensor display and scan page cached/refresh/error states.

## Future Work

- Historical readings and trend charts.
- Background polling with rate-limit controls.
- Humidity threshold warnings.
- Desiccant maintenance tracking.
- Sensor picker with device type filtering and validation.
- Alerts through webhook or notification integrations.
