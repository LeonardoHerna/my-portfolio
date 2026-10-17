import * as THREE from 'three';

// Elementos principales de la experiencia
const journey = document.querySelector('.journey');
const stage = document.querySelector('.stage');
const cards = [...document.querySelectorAll('.story-card')];
const cardsLayer = document.querySelector('#cards');
const dotsRoot = document.querySelector('#nav-dots');
const progressBar = document.querySelector('#progress');
const count = document.querySelector('#nav-count');
const rollValue = document.querySelector('#roll-value');
document.querySelector('#currentYear').textContent = new Date().getFullYear();

// Estado y utilidades para avanzar una sección por gesto
let navigationLocked = false;
let targetScrollY = 0;
let quietTimer = null;
let fallbackUnlockTimer = null;

function panelScrollY(index) {
  const range = journey.offsetHeight - innerHeight;
  return journey.offsetTop + range * index / (cards.length - 1);
}

function maybeUnlockNavigation() {
  if (navigationLocked && !quietTimer && Math.abs(scrollY - targetScrollY) < 10) {
    navigationLocked = false;
    clearTimeout(fallbackUnlockTimer);
  }
}

function markWheelQuiet() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quietTimer = null;
    maybeUnlockNavigation();
  }, 220);
}

// Construcción de los indicadores laterales
const dots = cards.map((_, index) => {
  const button = document.createElement('button');
  button.className = 'nav-dot';
  button.type = 'button';
  button.setAttribute('aria-label', `Ir a la sección ${index + 1}`);
  button.addEventListener('click', () => goToPanel(index));
  dotsRoot.append(button);
  return button;
});

// Navegación con scroll, trackpad, táctil y enlaces
function goToPanel(index) {
  const boundedIndex = THREE.MathUtils.clamp(index, 0, cards.length - 1);
  targetScrollY = panelScrollY(boundedIndex);
  navigationLocked = true;
  window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  clearTimeout(fallbackUnlockTimer);
  fallbackUnlockTimer = setTimeout(() => { navigationLocked = false; }, 900);
}

window.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaY) < 2) return;
  event.preventDefault();
  markWheelQuiet();
  if (navigationLocked) return;
  const current = Math.round(targetProgress * (cards.length - 1));
  goToPanel(current + Math.sign(event.deltaY));
}, { passive: false });

let touchStartY = null;
stage.addEventListener('touchstart', (event) => { touchStartY = event.touches[0]?.clientY ?? null; }, { passive: true });
stage.addEventListener('touchmove', (event) => {
  const currentY = event.touches[0]?.clientY;
  if (touchStartY !== null && currentY !== undefined && Math.abs(touchStartY - currentY) > 10) event.preventDefault();
}, { passive: false });
stage.addEventListener('touchend', (event) => {
  if (touchStartY === null) return;
  const delta = touchStartY - (event.changedTouches[0]?.clientY ?? touchStartY);
  touchStartY = null;
  if (Math.abs(delta) < 35) return;
  if (!navigationLocked) {
    const current = Math.round(targetProgress * (cards.length - 1));
    goToPanel(current + Math.sign(delta));
  }
}, { passive: true });
document.querySelectorAll('.site-header nav a, .hero-card .button').forEach((link) => {
  link.addEventListener('click', (event) => {
    const panel = link.hash === '#stack' ? 1 : link.hash === '#proyectos' ? 2 : link.hash === '#sobre-mi' ? 3 : 4;
    if (link.hash && link.hash !== '#top') {
      event.preventDefault();
      goToPanel(panel);
    }
  });
});

// Escena Three.js: cámara, partículas y geometría helicoidal
const canvas = document.querySelector('#three-scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 120);
camera.position.set(0, 0, 18);
const particleGeometry = new THREE.BufferGeometry();
const particleCount = 650;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i += 1) {
  positions[i * 3] = (Math.random() - 0.5) * 36;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 24;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 28;
}
particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
  color: 0x9bb7d3, size: 0.035, transparent: true, opacity: 0.7,
  sizeAttenuation: true, depthWrite: false
}));
scene.add(particles);

