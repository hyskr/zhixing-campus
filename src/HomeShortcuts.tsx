// BeUI 组件来源：https://beui.dev/r/sortable-stack.json
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Folder, Mail } from "lucide-react";
import {
  SortableList,
  SortableListGroup,
  SortableListHandle,
  SortableListItem,
  SortableListItemContent,
} from "@/components/motion/sortable-list";
import type { Page } from "./types";
const defaults = [
  { id: "mail", label: "校园邮箱" },
  { id: "files", label: "文件空间" },
  { id: "downloads", label: "下载管理" },
];
const icons = { mail: Mail, files: Folder, downloads: ArrowDownLeft };
export default function HomeShortcuts({
  navigate,
}: {
  navigate: (page: Page) => void;
}) {
  const [items, setItems] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("zhixing.home-shortcuts") ?? "null",
      );
      if (
        Array.isArray(saved) &&
        saved.length === 3 &&
        new Set(saved).size === 3 &&
        saved.every((id) => defaults.some((item) => item.id === id))
      )
        return saved.map((id) => defaults.find((item) => item.id === id)!);
    } catch {}
    return defaults;
  });
  return (
    <SortableList
      items={items}
      onItemsChange={(next) => {
        setItems(next);
        localStorage.setItem(
          "zhixing.home-shortcuts",
          JSON.stringify(next.map((item) => item.id)),
        );
      }}
      getItemLabel={(item) => item.label}
      label="首页快捷入口排序"
      className="home-quick-sort"
    >
      {(ordered) => (
        <SortableListGroup>
          {ordered.map((item) => {
            const Icon = icons[item.id as keyof typeof icons];
            return (
              <SortableListItem key={item.id} id={item.id}>
                <SortableListHandle aria-label={`调整${item.label}顺序`} />
                <SortableListItemContent>
                  <button onClick={() => navigate(item.id as Page)}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <ArrowUpRight size={14} />
                  </button>
                </SortableListItemContent>
              </SortableListItem>
            );
          })}
        </SortableListGroup>
      )}
    </SortableList>
  );
}
