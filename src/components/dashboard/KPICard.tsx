import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  change?: {
    value: string;
    trend: "up" | "down";
  };
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "danger";
}

const variantStyles = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

export function KPICard({ title, value, change, icon: Icon, variant = "default" }: KPICardProps) {
  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold number-display text-foreground">{value}</p>
          {change && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                change.trend === "up" ? "text-success" : "text-destructive"
              )}
            >
              {change.trend === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{change.value}</span>
              <span className="text-muted-foreground">از ماه قبل</span>
            </div>
          )}
        </div>
        <div className={cn("rounded-xl p-3", variantStyles[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
