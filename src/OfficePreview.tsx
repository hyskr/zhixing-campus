import { useEffect, useRef, useState } from "react";
import type { Presentation } from "@web-ppt/core";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/motion/button";
import { Loader } from "@/components/motion/loader";
import { useErrorState } from "./ui";
import "./office-preview.css";

// 浏览器内解析；API 与格式边界见 docs/features/office-preview.md。
// https://github.com/VolodymyrBaydalka/docxjs/blob/master/src/docx-preview.ts
// https://github.com/unStone/web-ppt/blob/master/packages/core/src/index.ts
export default function OfficePreview({
  bytes,
  format,
}: {
  bytes: Uint8Array;
  format: "docx" | "pptx" | "ppt";
}) {
  return format === "docx" ? (
    <WordPreview bytes={bytes} />
  ) : (
    <SlidesPreview bytes={bytes} />
  );
}

function WordPreview({ bytes }: { bytes: Uint8Array }) {
  const content = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorState();
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let active = true;
    const target = document.createElement("div");
    const styleTarget = document.createElement("div");
    void import("docx-preview")
      .then(async ({ renderAsync }) => {
        await renderAsync(bytes.slice().buffer, target, styleTarget, {
          className: "campus-docx-page",
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          useBase64URL: true,
          renderAltChunks: false,
        });
        if (!active) return;
        content.current?.replaceChildren(target);
        styles.current?.replaceChildren(styleTarget);
        setPages(target.querySelectorAll("section.campus-docx-page").length);
      })
      .catch((reason) => {
        if (active) setError(`Word 预览失败：${String(reason)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bytes]);
  return (
    <div className="office-preview office-word">
      <div className="office-preview-controls">
        <span>Word 文档{pages > 0 ? ` · ${pages} 页` : ""}</span>
        <div className="office-zoom-controls">
          <Button
            size="sm"
            variant="ghost"
            aria-label="缩小文档"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((v) => Math.max(0.5, v - 0.1))}
          >
            <Minus size={15} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="放大文档"
            disabled={zoom >= 2}
            onClick={() => setZoom((v) => Math.min(2, v + 0.1))}
          >
            <Plus size={15} />
          </Button>
        </div>
      </div>
      {loading && (
        <div className="inline-loading">
          <Loader variant="spinner" size={20} label="正在排版 Word 文档" />
          正在排版文档…
        </div>
      )}
      {error && <p className="quiet-empty">文档未能预览，请下载原文件查看。</p>}
      <div ref={styles} />
      <div className="office-document-scroll" hidden={loading || !!error}>
        <div ref={content} className="office-docx-content" style={{ zoom }} />
      </div>
    </div>
  );
}

function SlidesPreview({ bytes }: { bytes: Uint8Array }) {
  const [document, setDocument] = useState<Presentation | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [slide, setSlide] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [markup, setMarkup] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useErrorState();
  useEffect(() => {
    let active = true;
    let parsed: Presentation | undefined;
    void import("@web-ppt/core")
      .then(async ({ parse }) => {
        parsed = await parse(bytes);
        if (!active) {
          parsed.dispose?.();
          return;
        }
        if (!parsed.slides.length) throw Error("演示文稿没有幻灯片");
        setDocument(parsed);
      })
      .catch((reason) => {
        if (active) setError(`PowerPoint 预览失败：${String(reason)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      parsed?.dispose?.();
    };
  }, [bytes]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    void import("@web-ppt/core")
      .then(({ renderSlideToSvg }) => {
        const svg = renderSlideToSvg(document, document.slides[slide], {
          textMode: "svg",
        });
        if (active)
          setMarkup(
            DOMPurify.sanitize(svg, {
              USE_PROFILES: { svg: true, svgFilters: true },
              ALLOWED_URI_REGEXP:
                /^(?:(?:https?|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
            }),
          );
      })
      .catch((reason) => {
        if (active) setError(`幻灯片预览失败：${String(reason)}`);
      });
    return () => {
      active = false;
    };
  }, [document, slide]);
  useEffect(() => {
    const target = viewport.current;
    if (!document || !target) return;
    const fit = () => {
      const style = getComputedStyle(target);
      const width =
        target.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const height =
        target.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      setFitWidth(Math.min(width, (height * document.width) / document.height));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(target);
    fit();
    return () => observer.disconnect();
  }, [document]);
  return (
    <div className="office-preview office-slides">
      <div className="office-preview-controls">
        <div className="office-slide-pagination">
          <Button
            size="sm"
            variant="ghost"
            aria-label="上一张幻灯片"
            disabled={!document || slide === 0}
            onClick={() => setSlide((v) => v - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {document
              ? `${slide + 1} / ${document.slides.length}`
              : "正在读取幻灯片"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="下一张幻灯片"
            disabled={!document || slide >= document.slides.length - 1}
            onClick={() => setSlide((v) => v + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="office-zoom-controls">
          <Button
            size="sm"
            variant="ghost"
            aria-label="缩小幻灯片"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((v) => Math.max(0.5, v - 0.1))}
          >
            <Minus size={15} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            size="sm"
            variant="ghost"
            aria-label="放大幻灯片"
            disabled={zoom >= 2}
            onClick={() => setZoom((v) => Math.min(2, v + 0.1))}
          >
            <Plus size={15} />
          </Button>
        </div>
      </div>
      {loading && (
        <div className="inline-loading">
          <Loader variant="spinner" size={20} label="正在解析幻灯片" />
          正在解析幻灯片…
        </div>
      )}
      {error && (
        <p className="quiet-empty">演示文稿未能预览，请下载原文件查看。</p>
      )}
      {!loading && !error && document && (
        <div className="office-slide-scroll" ref={viewport}>
          <div
            className="office-slide-page"
            style={{
              width: fitWidth ? `${fitWidth * zoom}px` : "100%",
              aspectRatio: `${document.width} / ${document.height}`,
            }}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
        </div>
      )}
    </div>
  );
}
