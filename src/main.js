import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBloomingFlower } from "./bloomingFlower.js";
import { detectDevice, viewSize } from "./device.js";

const BLOOM_DURATION = 11;
const BLOOM_HOLD = 0.7;
const CLOSE_DURATION = 1.1;

const canvas = document.querySelector("#scene");
const loading = document.querySelector(".loading");
const bloomButton = document.querySelector(".bloom");
const bloomLabel = document.querySelector(".bloom-label");
const musicButton = document.querySelector(".music");
const music = document.querySelector("#background-music");
const startGate = document.querySelector(".start-gate");
const hint = document.querySelector(".hint");
const assetUrl = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;
const quality = detectDevice();

if (quality.isMobile) document.documentElement.classList.add("is-mobile");
if (quality.isWeChat) document.documentElement.classList.add("is-wechat");

music.src = assetUrl("the-rose.mp3");
music.volume = 0.42;
music.setAttribute("playsinline", "");
music.setAttribute("webkit-playsinline", "");
music.preload = quality.isMobile ? "metadata" : "auto";

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090406, quality.isMobile ? 0.03 : 0.045);
scene.background = new THREE.Color(0x090406);

const { width: startWidth, height: startHeight } = viewSize();
const camera = new THREE.PerspectiveCamera(quality.isMobile ? 42 : 38, startWidth / startHeight, 0.1, 80);
camera.position.set(1.35, 0.42, 5.6);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: quality.antialias,
  alpha: true,
  powerPreference: quality.isMobile ? "low-power" : "high-performance",
  stencil: false,
  depth: true
});
renderer.setSize(startWidth, startHeight, false);
renderer.setPixelRatio(quality.pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = quality.isMobile ? 1.18 : 1.08;

if (quality.environment) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3.4;
controls.maxDistance = 9;
controls.autoRotate = false;
controls.target.set(0.85, 0.05, 0);
controls.rotateSpeed = quality.isMobile ? 0.72 : 1;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

const keyLight = new THREE.DirectionalLight(0xffe4ec, quality.isMobile ? 2.4 : 2.1);
keyLight.position.set(3.4, 4.2, 3.8);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffc1d0, quality.isMobile ? 2.2 : 2.6);
rimLight.position.set(-3.8, 1.6, -4.4);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0xff8aa0, quality.isMobile ? 4.2 : 6.5, 12, 2);
fillLight.position.set(0.4, 0.8, 2.4);
scene.add(fillLight);

scene.add(new THREE.HemisphereLight(0xffdce4, 0x12080b, quality.isMobile ? 0.7 : 0.55));

const flowerRoot = new THREE.Group();
scene.add(flowerRoot);
const flower = createBloomingFlower(quality);
flowerRoot.add(flower.group);

let composer = null;
let bloomPass = null;
if (quality.postBloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(startWidth, startHeight), 0.38, 0.52, 0.82);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

const clock = new THREE.Clock();
let bloomElapsed = 0;
let closeElapsed = 0;
let displayProgress = 0;
let isPlayingBloom = false;
let isClosing = false;
const lockedProgress = (() => {
  const raw = new URLSearchParams(location.search).get("p");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : null;
})();
let awaitingStart = quality.isMobile && lockedProgress === null;
if (lockedProgress !== null) {
  awaitingStart = false;
  isPlayingBloom = false;
}

function applyResponsiveLayout() {
  const { width, height } = viewSize();
  const portrait = height >= width;
  if (quality.isMobile || width < 700) {
    const scale = portrait ? 0.78 : 0.68;
    flowerRoot.position.set(0, portrait ? -0.22 : -0.08, 0);
    flowerRoot.scale.setScalar(scale);
    camera.position.set(0, portrait ? 0.18 : 0.28, portrait ? 5.6 : 5.1);
    controls.target.set(0, portrait ? 0.02 : 0.08, 0);
    flowerRoot.rotation.set(-0.04, 0.18, 0);
  } else {
    flowerRoot.position.set(0.95, -0.05, 0);
    flowerRoot.scale.setScalar(1);
    camera.position.set(1.35, 0.42, 5.6);
    controls.target.set(0.85, 0.05, 0);
    flowerRoot.rotation.set(-0.08, 0.55, -0.16);
  }
  controls.update();
}