const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x5eead4, wireframe: true, transparent: true, opacity: 0.14 });
const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.004, 2, 180), ringMaterial);
ring.rotation.x = Math.PI * 0.35;
scene.add(ring);
const helixPoints = [];
for (let i = 0; i <= 320; i += 1) {
  const t = i / 320;
  const angle = t * Math.PI * 5;
  helixPoints.push(new THREE.Vector3(Math.cos(angle) * 4.1, (t - 0.5) * 10, Math.sin(angle) * 4.1));
}
const helix = new THREE.Line(new THREE.BufferGeometry().setFromPoints(helixPoints), new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.19 }));
scene.add(helix);

// Seguimiento del scroll y ajuste del tamaño de la escena
let targetProgress = 0;
let smoothProgress = 0;
let lastTime = performance.now();
function measureScroll() {
  const range = journey.offsetHeight - innerHeight;
  targetProgress = range > 0 ? THREE.MathUtils.clamp(-journey.getBoundingClientRect().top / range, 0, 1) : 0;
  progressBar.style.width = `${targetProgress * 100}%`;
  maybeUnlockNavigation();
}
function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  measureScroll();
}
// Animación: descenso de cámara, inclinación temporal y movimiento de cartas
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  // Exponential damping stays smooth at different display refresh rates and
  // naturally follows both downward and upward scrolling.
  smoothProgress = THREE.MathUtils.damp(smoothProgress, targetProgress, 7, delta);
  const position = smoothProgress * (cards.length - 1);
  // Each landing alternates across the central X axis while the camera
  // advances around the vertical helix and descends to the next level.
  const turns = -Math.PI / 4 + position * Math.PI;
  const descent = smoothProgress * 6;
  // Incline only while the damped camera is catching up with the scroll.
  // Once the user pauses, this settles to zero and the cards are level again.
  const remainingTravel = targetProgress - smoothProgress;
  const transitionTilt = THREE.MathUtils.clamp(remainingTravel * 5, -0.18, 0.18);
  camera.position.set(Math.sin(turns) * 2.8, -descent, 18 + Math.cos(turns) * 1.2);
  camera.lookAt(0, -descent - 1.2, 0);
  camera.rotateZ(transitionTilt);
  camera.rotation.x += Math.sin(turns) * 0.02;
  ring.rotation.z = turns * 0.65;
  helix.rotation.y = turns * 0.3;
  particles.rotation.z = turns * 0.5;
  cardsLayer.style.transform = `rotate(${(-transitionTilt * 180 / Math.PI).toFixed(2)}deg)`;
  cards.forEach((card, index) => {
    const offset = index - position;
    const angle = offset * 0.92;
    const radius = Math.min(innerWidth * 0.28, 300);
    const x = Math.sin(angle) * radius;
    const y = offset * innerHeight * 0.62;
    const z = Math.cos(angle) * 130 - Math.abs(offset) * 90;
    const opacity = THREE.MathUtils.clamp(1 - Math.abs(offset) * 0.78, 0, 1);
    const scale = Math.max(0.72, 1 - Math.abs(offset) * 0.12);
    card.style.setProperty('--x', `${x.toFixed(1)}px`);
    card.style.setProperty('--y', `${y.toFixed(1)}px`);
    card.style.setProperty('--z', `${z.toFixed(1)}px`);
    card.style.setProperty('--ry', `${(angle * 28).toFixed(1)}deg`);
    card.style.setProperty('--scale', scale.toFixed(3));
    card.style.opacity = opacity.toFixed(3);
    card.style.zIndex = String(20 - Math.round(Math.abs(offset) * 2));
    card.style.pointerEvents = Math.abs(offset) < 0.48 ? 'auto' : 'none';
    card.setAttribute('aria-hidden', String(Math.abs(offset) >= 0.5));
  });
  const active = Math.round(position);
  dots.forEach((dot, index) => dot.classList.toggle('active', index === active));
  count.innerHTML = `${String(active + 1).padStart(2, '0')} <i>/</i> ${String(cards.length).padStart(2, '0')}`;
  rollValue.textContent = `${String(Math.round(Math.abs(transitionTilt) * 180 / Math.PI)).padStart(2, '0')}°`;
  renderer.render(scene, camera);
}
// Inicio y eventos globales
addEventListener('scroll', measureScroll, { passive: true });
addEventListener('resize', resize);
measureScroll();
requestAnimationFrame(animate);
