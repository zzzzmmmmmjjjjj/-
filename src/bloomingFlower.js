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
  const color = new THREE.Color(tint ?? 0xffe8ee);
  const emissive = new THREE.Color(0xffb8c8);
  if (!usePhysical) {
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive,
      emissiveIntensity: 0.16,
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
    emissive,
    emissiveIntensity: 0.12,
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
    sheen: 0.95,
    sheenColor: new THREE.Color(0xffc8d4),
    sheenRoughness: 0.32,
    clearcoat: 0.36,
    clearcoatRoughness: 0.32,
    specularIntensity: 0.62,
    specularColor: new THREE.Color(0xffe0e8),
    envMapIntensity: 0.55
  });
}

/** 附着在单瓣表面的粒子组 */
function createPetalParticleSystem(count, texture, rand, size) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = 0.12 + rand() * 0.76;
    seeds[i * 3 + 1] = 0.06 + rand() * 0.9;
    seeds[i * 3 + 2] = rand() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: texture,
      color: 0xffe4ea,
      size,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  );
  return { points, seeds, count };
}

const PETAL_LENGTH = { bud: 0.48, inner: 0.68, mid: 0.88, outer: 1.06, guard: 1.12 };
const PETAL_WIDTH = { bud: 0.22, inner: 0.34, mid: 0.42, outer: 0.5, guard: 0.54 };

