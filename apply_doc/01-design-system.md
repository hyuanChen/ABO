# OpenCovibe — Design System & Visual Tokens

**Use this doc when**: styling any component. All Tailwind decisions should reference these tokens.

---

## Color Palette

### Surface layers (dark mode first — app is primarily dark)

```
bg-gray-950    app background (outermost)
bg-gray-900    sidebar background
bg-gray-800    card / panel surface
bg-gray-750    (custom: #2a2a2a) inset surface, tool call background
bg-gray-700    hover state, selected item
bg-gray-600    disabled elements
```

### Text hierarchy

```
text-white          primary heading, active item
text-gray-100       primary body text
text-gray-300       secondary text, metadata
text-gray-400       placeholder, hint, muted label
text-gray-500       disabled text
```

### Semantic colors

```
text-blue-400 / bg-blue-600     primary action, user message bubble
text-green-400 / bg-green-600   success, running state, completed
text-red-400 / bg-red-600       error, danger, failed
text-yellow-400 / bg-yellow-600 warning, attention
text-purple-400 / bg-purple-600 AI/assistant messages
text-orange-400                  tool calls, pending
text-cyan-400                    info, links
```

### Tool call colors (from `utils/tool-colors.ts`)

Each tool type has an assigned color. When rendering tool cards:
- Use the `getToolColor(toolName)` util to get the right hue
- Apply as a left border: `border-l-2 border-{color}-500`

---

## Typography

```
text-xs   / font-mono   code, file paths, command output  (12px)
text-sm                 body text, list items             (14px)
text-base               message content                   (16px)
text-lg   / font-medium section headers                   (18px)
text-xl   / font-semibold page titles                     (20px)
```

---

## Spacing System

Use consistent spacing to create visual rhythm:

```
gap-1   / p-1    4px   tight inline elements
gap-2   / p-2    8px   default item padding
gap-3   / p-3    12px  standard component padding
gap-4   / p-4    16px  section gaps
gap-6   / p-6    24px  large section separation
gap-8   / p-8    32px  page-level padding
```

---

## Border Radius

```
rounded      4px   buttons, small chips
rounded-md   6px   cards, inputs
rounded-lg   8px   panels, modals
rounded-xl   12px  large cards
rounded-full       avatars, badges, pills
```

---

## Component Recipes

### Card

```svelte
<div class="rounded-lg bg-gray-800 border border-gray-700 p-4">
  <!-- content -->
</div>
```

### Primary Button

```svelte
<button class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500
               text-white text-sm font-medium transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed">
```

### Ghost Button

```svelte
<button class="px-3 py-1.5 rounded-md hover:bg-gray-700
               text-gray-300 hover:text-white text-sm transition-colors">
```

### Danger Button

```svelte
<button class="px-3 py-1.5 rounded-md bg-red-600/20 hover:bg-red-600/40
               text-red-400 hover:text-red-300 text-sm transition-colors">
```

### Input

```svelte
<input class="w-full rounded-md bg-gray-900 border border-gray-700
              text-gray-100 text-sm px-3 py-2
              placeholder:text-gray-500
              focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50
              transition-colors">
```

### Badge / Pill

```svelte
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
             text-xs font-medium bg-gray-700 text-gray-300">
```

### Status indicator dot

```svelte
<!-- Running -->
<span class="h-2 w-2 rounded-full bg-green-400 animate-pulse"></span>
<!-- Error -->
<span class="h-2 w-2 rounded-full bg-red-400"></span>
<!-- Idle -->
<span class="h-2 w-2 rounded-full bg-gray-500"></span>
```

### Divider

```svelte
<hr class="border-gray-700 my-4">
<!-- or -->
<div class="h-px bg-gray-700 my-4"></div>
```

### Loading skeleton

```svelte
<div class="h-4 rounded bg-gray-700 animate-pulse w-3/4"></div>
```

### Icon button (24px touch target)

```svelte
<button class="p-1.5 rounded hover:bg-gray-700 text-gray-400
               hover:text-gray-200 transition-colors"
        title="Action name">
  <svg class="h-4 w-4" .../>
</button>
```

---

## Layout Patterns

### Full-height two-column (sidebar + content)

```svelte
<div class="flex h-screen overflow-hidden bg-gray-950">
  <!-- Sidebar -->
  <div class="w-64 shrink-0 flex flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto">
    ...
  </div>
  <!-- Main content -->
  <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
    ...
  </div>
</div>
```

### Three-column (sidebar + chat + details)

```svelte
<div class="flex h-screen overflow-hidden">
  <div class="w-64 shrink-0 ..."><!-- nav sidebar --></div>
  <div class="flex-1 min-w-0 flex flex-col ..."><!-- chat --></div>
  <div class="w-80 shrink-0 ..."><!-- details panel --></div>
</div>
```

### Sticky header over scrollable content

```svelte
<div class="flex flex-col h-full">
  <div class="shrink-0 border-b border-gray-800 px-4 py-3">
    <!-- header -->
  </div>
  <div class="flex-1 overflow-y-auto">
    <!-- scrollable content -->
  </div>
</div>
```

---

## Motion / Animation

Use sparingly. Preferred transitions:

```
transition-colors duration-150    color changes on hover
transition-opacity duration-200   show/hide fades
transition-transform duration-200 expand/collapse
```

Avoid `transition-all` (too broad, causes jank).

Animate entrance with:

```svelte
<!-- Fade in -->
<div class="animate-in fade-in duration-200">

<!-- Slide from bottom -->
<div class="animate-in slide-in-from-bottom-2 duration-200">
```

---

## Icon System

All icons are inline SVG (no icon library). Standard sizes:

```
h-3 w-3    12px  tiny indicators
h-4 w-4    16px  standard inline icon
h-5 w-5    20px  button icons, sidebar items
h-6 w-6    24px  page icons, hero
```

Stroke style: `stroke-current fill-none stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`

---

## Accessibility Rules

```
Focus rings     focus-visible:ring-2 focus-visible:ring-blue-500 (not focus:)
Contrast        text on bg must meet 4.5:1 ratio — prefer text-gray-100 on bg-gray-800
Button labels   always include aria-label if icon-only
Disabled state  opacity-50 + cursor-not-allowed + aria-disabled
```

---

## Dark / Light Mode

The app defaults dark. Light mode uses `.light` class on `<html>`. Pattern:

```svelte
<div class="bg-gray-900 dark:bg-gray-900 text-gray-100 dark:text-gray-100">
<!-- Currently app is dark-only; do not add light-mode variants unless implementing full toggle -->
```
