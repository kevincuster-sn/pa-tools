# Claude Code Prompt Pack — ServiceNow PA Tools (working name)

Run these prompts in order. Each one is a self-contained instruction to Claude Code. Stop after each prompt, review what Claude built, run/test it, then move on. Do not paste them all at once — interactive review between steps is the whole point.

The app being built:

- **Stack**: Electron + Next.js (renderer) + React + TypeScript + Tailwind CSS
- **Persistence**: zipped JSON files with `.pamap` extension (PA Map). All local — no cloud.
- **Audience**: ServiceNow Platform Architects, primarily working federal/national-security accounts.
- **Feature 1 in this pass**: Capability Map view — categories and capabilities sourced from the May 2026 Full Capability Map slide, with per-capability status tracking and per-category enable/disable.
- **Later features** (don't build yet): Product Adoption Roadmap (maturity lanes), Technical Roadmap (quarterly lanes).

---

## Prompt 1 — Project scaffold

```
You are setting up a new Electron + Next.js + React + TypeScript + Tailwind CSS desktop application for me. The app is a workbench for ServiceNow Platform Architects. Name it `pa-tools` for now. You are currently in the application directory at ~/Code/pa-tools. Use pnpm.

Set up the project with this structure and these conventions:

1. Electron main process** in `electron/main.ts` — creates a single BrowserWindow (1600x1000 default, restore prior size to user data dir), loads the Next.js dev server in dev mode and the exported static build in production. Includes the standard Electron security baseline: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` only if needed for the preload, otherwise true.

2. **Preload script** in `electron/preload.ts` — exposes a typed `window.api` surface via `contextBridge`. For now, just stub these methods (real implementations come later):
   - `openFile(): Promise<{ path: string; data: unknown } | null>`
   - `saveFile(payload: { path?: string; data: unknown }): Promise<{ path: string } | null>`
   - `saveFileAs(payload: { data: unknown }): Promise<{ path: string } | null>`
   - `getRecentFiles(): Promise<string[]>`
   - `onMenuAction(handler: (action: string) => void): void`

3. **Next.js renderer** — use Next.js 16.2.6 with the App Router, configured to export as a static site (`output: 'export'`) so Electron can load it from disk in production. Tailwind CSS configured. TypeScript strict mode on.

4. **Folder layout**:

   pa-tools/
     electron/
       main.ts
       preload.ts
       ipc/           (split by domain — file-io, menu, etc.)
     renderer/        (the Next.js app lives here)
       app/
       components/
       lib/
       data/          (seed data, schemas)
       state/         (state management, see below)
     shared/          (types shared between main and renderer)
     scripts/         (build scripts, capability-map extractor will go here)

5. **Build/run scripts** in `package.json`:
   - `pnpm dev` — runs Next dev server + Electron pointed at it concurrently
   - `pnpm build` — builds the Next export then packages with electron-builder
   - `pnpm typecheck`, `pnpm lint`, `pnpm format`

6. **Quality gate**: ESLint + Prettier configured. Husky pre-commit running typecheck + lint on staged files. Vitest set up for unit tests (we'll write tests against the data model in a later prompt).

7. **State management**: install Zustand. Don't build any stores yet — just confirm it works.

8. **Versioning**: pin Node 24 LTS in `.nvmrc` and `engines`.

Once the scaffold runs (`pnpm dev` opens an Electron window showing a placeholder Next page that says "PA Tools"), stop and tell me. Don't proceed to features yet.
```

---

## Prompt 2 — Brand tokens and base UI shell

```
Now build the app shell and brand tokens. The look should feel like a professional internal tool — dense, scannable, no flashy gradients. Tailwind + CSS variables.

1. **Brand tokens** in `renderer/app/globals.css` as CSS custom properties (light + dark mode):
   - `--bg`, `--bg-elevated`, `--bg-sunken`
   - `--fg`, `--fg-muted`, `--fg-subtle`
   - `--border`, `--border-strong`
   - `--accent` (primary action color)
   - `--accent-fg` (text on accent)
   - Status colors that we'll use for capability state (these matter — pick distinct, accessible hues, not all greens):
     - `--status-not-licensed` (neutral gray)
     - `--status-no-intent` (slate)
     - `--status-not-in-use` (amber)
     - `--status-planning` (blue)
     - `--status-implementing` (violet)
     - `--status-in-use` (emerald)
   Wire these through `tailwind.config.ts` so I can write `bg-status-planning` etc.

2. **App shell layout**:
   - Top menu bar (uses native Electron Menu — File, Edit, View, Help). File menu has: New, Open…, Open Recent ▸, Save (Ctrl/Cmd+S), Save As… (Ctrl/Cmd+Shift+S), Close.
   - Left sidebar (collapsible, ~240px) for navigating between features: "Capability Map", "Adoption Roadmap" (disabled/coming soon), "Technical Roadmap" (disabled/coming soon). Use lucide-react icons.
   - Main content area.
   - Status bar at bottom: shows current file name, dirty-state indicator (a dot + "Unsaved changes" text when dirty), and a discrete autosave timestamp when relevant.

3. **Dirty-state tracking** in a Zustand store (`renderer/state/document.ts`): holds `currentDocument`, `currentFilePath`, `isDirty`, and actions `loadDocument`, `markDirty`, `markClean`. Title bar reflects dirty state with a `•` prefix (standard desktop-app convention: `• Untitled — PA Tools` or `• MyAccount.pamap — PA Tools`).

4. **Unsaved-changes guard**: if the user tries to close the window, open another file, or create a new document while `isDirty`, show a native Electron dialog ("Save changes to <name>?" with Save / Don't Save / Cancel buttons). Implement this via IPC between renderer and main.

5. Keep the visual style restrained — small radius (4-6px), no heavy shadows, no gradients, clear separators. This is a tool, not a marketing site.

Show me a screenshot equivalent (or just describe what's on screen) when you're done. Don't add the capability map content yet.
```

---

## Prompt 3 — File format and IPC

````
Define the `.pamap` file format and wire up real open/save through Electron IPC.

1. **File format spec** in `shared/file-format.ts`:
   - A `.pamap` file is a zip archive (use `jszip` in the renderer, and stream via Node `fs` in main).
   - Contents:
     ```
     manifest.json     — { formatVersion: 1, appVersion: "x.y.z", createdAt, updatedAt, fileId (uuid) }
     document.json     — the actual document payload (typed)
     capability-map.json — the customer's capability map state (status per capability, enabled categories, notes)
     attachments/      — reserved for future use (empty for now)
     ```
   - Define TypeScript interfaces for everything. The top-level `Document` type contains a `customer` field (name, account ID optional, notes) and a `capabilityMap` field.

2. **Versioning + migrations** in `shared/migrations.ts`:
   - Each format version has an explicit migration function from N → N+1.
   - On load, if `formatVersion` is older, run migrations sequentially. If newer than the app knows about, refuse to open and show a clear error ("This file was created with a newer version of PA Tools").
   - Stub the v1 → v2 migration as identity for now, just so the plumbing exists.

3. **Validation**: install `zod`. Define schemas matching the TS interfaces, parse on load. If validation fails, show the user the validation error path (don't just silently fail).

4. **IPC handlers** in `electron/ipc/file-io.ts`:
   - `file:open` — opens native `dialog.showOpenDialog` filtered to `.pamap`, reads + unzips + validates, returns the Document or an error.
   - `file:save` — if `currentFilePath` exists, zips and writes there; otherwise delegates to Save As.
   - `file:save-as` — opens `dialog.showSaveDialog`, zips and writes.
   - `file:recent` — maintains a list of the last 10 opened files in `app.getPath('userData')/recent-files.json`. Surface it via the File ▸ Open Recent menu and dynamically rebuild the Electron menu when it changes.

5. **Renderer integration**: hook the document store into IPC. On successful save, `markClean()`. On open, replace the document and `markClean()`. On any mutation in the store, `markDirty()`.

6. **Tests** with Vitest: round-trip a sample document through `.pamap` (write → read → compare). Validate that an invalid file is rejected. Validate the migration runner with a fake v0 → v1 migration in a test fixture.

When File ▸ Save As writes a real `.pamap` zip to disk that I can unzip externally and read the JSON inside, stop and show me.
````

---

## Prompt 4 — Capability Map data model + seed extractor

```
Build the capability map data model and a one-time extractor script that turns the official ServiceNow Capability Map PowerPoint into seed JSON.

## Background

The source slide groups capabilities into three layers:

1. **Solution categories** (upper section): named labels like ITSM, ITOM, HRSD, WSD, SAM, EAM, IRM, SIR, Operational Sustainability Mgmt (ESG), SPM, FSM, FSO, EA, CPQ/Sales CRM, CSM, Healthcare & Life Sciences, Manufacturing, Public Sector, Retail Service Mgmt, TPSM, TPRM, BCM, Operational Technology, Privacy Mgmt, Legal Service Delivery, Health & Safety, Sourcing & Procurement Ops, Veza from ServiceNow, Armis from ServiceNow, HAM, App Development, AI Control Tower, Vulnerability Response (USEM), Core Business Transformation. Each category is surrounded by capability tiles.

2. **AI-Native pillars** — the slide has four large column containers: SENSE, DECIDE, ACT, SECURE. Inside them sits a foundational platform layer with capabilities like CMDB/CSDM, Context Engine, RaptorDB Professional, Workflow Data Fabric, Zero-Copy Connectors, MCP & A2A, Data Catalog, Service Catalog, Platform Analytics, AI Skills, AI Models, AI Agent Studio, AI Agent Fabric, AI Agent Orchestrator, AI Agent Advisor, Decision Builder, Knowledge Graph, Knowledge Center, Workflow Studio, Flow Designer, App Engine, Build Agent, ServiceNow Studio, Integration Hub, Agentic Playbooks, Action Fabric, Autonomous Workforce, Analytics & BI, Document Intelligence, AI Guardian, AI Data Explorer, Process Mining, Automated Test Framework, Now Assist for Creator, ACL & Roles, Platform Encryption, Domain Separation, Vault, LDAP Integration, Deny Unless, Platform Security, Security Center, CMDB & AI Inventory.

3. **AI Control Tower band**: AI Inventory, AI Strategy, AI Value, AI Risk & Compliance / Security & Privacy.

## Data model

In `renderer/data/types.ts`:

export type CapabilityStatus =
  | 'not-licensed'
  | 'no-intent'
  | 'not-in-use'
  | 'planning'
  | 'implementing'
  | 'in-use';

export interface Capability {
  id: string;           // stable slug, used as the key in customer state
  name: string;         // display name
  categoryId: string;   // FK into Category.id
  // future: short description, NowSell URL, etc.
}

export interface Category {
  id: string;           // stable slug
  name: string;         // display name e.g. "ITSM"
  fullName?: string;    // expansion if name is an acronym, e.g. "IT Service Management"
  layer: 'solution' | 'ai-native' | 'platform';
  // ai-native pillar this category sits under, when layer !== 'solution'
  aiNativePillar?: 'sense' | 'decide' | 'act' | 'secure';
  displayOrder: number;
}

export interface CapabilityMapSeed {
  schemaVersion: 1;
  generatedAt: string;
  sourceSlide: string;  // filename of the pptx this was extracted from
  categories: Category[];
  capabilities: Capability[];
}


The customer-specific state (status per capability, category enabled/disabled, notes) lives in the document, NOT in the seed:

export interface CapabilityMapState {
  // category id -> enabled (default true)
  categoryEnabled: Record<string, boolean>;
  // capability id -> status; absence means 'not-licensed' (default)
  capabilityStatus: Record<string, CapabilityStatus>;
  // capability id -> free-text note
  capabilityNotes: Record<string, string>;
}

## Seed extractor

Build `scripts/extract-capability-map.ts` (run with `tsx` or `node --import=tsx`):

- Takes a pptx path as input. Default: `./seed-sources/2026-May_Full_Capability_Map.pptx`.
- Unzips the pptx, parses `ppt/slides/slide1.xml`.
- For every shape with text: capture text, x, y, width, height, and the solid fill color.
- Identify category labels: shapes that are NOT filled with `15243E` AND whose y-position is in the upper region of the slide (above ~4,500,000 EMU). Filter out the title shape ("Full Capability Map"), the author byline, and the AI-Native pillar containers ("SENSE", "DECIDE", "ACT", "SECURE").
- Identify capabilities: shapes filled with `15243E` get clustered to their nearest category by 2D distance (Euclidean from shape center to category center).
- Identify platform-layer capabilities: shapes filled with `233860`. Group them by x-position into the four AI-Native pillars (SENSE, DECIDE, ACT, SECURE) — find the column boundaries from the pillar container shapes.
- Identify the AI Control Tower band: the four shapes at y ≈ 5,143,442 — these become a special category with `layer: 'ai-native'`, no pillar (it spans all four).
- Generate stable slugs as IDs (`slugify(name)`; ensure uniqueness with a numeric suffix if collision).
- Write the result to `renderer/data/capability-map.seed.json`.

The script should be deterministic — same input always produces the same output, same IDs.

**Important**: this is an ETL script. It will produce messy output on the first run. Print a report at the end: total categories, total capabilities, any orphan capabilities (>X distance from nearest category), any duplicate names. I will manually review and clean up the output JSON, and we will commit the cleaned version. The seed JSON is the source of truth from that point forward; the script is rerun only when ServiceNow publishes a new version of the slide.

Add `seed-sources/` to gitignore for the raw pptx files, but commit the cleaned seed JSON.

Once the extractor runs and produces a seed JSON with ~190+ capabilities under ~30+ solution categories plus the AI-Native/platform layer, stop and show me the orphan report. We will clean up together before moving on.
```

---

## Prompt 5 — Capability Map view (read-only first)

```
Build the Capability Map view. Read-only in this prompt — status editing comes in Prompt 6.

Route: `/capability-map` (the default view; sidebar link).

Layout, top to bottom:

1. **Header strip**:
   - Customer name input (bound to `document.customer.name`, marks dirty on change).
   - "Categories: X of Y enabled" counter.
   - Search box (filters visible capabilities by name, case-insensitive).
   - View mode toggle: "Grid" (default) | "List" (a denser flat table). Build Grid first; List can be a stub.

2. **Solution categories grid** — replicates the slide structure:
   - Categories rendered as cards in a responsive grid (CSS grid, auto-fit, minmax(280px, 1fr)). The original slide groups categories with surrounding capabilities; we're moving to a clean card-per-category layout because rendering the literal slide positions in HTML is fragile and offers no benefit.
   - Each card: category name as header (with expansion full name as a tooltip if present), an enable/disable toggle (switch component), and a tight list of its capabilities below.
   - Disabled categories: card dims to ~40% opacity, capabilities inside become non-interactive, header still shows the toggle.
   - Each capability renders as a small pill/tile with the capability name. For now no status — just the name and a thin border. Fixed height, text truncates with ellipsis, full name on hover (title attribute).

3. **AI-Native section** below the solution grid:
   - Four columns (SENSE, DECIDE, ACT, SECURE), styled visually distinct from the solution grid (subtle background tint).
   - Each pillar shows the platform-layer capabilities that belong to it.
   - At the top, an "AI Control Tower" full-width band showing AI Inventory, AI Strategy, AI Value, AI Risk & Compliance.
   - These don't get enable/disable toggles per-pillar (they're platform foundation, always relevant) — but each individual capability can still be statused later.

4. **Empty/loading states**: when the document is empty (e.g. new file), seed categories should still display with all enabled by default. When seed JSON fails to load, show a clear error with a "Reset to default seed" action.

5. **Reactivity**:
   - Read seed from `renderer/data/capability-map.seed.json` (bundled with the app — `import` it; treat as immutable).
   - Read state (categoryEnabled, etc.) from the document store.
   - Toggling a category's enable switch → updates `document.capabilityMap.categoryEnabled[id]` → marks document dirty.
   - Search filtering is local UI state, doesn't touch the document.

6. **Performance**: the grid renders ~30 cards and ~200 capability tiles. No virtualization needed at this scale, but memoize category cards on `(enabled, statusMap, searchTerm)`.

7. **Accessibility**: every toggle has an accessible label, every pill has a role, keyboard navigation between pills with arrow keys would be nice but is not required this round.

When I can open the app, see the capability map populated from the seed, toggle categories on/off, watch the title bar's dirty dot appear, and Save → Reopen with the same enabled/disabled state preserved, stop and show me.
```

---

## Prompt 6 — Capability status editing

```
Add interactive capability status editing.

1. **Status model**: as defined in `types.ts` — six statuses (`not-licensed`, `no-intent`, `not-in-use`, `planning`, `implementing`, `in-use`). Default (absent from the map) = `not-licensed`. Provide a `STATUSES` const array with `{ id, label, color, description }` for each, where `color` references the CSS variables from Prompt 2.

2. **Pill visualization**: each capability pill now shows its current status:
   - Left edge: a 4-6px wide colored bar in the status color.
   - Background: very light tint of the status color (~5-8% alpha) so the grid stays scannable, not eye-watering.
   - Text color: stays foreground/primary (not status color) for readability.
   - Edge case: if the parent category is disabled, the pill is desaturated regardless of status.

3. **Status editor — popover, not modal**:
   - Click a capability pill → opens a popover anchored to the pill.
   - Popover contains: capability name as header, status as a segmented control or radio group (six options, each with its color swatch and label), and a notes textarea bound to `capabilityNotes[id]`.
   - Changes apply immediately (no Save button in the popover) and mark document dirty.
   - Close on click-outside or Escape.

4. **Bulk operations** in a category card header (small "..." menu):
   - "Set all to Not Licensed" / "Set all to In Use" / "Set all to Planning" — applies to that category's capabilities only.
   - "Clear notes" — wipes notes for capabilities in this category, with a confirm.

5. **Filter chips** above the grid: status filter chips ("All", "Not Licensed", "No Intent", etc.). Selecting one or more filters the visible capabilities. Combine with the search box.

6. **Summary stats** in the header strip: small breakdown like `In Use: 12 · Implementing: 4 · Planning: 8 · Not Licensed: 174`. Click a stat to toggle its filter chip.

7. **Persistence sanity check**: status edits must round-trip through `.pamap` save/load. Add a Vitest test that asserts this.

When I can:
- Click a pill, change its status, see the color update immediately,
- Add a note, save, reopen, see the note,
- Use the bulk "set category to Planning" action,
- Filter the grid by status,

stop. That's Feature #1 done.
```

---

## Prompt 7 — Capability map refresh workflow (for when ServiceNow updates the slide)

```
Build the workflow for refreshing the capability map seed when ServiceNow ships a new version of the slide.

Important: this MUST preserve customer-specific state in existing `.pamap` files. Capabilities that are renamed, removed, or split need careful handling — we cannot just blow away `capabilityStatus` for missing IDs.

1. **Re-runnable extractor**: the script from Prompt 4 already accepts a pptx path. Make it accept a `--diff` flag that, instead of overwriting `capability-map.seed.json`, writes `capability-map.seed.next.json` and emits a diff report to stdout and to `seed-sources/diff-report-YYYY-MM-DD.md`. The report includes:
   - Added categories (new id, name)
   - Removed categories (id, name, # of capabilities affected)
   - Renamed categories (id stable, name changed — detected by id match + name diff)
   - Added capabilities (id, name, category)
   - Removed capabilities (id, name, category)
   - Renamed capabilities
   - Moved capabilities (category changed)

2. **Stable IDs across releases**: refine slug generation to be resilient — e.g. "Now Assist for ITSM" should produce `now-assist-for-itsm` every release. Manual ID overrides are supported via a `seed-sources/id-overrides.json` map (old-name → canonical-id) for cases the auto-slugger gets wrong.

3. **In-app migration UI**: when the user opens a `.pamap` file whose embedded `capabilityMapSchemaVersion` is older than the bundled seed's `schemaVersion`, show a non-blocking banner: "This file references an older capability map (May 2026). Update to current (Sep 2026)?" with "Review changes" and "Update" buttons.
   - "Review changes" opens a panel showing the diff that would be applied to THIS file: orphaned statuses (capabilities that no longer exist) are listed with their old name + old status + note, and the user chooses to (a) drop them, (b) keep them in an "archived" sidebar, or (c) remap to a different current capability.
   - "Update" applies the migration and stamps the new schemaVersion. Document becomes dirty (so the user has to explicitly save).

4. **Archived statuses**: extend `CapabilityMapState` with `archivedCapabilities: Array<{ id, name, status, notes, archivedAt, reason }>`. Surface these in a collapsed "Archived" section in the capability map view so a PA can see what used to be tracked but no longer applies.

5. **CLI flow documented in README**:


# When ServiceNow publishes a new Full Capability Map slide:

1.  Drop the new pptx into seed-sources/
2.  pnpm extract:map --diff # generates next.json + diff report
3.  Review diff-report-YYYY-MM-DD.md, edit id-overrides.json if needed
4.  pnpm extract:map # commits the new seed
5.  Bump capability-map.seed.json.schemaVersion
6.  Test by opening an old .pamap file — verify the migration banner appears
7.  Ship the new app build



When the diff script produces a sensible report against a hand-modified copy of the source pptx (rename one category, delete one capability, add one capability — verify the diff catches all three), stop and show me the diff output. That's Feature #1 complete with future-proof maintenance.
```

---

## Notes for the road

- **Don't let Claude Code skip the orphan report in Prompt 4.** The slide's spatial clustering is messy near the edges; first-pass extraction will misassign 5-15 capabilities. Spend 20 minutes hand-cleaning the seed JSON after Prompt 4 before moving on — that JSON becomes the source of truth.
- **The AI-Native columns (SENSE/DECIDE/ACT/SECURE) and platform layer are not strictly "categories with capabilities" in the same way as ITSM or HRSD.** The data model in Prompt 4 handles this by tagging categories with `layer`. Keep that distinction in the UI — don't let the platform layer get a category toggle the way solution categories do; those are always relevant.
- **The status set is fixed at six values for now.** When you add the Adoption Roadmap and Technical Roadmap features later, those will likely want their own state on top of `CapabilityMapState` (target maturity, target quarter, etc.) — design those as additive fields on the document, not modifications to the existing types.
- **Dirty tracking is the most failure-prone area** in desktop apps. Add Vitest coverage early: every mutation action must call `markDirty()`, every save must call `markClean()`, every load must call `markClean()`.
