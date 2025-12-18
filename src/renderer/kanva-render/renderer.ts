import Konva from "konva";
import { BgDraw } from "./draws";
import { RenderConfig } from "../types";

// 渲染器
export class Renderer {
  // 调试模式
  private _debug = false;
  // Konva舞台
  stage: Konva.Stage;

  // 配置
  config: RenderConfig;

  // 主要层 - 内容
  private layer: Konva.Layer = new Konva.Layer({ id: "main" });
  // 辅助层 - 背景网格
  private layerFloor: Konva.Layer = new Konva.Layer();
  // 辅助层 - 连接线、对齐线
  private layerCover: Konva.Layer = new Konva.Layer({ id: "cover" });

  // 辅助工具 - 网格背景、标尺等
  drawTools: any = {};

  // 参数
  bgSize = 20;
  rulerSize = 0;

  constructor(stageElement: HTMLDivElement, config: RenderConfig) {
    this.config = config;

    if (this.config.showRuler) {
      this.rulerSize = 40;
    }

    this.stage = new Konva.Stage({
      container: stageElement,
      x: this.rulerSize,
      y: this.rulerSize,
      width: config.width,
      height: config.height,
    });

    console.error("renderer config", this.stage.scale());

    this.drawTools[BgDraw.name] = new BgDraw(this.layerFloor, this.stageState);

    this.init();
  }

  // 初始化
  init() {
    this.stage.add(this.layerFloor);
    this.stage.add(this.layer);
    this.stage.add(this.layerCover);

    // 绘制背景网格
    this.drawTools[BgDraw.name].init();

    const rect = new Konva.Rect({
      name: `${this.constructor.name}__background`,
      x: 100,
      y: 200,
      width: 100,
      height: 100,
      fill: "red",
      draggable: true,
    });
    rect.on("mousedown", () => {
      // rect.destroy();
      rect.fill("blue");
      this.layer.add(rect);
    });
    this.layer.add(rect);
  }

  // 获取 stage 状态
  get stageState() {
    return {
      stageWidth: this.stage.width(),
      stageHeight: this.stage.height(),
      rulerSize: this.rulerSize,
      width: this.stage.width() - this.rulerSize,
      height: this.stage.height() - this.rulerSize,
      scale: this.stage.scaleX(),
      x: this.stage.x(),
      y: this.stage.y(),
    };
  }

  dispose() {
    this.stage.destroy();
  }
}
