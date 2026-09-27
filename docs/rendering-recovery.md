# Blank-render incident and recovery

## Scope and evidence

The earlier element/byte patch was incorrect: GPUQueue.writeBuffer interprets the optional source offset and size in typed-array elements. The code now submits the complete Float32Array view with no optional size. Behavioral tests cover an offset view, empty uploads, invalid records and capacity overflow rather than searching the source for a particular string.

A separate earlier selector bug dropped coverage when its traversal hit the tile budget. The coverage-preserving selector is retained, and regression tests check complete non-overlapping face coverage under several budgets. Reducing refinement must not remove geography.

The precise cause of any remaining blank image on a particular user's GPU cannot be established from a screenshot alone. During diagnosis, our initial Linux browser harness itself lost the WebGPU device when the compositor was incorrectly configured. The corrected Xvfb/Vulkan harness renders the pre-change engine successfully. That harness failure is not evidence of the user's GPU failing.

## Runtime hardening

- Startup catches module-load failures, failed shader HTTP responses, WGSL compilation errors and pipeline creation failures.
- Device-loss and uncaptured WebGPU validation errors stop the frame loop and display the actual message.
- Online is shown only after the first submission completes, not immediately after obtaining a device.
- Canvas context and depth are initialized even if initial dimensions equal the HTML canvas defaults.
- Projection uses WebGPU reverse-Z: depth32float, clear 0, compare greater; near maps to 1 and infinite distance approaches 0. Tests exercise this contract.
- The initial camera looks directly at the lit hemisphere; R and the reset button restore it.
- The default budget is 1536 tiles to limit load while retaining complete planetary coverage. This is not a performance guarantee.

## Deployment identity

The build copies the entire engine module graph, stylesheet and WGSL files into runtime/<commit>/engine/. The demo references that versioned entry point, and all relative imports remain inside the same version. The HUD shows the first 12 commit characters; build-info.json records the full revision. This avoids relying on a query string on the HTML to refresh nested imports.

## Validation

npm run check runs syntax and behavioral tests. The deployment additionally launches Chromium with WebGPU, captures the real canvas and checks for runtime errors and a visible, non-blank planetary image. Screenshots and diagnostics are retained as Actions artifacts. A compile-only/static build is no longer enough to publish.

Software-Vulkan CI validates rendering behavior, not performance or compatibility on every hardware/driver combination. A remaining failure must be diagnosed using the displayed error and build ID, not another speculative skirt patch.

## References

- https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
- https://webgpufundamentals.org/webgpu/lessons/webgpu-perspective-projection.html
- https://playwright.dev/docs/ci
