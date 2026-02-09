import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  MoreHorizontal,
  User,
  Phone,
  Mail,
  Calendar,
  Filter,
  Grid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  advisor: string;
  plan: string;
  balance: string;
  status: "active" | "inactive";
  joinDate: string;
}

const mockStudents: Student[] = [
  { id: "1", name: "علی احمدی", phone: "۰۹۱۲۱۲۳۴۵۶۷", email: "ali@email.com", advisor: "سارا محمدی", plan: "مشاوره ماهانه", balance: "۰", status: "active", joinDate: "۱۴۰۳/۰۶/۱۵" },
  { id: "2", name: "مریم رضایی", phone: "۰۹۱۳۹۸۷۶۵۴۳", email: "maryam@email.com", advisor: "علی نوری", plan: "دوره سالانه", balance: "-۱,۸۰۰,۰۰۰", status: "active", joinDate: "۱۴۰۳/۰۴/۲۰" },
  { id: "3", name: "محمد حسینی", phone: "۰۹۳۵۵۵۵۱۲۳۴", email: "mohammad@email.com", advisor: "سارا محمدی", plan: "کارگاه", balance: "۰", status: "active", joinDate: "۱۴۰۳/۰۷/۰۱" },
  { id: "4", name: "زهرا کریمی", phone: "۰۹۱۲۸۸۸۷۷۷۶", email: "zahra@email.com", advisor: "رضا احمدی", plan: "مشاوره ماهانه", balance: "-۹۵۰,۰۰۰", status: "inactive", joinDate: "۱۴۰۳/۰۳/۱۰" },
  { id: "5", name: "امیر محمدی", phone: "۰۹۱۵۴۴۴۳۳۳۲", email: "amir@email.com", advisor: "علی نوری", plan: "دوره سالانه", balance: "۰", status: "active", joinDate: "۱۴۰۳/۰۸/۰۵" },
  { id: "6", name: "فاطمه علوی", phone: "۰۹۳۸۲۲۲۱۱۱۰", email: "fatemeh@email.com", advisor: "سارا محمدی", plan: "کارگاه", balance: "-۲,۸۰۰,۰۰۰", status: "active", joinDate: "۱۴۰۳/۰۵/۲۵" },
];

const Students = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  return (
    <MainLayout title="دانش‌آموزان" subtitle="مدیریت پروفایل و اطلاعات مالی دانش‌آموزان">
      {/* Header actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی دانش‌آموز..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border p-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button size="sm">
            <Plus className="ml-2 h-4 w-4" />
            دانش‌آموز جدید
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">کل دانش‌آموزان</p>
          <p className="text-2xl font-bold text-foreground">۱۲۸</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">فعال</p>
          <p className="text-2xl font-bold text-success">۱۱۵</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">غیرفعال</p>
          <p className="text-2xl font-bold text-muted-foreground">۱۳</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">بدهکار</p>
          <p className="text-2xl font-bold text-destructive">۸</p>
        </div>
      </div>

      {/* Students grid/list */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockStudents.map((student) => (
            <div key={student.id} className="card-elevated p-5 hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{student.name}</h3>
                    <p className="text-sm text-muted-foreground">{student.plan}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    student.status === "active" ? "bg-success" : "bg-muted-foreground"
                  )}
                />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>مشاور: {student.advisor}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span dir="ltr">{student.phone}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">مانده حساب</span>
                <span className={cn("font-bold number-display", student.balance.startsWith("-") ? "text-destructive" : "text-success")}>
                  {student.balance} تومان
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">تماس</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مشاور</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">پلن</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مانده حساب</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {mockStudents.map((student) => (
                  <tr key={student.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{student.name}</p>
                          <p className="text-sm text-muted-foreground">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground" dir="ltr">{student.phone}</td>
                    <td className="p-4 text-foreground">{student.advisor}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {student.plan}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={cn("font-bold number-display", student.balance.startsWith("-") ? "text-destructive" : "text-success")}>
                        {student.balance}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          student.status === "active" ? "status-paid" : "status-debt"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", student.status === "active" ? "bg-success" : "bg-destructive")} />
                        {student.status === "active" ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
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
      )}
    </MainLayout>
  );
};

export default Students;
