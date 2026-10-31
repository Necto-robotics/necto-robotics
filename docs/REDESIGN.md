# Loom Robotics website redesign (October 2026)

This document records what was built for the redesign brief, why, and what is left. Source facts come from the LEGOSwarm vault: Development Roadmap, Worker Robot, VENTUNO Q, Mission & Hypotheses, Events & Protocol and the WEAVE white paper.

## 1. What shipped

- **Home (`/`):** one continuous cinematic journey in seven chapters:
  - 00 Open: a daylit concrete hall, robots working at a distance.
  - 01 The worker: the room falls away to a studio.
  - 02 Inside: an exploded robot with a labeled, selectable parts list.
  - 03 Building together: six robots build a real 61-brick assembly graph, with a robot failure and lease takeover.
  - 04 The shared plan: the bricks lift into a spatial Assembly Graph.
  - 05 Beyond the arena: a lunar construction concept.
  - 06 Where it stands: status and the paths to the white paper, dev log and source.
- **White paper (`/technical.html`) and dev log (`/devlog.html`):** rebuilt on the same design system. The template is retired.
- **URLs, domain and deploy workflow:** unchanged (`.github/workflows/deploy.yml`, `CNAME`, `JOURNEY_AT_ROOT=1`).

## 2. Creative direction

**Identity**
- Strictly monochrome: black, white, graphite, silver.
- State is shown by weight, pattern and motion, never by hue: a filled dot is done, a half dot in progress, an outline next or concept.
- The supplied basket-weave mark (`images/loom-mark.svg`) appears in the nav, the footer and in relief on both flanks of the robot. No new symbols were invented.

**Light and dark.** The site is mostly light. Dark chapters are the same room with the daylight taken away, not a different page:
- The hall's baked daylight dims to black.
- A studio key and rim light rise on the hero robot.
- The page's colour scheme flips with what the reader sees, so text stays legible.

**Environments**
- **Hall:** an architectural hall for the terrestrial present.
- **Studio:** for product clarity.
- **Graph space:** a dark void for the software.
- **Moon:** chosen for the one forward-looking chapter because it is naturally monochrome. It is grounded in the white paper's own §1.1 framing (remote sites, slow links, attrition) and labeled "Concept · not a current capability".
- **Orbit and Mars:** considered and rejected as further from today's work.

**Type.** Inter Tight for display (light weights, tight tracking), Inter for body and IBM Plex Mono for labels and telemetry. All three are self-hosted, with no font CDN.

**Honesty layer**
- Every chapter carries a chip: Visualization, Real capture, Artistic visualization, or Concept.
- Robot parts carry readiness tags from the vault: In bring-up, Proposed, Undecided.
- No hardware brand or product names appear on the site. Parts are described by function and basic specs, e.g. "onboard AI compute: an octa-core Linux processor with an NPU of up to 40 TOPS, beside a real-time microcontroller".

**Terminology** follows the white paper: "Assembly Graph" and "Workload Execution and Autonomous Verification Engine".

## 3. Technical architecture

**Stack (kept):** Vite 8 + TypeScript, three.js 0.185 (`WebGLRenderer`), pmndrs postprocessing, GSAP.

**Removed:** Lenis, the magnetic snap, the Massively template and jQuery.

**Why not WebGPU now:**
- The postprocessing library is WebGL-only.
- Nothing here needs compute shaders.
- WebGL2 reach is about 97%.
- Running two render paths risks the visuals diverging between them.

The renderer is isolated behind `src/journey/stage.ts`, so it can be swapped later.

**Scrolling**
- The page scrolls natively. Nothing locks, snaps or holds the page.
- `src/journey/progress.ts` reads the story position `u` (chapter index plus progress) from where a probe line in the viewport crosses each chapter section, so the copy is the timeline.
- `src/journey/director.ts` turns `u` into a camera pose: a centripetal Catmull-Rom spline through keys in `choreography.ts`, followed by a critically damped spring. The camera eases; the page never does.

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
  - The core stands for the current revision, wired up to the human-intent node.
  - Six orbiting replicas each hold a miniature of the graph. Event pulses travel between them and the core, beside a scrolling event log, lease lines and a verification pulse.
  - Five concept buttons focus their elements and dim the rest.
- **Beyond:** a blackout transition into the Moon. Robots at 4.4× scale circle a part-built ring laid in running bond, with outlines marking the next slots.
- **Close:** the hall at dusk, the finished model.

## 6. Performance

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
- The canvas is a top band (56% of the screen). Copy scrolls below it on solid ground, so text never covers the scene it describes.
- There is no lens shift.
- The HUD shrinks to two rows and a progress bar.
- The parts and concept lists remain the primary controls.
- The nav becomes a menu.

**Reduced motion** (OS setting or `?motion=reduce`)
- The 3D stays, but the camera holds one composition per chapter and cuts with a short fade.
- All ambient animation stops.

**Without WebGL** (or `?tier=none`, or save-data) and **without JavaScript:** every chapter shows its still beside the full copy.

**Keyboard:** native scrolling, with a skip link and visible focus. Every 3D interaction has a button equivalent, and nothing important depends on hover.

## 8. Known limitations

- **Robot geometry** is an artistic interpretation. The arm's actuators and degrees of freedom are undecided in the vault, so the arm is illustrative.
- **Model scale:** the car model is shown at 2.2× real size so its progress reads from a distance. Its graph, build order and timing are real.
- **The fleet build** replays the WEAVE protocol rules over the real graph (`tools/lib/journey-lib.mjs`). It is not a recording of the ROS simulation. It is labeled Visualization.
- **Robots don't avoid each other:** each one keeps to its own lane by design, so none is needed.
- **The dev log stops at June 2026.** The vault's Dev Log has newer entries, some of which name hardware products, so they need rewriting under the no-brand-names rule before publishing.
- **White paper prose** is unchanged. §4.1 says "Mission Graph" where the rest says "Assembly Graph".
- **Architecture explorer:** its per-node detail copy is still unwritten. The panel now shows each node's one-line summary instead of the placeholders.
- **Not yet tested:** real phones, Safari and Firefox. Testing so far used Chromium device emulation.
- **Captured stills** reflect the development GPU. Fonts load from the bundle, so captures and production typography now match.
