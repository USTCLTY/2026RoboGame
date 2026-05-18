#!/usr/bin/env node
/**
 * 自动压缩 glTF/glb 模型脚本
 * 使用项目中的 gltf-pipeline 进行 Draco 压缩
 *
 * 用法:
 *   cd models
 *   node compress.js                // 压缩当前目录下所有 .glb/.gltf
 *   node compress.js [文件路径]      // 压缩指定文件
 *   node compress.js --restore      // 从 .bak 恢复原始文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const shouldRestore = args.includes('--restore');
const skipBackup = args.includes('--no-backup');
const inputFiles = args.filter(a => !a.startsWith('-'));

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function isDracoCompressed(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // GLB header: magic + version + length (12 bytes), then first chunk
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546C67) return false;

    let offset = 12;
    while (offset + 7 < buf.length) {
      const chunkLen = buf.readUInt32LE(offset);
      const chunkType = buf.readUInt32LE(offset + 4);
      if (chunkType === 0x4E4F534A) { // JSON chunk
        const jsonBuf = buf.slice(offset + 8, offset + 8 + chunkLen);
        const jsonStr = jsonBuf.toString('utf8').replace(/\0+$/, '');
        const gltf = JSON.parse(jsonStr);
        // Check if any mesh primitive has draco extension
        if (gltf.meshes) {
          for (const mesh of gltf.meshes) {
            if (mesh.primitives) {
              for (const prim of mesh.primitives) {
                if (prim.extensions && prim.extensions['KHR_draco_mesh_compression']) {
                  return true;
                }
              }
            }
          }
        }
        return false;
      }
      offset += 8 + chunkLen;
    }
    return false;
  } catch {
    return false;
  }
}

function compressFile(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.error('❌ 文件不存在:', fullPath);
    return false;
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (ext !== '.glb' && ext !== '.gltf') {
    console.error('❌ 不支持的文件格式:', ext);
    return false;
  }

  const dir = path.dirname(fullPath);
  const basename = path.basename(fullPath);
  const backupPath = fullPath + '.bak';
  const tempOutput = path.join(dir, `.__temp_${Date.now()}_${basename}`);

  // 检查是否已经是 Draco 压缩
  if (isDracoCompressed(fullPath)) {
    console.log(`\n📦 ${basename}`);
    console.log(`   ⚠️  该文件已经是 Draco 压缩格式，跳过。`);
    return null;
  }

  const originalSize = fs.statSync(fullPath).size;
  console.log(`\n📦 处理: ${basename}`);
  console.log(`   原始大小: ${formatSize(originalSize)}`);

  // 备份原文件（默认开启）
  if (!skipBackup) {
    fs.copyFileSync(fullPath, backupPath);
    console.log(`   已备份: ${basename}.bak`);
  }

  try {
    const cmd = `npx gltf-pipeline -i "${fullPath}" -o "${tempOutput}" -d`;
    execSync(cmd, { stdio: 'pipe', cwd: path.dirname(fullPath) });
    fs.renameSync(tempOutput, fullPath);

    const newSize = fs.statSync(fullPath).size;
    const ratio = ((1 - newSize / originalSize) * 100).toFixed(1);
    console.log(`   压缩后:   ${formatSize(newSize)}`);
    console.log(`   压缩率:   ${ratio}% ↓`);
    return true;
  } catch (err) {
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    console.error('❌ 压缩失败:', err.message || err);
    return false;
  }
}

function restoreFile(filePath) {
  const fullPath = path.resolve(filePath);
  const backupPath = fullPath + '.bak';

  if (!fs.existsSync(backupPath)) {
    console.error('❌ 备份文件不存在:', backupPath);
    return false;
  }

  fs.copyFileSync(backupPath, fullPath);
  console.log(`✅ 已恢复: ${path.basename(fullPath)}`);
  return true;
}

function findModelFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.glb') || f.endsWith('.gltf'))
    .map(f => path.join(dir, f));
}

// ==== 主逻辑 ====
console.log('🚀 glTF 模型自动压缩工具');
console.log('========================');

let filesToProcess = [];

if (inputFiles.length > 0) {
  filesToProcess = inputFiles;
} else {
  const scriptDir = path.dirname(__filename);
  filesToProcess = findModelFiles(scriptDir);
  if (filesToProcess.length === 0) {
    console.log('当前目录下没有找到 .glb 或 .gltf 文件。');
    process.exit(0);
  }
}

let success = 0, fail = 0, skip = 0;

if (shouldRestore) {
  for (const file of filesToProcess) {
    restoreFile(file) ? success++ : fail++;
  }
  console.log(`\n========================`);
  console.log(`✅ 成功: ${success}  失败: ${fail}`);
} else {
  for (const file of filesToProcess) {
    const result = compressFile(file);
    if (result === true) success++;
    else if (result === false) fail++;
    else skip++;
  }
  console.log(`\n========================`);
  console.log(`✅ 成功: ${success}  跳过: ${skip}  失败: ${fail}`);
}
console.log('========================');
if (fail > 0) process.exit(1);
