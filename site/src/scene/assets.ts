import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** One loader for every scripted asset (meshopt-compressed, quantized).
 * Paths resolve against Vite's base so staging under /next/ still works. */
const base = import.meta.env.BASE_URL;
let loader: GLTFLoader | null = null;

function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function media(path: string): string {
  return `${base}media/${path}`;
}

export function loadGLB(path: string): Promise<GLTF> {
  return gltfLoader().loadAsync(media(path));
}

export async function loadJSON<T>(path: string): Promise<T> {
  const r = await fetch(media(path));
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (await r.json()) as T;
}

/** Find a node by exact name, or throw with a useful message. */
export function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`asset is missing node "${name}"`);
  return o;
}
