import { Link } from "react-router-dom";
import { Plus, FileText, Send, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { label: "ثبت پرداخت", icon: Plus, variant: "default" as const, to: "/payments" },
  { label: "اضافه کردن پلن", icon: FilePlus, variant: "outline" as const, to: "/plans" },
  { label: "فیش حقوقی", icon: FileText, variant: "outline" as const, to: "/payroll" },
  { label: "ارسال یادآوری", icon: Send, variant: "outline" as const, to: "/reminders" },
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
            asChild
          >
            <Link to={action.to}>
              <action.icon className="h-5 w-5" />
              <span className="text-xs">{action.label}</span>
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
