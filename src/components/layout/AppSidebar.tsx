import { useEffect, useState } from "react";
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
  SlidersHorizontal,
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
import { PERMISSIONS, getUploadsBase, type PermissionCode } from "@/api/settingsApi";

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

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  permission: PermissionCode;
}

const navItems: NavItem[] = [
  { title: "داشبورد", href: "/dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD },
  { title: "کاربران و نقش‌ها", href: "/users", icon: Users, permission: PERMISSIONS.USERS },
  { title: "دانش‌آموزان", href: "/students", icon: GraduationCap, permission: PERMISSIONS.STUDENTS },
  { title: "پلن‌ها و خدمات", href: "/plans", icon: FileText, permission: PERMISSIONS.PLANS },
  { title: "پرداخت‌ها", href: "/payments", icon: CreditCard, permission: PERMISSIONS.PAYMENTS },
  { title: "حقوق و دستمزد", href: "/payroll", icon: Wallet, permission: PERMISSIONS.PAYROLL },
  { title: "یادآوری‌ها", href: "/reminders", icon: Bell, permission: PERMISSIONS.REMINDERS },
  { title: "گزارش‌ها", href: "/reports", icon: BarChart3, permission: PERMISSIONS.REPORTS },
  { title: "تنظیمات", href: "/settings", icon: Settings, permission: PERMISSIONS.SETTINGS },
  { title: "قوانین تسهیم", href: "/compensation-rules", icon: SlidersHorizontal, permission: PERMISSIONS.SETTINGS },
];

function hasPermission(permissions: string[] | undefined, permission: PermissionCode): boolean {
  if (permissions === undefined) return true;
  return permissions.includes(permission);
}

export function AppSidebar() {
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, isLoading, isError, logout } = useCurrentUser();

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

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-72 max-w-[86vw] flex-col bg-sidebar transition-transform duration-300 lg:relative lg:max-w-none",
          mobileOpen ? "translate-x-0" : "translate-x-full",
          desktopCollapsed ? "lg:w-20" : "lg:w-64",
          "lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className={cn("flex items-center gap-3", desktopCollapsed && "lg:justify-center lg:w-full")}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
              <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            {!desktopCollapsed && (
              <div className="animate-fade-in">
                <h1 className="text-sm font-bold text-sidebar-foreground">سیستم حسابداری</h1>
                <p className="text-xs text-sidebar-muted">گروه مشاوره</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDesktopCollapsed(!desktopCollapsed)}
            className={cn(
              "h-8 w-8 text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent",
              desktopCollapsed && "hidden lg:flex absolute -left-4 top-4 bg-sidebar border border-sidebar-border rounded-full shadow-lg",
              "hidden lg:flex"
            )}
          >
            {desktopCollapsed ? <ChevronRight className="h-4 w-4 rotate-180" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems
            .filter((item) => hasPermission(profile?.permissions, item.permission))
            .map((item) => {
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
                  desktopCollapsed && "lg:justify-center lg:px-2"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "animate-pulse-soft")} />
                {!desktopCollapsed && <span className="flex-1">{item.title}</span>}
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
                  desktopCollapsed && "lg:justify-center lg:px-2"
                )}
              >
                {profile?.avatar_url ? (
                  <img
                    src={`${getUploadsBase()}${profile.avatar_url}`}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover border border-sidebar-border"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground shrink-0">
                    {(displayName || "م").charAt(0)}
                  </div>
                )}
                {!desktopCollapsed && (
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
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full shadow-lg lg:hidden"
        )}
      >
        <Menu className="h-5 w-5" />
      </Button>
    </>
  );
}
