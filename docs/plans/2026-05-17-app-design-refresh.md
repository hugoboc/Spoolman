# App Design Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the Spoolman client shell and shared list/table pages to match the supplied design direction.

**Architecture:** Keep Refine and Ant Design as the UI foundation. Apply most visual changes through Ant Design theme tokens and global overrides, with small component changes only where markup needs better hooks or more appropriate controls.

**Tech Stack:** React 19, Vite, TypeScript, Refine, Ant Design 5, CSS overrides.

---

### Task 1: Load Global Visual Overrides

**Files:**
- Modify: `client/src/index.tsx`
- Modify: `client/src/utils/overrides.css`

**Steps:**
1. Import `./utils/overrides.css` from `client/src/index.tsx`.
2. Expand `overrides.css` with app-level background, layout, list, table, button, pagination, and responsive styles.
3. Preserve existing `#qty-input` behavior.

**Verification:**
- Run `npm run build` from `client`.
- Expected: TypeScript and Vite build complete without errors.

### Task 2: Tune Ant Design Theme Tokens

**Files:**
- Modify: `client/src/contexts/color-mode/index.tsx`

**Steps:**
1. Add token values for primary orange, border radius, backgrounds, text colors, borders, shadows, and controls.
2. Add component token overrides for `Layout`, `Menu`, `Button`, `Table`, `Card`, `Pagination`, and `Input`.
3. Keep the existing light/dark algorithm switch working.

**Verification:**
- Run `npm run build` from `client`.
- Expected: no type errors.

### Task 3: Refresh Shell Layout and Header

**Files:**
- Modify: `client/src/components/layout.tsx`
- Modify: `client/src/components/header/index.tsx`

**Steps:**
1. Wrap route content in a stable `.spoolman-content-shell` container.
2. Give the footer a lighter, compact app-footer style.
3. Convert the theme switch into an icon button using Ant Design icons.
4. Keep language selection and QR scanner behavior unchanged.

**Verification:**
- Run `npm run build` from `client`.
- Expected: no type errors.

### Task 4: Polish Shared Table Cells and Actions

**Files:**
- Modify: `client/src/components/column.tsx`
- Modify: `client/src/components/spoolIcon.css`

**Steps:**
1. Add class names to action buttons and filament color/name cells.
2. Render action buttons as compact icon-only controls with tooltips/titles preserved.
3. Restyle spool icons as square swatches in table rows while retaining multi-color support.

**Verification:**
- Run `npm run build` from `client`.
- Expected: no type errors.

### Task 5: Final Smoke Test

**Files:**
- No new files.

**Steps:**
1. Run `npm run build` from `client`.
2. If possible, start `npm run dev` from `client` and inspect `/filament`, `/spool`, `/vendor`, and `/nfc-box`.
3. Confirm no table behavior, route behavior, or modals are broken.

**Verification:**
- Build succeeds.
- Dev server starts or any environment blocker is documented.
