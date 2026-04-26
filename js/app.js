import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ===== Global State =====
const state = {
    autoRotate: false,
    wireframe: false,
    exploded: false,
    originalPositions: new Map(),
    model: null,
    composer: null
};

// ===== DOM Elements =====
const canvas = document.getElementById('canvas');
const loaderEl = document.getElementById('loader');
const modelNameEl = document.getElementById('model-name');
const headerStats = document.getElementById('header-stats');
const dragOverlay = document.getElementById('drag-overlay');
const modelTree = document.getElementById('model-tree');
const hintEl = document.getElementById('hint');
const noModelEl = document.getElementById('no-model');

// ===== Scene Setup =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(5, 3, 5);

const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.15, 0.5, 0.85
);
composer.addPass(bloomPass);
state.composer = composer;

// Environment
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.1;
controls.maxDistance = 50;
controls.target.set(0, 0, 0);

// ===== Lighting =====
RectAreaLightUniformsLib.init();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
mainLight.position.set(5, 10, 7);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 0.1;
mainLight.shadow.camera.far = 50;
mainLight.shadow.bias = -0.001;
const d = 10;
mainLight.shadow.camera.left = -d;
mainLight.shadow.camera.right = d;
mainLight.shadow.camera.top = d;
mainLight.shadow.camera.bottom = -d;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0xccddff, 0.5);
fillLight.position.set(-5, 2, -5);
scene.add(fillLight);

const rimLight = new THREE.SpotLight(0x4f8cff, 2.0);
rimLight.position.set(0, 5, -8);
rimLight.lookAt(0, 0, 0);
scene.add(rimLight);

// Ground plane (shadow catcher)
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper (subtle)
const gridHelper = new THREE.GridHelper(20, 40, 0x333333, 0x1a1a1a);
gridHelper.position.y = -0.02;
scene.add(gridHelper);

// ===== Loading Manager =====
const manager = new THREE.LoadingManager();
manager.onLoad = () => {
    loaderEl.classList.add('hidden');
};
manager.onError = (url) => {
    console.error('Failed to load:', url);
    loaderEl.querySelector('.loader-text').textContent = '加载失败，请刷新重试';
};

const gltfLoader = new GLTFLoader(manager);
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
gltfLoader.setDRACOLoader(dracoLoader);

// ===== Model Loading =====
function loadModel(url, filename = '未知模型') {
    loaderEl.classList.remove('hidden');
    loaderEl.querySelector('.loader-text').textContent = '正在加载模型...';

    // Clear previous model
    if (state.model) {
        scene.remove(state.model);
        state.originalPositions.clear();
        state.exploded = false;
        document.getElementById('btn-explode').classList.remove('active');
    }

    gltfLoader.load(url, (gltf) => {
        const model = gltf.scene;
        state.model = model;

        // Compute bounding box
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // Center and scale model
        model.position.sub(center);
        const scale = maxDim > 0 ? 3 / maxDim : 1;
        model.scale.setScalar(scale);
        model.position.y += (size.y * scale) / 2;

        // Enable shadows
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Store original material for wireframe toggle
                child.userData.originalMat = child.material;
            }
        });

        scene.add(model);

        // Store original positions for explode view
        storeOriginalPositions(model);

        // Update camera
        const dist = maxDim * scale * 1.5;
        camera.position.set(dist, dist * 0.6, dist);
        controls.target.set(0, (size.y * scale) / 2, 0);
        controls.update();

        // Update UI
        modelNameEl.textContent = filename;
        headerStats.style.display = 'flex';
        noModelEl.classList.add('hidden');
        updateStats(model);
        buildModelTree(model);

        loaderEl.classList.add('hidden');

        // Hide hint after model loaded
        setTimeout(() => hintEl.classList.add('hidden'), 4000);
    }, (progress) => {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loaderEl.querySelector('.loader-text').textContent = `加载中... ${pct}%`;
    }, (err) => {
        console.error(err);
        loaderEl.querySelector('.loader-text').textContent = '模型加载失败';
        setTimeout(() => loaderEl.classList.add('hidden'), 2000);
    });
}

function storeOriginalPositions(model) {
    model.traverse((child) => {
        if (child.isMesh || child.isGroup) {
            state.originalPositions.set(child.uuid, {
                position: child.position.clone(),
                parent: child.parent
            });
        }
    });
}

// ===== Stats =====
function updateStats(model) {
    let parts = 0;
    let vertices = 0;
    let faces = 0;

    model.traverse((child) => {
        if (child.isMesh) {
            parts++;
            const geo = child.geometry;
            if (geo.index) {
                faces += geo.index.count / 3;
            } else if (geo.attributes.position) {
                faces += geo.attributes.position.count / 3;
            }
            if (geo.attributes.position) {
                vertices += geo.attributes.position.count;
            }
        }
    });

    document.getElementById('stat-parts').textContent = parts;
    document.getElementById('stat-vertices').textContent = formatNumber(vertices);
    document.getElementById('stat-faces').textContent = formatNumber(Math.round(faces));
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

// ===== Model Tree =====
function buildModelTree(model) {
    modelTree.innerHTML = '';
    const frag = document.createDocumentFragment();

    function traverse(node, level = 0) {
        const item = document.createElement('div');
        item.className = `tree-item level-${Math.min(level, 3)}`;
        
        const icon = document.createElement('span');
        icon.innerHTML = node.isMesh 
            ? '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
            : '<svg class="tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        
        const name = document.createElement('span');
        name.textContent = node.name || (node.isMesh ? '零件' : '组');
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';

        item.appendChild(icon);
        item.appendChild(name);
        frag.appendChild(item);

        if (node.children) {
            node.children.forEach(child => traverse(child, level + 1));
        }
    }

    traverse(model);
    modelTree.appendChild(frag);
}

// ===== Explode View =====
function calculateExplodeTargets(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z);
    const explodeDist = maxDim * 0.25; // Fixed explode distance

    const targets = new Map();
    model.traverse((child) => {
        if (child.isMesh) {
            const worldPos = new THREE.Vector3();
            child.getWorldPosition(worldPos);
            const dir = new THREE.Vector3().subVectors(worldPos, center).normalize();
            const targetWorldPos = worldPos.clone().add(dir.multiplyScalar(explodeDist));
            targets.set(child.uuid, targetWorldPos);
        }
    });
    return targets;
}

