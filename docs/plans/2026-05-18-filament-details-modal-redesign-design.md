# Filament Details Modal Redesign Design

## Scope

Redesign only the filament details modal opened from the filament list. The route-backed filament show page at `/filament/show/:id` remains unchanged.

## Approach

Keep Ant Design's `Modal` for focus handling, overlay behavior, keyboard dismissal, and close button behavior. Replace the modal title/body internals with a custom layout that matches the provided reference image: a large round color swatch, a blue `FILAMENT #id` pill, a bold vendor/name title, a registered-date block, and bordered field grids.

## Layout

The modal body uses a custom header followed by grouped sections:

- Overview grid: ID, name, manufacturer, price, material, color, comment.
- Physical properties: density, diameter, weight, spool weight.
- Print settings: extruder temperature, bed temperature.
- Identifiers: article number, external ID.
- Extra fields: rendered when configured, using existing extra-field display behavior.

Each row has an icon slot, muted label, and value. Empty values display as `-`. The color row preserves the existing `SpoolIcon` behavior for single and multi-color filament and displays the hex value when present.

## Styling

Add scoped classes in `client/src/utils/overrides.css` using the `spoolman-filament-detail-*` prefix. The design should match the reference's white panel, soft borders, subtle shadow, rounded field groups, blue pill, muted labels, dark values, and compact uppercase section headings.

On narrow screens, the header stacks and the two-column grids collapse to one column to avoid overlap.

## Testing

Add focused tests around the hook output where practical:

- Opening the modal renders the custom header, registered date, grouped labels, and formatted values.
- Missing optional values render as `-`.

Run the relevant client test command or typecheck/build command available in the project.
