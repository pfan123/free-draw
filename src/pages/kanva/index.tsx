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
      // config: {
      //   grid: { enabled: true, size: 50 },
      //   snapToGrid: true,
      //   performance: { targetFPS: 60 },
      // },
    });

    // 4. 设置状态
    setCanvas(canvasInstance);

    return () => {
      // renderer.dispose();
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
