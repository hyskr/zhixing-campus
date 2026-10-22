import { expect, it } from "vitest";
import { isPdf, previewExtension, validatePreviewBytes } from "./fileFormats";
const encode = (text: string) => new TextEncoder().encode(text);
it("附件标题缺少后缀时，从实际链接识别 Office 格式", () => {
  expect(
    previewExtension("课程讲义", "https://school.example/a%20b.PPTX?ticket=1"),
  ).toBe("pptx");
  expect(
    previewExtension("实验报告.DOCX", "https://school.example/download?id=2"),
  ).toBe("docx");
});
it("Office 文件的 PDF 转换版按内容识别，不交给 Office 解析器", () => {
  const pdf = encode("%PDF-1.7");
  expect(isPdf(pdf)).toBe(true);
  expect(() => validatePreviewBytes(pdf, "pptx")).not.toThrow();
});
it("文件链接返回登录网页时报告链接或会话问题", () => {
  expect(() =>
    validatePreviewBytes(encode("<!DOCTYPE html><html>登录</html>"), "docx"),
  ).toThrow("服务器返回了网页");
  expect(() => validatePreviewBytes(encode("error"), "pptx")).toThrow(
    "不是有效的 Office 文件",
  );
  expect(() =>
    validatePreviewBytes(new Uint8Array([0x50, 0x4b, 3, 4]), "pptx"),
  ).not.toThrow();
});
