import { expect, it } from "vitest";
import { SM2 } from "gm-crypto";
import { encryptSsoPassword } from "./ssoCrypto";
// 学校 sm-crypto 生成的公开测试夹具，非真实账号凭据。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/cc23379ce76396944199220557790fd1f6ce7993/multiplatform/shared/src/commonTest/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SsoSm2Test.kt
const publicKey =
  "BCNfHMe8JNA+F0xYeDk+8jpQX/u7gIRDbmOvxyzq5cUyaEGp88qjQT78wi2lAzmdPM6OVMEwDiqrRWqeeO+789s=";
const privateKey = Buffer.from(
  "xvTitqraFE8IaR0A1mRBX7OD024adxJl3Z6tn7UGSlI=",
  "base64",
).toString("hex");
const cipher =
  "UIEP+/t+eev0UNqTlUNIFZzUsaqjQaWmNg7WNOVByPF2hzrndStvuEfJcFqvcv4T8E8AKLVcvt9n6tYkjPrw0kvbNI8rtpRtVfKVv8OUhOPSb0Viq61tu82u2xeJXT1QqnwnhCgIiaF/ThHqUsS2Tsnsg9rn";
it("能解密学校 sm-crypto 的独立夹具", () => {
  expect(
    SM2.decrypt(cipher, privateKey, {
      mode: SM2.constants.C1C3C2,
      inputEncoding: "base64",
      outputEncoding: "utf8",
    }),
  ).toBe("fixture-Password_123!");
});
it("登录密文使用无前缀 C1C3C2 和 base64", async () => {
  const value = await encryptSsoPassword("fixture-Password_123!", publicKey);
  expect(Buffer.from(value, "base64")).toHaveLength(
    96 + Buffer.byteLength("fixture-Password_123!"),
  );
  expect(
    SM2.decrypt(value, privateKey, {
      mode: SM2.constants.C1C3C2,
      inputEncoding: "base64",
      outputEncoding: "utf8",
    }),
  ).toBe("fixture-Password_123!");
});
