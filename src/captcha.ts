// 参考来源：模型和字符表直接来自 bjtu-captcha-ocr；输入高度、灰度归一化参考其训练配置，WASM 推理与算式计算由本项目实现。
// https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/projects/omis/config.yaml
// https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/projects/omis/models/charsets.json
// https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/utils/load_cache.py
import type { InferenceSession } from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
let session: Promise<InferenceSession> | undefined;
const charset = [
  " ",
  "9",
  "5",
  "-",
  "7",
  "0",
  "2",
  "6",
  "1",
  "3",
  "x",
  "8",
  "=",
  "4",
  "+",
];

export async function solveCaptcha(
  base64: string,
): Promise<{ expression: string; answer: string }> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
  ort.env.wasm.numThreads = 1;
  session ??= ort.InferenceSession.create("/models/bjtu-omis.onnx", {
    executionProviders: ["wasm"],
  });
  const model = await session;
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const height = 64,
    width = Math.floor((image.width * height) / image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const input = new Float32Array(width * height);
  for (let i = 0; i < input.length; i++)
    input[i] =
      ((0.299 * pixels[i * 4] +
        0.587 * pixels[i * 4 + 1] +
        0.114 * pixels[i * 4 + 2]) /
        255 -
        0.456) /
      0.224;
  const output = await model.run({
    [model.inputNames[0]]: new ort.Tensor("float32", input, [
      1,
      1,
      height,
      width,
    ]),
  });
  const indices = Array.from(
    output[model.outputNames[0]].data as BigInt64Array,
    Number,
  );
  let last = -1,
    expression = "";
  for (const index of indices) {
    if (index !== last && index !== 0) expression += charset[index] ?? "";
    last = index;
  }
  const match = expression.match(/(\d+)\s*([+x×*−-])\s*(\d+)/);
  if (!match)
    throw new Error(
      `无法识别验证码算式${expression ? `：${expression}` : ""}，请手动填写结果`,
    );
  const a = Number(match[1]),
    b = Number(match[3]);
  return {
    expression,
    answer: String(
      match[2] === "+"
        ? a + b
        : match[2] === "-" || match[2] === "−"
          ? a - b
          : a * b,
    ),
  };
}
