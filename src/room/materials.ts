import {
  DataTexture,
  RGBAFormat,
  FloatType,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  EquirectangularReflectionMapping,
  MeshStandardNodeMaterial,
  DoubleSide,
} from "three/webgpu";
import {
  color,
  float,
  texture,
  positionWorld,
  normalWorld,
  triplanarTexture,
  bumpMap,
  reflector,
} from "three/tsl";
import { roomDefinition, type RoomId } from "./catalog";

/** Small, deterministic textures keep the room self-contained and available offline. */
export function createRoomSurfaces(id: RoomId = "gallery") {
  const definition = roomDefinition(id);
  const grainData = new Uint8Array(256 * 256 * 4);
  let seed = 1847;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0xffffffff;
      const cloud =
        Math.sin((x * Math.PI) / 32 + Math.sin((y * Math.PI) / 64)) *
        Math.cos((y * Math.PI) / 32);
      const value = Math.round(
        174 + cloud * 15 + (noise - 0.5) * 26 - (noise < 0.018 ? 35 : 0),
      );
      const i = (y * 256 + x) * 4;
      grainData.set([value, value, value, 255], i);
    }
  }
  const grain = new DataTexture(grainData, 256, 256, RGBAFormat);
  grain.wrapS = grain.wrapT = RepeatWrapping;
  grain.magFilter = LinearFilter;
  grain.minFilter = LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.needsUpdate = true;

  // A linear HDR lighting rig: a broad skylight and narrow window reflections.
  // This is authored environment illumination, not a captured HDR photograph.
  const envData = new Float32Array(256 * 128 * 4);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 256; x++) {
      const u = x / 256,
        v = y / 128;
      const ceiling = Math.exp(-Math.pow((v - 0.16) / 0.13, 4));
      const window = Math.exp(
        -Math.pow((u - 0.23) / 0.045, 8) - Math.pow((v - 0.42) / 0.2, 8),
      );
      const opposite = Math.exp(
        -Math.pow((u - 0.74) / 0.07, 8) - Math.pow((v - 0.46) / 0.17, 8),
      );
      const value = 0.12 + ceiling * 0.8 + window * 5 + opposite * 1.4;
      envData.set([value * 1.025, value, value * 0.96, 1], (y * 256 + x) * 4);
    }
  }
  const environment = new DataTexture(envData, 256, 128, RGBAFormat, FloatType);
  environment.mapping = EquirectangularReflectionMapping;
  environment.needsUpdate = true;

  const stone = new MeshStandardNodeMaterial({ roughness: 0.78 });
  const stoneGrain = triplanarTexture(
    texture(grain),
    null,
    null,
    float(1.1),
    positionWorld,
    normalWorld,
  ).r;
  stone.colorNode = color(definition.stone).mul(stoneGrain.mul(0.24).add(0.79));
  stone.roughnessNode = stoneGrain.mul(0.15).add(0.72);
  stone.normalNode = bumpMap(stoneGrain, float(0.026));
  stone.aoNode = positionWorld.y.smoothstep(0, 0.3).mul(0.22).add(0.78);

  const floor = new MeshStandardNodeMaterial({
    roughness: 0.36,
    metalness: 0.04,
  });
  const floorGrain = texture(grain, positionWorld.xz.mul(0.55)).r;
  const tile = positionWorld.xz.mul(0.7).fract();
  const distanceToJoint = tile.min(float(1).sub(tile));
  const joints = distanceToJoint.x
    .smoothstep(0.002, 0.008)
    .mul(distanceToJoint.y.smoothstep(0.002, 0.008));
  floor.colorNode = color(definition.floor)
    .mul(floorGrain.mul(0.12).add(0.86))
    .mul(joints.mul(0.18).add(0.82));
  floor.roughnessNode = floorGrain
    .mul(0.12)
    .add(id === "nocturne" ? 0.18 : 0.32);
  floor.normalNode = bumpMap(
    floorGrain.mul(0.018).add(joints.mul(0.006)),
    float(1),
  );
  // Fixed-geometry contact occlusion. Directional shadows still handle actual blockers.
  const wallContact = positionWorld.x
    .abs()
    .sub(3.85)
    .div(0.3)
    .exp()
    .clamp(0, 1);
  const columnContact = positionWorld.x
    .add(0.38)
    .pow(2)
    .add(positionWorld.z.add(3.1).pow(2))
    .mul(-5)
    .exp();
  const plinthContact = positionWorld.x
    .pow(2)
    .add(positionWorld.z.add(10.5).pow(2))
    .mul(-1.5)
    .exp();
  floor.aoNode = float(1).sub(
    wallContact.max(columnContact).max(plinthContact).mul(0.55),
  );
  const reflection = reflector({
    resolutionScale: 0.5,
    generateMipmaps: true,
    bounces: false,
    samples: 0,
  });
  reflection.target.rotation.x = -Math.PI / 2;
  reflection.target.position.y = 0.004;
  // One half-resolution reflected view, softened and subdued like honed stone.
  floor.emissiveNode = reflection
    .level(float(2))
    .rgb.mul(id === "nocturne" ? 0.22 : 0.13);

  const sculpture = new MeshStandardNodeMaterial({
    color: definition.sculpture,
    metalness: id === "veil" ? 0.12 : 0.86,
    roughness: id === "veil" ? 0.48 : 0.18,
  });
  const fabric = new MeshStandardNodeMaterial({
    color: 0xe8dfce,
    roughness: 0.96,
    side: DoubleSide,
  });
  const weave = positionWorld.x
    .mul(160)
    .sin()
    .mul(positionWorld.y.mul(160).sin());
  fabric.normalNode = bumpMap(weave, float(0.0005));
  fabric.aoNode = float(0.9);
  return {
    materials: { stone, floor, sculpture, fabric },
    environment,
    reflection,
    dispose() {
      // The other materials are disposed with their geometry graph.
      if (id !== "veil") fabric.dispose();
      reflection.dispose();
      grain.dispose();
      environment.dispose();
    },
  };
}
