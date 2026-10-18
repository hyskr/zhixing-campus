import type { Resource } from "./types";
/** 返回课程树中的保存目录；文件名由下载任务单独提供。 */
export function resourceDirectory(roots: Resource[], id: string): string[] {
  function find(nodes: Resource[], parents: string[]): string[] | undefined {
    for (const node of nodes) {
      const path = node.kind === "file" ? parents : [...parents, node.name];
      if (node.id === id) return path;
      const result = find(node.children, path);
      if (result) return result;
    }
  }
  return find(roots, []) ?? [];
}
