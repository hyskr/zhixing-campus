import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/motion/button";
import { Input } from "@/components/motion/input";
import { Loader } from "@/components/motion/loader";
import { useErrorState } from "./ui";
// 参考课件页的 PDF.js 阅读器；目录与文本搜索通过 PDF.js API 实现。
// https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/pages/courseware/CoursewarePage.vue
export default function PdfNavigation({
  doc,
  onNavigate,
}: {
  doc: PDFDocumentProxy | null;
  onNavigate: (page: number) => void;
}) {
  const [outline, setOutline] = useState<
    { title: string; dest: unknown; depth: number }[]
  >([]);
  const [mode, setMode] = useState<"outline" | "search" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { page: number; text: string }[] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [, setError] = useErrorState();
  useEffect(() => {
    let active = true;
    if (doc)
      void doc
        .getOutline()
        .then((items) => {
          const rows: typeof outline = [];
          function walk(nodes: NonNullable<typeof items>, depth: number) {
            for (const node of nodes) {
              rows.push({ title: node.title, dest: node.dest, depth });
              walk(node.items, depth + 1);
            }
          }
          walk(items ?? [], 0);
          if (active) setOutline(rows);
        })
        .catch((error) => {
          if (active) setError(String(error));
        });
    return () => {
      active = false;
    };
  }, [doc]);
  async function jump(dest: unknown) {
    if (!doc) return;
    try {
      const target =
        typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(target) || target[0] == null) return;
      onNavigate(
        typeof target[0] === "number"
          ? target[0] + 1
          : (await doc.getPageIndex(target[0])) + 1,
      );
    } catch (error) {
      setError(String(error));
    }
  }
  async function search() {
    if (!doc || !query.trim() || busy) return;
    setBusy(true);
    setResults(null);
    try {
      const found = [];
      const needle = query.trim().toLocaleLowerCase();
      for (let page = 1; page <= doc.numPages; page++) {
        // ReadableStream readers work on Android WebViews without async stream iteration.
        const reader = (await doc.getPage(page))
          .streamTextContent()
          .getReader();
        const chunks: string[] = [];
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(
              ...value.items.map((item: { str?: string }) => item.str ?? ""),
            );
          }
        } finally {
          reader.releaseLock();
        }
        const text = chunks.join(" ");
        const at = text.toLocaleLowerCase().indexOf(needle);
        if (at >= 0)
          found.push({
            page,
            text: text.slice(Math.max(0, at - 28), at + needle.length + 72),
          });
      }
      setResults(found);
      if (found.length) onNavigate(found[0].page);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pdf-navigation">
      <div className="pdf-navigation-actions">
        <Button
          size="sm"
          variant="ghost"
          disabled={!doc}
          onClick={() => setMode(mode === "outline" ? null : "outline")}
        >
          文档目录{outline.length ? ` · ${outline.length}` : ""}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!doc}
          onClick={() => setMode(mode === "search" ? null : "search")}
        >
          搜索文字
        </Button>
      </div>
      {mode === "outline" && (
        <div className="pdf-navigation-panel">
          {outline.length ? (
            outline.map((item, i) => (
              <button
                key={i}
                style={{ paddingLeft: 12 + item.depth * 16 }}
                onClick={() => void jump(item.dest)}
              >
                {item.title}
              </button>
            ))
          ) : (
            <p>此 PDF 未提供目录。</p>
          )}
        </div>
      )}
      {mode === "search" && (
        <div className="pdf-navigation-panel">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <Input
              aria-label="PDF 搜索文字"
              placeholder="输入文字，搜索全文"
              value={query}
              onChange={setQuery}
            />
            <Button type="submit" size="sm" disabled={busy || !query.trim()}>
              {busy ? <Loader size={14} label="搜索中" /> : "搜索"}
            </Button>
          </form>
          {results && (
            <p>
              {results.length
                ? `找到 ${results.length} 页 · 点击结果跳转`
                : "没有找到文字。扫描图片版 PDF 需要先进行文字识别。"}
            </p>
          )}
          {results?.map((result) => (
            <button key={result.page} onClick={() => onNavigate(result.page)}>
              第 {result.page} 页 · {result.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
