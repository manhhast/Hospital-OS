import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { Features, transform as lightningTransform } from 'lightningcss';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const CHROME_109_TARGET = {
  chrome: 109 << 16,
};

function stripGradientColorSpace(css: string): string {
  // Chrome 109 (Windows 7) drops rules using CSS Color 4 interpolation like `to right in oklab`
  return css
    .replace(
      /(--tw-gradient-position\s*:[^;{}]+?)\s+in\s+(?:oklab|oklch|lab|lch|srgb|srgb-linear|hsl|hwb|xyz|xyz-d50|xyz-d65)\b/gi,
      '$1'
    )
    .replace(
      /((?:linear|radial|conic)-gradient\([^()]*?)\s+in\s+(?:oklab|oklch|lab|lch|srgb|srgb-linear|hsl|hwb|xyz|xyz-d50|xyz-d65)\b/gi,
      '$1'
    );
}

function chrome109CssCompat(): Plugin {
  let isBuild = false;
  let shouldMinify = false;

  return {
    name: 'chrome109-css-compat',
    enforce: 'pre',
    configResolved(config) {
      isBuild = config.command === 'build';
      shouldMinify = isBuild && config.build.cssMinify !== false;
    },
    transform(code, id) {
      const cleanId = id.split('?')[0];
      const isCss = cleanId.endsWith('.css') || id.includes('&lang.css');
      if (!isCss) return null;

      const normalized = stripGradientColorSpace(code);
      const result = lightningTransform({
        filename: cleanId,
        code: Buffer.from(normalized),
        minify: shouldMinify,
        targets: CHROME_109_TARGET,
        exclude: Features.LogicalProperties | Features.DirSelector | Features.LightDark,
        errorRecovery: true,
      });

      return {
        code: stripGradientColorSpace(result.code.toString()),
        map: null,
      };
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), chrome109CssCompat()],
    build: {
      target: 'chrome109',
      cssTarget: 'chrome109',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
