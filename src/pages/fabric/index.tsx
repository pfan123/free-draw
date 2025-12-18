import React, { useEffect, useRef } from "react";
import { Renderer } from "@renderer/fabric-render";

import styles from "./index.module.scss";

const App = () => {
  const stageElement = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!stageElement.current) return;

    const renderer = new Renderer(stageElement.current, {
      width: 800,
      height: 600,
    });

    return () => {
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.container}>
      <h1>Rsbuild with React and Fabric.js</h1>
      <canvas ref={stageElement} />
    </div>
  );
};
export default App;
