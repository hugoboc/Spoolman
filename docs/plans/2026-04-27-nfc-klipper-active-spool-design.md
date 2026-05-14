# NFC Klipper Active Spool Design

## Goal

Add a first-version NFC workflow for reusable filament boxes. A user scans an NFC tag attached to a box, then chooses whether to assign a Spoolman spool to that box or activate the currently assigned spool in one configured Klipper/Moonraker printer.

## Scope

This design uses URL-based NFC tags. Each NFC tag identifies a reusable box with a stable, unguessable token. The tag does not identify a spool directly, because the physical box can be reused for different spools over time.

The first version supports one Moonraker printer, one spool per box, and a phone-friendly scan page. It does not include browser Web NFC writing, raw NFC hardware readers, multi-printer routing, multi-spool containers, audit history, or automatic NFC tag programming.

## Core Decisions

- NFC tags identify reusable boxes, not spools and not filament types.
- A box can be empty or assigned to exactly one Spoolman spool.
- A physical spool can be assigned to at most one NFC box.
- Scanning a tag opens a confirmation/action page instead of immediately calling Moonraker.
- Activating in Klipper uses the assigned Spoolman spool ID.
- Archived spools can remain assigned for bookkeeping, but cannot be activated.
- Box assignment can sync `spool.location` to the box name when `nfc_box_sync_location` is enabled.

## Data Model

Add a first-class NFC box table:

```text
nfc_box
- id integer primary key
- registered datetime not null
- token string unique not null
- name string unique not null
- spool_id integer nullable foreign key spool.id, unique
- comment string nullable
```

The backend generates `token` server-side with UUID4. Users see and edit `name`; the token is mainly used in the NFC URL. Deleting a box invalidates its existing NFC tag.

`spool_id` should be unique so the same physical spool cannot be assigned to multiple boxes. When assigning a spool that is already assigned elsewhere, the backend moves the spool by clearing the previous box and setting the new box in one database transaction.

## URL and API Shape

NFC tags should open a frontend route:

```text
{base_url}/nfc/box/{token}
```

The React scan page calls backend APIs:

```text
GET  /api/v1/nfc/box/{token}
POST /api/v1/nfc/box/{token}/assign
POST /api/v1/nfc/box/{token}/clear
POST /api/v1/nfc/box/{token}/activate
```

Management APIs use numeric IDs:

```text
GET    /api/v1/nfc-box
POST   /api/v1/nfc-box
GET    /api/v1/nfc-box/{box_id}
PATCH  /api/v1/nfc-box/{box_id}
DELETE /api/v1/nfc-box/{box_id}
```

Numeric IDs are for app management. Tokens are for URLs written to NFC tags.

## Settings

Add settings for:

- `moonraker_url`: Base URL for the single Klipper/Moonraker instance.
- `moonraker_api_key`: Optional API key for Moonraker instances requiring authenticated requests.
- `nfc_box_sync_location`: Whether assigning a spool to a box also updates `spool.location` to the box name. Default `true`.

The first version keeps printer configuration global. It does not store Moonraker settings per box.

## Scan Page Flow

1. User scans an NFC tag containing `{base_url}/nfc/box/{token}`.
2. The frontend opens the scan page.
3. The page loads box state from `GET /api/v1/nfc/box/{token}`.
4. If the box is empty, the page offers assignment actions.
5. If the box has a spool, the page shows box and spool details and offers activation, reassignment, and clear actions.
6. Activation calls `POST /api/v1/nfc/box/{token}/activate`.
7. The backend validates the box, assigned spool, spool archive state, Moonraker settings, and then calls Moonraker.
8. The page shows a success or error state and does not redirect automatically.

Example assigned-box page:

```text
Box 01
Current spool: Prusament PETG Orange, spool #42

[Activate in Klipper]
[Assign different spool]
[Clear box]
```

Example empty-box page:

```text
Box 01
No spool assigned

[Assign spool]
[Create new spool]
```

The first implementation should support assigning an existing spool from a searchable selector. A link to the existing create-spool page is enough for creating new spools.

## Assignment Rules

Assigning a spool to a box:

- Allows archived spools for bookkeeping.
- Clears the spool from any previous box in the same transaction.
- Replaces any previous spool assigned to the target box.
- Optionally sets `spool.location` to the box name when location sync is enabled.
- Only clears an old synced location if it still equals the previous box name.

Clearing a box:

- Sets the box `spool_id` to null.
- If location sync is enabled and the previously assigned spool's location still equals the box name, clears that location.

Activation:

- Requires a spool assigned to the box.
- Rejects archived spools.
- Warns or rejects clearly when the assigned spool appears empty, depending on implementation choice. The first version should at least make zero remaining weight visible.
- Does not mutate box assignment or spool location.
- Calls Moonraker's active spool endpoint:

```http
POST <moonraker_url>/server/spoolman/spool_id
Content-Type: application/json

{ "spool_id": 42 }
```

## Management UI

Add an NFC Boxes management page rather than overloading the existing Locations page. The page should support:

- Create box.
- Edit box name and comment.
- Assign or clear the current spool.
- Copy NFC URL.
- Show QR code for testing or writing workflows.
- Delete box.

Box names should be unique and non-empty. Use "NFC Boxes" for the page/feature name and "Box" for local row/action labels.

## Error Handling

The scan and API flows should return clear human-readable errors for:

- Unknown or deleted box token.
- Duplicate box name.
- Unknown spool ID during assignment.
- Empty box activation.
- Archived spool activation.
- Missing Moonraker URL setting.
- Moonraker connection failure.
- Moonraker non-success response.

The scan page should keep the user on the page after success or failure so the result is visible on a phone.

## Testing

Backend tests should cover:

- Creating an NFC box generates a token.
- Duplicate box name is rejected.
- Getting a box by token returns current spool state.
- Assigning a spool to an empty box.
- Assigning a spool moves it from another box.
- Clearing a box.
- Activating an empty box is rejected.
- Activating an archived spool is rejected.
- Missing Moonraker URL is rejected.
- Moonraker failure returns a clear error.
- Successful activation posts the assigned spool ID.

Frontend tests should cover the NFC box management page and scan page states if the existing test setup supports it. If frontend tests are limited, TypeScript/build verification is the minimum.

Manual smoke test:

1. Configure Moonraker URL.
2. Create NFC Box "Box 01".
3. Copy or write its NFC URL.
4. Scan it.
5. Assign an existing spool.
6. Scan again.
7. Tap Activate in Klipper.
8. Confirm Moonraker active spool is the assigned spool ID.
9. Reassign the box to another spool and confirm the old assignment is cleared.

## Future Extensions

Later versions can add multi-printer selection, per-box printer routing, token regeneration, soft-deleted boxes, browser Web NFC writing, multi-slot containers, active spool status display from Moonraker, and richer location/container modeling.
