/** TypedArray writeBuffer sizes are elements, not bytes. Omit optional size. */
export function uploadInstances(queue, buffer, instances, capacity) {
  if (!(instances instanceof Float32Array) || instances.length % 8 !== 0) throw new TypeError('Tile instances must be a Float32Array of 8-float records');
  const count = instances.length / 8;
  if (count > capacity) throw new RangeError('Tile count exceeds GPU capacity');
  if (!instances.every(Number.isFinite)) throw new Error('Non-finite tile metadata');
  if (count) queue.writeBuffer(buffer, 0, instances);
  return count;
}
