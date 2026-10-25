import type { ReactNode } from "react";
import { BottomSheet } from "@/components/motion/bottom-sheet";
import { Button } from "@/components/motion/button";
export default function FileActionsSheet({
  open,
  title,
  onClose,
  actions,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  actions: { id: string; label: string; icon: ReactNode; run: () => unknown }[];
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      snapPoints={["auto"]}
      title={title}
      description="文件操作"
      className="mobile-file-actions-sheet"
    >
      <div className="mobile-file-actions">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="ghost"
            onClick={() => {
              onClose();
              void action.run();
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </Button>
        ))}
      </div>
    </BottomSheet>
  );
}
