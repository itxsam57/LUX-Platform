import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimeVersions } from "./check-runtime-dependencies.mjs";

test("accepts the security-patched Sharp runtime version", () => {
  assert.doesNotThrow(() =>
    validateRuntimeVersions({
      nanoidVersion: "3.3.18",
      postcssVersion: "8.5.23",
      sourceMapJsVersion: "1.2.2",
      sharpVersion: "0.35.5",
    }),
  );
});

test("rejects unsupported Sharp runtime drift", () => {
  assert.throws(
    () =>
      validateRuntimeVersions({
        nanoidVersion: "3.3.18",
        postcssVersion: "8.5.23",
        sourceMapJsVersion: "1.2.2",
        sharpVersion: "0.35.4",
      }),
    /Expected Next\.js to resolve sharp 0\.35\.5, received 0\.35\.4\./,
  );
});

test("rejects vulnerable source-map-js runtime drift", () => {
  assert.throws(
    () =>
      validateRuntimeVersions({
        nanoidVersion: "3.3.18",
        postcssVersion: "8.5.23",
        sourceMapJsVersion: "1.2.1",
        sharpVersion: "0.35.5",
      }),
    /Expected PostCSS to resolve source-map-js 1\.2\.2, received 1\.2\.1\./,
  );
});
