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
    explodeTargets: null,
    model: null,
    composer: null,
    highlightedMeshes: new Map() // uuid -> { mesh, originalEmissive, originalIntensity }
};

// ===== Demo State =====
const demoState = {
    lowerPlateExtended: false,
    lowerPlateOrigPositions: null,
    sidePlatesExtended: false,
    sidePlatesOrigPositions: null,
    armFrontBackValue: 0,
    armLiftValue: 0,
    armOrigPositions: null
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
scene.background = new THREE.Color(0xf0f0f5);

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
renderer.toneMappingExposure = 0.5;
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

// Middle mouse button drag for pan
controls.mouseButtons.middle = THREE.MOUSE.PAN;

// ===== Lighting =====
RectAreaLightUniformsLib.init();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 0.6);
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

const fillLight = new THREE.DirectionalLight(0xccddff, 0.4);
fillLight.position.set(-5, 2, -5);
scene.add(fillLight);

const rimLight = new THREE.SpotLight(0x4f8cff, 0.6);
rimLight.position.set(0, 5, -8);
rimLight.lookAt(0, 0, 0);
scene.add(rimLight);

// Ground plane (shadow catcher)
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper (subtle)
const gridHelper = new THREE.GridHelper(20, 40, 0xbbbbbb, 0xdddddd);
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
        state.explodeTargets = null;
        state.exploded = false;
        document.getElementById('btn-explode').classList.remove('active');
    }

    gltfLoader.load(url, (gltf) => {
        const model = gltf.scene;
        state.model = model;

        // Compute bounding box (original scale)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        // Apply scale first
        const scale = maxDim > 0 ? 3 / maxDim : 1;
        model.scale.setScalar(scale);

        // Recompute center after scaling, then center the model
        model.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        const scaledSize = scaledBox.getSize(new THREE.Vector3());

        model.position.sub(scaledCenter);
        model.position.y += scaledSize.y / 2;

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

        // Store original positions and pre-calculate explode targets
        storeOriginalPositions(model);
        state.explodeTargets = calculateExplodeTargets(model);

        // Reset demo states on new model load
        demoState.lowerPlateExtended = false;
        demoState.lowerPlateOrigPositions = null;
        demoState.sidePlatesExtended = false;
        demoState.sidePlatesOrigPositions = null;
        demoState.armFrontBackValue = 0;
        demoState.armLiftValue = 0;
        demoState.armOrigPositions = null;
        document.getElementById('btn-lower-plate').classList.remove('active');
        document.getElementById('btn-side-plates').classList.remove('active');
        document.getElementById('slider-arm-front-back').value = 0;
        document.getElementById('val-arm-front-back').textContent = '0mm';
        document.getElementById('slider-arm-lift').value = 0;
        document.getElementById('val-arm-lift').textContent = '0mm';

        // Pre-store original positions for all demo features
        initDemoOrigPositions(model);

        // Update camera target to exact world center
        model.updateMatrixWorld(true);
        const worldBox = new THREE.Box3().setFromObject(model);
        const worldCenter = worldBox.getCenter(new THREE.Vector3());
        controls.target.copy(worldCenter);

        const dist = maxDim * scale * 1.5;
        // Place camera at negative Z to look at the front of the model
        camera.position.set(dist, dist * 0.6, -dist);
        controls.update();

        // Update UI
        modelNameEl.textContent = filename;
        headerStats.style.display = 'flex';
        noModelEl.classList.add('hidden');
        updateStats(model);
        buildModelTree(model);

        loaderEl.classList.add('hidden');

        // Hide hint manually via close button only
        document.getElementById('hint-close').addEventListener('click', () => {
            hintEl.classList.add('hidden');
        });
    }, (progress) => {
        let pct = 0;
        if (progress.total > 0) {
            pct = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
        }
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
        item.dataset.uuid = node.uuid;
        item.dataset.type = node.isMesh ? 'mesh' : 'group';

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

        // Click to highlight corresponding part(s)
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!state.model) return;
            const uuid = item.dataset.uuid;
            let targetNode = null;
            state.model.traverse((child) => {
                if (child.uuid === uuid) targetNode = child;
            });
            if (targetNode) handleTreeItemClick(targetNode, item);
        });

        frag.appendChild(item);

        if (node.children) {
            node.children.forEach(child => traverse(child, level + 1));
        }
    }

    traverse(model);
    modelTree.appendChild(frag);
}

function handleTreeItemClick(node, itemEl) {
    const isAlreadyHighlighted = itemEl.classList.contains('active');

    // Clear previous highlight first
    clearHighlight();

    if (isAlreadyHighlighted) return;

    // Mark UI as active
    itemEl.classList.add('active');

    // Collect all mesh nodes under the clicked node
    const meshes = [];
    node.traverse((child) => {
        if (child.isMesh) meshes.push(child);
    });

    meshes.forEach((mesh) => {
        if (!mesh.material) return;

        // Clone material to avoid affecting other meshes that share the same material
        const baseMat = mesh.userData.originalMat || mesh.material;
        const highlightMat = baseMat.clone();
        highlightMat.emissive = new THREE.Color(0x2266ff);
        highlightMat.emissiveIntensity = 1.5;

        state.highlightedMeshes.set(mesh.uuid, {
            mesh,
            beforeMat: mesh.material
        });

        mesh.material = highlightMat;
    });
}

