# Highlighter & Commenter — Chrome Extension Design

**Date:** 2026-04-28
**Status:** Design (pending implementation plan)
**Owner:** nitin
**Target platform:** Chrome on Windows (Manifest V3); should work on any Chromium browser

## Goal

A personal Chrome extension that lets the user highlight text on any webpage with one of 12 colors and attach Google-Docs-style floating comments. Highlights and comments are stored locally and re-applied automatically every time the page is reloaded. PDFs are supported via an embedded viewer.

Single-user. No accounts, no backend, no cross-device sync.

## User Experience

### Highlighting

- Select text on a page → press **`Alt+H`** → text is highlighted using the **last-used color** (default Lemon `#FFF59D` on first run).
- A small **color chip** appears immediately at the end of the new highlight. Clicking the chip opens a 12-swatch popover; clicking a swatch recolors the highlight and updates the last-used color.
- Selecting text also surfaces a **floating selection toolbar** (under the selection) with the 12 swatches and a 💬 comment button — equivalent to using the keyboard shortcut.
- Clicking an existing highlight opens the same chip popover (recolor or delete).
- **Re-highlighting** text already covered by a highlight in another color: the new color **replaces** the old one.

### Commenting

- Select text → press **`Alt+C`** (or click 💬 in the toolbar) → an empty comment bubble pops out, anchored to the selection.
- If the text is **already highlighted**, the comment attaches to that highlight and is marked with a small **comment icon** in the highlight color, placed immediately after the highlighted span.
- If the text is **not highlighted**, the extension adds a subtle **slate underline** (2 px, slate-400 `#94A3B8`) under the selected text and a **slate-colored comment icon** after it. No vibrant highlight color is applied.
- The comment icon is a small numbered circle (number = count of comments on that span; v1 supports a single comment per span, so this is always "1" — kept as a circle for visual consistency and future extensibility).

### Comment bubble

- The bubble is **anchored to the comment icon** (positioned via `getBoundingClientRect()`).
- Default opens **downward** from the icon with a small tail pointing up.
- **Auto-flips**:
  - If it would overflow the bottom of the viewport → opens upward.
  - If it would overflow the right of the viewport → right-aligns to the icon.
- Bubble is ~240 px wide, white card with subtle shadow, sans-serif body text.
- Contents:
  - Header: "You · {relative-time}"
  - Body: the comment text (editable in place)
  - Quoted text snippet (the anchored selection), shown italic and dimmed
  - Actions: **Edit**, **Delete**
- **Delete** behavior:
  - If the comment is on a vibrant highlight → comment + icon removed; **highlight stays**.
  - If the comment is on a slate-underline (comment-only) span → comment + icon + slate underline all removed (since the only reason for the underline was the comment).

### Persistence

- Annotations are saved to `chrome.storage.local`, keyed by canonical URL (origin + pathname + a normalized search string; hash is dropped).
- On every page load, the content script reads annotations for the URL and re-applies them after the DOM is settled.
- The extension watches for late-loading content (lazy-rendered articles, infinite scroll) with a `MutationObserver` and re-attempts orphaned highlights when new text appears.

### Anchoring (re-attaching highlights on reload)

A highlight is saved with three layered anchors:

1. **Selector + char-offset** — CSS selector path of the nearest stable ancestor (an element with an `id` or a deterministic structural path), plus character offsets within that ancestor's text content.
2. **Text fingerprint** — the highlighted text itself, plus a ~32-character prefix and suffix from the surrounding text. Used to recover the selection by searching the page when selectors fail.
3. **Quote** — the verbatim selected text, used as the human-readable label in the orphan badge.

On reload, the extension tries (1), then (2). If both fail, the annotation is marked **orphaned** and a small badge (e.g., a 🔖 icon) appears in the bottom-right corner of the page showing the count and a list of orphaned quotes. Each orphan can be:
- **Re-attached** by clicking it, then clicking the new location on the page.
- **Deleted**.

The user is never silently losing a highlight.

### Extension popup (action icon)

Clicking the toolbar icon opens a small popup (~360 px wide) showing:

- **Header** — the canonical URL of the active tab and the total annotation count.
- **List** — every annotation on this URL, scrollable. Each entry shows the color/slate marker, the quoted text, and the comment text (if any). Clicking an entry **scrolls the page to that annotation** and pulses the highlight briefly.
- **Footer** — a small "Open PDF in annotator" button when the active tab is a PDF (see PDF section).

No global "all annotations across the web" dashboard in v1. Defer to v2.

### PDF support

- When the user clicks the "Open PDF in annotator" button in the extension popup, the current PDF URL is opened in an embedded **PDF.js**-based viewer (a new tab pointing at `pdf-viewer.html` packaged with the extension, with the PDF URL as a query param).
- Inside that viewer the user gets the same shortcuts (`Alt+H`, `Alt+C`), the same 12 colors, the same comment bubbles. Annotations are stored under the canonical PDF URL.
- Anchoring inside PDFs uses **page number + text fingerprint** (no DOM selectors — PDF text positions are coordinates, not nodes).
- Chrome's default PDF viewer is **not** overridden. The user opts in per-PDF.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+H` | Highlight current selection in last-used color |
| `Alt+C` | Add a comment to current selection |
| `Esc` | Close any open popover / bubble / toolbar |

