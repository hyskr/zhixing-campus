export function previewExtension(name: string, url?: string): string {
  for (const value of [name, url ?? ""]) {
    let path = value.split(/[?#]/, 1)[0];
    try {
      path = decodeURIComponent(path);
    } catch {
      /* 文件名可能本身包含百分号。 */
    }
    const match = path.match(/\.([a-z0-9]{1,8})$/i);
    if (match) return match[1].toLowerCase();
  }
  return "";
}
export function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}
export function validatePreviewBytes(bytes: Uint8Array, format: string): void {
  const beginning = new TextDecoder()
    .decode(bytes.subarray(0, 256))
    .trimStart();
  if (/^(?:<!doctype html|<html|<form)/i.test(beginning) && format !== "html") {
    throw Error("服务器返回了网页，文件可能需要重新登录或链接已失效");
  }
  if (
    ["docx", "pptx"].includes(format) &&
    !isPdf(bytes) &&
    !(bytes[0] === 0x50 && bytes[1] === 0x4b)
  ) {
    throw Error("返回内容不是有效的 Office 文件，请刷新资料链接后重试");
  }
}
