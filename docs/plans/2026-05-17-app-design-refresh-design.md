# App Design Refresh

## Scope

Apply the attached visual direction globally to the Spoolman client shell and shared list/table surfaces, with Filaments serving as the reference page.

## Approach

Use the existing Refine and Ant Design structure rather than replacing the UI stack. The refresh will focus on theme tokens, shell spacing, navigation styling, list headers, table cards, action buttons, and filament color swatches. This keeps behavior and routing stable while making all inventory list pages feel closer to the mockup.

## Components

- `client/src/contexts/color-mode/index.tsx`: update Ant Design theme tokens for softer backgrounds, borders, primary color, buttons, and tables.
- `client/src/components/layout.tsx`: wrap routed content in a consistent page container and refine the footer.
- `client/src/components/header/index.tsx`: simplify the top bar controls and match the pill-like controls in the mockup.
- `client/src/components/column.tsx`: make list action buttons compact icon buttons and improve color/name cell alignment.
- `client/src/components/spoolIcon.css`: make filament indicators read as square swatches in list tables.
- `client/src/utils/overrides.css`: add global shell, sider, list, table, button, pagination, and responsive overrides.
- `client/src/index.tsx`: load the override stylesheet globally.

## Behavior

No data loading, filtering, sorting, pagination, live updates, or CRUD behavior should change. Existing list state stored in local storage remains compatible.

## Verification

Run TypeScript/build checks after implementation. If a dev server can run in this environment, inspect the Filaments and NFC Boxes pages visually for spacing, table, header, and sidebar regressions.
