// 与学校 sm-crypto 一致：C1C3C2、不带 04 密文前缀、整体 base64。
// https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/cc23379ce76396944199220557790fd1f6ce7993/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SsoSm2.kt
export async function encryptSsoPassword(
  password: string,
  publicKey: string,
): Promise<string> {
  if (!publicKey) return password;
  const key = Array.from(atob(publicKey), (ch) =>
    ch.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
  const { SM2 } = await import("gm-crypto");
  return SM2.encrypt(password, key, {
    mode: SM2.constants.C1C3C2,
    inputEncoding: "utf8",
    outputEncoding: "base64",
  });
}
