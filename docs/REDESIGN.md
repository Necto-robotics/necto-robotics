# Necto Robotics website redesign (October 2026)

This document records what was built for the redesign brief, why, and what is left. Source facts come from the LEGOSwarm vault: Development Roadmap, Worker Robot, VENTUNO Q, Mission & Hypotheses, Events & Protocol and the WEAVE white paper.

## 1. What shipped

- **Home (`/`):** one continuous cinematic journey in seven chapters:
  - 00 Open: a daylit concrete hall, robots working at a distance.
  - 01 The worker: the room falls away to a studio.
  - 02 Inside: an exploded robot with a labeled, selectable parts list.
  - 03 Building together: six robots build a real 61-brick assembly graph, with a robot failure and lease takeover.
  - 04 The shared plan: the bricks lift into a spatial Assembly Graph.
  - 05 Beyond the arena: a lunar construction concept.
  - 06 Where it stands: what is complete, what is ahead, and the paths to the white paper, dev log and source.
- **White paper (`/technical.html`) and dev log (`/devlog.html`):** rebuilt on the same design system. The template is retired.
- **URLs, domain and deploy workflow:** unchanged (`.github/workflows/deploy.yml`, `CNAME`, `JOURNEY_AT_ROOT=1`).

## 2. Creative direction

**Identity**
- Monochrome: black, white, graphite, silver, plus one accent (`--accent`, a cobalt tuned per scheme) that is reserved for focus rings and the marked row in the replay log. It never carries meaning alone.
- State is shown by weight, pattern and motion, never by hue alone: a filled dot is done, a half dot in progress, an outline next or concept.
- The supplied basket-weave mark (`images/necto-mark.svg`) appears in the nav, the footer and in relief on both flanks of the robot. No new symbols were invented.

**Light and dark.** The site is mostly light. Dark chapters are the same room with the daylight taken away, not a different page:
- The hall's baked daylight dims to black.
- A studio key and rim light rise on the hero robot.
- Each turn happens in a stretch of scroll with no copy in view. A chapter that turns the scene (`.chapter--turn`) opens with about a screen of empty scroll, and `progress.ts` pins the turn window u ∈ [i − 0.08, i + 0.08] to exactly that gap.
- Each chapter's copy keeps one fixed scheme (`data-scheme` on its section). Text never changes colour, and the background never changes behind it.
- Behind the copy column, a reading mask blurs and washes out the scene, then fades back toward the middle.

**Environments**
- **Hall:** an architectural hall for the terrestrial present.
- **Studio:** for product clarity.
- **Graph space:** a dark void for the software.
- **Moon:** chosen for the one forward-looking chapter because it is naturally monochrome. It is grounded in the white paper's own §1.1 framing (remote sites, slow links, attrition) and labeled "Concept · not a current capability".
- **Orbit and Mars:** considered and rejected as further from today's work.

**Type.**
- Inter Tight for display (light weights, tight tracking), Inter for body and IBM Plex Mono for in-scene telemetry. All three are self-hosted, with no font CDN.
- The journey copy uses three kinds of text only: display (h1, h2), title (the lead line and section heads) and body.
- Body text is one size in one of two high-contrast inks: near-black or near-white for names, and only slightly softer for prose. Grey text is never used for reading copy.

**Honesty layer**
- Every chapter carries a chip: Visualization, Real capture, Artistic visualization, or Concept.
- Robot parts carry readiness tags from the vault: In bring-up, Proposed, Undecided.
- No hardware brand or product names appear on the site. Parts are described by function and basic specs, e.g. "onboard AI compute: an octa-core Linux processor with an NPU of up to 40 TOPS, beside a real-time microcontroller".

**Terminology** follows the white paper: "Assembly Graph" and "Workload Execution and Autonomous Verification Engine".

## 3. Technical architecture

**Stack (kept):** Vite 8 + TypeScript, three.js 0.185 (`WebGLRenderer`), pmndrs postprocessing, GSAP.

**Removed:** the magnetic snap, the Massively template and jQuery. Lenis is kept for one job only: weighting the mouse wheel on the home page (see Scrolling).

**Why not WebGPU now:**
- The postprocessing library is WebGL-only.
- Nothing here needs compute shaders.
- WebGL2 reach is about 97%.
- Running two render paths risks the visuals diverging between them.

The renderer is isolated behind `src/journey/stage.ts`, so it can be swapped later.

