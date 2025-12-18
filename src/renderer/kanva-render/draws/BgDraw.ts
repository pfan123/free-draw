import Konva from "konva";
import { BaseDraw } from "./BaseDraw";
import { StageState } from "../../types";

export interface BgDrawOption {
  size: number;
}

export class BgDraw extends BaseDraw {
  readonly name = "BgDraw";

  option: BgDrawOption;

  constructor(
    layer: Konva.Layer,
    stageState: StageState,
    option: BgDrawOption = { size: 20 }
  ) {
    super(layer, stageState);
    this.option = option;
  }

  override draw() {
    this.clear();

    this.group.add(
      new Konva.Rect({
        name: `${this.constructor.name}__background`,
        x: 0,
        y: 0,
        width: this.stageState.stageWidth,
        height: this.stageState.stageHeight,
        listening: false,
        fill: "gray",
      })
    );

    // 格子大小
    const cellSize = this.option.size;

    // 列数
    const lenX = Math.ceil(this.stageState.stageWidth / cellSize);
    // 行数
    const lenY = Math.ceil(this.stageState.stageHeight / cellSize);

    for (let i = 0; i < lenX; i++) {
      this.group.add(
        new Konva.Line({
          points: [i * cellSize, 0, i * cellSize, this.stageState.stageHeight],
          stroke: "#eee",
          strokeWidth: 1,
        })
      );
    }
    for (let j = 0; j < lenY; j++) {
      this.group.add(
        new Konva.Line({
          points: [0, j * cellSize, this.stageState.stageWidth, j * cellSize],
          stroke: "#eee",
          strokeWidth: 1,
        })
      );
    }
  }
}
