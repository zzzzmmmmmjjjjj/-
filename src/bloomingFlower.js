import * as THREE from "three";
import { createPetalMaps, createSoftParticleTexture } from "./textures.js";

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

/** 经典玫瑰瓣：基部收窄、中部最宽、尖端心形凹口、纵向杯状卷曲 */
function createRosePetalGeometry({
  width,
  length,
  cup,
  tipCurl,
  tipFlare = 0,
  segmentsW = 40,
  segmentsL = 56
}) {
  const geometry = new THREE.PlaneGeometry(1, 1, segmentsW, segmentsL);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const radial = Math.abs(xNorm);

    const widthCurve = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.995), 0.58)), 0.68);
    const basePinch = 0.18 + Math.pow(Math.min(v * 1.15, 1), 0.72) * 0.82;
    const edge = 1 - Math.pow(radial, 2.35);
    const heart =
      v > 0.84 ? 1 - Math.pow((v - 0.84) / 0.16, 1.35) * Math.max(0, 1 - radial * 1.1) : 1;
    const wave = 1 + Math.sin(v * 18 + u * 10) * 0.018 * v;

    const x = xNorm * width * widthCurve * basePinch * Math.max(edge, 0.04) * heart * wave;
    const y = v * length;

    const bowl = Math.sin(v * Math.PI) * cup * (1 - radial * 0.62);
    const inwardCurl = Math.pow(v, 2.4) * tipCurl * radial;
    const outwardFlare = Math.pow(Math.max(v - 0.55, 0) / 0.45, 1.6) * tipFlare * radial;
    const z = bowl - inwardCurl + outwardFlare;

    positions.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createPetalMaterial({ map, emissiveMap }, { transmission, roughness, opacity, thickness, tint }, usePhysical) {
  const color = new THREE.Color(tint ?? 0xffffff);
  if (!usePhysical) {
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.14,
      color,
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
    emissiveIntensity: 0.1,
    color,
    roughness,
    metalness: 0,
    transmission,
    thickness,
    ior: 1.34,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: transmission < 0.2,
    sheen: 1.0,
    sheenColor: new THREE.Color(0xffe4ea),
    sheenRoughness: 0.28,
    clearcoat: 0.42,
    clearcoatRoughness: 0.28,
    specularIntensity: 0.72,
    specularColor: new THREE.Color(0xfff6f8),
    envMapIntensity: 0.62
  });
}

