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
} from "three/webgpu";

export interface RoomMaterials {
  stone: Material;
  floor: Material;
  sculpture: Material;
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
) {
  const scene = new Scene();
  scene.background = new Color(0x282828);
  scene.fog = new Fog(0x282828, 12, 30);
  const camera = new PerspectiveCamera(53, 1, 0.1, 45);
  camera.position.set(0, 1.55, 6.2);
  camera.lookAt(0, 1.65, -5.5);
  const meshes: Mesh[] = [];
  const add = (
    name: string,
    geometry: BoxGeometry | ExtrudeGeometry | SphereGeometry | CylinderGeometry,
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
    depth: 0.32,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.035,
    curveSegments: 32,
  });
  for (const [i, z] of [1, -2, -5, -8].entries())
    add(`arch-${i}`, archGeometry, materials.stone, 0, 0, z);
  const occluder = add(
    "foreground-column",
    new BoxGeometry(0.45, 2.8, 0.45),
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
  const sun = new DirectionalLight(0xffffff, 3.8);
  sun.position.set(3.2, 4.65, 4);
  sun.target.position.set(-0.5, 0.5, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 0.3;
  sun.shadow.camera.far = 32;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target, new HemisphereLight(0xffffff, 0x333333, 1.35));
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