Shortcuts are registered through Chrome's `commands` API where possible (so they show up in `chrome://extensions/shortcuts` and are user-rebindable). Selection-context shortcuts that need the live `Selection` object are handled in the content script's `keydown` listener.

### Color palette (12 colors, locked)

| # | Name | Hex |
|---|------|-----|
| 1 | Lemon | `#FFF59D` |
| 2 | Honey | `#FFE082` |
| 3 | Apricot | `#FFCC80` |
| 4 | Coral | `#FFAB91` |
| 5 | Rose | `#F8BBD0` |
| 6 | Lavender | `#E1BEE7` |
| 7 | Periwinkle | `#C5CAE9` |
| 8 | Sky | `#B3E5FC` |
| 9 | Aqua | `#B2EBF2` |
| 10 | Mint | `#B2DFDB` |
| 11 | Sage | `#C8E6C9` |
| 12 | Lime | `#DCEDC8` |

Comment-only marker color: slate-400 `#94A3B8` (underline + icon).

## Architecture

Manifest V3 Chrome extension, vanilla JavaScript, no build step. Loaded unpacked during development; zipped for distribution.

```
highlighter-extension/
├── manifest.json
├── background.js              # service worker — command dispatch + storage routing
├── content/
│   ├── content.js             # injected on every page; orchestrates everything
│   ├── anchoring.js           # save/restore selectors + fingerprints
│   ├── highlight.js           # apply/remove highlights, color chip popover
│   ├── comment.js             # comment bubble UI, popover positioning, auto-flip
│   ├── toolbar.js             # floating selection toolbar (12 swatches + 💬)
│   ├── orphan-badge.js        # bottom-right badge for orphaned annotations
│   └── styles.css             # injected styles for highlights, bubbles, toolbar
├── popup/
│   ├── popup.html             # action popup
│   ├── popup.js
│   └── popup.css
├── pdf-viewer/
│   ├── viewer.html            # PDF.js-based viewer with annotation overlay
│   ├── viewer.js
│   ├── viewer.css
│   └── pdf.js + pdf.worker.js (vendored from PDF.js distribution)
└── icons/                     # 16/32/48/128 px extension icons
```

### Components

| Component | Responsibility |
|-----------|----------------|
| `manifest.json` | MV3 manifest. `host_permissions: ["<all_urls>"]`, `permissions: ["storage", "activeTab"]`, `commands` for `Alt+H` / `Alt+C`, content script registered for `<all_urls>`, action popup, web-accessible resource for the PDF viewer. |
| `background.js` | Service worker. Receives keyboard commands from `chrome.commands`, forwards them to the active tab's content script via `chrome.tabs.sendMessage`. Centralizes `chrome.storage.local` reads/writes (so popup and content script have one path). |
| `content.js` | Entry point in every page. On load: read annotations for canonical URL → restore highlights via `anchoring.js` → mount toolbar/bubble UI shells. Listens for `keydown` and selection events; routes to `highlight.js` / `comment.js`. Owns the `MutationObserver` that retries orphaned anchors when new content appears. |
| `anchoring.js` | Pure functions. `serialize(range) → AnnotationAnchor` and `deserialize(anchor, document) → range \| null`. Handles selector + offset, text fingerprint with prefix/suffix, and the search algorithm. |
| `highlight.js` | Wraps a `Range` in `<span class="hlx-highlight" data-id="…" style="background:…">` (splitting text nodes as needed). Renders the post-creation color chip. Handles re-color and delete. |
| `comment.js` | Renders the comment icon and the popover bubble. Computes position from icon's `getBoundingClientRect()`. Implements auto-flip. Handles edit / delete. |
| `toolbar.js` | Renders the floating toolbar near a live selection (12 swatches + 💬). Hides on click-outside or Esc. |
| `orphan-badge.js` | If any annotations failed to attach, renders the bottom-right badge with count and list. Click → re-attach flow. |
| `popup.{html,js}` | Lists annotations for the active tab's canonical URL. Entry click → sends a `scroll-to` message to the content script. Renders the "Open PDF in annotator" button when active tab is a PDF. |
| `pdf-viewer/` | Standalone HTML page using vendored PDF.js. Renders the PDF; exposes the same selection / `Alt+H` / `Alt+C` flow against the rendered text layer. Annotations stored under the source PDF URL. |

### Data model

A single record in `chrome.storage.local`, namespaced by canonical URL.

```json
{
  "annotations": {
    "https://en.wikipedia.org/wiki/Bicycle": [
      {
        "id": "01H8K7WXYZ...",                    // ULID, generated client-side
        "createdAt": 1714291200000,
        "updatedAt": 1714291200000,
        "kind": "highlight" | "comment-only",
        "color": "#FFF59D",                       // hex (one of the 12) OR null for comment-only
        "anchor": {
          "selector": "main > article > p:nth-of-type(2)",
          "startOffset": 142,
          "endOffset": 218,
          "quote": "They are the principal means of transportation in many parts of the world.",
          "prefix": "billion worldwide. ",
          "suffix": " Cycling is widely regarded"
        },
        "comment": {                              // optional
          "text": "Big claim — citation?",
          "createdAt": 1714291260000,
          "updatedAt": 1714291260000
        }
      }
    ]
  },
  "settings": {
    "lastUsedColor": "#FFF59D"
  }
}
```

