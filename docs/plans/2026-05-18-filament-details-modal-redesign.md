# Filament Details Modal Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the filament list details modal to match the provided reference image while leaving the route-backed filament show page unchanged.

**Architecture:** Keep `antd` `Modal` as the shell and replace the modal title/body content in `client/src/pages/filaments/showModal.tsx` with custom presentational JSX. Add scoped CSS classes in `client/src/utils/overrides.css` for the reference layout, field grid, icons, spacing, and responsive behavior.

**Tech Stack:** React, TypeScript, Ant Design, Refine, Day.js, existing `SpoolIcon`, `NumberFieldUnit`, `ExtraFieldDisplay`, and app-wide CSS overrides.

---

### Task 1: Add Modal Rendering Tests

**Files:**
- Create: `client/src/pages/filaments/showModal.test.tsx`
- Read: `client/package.json`
- Read: `client/src/pages/filaments/showModal.tsx`

**Step 1: Write the failing test**

Create a test component that calls `useFilamentShowModal`, opens the modal with a representative filament, and asserts the new custom UI content is present:

```tsx
expect(screen.getByText("FILAMENT #1")).toBeInTheDocument();
expect(screen.getByText("eSun - PLA+ White")).toBeInTheDocument();
expect(screen.getByText("Registered")).toBeInTheDocument();
expect(screen.getByText("2026-05-14 13:31:10")).toBeInTheDocument();
expect(screen.getByText("Physical Properties")).toBeInTheDocument();
expect(screen.getByText("Print Settings")).toBeInTheDocument();
```

Add a second assertion path for missing optional values:

```tsx
expect(screen.getAllByText("-").length).toBeGreaterThan(0);
```

Mock `@refinedev/core` translation and settings/field hooks as needed so the hook can render without backend data.

**Step 2: Run test to verify it fails**

Run from `client`:

```bash
npx vitest run src/pages/filaments/showModal.test.tsx
```

Expected: FAIL because the current modal does not render the custom pill/header markup.

**Step 3: Commit**

```bash
git add client/src/pages/filaments/showModal.test.tsx
git commit -m "test: cover filament details modal redesign"
```

### Task 2: Replace Modal Body Markup

**Files:**
- Modify: `client/src/pages/filaments/showModal.tsx`

**Step 1: Implement minimal custom structure**

Replace the `Descriptions`-based body with small local render helpers:

```tsx
const emptyValue = "-";
const renderValue = (value: React.ReactNode) => value === undefined || value === null || value === "" ? emptyValue : value;
```

Render:

- Custom header with `SpoolIcon`, pill, title, and registered date.
- Custom section blocks and field grids.
- Existing value formatters for dates, money, numbers, comments, links, extra fields, and color.

Use icon components from `@ant-design/icons` where they map cleanly to the reference.

**Step 2: Run modal test**

Run from `client`:

```bash
npx vitest run src/pages/filaments/showModal.test.tsx
```

Expected: PASS.

**Step 3: Commit**

```bash
git add client/src/pages/filaments/showModal.tsx
git commit -m "feat: restructure filament details modal"
```

### Task 3: Add Reference-Matching CSS

**Files:**
- Modify: `client/src/utils/overrides.css`

**Step 1: Add scoped CSS**

Add classes prefixed with `spoolman-filament-detail-` for:

- wider modal and clean content padding,
- white body, soft shadow, and close-button spacing,
- header layout and large round swatch,
- blue pill,
- two-column bordered grids,
- icons/labels/value typography,
- uppercase section titles,
- responsive one-column collapse below tablet width.

**Step 2: Run verification**

Run from `client`:

```bash
npx vitest run src/pages/filaments/showModal.test.tsx
npm run build
```

Expected: both commands pass.

**Step 3: Commit**

```bash
git add client/src/utils/overrides.css
git commit -m "style: match filament details modal reference"
```

### Task 4: Final Review

**Files:**
- Review: `client/src/pages/filaments/showModal.tsx`
- Review: `client/src/utils/overrides.css`
- Review: `client/src/pages/filaments/showModal.test.tsx`

**Step 1: Check final diff**

```bash
git diff --stat HEAD~3..HEAD
git diff HEAD~3..HEAD -- client/src/pages/filaments/showModal.tsx client/src/utils/overrides.css client/src/pages/filaments/showModal.test.tsx
```

Expected: only the modal redesign, CSS, and focused tests changed.

**Step 2: Run final status**

```bash
git status --short
```

Expected: clean or only intentional uncommitted work.
