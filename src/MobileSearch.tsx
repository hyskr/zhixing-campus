import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/motion/input";
import { Button } from "@/components/motion/button";
import type { MorphingSearchItem } from "@/components/motion/morphing-search";
import MobileDetailPage from "./MobileDetailPage";
export default function MobileSearch({
  items,
  onClose,
}: {
  items: MorphingSearchItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const results = items.filter(
    (item) =>
      !needle ||
      `${item.title} ${item.description ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  return (
    <MobileDetailPage title="搜索" onBack={onClose}>
      <div className="mobile-search-page">
        <div className="mobile-search-input">
          <Search size={20} />
          <Input
            aria-label="搜索课程、作业或页面"
            type="search"
            enterKeyHint="search"
            placeholder="搜索课程、作业或页面"
            value={query}
            onChange={setQuery}
          />
        </div>
        <p>{needle ? `${results.length} 个结果` : "页面与课程"}</p>
        <div className="mobile-search-results">
          {results.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => {
                  onClose();
                  item.onSelect?.();
                }}
              >
                {Icon && <Icon size={20} />}
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <ChevronRight size={17} />
              </Button>
            );
          })}
          {!results.length && <p>没有匹配内容，试试课程名或作业标题。</p>}
        </div>
      </div>
    </MobileDetailPage>
  );
}