**Scrolling**
- The page scrolls natively. Nothing locks, snaps or holds the page.
- On the home page, with a fine pointer and no reduced-motion preference, the wheel feeds a damped velocity (Lenis, `lerp` 0.085, wheel only) so the stage moves with mass. Touch, keyboard, scrollbar and anchors stay native; `?scroll=native` turns it off. Reading pages are fully native.
- `src/journey/progress.ts` maps scroll to the story position `u` (chapter index plus progress) through knots measured from the copy itself. Each boundary u = i sits in the middle of the text-free gap between two chapters' copy, so the copy is the timeline.
- `src/journey/director.ts` turns `u` into a camera pose: a centripetal Catmull-Rom spline through keys in `choreography.ts`, followed by a critically damped spring. The camera eases; the page never does.
- A key may carry `ortho` (0..1). The lens narrows toward a 9° long lens while the camera dollies back along its own axis, so the subject holds its size and the perspective drains out (a dolly zoom). The exploded worker (02) sits at 0.9, the graph (04) at 0.55. `tests/director.test.ts` checks the size invariant.
- `src/journey/orbit.ts` adds reader control on top: dragging the stage orbits the look target with inertia (touch drags keep to yaw so a swipe still scrolls; pinch zooms), and the `.view-controls` bar gives the same from buttons and arrow keys. `T.orbit` in `engine.ts` says where the story allows it; outside those spans the offset relaxes back to the authored shot.

**Single source of state.** Every visual parameter is a pure function of `u` (`T` in `engine.ts`): daylight, studio, explode, graph morph, blackout, HUD. The build itself is a pure function of tape time. So scrolling backwards un-builds exactly, and any frame can be re-rendered as a still.

**Copy** lives in semantic HTML (`site/index.html`). The engine only reads it and mirrors it, so the site reads fully without JavaScript.

**Shared chrome.** A Vite `transformIndexHtml` plugin injects `partials/header.html` and `footer.html` at build time.

**Rendering choices per chapter**
- **Hall:** real-time, with a baked global-illumination lightmap: Cycles in Blender, one 4K atlas, shown unlit.
- **Robots and bricks:** real-time PBR with procedural softbox environments (PMREM) and real-time shadows.
- **Moon:** generated procedurally at runtime, so it needs no asset download.

Pre-rendered video was not used: the exploded view, fleet and graph all benefit from being interactive and scroll-reversible.

## 4. Assets

All 3D is new, generated by scripts. No existing `.blend` file was used.

| Asset | Source | Shipped |
|---|---|---|
| Worker robot, high detail (38k tris) | `site/assets-src/blender/build_worker.py` | `site/public/media/worker.glb` (307 KB, meshopt) |
| Worker robot, fleet/low tier (6.5k tris) | same, `low` | `worker-lod.glb` (87 KB) |
| Assembly hall + 4K baked lightmap | `build_hall.py` | `hall.glb` (190 KB) |
| Lunar terrain, ring structure, Earth, stars | `src/scene/lunar.ts` (runtime) | code only |
| LEGO bricks (real LDraw geometry, greyscale ABS) | existing `bricks.glb` | unchanged |
| Car assembly graph, 6-worker tape with one failure, graph layout | `tools/build-journey-data.mjs` | `journey-data.json` |
| Chapter stills, poster, social card | dev route `?capture=stills` + `tools/build-stills.mjs` | `media/stills/*.avif/jpg`, `images/og-cover.jpg` |

**Rebuild commands**
- `node tools/build-assets.mjs [worker|hall] [--fast]` runs Blender headless and then gltf-transform.
- `node tools/build-journey-data.mjs` regenerates the journey data.
- For stills, open `/?capture=stills&tier=high` at 1920×1080 in dev, then run `node tools/build-stills.mjs`.

`site/assets-src/blender/render_checks.py` renders Cycles review sheets of the robot. It is used for design QA and is not shipped.

## 5. Animations and interactions

- **Open:** the camera drifts in from a wide hall shot. Robots run real job cycles from the tape: drive to their own supply tray, pick, carry, place, then a verification ring.
- **Worker:** the daylight fades to a studio. The hero robot holds a slow idle turn.
- **Inside**
  - Eight assemblies separate in a staggered, machined ease along their own axes, then return.
  - Hovering a part in 3D, or focusing or hovering a list button, isolates that assembly. A click pins the selection.
  - The real prototype camera frame shows the detector's own boxes.
- **Building together**
  - The tape drives claim lines, outlines of claimed slots, the carried brick and verification pulses.
  - One robot goes silent: its claim line shrinks as the lease runs out, the slot reopens and a survivor claims it.
  - A restrained HUD reads every figure off the tape: placed/61, wave/8, active claims, robots online, messages on the wire. It sits beside a three-line event log.
- **Shared plan**
  - Bricks arc out of the model into rings by dependency wave, with the real support edges between them.
  - The core stands for the current revision (the event log replayed), wired up to the human-intent node.
  - The graph then does two things only, replaying the real build tape: a ring marks each job while a robot holds its claim, and a pulse marks the moment its placement is verified. Labels follow one job at a time.
  - Five concept buttons focus their elements and dim the rest.
- **Beyond:** a blackout transition into the Moon. Robots at 4.4× scale circle a part-built ring laid in running bond, with outlines marking the next slots.
- **Close:** the hall at dusk, the finished model. Two short lists, Complete and Ahead, sit in the copy column.

## 6. Performance

