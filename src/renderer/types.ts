export interface RenderConfig {
  width: number;
  height: number;
  //
  showBg?: boolean;
  showRuler?: boolean;
  showRefLine?: boolean;
  showPreview?: boolean;
  showContextmenu?: boolean;
  //
  attractResize?: boolean;
  attractBg?: boolean;
  attractNode?: boolean;
  //
  readonly?: boolean;
}

export interface StageState {
  stageWidth: number;
  stageHeight: number;
  rulerSize: number;
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
}
