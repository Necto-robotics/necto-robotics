import type { CamKey } from "./director";

/** Where the hero robot parks: front-left of the plinth, turned toward the
 * opening camera. Heading follows the robot convention (forward = +X local,
 * rotation.y = heading). */
export const HERO = { pos: [-1.18, 0, 0.72] as [number, number, number], heading: -0.95 };

/** The one continuous shot. u = chapter index + progress through it.
 * Chapter 05 keys are in the lunar realm's own coordinates; the cut to and
 * from it happens inside a blackout. */
export const CAMERA_KEYS: CamKey[] = [
  // 00 Open: the hall, wide; robots small at the plinth.
  { u: 0.0, pos: [-4.4, 1.2, 3.7], look: [0.4, 0.55, -0.9], fov: 40 },
  { u: 0.55, pos: [-3.3, 0.95, 3.1], look: [0.1, 0.32, -0.3], fov: 36 },
  // 01 The worker: pick out the hero, then the room falls away.
  { u: 1.0, pos: [-2.15, 0.78, 2.7], look: [-1.1, 0.3, 0.6], fov: 30 },
  { u: 1.5, pos: [-0.62, 0.48, 1.62], look: [-1.18, 0.3, 0.7], fov: 28 },
  { u: 1.85, pos: [-0.9, 0.4, 1.78], look: [-1.18, 0.3, 0.72], fov: 28 },
  // 02 Inside: pull back and up to frame the exploded stack.
  { u: 2.2, pos: [-0.42, 0.62, 1.8], look: [-1.18, 0.36, 0.72], fov: 32 },
  { u: 2.55, pos: [-0.3, 0.74, 1.95], look: [-1.15, 0.42, 0.72], fov: 34 },
  { u: 2.85, pos: [-0.5, 0.62, 1.9], look: [-1.18, 0.32, 0.72], fov: 30 },
  // 03 Building together: back into daylight, around the model.
  { u: 3.1, pos: [1.25, 0.78, 1.55], look: [0, 0.2, 0], fov: 32 },
  { u: 3.45, pos: [0.62, 0.98, 0.92], look: [0, 0.17, 0], fov: 30 },
  { u: 3.8, pos: [-0.7, 0.9, 0.85], look: [0, 0.17, 0], fov: 30 },
  // 04 The shared plan: rise with the bricks into the graph.
  { u: 4.1, pos: [0.35, 1.1, 4.3], look: [0, 1.15, 0], fov: 36 },
  { u: 4.5, pos: [1.7, 1.4, 4.0], look: [0, 1.2, 0], fov: 36 },
  { u: 4.85, pos: [2.8, 2.1, 2.6], look: [0, 1.15, 0], fov: 36 },
  // 05 Beyond the arena (lunar realm coordinates).
  { u: 4.96, pos: [-26, 7.5, 34], look: [0, 1.5, 0], fov: 30 },
  { u: 5.5, pos: [-17, 4.2, 22], look: [0, 1.2, 0], fov: 30 },
  { u: 5.94, pos: [-9, 2.6, 14], look: [0, 1.0, 0], fov: 30 },
  // 06 Close: the hall at dusk, the finished model.
  { u: 5.98, pos: [1.25, 0.5, 1.75], look: [0, 0.2, 0], fov: 30 },
  { u: 6.6, pos: [2.3, 0.85, 3.1], look: [0, 0.24, 0], fov: 32 },
  { u: 7.0, pos: [3.1, 1.15, 4.2], look: [0, 0.3, 0], fov: 32 },
];
