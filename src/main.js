import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#scene");
const loading = document.querySelector(".loading");
const loadingText = document.querySelector(".loading p");
const bloomButton = document.querySelector(".bloom");
const bloomLabel = document.querySelector(".bloom-label");
const musicButton = document.querySelector(".music");
const music = document.querySelector("#background-music");
const assetUrl = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;

music.src = assetUrl("the-rose.mp3");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090406, 0.07);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.1, 7.2);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableRotate = true;
controls.minDistance = 4.2;
controls.maxDistance = 10;
controls.autoRotate = true;
controls.autoRotateSpeed = 12;

const rose = new THREE.Group();
scene.add(rose);
applyResponsiveLayout();

let particleCloud;
let bloomAmount = 0;
let isBlooming = false;
const clock = new THREE.Clock();

bloomButton.addEventListener("click", () => {
  isBlooming = !isBlooming;
  bloomLabel.textContent = isBlooming ? "归拢" : "绽放";
});

music.volume = 0.42;

function updateMusicUI(isPlaying) {
  musicButton.classList.toggle("playing", isPlaying);
  musicButton.setAttribute("aria-pressed", String(isPlaying));
  musicButton.setAttribute("aria-label", isPlaying ? "暂停背景音乐" : "播放背景音乐");
}

async function playMusic() {
  try {
    await music.play();
    updateMusicUI(true);
  } catch {
    updateMusicUI(false);
  }
}

musicButton.addEventListener("click", async () => {
  if (music.paused) await playMusic();
  else {
    music.pause();
    updateMusicUI(false);
  }
});

// 有声自动播放若被浏览器拦截，则在第一次用户交互时启动。
playMusic();
addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.(".music") && music.paused) playMusic();
}, { once: true });

new GLTFLoader().load(
  assetUrl("rose-model.glb"),
  buildParticlesFromModel,
  (event) => {
    if (!event.total) return;
    const progress = THREE.MathUtils.clamp(
      Math.round(event.loaded / event.total * 100),
      0,
      100
    );
    loadingText.textContent = `正在采样玫瑰 ${progress}%`;
  },
  (error) => {
    console.error(error);
    loadingText.textContent = "三维玫瑰加载失败";
  }
);

function buildParticlesFromModel(gltf) {
  const model = gltf.scene;
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  const modelScale = 4.2 / largestDimension;

  const entries = [];
  let totalWeight = 0;

  model.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const sampler = new MeshSurfaceSampler(object).build();
    const weight = Math.max(1, object.geometry.attributes.position.count);
    totalWeight += weight;
    entries.push({
      mesh: object,
      sampler,
      weight,
      cumulativeWeight: totalWeight,
      materialColor: object.material?.color?.clone() ?? new THREE.Color(0xc53d58)
    });
  });

  if (!entries.length) throw new Error("GLB 中没有可采样网格");

  const count = innerWidth < 700 ? 52000 : 105000;
  const positions = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const entry = chooseWeightedEntry(entries, totalWeight);
    entry.sampler.sample(point, normal);
    point.applyMatrix4(entry.mesh.matrixWorld);
    point.sub(center).multiplyScalar(modelScale);

    // Pixabay 模型的花冠朝向 Z 轴；稍作倾斜，让初始画面同时看到花心和侧面层次。
    const sourceY = point.y;
    point.y = point.z;
    point.z = -sourceY;

    const j = i * 3;
    const k = i * 4;
    positions[j] = origins[j] = point.x;
    positions[j + 1] = origins[j + 1] = point.y;
    positions[j + 2] = origins[j + 2] = point.z;

    const depthLight = THREE.MathUtils.clamp((point.z + 2.1) / 4.2, 0, 1);
    color.setHSL(
      0.965 + Math.random() * 0.025,
      0.58 + Math.random() * 0.2,
      0.38 + depthLight * 0.25 + Math.random() * 0.14
    );
    colors[j] = color.r;
    colors[j + 1] = color.g;
    colors[j + 2] = color.b;

    seeds[k] = Math.random() * Math.PI * 2;
    seeds[k + 1] = 0.006 + Math.random() * 0.018;
    seeds[k + 2] = 0.4 + Math.random() * 1.2;
    seeds[k + 3] = 0.35 + Math.random() * 1.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: innerWidth < 700 ? 0.022 : 0.018,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.NormalBlending
  });

  particleCloud = {
    points: new THREE.Points(geometry, material),
    origins,
    seeds,
    count
  };
  particleCloud.points.rotation.x = -0.2;
  particleCloud.points.rotation.z = -0.08;
  rose.add(particleCloud.points);
  loading.classList.add("hidden");
}

function chooseWeightedEntry(entries, totalWeight) {
  const target = Math.random() * totalWeight;
  for (const entry of entries) {
    if (target <= entry.cumulativeWeight) return entry;
  }
  return entries.at(-1);
}

function updateParticles(time) {
  if (!particleCloud) return;
  const attribute = particleCloud.points.geometry.attributes.position;
  const values = attribute.array;
  bloomAmount += ((isBlooming ? 1 : 0) - bloomAmount) * 0.025;

  for (let i = 0; i < particleCloud.count; i++) {
    const j = i * 3;
    const k = i * 4;
    const phase = particleCloud.seeds[k];
    const drift = particleCloud.seeds[k + 1];
    const wave = Math.sin(time * particleCloud.seeds[k + 2] + phase);
    const distance = Math.hypot(
      particleCloud.origins[j],
      particleCloud.origins[j + 1],
      particleCloud.origins[j + 2]
    ) || 1;
    const scatter = bloomAmount * particleCloud.seeds[k + 3] * 0.3;
    const tx = particleCloud.origins[j] + wave * drift + particleCloud.origins[j] / distance * scatter;
    const ty = particleCloud.origins[j + 1] + Math.cos(time + phase) * drift + particleCloud.origins[j + 1] / distance * scatter;
    const tz = particleCloud.origins[j + 2] + wave * drift + particleCloud.origins[j + 2] / distance * scatter;
    values[j] += (tx - values[j]) * 0.065;
    values[j + 1] += (ty - values[j + 1]) * 0.065;
    values[j + 2] += (tz - values[j + 2]) * 0.065;
  }
  attribute.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();
  const time = clock.elapsedTime;
  updateParticles(time);
  rose.position.y = rose.userData.baseY + Math.sin(time * 0.5) * 0.025;
  controls.update(deltaTime);
  renderer.render(scene, camera);
}

function applyResponsiveLayout() {
  if (innerWidth < 700) {
    rose.position.x = 0.12;
    rose.userData.baseY = -0.42;
    rose.scale.setScalar(0.61);
  } else {
    rose.position.x = 1.08;
    rose.userData.baseY = 0;
    rose.scale.setScalar(0.82);
  }
  rose.position.y = rose.userData.baseY;
  camera.position.x = rose.position.x;
  controls.target.set(rose.position.x, rose.userData.baseY, 0);
  controls.update();
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  applyResponsiveLayout();
});

animate();
