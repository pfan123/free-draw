import * as fabric from "fabric";

import { RenderConfig } from "../types";

// 渲染器
export class Renderer {
  stage: fabric.Canvas;

  constructor(stageElement: HTMLCanvasElement, config: RenderConfig) {
    this.stage = new fabric.Canvas(stageElement, {
      width: config.width,
      height: config.height,
    });

    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      fill: "red",
      width: 20,
      height: 20,
      angle: 45,
    });

    this.stage.add(rect);
  }

  dispose() {
    this.stage.dispose();
  }
}
