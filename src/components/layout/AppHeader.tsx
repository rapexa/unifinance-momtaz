import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, User, Settings, LogOut, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { getUploadsBase, getCurrentFiscalYear } from "@/api/settingsApi";
import { listReminderLogs } from "@/api/remindersApi";

const ROLE_LABELS: Record<string, string> = {
  general_manager: "مدیرکل",
  advisor: "مشاور",
  secretary: "منشی",
  support: "پشتیبان",
  executive_manager: "مدیر اجرایی",
  advisor_lead: "سرپرست مشاوران",
  ADMIN: "مدیر کل",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  const navigate = useNavigate();
  const { profile, isLoading, isError, logout } = useCurrentUser();
  const { data: notificationCount = 0 } = useQuery({
    queryKey: ["reminder-logs-pending-count"],
    queryFn: async () => {
      const logs = await listReminderLogs();
      return logs.filter((l) => l.status === "PENDING").length;
    },
    staleTime: 60 * 1000,
  });
  const { data: currentFY } = useQuery({
    queryKey: ["fiscal-year-current"],
    queryFn: getCurrentFiscalYear,
    staleTime: 5 * 60 * 1000,
  });

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "کاربر"
    : "ورود";
  const roleLabel = profile
    ? profile.role_name || ROLE_LABELS[profile.role] || profile.role
    : "";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-3 sm:px-4 lg:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-foreground sm:text-lg">{title}</h1>
        {subtitle && <p className="hidden truncate text-xs text-muted-foreground sm:block sm:text-sm">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        {currentFY && (
          <Link to="/settings">
            <Badge
              variant="outline"
              className="hidden sm:flex items-center gap-1 text-xs cursor-pointer hover:bg-muted transition-colors border-green-500 text-green-700 dark:text-green-400"
            >
              <CalendarDays className="h-3 w-3" />
              {currentFY.name}
            </Badge>
          </Link>
        )}
        <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/reminders")}>
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pr-1 sm:pr-2">
              {profile?.avatar_url ? (
                <img
                  src={`${getUploadsBase()}${profile.avatar_url}`}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {(displayName || "م").charAt(0)}
                </div>
              )}
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">
                  {isLoading ? "..." : isError ? "ورود" : displayName}
                </p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                پروفایل
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                تنظیمات
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="ml-2 h-4 w-4" />
              خروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