function resizeRenderer() {
  const { width, height } = viewSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(quality.pixelRatio);
  composer?.setSize(width, height);
  bloomPass?.setSize(width, height);
  applyResponsiveLayout();
  flowerRoot.userData.baseY = flowerRoot.position.y;
}

function replayBloom() {
  if (lockedProgress !== null) return;
  if (awaitingStart || isClosing || isPlayingBloom) return;
  isClosing = true;
  closeElapsed = 0;
  bloomLabel.textContent = "收拢中";
}

bloomButton.addEventListener("click", (event) => {
  event.stopPropagation();
  replayBloom();
});

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

musicButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (music.paused) await playMusic();
  else {
    music.pause();
    updateMusicUI(false);
  }
});

function beginBloom() {
  startGate?.classList.add("hidden");
  hint?.classList.toggle("hidden", !quality.isMobile);
  if (!awaitingStart && isPlayingBloom) return;
  awaitingStart = false;
  clock.stop();
  clock.start();
  bloomElapsed = 0;
  closeElapsed = 0;
  isClosing = false;
  isPlayingBloom = lockedProgress === null;
  displayProgress = lockedProgress ?? 0;
  flower.setBloom(displayProgress);
  bloomLabel.textContent = lockedProgress !== null ? "预览" : "开放中";
  playMusic();
}

startGate?.addEventListener("click", beginBloom);
startGate?.addEventListener("touchend", (event) => {
  event.preventDefault();
  beginBloom();
}, { passive: false });

if (lockedProgress !== null) {
  startGate?.classList.add("hidden");
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (awaitingStart) {
    flower.setBloom(0);
    flower.updateSparkles(time, 0);
    renderer.render(scene, camera);
    return;
  }

  if (lockedProgress !== null) {
    displayProgress = lockedProgress;
  } else if (isClosing) {
    closeElapsed += delta;
    const closeT = THREE.MathUtils.clamp(closeElapsed / CLOSE_DURATION, 0, 1);
    displayProgress = displayProgress * (1 - closeT * closeT * (3 - 2 * closeT));
    if (closeT >= 1) {
      isClosing = false;
      bloomElapsed = 0;
      isPlayingBloom = true;
      displayProgress = 0;
      bloomLabel.textContent = "开放中";
    }
  } else if (isPlayingBloom) {
    bloomElapsed += delta;
    displayProgress = THREE.MathUtils.clamp((bloomElapsed - BLOOM_HOLD) / BLOOM_DURATION, 0, 1);
    if (displayProgress >= 1) {
      isPlayingBloom = false;
      bloomLabel.textContent = "再开放一次";
    }
  }

  flower.setBloom(displayProgress);
  flower.updateSparkles(time, displayProgress);
  flower.updateIdle(time, displayProgress);
  flowerRoot.position.y = flowerRoot.userData.baseY + Math.sin(time * 0.45) * 0.02;
  controls.update(delta);
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

applyResponsiveLayout();
flowerRoot.userData.baseY = flowerRoot.position.y;
displayProgress = 0;
flower.setBloom(0);
loading.classList.add("hidden");
if (awaitingStart) {
  bloomLabel.textContent = "轻触开启";
} else {
  startGate?.classList.add("hidden");
  beginBloom();
}

addEventListener("resize", resizeRenderer);
visualViewport?.addEventListener("resize", resizeRenderer);
visualViewport?.addEventListener("scroll", resizeRenderer);
addEventListener("orientationchange", () => setTimeout(resizeRenderer, 250));

animate();
