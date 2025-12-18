import Konva from "konva";
import { StageState } from "../../types";

export class BaseDraw {
  readonly layer: Konva.Layer;
  protected stageState: StageState;
  protected group: Konva.Group;

  constructor(layer: Konva.Layer, stageState: StageState) {
    this.layer = layer;
    this.stageState = stageState;

    this.group = new Konva.Group();
  }

  init() {
    this.layer.add(this.group);
    this.draw();
  }

  draw() {}

  clear() {
    this.group.destroy();

    const name = this.group.name();
    this.group = new Konva.Group({ name });
    this.layer.add(this.group);
  }
}
