// @ts-check
import { defineConfig } from 'astro/config';

// No integrations yet: the board is vanilla TypeScript, so Astro ships the page
// with one small client script and no framework runtime.
export default defineConfig({
  vite: {
    server: {
      // In development the page reports Session Games to a local copy of the
      // service, started with python -m pipeline.serve_session_games. On the
      // VPS the web server does this forwarding.
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
    resolve: {
      alias: [
        // The browser gets ONNX Runtime's WebAssembly-only build. The default
        // build also carries WebGPU support, which doubles the runtime the
        // visitor downloads (28 MB against 14 MB before compression) for a
        // backend the Bot does not use. Node, where the tests run, keeps the
        // default, since the WebAssembly-only build does not load there.
        { find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' },
      ],
    },
  },
});
