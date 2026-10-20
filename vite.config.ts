import { execFileSync } from "node:child_process";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite-plus";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { voidPlugin } from "void";

// voidPlugin は独自に dev サーバーを張るため、vitest の中では読み込まない。
const underTest = Boolean(process.env.VITEST);
// SH_CLIENT_ONLY=1 vp dev：API や Cloudflare の binding を使わず、画面だけを出す（/__screens の確認用）。
const clientOnly = Boolean(process.env.SH_CLIENT_ONLY);

/**
 * 画面（client）のビルドが終わったら、紹介のページを言語ごとの HTML に書き出す（scripts/prerender-lp.mjs）。
 * `void deploy --platform cloudflare` は自分で vite build を回すので、package.json の build ではなくここで行う。
 */
const prerenderLp = (): Plugin => ({
  name: "sh-prerender-lp",
  apply: "build",
  closeBundle: {
    sequential: true,
    order: "post",
    handler() {
      if (this.environment?.name !== "client") return;
      execFileSync(process.execPath, ["scripts/prerender-lp.mjs"], { stdio: "inherit" });
    },
  },
});

export default defineConfig({
  plugins: underTest
    ? [react()]
    : [
        ...(clientOnly ? [] : [voidPlugin(), prerenderLp()]),
        tanstackRouter({
          target: "react",
          routesDirectory: "./src/client/routes",
          generatedRouteTree: "./src/client/routeTree.gen.ts",
          autoCodeSplitting: true,
        }),
        react(),
        paraglideVitePlugin({
          project: "./project.inlang",
          outdir: "./src/client/paraglide",
          strategy: ["globalVariable", "baseLocale"],
        }),
      ],
  fmt: {
    printWidth: 100,
    // 生成物と検証用の使い捨てコードは整形しない
    ignorePatterns: [
      "src/client/paraglide/**",
      "src/client/routeTree.gen.ts",
      "poc/**",
      "docs/**",
      ".superpowers/**",
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    // 画面のテスト（happy-dom）で Google Fonts の CSS を取りに行かない
    environmentOptions: {
      happyDOM: {
        settings: { disableCSSFileLoading: true, handleDisabledFileLoadingAsSuccess: true },
      },
    },
  },
});
