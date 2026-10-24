import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { build } from "esbuild";
await mkdir("public/ocr/core", { recursive: true });
await mkdir("public/ocr/lang", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const name of await readdir("node_modules/tesseract.js-core")) {
  if (/\.wasm(?:\.js)?$/.test(name))
    await copyFile(
      "node_modules/tesseract.js-core/" + name,
      "public/ocr/core/" + name,
    );
}
await copyFile(
  "node_modules/@tesseract.js-data/fra/4.0.0/fra.traineddata.gz",
  "public/ocr/lang/fra.traineddata.gz",
);
const compatibility = await build({
  stdin: {
    contents:
      "import 'core-js/actual/promise/with-resolvers';import 'core-js/actual/url/parse';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  minify: true,
  platform: "browser",
  format: "iife",
  target: ["safari16.4"],
});
await writeFile(
  "public/pdf.worker.mjs",
  compatibility.outputFiles[0].text +
    "\n" +
    (await readFile(
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      "utf8",
    )),
);
