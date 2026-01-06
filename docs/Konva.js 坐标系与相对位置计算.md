# Konva.js 坐标系与相对位置计算

你想理解 Konva.js 中的坐标系和相对位置计算，这是掌握 Konva 图形定位、交互的核心——Konva 的坐标体系看似复杂，但核心是「层级坐标系」+「相对偏移」，我们从基础概念到实战计算一步步拆解。

## 一、Konva 坐标系的核心基础：画布的「绝对坐标系」

Konva 的所有图形定位，首先基于最底层的 `Konva.Stage`（舞台）建立的**绝对坐标系**，这是所有计算的「根基准」。

### 1. 绝对坐标系的规则

- **原点**：Stage 的**左上角**是整个坐标系的原点 `(0, 0)`。
- **X 轴**：水平向右为正方向（数值增大），向左为负方向。
- **Y 轴**：垂直向下为正方向（数值增大），向上为负方向（和数学中的笛卡尔坐标系 Y 轴方向相反，这是前端 Canvas/SVG 的通用规则）。
- **单位**：默认是「像素 (px)」，和浏览器视口像素对应。

### 2. 核心容器的坐标关系

Konva 的容器是「Stage → Layer → Group → Shape」层级结构，**每一层容器都会继承/叠加上层的坐标系**：
| 容器 | 作用 | 坐标特性 |
|------------|----------------------------------------------------------------------|--------------------------------------------------------------------------|
| Stage | 根容器，对应整个画布区域 | 绝对坐标系的基准，`x/y` 通常为 0（除非手动偏移），尺寸决定画布整体大小 |
| Layer | 舞台下的图层（基于 Canvas 渲染） | 继承 Stage 坐标系，默认和 Stage 坐标重合，可通过 `x/y` 偏移整个图层 |
| Group | 图形分组容器（用于批量控制多个 Shape） | 基于父容器（Layer/Group）建立「局部坐标系」，是相对位置计算的核心 |
| Shape | 具体图形（矩形、圆形、文本等） | 基于父容器（Group/Layer）的局部坐标系定位 |

### 可视化示例：绝对坐标系

```javascript
// 1. 创建舞台（绝对坐标系根）
const stage = new Konva.Stage({
  container: "container", // 挂载到 DOM 元素
  width: 400,
  height: 300,
  // Stage 的 x/y 默认 0，原点在左上角 (0,0)
});

// 2. 创建图层（继承 Stage 坐标系）
const layer = new Konva.Layer();
stage.add(layer);

// 3. 绘制坐标系参考线（验证原点和方向）
layer.add(
  new Konva.Line({
    points: [0, 0, 400, 0], // X 轴：从 (0,0) 到 (400,0)
    stroke: "red",
    strokeWidth: 2,
  })
);
layer.add(
  new Konva.Line({
    points: [0, 0, 0, 300], // Y 轴：从 (0,0) 到 (0,300)
    stroke: "green",
    strokeWidth: 2,
  })
);

// 4. 绘制一个矩形，验证坐标方向
layer.add(
  new Konva.Rect({
    x: 50, // 距离父容器（Layer）左边界 50px
    y: 50, // 距离父容器（Layer）上边界 50px
    width: 100,
    height: 80,
    fill: "blue",
    opacity: 0.5,
  })
);

layer.draw();
```

**效果说明**：

- 红色横线是 X 轴，绿色竖线是 Y 轴，交点 (0,0) 在舞台左上角。
- 蓝色矩形的左上角坐标是 (50,50)，正好在 X 轴向右 50px、Y 轴向下 50px 的位置。

## 二、相对位置计算：核心是「局部坐标系」转「绝对坐标系」

实际开发中，你常需要：

- 知道某个图形的「绝对坐标」（相对于 Stage）；
- 知道鼠标点击位置对应的「图形局部坐标」；
- 计算两个图形的相对位置。

Konva 提供了 **4 个核心方法** 解决坐标转换，是所有计算的关键：

| 方法                           | 作用                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `getAbsolutePosition()`        | 获取图形/容器的「绝对坐标」（相对于 Stage 原点）                     |
| `getRelativePointerPosition()` | 获取鼠标指针相对于**当前节点**的局部坐标（最常用，比如 Group/Shape） |
| `stage.getPointerPosition()`   | 获取鼠标指针相对于 Stage 的绝对坐标                                  |
| `node.toGlobal({x,y})`         | 将节点的局部坐标转换为 Stage 绝对坐标                                |
| `node.toLocal({x,y})`          | 将 Stage 绝对坐标转换为节点的局部坐标                                |

### 实战场景 1：Group 局部坐标系与绝对坐标计算

Group 是「局部坐标系」的核心——Group 的 `x/y` 是它相对于父容器的偏移，Group 内部的所有 Shape 都基于 Group 的左上角（Group 局部坐标系的 (0,0)）定位。

```javascript
// 1. 创建舞台和图层
const stage = new Konva.Stage({
  container: "container",
  width: 400,
  height: 300,
});
const layer = new Konva.Layer();
stage.add(layer);

// 2. 创建 Group（相对于 Layer 偏移 x: 100, y: 80）
const group = new Konva.Group({
  x: 100, // Group 左上角相对于 Layer 的 X 偏移
  y: 80, // Group 左上角相对于 Layer 的 Y 偏移
});
layer.add(group);

// 3. 在 Group 内创建矩形（基于 Group 局部坐标系）
const rect = new Konva.Rect({
  x: 20, // 相对于 Group 左上角的 X 偏移
  y: 20, // 相对于 Group 左上角的 Y 偏移
  width: 80,
  height: 60,
  fill: "orange",
});
group.add(rect);

layer.draw();

// 4. 计算坐标：
console.log("Group 绝对坐标：", group.getAbsolutePosition());
// 输出：{x: 100, y: 80}（和 Group 的 x/y 一致，因为父容器是 Layer，Layer 无偏移）

console.log("矩形绝对坐标：", rect.getAbsolutePosition());
// 输出：{x: 120, y: 100}（100+20, 80+20）

// 5. 手动验证：局部坐标转绝对坐标
const rectLocalPos = { x: 20, y: 20 };
const rectGlobalPos = rect.toGlobal(rectLocalPos);
console.log("手动转换的绝对坐标：", rectGlobalPos);
// 输出：{x: 120, y: 100}（和 getAbsolutePosition 结果一致）
```

