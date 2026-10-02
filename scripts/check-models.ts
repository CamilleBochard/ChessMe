// Loads every converted model in models/onnx with onnxruntime-web, the runtime
// the visitor's browser uses, and runs it once on an all-zero input.
//
//     npm run check-models
//
// The Python side already proves a conversion is numerically right. This
// proves the file can be read by the WebAssembly build of ONNX Runtime: its
// format version, its operators and its input types. The input is meaningless,
// since the point is only that the model runs and what shapes come out.
//
// It is a script, not a test: the models are not in the repository, so a test
// would fail on a fresh checkout.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';

const ONNX_DIR = 'models/onnx';

/** A symbolic dimension such as "batch" is given the size of one position. */
function concreteShape(shape: ReadonlyArray<number | string>): number[] {
  return shape.map((dimension) => {
    if (typeof dimension === 'number') {
      return dimension;
    }
    return 1;
  });
}

function zeroTensor(type: string, shape: number[]): ort.Tensor {
  const elementCount = shape.reduce((product, dimension) => product * dimension, 1);
  if (type === 'float32') {
    return new ort.Tensor('float32', new Float32Array(elementCount), shape);
  }
  if (type === 'int64') {
    return new ort.Tensor('int64', new BigInt64Array(elementCount), shape);
  }
  if (type === 'int32') {
    return new ort.Tensor('int32', new Int32Array(elementCount), shape);
  }
  if (type === 'bool') {
    return new ort.Tensor('bool', new Uint8Array(elementCount), shape);
  }
  throw new Error(`No zero input written for tensors of type ${type}`);
}

async function checkModel(path: string): Promise<void> {
  const bytes = await readFile(path);
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });

  const feeds: Record<string, ort.Tensor> = {};
  for (const input of session.inputMetadata) {
    if (!input.isTensor) {
      throw new Error(`${path}: input ${input.name} is not a tensor`);
    }
    const shape = concreteShape(input.shape);
    feeds[input.name] = zeroTensor(input.type, shape);
    console.log(`  in   ${input.name}: ${input.type} [${input.shape.join(', ')}]`);
  }

  const outputs = await session.run(feeds);
  for (const [name, tensor] of Object.entries(outputs)) {
    console.log(`  out  ${name}: ${tensor.type} [${tensor.dims.join(', ')}]`);
  }
  await session.release();
}

const modelFiles = (await readdir(ONNX_DIR)).filter((name) => name.endsWith('.onnx')).sort();
if (modelFiles.length === 0) {
  throw new Error(`No .onnx file in ${ONNX_DIR}; convert the candidates first`);
}

for (const fileName of modelFiles) {
  console.log(fileName);
  await checkModel(join(ONNX_DIR, fileName));
}
console.log(`onnxruntime-web ${ort.env.versions.web} ran all ${modelFiles.length} models`);
