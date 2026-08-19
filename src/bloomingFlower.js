import * as THREE from "three";
import { createPetalMaps, createSoftParticleTexture } from "./textures.js";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRosePetalGeometry({ width, length, cup, tipCurl, segmentsW = 40, segmentsL = 56 }) {
  const geometry = new THREE.PlaneGeometry(1, 1, segmentsW, segmentsL);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.995), 0.68)), 0.72);
    const edge = 1 - Math.pow(Math.abs(xNorm), 2.6);
    const radial = Math.abs(xNorm);
    const heart = v > 0.78 ? 1 - Math.pow((v - 0.78) / 0.22, 1.4) * radial * 0.35 : 1;
    const x = xNorm * width * profile * Math.max(edge, 0.05) * heart;
    const y = v * length;
    const bowl = Math.sin(v * Math.PI) * cup * (1 - radial * 0.55);
    const tip = Math.pow(v, 2.2) * tipCurl * radial;
    const z = bowl - tip;
    positions.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createPetalMaterial({ map, emissiveMap }, { transmission, roughness, opacity, thickness }, usePhysical) {
  if (!usePhysical) {
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.22,
      color: 0xffffff,
      roughness,
      metalness: 0,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: opacity > 0.88
    });
  }

  return new THREE.MeshPhysicalMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.16,
    color: 0xffffff,
    roughness,
    metalness: 0,
    transmission,
    thickness,
    ior: 1.32,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: transmission < 0.25,
    sheen: 0.85,
    sheenColor: new THREE.Color(0xffe8ee),
    sheenRoughness: 0.32,
    clearcoat: 0.28,
    clearcoatRoughness: 0.35,
    specularIntensity: 0.55,
    specularColor: new THREE.Color(0xfff0f4),
    envMapIntensity: 0.55
  });
}

