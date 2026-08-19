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

function createPetalGeometry({ width, length, curl, ruffle, segmentsW = 40, segmentsL = 56 }) {
  const geometry = new THREE.PlaneGeometry(1, 1, segmentsW, segmentsL);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.999), 0.82)), 0.54);
    const edge = 1 - Math.pow(Math.abs(xNorm), 2.2);
    const radial = Math.abs(xNorm);
    const wave =
      Math.sin(u * Math.PI * 11 + v * Math.PI * 4.2) * ruffle * radial * (0.42 + v) +
      Math.sin(u * Math.PI * 18 + v * Math.PI * 2.4) * ruffle * 0.35 * radial * v;
    const x = xNorm * width * profile * Math.max(edge, 0.06) + wave * 0.42;
    const y = v * length;
    const cup = Math.sin(v * Math.PI) * curl * (1 - radial * 0.38);
    const flare = Math.pow(v, 1.65) * curl * 0.42 * radial;
    const z = cup - flare + wave * 0.85;
    positions.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createLeafGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 18, 32);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const profile = Math.sin(Math.PI * v);
    const x = xNorm * 0.28 * profile;
    const y = v * 1.15;
    const z = Math.sin(v * Math.PI) * 0.08 + Math.sin(u * Math.PI * 4) * 0.02 * v;
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPetalMaterial({ map, emissiveMap }, { transmission, roughness, metalness, opacity, emissive, thickness }, usePhysical) {
  const emissiveColor = new THREE.Color(emissive);
  if (!usePhysical) {
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
      color: 0xffffff,
      roughness,
      metalness,
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
    emissiveIntensity: 0.42,
    color: 0xffffff,
    roughness,
    metalness,
    transmission,
    thickness,
    ior: 1.35,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: transmission < 0.28,
    sheen: 1.35,
    sheenColor: new THREE.Color(0xffc8d0),
    sheenRoughness: 0.22,
    clearcoat: 0.42,
    clearcoatRoughness: 0.28,
    specularIntensity: 0.85,
    specularColor: new THREE.Color(0xffe0e8),
    envMapIntensity: 0.95
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
  const stamenCount = quality.stamenCount ?? 48;

  const maps = {
    inner: createPetalMaps("inner", textureSize),
    mid: createPetalMaps("mid", textureSize),
    outer: createPetalMaps("outer", textureSize)
  };

  const geometries = {
    inner: createPetalGeometry({ width: 0.44, length: 0.82, curl: 0.26, ruffle: 0.045, segmentsW, segmentsL }),
    mid: createPetalGeometry({ width: 0.58, length: 1.08, curl: 0.22, ruffle: 0.07, segmentsW, segmentsL }),
    outer: createPetalGeometry({ width: 0.78, length: 1.36, curl: 0.16, ruffle: 0.11, segmentsW, segmentsL })
  };

  const materials = {
    inner: createPetalMaterial(maps.inner, {
      transmission: 0.12,
      thickness: 0.55,
      roughness: 0.58,
      metalness: 0.02,
      opacity: 1,
      emissive: 0x6a1028
    }, usePhysical),
    mid: createPetalMaterial(maps.mid, {
      transmission: 0.32,
      thickness: 0.48,
      roughness: 0.42,
      metalness: 0.01,
      opacity: 0.98,
      emissive: 0x5a0c20
    }, usePhysical),
    outer: createPetalMaterial(maps.outer, {
      transmission: 0.62,
      thickness: 0.32,
      roughness: 0.24,
      metalness: 0,
      opacity: 0.82,
      emissive: 0x4a0818
    }, usePhysical)
  };

  const layers = quality.lowPoly
    ? [
        { count: 7, kind: "inner", radius: 0.03 },
        { count: 9, kind: "mid", radius: 0.065 },
        { count: 11, kind: "mid", radius: 0.095 },
        { count: 12, kind: "outer", radius: 0.125 },
        { count: 10, kind: "outer", radius: 0.155 }
      ]
    : [
        { count: 10, kind: "inner", radius: 0.018 },
        { count: 10, kind: "inner", radius: 0.038 },
        { count: 12, kind: "mid", radius: 0.055 },
        { count: 12, kind: "mid", radius: 0.072 },
        { count: 14, kind: "mid", radius: 0.092 },
        { count: 14, kind: "outer", radius: 0.112 },
        { count: 12, kind: "outer", radius: 0.132 },
        { count: 10, kind: "outer", radius: 0.152 }
      ];

  const petals = [];
  let petalIndex = 0;
  const layerCount = layers.length;

  layers.forEach((layer, layerIndex) => {
    const t = layerIndex / (layerCount - 1);
    for (let i = 0; i < layer.count; i++) {
      const yaw = (i / layer.count) * Math.PI * 2 + layerIndex * 0.31 + (rand() - 0.5) * 0.14;
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      blossom.add(pivot);

      const mesh = new THREE.Mesh(geometries[layer.kind], materials[layer.kind]);
      pivot.add(mesh);

      const closedPitch = -0.44 + t * 0.1 + (rand() - 0.5) * 0.05;
      const openPitch = 0.32 + t * 0.78 + (rand() - 0.5) * 0.06;
      const closedScale = 0.32 + t * 0.04;
      const openScale =
        (layer.kind === "inner" ? 0.76 : layer.kind === "mid" ? 0.98 : 1.18) * (0.9 + rand() * 0.16);
      const closedWidth = 0.46 + t * 0.08;
      const openWidth = 1;
      const delay = t * 0.56 + rand() * 0.025;
      const span = 0.26 + (1 - t) * 0.22;

      petals.push({
        mesh,
        pivot,
        kind: layer.kind,
        closedPitch,
        openPitch,
        closedRoll: (rand() - 0.5) * 0.14,
        openRoll: (rand() - 0.5) * 0.24,
        closedScale,
        openScale,
        closedWidth,
        openWidth,
        closedRadius: 0.004,
        openRadius: layer.radius + t * 0.055,
        delay,
        span,
        phase: rand() * Math.PI * 2,
        index: petalIndex++
      });
    }
  });

  const stamenGroup = new THREE.Group();
  blossom.add(stamenGroup);

  const coreGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffc860,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  coreGlow.position.y = 0.08;
  stamenGroup.add(coreGlow);

  const stamenMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffe090,
    roughness: 0.18,
    metalness: 0.35,
    emissive: 0xffa820,
    emissiveIntensity: 1.2,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18
  });
  const filamentMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0b8c4,
    roughness: 0.42,
    emissive: 0x401018,
    emissiveIntensity: 0.08
  });

  for (let i = 0; i < stamenCount; i++) {
    const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 1, 5), filamentMaterial);
    const anther = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), stamenMaterial);
    const pivot = new THREE.Group();
    const yaw = i * GOLDEN;
    const tilt = 0.1 + (i % 7) * 0.028;
    pivot.rotation.set(tilt, yaw, 0);
    filament.position.y = 0.22;
    anther.position.y = 0.44;
    pivot.add(filament, anther);
    stamenGroup.add(pivot);
  }

  const stemCurve = new THREE.CatmullRomCurve3(
    quality.compactStem
      ? [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(-0.04, -0.35, 0.03),
          new THREE.Vector3(0.06, -0.72, -0.02)
        ]
      : [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(-0.06, -0.55, 0.05),
          new THREE.Vector3(0.1, -1.25, -0.03),
          new THREE.Vector3(0.02, -2.15, 0.06)
        ]
  );
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, quality.compactStem ? 28 : 48, 0.026, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0x1e3828,
      roughness: 0.68,
      metalness: 0.04,
      emissive: 0x081810,
      emissiveIntensity: 0.12
    })
  );
  group.add(stem);

  const sepalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x284830,
    roughness: 0.62,
    side: THREE.DoubleSide,
    emissive: 0x081810,
    emissiveIntensity: 0.08
  });
  const sepalGeometry = createPetalGeometry({ width: 0.22, length: 0.38, curl: 0.08, ruffle: 0.02, segmentsW: 12, segmentsL: 16 });
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    const sepal = new THREE.Mesh(sepalGeometry, sepalMaterial);
    sepal.rotation.x = -1.05;
    sepal.position.z = 0.04;
    pivot.add(sepal);
    blossom.add(pivot);
  }

  if (!quality.compactStem) {
    const leafMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x2a4830,
      roughness: 0.58,
      side: THREE.DoubleSide,
      sheen: 0.25,
      sheenColor: new THREE.Color(0x709878)
    });
    const leafGeometry = createLeafGeometry();
    for (const leaf of [
      { y: -0.72, yaw: 0.8, roll: -0.4, pitch: 0.9, scale: 1 },
      { y: -1.05, yaw: -2.2, roll: 0.35, pitch: 1.05, scale: 0.82 }
    ]) {
      const pivot = new THREE.Group();
      pivot.position.y = leaf.y;
      pivot.rotation.y = leaf.yaw;
      const mesh = new THREE.Mesh(leafGeometry, leafMaterial);
      mesh.rotation.set(leaf.pitch, 0, leaf.roll);
      mesh.scale.setScalar(leaf.scale);
      pivot.add(mesh);
      group.add(pivot);
    }
  }

  const sparkleTexture = createSoftParticleTexture();
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparkleSeeds = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    sparkleSeeds[i * 3] = rand() * Math.PI * 2;
    sparkleSeeds[i * 3 + 1] = 0.4 + rand() * 1.6;
    sparkleSeeds[i * 3 + 2] = 0.15 + rand() * 0.85;
  }
  const sparkles = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: sparkleTexture,
      color: 0xffd0dc,
      size: quality.compactStem ? 0.048 : 0.062,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
      sizeAttenuation: true
    })
  );
  sparkles.geometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));
  group.add(sparkles);

  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.82, 72),
    new THREE.MeshBasicMaterial({
      color: 0xff7088,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = quality.compactStem ? -0.42 : -0.08;
  group.add(glowRing);

  const petalMaterials = [materials.inner, materials.mid, materials.outer];

  function setBloom(progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    for (const petal of petals) {
      const local = easeInOutCubic(smoothstep(petal.delay, petal.delay + petal.span, p));
      petal.mesh.rotation.x = THREE.MathUtils.lerp(petal.closedPitch, petal.openPitch, local);
      petal.mesh.rotation.z = THREE.MathUtils.lerp(petal.closedRoll, petal.openRoll, local);
      const scale = THREE.MathUtils.lerp(petal.closedScale, petal.openScale, local);
      const width = THREE.MathUtils.lerp(petal.closedWidth, petal.openWidth, local);
      petal.mesh.scale.set(width, scale, scale);
      petal.mesh.position.z = THREE.MathUtils.lerp(petal.closedRadius, petal.openRadius, local);
      petal.mesh.position.y = THREE.MathUtils.lerp(0.0, 0.02, local);
    }

    const stamenShow = smoothstep(0.28, 0.78, p);
    stamenGroup.scale.setScalar(0.12 + stamenShow * 0.88);
    stamenGroup.position.y = THREE.MathUtils.lerp(-0.05, 0.08, stamenShow);
    coreGlow.material.opacity = 0.08 + stamenShow * 0.62;
    coreGlow.scale.setScalar(0.6 + stamenShow * 1.1);
    sparkles.material.opacity = 0.05 + p * 0.88;
    glowRing.material.opacity = 0.03 + p * 0.18;
    glowRing.scale.setScalar(0.7 + p * 0.65);
  }

  function updatePremiumEffects(time, progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const pulse = 0.5 + Math.sin(time * 1.4) * 0.5;
    const bloomGlow = 0.35 + p * 0.85 + pulse * p * 0.18;
    for (const material of petalMaterials) {
      const edgeFactor = material.transmission > 0.45 ? 0.95 : material.transmission > 0.2 ? 0.78 : 0.62;
      material.emissiveIntensity = bloomGlow * edgeFactor;
    }
    stamenMaterial.emissiveIntensity = 0.55 + p * 1.35 + pulse * 0.15;
    coreGlow.material.opacity = (0.1 + p * 0.55) * (0.85 + pulse * 0.25);
    glowRing.rotation.z = time * 0.06;
  }

  function updateSparkles(time, progress) {
    const positions = sparkles.geometry.attributes.position.array;
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    for (let i = 0; i < sparkleCount; i++) {
      const seed = sparkleSeeds[i * 3];
      const speed = sparkleSeeds[i * 3 + 1];
      const radius = 0.08 + sparkleSeeds[i * 3 + 2] * (0.14 + open * 1.15);
      const rising = (time * 0.06 * speed + seed) % 1;
      const y = 0.06 + rising * (0.32 + open * 1.35);
      const angle = seed + time * 0.1 * speed;
      const wobble = Math.sin(time * speed + seed) * 0.06;
      positions[i * 3] = Math.cos(angle) * (radius + wobble);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * (radius + wobble * 0.7);
    }
    sparkles.geometry.attributes.position.needsUpdate = true;
  }

  function updateIdle(time, progress) {
    if (progress < 0.98) return;
    for (const petal of petals) {
      petal.mesh.rotation.z += Math.sin(time * 0.65 + petal.phase) * 0.0004;
    }
    blossom.rotation.y = Math.sin(time * 0.1) * 0.035;
  }

  setBloom(0);

  return {
    group,
    coreGlow,
    stamenMaterial,
    setBloom,
    updateSparkles,
    updateIdle,
    updatePremiumEffects
  };
}
