# VoiceVault Component Catalog

_Source of truth for UI components. Updated: 2026-02-26._

---

## Button

**Description:** Brutalist button with five visual variants and three sizes, supporting all native button attributes.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `"primary" \| "secondary" \| "ghost" \| "danger" \| "cyan"` | `"primary"` | Visual style variant |
| size | `"sm" \| "md" \| "lg"` | `"md"` | Button size (h-7 / h-9 / h-11) |
| className | `string` | — | Additional CSS classes |
| ...rest | `ButtonHTMLAttributes` | — | All native button props |

### Usage

```tsx
<Button variant="cyan" size="sm" onClick={handleClick}>
  Export
</Button>
```

### Visual Target
Monospace uppercase text, hard borders, no border-radius. Active state shifts 2px right+down. Focus ring uses `--cyan`. Danger/cyan variants use dim background with colored border.

---

## Badge

**Description:** Inline status label with optional pulsing dot indicator, used for live-status and category tags.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | `string` | — | Badge text (rendered uppercase) |
| variant | `"default" \| "cyan" \| "green" \| "amber" \| "red" \| "purple"` | `"default"` | Color variant |
| dot | `boolean` | — | Show pulsing dot before label |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<Badge label="Backend" variant="green" dot />
```

### Visual Target
10px uppercase monospace text, thin colored border with 25% opacity, dim background tint. Dot pulses with `rec-pulse` animation.

---

## Card

**Description:** Base container with hard border and dark surface background; also provides AccentCard (left-stripe variant) and sub-components.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| className | `string` | — | Additional CSS classes |
| ...rest | `HTMLAttributes<HTMLDivElement>` | — | All native div props |

**AccentCard** additional props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| accent | `"cyan" \| "green" \| "amber" \| "red" \| "purple"` | `"cyan"` | Left-border accent color |

**Sub-components:** `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`

### Usage

```tsx
<Card className="p-4">
  <CardHeader>
    <CardTitle>Section</CardTitle>
  </CardHeader>
  <CardContent>Body text</CardContent>
</Card>
```

### Visual Target
Zero border-radius, `--surface` background, `--border` edge. AccentCard adds a 2px left stripe in the accent color.

---

## SectionHeader

**Description:** Terminal-inspired section heading with optional number prefix, category label, and subtitle.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | — | Main heading text |
| num | `string` | — | Three-digit section number (e.g. "001") |
| category | `string` | — | Section type label |
| desc | `string` | — | Subtitle / description |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<SectionHeader num="001" title="EXPORT" desc="One-click Obsidian export" />
```

### Visual Target
`// 001` prefix in dim monospace, bold uppercase title, muted description text below.

---

## MetricCard

**Description:** Single-stat card with colored left accent, glow-on-hover effect, and variant-driven color scheme.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| value | `string \| number` | — | Large display value |
| label | `string` | — | Small uppercase label below value |
| variant | `"default" \| "pass" \| "warn" \| "fail" \| "info" \| "accent"` | `"default"` | Color variant |
| sublabel | `string` | — | Extra small text below label |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<MetricCard value={46} label="Passed" variant="pass" />
```

### Visual Target
2px left border in variant color, 2xl bold monospace value, 10px uppercase label. Hover produces a colored box-shadow glow.

---

## DataTable + StatusCell

**Description:** Horizontal-scrollable monospace table with alternating row backgrounds and an optional row-click handler. StatusCell renders colored uppercase status text.

### DataTable Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| columns | `Column<T>[]` | — | Column definitions (key, header, width?, render?) |
| data | `T[]` | — | Row data array |
| onRowClick | `(row: T) => void` | — | Optional row click handler |
| emptyMessage | `string` | `"No data"` | Message shown when data is empty |
| className | `string` | — | Additional CSS classes |

### Column<T>

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| key | `string` | — | Property key to read from row |
| header | `string` | — | Column header text |
| width | `string` | — | Optional CSS width |
| render | `(row: T) => ReactNode` | — | Custom cell renderer |

### StatusCell Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| label | `string` | — | Status text |
| variant | `"pass" \| "warn" \| "fail" \| "info"` | — | Color variant |

### Usage

```tsx
<DataTable
  columns={[
    { key: "name", header: "Name" },
    { key: "status", header: "Status", render: (row) => <StatusCell label={row.status} variant="pass" /> },
  ]}
  data={[{ name: "Test", status: "PASS" }]}
/>
```

### Visual Target
12px monospace text, uppercase bold headers on `--surface-3`, alternating `--surface` / `--surface-2` rows, `overflow-x-auto` for mobile.

---

## CodeBlock

**Description:** Syntax display block with filename header bar and clipboard copy button.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| code | `string` | — | Code content to display |
| filename | `string` | — | Filename shown in header bar |
| language | `string` | — | Language label (fallback if no filename) |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<CodeBlock code="const x = 1;" filename="example.ts" />
```

