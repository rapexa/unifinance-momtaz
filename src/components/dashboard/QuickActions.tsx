import { Plus, Link2, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { label: "ثبت پرداخت", icon: Plus, variant: "default" as const },
  { label: "لینک پرداخت", icon: Link2, variant: "outline" as const },
  { label: "فیش حقوقی", icon: FileText, variant: "outline" as const },
  { label: "ارسال یادآوری", icon: Send, variant: "outline" as const },
];

export function QuickActions() {
  return (
    <div className="card-elevated p-5 animate-fade-in">
      <h3 className="mb-4 font-bold text-foreground">دسترسی سریع</h3>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant}
            className="h-auto flex-col gap-2 py-4"
          >
            <action.icon className="h-5 w-5" />
            <span className="text-xs">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
