# 3D 粒子玫瑰

基于 GitHub 开源项目 [mrsuperguo/qixi-particle-rose](https://github.com/mrsuperguo/qixi-particle-rose) 拉取并本地编译运行。

用 Three.js 从玫瑰 GLB 模型表面采样约 10 万个粒子，组成可旋转、可绽放的 3D 粒子玫瑰。

## 效果

- 从三维玫瑰模型表面采样粒子，形成发光花束
- 鼠标拖动旋转，自动缓慢回转
- 点击「绽放」让粒子向外散开，再点「归拢」收回
- 可播放背景音乐 *The Rose*

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173

生产构建：

```bash
npm run build
npm run preview
```

## 来源

- 原仓库：https://github.com/mrsuperguo/qixi-particle-rose
- 技术栈：Vite + Three.js（GLTFLoader + MeshSurfaceSampler + OrbitControls）
