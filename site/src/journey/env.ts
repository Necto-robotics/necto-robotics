import * as THREE from "three";

/** Procedural reflection environments, rendered once into PMREM maps. Metal
 * and polymer read as real materials only when they have something to
 * reflect, so each mood gets its own set of softboxes:
 *   hall   - a bright overcast ceiling with long skylight strips
 *   studio - black, with one large key softbox, a strip rim and a floor kick
 */
export interface Environments {
  hall: THREE.Texture;
  studio: THREE.Texture;
  dispose(): void;
}

function panel(w: number, h: number, intensity: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

function place(o: THREE.Object3D, pos: [number, number, number], target: [number, number, number] = [0, 0, 0]) {
  o.position.set(...pos);
  o.lookAt(...target);
  return o;
}

function roomShell(color: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(20, 32, 16);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  return new THREE.Mesh(g, m);
}

export function createEnvironments(renderer: THREE.WebGLRenderer): Environments {
  const pmrem = new THREE.PMREMGenerator(renderer);

  const hall = new THREE.Scene();
  const shell = roomShell(0x6b6d70);
  hall.add(shell);
  // Ground bounce: a warm-neutral floor plane below.
  hall.add(place(panel(40, 40, 0.28), [0, -3, 0], [0, -10, 0]));
  // Skylight strips overhead, running front to back.
  for (let i = -3; i <= 3; i++) hall.add(place(panel(0.9, 14, 3.2), [i * 2.4, 6, 0], [i * 2.4, 0, 0]));
  // Glazed end wall: a tall soft panel to +X.
  hall.add(place(panel(10, 6, 2.2), [9, 1.5, 0]));
  hall.add(place(panel(10, 5, 0.6), [-9, 1.5, 0]));

  const studio = new THREE.Scene();
  studio.add(roomShell(0x000000));
  studio.add(place(panel(4, 3, 4.5), [3, 4, 5]));
  studio.add(place(panel(0.5, 6, 6), [-5, 2.5, -2]));
  studio.add(place(panel(0.4, 5, 3), [4, 1.5, -5]));
  studio.add(place(panel(8, 8, 0.12), [0, -3, 0], [0, -10, 0]));

  const hallTex = pmrem.fromScene(hall, 0.02).texture;
  const studioTex = pmrem.fromScene(studio, 0.02).texture;
  pmrem.dispose();
  for (const s of [hall, studio]) {
    s.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
  return {
    hall: hallTex,
    studio: studioTex,
    dispose() {
      hallTex.dispose();
      studioTex.dispose();
    },
  };
}
