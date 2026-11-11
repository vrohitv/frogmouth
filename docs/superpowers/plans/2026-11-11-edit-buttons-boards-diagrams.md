# Edit Buttons, Boards Listing and Diagram Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editing secrets and board names visible, make the two board listings (pills and Boards panel) comfortable, and add diagramming to boards: boxes with text, lines and arrows that stick to notes and shapes, and frames.

**Architecture:** Three parts that ship independently, in order A, B, C. A and B are small changes to `08-secrets.js`, `10-app.js` and `app.css`. C adds one module, `src/js/07c-draw.js`, and a new optional `shapes` array on each board. Shapes are first-class things on the board: they share the board's selection, drag, marquee, nudge, delete, duplicate, fit and minimap through one lookup (`geomOf`) in `07-board.js`. Boxes and frames are HTML elements in `.plane`; lines are paths in one SVG layer in `.plane`.

**Tech Stack:** Plain JavaScript ES modules, CSS, inline SVG. Vite + vite-plugin-singlefile. No new dependencies of any kind.

**Spec:** this document. The "Design decisions" section below is the spec; the user's own words are quoted where they decided something, everything else is marked as the planner's call.

## Global Constraints

- No external libraries, no network calls, one output file. The CSP in `src/frogmouth.html` is not touched.
- **No freehand, pen or stylus tools. Ever.** The user: "no freehand complexity ever. that feature is banned." Do not add a pen tool, stroke smoothing, or pressure handling, and do not leave a hook for one.
- The `.fm` format stays at `frogmouth: 1`. `shapes` is an additive field: `docs/format.md` must be updated in the same task that adds it, unknown fields on a shape must survive a save, and a shape with an unknown `type` is kept in the file untouched and not drawn.
- All geometry is in board units. Nothing is stored or derived from screen pixels or window size. The same vault gives the same picture on any display.
- Colours come only from the nine existing paper names (`moth straw apricot rose heather dusk sea lichen night`). No new palette entries.
- Keyboard labels go through `kb()` in `src/js/00-util.js`. No Ctrl+Alt combinations.
- It is a bird. Never write "frog" in copy or comments.
- Match the surrounding code: module pattern `export const X = (() => { … })()`, `h()` for DOM, `icon()` for icons, section comments `/* ── name ── */`, comments say why.
- Commands need Node on the PATH: prefix every npm command with `export PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH &&`.
- Tests are blocks in `test/smoke.js` using `ok(name, condition, info)`. Run with `npm test` (builds `test/frogmouth.html`, drives headless Chrome, prints one line per check; any `FAIL` line fails the run). Read `test/smoke.js:870-1020` before writing the first test to copy the block style (`{ … }` scopes, `await wait(ms)`, `$`/`$$`, synthetic `PointerEvent`/`KeyboardEvent`). Put new blocks immediately before the OPFS section (search for `image saved to assets/`).
- `frogmouth.html` at the repo root is a build output that is committed. Rebuild it (`npm run build`) in the last task of each part and commit it; `npm run check` fails otherwise.
- Work on a branch: `git switch -c diagrams` before Task 1. Commit after every task. End commit messages with the attribution lines the session gives you.

## Design decisions

### Part A: visible editing (user chose "Visible edit buttons")

Editing already exists and stays as it is: secrets open the drawer with `↵`, `e` or double-click; boards rename with double-click, `F2` or the panel. What is added is a pencil:

- Every secret row gets a pencil button in its action column, before reveal and copy. It opens the existing drawer.
- Every board pill gets a pencil, shown on hover and always on the open board's pill. It starts the existing in-place rename.

### Part B: boards listing (user said "Both" are uncomfortable; the specifics below are the planner's call)

Pills:
- The hover `×` is removed from pills. Two hover targets on a small pill are easy to mis-hit, and delete is not a per-second action. Delete stays in the Boards panel, the command palette, and a new right-click menu.
- Right-click on a pill opens a menu: Rename (`F2`), Pin / Unpin, Delete board….
- Names truncate at 24 characters instead of 18.
- A pinned board's pill shows a small pin glyph before the name.

Boards panel (`⌥J`):
- Rows are two lines and 48px tall: the name, and under it a muted preview of the board's first three note titles, so a board can be recognised by what is on it.
- With nothing typed, the list has two headed sections: **Pinned**, then **Boards** (by last opened). With a query it is one flat list by match score, as now.
- Pin, rename (pencil) and delete are always visible at reduced opacity, not hover-only.
- The open board is marked with an accent bar and the word "open", as now.
- Keys are unchanged.

### Part C: diagrams (user chose: on the board beside notes; boxes with text, lines and arrows that stick, frames; "max tools like excalidraw/tldraw draw.io without pen or stylus tools")

**Things.** A board has notes (placements) and shapes. Shape types:

| type | what | has x,y,w,h |
|---|---|---|
| `rect` | rectangle, 6px rounded corners | yes |
| `ellipse` | ellipse | yes |
| `diamond` | diamond | yes |
| `text` | free text, no fill, no border | yes |
| `frame` | named region; moves what is inside it | yes |
| `line` | line or arrow between two ends | no |

**Format** (additive, `board.shapes`, absent when a board has none):

```json
{"id":"s1","type":"rect","x":80,"y":80,"w":160,"h":96,"z":4,"color":"sea","text":"API"}
{"id":"s2","type":"frame","x":40,"y":40,"w":480,"h":320,"text":"Backend"}
{"id":"s3","type":"line","a":{"shape":"s1"},"b":{"note":"n7"},"head":"end","route":"elbow","color":"moth","text":"calls"}
```

- `color`: a paper name, default `moth`. `text`: plain text (box label, frame name, line label), default `""`.
- `fill: false` only when a box is unfilled. `dash: true` only when the outline or line is dashed.
- Line ends `a` and `b` are each `{"x":n,"y":n}` (a free point), `{"note": id}` or `{"shape": id}`. `head` is `none`, `end` or `both`. `route` is `straight` or `elbow`; absent means `straight`.
- `z` orders boxes among notes (one shared counter). Frames are always drawn under notes and boxes; lines always on top. Frames and lines have no `z`.
- Sizes: boxes at least 24×24, frames at least 80×60.

**Where a line meets a thing.** An attached end has no stored position. It is drawn from the point where the straight line between the two things' centres crosses the thing's outline (box outline for notes, `rect`, `text` and `frame`; the true outline for `ellipse` and `diamond`), pulled back 6 units. So lines follow when either thing moves or resizes, and when a note grows as you type.

**Elbow route.** Three segments. If the centres are further apart horizontally than vertically, the line leaves the middle of the facing left/right sides and turns at the midpoint x; otherwise top/bottom sides and the midpoint y.

**Frames.** A frame stores no children. When a drag of a frame starts, every note and box whose centre is inside the frame moves with it. Lines follow because their ends do.

**When an attached thing goes away.** Removing a note from a board, deleting a note anywhere, or deleting a box turns every line end attached to it on that board into a free point at the last anchor position (for a note deleted from another page, the centre of its placement, using 120 for an automatic height). Undo restores the attachment.

**Tools** (floating pill, bottom centre of the board; one shape per activation, then back to Select):

| key | tool |
|---|---|
| `V` or `Esc` | Select |
| `R` | Rectangle |
| `O` | Ellipse |
| `D` | Diamond |
| `X` | Text |
| `L` | Line |
| `C` | Arrow (connector) |
| `F` | Frame |

