import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Director, ORTHO_FOV, curve, type CamKey } from "../src/journey/director";
import { CAMERA_KEYS } from "../src/journey/choreography";

const D2R = Math.PI / 180;

const keys: CamKey[] = [
  { u: 0, pos: [0, 1, 4], look: [0, 1, 0], fov: 40 },
  { u: 1, pos: [0, 1, 4], look: [0, 1, 0], fov: 40, ortho: 1 },
  { u: 2, pos: [3, 2, 3], look: [0, 1, 0], fov: 30 },
];

describe("curve", () => {
  it("holds its end values and eases between keys", () => {
    const c = curve([[0, 0], [1, 1]]);
    expect(c(-1)).toBe(0);
    expect(c(2)).toBe(1);
    expect(c(0.5)).toBeCloseTo(0.5, 6);
    expect(c(0.25)).toBeLessThan(0.25);
  });
});

describe("Director ortho dolly", () => {
  it("keeps the subject the same size on screen while the lens narrows", () => {
    const d = new Director(keys);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const fov0 = d.target(0, pos, look);
    const size0 = Math.tan((fov0 * D2R) / 2) * pos.distanceTo(look);
    const fov1 = d.target(1, pos, look);
    const size1 = Math.tan((fov1 * D2R) / 2) * pos.distanceTo(look);
    expect(fov1).toBeCloseTo(ORTHO_FOV, 6);
    expect(size1).toBeCloseTo(size0, 6);
    expect(d.ortho).toBe(1);
  });

  it("dollies along the camera axis only", () => {
    const d = new Director(keys);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    d.target(1, pos, look);
    expect(pos.x).toBeCloseTo(0, 9);
    expect(pos.y).toBeCloseTo(1, 9);
    expect(pos.z).toBeGreaterThan(4);
  });
});

describe("Director orbit", () => {
  it("turns about the look target without changing distance, and clamps to the floor", () => {
    const d = new Director(keys);
    const cam = new THREE.PerspectiveCamera();
    d.update(0, 0, cam);
    const dist0 = cam.position.distanceTo(d.look);
    d.update(0, 0, cam, 0, { yaw: 1.2, pitch: 0.3, zoom: 1 }, 1);
    expect(cam.position.distanceTo(d.look)).toBeCloseTo(dist0, 6);
    expect(cam.position.x).not.toBeCloseTo(0, 3);
    d.update(0, 0, cam, 0, { yaw: 0, pitch: -3, zoom: 1 }, 1);
    expect(cam.position.y).toBeGreaterThanOrEqual(d.look.y - 0.02 - 1e-9);
    d.update(0, 0, cam, 0, { yaw: 0, pitch: 0, zoom: 1.5 }, 1);
    expect(cam.position.distanceTo(d.look)).toBeCloseTo(dist0 * 1.5, 6);
  });
});

describe("choreography", () => {
  it("keys are in story order and ortho stays inside the schematic chapters", () => {
    for (let i = 1; i < CAMERA_KEYS.length; i++) expect(CAMERA_KEYS[i]!.u).toBeGreaterThan(CAMERA_KEYS[i - 1]!.u);
    for (const k of CAMERA_KEYS) {
      if (k.ortho) expect((k.u >= 2.2 && k.u <= 2.85) || (k.u >= 4.1 && k.u <= 4.85)).toBe(true);
    }
  });
});