function clearHighlight() {
    state.highlightedMeshes.forEach(({ mesh, beforeMat }) => {
        if (mesh.material) {
            mesh.material = beforeMat;
        }
    });
    state.highlightedMeshes.clear();

    document.querySelectorAll('.tree-item.active').forEach((el) => el.classList.remove('active'));
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

    function animateExplode(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        state.model.traverse((child) => {
            if (child.isMesh) {
                const orig = state.originalPositions.get(child.uuid);
                const targetWorld = state.explodeTargets.get(child.uuid);
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
    controls.autoRotateSpeed = -2.0;
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
    state.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(state.model);
    const size = box.getSize(new THREE.Vector3());
    const worldCenter = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;

    // Animate camera reset
    const startPos = camera.position.clone();
    const endPos = new THREE.Vector3(dist, dist * 0.6, -dist);
    const startTarget = controls.target.clone();
    const endTarget = worldCenter;
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

document.getElementById('toggle-demo-panel').addEventListener('click', function() {
    const body = document.getElementById('demo-body');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    this.textContent = isHidden ? '−' : '+';
});

// ===== Demo: Lower Plate Toggle =====
function toggleLowerPlate() {
    if (!state.model) return;

    const targetNames = ['下挡板-1', 'MGN12-C滑块-3'];
    const parts = [];
    state.model.traverse((child) => {
        if (targetNames.includes(child.name)) {
            parts.push(child);
        }
    });

    if (parts.length === 0) {
        console.warn('未找到下挡板相关零件');
        return;
    }

    demoState.lowerPlateExtended = !demoState.lowerPlateExtended;
    document.getElementById('btn-lower-plate').classList.toggle('active', demoState.lowerPlateExtended);

    // Store original positions on first use
    if (!demoState.lowerPlateOrigPositions) {
        demoState.lowerPlateOrigPositions = new Map();
        for (const part of parts) {
            demoState.lowerPlateOrigPositions.set(part.uuid, part.position.clone());
        }
    }

    const duration = 600;
    const startTime = performance.now();
    // Model uses meters, 100mm = 0.1m
    // Backward is positive Z
    const moveDistance = 0.1;
    const direction = new THREE.Vector3(0, 0, 1);

    function animateMove(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        for (const part of parts) {
            const orig = demoState.lowerPlateOrigPositions.get(part.uuid);
            if (!orig) continue;
            const target = orig.clone().add(direction.clone().multiplyScalar(moveDistance));

            if (demoState.lowerPlateExtended) {
                part.position.lerpVectors(orig, target, ease);
            } else {
                part.position.lerpVectors(target, orig, ease);
            }
        }

        if (t < 1) {
            requestAnimationFrame(animateMove);
        }
    }

    requestAnimationFrame(animateMove);
}

document.getElementById('btn-lower-plate').addEventListener('click', toggleLowerPlate);

// ===== Demo: Side Plates Toggle =====
function toggleSidePlates() {
    if (!state.model) return;

    const rightPartsNames = ['右挡板-2', '前挡板-4', '右挡板连接件-1', 'MGN12-C滑块-1'];
    const leftPartsNames = ['右挡板-4', '前挡板-1', '左挡板连接件-1', 'MGN12-C滑块-2'];
    const allTargetNames = [...rightPartsNames, ...leftPartsNames];

    const parts = [];
    state.model.traverse((child) => {
        if (allTargetNames.includes(child.name)) {
            parts.push(child);
        }
    });

    if (parts.length === 0) {
        console.warn('未找到左右挡板相关零件');
        return;
    }

    demoState.sidePlatesExtended = !demoState.sidePlatesExtended;
    document.getElementById('btn-side-plates').classList.toggle('active', demoState.sidePlatesExtended);

    // Use pre-stored original positions
    if (!demoState.sidePlatesOrigPositions) {
        demoState.sidePlatesOrigPositions = new Map();
        for (const part of parts) {
            demoState.sidePlatesOrigPositions.set(part.uuid, part.position.clone());
        }
    }

    const duration = 600;
    const startTime = performance.now();
    const moveDistance = 0.05; // 50mm in meters

    function animateMove(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        for (const part of parts) {
            const orig = demoState.sidePlatesOrigPositions.get(part.uuid);
            if (!orig) continue;

            // Determine direction: right parts move +X, left parts move -X
            const isRight = rightPartsNames.includes(part.name);
            const direction = isRight ? 1 : -1;
            const target = orig.clone().add(new THREE.Vector3(moveDistance * direction, 0, 0));

            if (demoState.sidePlatesExtended) {
                part.position.lerpVectors(orig, target, ease);
            } else {
                part.position.lerpVectors(target, orig, ease);
            }
        }

        if (t < 1) {
            requestAnimationFrame(animateMove);
        }
    }

    requestAnimationFrame(animateMove);
}

document.getElementById('btn-side-plates').addEventListener('click', toggleSidePlates);

// ===== Demo: Arm Sliders =====
const armGroup1Names = [
    '机械夹爪', '机械夹爪连接件',
    '铝型材-300',
    '5孔铝型材连接板-1', '5孔铝型材连接板-2',
    '铝型材-150',
    '2060角码-1', '2060角码-2',
    'Z轴连接垫块-1', 'Z轴连接垫块-2',
    'H80BZ滑块-2'
];
const armGroup2Names = [
    'H80BZ右折滑台-200', 'H80BZ滑块-1',
    '3030L-4孔-1', '3030L-4孔-2'
];

function initDemoOrigPositions(model) {
    if (!model) return;

    // Lower plate
    const lowerPlateNames = ['下挡板-1', 'MGN12-C滑块-3'];
    demoState.lowerPlateOrigPositions = new Map();
    model.traverse((child) => {
        if (lowerPlateNames.includes(child.name)) {
            demoState.lowerPlateOrigPositions.set(child.uuid, child.position.clone());
        }
    });

    // Side plates
    const sideNames = ['右挡板-2', '前挡板-4', '右挡板连接件-1', 'MGN12-C滑块-1', '右挡板-4', '前挡板-1', '左挡板连接件-1', 'MGN12-C滑块-2'];
    demoState.sidePlatesOrigPositions = new Map();
    model.traverse((child) => {
        if (sideNames.includes(child.name)) {
            demoState.sidePlatesOrigPositions.set(child.uuid, child.position.clone());
        }
    });

    // Arm
    const allArmNames = [...armGroup1Names, ...armGroup2Names];
    demoState.armOrigPositions = new Map();
    let matchedCount = 0;
    model.traverse((child) => {
        if (allArmNames.some(n => child.name === n || child.name.includes(n))) {
            demoState.armOrigPositions.set(child.uuid, child.position.clone());
            matchedCount++;
            console.log('[ArmDemo] matched:', child.name);
        }
    });
    console.log('[ArmDemo] total matched parts:', matchedCount, 'expected:', allArmNames.length);
}

function findPartsByNames(model, names) {
    const parts = [];
    const matchedUuids = new Set();

    // Exact match first
    model.traverse((child) => {
        if (!child.name || matchedUuids.has(child.uuid)) return;
        for (const name of names) {
            if (child.name === name) {
                parts.push(child);
                matchedUuids.add(child.uuid);
                break;
            }
        }
    });

    // Fuzzy match: sort by length descending to avoid short names stealing long ones
    const fuzzyNames = names.filter(n => !parts.some(p => p.name === n)).slice().sort((a, b) => b.length - a.length);
    model.traverse((child) => {
        if (!child.name || matchedUuids.has(child.uuid)) return;
        for (const name of fuzzyNames) {
            if (child.name.includes(name)) {
                parts.push(child);
                matchedUuids.add(child.uuid);
                break;
            }
        }
    });

    return parts;
}

function updateArmPosition() {
    if (!state.model || !demoState.armOrigPositions) return;

    const fbOffset = demoState.armFrontBackValue / 1000; // Z axis, mm -> m
    const liftOffset = -demoState.armLiftValue / 1000;   // Y axis, down is negative

    const allNames = [...armGroup1Names, ...armGroup2Names];
    let movedCount = 0;
    state.model.traverse((child) => {
        if (!child.name) return;
        const matched = allNames.some(n => child.name === n || child.name.includes(n));
        if (!matched) return;

        const orig = demoState.armOrigPositions.get(child.uuid);
        if (!orig) {
            console.warn('[ArmDemo] no orig position for:', child.name);
            return;
        }

        const target = orig.clone();
        target.z += fbOffset; // front/back for both groups

        const isGroup1 = armGroup1Names.some(n => child.name === n || child.name.includes(n));
        if (isGroup1) {
            target.y += liftOffset; // lift only for group1
        }

        child.position.copy(target);
        movedCount++;
    });
    if (movedCount > 0) console.log('[ArmDemo] moved parts:', movedCount);
}

document.getElementById('slider-arm-front-back').addEventListener('input', function() {
    demoState.armFrontBackValue = parseInt(this.value, 10);
    document.getElementById('val-arm-front-back').textContent = demoState.armFrontBackValue + 'mm';
    updateArmPosition();
});

document.getElementById('slider-arm-lift').addEventListener('input', function() {
    demoState.armLiftValue = parseInt(this.value, 10);
    document.getElementById('val-arm-lift').textContent = demoState.armLiftValue + 'mm';
    updateArmPosition();
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

// Try to load default model (add cache-buster to force reload when model changes)
const modelUrl = 'models/assembly.glb?v=' + Date.now();
fetch(modelUrl)
    .then(res => {
        if (res.ok) {
            loadModel(modelUrl, 'assembly.glb');
        } else {
            loaderEl.classList.add('hidden');
        }
    })
    .catch(() => {
        loaderEl.classList.add('hidden');
    });