/** 不规则角度分布，避免每层花瓣等间距排列 */
function scatterAngles(count, rand, twist = 0) {
  const angles = [];
  let cursor = twist + (rand() - 0.5) * 0.4;
  for (let i = 0; i < count; i++) {
    angles.push(cursor);
    cursor += (Math.PI * 2) / count + (rand() - 0.5) * 0.42;
  }
  return angles;
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
  blossom.position.set(0.015, 0.02, -0.012);
  blossom.rotation.set(-0.06, 0.22, 0.11);
  group.add(blossom);

  const textureSize = quality.textureSize ?? 1024;
  const segmentsW = quality.petalSegments?.w ?? 40;
  const segmentsL = quality.petalSegments?.l ?? 56;
  const usePhysical = quality.transmission !== false;
  const sparkleCount = quality.sparkleCount ?? 780;
  const petalParticleCount = quality.petalParticleCount ?? (quality.lowPoly ? 5 : 8);
  const petalParticleSize = quality.compactStem ? 0.018 : 0.024;
  const whorls = buildRoseWhorls(quality.lowPoly);
  const particleTexture = createSoftParticleTexture();

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
    bud: createPetalMaterial(maps.bud, { transmission: 0.04, thickness: 0.48, roughness: 0.58, opacity: 1, tint: 0xffc8d4 }, usePhysical),
    inner: createPetalMaterial(maps.inner, { transmission: 0.1, thickness: 0.42, roughness: 0.48, opacity: 1, tint: 0xffd4dc }, usePhysical),
    mid: createPetalMaterial(maps.mid, { transmission: 0.22, thickness: 0.34, roughness: 0.36, opacity: 0.98, tint: 0xffdce4 }, usePhysical),
    outer: createPetalMaterial(maps.outer, { transmission: 0.32, thickness: 0.28, roughness: 0.28, opacity: 0.94, tint: 0xffe6ec }, usePhysical),
    guard: createPetalMaterial(maps.guard, { transmission: 0.38, thickness: 0.24, roughness: 0.24, opacity: 0.9, tint: 0xffeef2 }, usePhysical)
  };

  const petals = [];
  let layerIndex = 0;
  const leanSide = rand() > 0.5 ? 1 : -1;

  for (const whorl of whorls) {
    const kind = whorl.kind;
    const angles = scatterAngles(whorl.count, rand, whorl.yawOffset + layerIndex * 0.31);
    for (let i = 0; i < whorl.count; i++) {
      const yaw = angles[i];
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      blossom.add(pivot);

      const mesh = new THREE.Mesh(geometries[kind], materials[kind]);
      mesh.renderOrder = layerIndex * 20 + i;
      pivot.add(mesh);

      const particleSystem = createPetalParticleSystem(
        petalParticleCount,
        particleTexture,
        rand,
        petalParticleSize
      );
      mesh.add(particleSystem.points);

      const isHero = (kind === "outer" || kind === "guard") && rand() > 0.78;
      const rollBias = (rand() - 0.5) * (kind === "outer" || kind === "guard" ? 0.32 : 0.18);
      const droop = kind === "guard" ? 0.1 + rand() * 0.1 : kind === "outer" ? 0.05 + rand() * 0.08 : rand() * 0.03;
      const pitchJitter = (rand() - 0.5) * 0.14;
      const radiusJitter = 0.82 + rand() * 0.28;
      const sizeJitter = 0.86 + rand() * 0.28 + (isHero ? 0.14 : 0);
      const sideBias = Math.sin(yaw * 1.7) * 0.06 * leanSide;
      const heightJitter = (rand() - 0.5) * 0.012;

      petals.push({
        mesh,
        pivot,
        baseYaw: yaw,
        kind,
        closedPitch: whorl.pitchClosed + droop * -0.5 + pitchJitter + sideBias,
        openPitch: whorl.pitchOpen + droop + pitchJitter * 0.6 + sideBias * 1.4,
        closedRoll: rollBias * 0.7 + (isHero ? 0.18 * leanSide : 0),
        openRoll: rollBias + (kind === "guard" ? 0.16 : isHero ? 0.22 : 0) + sideBias,
        closedScale: whorl.scaleClosed * sizeJitter,
        openScale: whorl.scaleOpen * sizeJitter * (isHero ? 1.12 : 1),
        closedWidth: (kind === "bud" ? 0.55 : 0.46 + layerIndex * 0.02) * (0.9 + rand() * 0.18),
        openWidth: 0.92 + rand() * 0.16,
        closedRadius: whorl.radius * 0.32 * radiusJitter,
        openRadius: whorl.radius * radiusJitter,
        closedY: whorl.y + heightJitter,
        openY: whorl.y + heightJitter + (kind === "outer" || kind === "guard" ? -0.01 - rand() * 0.012 : 0.003 + rand() * 0.006),
        delay: whorl.delay + i * (0.008 + rand() * 0.012) + rand() * 0.025,
        span: whorl.span * (0.88 + rand() * 0.22),
        phase: rand() * Math.PI * 2,
        tilt: (rand() - 0.5) * 0.1,
        isHero,
        particleSystem,
        localOpen: 0
      });
    }
    layerIndex += 1;
  }

  const budCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 18, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0xe88898,
      roughness: 0.52,
      emissive: 0xc86078,
      emissiveIntensity: 0.06,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffb8c8),
      transparent: true,
      opacity: 1
    })
  );
  budCore.position.set(0.008, 0.05, -0.006);
  blossom.add(budCore);

  const stemCurve = new THREE.CatmullRomCurve3(
    quality.compactStem
      ? [
          new THREE.Vector3(0.01, 0.02, 0),
          new THREE.Vector3(-0.06, -0.28, 0.04),
          new THREE.Vector3(0.04, -0.58, -0.03),
          new THREE.Vector3(0.08, -0.72, -0.02)
        ]
      : [
          new THREE.Vector3(0.01, 0.02, 0),
          new THREE.Vector3(-0.07, -0.38, 0.05),
          new THREE.Vector3(0.05, -0.82, -0.03),
          new THREE.Vector3(0.1, -1.1, -0.02)
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
    pivot.rotation.y = (i / 5) * Math.PI * 2 + 0.35 + (rand() - 0.5) * 0.25;
    const sepal = new THREE.Mesh(sepalGeo, sepalMat);
    sepal.rotation.x = -1.12 + (rand() - 0.5) * 0.18;
    sepal.rotation.z = (rand() - 0.5) * 0.12;
    sepal.position.z = 0.03 + rand() * 0.012;
    sepal.scale.setScalar(0.88 + rand() * 0.22);
    pivot.add(sepal);
    blossom.add(pivot);
  }

  const sparkleTexture = particleTexture;
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
    const innerUnfurl = smoothstep(0.22, 0.72, p);
    const outerUnfurl = smoothstep(0.5, 1, p);
    for (const petal of petals) {
      // 拉长开合区间，让展开更“缓缓打开”，避免大开大合的僵硬感
      const openT = smoothstep(petal.delay, petal.delay + petal.span * 1.35, p);
      const local0 = easeInOutCubic(openT);
      const u = Math.pow(local0, 1.12);
      const isOuter = petal.kind === "outer" || petal.kind === "guard" || petal.isHero;

      // 双阶段玫瑰展开：
      // - 早期：内瓣先打开（旋转/立起）
      // - 后期：外瓣再外翻并略下垂（更像玫瑰）
      const pitchT = THREE.MathUtils.lerp(0.9, 1.0, isOuter ? outerUnfurl : innerUnfurl);
      const rollT = THREE.MathUtils.lerp(0.9, 1.05, isOuter ? outerUnfurl : innerUnfurl);
      const late = isOuter ? Math.pow(outerUnfurl, 1.1) : Math.pow(innerUnfurl, 1.02) * 0.45;

      const twist = Math.sin(petal.phase + p * 1.6) * (isOuter ? 0.09 : 0.05) * (0.35 + 0.65 * late);

      petal.pivot.rotation.y = petal.baseYaw + twist;
      petal.mesh.rotation.x =
        THREE.MathUtils.lerp(petal.closedPitch, petal.openPitch, u) + (isOuter ? 0.08 : 0.03) * late * pitchT;

      petal.mesh.rotation.z =
        THREE.MathUtils.lerp(petal.closedRoll, petal.openRoll, u) + petal.tilt * u + (isOuter ? 0.12 : 0.045) * late * rollT;
      petal.currentRoll = petal.mesh.rotation.z;

      const scale = THREE.MathUtils.lerp(petal.closedScale, petal.openScale, u);
      const width = THREE.MathUtils.lerp(petal.closedWidth, petal.openWidth, u);
      petal.mesh.scale.set(width, scale * (isOuter ? 1 + late * 0.05 : 1), scale * (isOuter ? 1 + late * 0.05 : 1));

      const radius = THREE.MathUtils.lerp(petal.closedRadius, petal.openRadius, u);
      petal.mesh.position.z = radius * (isOuter ? 1 + late * 0.16 : 1 + late * 0.04);

      const y = THREE.MathUtils.lerp(petal.closedY, petal.openY, u);
      // 外瓣后期下垂：玫瑰更自然
      petal.mesh.position.y = y + (isOuter ? -late * (0.010 + (petal.isHero ? 0.004 : 0)) : late * 0.003);
      petal.localOpen = u;
    }
    budCore.scale.setScalar(0.4 + smoothstep(0.18, 0.62, p) * 0.58);
    budCore.material.opacity = 1 - smoothstep(0.38, 0.66, p);
    budCore.visible = p < 0.7;
    sparkles.material.opacity = 0.02 + p * 0.38;
    sparkles.material.size = (quality.compactStem ? 0.028 : 0.038) * (0.55 + p * 0.65);
  }

  function updatePetalParticles(time, progress) {
    const global = THREE.MathUtils.clamp(progress, 0, 1);
    for (const petal of petals) {
      const sys = petal.particleSystem;
      if (!sys) continue;
      const open = petal.localOpen ?? 0;
      const pulse = 0.72 + Math.sin(time * 1.4 + petal.phase) * 0.28;
      sys.points.material.opacity = open * (0.12 + global * 0.52) * pulse;
      sys.points.visible = open > 0.04;

      const len = PETAL_LENGTH[petal.kind] ?? 0.7;
      const width = PETAL_WIDTH[petal.kind] ?? 0.4;
      const positions = sys.points.geometry.attributes.position.array;

      for (let i = 0; i < sys.count; i++) {
        const u = sys.seeds[i * 3];
        const v = sys.seeds[i * 3 + 1];
        const phase = sys.seeds[i * 3 + 2];
        const profile = Math.pow(Math.sin(Math.PI * Math.min(v, 0.995)), 0.62);
        const drift = Math.sin(time * 0.75 + phase) * 0.007 * open;
        const lift = Math.sin(time * 1.1 + phase * 1.3) * 0.005 * open;
        positions[i * 3] = (u - 0.5) * width * profile * 0.92;
        positions[i * 3 + 1] = v * len + drift + lift;
        positions[i * 3 + 2] = 0.01 + Math.sin(time * 0.85 + phase) * 0.009 * open;
      }
      sys.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  function updateBlossomRotation(time, progress) {
    const bloom = THREE.MathUtils.clamp(progress, 0, 1);
    const speed = quality.isMobile ? 0.055 : 0.08;
    blossom.rotation.y = 0.22 + time * speed * (0.2 + bloom * 0.8);
  }

  function updatePremiumEffects(time, progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const pulse = 0.5 + Math.sin(time * 1.2) * 0.5;
    const bloomGlow = 0.03 + p * 0.09 + pulse * p * 0.015;
    for (const material of petalMaterials) {
      const edgeFactor = material.transmission > 0.3 ? 0.38 : 0.26;
      material.emissiveIntensity = bloomGlow * edgeFactor;
    }
    budCore.material.emissiveIntensity = 0.03 + p * 0.04;
  }

  function updateSparkles(time, progress) {
    const positions = sparkles.geometry.attributes.position.array;
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    const activeRatio = 0.15 + open * 0.85;
    const activeCount = Math.max(1, Math.floor(sparkleCount * activeRatio));
    sparkles.geometry.setDrawRange(0, activeCount);

    for (let i = 0; i < activeCount; i++) {
      const seed = sparkleSeeds[i * 3];
      const speed = sparkleSeeds[i * 3 + 1];
      const radius = 0.04 + sparkleSeeds[i * 3 + 2] * (0.06 + open * 0.72);
      const rising = (time * 0.04 * speed + seed) % 1;
      const y = 0.04 + rising * (0.16 + open * 0.82);
      const angle = seed + time * 0.065 * speed;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    sparkles.geometry.attributes.position.needsUpdate = true;
    updatePetalParticles(time, progress);
    updateBlossomRotation(time, progress);
  }

  function updateIdle(time, progress, wind = 0) {
    if (progress < 0.98) return;
    for (const petal of petals) {
      const sway = petal.isHero ? 0.00055 : petal.kind === "guard" || petal.kind === "outer" ? 0.00038 : 0.00022;
      petal.mesh.rotation.z = petal.currentRoll + Math.sin(time * 0.48 + petal.phase) * sway * (1 + wind);
      if (petal.isHero) {
        petal.mesh.rotation.x += Math.sin(time * 0.32 + petal.phase) * 0.00018 * (1 + wind * 0.5);
      }
    }
    blossom.rotation.z = 0.11 + Math.sin(time * 0.08) * 0.012 * wind;
    blossom.rotation.x = -0.06 + Math.sin(time * 0.06 + 0.5) * 0.004 * wind;
  }

  function updatePetBreathing(time) {
    const breath = 1 + Math.sin(time * 0.5) * 0.012;
    const asym = 1 + Math.sin(time * 0.37 + 1.2) * 0.006;
    blossom.scale.set(breath * asym, breath, breath * (2 - asym));
  }

  setBloom(0);

  return {
    group,
    blossom,
    setBloom,
    updateSparkles,
    updateIdle,
    updatePremiumEffects,
    updatePetBreathing,
    updateBlossomRotation
  };
}
