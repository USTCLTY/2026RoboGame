# SolidWorks 装配体实时渲染展示

基于 Three.js 的高性能 Web 3D 渲染方案，用于在 GitHub Pages 上展示 SolidWorks 装配体模型。

## 功能特性

- **PBR 实时渲染** - ACES 色调映射、环境光照、Bloom 辉光后期处理
- **智能模型适配** - 自动计算包围盒并调整相机视角
- **多种交互模式** - 旋转/平移/缩放、自动旋转、线框模式、爆炸视图
- **拖拽加载** - 无需服务器，直接拖放 GLB/GLTF 文件即可预览
- **模型结构树** - 展示装配体的零件层级关系
- **统计信息** - 实时显示零件数、顶点数、面片数
- **一键截图** - 保存当前渲染画面为 PNG
- **响应式设计** - 适配桌面和移动设备

## 在线预览

部署到 GitHub Pages 后，访问地址为：
```
https://USTCLTY.github.io/2026RoboGame/
```

## 快速开始

### 1. 准备模型

从 SolidWorks 导出装配体为 `.glb` 格式：

**方法 A：直接导出（推荐）**
- 安装 SolidWorks GLTF 导出插件
- 文件 > 另存为 > 选择 `.glb` 格式

**方法 B：通过 Blender 中转**
- SolidWorks 导出为 `.step`
- Blender 导入后导出为 `.glb`

将导出的模型文件重命名为 `assembly.glb`，放入 `models/` 目录。

### 2. 部署到 GitHub Pages

**方法一：自动部署（推荐）**
1. 在 GitHub 创建新仓库，上传本项目所有文件
2. 进入仓库 **Settings > Pages**
3. **Source** 选择 "GitHub Actions"
4. 推送代码到 `main` 分支，Actions 将自动部署

**方法二：手动部署**
1. 进入仓库 **Settings > Pages**
2. **Source** 选择 "Deploy from a branch"
3. 选择 `main` 分支和 `/ (root)` 目录
4. 保存后等待部署完成

### 3. 查看效果

打开 GitHub Pages 链接即可看到实时渲染的装配体。

如果没有放置默认模型，页面会显示空白画布，此时可以直接拖放 `.glb` 文件到页面中加载。

## 项目结构

```
.
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式表
├── js/
│   └── app.js              # Three.js 渲染逻辑
├── models/
│   ├── README.md           # 模型存放说明
│   └── assembly.glb        # 你的 SolidWorks 模型（可选）
├── .github/
│   └── workflows/
│       └── pages.yml       # GitHub Actions 自动部署
└── README.md               # 本文件
```

## 交互说明

| 操作 | 说明 |
|------|------|
| 左键拖拽 | 旋转视角 |
| 右键拖拽 | 平移视角 |
| 滚轮 | 缩放 |
| 拖放文件 | 加载 GLB/GLTF 模型 |
| 重置视角 | 恢复默认相机位置 |
| 自动旋转 | 开/关自动展示旋转 |
| 线框模式 | 切换线框/实体显示 |
| 爆炸视图 | 展开/复原装配体零件 |
| 截图 | 保存当前画面为 PNG |
| 全屏 | 进入浏览器全屏模式 |

## 技术栈

- [Three.js](https://threejs.org/) - WebGL 3D 渲染引擎
- [RoomEnvironment](https://threejs.org/examples/#webgl_materials_envmaps) - 实时环境贴图
- [EffectComposer](https://threejs.org/examples/#webgl_postprocessing_unreal_bloom) - 后期处理（Bloom）
- GitHub Pages - 静态网站托管

## 性能优化建议

1. **减少面数** - 在 SolidWorks 或 Blender 中对模型进行减面处理
2. **合并小零件** - 将不重要的紧固件等合并为一个网格
3. **压缩纹理** - 使用压缩格式（如 KTX2）或降低纹理分辨率
4. **使用 Draco** - 导出时使用 Draco 压缩减小 GLB 文件体积

## 许可证

MIT
