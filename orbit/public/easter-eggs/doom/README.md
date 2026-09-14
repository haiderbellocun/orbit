# DOOM WebAssembly assets

This integration currently uses the compiled artifacts from
`https://github.com/aplumly/DOOM-WASM-EMSDK`.

Install an SDL/Emscripten DOOM port whose output uses the following filenames:

- `doom.js` — Emscripten JavaScript loader
- `doom.wasm` — WebAssembly binary
- `doom.data` — Emscripten preload package
- `/wad/DOOM1.WAD` — packaged inside `doom.data` by this particular build

The selected build exposes an Emscripten `Module`, uses the page's `Module.canvas`, and resolves `doom.wasm` and `doom.data` relative to this directory. Its generated loader manifest identifies the embedded file as `/wad/DOOM1.WAD` with a size of 4,196,020 bytes (DOOM Shareware 1.9).

The parent embeds this page without `allow-same-origin`, so it cannot read the application's DOM or Web Storage. Production Nginx enables CORS only for this directory so Emscripten can fetch its sidecar files from the iframe's opaque sandbox origin.

Do not replace the embedded Shareware IWAD with a commercial registered DOOM IWAD. The upstream port repository does not include an explicit `LICENSE` file as of the reviewed revision, although it derives from id Software's GPL DOOM source. Obtain a clear license/attribution determination before public redistribution. The upstream README also lists sound support as unfinished.
