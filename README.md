## UI 层的核心设计原则

1. 分层架构

- UI 组件层：纯 React 组件，不包含业务逻辑

- UI 状态层：管理 UI 状态和用户交互

- 工具层：实现具体的画布交互逻辑

- 集成层：连接 UI 和画布核心

2. 单向数据流

```
用户交互 → UI组件 → UI Store → 画布控制器 → 渲染层
```

## 无限画布 UI 层架构设计

```
应用层 (Application Layer)
├── UI 层 (UI Layer) ← 这一层我们要设计
│   ├── Toolbar (工具栏)
│   ├── Sidebar (侧边栏)
│   ├── ContextMenu (右键菜单)
│   ├── Modal/Dialog (模态框)
│   └── StatusBar (状态栏)
│
├── 画布控制器层 (Canvas Controller Layer)
│   ├── InfiniteKonvaCanvas (主控制器)
│   └── CanvasStateManager (状态管理)
│
├── 渲染层 (Rendering Layer)
│   ├── GridSystem
│   ├── ObjectRenderer
│   └── ChunkedCanvas
│
└── 基础设施层 (Infrastructure Layer)
    ├── 事件系统
    ├── 数据源
    └── 工具函数
```

## UI 层详细目录结构

```
src/
├── ui/                          # UI 层根目录
│   ├── components/              # 通用UI组件
│   │   ├── base/
│   │   │   ├── Button.tsx
│   │   │   ├── IconButton.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Dropdown.tsx
│   │   │   └── ColorPicker.tsx
│   │   ├── layout/
│   │   │   ├── Toolbar.tsx      # 顶部工具栏
│   │   │   ├── Sidebar.tsx      # 侧边栏
│   │   │   ├── Panel.tsx        # 可折叠面板
│   │   │   └── StatusBar.tsx    # 状态栏
│   │   └── canvas/
│   │       ├── ContextMenu.tsx  # 画布右键菜单
│   │       ├── SelectionBox.tsx # 选择框
│   │       ├── Ruler.tsx        # 标尺
│   │       ├── Minimap.tsx      # 迷你地图
│   │       ├── ZoomControls.tsx # 缩放控制
│   │       └── GridControls.tsx # 网格控制
│   │
│   ├── tools/                   # 工具系统
│   │   ├── base/
│   │   │   ├── Tool.ts          # 工具基类
│   │   │   └── ToolManager.ts   # 工具管理器
│   │   ├── selection/
│   │   │   ├── SelectionTool.ts
│   │   │   └── LassoSelectionTool.ts
│   │   ├── drawing/
│   │   │   ├── PenTool.ts
│   │   │   ├── RectangleTool.ts
│   │   │   ├── EllipseTool.ts
│   │   │   ├── LineTool.ts
│   │   │   └── TextTool.ts
│   │   ├── editing/
│   │   │   ├── MoveTool.ts
│   │   │   ├── ResizeTool.ts
│   │   │   ├── RotateTool.ts
│   │   │   └── EditTool.ts
│   │   └── utils/
│   │       ├── MeasurementTool.ts
│   │       └── ZoomTool.ts
│   │
│   ├── panels/                  # 功能面板
│   │   ├── layers/
│   │   │   ├── LayersPanel.tsx
│   │   │   └── LayerItem.tsx
│   │   ├── properties/
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── ColorProperty.tsx
│   │   │   └── SizeProperty.tsx
│   │   ├── assets/
│   │   │   ├── AssetsPanel.tsx
│   │   │   ├── AssetLibrary.tsx
│   │   │   └── AssetItem.tsx
│   │   └── history/
│   │       ├── HistoryPanel.tsx
│   │       └── HistoryItem.tsx
│   │
│   ├── menus/                   # 菜单系统
│   │   ├── MainMenu.tsx
│   │   ├── FileMenu.tsx
│   │   ├── EditMenu.tsx
│   │   ├── ViewMenu.tsx
│   │   └── HelpMenu.tsx
│   │
│   ├── dialogs/                 # 对话框
│   │   ├── ExportDialog.tsx
│   │   ├── ImportDialog.tsx
│   │   ├── SettingsDialog.tsx
│   │   ├── AboutDialog.tsx
│   │   └── ConfirmationDialog.tsx
│   │
│   ├── overlays/               # 画布覆盖层UI
│   │   ├── SelectionOverlay.tsx
│   │   ├── GuideLines.tsx
│   │   ├── Measurements.tsx
│   │   └── Annotations.tsx
│   │
│   ├── hooks/                  # React Hooks
│   │   ├── useCanvas.ts
│   │   ├── useTool.ts
│   │   ├── useSelection.ts
│   │   ├── useKeyboard.ts
│   │   └── useViewport.ts
│   │
│   ├── styles/                 # 样式文件
│   │   ├── theme.ts           # 主题定义
│   │   ├── variables.css      # CSS变量
│   │   ├── components.css     # 组件样式
│   │   └── layout.css         # 布局样式
│   │
│   ├── stores/                # UI状态管理
│   │   ├── ui.store.ts       # UI全局状态
│   │   ├── tool.store.ts     # 工具状态
│   │   ├── panel.store.ts    # 面板状态
│   │   └── theme.store.ts    # 主题状态
│   │
│   └── index.ts               # UI层入口
│
├── canvas/                    # 画布层（控制器）
├── render/                   # 渲染层
├── data/                    # 数据层
└── utils/                   # 工具层
```
