import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Runtime access to the committed data artifacts: bricks.glb (one indexed,
 * normal-free mesh per LDraw part; flat-shaded at runtime) and
 * journey-data.json (the real car build graph in three.js-space poses, its
 * graph-chapter layout and a deterministic event tape). */

export interface JNode {
  id: string;
  part: string;
  name: string;
  color: number;
  alpha: number;
  pos: [number, number, number];
  yawY: number;
  wave: number;
  order: number;
  /** Position in the Assembly Graph chapter layout. */
  gpos: [number, number, number];
}

export interface JEdge {
  s: string[];
  t: string;
  type: "support" | "sequencing";
}

export interface TapeEvent {
  t: number;
  type: "job_claimed" | "placement_complete" | "worker_offline" | "lease_expired";
  node?: string;
  worker?: number;
  lamport: number;
  /** Derived on each peer; never sent on the wire. */
  local?: boolean;
}

export interface JModel {
  nodes: JNode[];
  edges: JEdge[];
  waveCount: number;
  freeCount: number;
  tape: TapeEvent[];
  makespan: number;
}

export interface JourneyData {
  workers: number;
  car: JModel;
}

export interface BrickAssets {
  geometries: Map<string, THREE.BufferGeometry>;
  data: JourneyData;
}

import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const base = import.meta.env.BASE_URL;

export async function loadBrickAssets(): Promise<BrickAssets> {
  const [gltf, data] = await Promise.all([
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${base}media/bricks.glb`),
    fetch(`${base}media/journey-data.json`).then((r) => {
      if (!r.ok) throw new Error(`journey-data ${r.status}`);
      return r.json() as Promise<JourneyData>;
    }),
  ]);
  const geometries = new Map<string, THREE.BufferGeometry>();
  // quantize() bakes a dequantization transform into each node's matrix —
  // apply it so geometries are in real meters regardless of node context.
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name.startsWith("part_")) {
      const geo = (o.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(o.matrixWorld);
      geometries.set(o.name.slice(5), geo);
    }
  });
  return { geometries, data };
}