### Data flow

**Create highlight (`Alt+H`):**
```
keydown(Alt+H)
  → content.js captures Selection
  → highlight.js wraps Range, applies last-used color
  → anchoring.js serializes Range → anchor
  → background.js (via sendMessage) writes annotation to chrome.storage.local
  → color chip rendered next to new highlight
```

**Page reload:**
```
content.js loads
  → reads annotations for canonical URL
  → for each: anchoring.deserialize(anchor) → Range or null
      ├── Range found → highlight.js or comment.js renders it
      └── null → push to orphan list
  → if any orphans → orphan-badge.js renders the badge
  → MutationObserver retries orphans whenever new text nodes are added
```

**Open popup:**
```
user clicks toolbar icon
  → popup.js queries active tab's URL
  → reads annotations for that canonical URL from chrome.storage.local
  → renders list; on click, sendMessage to tab → content.js scrolls + pulses
```

### Error handling

The extension has to behave well on the messy real web. Concrete failure modes and how each is handled:

| Failure | Handling |
|---------|----------|
| Anchor's selector + offset fails (DOM changed) | Fall back to text-fingerprint search (prefix + quote + suffix). |
| Text fingerprint also fails | Mark annotation `orphaned`; render in the orphan badge. Never delete user data. |
| Page is a Single-Page App that swaps content without a navigation event | `MutationObserver` on `document.body` re-runs the restore pass when large DOM changes occur and the URL has changed. |
| Two annotations cover overlapping ranges (after restore) | Render both, one on top of the other. Re-highlight rule (`Alt+H` over an existing highlight) replaces the underlying color cleanly. |
| `chrome.storage.local` quota approached (~10 MB) | Show a one-time warning in the popup once total storage exceeds 80% of quota. v1 does not auto-prune. |
| Content script unable to inject (e.g. `chrome://` pages, the Web Store, some `file://` paths) | The extension is silently inactive on those pages. The popup shows "Highlights aren't supported on this kind of page." |
| Same annotation ID conflict (impossible in single-user, but defensively) | New write wins by `updatedAt`. |
| PDF viewer can't find a highlighted text run after PDF re-render | Same orphan flow as web pages. |

### Testing

- **Manual test matrix** for v1 (no automated tests required, but a checklist):
  - Wikipedia article (stable DOM).
  - Major news site (NYT, BBC) — DOM that re-flows ads.
  - A heavy SPA (Twitter / Reddit) — late-loading content.
  - Medium / Substack — server-rendered article body.
  - A PDF (academic paper) opened in the annotator.
  - Reload, close-tab-and-reopen, restart-browser scenarios for each.
- **Unit-level smoke tests** (optional, vanilla JS test runner): `anchoring.serialize` + `deserialize` round-trip on representative DOM fragments; popover position auto-flip near each viewport edge; storage round-trip.

## Out of scope (v1)

- Cross-device sync (no Chrome Sync, no backend).
- Multi-user / sharing.
- Multiple comments per highlight (the data model leaves room; UI doesn't expose it).
- Reply threads.
- Resolved-but-kept comments (Resolve = Delete in v1).
- Export / import of annotations.
- Global "all my annotations" dashboard.
- Image / video annotation.
- Browsers other than Chrome / Chromium.
- Per-site disable / pause.
- Automatic PDF interception (Chrome's default viewer is not overridden).

## Implementation choices (made for the user — pragmatic)

The user explicitly asked for a fast implementation that "just works 98% of the time" without corner-case engineering. Calls made on their behalf:

- **Manifest V3, vanilla JS, no build step.** Zero dependency hell. Easy to iterate. Source files map 1:1 to loaded files.
- **No bundler, no TypeScript.** Each module is a plain `.js` file. The content script registers them in dependency order in `manifest.json`.
- **No external runtime libraries** for popover positioning — a ~50-line `getBoundingClientRect`-based positioner with two flip rules is sufficient.
- **PDF.js vendored** as a pinned release zip rather than fetched at runtime. Bumps require manually re-vendoring.
- **`chrome.storage.local`**, not IndexedDB. 10 MB is plenty for a single-user annotator (an annotation averages well under 1 KB).
- **ULIDs** for annotation IDs (sortable, no collision risk in single-user, easy to generate in 30 lines without a dep).
- **No telemetry, no analytics, no error reporting.** Personal tool.
- **Distribution: load-unpacked from a local folder.** No Chrome Web Store submission in v1.

## Open questions left for the implementation plan

These are implementation-level details, not design questions — to be resolved while writing the plan, not bounced back to the user:

- Exact algorithm for "stable selector path" (which ancestor to use, how to break ties).
- Concrete `MutationObserver` debounce / batching strategy.
- Color chip dismissal heuristic (timeout vs click-outside vs both).
- PDF.js version pin and viewer config.
