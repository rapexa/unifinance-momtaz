import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Shield, 
  UserCheck, 
  UserX,
  Filter,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  lastActivity: string;
}

const mockUsers: User[] = [
  { id: "1", name: "مدیر سیستم", email: "admin@example.com", role: "مدیر کل", status: "active", lastActivity: "همین الان" },
  { id: "2", name: "سارا احمدی", email: "sara@example.com", role: "حسابدار", status: "active", lastActivity: "۵ دقیقه پیش" },
  { id: "3", name: "علی محمدی", email: "ali@example.com", role: "مشاور", status: "active", lastActivity: "۱ ساعت پیش" },
  { id: "4", name: "مریم رضایی", email: "maryam@example.com", role: "مشاور", status: "inactive", lastActivity: "۲ روز پیش" },
  { id: "5", name: "رضا نوری", email: "reza@example.com", role: "اپراتور", status: "active", lastActivity: "۳ ساعت پیش" },
];

const roleColors: Record<string, string> = {
  "مدیر کل": "bg-primary text-primary-foreground",
  "حسابدار": "bg-chart-2/20 text-chart-2",
  "مشاور": "bg-chart-5/20 text-chart-5",
  "اپراتور": "bg-chart-3/20 text-chart-3",
};

const Users = () => {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <MainLayout title="کاربران و نقش‌ها" subtitle="مدیریت دسترسی‌ها و کاربران سیستم">
      {/* Header actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی کاربر..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button variant="outline" size="sm">
            <Download className="ml-2 h-4 w-4" />
            خروجی
          </Button>
          <Button size="sm">
            <Plus className="ml-2 h-4 w-4" />
            کاربر جدید
          </Button>
        </div>
      </div>

      {/* Role cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { role: "مدیر کل", count: 1, icon: Shield },
          { role: "حسابدار", count: 2, icon: UserCheck },
          { role: "مشاور", count: 5, icon: UserCheck },
          { role: "اپراتور", count: 3, icon: UserX },
        ].map((item) => (
          <div key={item.role} className="card-elevated p-4 cursor-pointer hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={cn("rounded-lg p-2", roleColors[item.role])}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-foreground">{item.role}</p>
                <p className="text-sm text-muted-foreground">{item.count} کاربر</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کاربر</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نقش</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">آخرین فعالیت</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {mockUsers.map((user) => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", roleColors[user.role])}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        user.status === "active" ? "status-paid" : "status-debt"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", user.status === "active" ? "bg-success" : "bg-destructive")} />
                      {user.status === "active" ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">{user.lastActivity}</td>
                  <td className="p-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
};

export default Users;
