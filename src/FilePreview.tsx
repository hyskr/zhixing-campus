import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { Loader } from "@/components/motion/loader";
import { ErrorAlert } from "./ui";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/motion/button";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  LoaderCircle,
  Minus,
  Minimize2,
  X,
  Plus,
} from "lucide-react";
import { Modal } from "./ui";
import { downloadFiles, getLinks, type LinkFile } from "./learning";
import { withCampusSession } from "./service";
import type { Account } from "./types";
import DOMPurify from "dompurify";
type PreviewItem = LinkFile & { convertUrl?: string };
const Context = createContext<(item: PreviewItem, account: Account) => void>(
  () => {},
);
export const useFilePreview = () => useContext(Context);
export function FilePreviewProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<{
    item: PreviewItem;
    account: Account;
  } | null>(null);
  return (
    <Context.Provider
      value={(item, account) => setSelection({ item, account })}
    >
      {children}
      {selection && (
        <Preview
          key={selection.item.id}
          {...selection}
          onClose={() => setSelection(null)}
        />
      )}
    </Context.Provider>
  );
}
function Pdf({ bytes }: { bytes: Uint8Array }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [doc, setDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(
      null,
    ),
    [page, setPage] = useState(1),
    [scale, setScale] = useState(1.15),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let loading: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist")
      .then(async (pdf) => {
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
          .default;
        pdf.GlobalWorkerOptions.workerSrc = worker;
        loading = pdf.getDocument({
          data: bytes.slice(),
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          iccUrl: "/pdfjs/iccs/",
        });
        const value = await loading.promise;
        if (active) setDoc(value);
        else void loading?.destroy();
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      void loading?.destroy();
    };
  }, [bytes]);
  useEffect(() => {
    if (!doc) return;
    let active = true;
    let task: import("pdfjs-dist").RenderTask | undefined;
    void doc
      .getPage(page)
      .then((p) => {
        if (!active) return;
        const target = canvas.current!;
        const viewport = p.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;
        target.width = viewport.width * ratio;
        target.height = viewport.height * ratio;
        target.style.width = `${viewport.width}px`;
        target.style.height = `${viewport.height}px`;
        task = p.render({
          canvas: target,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        return task.promise;
      })
      .catch((e) => {
        if (active && !String(e).includes("cancelled")) setError(String(e));
      });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [doc, page, scale]);
  return (
    <>
      <div className="preview-pagination">
        <Button
          size="sm"
          variant="ghost"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>
          {page} / {doc?.numPages ?? "…"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="下一页"
          disabled={!doc || page >= doc.numPages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="缩小"
          onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
        >
          <Minus size={14} />
        </Button>
        <span>{Math.round(scale * 100)}%</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="放大"
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
        >
          <Plus size={14} />
        </Button>
      </div>
      <div className="pdf-canvas-area">
        <canvas ref={canvas} />
      </div>
      {error && <ErrorAlert message={error} />}
    </>
  );
}
function Preview({
  item,
  account,
  onClose,
}: {
  item: PreviewItem;
  account: Account;
  onClose: () => void;
}) {
  const viewer = useRef<HTMLDivElement>(null),
    [bytes, setBytes] = useState<Uint8Array | null>(null),
    [html, setHtml] = useState(""),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const name = item.name,
    ext = name.split(".").at(-1)?.toLowerCase();
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void (async () => {
      const source =
        item.convertUrl && /\.pdf(?:[?#]|$)/i.test(item.convertUrl)
          ? { ...item, url: item.convertUrl }
          : item;
      const links = await getLinks(account, [source]);
      const url = account.demo
        ? ext === "docx"
          ? "/demo/report.docx"
          : ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(
                ext ?? "",
              )
            ? "/models/diagnostic.png"
            : ["txt", "md", "csv", "json"].includes(ext ?? "")
              ? "/demo/readme.txt"
              : "/demo/document.pdf"
        : links[0].url;
      const data =
        isTauri() && !account.demo
          ? new Uint8Array(
              await withCampusSession(account.id, () =>
                invoke<ArrayBuffer>("file_bytes", {
                  username: account.id,
                  url,
                }),
              ),
            )
          : new Uint8Array(await (await fetch(url)).arrayBuffer());
      if (!active) return;
      setBytes(data);
      if (
        ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext ?? "")
      ) {
        objectUrl = URL.createObjectURL(
          new Blob([data], {
            type:
              ext === "svg"
                ? "image/svg+xml"
                : `image/${ext === "jpg" ? "jpeg" : ext}`,
          }),
        );
        setImage(objectUrl);
      } else if (
        ext === "docx" &&
        new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-"
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({
          arrayBuffer: data.buffer as ArrayBuffer,
        });
        if (active) setHtml(DOMPurify.sanitize(result.value));
      }
    })()
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.id, account.id]);
  const pdf = bytes && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewer.current?.requestFullscreen();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Modal title={name} subtitle="文件在线查看" onClose={onClose} wide>
      <div className="file-viewer" ref={viewer}>
        <div className="file-viewer-toolbar">
          <strong>{name}</strong>
          <Button size="sm" variant="secondary" onClick={fullscreen}>
            <Expand size={14} />
            {fullScreen ? "退出全屏" : "全屏查看"}
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              try {
                await downloadFiles(account, [item]);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Download size={14} />
            下载
          </Button>
        </div>
        {loading ? (
          <div className="inline-loading">
            <Loader variant="spinner" size={20} label="正在加载" />
            正在读取文件…
          </div>
        ) : pdf && bytes ? (
          <Pdf bytes={bytes} />
        ) : image ? (
          <div className="image-preview">
            <img src={image} alt={name} />
          </div>
        ) : html ? (
          <article
            className="docx-preview rich-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : [
            "txt",
            "md",
            "csv",
            "json",
            "log",
            "py",
            "java",
            "c",
            "cpp",
            "html",
            "xml",
          ].includes(ext ?? "") && bytes ? (
          <pre className="text-preview">{new TextDecoder().decode(bytes)}</pre>
        ) : !error ? (
          <p className="quiet-empty">
            此格式可下载后使用系统应用打开；提供 PDF 转换版的文件可直接预览。
          </p>
        ) : null}
        {error && <ErrorAlert message={String(error)} />}
        {fullScreen && (
          <div className="file-fullscreen-dock">
            <Dock size={40}>
              <DockItem aria-label="退出全屏" onClick={() => void fullscreen()}>
                <Minimize2 size={19} />
              </DockItem>
              <DockItem
                aria-label="下载文件"
                onClick={() => {
                  void downloadFiles(account, [item]).catch((reason) =>
                    setError(String(reason)),
                  );
                }}
              >
                <Download size={19} />
              </DockItem>
              <DockSeparator />
              <DockItem aria-label="关闭文件" onClick={onClose}>
                <X size={19} />
              </DockItem>
            </Dock>
          </div>
        )}
      </div>
    </Modal>
  );
}
