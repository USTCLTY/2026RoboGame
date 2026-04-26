# 模型文件存放目录

将你的 SolidWorks 装配体导出文件放置在此目录中。

## 支持的格式

- **.glb** （推荐）- 二进制 GLTF 格式，单文件
- **.gltf** - 文本 GLTF 格式，通常附带 .bin 文件和纹理

## 默认加载

如果此目录下存在 `RG.glb` 文件，网页打开时会自动加载该模型。
你也可以修改 `js/app.js` 中的文件名来加载其他模型。

## 从 SolidWorks 导出 GLB 的方法

### 方法 1：使用 SolidWorks 插件（推荐）
1. 安装 **SolidWorks GLTF Exporter** 插件
2. 在 SolidWorks 中打开装配体
3. 选择 **文件 > 另存为**
4. 格式选择 **GLTF (*.gltf)** 或 **GLB (*.glb)**
5. 在选项中确保勾选：
   - 导出纹理
   - 导出颜色/外观
   - 保留层级结构

### 方法 2：通过 Blender 转换
如果没有直接导出插件，可以通过 Blender 作为中转：
1. SolidWorks 导出为 **STEP (.step/.stp)** 或 **IGES (.igs)**
2. 在 Blender 中导入 STEP 文件（需要安装 STEP 导入插件）
3. 在 Blender 中整理材质、UV 和层级
4. 导出为 **GLTF 2.0 (.glb)**：
   - 文件 > 导出 > glTF 2.0 (.glb/.gltf)
   - 格式选择 **glTF Binary (.glb)**
   - 勾选 **应用变换**、**包含材质**

### 方法 3：在线转换
使用在线 CAD 转换工具将 SolidWorks 文件转换为 GLB 格式。

## 注意事项

- 模型应尽量优化，面数过多会影响网页加载和渲染性能
- 建议在 SolidWorks 或 Blender 中合并一些小零件，减少零件数量
- 纹理贴图应使用 JPEG/PNG 格式，尺寸建议不超过 2048x2048
- 最终文件名应为英文或数字，避免中文和特殊字符
