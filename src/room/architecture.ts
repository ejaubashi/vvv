import {
  Scene,
  PerspectiveCamera,
  Mesh,
  BoxGeometry,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Material,
  DirectionalLight,
  HemisphereLight,
  Color,
  Fog,
  PCFShadowMap,
  PlaneGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  type BufferGeometry,
} from "three/webgpu";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { roomDefinition, type RoomId } from "./catalog";

export interface RoomMaterials {
  stone: Material;
  floor: Material;
  sculpture: Material;
  fabric?: Material;
}
export function createArchitecture(
  materials: RoomMaterials = {
    stone: new MeshStandardMaterial({ color: 0xbababa, roughness: 0.84 }),
    floor: new MeshStandardMaterial({ color: 0x888888, roughness: 0.48 }),
    sculpture: new MeshStandardMaterial({
      color: 0xdadada,
      roughness: 0.2,
      metalness: 0.25,
    }),
  },
  id: RoomId = "gallery",
) {
  const definition = roomDefinition(id);
  const scene = new Scene();
  scene.background = new Color(definition.background);
  scene.fog = new Fog(definition.fog, 18, 45);
  const camera = new PerspectiveCamera(53, 1, 0.1, 45);
  camera.position.set(0, 1.55, 6.2);
  camera.lookAt(0, 1.65, -5.5);
  const meshes: Mesh[] = [];
  const add = (
    name: string,
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  add("floor", new BoxGeometry(8, 0.18, 20), materials.floor, 0, -0.09, -5);
  add("ceiling", new BoxGeometry(8, 0.15, 20), materials.stone, 0, 5.08, -5);
  add("left-wall", new BoxGeometry(0.2, 5, 20), materials.stone, -4, 2.5, -5);
  add("right-wall", new BoxGeometry(0.2, 5, 20), materials.stone, 4, 2.5, -5);
  add("end-wall", new BoxGeometry(8, 5, 0.2), materials.stone, 0, 2.5, -14);
  if (id === "gallery") {
    const outline = new Shape();
    outline.moveTo(-4, 0);
    outline.lineTo(-4, 5);
    outline.lineTo(4, 5);
    outline.lineTo(4, 0);
    outline.lineTo(1.52, 0);
    outline.lineTo(1.52, 2.28);
    outline.absarc(0, 2.28, 1.52, 0, Math.PI, false);
    outline.lineTo(-1.52, 0);
    outline.closePath();
    const archGeometry = new ExtrudeGeometry(outline, {
      depth: 0.46,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.045,
      bevelThickness: 0.035,
      curveSegments: 64,
    });
    for (const [i, z] of [1, -2, -5, -8].entries())
      add(`arch-${i}`, archGeometry, materials.stone, 0, 0, z);
  } else if (id === "nocturne") {
    const ring = new TorusGeometry(1.48, 0.09, 20, 96);
    for (const [i, z] of [-1, -5.8].entries()) {
      const mesh = add(
        `suspended-ring-${i}`,
        ring,
        materials.sculpture,
        i ? 0.4 : -0.25,
        2.2,
        z,
      );
      mesh.rotation.y = i ? -0.2 : 0.14;
    }
    const strip = new BoxGeometry(0.045, 4.3, 0.05);
    const luminous = new MeshBasicMaterial({ color: 0xc7dcf6 });
    for (const x of [-3.84, 3.84])
      add("light-seam", strip, luminous, x, 2.5, -5);
  } else {
    const cloth = new PlaneGeometry(2.4, 4.2, 48, 40);
    const vertices = cloth.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i),
        y = vertices.getY(i);
      const fold = Math.sin(x * 9) * 0.13 + Math.sin(x * 4.3 + y * 0.35) * 0.16;
      vertices.setZ(i, fold);
      vertices.setY(i, y - (0.065 * Math.cos(x * 5) * (2.1 - y)) / 4.2);
    }
    cloth.computeVertexNormals();
    for (const [i, z] of [-0.4, -5.2].entries()) {
      for (const side of [-1, 1]) {
        const panel = add(
          `fabric-${i}-${side}`,
          cloth,
          materials.fabric ?? materials.stone,
          side * (i ? 1.85 : 2.05),
          2.65,
          z,
        );
        panel.rotation.y = side * (i ? 0.25 : -0.16);
      }
      add(
        `suspension-${i}`,
        new CylinderGeometry(0.025, 0.025, 7, 12),
        materials.sculpture,
        0,
        4.8,
        z,
      ).rotation.z = Math.PI / 2;
    }
  }
  const occluder = add(
    "foreground-column",
    new RoundedBoxGeometry(0.45, 2.8, 0.45, 3, 0.035),
    materials.stone,
    -0.38,
    1.4,
    -3.1,
  );
  const plinth = add(
    "plinth",
    new CylinderGeometry(0.62, 0.68, 0.65, 40),
    materials.floor,
    0,
    0.325,
    -10.5,
  );
  const sculpture = add(
    "sculpture",
    new SphereGeometry(0.62, 40, 24),
    materials.sculpture,
    0,
    1.35,
    -10.5,
  );
  const sun = new DirectionalLight(definition.light, definition.intensity);
  sun.position.set(3.2, 4.65, 4);
  sun.target.position.set(-0.5, 0.5, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 2.5;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 0.3;
  sun.shadow.camera.far = 32;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.014;
  scene.add(sun, sun.target, new HemisphereLight(0xe8efff, 0x4c443a, 0.55));
  return {
    scene,
    camera,
    meshes,
    occluder,
    sculpture,
    plinth,
    sun,
    shadowType: PCFShadowMap,
  };
}
export function disposeArchitecture(
  model: ReturnType<typeof createArchitecture>,
) {
  const geometries = new Set(model.meshes.map((mesh) => mesh.geometry));
  const materials = new Set(
    model.meshes.flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material],
    ),
  );
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  model.sun.shadow.dispose();
  model.scene.clear();
}
