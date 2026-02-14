import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CreditCard,
  Wallet,
  FileText,
  Bell,
  BarChart3,
  Settings,
  ChevronRight,
  Menu,
  Building2,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "مدیر کل",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const navItems: NavItem[] = [
  { title: "داشبورد", href: "/", icon: LayoutDashboard },
  { title: "کاربران و نقش‌ها", href: "/users", icon: Users },
  { title: "دانش‌آموزان", href: "/students", icon: GraduationCap, badge: 12 },
  { title: "پلن‌ها و خدمات", href: "/plans", icon: FileText },
  { title: "پرداخت‌ها", href: "/payments", icon: CreditCard, badge: 3 },
  { title: "حقوق و دستمزد", href: "/payroll", icon: Wallet },
  { title: "یادآوری‌ها", href: "/reminders", icon: Bell },
  { title: "گزارش‌ها", href: "/reports", icon: BarChart3 },
  { title: "تنظیمات", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isLoading, isError, logout } = useCurrentUser();

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "کاربر"
    : "ورود";
  const roleLabel = profile ? ROLE_LABELS[profile.role] ?? profile.role : "";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity lg:hidden",
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        )}
        onClick={() => setCollapsed(true)}
      />

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen flex-col bg-sidebar transition-all duration-300",
          collapsed ? "w-20" : "w-64",
          "lg:relative"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center w-full")}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
              <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="animate-fade-in">
                <h1 className="text-sm font-bold text-sidebar-foreground">سیستم حسابداری</h1>
                <p className="text-xs text-sidebar-muted">گروه مشاوره</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent",
              collapsed && "hidden lg:flex absolute -left-4 top-4 bg-sidebar border border-sidebar-border rounded-full shadow-lg"
            )}
          >
            {collapsed ? <ChevronRight className="h-4 w-4 rotate-180" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "animate-pulse-soft")} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    {item.badge != null && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 text-xs font-bold text-sidebar-accent-foreground">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-sidebar-accent transition-colors",
                  collapsed && "justify-center px-2"
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground shrink-0">
                  {(displayName || "م").charAt(0)}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0 animate-fade-in">
                    <p className="text-sm font-medium text-sidebar-foreground truncate">
                      {isLoading ? "..." : isError ? "ورود" : displayName}
                    </p>
                    <p className="text-xs text-sidebar-muted truncate">{roleLabel}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
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
      </aside>

      <Button
        variant="outline"
        size="icon"
        onClick={() => setCollapsed(false)}
        className={cn(
          "fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full shadow-lg lg:hidden",
          !collapsed && "hidden"
        )}
      >
        <Menu className="h-5 w-5" />
      </Button>
    </>
  );
}