### 实战场景 2：鼠标交互的相对位置计算

开发中最常见的需求：点击图形时，获取鼠标在该图形内的相对位置（比如拖拽、绘制辅助线）。

```javascript
// 1. 基础舞台/图层/图形
const stage = new Konva.Stage({
  container: "container",
  width: 400,
  height: 300,
});
const layer = new Konva.Layer();
stage.add(layer);

const rect = new Konva.Rect({
  x: 50,
  y: 50,
  width: 200,
  height: 150,
  fill: "purple",
  opacity: 0.6,
});
layer.add(rect);
layer.draw();

// 2. 监听矩形的点击事件，计算鼠标相对位置
rect.on("click", function (e) {
  // 方法1：获取鼠标相对于 Stage 的绝对坐标
  const stagePos = stage.getPointerPosition();
  console.log("鼠标绝对坐标（Stage）：", stagePos);

  // 方法2：获取鼠标相对于当前矩形的局部坐标（最实用）
  const localPos = this.getRelativePointerPosition();
  console.log("鼠标相对矩形的坐标：", localPos);

  // 方法3：手动转换（绝对坐标 → 局部坐标）
  const manualLocalPos = this.toLocal(stagePos);
  console.log("手动转换的局部坐标：", manualLocalPos);
});
```

**效果说明**：

- 点击矩形的左上角（矩形自身的 (0,0) 位置），局部坐标输出 `{x:0, y:0}`；
- 点击矩形的中心，局部坐标输出 `{x:100, y:75}`；
- 无论 Stage/Layer 是否有偏移，`getRelativePointerPosition()` 都会直接返回相对于当前图形的坐标。

### 实战场景 3：嵌套 Group 的坐标计算

当 Group 嵌套时，坐标会逐层叠加，核心是「从内到外累加偏移」：

```javascript
const stage = new Konva.Stage({
  container: "container",
  width: 400,
  height: 300,
});
const layer = new Konva.Layer();
stage.add(layer);

// 外层 Group（相对于 Layer：x=50, y=50）
const outerGroup = new Konva.Group({ x: 50, y: 50 });
layer.add(outerGroup);

// 内层 Group（相对于 outerGroup：x=30, y=30）
const innerGroup = new Konva.Group({ x: 30, y: 30 });
outerGroup.add(innerGroup);

// 内层图形（相对于 innerGroup：x=10, y=10）
const circle = new Konva.Circle({
  x: 10,
  y: 10,
  radius: 20,
  fill: "pink",
});
innerGroup.add(circle);

layer.draw();

// 计算最终绝对坐标：50+30+10=90, 50+30+10=90
console.log("圆形绝对坐标：", circle.getAbsolutePosition());
// 输出：{x:90, y:90}
```

## 三、常见坑与避坑技巧

1. **混淆「图形锚点」和「坐标原点」**：
   Konva 图形默认以**左上角**为锚点（`offsetX:0, offsetY:0`），若修改 `offsetX/offsetY`（比如设置为图形中心），会改变局部坐标系的原点：

   ```javascript
   const rect = new Konva.Rect({
     x: 100,
     y: 100,
     width: 80,
     height: 80,
     offsetX: 40,
     offsetY: 40, // 锚点设为中心
     fill: "gray",
   });
   console.log(rect.getAbsolutePosition()); // 输出 {x:100, y:100}（锚点位置）
   // 此时图形的左上角绝对坐标是 (60,60)，中心是 (100,100)
   ```

2. **缩放/旋转对坐标的影响**：
   若容器（Group/Layer）设置了 `scaleX/scaleY` 或 `rotation`，坐标转换会自动适配缩放/旋转后的坐标系，无需手动计算（Konva 内部已处理）。

3. **Layer 偏移的影响**：
   Layer 的 `x/y` 会影响所有子元素的绝对坐标，比如 Layer 设置 `x:20, y:20`，则所有子元素的绝对坐标都会 +20。

## 四、核心公式（快速计算）

1. **图形绝对坐标 = 父容器绝对坐标 + 图形局部坐标**；
2. **嵌套容器绝对坐标 = 外层容器绝对坐标 + 内层容器局部坐标**；
3. **鼠标局部坐标 = 图形.toLocal(舞台绝对坐标)**；
4. **鼠标绝对坐标 = 图形.toGlobal(图形局部坐标)**。

### 总结

1. Konva 的坐标系以 Stage 左上角为绝对原点 (0,0)，X 右正、Y 下正，所有容器/图形的坐标都基于层级叠加；
2. Group 是「局部坐标系」的核心，内部图形的坐标相对于 Group 左上角，`getAbsolutePosition()` 可直接获取图形的绝对坐标；
3. 坐标转换的核心方法：`getRelativePointerPosition()`（鼠标相对当前节点）、`toGlobal()`（局部 → 绝对）、`toLocal()`（绝对 → 局部）；
4. 偏移（x/y）、锚点（offsetX/offsetY）、缩放/旋转都会影响坐标，但 Konva 提供的方法已自动处理这些变化，优先使用官方方法而非手动计算。