export function createBloomingFlower(quality = {}) {
  const rand = mulberry32(20260819);
  const group = new THREE.Group();
  const blossom = new THREE.Group();
  blossom.position.y = 0.02;
  group.add(blossom);

  const textureSize = quality.textureSize ?? 1024;
  const segmentsW = quality.petalSegments?.w ?? 40;
  const segmentsL = quality.petalSegments?.l ?? 56;
  const usePhysical = quality.transmission !== false;
  const sparkleCount = quality.sparkleCount ?? 780;
  const totalPetals = quality.lowPoly ? 44 : 78;

  const maps = {
    inner: createPetalMaps("inner", textureSize),
    mid: createPetalMaps("mid", textureSize),
    outer: createPetalMaps("outer", textureSize)
  };

  const geometries = {
    inner: createRosePetalGeometry({ width: 0.32, length: 0.62, cup: 0.32, tipCurl: 0.28, segmentsW, segmentsL }),
    mid: createRosePetalGeometry({ width: 0.4, length: 0.82, cup: 0.26, tipCurl: 0.22, segmentsW, segmentsL }),
    outer: createRosePetalGeometry({ width: 0.48, length: 1.02, cup: 0.2, tipCurl: 0.16, segmentsW, segmentsL })
  };

  const materials = {
    inner: createPetalMaterial(maps.inner, { transmission: 0.08, thickness: 0.42, roughness: 0.52, opacity: 1 }, usePhysical),
    mid: createPetalMaterial(maps.mid, { transmission: 0.22, thickness: 0.36, roughness: 0.38, opacity: 0.98 }, usePhysical),
    outer: createPetalMaterial(maps.outer, { transmission: 0.38, thickness: 0.28, roughness: 0.28, opacity: 0.92 }, usePhysical)
  };

  const petals = [];
  for (let i = 0; i < totalPetals; i++) {
    const t = i / (totalPetals - 1);
    const kind = t < 0.28 ? "inner" : t < 0.58 ? "mid" : "outer";
    const yaw = i * GOLDEN * 2.35 + (rand() - 0.5) * 0.08;
    const pivot = new THREE.Group();
    pivot.rotation.y = yaw;
    blossom.add(pivot);

    const mesh = new THREE.Mesh(geometries[kind], materials[kind]);
    pivot.add(mesh);

    const layerT = t;
    const closedPitch = -0.52 + layerT * 0.08;
    const openPitch = 0.18 + layerT * 0.62 + (kind === "outer" ? 0.18 : 0);
    const closedScale = 0.28 + layerT * 0.06;
    const openScale = (kind === "inner" ? 0.68 : kind === "mid" ? 0.88 : 1.02) * (0.92 + rand() * 0.1);
    const openRadius = 0.008 + layerT * layerT * 0.14;
    const delay = layerT * 0.62 + rand() * 0.02;
    const span = 0.22 + (1 - layerT) * 0.24;

    petals.push({
      mesh,
      pivot,
      closedPitch,
      openPitch,
      closedRoll: (rand() - 0.5) * 0.1,
      openRoll: (rand() - 0.5) * 0.16,
      closedScale,
      openScale,
      closedWidth: 0.42 + layerT * 0.08,
      openWidth: 1,
      closedRadius: 0.002,
      openRadius,
      delay,
      span,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.08
    });
  }

  const budCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 20, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0xf8c0cc,
      roughness: 0.45,
      emissive: 0xe88898,
      emissiveIntensity: 0.18
    })
  );
  budCore.position.y = 0.04;
  blossom.add(budCore);

  const stemCurve = new THREE.CatmullRomCurve3(
    quality.compactStem
      ? [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(-0.04, -0.35, 0.03),
          new THREE.Vector3(0.06, -0.72, -0.02)
        ]
      : [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(-0.05, -0.5, 0.04),
          new THREE.Vector3(0.08, -1.1, -0.02)
        ]
  );
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, quality.compactStem ? 28 : 40, 0.022, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x1a3424, roughness: 0.72, emissive: 0x061008, emissiveIntensity: 0.08 })
  );
  group.add(stem);

  const sepalGeo = createRosePetalGeometry({ width: 0.16, length: 0.28, cup: 0.06, tipCurl: 0.04, segmentsW: 10, segmentsL: 12 });
  const sepalMat = new THREE.MeshPhysicalMaterial({ color: 0x2a5038, roughness: 0.65, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    const sepal = new THREE.Mesh(sepalGeo, sepalMat);
    sepal.rotation.x = -1.1;
    sepal.position.z = 0.03;
    pivot.add(sepal);
    blossom.add(pivot);
  }

  const sparkleTexture = createSoftParticleTexture();
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparkleSeeds = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    sparkleSeeds[i * 3] = rand() * Math.PI * 2;
    sparkleSeeds[i * 3 + 1] = 0.4 + rand() * 1.4;
    sparkleSeeds[i * 3 + 2] = 0.15 + rand() * 0.85;
  }
  const sparkles = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: sparkleTexture,
      color: 0xffeef2,
      size: quality.compactStem ? 0.035 : 0.048,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.55,
      sizeAttenuation: true
    })
  );
  sparkles.geometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));
  group.add(sparkles);

  const petalMaterials = [materials.inner, materials.mid, materials.outer];

  function setBloom(progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    for (const petal of petals) {
      const local = easeInOutCubic(smoothstep(petal.delay, petal.delay + petal.span, p));
      petal.mesh.rotation.x = THREE.MathUtils.lerp(petal.closedPitch, petal.openPitch, local);
      petal.mesh.rotation.z = THREE.MathUtils.lerp(petal.closedRoll, petal.openRoll, local) + petal.tilt * local;
      const scale = THREE.MathUtils.lerp(petal.closedScale, petal.openScale, local);
      const width = THREE.MathUtils.lerp(petal.closedWidth, petal.openWidth, local);
      petal.mesh.scale.set(width, scale, scale);
      petal.mesh.position.z = THREE.MathUtils.lerp(petal.closedRadius, petal.openRadius, local);
      petal.mesh.position.y = THREE.MathUtils.lerp(0, 0.015, local);
    }
    budCore.scale.setScalar(0.5 + smoothstep(0.2, 0.7, p) * 0.55);
    sparkles.material.opacity = 0.04 + p * 0.42;
  }

  function updatePremiumEffects(time, progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const pulse = 0.5 + Math.sin(time * 1.2) * 0.5;
    const bloomGlow = 0.06 + p * 0.16 + pulse * p * 0.03;
    for (const material of petalMaterials) {
      const edgeFactor = material.transmission > 0.3 ? 0.55 : 0.4;
      material.emissiveIntensity = bloomGlow * edgeFactor;
    }
    budCore.material.emissiveIntensity = 0.06 + p * 0.08;
  }

  function updateSparkles(time, progress) {
    const positions = sparkles.geometry.attributes.position.array;
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    for (let i = 0; i < sparkleCount; i++) {
      const seed = sparkleSeeds[i * 3];
      const speed = sparkleSeeds[i * 3 + 1];
      const radius = 0.06 + sparkleSeeds[i * 3 + 2] * (0.1 + open * 0.75);
      const rising = (time * 0.05 * speed + seed) % 1;
      const y = 0.04 + rising * (0.22 + open * 0.85);
      const angle = seed + time * 0.08 * speed;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    sparkles.geometry.attributes.position.needsUpdate = true;
  }

  function updateIdle(time, progress, wind = 0) {
    if (progress < 0.98) return;
    for (const petal of petals) {
      petal.mesh.rotation.z += Math.sin(time * 0.55 + petal.phase) * 0.00025 * (1 + wind);
    }
    blossom.rotation.z = Math.sin(time * 0.08) * 0.012 * wind;
  }

  function updatePetBreathing(time) {
    const breath = 1 + Math.sin(time * 0.5) * 0.012;
    blossom.scale.setScalar(breath);
  }

  setBloom(0);

  return {
    group,
    blossom,
    setBloom,
    updateSparkles,
    updateIdle,
    updatePremiumEffects,
    updatePetBreathing
  };
}