### Visual Target
`--surface-2` background, `--border-2` border, header bar with 10px uppercase filename + COPY button. Code area has `overflow-x-auto` and monospace 12px text.

---

## AlertCallout

**Description:** Left-accented alert box with icon, optional title, and content area for info/warn/error/success messages.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | `"info" \| "warn" \| "error" \| "success"` | — | Alert type (determines color + icon) |
| title | `string` | — | Optional bold title |
| children | `ReactNode` | — | Alert body content |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<AlertCallout variant="success" title="Export complete">
  File saved to /vault/notes.md
</AlertCallout>
```

### Visual Target
2px left border in variant color, dim tinted background, icon (ℹ/⚠/✗/✓) + bold title + body text layout.

---

## NavigationTabs

**Description:** Horizontal tab bar with bottom-border active indicator and keyboard-accessible tab buttons.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| tabs | `{ label: string; value: string; count?: number }[]` | — | Tab definitions |
| active | `string` | — | Currently active tab value |
| onChange | `(value: string) => void` | — | Called when a tab is clicked |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<NavigationTabs
  tabs={[
    { label: "All", value: "all", count: 10 },
    { label: "Active", value: "active" },
  ]}
  active="all"
  onChange={setTab}
/>
```

### Visual Target
Monospace uppercase 12px tab labels, 2px bottom border in `--cyan` for active tab, `overflow-x-auto` container with `shrink-0` buttons.

---

## TimelineEntry

**Description:** Vertical timeline item with dot connector, date, colored badge, and description text.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| date | `string` | — | Date/time text |
| badge | `string` | — | Badge label text |
| badgeVariant | `"default" \| "info" \| "warn" \| "pass" \| "fail"` | `"default"` | Badge color variant |
| description | `string` | — | Entry description |
| isLast | `boolean` | `false` | Hides vertical connector line |

### Usage

```tsx
<TimelineEntry
  date="2026-02-26"
  badge="EXPORT"
  badgeVariant="pass"
  description="Recording exported successfully"
/>
```

### Visual Target
Left dot (2×2, colored square) with vertical `--border-2` line, 10px monospace date, inline badge pill, 12px description text.

---

## CollapsibleSection

**Description:** Toggle-able section with animated disclosure arrow and accessible `aria-expanded` / `aria-controls` attributes.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | — | Section heading text |
| defaultOpen | `boolean` | `false` | Initial open state |
| children | `ReactNode` | — | Collapsible content |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<CollapsibleSection title="Details" defaultOpen>
  <p>Content here</p>
</CollapsibleSection>
```

### Visual Target
Full-width button with ▶/▼ arrow prefix, monospace uppercase title, bottom border divider. Content area has bottom padding when open.

---

## Skeleton

**Description:** Pulse-animated placeholder block for loading states, with specialized variants for cards and list items.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| className | `string` | — | Width/height via Tailwind classes |

**Variants:** `Skeleton` (basic pulse), `ScanSkeleton` (scan-line effect), `SummaryCardSkeleton`, `RecordingItemSkeleton`

### Usage

```tsx
<Skeleton className="h-6 w-48" />
<SummaryCardSkeleton />
```

### Visual Target
`--surface-3` background with CSS `animate-pulse`. ScanSkeleton adds a cyan-tinted sweep animation.

---

## Spinner

**Description:** CSS border-based loading spinner with size and color variants.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| size | `"sm" \| "md" \| "lg"` | `"md"` | Spinner diameter (3.5 / 5 / 7) |
| variant | `"default" \| "cyan" \| "green" \| "amber"` | `"default"` | Color variant |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<Spinner size="sm" variant="cyan" />
```

### Visual Target
Circular border spinner — dim track with colored top-border head. `animate-spin` rotation.

---

## EmptyState

**Description:** Centered placeholder for empty data views with optional icon and action button.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | — | Bold heading text |
| description | `string` | — | Muted subtext |
| icon | `ReactNode` | — | Optional icon element |
| action | `ReactNode` | — | Optional CTA (e.g. Button) |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<EmptyState
  title="No recordings"
  description="Start a recording to see data here."
/>
```

### Visual Target
Bordered container, centered layout, monospace uppercase title, muted description, generous vertical padding (py-12).

---

## ErrorState

**Description:** Error display with red left accent, message extraction from `ApiError` / `Error`, and optional retry button.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| title | `string` | `"Error"` | Error heading |
| error | `unknown` | — | Error object (ApiError, Error, or unknown) |
| onRetry | `() => void` | — | Optional retry callback (shows Retry button) |
| className | `string` | — | Additional CSS classes |

### Usage

```tsx
<ErrorState
  title="Failed to load"
  error={new Error("Network timeout")}
  onRetry={() => refetch()}
/>
```

### Visual Target
2px red left border, `--red-dim` background, ⚠ prefix on title, secondary Retry button when `onRetry` provided.