function toggleExplode() {
    if (!state.model) return;
    state.exploded = !state.exploded;
    document.getElementById('btn-explode').classList.toggle('active', state.exploded);

    const duration = 600;
    const startTime = performance.now();

    // Pre-calculate target world positions
    const explodeTargets = calculateExplodeTargets(state.model);

    function animateExplode(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        state.model.traverse((child) => {
            if (child.isMesh) {
                const orig = state.originalPositions.get(child.uuid);
                const targetWorld = explodeTargets.get(child.uuid);
                if (!orig || !targetWorld || !child.parent) return;

                // Convert target world position to parent's local space
                const targetLocal = targetWorld.clone();
                child.parent.worldToLocal(targetLocal);

                if (state.exploded) {
                    child.position.lerpVectors(orig.position, targetLocal, ease);
                } else {
                    child.position.lerpVectors(targetLocal, orig.position, ease);
                }
            }
        });

        if (t < 1) {
            requestAnimationFrame(animateExplode);
        } else if (!state.exploded) {
            // Reset to exact original
            state.model.traverse((child) => {
                const orig = state.originalPositions.get(child.uuid);
                if (orig) child.position.copy(orig.position);
            });
        }
    }

    requestAnimationFrame(animateExplode);
}

// ===== Wireframe Toggle =====
function toggleWireframe() {
    if (!state.model) return;
    state.wireframe = !state.wireframe;
    document.getElementById('btn-wireframe').classList.toggle('active', state.wireframe);

    state.model.traverse((child) => {
        if (child.isMesh && child.userData.originalMat) {
            if (state.wireframe) {
                if (!child.userData.wireMat) {
                    child.userData.wireMat = new THREE.MeshBasicMaterial({
                        color: 0x4f8cff,
                        wireframe: true,
                        transparent: true,
                        opacity: 0.3
                    });
                }
                child.material = child.userData.wireMat;
            } else {
                child.material = child.userData.originalMat;
            }
        }
    });
}

// ===== Auto Rotate =====
function toggleAutoRotate() {
    state.autoRotate = !state.autoRotate;
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = 2.0;
    document.getElementById('btn-autorotate').classList.toggle('active', state.autoRotate);
}

// ===== Screenshot =====
function takeScreenshot() {
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `solidworks-render-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
}

// ===== Fullscreen =====
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// ===== Drag & Drop =====
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

document.body.addEventListener('dragenter', () => dragOverlay.classList.add('active'));
dragOverlay.addEventListener('dragleave', () => dragOverlay.classList.remove('active'));
dragOverlay.addEventListener('drop', (e) => {
    dragOverlay.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.match(/\.(glb|gltf)$/i)) {
            const url = URL.createObjectURL(file);
            loadModel(url, file.name);
        } else {
            alert('请上传 .glb 或 .gltf 格式的文件');
        }
    }
});

// ===== Toolbar Events =====
document.getElementById('btn-reset').addEventListener('click', () => {
    if (!state.model) return;
    const box = new THREE.Box3().setFromObject(state.model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.5;

    // Animate camera reset
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(dist, dist * 0.6, dist);
    const startTarget = controls.target.clone();
    const endTarget = new THREE.Vector3(0, size.y / 2, 0);
    const startTime = performance.now();
    const duration = 800;

    function animateReset(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPos, endPos, ease);
        controls.target.lerpVectors(startTarget, endTarget, ease);
        controls.update();

        if (t < 1) requestAnimationFrame(animateReset);
    }
    requestAnimationFrame(animateReset);
});

document.getElementById('btn-autorotate').addEventListener('click', toggleAutoRotate);
document.getElementById('btn-wireframe').addEventListener('click', toggleWireframe);
document.getElementById('btn-explode').addEventListener('click', toggleExplode);
document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

// Model panel toggle
document.getElementById('toggle-model-list').addEventListener('click', function() {
    const body = document.getElementById('model-tree');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    this.textContent = isHidden ? '−' : '+';
});

// ===== Resize Handler =====
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// ===== Animation Loop =====
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}

// ===== Init =====
animate();

// Try to load default model
fetch('models/assembly.glb')
    .then(res => {
        if (res.ok) {
            loadModel('models/assembly.glb', 'assembly.glb');
        } else {
            loaderEl.classList.add('hidden');
        }
    })
    .catch(() => {
        loaderEl.classList.add('hidden');
    });
