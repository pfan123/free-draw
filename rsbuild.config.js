// @ts-ignore
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSass } from "@rsbuild/plugin-sass";
import path from "path";

export default defineConfig({
  // 配置模块解析
  resolve: {
    alias: {
      "@constants": path.resolve(__dirname, "src/constants"),
      "@renderer": path.resolve(__dirname, "src/renderer"),
    },
  },
  plugins: [pluginReact(), pluginSass()],
});