/** 玫瑰同心层：由内向外逐层包裹再舒展，每层错开角度 */
function buildRoseWhorls(lowPoly) {
  if (lowPoly) {
    return [
      { count: 1, kind: "bud", radius: 0, y: 0.02, yawOffset: 0, pitchClosed: -0.08, pitchOpen: 0.02, scaleClosed: 0.22, scaleOpen: 0.38, delay: 0, span: 0.18 },
      { count: 3, kind: "inner", radius: 0.004, y: 0.015, yawOffset: 0.35, pitchClosed: -0.62, pitchOpen: 0.08, scaleClosed: 0.26, scaleOpen: 0.52, delay: 0.06, span: 0.2 },
      { count: 5, kind: "inner", radius: 0.012, y: 0.012, yawOffset: 0.18, pitchClosed: -0.48, pitchOpen: 0.22, scaleClosed: 0.32, scaleOpen: 0.62, delay: 0.14, span: 0.22 },
      { count: 7, kind: "mid", radius: 0.028, y: 0.008, yawOffset: 0.42, pitchClosed: -0.32, pitchOpen: 0.48, scaleClosed: 0.38, scaleOpen: 0.78, delay: 0.26, span: 0.24 },
      { count: 9, kind: "mid", radius: 0.048, y: 0.004, yawOffset: 0.08, pitchClosed: -0.18, pitchOpen: 0.72, scaleClosed: 0.44, scaleOpen: 0.9, delay: 0.38, span: 0.26 },
      { count: 11, kind: "outer", radius: 0.072, y: 0, yawOffset: 0.28, pitchClosed: -0.08, pitchOpen: 1.02, scaleClosed: 0.48, scaleOpen: 1.0, delay: 0.52, span: 0.28 },
      { count: 13, kind: "outer", radius: 0.098, y: -0.004, yawOffset: 0.55, pitchClosed: 0.02, pitchOpen: 1.28, scaleClosed: 0.52, scaleOpen: 1.06, delay: 0.66, span: 0.3 }
    ];
  }

  return [
    { count: 1, kind: "bud", radius: 0, y: 0.024, yawOffset: 0, pitchClosed: -0.06, pitchOpen: 0.04, scaleClosed: 0.24, scaleOpen: 0.42, delay: 0, span: 0.16 },
    { count: 3, kind: "inner", radius: 0.003, y: 0.018, yawOffset: 0.38, pitchClosed: -0.68, pitchOpen: 0.06, scaleClosed: 0.28, scaleOpen: 0.56, delay: 0.05, span: 0.18 },
    { count: 5, kind: "inner", radius: 0.011, y: 0.014, yawOffset: 0.2, pitchClosed: -0.52, pitchOpen: 0.18, scaleClosed: 0.34, scaleOpen: 0.66, delay: 0.12, span: 0.2 },
    { count: 8, kind: "inner", radius: 0.022, y: 0.01, yawOffset: 0.48, pitchClosed: -0.38, pitchOpen: 0.32, scaleClosed: 0.4, scaleOpen: 0.74, delay: 0.2, span: 0.22 },
    { count: 11, kind: "mid", radius: 0.036, y: 0.006, yawOffset: 0.12, pitchClosed: -0.22, pitchOpen: 0.58, scaleClosed: 0.46, scaleOpen: 0.86, delay: 0.3, span: 0.24 },
    { count: 14, kind: "mid", radius: 0.054, y: 0.002, yawOffset: 0.36, pitchClosed: -0.1, pitchOpen: 0.82, scaleClosed: 0.52, scaleOpen: 0.94, delay: 0.42, span: 0.26 },
    { count: 17, kind: "outer", radius: 0.076, y: -0.002, yawOffset: 0.58, pitchClosed: 0.04, pitchOpen: 1.08, scaleClosed: 0.56, scaleOpen: 1.02, delay: 0.55, span: 0.28 },
    { count: 19, kind: "guard", radius: 0.102, y: -0.006, yawOffset: 0.24, pitchClosed: 0.12, pitchOpen: 1.34, scaleClosed: 0.58, scaleOpen: 1.08, delay: 0.68, span: 0.3 }
  ];
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
  const whorls = buildRoseWhorls(quality.lowPoly);

  const maps = {
    bud: createPetalMaps("inner", textureSize),
    inner: createPetalMaps("inner", textureSize),
    mid: createPetalMaps("mid", textureSize),
    outer: createPetalMaps("outer", textureSize),
    guard: createPetalMaps("outer", textureSize)
  };

  const geometries = {
    bud: createRosePetalGeometry({ width: 0.22, length: 0.48, cup: 0.38, tipCurl: 0.32, tipFlare: 0, segmentsW, segmentsL }),
    inner: createRosePetalGeometry({ width: 0.34, length: 0.68, cup: 0.34, tipCurl: 0.26, tipFlare: 0, segmentsW, segmentsL }),
    mid: createRosePetalGeometry({ width: 0.42, length: 0.88, cup: 0.28, tipCurl: 0.18, tipFlare: 0.04, segmentsW, segmentsL }),
    outer: createRosePetalGeometry({ width: 0.5, length: 1.06, cup: 0.22, tipCurl: 0.12, tipFlare: 0.1, segmentsW, segmentsL }),
    guard: createRosePetalGeometry({ width: 0.54, length: 1.12, cup: 0.18, tipCurl: 0.08, tipFlare: 0.16, segmentsW, segmentsL })
  };

  const materials = {
    bud: createPetalMaterial(maps.bud, { transmission: 0.04, thickness: 0.48, roughness: 0.58, opacity: 1, tint: 0xfff2f4 }, usePhysical),
    inner: createPetalMaterial(maps.inner, { transmission: 0.1, thickness: 0.42, roughness: 0.48, opacity: 1, tint: 0xfff4f6 }, usePhysical),
    mid: createPetalMaterial(maps.mid, { transmission: 0.24, thickness: 0.34, roughness: 0.34, opacity: 0.98, tint: 0xfff8f9 }, usePhysical),
    outer: createPetalMaterial(maps.outer, { transmission: 0.36, thickness: 0.28, roughness: 0.26, opacity: 0.94, tint: 0xfffbfc }, usePhysical),
    guard: createPetalMaterial(maps.guard, { transmission: 0.42, thickness: 0.24, roughness: 0.22, opacity: 0.9, tint: 0xffffff }, usePhysical)
  };

  const petals = [];
  let layerIndex = 0;

  for (const whorl of whorls) {
    const kind = whorl.kind;
    for (let i = 0; i < whorl.count; i++) {
      const t = i / whorl.count;
      const yaw = t * Math.PI * 2 + whorl.yawOffset + (rand() - 0.5) * 0.06;
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      blossom.add(pivot);

      const mesh = new THREE.Mesh(geometries[kind], materials[kind]);
      mesh.renderOrder = layerIndex * 20 + i;
      pivot.add(mesh);

      const rollBias = (rand() - 0.5) * (kind === "outer" || kind === "guard" ? 0.22 : 0.12);
      const droop = kind === "guard" ? 0.08 + rand() * 0.06 : kind === "outer" ? 0.04 + rand() * 0.04 : 0;

      petals.push({
        mesh,
        pivot,
        kind,
        closedPitch: whorl.pitchClosed + droop * -0.5,
        openPitch: whorl.pitchOpen + droop,
        closedRoll: rollBias * 0.6,
        openRoll: rollBias + (kind === "guard" ? 0.12 : 0),
        closedScale: whorl.scaleClosed * (0.94 + rand() * 0.08),
        openScale: whorl.scaleOpen * (0.96 + rand() * 0.08),
        closedWidth: kind === "bud" ? 0.55 : 0.48 + layerIndex * 0.02,
        openWidth: 1,
        closedRadius: whorl.radius * 0.35,
        openRadius: whorl.radius,
        closedY: whorl.y,
        openY: whorl.y + (kind === "outer" || kind === "guard" ? -0.008 : 0.004),
        delay: whorl.delay + i * 0.012 + rand() * 0.015,
        span: whorl.span,
        phase: rand() * Math.PI * 2,
        tilt: (rand() - 0.5) * 0.06
      });
    }
    layerIndex += 1;
  }

  const budCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 18, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0xf0a8b4,
      roughness: 0.52,
      emissive: 0xd87888,
      emissiveIntensity: 0.08,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffd0d8),
      transparent: true,
      opacity: 1
    })
  );
  budCore.position.y = 0.05;
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

  const sepalGeo = createRosePetalGeometry({ width: 0.14, length: 0.26, cup: 0.05, tipCurl: 0.03, segmentsW: 10, segmentsL: 12 });
  const sepalMat = new THREE.MeshPhysicalMaterial({ color: 0x2a5038, roughness: 0.65, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2 + 0.2;
    const sepal = new THREE.Mesh(sepalGeo, sepalMat);
    sepal.rotation.x = -1.15;
    sepal.position.z = 0.035;
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
      size: quality.compactStem ? 0.032 : 0.042,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.4,
      sizeAttenuation: true
    })
  );
  sparkles.geometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));
  group.add(sparkles);

  const petalMaterials = [materials.bud, materials.inner, materials.mid, materials.outer, materials.guard];

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
      petal.mesh.position.y = THREE.MathUtils.lerp(petal.closedY, petal.openY, local);
    }
    budCore.scale.setScalar(0.45 + smoothstep(0.15, 0.65, p) * 0.5);
    budCore.material.opacity = 1 - smoothstep(0.35, 0.75, p);
    budCore.visible = p < 0.82;
    sparkles.material.opacity = 0.03 + p * 0.32;
  }

  function updatePremiumEffects(time, progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const pulse = 0.5 + Math.sin(time * 1.2) * 0.5;
    const bloomGlow = 0.05 + p * 0.14 + pulse * p * 0.025;
    for (const material of petalMaterials) {
      const edgeFactor = material.transmission > 0.3 ? 0.48 : 0.35;
      material.emissiveIntensity = bloomGlow * edgeFactor;
    }
  }

  function updateSparkles(time, progress) {
    const positions = sparkles.geometry.attributes.position.array;
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    for (let i = 0; i < sparkleCount; i++) {
      const seed = sparkleSeeds[i * 3];
      const speed = sparkleSeeds[i * 3 + 1];
      const radius = 0.05 + sparkleSeeds[i * 3 + 2] * (0.08 + open * 0.62);
      const rising = (time * 0.045 * speed + seed) % 1;
      const y = 0.05 + rising * (0.18 + open * 0.72);
      const angle = seed + time * 0.07 * speed;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    sparkles.geometry.attributes.position.needsUpdate = true;
  }

  function updateIdle(time, progress, wind = 0) {
    if (progress < 0.98) return;
    for (const petal of petals) {
      const sway = petal.kind === "guard" || petal.kind === "outer" ? 0.0004 : 0.0002;
      petal.mesh.rotation.z += Math.sin(time * 0.5 + petal.phase) * sway * (1 + wind);
    }
    blossom.rotation.z = Math.sin(time * 0.08) * 0.01 * wind;
  }

  function updatePetBreathing(time) {
    const breath = 1 + Math.sin(time * 0.5) * 0.01;
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