- **Page transitions:** cross-document view transitions (`@view-transition { navigation: auto }`) cross-dissolve the three pages and carry the brand mark; `partials/header.html` ships speculation rules that prerender the reading pages on hover and prefetch `/`, and `ui/nav.ts` falls back to `<link rel=prefetch>` on idle and hover.

- **First paint** is HTML + CSS + fonts + the AVIF poster, about 160 KB uncompressed. The 3D engine loads as a separate chunk and the canvas fades in over the identical poster frame.
- **Engine chunk:** about 114 KB gzip, plus 81 KB for three.js. The lunar chunk (3 KB) and its robot asset load only as the reader nears chapter 05.
- **Assets:** meshopt plus quantization, and WebP for the lightmap. Bricks, trays and fleet parts are instanced.
- **Frame-time governor** (`governor.ts`): steps the pixel ratio down after 1.5 s of slow frames and back up after 6 s of fast ones.
- **Rendering pauses** while the footer fills the view and while the tab is hidden.
- **Tiers** (`perf/tier.ts`):
  - High: MSAA ×4, 2048 shadows, bloom, dust and shafts.
  - Mid: lighter versions of the same.
  - Low: no post, no shadows, low-detail robots.
  - Save-data or no WebGL: stills.
- **Measured:** 16.7 ms median and p95 in every chapter at 1440×900 on the development machine (RTX 3060 Ti).

## 7. Mobile and accessibility

**Phones (<48rem)**
- The canvas is a top band (56% of the screen). Copy scrolls below it on its chapter's own solid ground, so text never covers the scene it describes.
- There is no lens shift.
- The HUD shrinks to two rows and a progress bar.
- The parts and concept lists remain the primary controls.
- The nav becomes a menu.

**Reduced motion** (OS setting or `?motion=reduce`)
- The 3D stays, but the camera holds one composition per chapter and cuts with a short fade.
- All ambient animation stops.

**Without WebGL** (or `?tier=none`, or save-data) and **without JavaScript:** every chapter shows its still beside the full copy.

**Keyboard:** native scrolling, with a skip link and a 2px accent focus ring everywhere. Every 3D interaction has a button equivalent (parts and concepts lists, the orbit bar), and nothing important depends on hover.

**Landmarks and position.** The header's links sit in a `<nav aria-label="Primary">`; the chapter index on the right is the one position marker. Drawers are native `<dialog>` elements (focus trap, Escape, inert page) and return focus to their button.

**Progressive disclosure.** Part descriptions in chapter 02 open only for the selected, hovered or focused part (`aria-expanded`); without JavaScript, or on the static path, every description is visible. The replay log drawer in chapter 03 holds the full event tape (125 events, 123 on the wire) with the row the stage is playing marked.

## 8. November 2026 pass

Brief: more professional, easier to navigate, accessible, and still striking. What changed, by intent:

- **Immersion and scale.** Dolly-zoom to near-orthographic for the schematic chapters; reader orbit and zoom with inertia; no viewport chrome: a ruler, corner brackets and a telemetry readout were tried and removed, because the chapter index already says where the reader is and the stage should stay clean.
- **Weight.** Wheel inertia on the home page; one family of damped easings in `tokens.css` (`--ease-out`, `--ease-settle`); buttons compress to `scale(0.98)` on press, hover is instant and the release eases.
- **Clarity.** Nav landmark; part descriptions disclosed on demand; the replay log in a drawer; live figures that count up and rules that draw in as chapter 03 enters (`ui/reveal.ts`).
- **Prestige.** One accent for active states; exposed construction lines (`.gridlines`, 7% hairlines at the measure and gutter); tabular mono numbers throughout.
- **Performance as UX.** View transitions, speculation-rules prerender, idle prefetch. Assets stay meshopt (smaller and faster to decode than Draco for this geometry); the low tier already uses the LOD robot.

Stills re-exported for chapters 02 and 04 (the camera changed); the rest are unchanged.

## 9. Known limitations

- **Robot geometry** is an artistic interpretation. The arm's actuators and degrees of freedom are undecided in the vault, so the arm is illustrative.
- **Model scale:** the car model is shown at 2.2× real size so its progress reads from a distance. Its graph, build order and timing are real.
- **The fleet build** replays the WEAVE protocol rules over the real graph (`tools/lib/journey-lib.mjs`). It is not a recording of the ROS simulation. It is labeled Visualization.
- **Robots don't avoid each other:** each one keeps to its own lane by design, so none is needed.
- **The dev log stops at June 2026.** The vault's Dev Log has newer entries, some of which name hardware products, so they need rewriting under the no-brand-names rule before publishing.
- **White paper prose** is unchanged. §4.1 says "Mission Graph" where the rest says "Assembly Graph".
- **Architecture explorer:** its per-node detail copy is still unwritten. The panel now shows each node's one-line summary instead of the placeholders.
- **Not yet tested:** real phones, Safari and Firefox. Testing so far used Chromium device emulation.
- **Captured stills** reflect the development GPU. Fonts load from the bundle, so captures and production typography now match.
