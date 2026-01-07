import React, { useEffect, useState, useRef } from "react";
import { InfiniteKonvaCanvas } from "@renderer/kanva-render/InfiniteKonva/canvas/InfiniteKonvaCanvas";

import styles from "./index.module.scss";

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<InfiniteKonvaCanvas | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. 创建画布实例
    const canvasInstance = new InfiniteKonvaCanvas({
      container: containerRef.current!,
      grid: { enabled: true, size: 10 },
      performance: { targetFPS: 60 },
    });

    canvasInstance.addObject({
      id: "test1",
      type: "rectangle",
      position: { x: 400, y: 400 },
      size: { x: 200, y: 150 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      zIndex: 0,
      style: {
        fill: "#af6a4cff",
        stroke: { color: "#2E7D32", width: 2 },
      },
      properties: { cornerRadius: 10 },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: "system",
        version: 1,
        visible: true,
        locked: false,
      },
    });

    // 4. 设置状态
    setCanvas(canvasInstance);

    return () => {
      // canvasInstance.destroy();
    };
  }, []);

  return (
    <div className={styles.container}>
      {/* 主菜单 */}
      <header className="app-header">
        <div className="app-title"> kanva 无限画布编辑器</div>
        <div className="app-menu">{/* 文件、编辑、视图等菜单 */}</div>
      </header>

      <div ref={containerRef} className={styles["canvas-container"]} />
    </div>
  );
};
export default App;