Drag to draw; a click without a drag makes the default size (box 160×96, text 160×40, frame 480×320). After drawing a box, text or frame its text is in edit mode. `↵` or double-click edits text; `Esc` or click away commits. With one note or box selected, four small connector dots appear at its sides: drag from one to draw an arrow starting attached to it.

**Style bar** (floating pill above the toolbar, only while shapes are selected): colour (the nine papers; `1`–`9` also work), fill on/off (boxes), solid/dashed, bring to front `]` / send to back `[` (boxes), and for lines: straight/elbow and arrowheads none/end/both.

**Shared behaviour.** Click, `⇧`-click, `⇧`-drag box, `⌘A`, drag, arrows, `⌘D`, `Del`, Fit, minimap and `⌘F` treat shapes like notes, with two differences: `Del` deletes a shape at once with an undo toast (a shape has no library copy, so there is no "Remove?" step), and **Arrange notes** moves only notes.

**Non-goals for this release** (planner's call): shape text is not in `⌘K` search or the All notes page; no undo for create/move (same as notes today); no grouping, rotation, or image export; shapes do not appear in the note view.

## Review Focus

1. A vault whose `shapes` holds a type this release does not know (say `"type":"cloud"`, with extra fields) is opened, edited and saved: the object is in the file byte-for-field unchanged, and nothing is drawn for it. Test in Task 5.
2. A note with arrows attached is deleted from the **All notes** page while its board is not mounted: opening the board shows the arrows ending at free points, no crash, and undo re-attaches them. Test in Task 9.
3. Drawing at 20% and 250% zoom, and after panning: the shape lands under the pointer in board units. Test in Task 7.
4. The same note on two boards with an arrow on board A: moving the note on board B changes nothing on A; the arrow belongs to the board, not the note. Test in Task 8.
5. Typing letters that are tool keys (`r`, `o`, `d`, `x`, `l`, `c`, `f`, `v`) into a box's text, a note, or the find bar does not switch tools; and a file reload from disk while a tool is armed leaves the board in Select with no half-drawn shape. Test in Task 7.

## File structure

| File | Change |
|---|---|
| `src/js/00-util.js` | New icons: `more`, `cursor`, `rect`, `ellipse`, `diamond`, `text`, `line`, `arrow`, `frame`, `elbow`, `dash`, `front`, `back`. |
| `src/js/03-store.js` | `normalize` validates `board.shapes`; `detach(board, kind, id, at)`; `unplace` and `deleteNote` detach line ends and return what undo needs. |
| `src/js/07-board.js` | `geomOf`, shared selection/drag/marquee/keys for shapes; exports for Draw; mount/unmount call Draw. |
| `src/js/07c-draw.js` | **New.** Everything about shapes: pure geometry, rendering, tools, toolbar, style bar, text editing, lines, frames. |
| `src/js/08-secrets.js` | Pencil on rows. |
| `src/js/10-app.js` | Pill pencil, pill context menu, Boards panel rows and sections, commands, shortcuts list. |
| `src/css/app.css` | Styles for all of the above. |
| `test/smoke.js` | New blocks per task. |
| `docs/format.md`, `README.md`, `CHANGELOG.md`, `package.json` | Spec, docs, 1.3.0. |

---

## Part A: visible editing

### Task 1: Pencil on secret rows

**Files:**
- Modify: `src/js/08-secrets.js` (row template in `render()`, the `list` click handler in `init()`)
- Modify: `src/css/app.css:596` (`.s-head, .srow` grid) 
- Test: `test/smoke.js`

- [ ] **Step 1: Write the failing test** (new block, in the secrets area near `secret editor opens centred`)

```js
{
  App.openTab('secrets'); await wait(60);
  const row = $$('.srow').find((r) => r.querySelector('.s-keyname').textContent === 'DATABASE_URL');
  const pen = row.querySelector('.s-act [data-a="edit"]');
  ok('every secret row has a visible edit button', $$('.srow').every((r) => r.querySelector('.s-act [data-a="edit"]')) && pen.getBoundingClientRect().width > 0);
  pen.click(); await wait(40);
  ok('the edit button opens the editor on that secret', !$('.s-drawer').hidden && $('.s-drawer .d-head h3').textContent === 'DATABASE_URL');
  keydown($('.s-drawer'), 'Escape'); await wait(20);
}
```

- [ ] **Step 2: Run** `npm test` — expected: the two new lines `FAIL`.
- [ ] **Step 3: Implement.** In the row template add, as the first child of `.s-act`: `<button data-a="edit" title="Edit (↵)" tabindex="-1">${icon('edit')}</button>`. In the click handler add the branch `a.dataset.a === 'edit'` → `edit(x)`. Change the last grid column of `.s-head, .srow` from `64px` to `96px`.
- [ ] **Step 4: Run** `npm test` — expected: all `ok`, no `FAIL`.
- [ ] **Step 5: Commit** `git commit -am "Secrets: a visible edit button on every row"`

### Task 2: Pencil on board pills

**Files:**
- Modify: `src/js/10-app.js` (`renderBoards()`)
- Modify: `src/css/app.css` (after `.bp-x` rules, line ~228)
- Test: `test/smoke.js`

- [ ] **Step 1: Write the failing test**

```js
{
  App.openTab('b:' + Store.S.data.boards[0].id); await wait(40);
  const on = $('.board-pill.on'), pen = on.querySelector('.bp-edit');
  ok('the open board pill shows a rename button', !!pen && getComputedStyle(pen).opacity !== '0');
  pen.click(); await wait(20);
  const inp = $('.board-pill input.bp-input');
  ok('it renames in place', !!inp);
  inp.value = 'Renamed by pencil'; keydown(inp, 'Enter'); await wait(20);
  ok('and saves the name', Store.S.data.boards[0].name === 'Renamed by pencil');
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL on all three.
- [ ] **Step 3: Implement.** In `renderBoards()` add to each pill, after `.bp-name`: `h('button', { class: 'bp-edit', title: 'Rename (F2)', 'aria-label': 'Rename ' + b.name, html: icon('edit'), tabindex: '-1' })`. In the pill's click handler, before the `.bp-x` branch: a click inside `.bp-edit` stops propagation and calls `renameBoard(b.id)`. Make the `dblclick` handler ignore `.bp-edit` as it ignores `.bp-x`. CSS: `.bp-edit` is styled like `.bp-x` (same size and icon size), `opacity: 0`; `.board-pill:hover .bp-edit, .board-pill.on .bp-edit { opacity: .55 }`; `:hover` goes to 1.
- [ ] **Step 4: Run** `npm test` — expected no `FAIL`.
- [ ] **Step 5: Rebuild and commit** `npm run build && git commit -am "Board pills: a visible rename button"`

---

## Part B: boards listing

### Task 3: Pills — context menu instead of ×, pin glyph, longer names

**Files:**
- Modify: `src/js/00-util.js` (ICONS: add `more: '<circle cx="3.5" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="12.5" cy="8" r="1"/>'`)
- Modify: `src/js/10-app.js` (`renderBoards()`, new `boardMenu(b, x, y)`, new `togglePin(b)`)
- Modify: `src/css/app.css` (`.bp-name`, remove `.bp-x` rules, new `.bp-pin`)
- Modify: `test/smoke.js:883` (the existing `x deletes an empty board` check)
- Test: `test/smoke.js`

**Interfaces:**
- Produces: `togglePin(b)` (flips `b.pinned`, deletes the field when false, `Store.change('boards')`); `boardMenu(b, x, y)` opens `Popup` with items `rename`, `pin`, `delete`. The panel's `pin(r)` is changed to call `togglePin(r.b)`.

- [ ] **Step 1: Write the failing test.** Replace the body of the existing `x deletes an empty board` check so it deletes through the menu, and add:

```js
ok('pills have no delete cross', !$('.board-pill .bp-x'));
const pill = $$('.board-pill').find((p) => p.dataset.id === infra.id);
pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 30 })); await wait(30);
const labels = $$('.popup .pop-item').map((e) => e.textContent);
ok('right-click on a pill offers rename, pin and delete', ['Rename', 'Pin', 'Delete board'].every((w) => labels.some((l) => l.includes(w))), labels.join('|'));
```
(Use the popup's real item class; read `Popup` in `src/js/05-ui.js` for it.) Then pick "Delete board…" and keep the original assertion `!Store.board(infra.id)`. Add a check that after picking Pin, the pill contains `.bp-pin` and `Store.board(id).pinned === true`.

- [ ] **Step 2: Run** `npm test` — expected FAIL on the new checks.
- [ ] **Step 3: Implement.** Remove the `.bp-x` button, its click branch and its CSS. Add a `contextmenu` listener on each pill: `preventDefault()`, `boardMenu(b, e.clientX, e.clientY)`. Menu items: `{ id: 'rename', label: 'Rename', icon: 'edit', hint: 'F2' }`, `{ id: 'pin', label: b.pinned ? 'Unpin' : 'Pin: always keep a pill', icon: 'pin' }`, `{ id: 'delete', label: 'Delete board…', icon: 'x' }` (omit delete when it is the only board). A pinned pill renders `h('span', { class: 'bp-pin', html: icon('pin') })` before the name (10px icon, `opacity: .5`). `.bp-name { max-width: 24ch }` (leave the 10ch mobile override). Update the pill `title` to end "Right-click for more."
- [ ] **Step 4: Run** `npm test` — no `FAIL`.
- [ ] **Step 5: Commit** `git commit -am "Board pills: right-click menu replaces the hover cross; pinned pills are marked"`

### Task 4: Boards panel — two-line rows, sections, visible actions

**Files:**
- Modify: `src/js/10-app.js` (`boardPicker()`: `build()` and `paint()`)
- Modify: `src/css/app.css:536-556` and the mobile override at `:810`
- Modify: `README.md` (the Boards bullets, lines 24-26), `CHANGELOG.md`
- Test: `test/smoke.js` (next to `a pinned board keeps its pill`)

- [ ] **Step 1: Write the failing test**

```js
{
  const d = Store.S.data;
  const pinned = d.boards.find((b) => b.pinned) || (d.boards[1].pinned = true, d.boards[1]);
  keydown(document.body, 'j', { code: 'KeyJ', altKey: true }); await wait(40);
  const heads = $$('.bd-list .bd-head').map((e) => e.textContent);
  ok('the panel groups pinned boards first', heads[0] === 'Pinned' && heads[1] === 'Boards', heads.join('|'));
  const row = $$('.bd-row').find((r) => r.querySelector('.bd-name').textContent.startsWith(d.boards[0].name));
  const firstTitle = (Store.noteRef(d.boards[0].items[0].note).note.title || '').slice(0, 12);
  ok('a row previews what is on the board', row.querySelector('.bd-sub').textContent.includes(firstTitle), row.textContent);
  ok('rows are comfortable to hit', row.getBoundingClientRect().height >= 44);
  ok('row actions are visible without hovering', getComputedStyle(row.querySelector('.bd-acts')).opacity !== '0');
  const inp = $('.bd-input'); inp.value = pinned.name.slice(0, 3); inp.dispatchEvent(new Event('input')); await wait(20);
  ok('typing gives one flat list', !$('.bd-list .bd-head'));
  keydown(inp, 'Escape'); await wait(20);
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement.**
  - `build()`: unchanged scoring and sort. Rows keep one flat `rows` array (keyboard index must stay a row index).
  - `paint()`: when the query is empty, emit `<div class="bd-head">Pinned</div>` before the first pinned row (only if any) and `<div class="bd-head">Boards</div>` before the first unpinned row. Headers are not rows: stop using `list.children[idx]` to find the selected element; select by `list.querySelector('.bd-row[data-i="' + idx + '"]')` here and in `rename()`.
  - Each row's name cell becomes `<span class="bd-text"><span class="bd-name">…</span><span class="bd-sub">…</span></span>`, where sub is the titles of the board's first three items joined with `, ` (`'Untitled'` for an empty title), plus ` +N` when there are more, or `Empty` when there are none. All through `esc()`.
  - CSS: `.bd-row` `min-height: 48px`, padding `6px 12px 6px 8px`; `.bd-text` is a column flex with `min-width: 0`; `.bd-sub` is `font-size: 11.5px; color: var(--faint)` with ellipsis; `.bd-head` is `font-size: 11px; color: var(--faint); padding: 8px 14px 2px; text-transform: none`; `.bd-acts { opacity: .5 }`, 1 on `.bd-row:hover` / `.bd-row.on`; `.bd-pin { opacity: .5 }`.
- [ ] **Step 4: Run** `npm test` — no `FAIL` (the existing panel tests for pin, rename, delete and create must still pass).
- [ ] **Step 5: Docs.** README line 24: replace "double-click to rename it in place, drag to reorder, hover for × to delete (undoable)" with "double-click or the pencil to rename it in place, drag to reorder, right-click for rename, pin and delete". README line 25: add that each row previews the board's notes and that pinned boards are listed first. Secrets section: mention the pencil. Start a `## 1.3.0` section in `CHANGELOG.md` with one bullet each for Tasks 1-4.
- [ ] **Step 6: Rebuild and commit** `npm run build && git commit -am "Boards panel: two-line rows with a preview, pinned section, visible actions"`

---

## Part C: diagrams

### Task 5: Format and store

**Files:**
- Modify: `src/js/03-store.js` (`normalize`, new `normShape`, new `detach`, `unplace`, `deleteNote`, `restoreNote`, exports)
- Modify: `docs/format.md` (board table; new "shape" section with the table and JSON from "Design decisions")
- Test: `test/smoke.js` (near `a colour from a newer release is shown as moth`)

**Interfaces:**
- Produces:
  - `board.shapes`: present only while the board has at least one shape, in memory and in the file. Nothing reads `b.shapes` directly except the Store functions below.
  - `Store.shapes(b) -> shape[]`: returns `b.shapes`, or a fresh empty array when the field is absent (never assigns it). Only `Store.addShape` creates the field; `Store.dropShape` deletes it when the last shape goes.
  - `Store.addShape(b, shape) -> shape`, `Store.dropShape(b, id) -> { shape, index, detached } | null`, `Store.putShape(b, saved)` (undo of `dropShape`).
  - `Store.detach(b, kind, id, at) -> [{ line, end, was }]`: for every line in `b` whose `a` or `b` end is `{[kind]: id}`, replace that end with `{x: at.x, y: at.y}`; `kind` is `'note'` or `'shape'`; `end` is `'a'` or `'b'`; `was` is the old end object. `Store.reattach(list)` undoes it.
  - `unplace(boardId, noteId, at?)` and `deleteNote(id)` now also detach; `unplace` returns `{ it, index, detached }`, `deleteNote` returns `{ note, index, placed: [{ board, index, it, detached }] }`; `restoreNote` reattaches. When `at` is not given, it is the centre of the placement with `h || 120`.

- [ ] **Step 1: Write the failing test**

```js
{
  const raw = { notes: [{ id: 'n1', html: '<p>A</p>' }], boards: [{ id: 'b1', name: 'B', items: [{ note: 'n1', x: 0, y: 0, w: 200, h: 100 }], shapes: [
    { id: 's1', type: 'rect', x: 10.4, y: 20, w: 5, h: 5, color: 'sea', text: 'API', extra: { keep: 1 } },
    { id: 's2', type: 'cloud', puff: 3 },
    { id: 's3', type: 'line', a: { shape: 's1' }, b: { note: 'n1' }, head: 'end' },
    { id: 's4', type: 'line', a: { shape: 'gone' }, b: { x: 5, y: 5 } },
    'junk', { type: 'rect' },
  ] }, { id: 'b2', name: 'C', items: [] }] };
  const d = Store.normalize(JSON.parse(JSON.stringify(raw)));
  const sh = d.boards[0].shapes, by = (id) => sh.find((s) => s.id === id);
  ok('a box keeps unknown fields and gets the minimum size', by('s1').extra.keep === 1 && by('s1').w === 24 && by('s1').h === 24 && by('s1').color === 'sea');
  ok('a shape type from a newer release is kept as it is', JSON.stringify(by('s2')) === JSON.stringify(raw.boards[0].shapes[1]));
  ok('a line to something that is not on the board is dropped; junk is dropped', !by('s4') && sh.length === 4 && sh.every((s) => s && typeof s === 'object' && s.id));
  ok('a board without shapes has no shapes field', !('shapes' in d.boards[1]));
  const out = Store.detach(d.boards[0], 'note', 'n1', { x: 100, y: 50 });
  ok('detaching turns an attached end into a free point', out.length === 1 && out[0].end === 'b' && by('s3').b.x === 100 && by('s3').b.y === 50 && !('note' in by('s3').b));
  Store.reattach(out);
  ok('and undo attaches it again', by('s3').b.note === 'n1' && !('x' in by('s3').b));
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL (`Store.detach is not a function` shows as a thrown error; that is the expected failure).
- [ ] **Step 3: Implement `normShape` and wire it into `normalize`.** Rules, applied per board after its `items` are settled:
  - Not an object → dropped. Missing `id` → `uid()`. Duplicate id within the board → dropped.
  - `type` not one of `rect ellipse diamond text frame line` → kept untouched, no other rule applies.
  - Boxes and frames: `x`, `y` to numbers (0 if not finite), `w`/`h` clamped to `[24, 4000]` (`[80, 8000]` × `[60, 8000]` for frames), `z = +z || 1` (not for frames), `color` to string default `'moth'`, `text` to string default `''`.
  - Lines: each end must be `{x, y}` with finite numbers, `{note: id}` with a placement on this board, or `{shape: id}` with a known-type non-line shape on this board; otherwise the line is dropped. `head` not in `none|end|both` → `'end'`. `route` kept only when `'elbow'`.
  - An empty resulting array is deleted from the board.
- [ ] **Step 4: Implement `shapes`, `addShape`, `dropShape`, `putShape`, `detach`, `reattach`; extend `unplace`, `deleteNote`, `restoreNote`** per the Interfaces block. `dropShape` detaches lines attached to the dropped shape at its centre and removes the `shapes` field when it becomes empty; `putShape` restores index and attachments.
- [ ] **Step 5: Run** `npm test` — no `FAIL`. Existing undo tests for remove and delete must still pass.
- [ ] **Step 6: Update `docs/format.md`.** Board table: add `shapes | shape[] | Boxes, frames and lines drawn on this board (since 1.3). Absent when there are none`. Add a `### shape` section: the type table, the field rules above in prose, the three JSON examples, the two rules "an attached end has no stored position; it is drawn where the line between the two centres crosses the outline" and "a shape whose `type` a release does not know is kept and not drawn".
- [ ] **Step 7: Commit** `git commit -am "Format: boards can hold shapes (boxes, frames, lines); additive, format 1"`

### Task 6: Draw module — pure geometry

**Files:**
- Create: `src/js/07c-draw.js`
- Modify: `test/smoke.js` (import `Draw`; new block)

**Interfaces:**
- Produces (all pure, no DOM, exported on `Draw`):
  - `Draw.anchor(rect, kind, toward) -> {x, y}`: `rect` is `{x, y, w, h}`; `kind` is `'box' | 'ellipse' | 'diamond'`; returns the point where the ray from the rect's centre toward `toward` crosses the outline. If `toward` is the centre, returns the centre.
  - `Draw.route(A, B, kind) -> [{x, y}, …]`: `A` and `B` are `{rect, kind}` for attached ends or `{x, y}` for free points; `kind` is `'straight' | 'elbow'`. Attached ends are pulled back `GAP = 6` units along the first/last segment. Straight returns 2 points; elbow returns 4.
  - `Draw.KINDS = { note: 'box', rect: 'box', text: 'box', frame: 'box', ellipse: 'ellipse', diamond: 'diamond' }`.

- [ ] **Step 1: Write the failing test**

```js
{
  const R = { x: 0, y: 0, w: 100, h: 100 }, near = (p, x, y) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
  ok('a box is met on its edge', near(Draw.anchor(R, 'box', { x: 300, y: 50 }), 100, 50) && near(Draw.anchor(R, 'box', { x: 150, y: 250 }), 75, 100));
  ok('an ellipse is met on its curve', near(Draw.anchor(R, 'ellipse', { x: 150, y: 150 }), 85.355, 85.355));
  ok('a diamond is met on its side', near(Draw.anchor(R, 'diamond', { x: 150, y: 150 }), 75, 75));
  ok('a thing asked for its own centre gives the centre', near(Draw.anchor(R, 'box', { x: 50, y: 50 }), 50, 50));
  const B = { x: 300, y: 200, w: 100, h: 100 };
  const s = Draw.route({ rect: R, kind: 'box' }, { x: 300, y: 50 }, 'straight');
  ok('a straight line stops 6 units short of what it is attached to', s.length === 2 && near(s[0], 106, 50) && near(s[1], 300, 50));
  const e = Draw.route({ rect: R, kind: 'box' }, { rect: B, kind: 'box' }, 'elbow');
  ok('an elbow leaves the facing sides and turns half way', e.length === 4 && near(e[0], 106, 50) && near(e[1], 200, 50) && near(e[2], 200, 250) && near(e[3], 294, 250), JSON.stringify(e));
  const v = Draw.route({ rect: R, kind: 'box' }, { rect: { x: 0, y: 400, w: 100, h: 100 }, kind: 'box' }, 'elbow');
  ok('things stacked vertically connect top to bottom', near(v[0], 50, 106) && near(v[3], 50, 394), JSON.stringify(v));
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL (import error counts).
- [ ] **Step 3: Implement** the module shell `export const Draw = (() => { … return { anchor, route, KINDS }; })();` with the header comment `/* ── draw: boxes, frames and lines on a board ── */` explaining shapes vs notes in three lines. Elbow rule: horizontal when `|dx| >= |dy|` between centres (free points count as their own centre); for an elbow, an attached end starts at the middle of the facing side (not the ray crossing), pulled out by `GAP`.
- [ ] **Step 4: Run** `npm test` — no `FAIL`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Draw: outline anchors and line routes"`

### Task 7: Boxes on the board — render, tools, text, shared selection

This is the largest task. It is one task because nothing in it is testable alone: a box that renders but cannot be selected or drawn has no deliverable.

**Files:**
- Modify: `src/js/07-board.js`
- Modify: `src/js/07c-draw.js`
- Modify: `src/js/00-util.js` (icons `cursor rect ellipse diamond text line arrow frame`; draw them as 16px stroke icons in the style of the existing set)
- Modify: `src/css/app.css` (new section `/* ── shapes ── */` after the note styles)
- Test: `test/smoke.js`

**Interfaces:**
- Board → Draw (new exports on `Board`): `plane()` returns the plane element; `toBoard(clientX, clientY)`; `rectOf(id) -> {x, y, w, h} | null` for a note on this board (height is `it.h` or the element's `offsetHeight`); `els` access via `Board.el(id)`; `nextZ()` returns `++maxZ`; `setGroup(ids)`, `selection()` (now returns note and box ids), `select(id)`.
- Draw → Board: `Draw.mount(board)`, `Draw.unmount()`, `Draw.geom(id) -> shape | undefined` (boxes and frames of the mounted board, not lines), `Draw.el(id)`, `Draw.place(shape)` (applies x/y/w/h/z to its element and schedules a line redraw), `Draw.remove(ids)` (delete with one undo), `Draw.duplicate(id) -> shape`, `Draw.setColor(id, color)`, `Draw.editText(id)`, `Draw.key(e) -> boolean` (tool keys; called first by `Board.key`), `Draw.tool() -> string`, `Draw.setTool(name)`, `Draw.bounds() -> [{x, y, w, h, color, type}]` for fit and the minimap, `Draw.moved(ids)` (called by Board during a drag or nudge so lines follow).
- Events: Draw calls `Store.change('shapes')` after every edit. `10-app.js` needs no change for this (the generic `change` handler already re-renders sync).

**Changes in `07-board.js`:**
- `const geomOf = (id) => itemOf(id) || Draw.geom(id);` and `const elOf = (id) => els.get(id) || Draw.el(id);` Use them in `drag` (the `moving` list and `place`), `marquee` (hit test over `board.items` and `Draw.bounds()` boxes; frames are hit only when the marquee covers them completely), `setGroup` (the `sel` class), `selectAll`, `picked` (notes in board order, then boxes), `center`, `fit`, `drawNav`, and the arrow-key nudge. `place(it)` for a shape delegates to `Draw.place`.
- `key()`: first line after the `finder` check is `if (Draw.key(e)) return true;`. For `Enter`, `Del`, `1`–`9`, `⌘D`: split the selected ids into notes and shapes; notes keep today's behaviour exactly; shapes get `Draw.editText(sel)` (only when `sel` is a shape), `Draw.remove(shapeIds)`, `Draw.setColor`, `Draw.duplicate`. `T` does nothing for a shape.
- `onVpDown`: when `Draw.tool() !== 'select'` and the button is 0 and space is not held, hand the event to `Draw.begin(e)` and return (before marquee and pan). The `dblclick` handler that creates a note returns early when a tool is armed.
- `mount` calls `Draw.mount(b)` after the notes are built; `unmount` and the `closed` handler call `Draw.unmount()`.
- `updateEmpty`: the board is empty only when it has no items **and** no shapes. Empty text becomes: "Double-click anywhere or press N to add a note, or pick a shape below. Drop images or files here too."

**In `07c-draw.js`:**
- A box is `h('div', { class: 'shape shape-<type> paper-<color>', 'data-id': id }, svgOutline, h('div', { class: 'shape-text' }), ...eight '.rz' handles)`. Reuse the note's `.rz` handle classes and `data-rz` so one resize routine serves both: extract the body of `Board.resize` into a function that takes `(e, geom, el, dir, min)` and call it with `{w: 160, h: 80}` minimums for notes and `{w: 24, h: 24}` for boxes; a box has no automatic height.
- The outline is an inline `<svg class="shape-bg" preserveAspectRatio="none" viewBox="0 0 100 100">` with a `rect rx`, `ellipse` or `polygon` using `vector-effect: non-scaling-stroke`; fill `var(--paper)`, stroke `var(--stroke)`. `text` type has no outline.
- `--stroke` is defined once in CSS: `.shape, .wire { --stroke: color-mix(in oklch, var(--paper) 45%, var(--ink)); }`.
- `.shape-text`: centred both ways, `white-space: pre-wrap`, `color: var(--ink)`, `font: 13.5px var(--sans)`; `contenteditable="plaintext-only"` only while editing. Commit on blur or `Esc`; `↵` inserts a newline, `⌘↵` commits. Text is read with `textContent` and written with `textContent`, never `innerHTML`.
- Pointer handling on a box mirrors a note: `⇧`-click toggles in the selection, click selects, drag moves via the board's `drag`, double-click edits text. While editing, pointer events inside the text place the caret and do not drag.
- Tools: `begin(e)` records the start in board units (`Board.toBoard`), shows a live preview element, and on release creates the shape with `GRID`-snapped x/y/w/h (`GRID = 8`, `Alt` disables snapping as for notes), `z = Board.nextZ()`, `color` = the colour of the last shape made this session, initially `'moth'`. Under 4 screen pixels of movement it is a click: default size centred on the pointer. Then `setTool('select')`, select the new shape, `editText` it.
- Toolbar: `h('div', { class: 'hud-pill draw-bar', role: 'toolbar', 'aria-label': 'Drawing tools' })` appended to the board viewport, bottom centre, buttons built like `Board`'s `btn()` (no focus stealing, `title` with the key, `aria-pressed`). Order: select, rect, ellipse, diamond, text, line, arrow, frame. In this task line, arrow and frame buttons exist but are wired in Tasks 8 and 9; do not render them until then. Stop `pointerdown`, `dblclick` and `wheel` from reaching the board, as `board-nav` does.
- `Draw.key(e)`: only when no modifier is held and the target is not a typing target: `v r o d x` set the tool; `Escape` sets `select` and returns true only if a tool other than select was armed.
- `mount(board)`: clear, `setTool('select')`, build every known-type box; `unmount()`: remove elements and any preview.
- Minimap: boxes are drawn as outlined rectangles in their paper colour after the notes.

- [ ] **Step 1: Write the failing tests**

```js
{
  const b = { id: uid(), name: 'Diagram', created: now(), items: [] };
  Store.S.data.boards.push(b); App.openTab('b:' + b.id); await wait(60);
  const vp = $('.board-vp'), at = (x, y) => { const r = vp.getBoundingClientRect(); return { clientX: r.left + x, clientY: r.top + y }; };
  const ptr = (type, el, x, y, o = {}) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...at(x, y), ...o }));
  const draw = async (tool, x1, y1, x2, y2) => { keydown(document.body, tool); ptr('pointerdown', vp, x1, y1); ptr('pointermove', window, x2, y2); ptr('pointerup', window, x2, y2); await wait(30); };

  ok('the board has a toolbar of drawing tools', $$('.draw-bar button').length >= 5);
  Board.zoomAt(1); await frame();
  const p0 = Board.toBoard(at(300, 200).clientX, at(300, 200).clientY);
  await draw('r', 300, 200, 460, 296);
  const s = Store.shapes(b)[0];
  ok('R then a drag draws a rectangle under the pointer, on the grid', s && s.type === 'rect' && Math.abs(s.x - p0.x) <= 8 && Math.abs(s.y - p0.y) <= 8 && s.w === 160 && s.h === 96 && s.x % 8 === 0, JSON.stringify(s));
  ok('the tool goes back to Select and the new box is being typed in', Draw.tool() === 'select' && document.activeElement.classList.contains('shape-text'));
  await type('rod xl cfv');
  ok('letters typed into a box are text, not tools', Draw.tool() === 'select' && Store.shapes(b).length === 1);
  keydown(document.activeElement, 'Escape'); await wait(20);
  ok('the text is saved as plain text', s.text === 'rod xl cfv' && $('.shape .shape-text').textContent === 'rod xl cfv');

  Board.zoomAt(0.2); await frame();
  const q = Board.toBoard(at(400, 300).clientX, at(400, 300).clientY);
  keydown(document.body, 'o'); ptr('pointerdown', vp, 400, 300); ptr('pointerup', window, 400, 300); await wait(30);
  keydown(document.activeElement, 'Escape');
  const e = Store.shapes(b)[1];
  ok('a click at 20% zoom drops a default ellipse centred under the pointer', e.type === 'ellipse' && e.w === 160 && e.h === 96 && Math.abs(e.x + 80 - q.x) <= 8 && Math.abs(e.y + 48 - q.y) <= 8, JSON.stringify([e, q]));
  Board.zoomAt(2.5); await frame();
  const q2 = Board.toBoard(at(500, 300).clientX, at(500, 300).clientY);
  keydown(document.body, 'd'); ptr('pointerdown', vp, 500, 300); ptr('pointerup', window, 500, 300); await wait(30);
  keydown(document.activeElement, 'Escape');
  const dm = Store.shapes(b)[2];
  ok('and at 250%', dm.type === 'diamond' && Math.abs(dm.x + 80 - q2.x) <= 8, JSON.stringify([dm, q2]));
  Board.zoomAt(1); await frame();

  const n = Board.addNote({ x: 600, y: 80 }, false, '<p>beside a box</p>');
  Board.selectAll();
  ok('select all takes notes and boxes together', Board.selection().length === 4);
  const x0 = s.x, nx0 = Board.item(n.id).x;
  keydown(document.body, 'ArrowRight'); await wait(20);
  ok('arrows nudge both', s.x === x0 + 8 && Board.item(n.id).x === nx0 + 8);
  Board.select(s.id); keydown(document.body, '7'); await wait(20);
  ok('1-9 colours a box', s.color === 'sea' && $(`.shape[data-id="${s.id}"]`).classList.contains('paper-sea'));
  keydown(document.body, 'Delete'); await wait(20);
  ok('Del deletes a box at once, with undo', Store.shapes(b).length === 2 && !$(`.shape[data-id="${s.id}"]`));
  keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac }); await wait(30);
  ok('undo brings it back', Store.shapes(b).length === 3 && !!$(`.shape[data-id="${s.id}"]`));

  keydown(document.body, 'r');
  Store.S.data = Store.S.data; App.enter(); await wait(60); // what a reload from disk does
  ok('a reload leaves the board in Select with nothing half-drawn', Draw.tool() === 'select' && !$('.shape-preview'));
  for (const th of ['night', 'day']) {
    document.documentElement.dataset.theme = th; await frame();
    const cs = getComputedStyle($('.shape .shape-bg').firstElementChild);
    ok(`box outlines are visible in the ${th} theme`, cs.stroke !== cs.fill && cs.stroke !== 'none', cs.stroke);
  }
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement the Board changes** listed above. Run `npm test`: every pre-existing check must still pass before continuing (the new block still fails).
- [ ] **Step 4: Implement the Draw module parts** listed above.
- [ ] **Step 5: Run** `npm test` — no `FAIL`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Boards: boxes with text (rectangle, ellipse, diamond, text) that select and move with notes"`

### Task 8: Lines and arrows that stick

**Files:**
- Modify: `src/js/07c-draw.js`, `src/js/07-board.js`, `src/css/app.css`
- Test: `test/smoke.js`

**Interfaces:**
- Consumes: `Draw.anchor`, `Draw.route`, `Board.rectOf`, `Draw.geom`, `Store.addShape`.
- Produces: `Draw.lines() -> line[]` of the mounted board; `Draw.points(line) -> [{x, y}]` (the route as drawn, in board units; used by tests and hit-testing); `Draw.redraw()` schedules one redraw per animation frame.

**Behaviour to build:**
- One `<svg class="wires">` as the last child of `.plane`, `overflow: visible`, `pointer-events: none`, zero size. Each line is a `<g class="wire paper-<color>" data-id>` with: a wide transparent hit path (`stroke-width: 14`, `pointer-events: stroke`), the visible path (`stroke: var(--stroke)`, `stroke-width: 1.75`, `fill: none`, `stroke-dasharray: 6 5` when `dash`), and arrowheads drawn as small filled `<path>` triangles (10 long, 7 wide) rotated to the last segment's direction; do not use SVG `<marker>` (it cannot take the per-line colour without `context-stroke`, which is not reliable).
- `resolve(end)`: `{x, y}` stays; `{note}` → `{rect: Board.rectOf(id), kind: 'box'}`; `{shape}` → `{rect: geom, kind: KINDS[type]}`.
- Redraw triggers: `Draw.moved(ids)` from Board during drag/nudge/resize; a single `ResizeObserver` observing the elements of notes that have a line attached (a note grows as you type); `bus.on('change')` for `'notes'`.
- Tools `L` (creates `head: 'none'`) and `C` (creates `head: 'end'`): press, drag, release. At press and at release, the topmost note or box under the pointer (frames do not count; use `document.elementsFromPoint` and `closest('.note, .shape:not(.shape-frame)')`) becomes an attached end; otherwise a free point snapped to the grid. A candidate target gets the class `wire-target` while hovered. A line shorter than 8 board units with two free ends is discarded. New lines are `route: 'elbow'` when both ends are attached, straight otherwise.
- Selecting: click on a wire selects it (class `sel`, thicker stroke in `var(--accent)`); lines join the shared selection set so `⇧`-click, `Del`, `1`–`9` and `⌘A` work; a line has no geometry, so drag and nudge skip a line whose both ends are attached, and move the free ends of the others by the delta.
- A selected line shows two round handles at its ends. Dragging one re-targets that end with the same attach rule as creation.
- Connector dots: with exactly one note or box selected and Select armed, four 10px dots (`.cdot`) appear at the middle of its sides, 12 units outside. Pressing a dot starts the arrow tool with the `a` end already attached to that thing.
- Label: double-click a line (or `↵` with one line selected) edits `text` in a small `plaintext-only` element positioned at the route's midpoint, on a `var(--bg)` background so the line does not strike through it.
- Minimap: each line as a 1px stroke along its route.

- [ ] **Step 1: Write the failing tests** (continue in the Diagram board from Task 7, helpers `ptr`, `at` in scope; recreate them if this is a new block)

```js
{
  const b = Board.current();
  const A = Store.addShape(b, { id: uid(), type: 'rect', x: 0, y: 0, w: 96, h: 96, z: 50, color: 'moth', text: 'A' });
  const B = Store.addShape(b, { id: uid(), type: 'ellipse', x: 400, y: 0, w: 96, h: 96, z: 51, color: 'moth', text: 'B' });
  const n = Board.addNote({ x: 0, y: 400 }, false, '<p>a note</p>');
  App.enter(); await wait(60);
  const mid = (id) => { const r = (Draw.el(id) || Board.el(id)).getBoundingClientRect(), v = $('.board-vp').getBoundingClientRect(); return [r.left - v.left + r.width / 2, r.top - v.top + r.height / 2]; };
  keydown(document.body, 'c');
  ptr('pointerdown', $('.board-vp'), ...mid(A.id)); ptr('pointermove', window, ...mid(B.id)); ptr('pointerup', window, ...mid(B.id)); await wait(40);
  const ln = Draw.lines()[0];
  ok('C draws an arrow attached at both ends', ln && ln.a.shape === A.id && ln.b.shape === B.id && ln.head === 'end' && !('x' in ln.a));
  let pts = Draw.points(ln);
  ok('it runs between the outlines, not the centres', pts[0].x >= 96 && pts[pts.length - 1].x <= 400, JSON.stringify(pts));
  B.x = 400; B.y = 320; Draw.place(B); Draw.moved([B.id]); await frame(); await frame();
  pts = Draw.points(ln);
  ok('the arrow follows a moved box', pts[pts.length - 1].y > 300, JSON.stringify(pts));
  ok('an arrow has a head at its end only', $$(`.wire[data-id="${ln.id}"] .wire-head`).length === 1);

  keydown(document.body, 'c');
  ptr('pointerdown', $('.board-vp'), ...mid(A.id)); ptr('pointermove', window, ...mid(n.id)); ptr('pointerup', window, ...mid(n.id)); await wait(40);
  const l2 = Draw.lines()[1];
  ok('an arrow can end on a note', l2.b.note === n.id);
  const before = JSON.stringify(Draw.points(l2));
  const other = Store.S.data.boards[0]; Store.place(other.id, n.id, { x: 900, y: 900 });
  other.items.find((it) => it.note === n.id).x = 5000;
  Draw.redraw(); await frame(); await frame();
  ok('a note moved on another board does not move the arrow here', JSON.stringify(Draw.points(l2)) === before);

  keydown(document.body, 'l');
  ptr('pointerdown', $('.board-vp'), 700, 500); ptr('pointermove', window, 820, 560); ptr('pointerup', window, 820, 560); await wait(40);
  const l3 = Draw.lines()[2];
  ok('L draws a plain line between two free points', l3.head === 'none' && 'x' in l3.a && 'x' in l3.b && !$(`.wire[data-id="${l3.id}"] .wire-head`));
  Board.select(A.id); await frame();
  ok('a selected box offers connector dots', $$('.cdot').length === 4);
  Draw.remove([A.id]); await wait(30);
  ok('deleting a box frees the ends attached to it', 'x' in ln.a && 'x' in l2.a && Draw.lines().length === 3);
  keydown(document.body, 'z', { metaKey: isMac, ctrlKey: !isMac }); await wait(30);
  ok('undo attaches them again', ln.a.shape === A.id && l2.a.shape === A.id);
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement** the wires layer, `resolve`, `points`, `redraw`, redraw triggers, and add the line and arrow buttons to the toolbar.
- [ ] **Step 4: Implement** creation with attach, selection, end handles, connector dots, labels, minimap strokes.
- [ ] **Step 5: Run** `npm test` — no `FAIL`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Boards: lines and arrows that attach to notes and boxes and follow them"`

### Task 9: Frames, and detaching when notes leave

**Files:**
- Modify: `src/js/07c-draw.js`, `src/js/07-board.js` (`drag`, `remove`, `removeMany`, `removeEverywhere`, `removeEverywhereMany` and their undo closures), `src/css/app.css`
- Test: `test/smoke.js`

**Behaviour to build:**
- A frame is `h('div', { class: 'shape shape-frame paper-<color>' }, h('div', { class: 'frame-name' }), ...rz handles)`: a 1px `var(--stroke)` outline, a fill of `color-mix(in srgb, var(--paper) 22%, transparent)`, `z-index: 0` (under every note and box; notes start at `z` 1), its name above the top-left corner in 12px. `pointer-events` are on the outline, the name and the handles only, so the inside still pans, draws a marquee and takes double-click for a new note.
- Tool `F`; default 480×320; after drawing, the name is in edit mode (single line: `↵` commits).
- In `Board.drag`: before building `moving`, expand the dragged ids with `Draw.inside(frameId)` for every frame among them. `Draw.inside(id) -> string[]` returns ids of notes and boxes (not frames, not lines) on the board whose centre is inside the frame's rectangle, computed at that moment.
- Board `remove`/`removeMany` pass the note's live rect centre as `at` to `Store.unplace(board.id, id, at)` where `at` is the anchor point each attached line currently uses (so the line does not jump): compute per line with `Draw.points(line)` end before unplacing, and patch the detached ends with those points. Undo closures call `Store.reattach(out.detached)` then `Draw.redraw()`.
- `removeEverywhere*`: `Store.deleteNote` already detaches (Task 5); the undo path already reattaches through `restoreNote`; add `Draw.redraw()` after both.

- [ ] **Step 1: Write the failing tests**

```js
{
  const b = { id: uid(), name: 'Frames', created: now(), items: [] };
  Store.S.data.boards.push(b); App.openTab('b:' + b.id); await wait(60);
  const fr = Store.addShape(b, { id: uid(), type: 'frame', x: 0, y: 0, w: 480, h: 320, color: 'moth', text: 'Backend' });
  const inBox = Store.addShape(b, { id: uid(), type: 'rect', x: 40, y: 40, w: 96, h: 96, z: 2, color: 'moth', text: '' });
  const outBox = Store.addShape(b, { id: uid(), type: 'rect', x: 600, y: 40, w: 96, h: 96, z: 3, color: 'moth', text: '' });
  const n = Board.addNote({ x: 200, y: 100 }, false, '<p>inside</p>');
  const ln = Store.addShape(b, { id: uid(), type: 'line', a: { note: n.id }, b: { shape: outBox.id }, head: 'end' });
  App.enter(); await wait(60);
  ok('a frame shows its name and sits under notes', $('.shape-frame .frame-name').textContent === 'Backend' && +getComputedStyle($('.shape-frame')).zIndex < +getComputedStyle(Board.el(n.id)).zIndex);
  ok('a frame holds what is centred inside it', JSON.stringify(Draw.inside(fr.id).sort()) === JSON.stringify([inBox.id, n.id].sort()));
  const name = $('.shape-frame .frame-name'), r = name.getBoundingClientRect();
  name.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 4, clientY: r.top + 4 }));
  dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 84, clientY: r.top + 4 }));
  dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 84, clientY: r.top + 4 })); await wait(30);
  ok('dragging a frame moves its contents and nothing else', fr.x === 80 && inBox.x === 120 && Board.item(n.id).x === 280 && outBox.x === 600, JSON.stringify([fr.x, inBox.x, Board.item(n.id).x, outBox.x]));

  const end = Draw.points(ln)[0];
  App.openTab('notes'); await wait(60);
  const saved = Store.deleteNote(n.id); Store.change('notes');
  App.openTab('b:' + b.id); await wait(60);
  ok('a note deleted from another page leaves its arrow with a free end, and the board still opens', 'x' in ln.a && Draw.lines().length === 1 && !!$(`.wire[data-id="${ln.id}"]`));
  Store.restoreNote(saved); Store.change('notes'); App.enter(); await wait(60);
  ok('restoring the note attaches the arrow again', ln.a.note === n.id);

  const p = Draw.points(ln)[0];
  Board.remove(n.id); await wait(30);
  ok('removing a note from the board leaves the arrow end where it was', Math.abs(ln.a.x - p.x) < 1 && Math.abs(ln.a.y - p.y) < 1, JSON.stringify([ln.a, p]));
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement** frames (element, tool, toolbar button, name editing, `Draw.inside`, drag expansion).
- [ ] **Step 4: Implement** the detach-at-anchor behaviour in the four Board removal paths.
- [ ] **Step 5: Run** `npm test` — no `FAIL`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Boards: frames that move their contents; arrows keep their place when a note leaves"`

### Task 10: Style bar, order, find

**Files:**
- Modify: `src/js/07c-draw.js`, `src/js/07-board.js` (`textRanges` callers in `refind`, `key` for `[` `]`), `src/js/00-util.js` (icons `elbow dash front back`), `src/css/app.css`
- Test: `test/smoke.js`

**Behaviour to build:**
- `Draw.styleBar`: a `hud-pill draw-style` above the toolbar, rendered whenever the selection contains at least one shape (subscribe to selection changes by having `Board.setGroup` call `Draw.selected(ids)`). Controls, each a non-focusable button with `aria-pressed` and a `title`:
  - nine colour swatches (`cp-sw paper-<c>` reused from the note colour picker), applies to every selected shape and line;
  - Fill (boxes only; toggles `fill: false`), Dashed (toggles `dash: true`);
  - To front / To back (boxes: `z = Board.nextZ()` / `z = (minimum z on the board) - 1`, not below 1: when the minimum is already 1, add 1 to every other thing first);
  - lines only: Straight / Elbow (sets or deletes `route`), heads None / End / Both.
  Controls that do not apply to the current selection are not rendered.
- Keys: `]` front, `[` back for selected boxes.
- Find (`⌘F`): `refind()` also walks `.shape-text`, `.frame-name` and line labels of the mounted board (through `Draw.textEls() -> [{ id, el }]`), so matches in shapes are counted and stepped through; `paintFind` centres via `geomOf`, and for a line via the midpoint of its route.

- [ ] **Step 1: Write the failing tests**

```js
{
  const b = Board.current();
  const box = Store.addShape(b, { id: uid(), type: 'rect', x: 0, y: 500, w: 160, h: 96, z: 9, color: 'moth', text: 'payments broker' });
  const ln = Store.addShape(b, { id: uid(), type: 'line', a: { x: 0, y: 700 }, b: { x: 200, y: 700 }, head: 'end' });
  App.enter(); await wait(60);
  ok('no style bar with nothing selected', !$('.draw-style'));
  Board.select(box.id); await frame();
  const press = (title) => $$('.draw-style button').find((x) => x.title.startsWith(title)).click();
  ok('selecting a box shows its styles, without line controls', !!$('.draw-style') && $$('.draw-style .cp-sw').length === 9 && !$$('.draw-style button').some((x) => x.title.startsWith('Elbow')));
  press('Fill'); press('Dashed'); await frame();
  ok('fill and dash are stored only when set', box.fill === false && box.dash === true);
  press('Fill'); press('Dashed');
  ok('and removed when unset', !('fill' in box) && !('dash' in box));
  $$('.draw-style .cp-sw')[3].click();
  ok('a swatch colours the selection', box.color === 'rose');
  Board.select(ln.id); await frame();
  press('Elbow'); press('Both');
  ok('a line can be an elbow with two heads', ln.route === 'elbow' && ln.head === 'both' && $$(`.wire[data-id="${ln.id}"] .wire-head`).length === 2);
  press('Straight');
  ok('straight is the absence of a route', !('route' in ln));
  Board.find('broker'); await wait(60);
  ok('find sees text in boxes', /1 of 1/.test($('.find-count').textContent), $('.find-count').textContent);
  Board.closeFind();
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement** the style bar and keys.
- [ ] **Step 4: Implement** find over shape text.
- [ ] **Step 5: Run** `npm test` — no `FAIL`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Boards: style bar for shapes and lines; find looks inside shapes"`

### Task 11: Commands, shortcuts, docs, release, real-Chrome check

**Files:**
- Modify: `src/js/10-app.js` (`commands()`, `shortcuts()`)
- Modify: `README.md`, `CHANGELOG.md`, `package.json` (version `1.3.0`), `package-lock.json` (version fields)
- Modify: `frogmouth.html` (rebuild)
- Test: `test/smoke.js`

- [ ] **Step 1: Write the failing test**

```js
{
  const titles = App.commands().map((c) => c.title);
  ok('drawing tools are in the command list', ['Draw a rectangle', 'Draw an ellipse', 'Draw a diamond', 'Add text', 'Draw a line', 'Draw an arrow', 'Draw a frame'].every((t) => titles.includes(t)), titles.join('|'));
  keydown(document.body, '?'); await wait(40);
  ok('the shortcuts list has a Drawing section', $$('.keys-grid h3').some((e) => e.textContent === 'Drawing'));
  $('.modal .btn.primary').click(); await wait(20);
}
```

- [ ] **Step 2: Run** `npm test` — expected FAIL.
- [ ] **Step 3: Implement.** Seven commands, each `{ title, key: 'R' | 'O' | 'D' | 'X' | 'L' | 'C' | 'F', when: isBoardView, run: () => Draw.setTool(name) }`. A `['Drawing', […]]` section in `shortcuts()` after `Board`: the eight tool keys, `Double-click, ↵` edit text, `[ ]` back/front, `Drag a side dot` connect, `Del` delete.
- [ ] **Step 4: Run** `npm test` — no `FAIL`.
- [ ] **Step 5: Docs.** README: a new **Diagrams** group under "What it does" after "Boards of sticky notes" (tools and keys, lines stick and follow, frames move their contents, colours are the nine papers, `Del` deletes with undo, no pen by design); a `Drawing` table under "Keyboard"; add `"shapes"` to the JSON sample and `src/js/07c-draw.js   boxes, frames, lines and arrows on a board` to the file list. CHANGELOG: finish the `## 1.3.0 (2026-11-11)` section. Bump the version in `package.json` and both version fields at the top of `package-lock.json`.
- [ ] **Step 6: Full check.** `export PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH && npm run build && git add -A && git commit -m "Release 1.3.0: diagrams, visible editing, calmer board lists" && npm run check` — expected: build succeeds, `git diff --exit-code` is silent, every smoke line is `ok`.
- [ ] **Step 7: Verify in real Chrome** (the project's standing rule: headless tests are not enough for UI). Run `npm run dev`, open the page with the Claude in Chrome tools, choose "Try it without saving", and check by eye in both themes and at 20%, 100% and 250% zoom:
  1. Secret rows show the pencil; pills show the pencil on the open board; right-click menu works; the Boards panel reads comfortably.
  2. Draw each box type, type in it, resize from each corner.
  3. Connect note → box → ellipse with arrows from the side dots; drag things around; type in the note until it grows and watch the arrow stay on its edge.
  4. Draw a frame around them, drag it by its name, confirm contents follow.
  5. Line colours and box outlines are readable on the board background in day and night themes for all nine colours.
  6. The toolbar and style bar do not overlap the minimap, zoom control, find bar or trail at 1280×720 and at 760px wide.
  Fix anything found, add a smoke check for it, and re-run Step 6.

---

## Self-review notes

- Spec coverage: Part A → Tasks 1-2. Part B → Tasks 3-4. Part C: format → 5; anchors/routes → 6; boxes, tools, text, shared behaviour → 7; lines, arrows, connector dots, labels → 8; frames, detaching → 9; style bar, order, find → 10; commands, docs, release → 11. Minimap and fit are in 7 (boxes) and 8 (lines).
- Review Focus items 1-5 are tested in Tasks 5, 9, 7, 8, 7.
- Names used across tasks: `Store.shapes/addShape/dropShape/putShape/detach/reattach`; `Draw.anchor/route/KINDS/mount/unmount/geom/el/place/remove/duplicate/setColor/editText/key/tool/setTool/bounds/moved/lines/points/redraw/inside/selected/textEls/begin`; `Board.plane/toBoard/rectOf/el/nextZ/setGroup/selection/select`.
