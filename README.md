# 高清缓放牡丹

在 Three.js 里用程序化花瓣网格实现「高清、动态、花朵慢慢开放」：多层半透明花瓣带叶脉，从花苞缓缓张开，而不是把整朵花打成粒子云再散开。

## 效果

- 约 80 片程序化花瓣，内层粉、外层近白半透明，带分叉叶脉
- 约 11 秒由花苞缓缓开放，外层先开、内层后开
- 逆光透出叶脉，辉光与漂浮光斑
- 点击「再开放一次」可重播
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

## 实现要点

截图里那种「高清花瓣慢慢张开」，核心不是把整朵花打成粒子再散开，而是：

1. **花瓣几何**：参数曲面做成牡丹瓣形（中段宽、根部收、边缘起皱）
2. **叶脉贴图**：Canvas 生成分叉叶脉和半透明边缘
3. **分层开放**：外层花瓣先翻开，内层稍后，约 11 秒缓动
4. **材质**：内层偏实色粉，外层 `transmission` 半透明，逆光打出脉络
5. **光斑**：开放过程中再加一层粒子光点

## 来源

- 页面与音乐资源基于 [mrsuperguo/qixi-particle-rose](https://github.com/mrsuperguo/qixi-particle-rose)
- 缓放牡丹为程序化花瓣实现（Vite + Three.js MeshPhysicalMaterial）
