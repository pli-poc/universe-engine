/** For TypedArrays the optional writeBuffer size is in elements. Omit it. */
export function uploadInstances(queue,buffer,instances,capacity,stride=8){
  if(!Number.isInteger(stride)||stride<1||!(instances instanceof Float32Array)||instances.length%stride)throw new TypeError('Invalid tile instance record layout');
  const count=instances.length/stride;if(count>capacity)throw new RangeError('Tile count exceeds GPU capacity');
  if(!instances.every(Number.isFinite))throw new Error('Non-finite tile metadata');
  if(count)queue.writeBuffer(buffer,0,instances);return count;
}
