import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  FileText,
  Settings,
  Calculator,
  Download,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  role: string;
  baseSalary: string;
  variableSalary: string;
  totalSalary: string;
  students: number;
  status: "paid" | "pending";
}

const mockEmployees: Employee[] = [
  { id: "1", name: "سارا محمدی", role: "مشاور ارشد", baseSalary: "۱۵,۰۰۰,۰۰۰", variableSalary: "۸,۵۰۰,۰۰۰", totalSalary: "۲۳,۵۰۰,۰۰۰", students: 17, status: "paid" },
  { id: "2", name: "علی نوری", role: "مشاور", baseSalary: "۱۲,۰۰۰,۰۰۰", variableSalary: "۶,۲۰۰,۰۰۰", totalSalary: "۱۸,۲۰۰,۰۰۰", students: 12, status: "pending" },
  { id: "3", name: "رضا احمدی", role: "مشاور", baseSalary: "۱۲,۰۰۰,۰۰۰", variableSalary: "۴,۸۰۰,۰۰۰", totalSalary: "۱۶,۸۰۰,۰۰۰", students: 10, status: "pending" },
  { id: "4", name: "مینا کریمی", role: "اپراتور", baseSalary: "۸,۰۰۰,۰۰۰", variableSalary: "۰", totalSalary: "۸,۰۰۰,۰۰۰", students: 0, status: "paid" },
  { id: "5", name: "حسین رضایی", role: "حسابدار", baseSalary: "۱۴,۰۰۰,۰۰۰", variableSalary: "۰", totalSalary: "۱۴,۰۰۰,۰۰۰", students: 0, status: "pending" },
];

const Payroll = () => {
  return (
    <MainLayout title="حقوق و دستمزد" subtitle="مدیریت ساختار حقوق و محاسبات">
      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">کل حقوق این ماه</p>
          <p className="text-2xl font-bold number-display text-foreground">۸۰,۵۰۰,۰۰۰</p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق ثابت</p>
          <p className="text-2xl font-bold number-display text-foreground">۶۱,۰۰۰,۰۰۰</p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق متغیر</p>
          <p className="text-2xl font-bold number-display text-primary">۱۹,۵۰۰,۰۰۰</p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">پرداخت شده</p>
          <p className="text-2xl font-bold number-display text-success">۳۱,۵۰۰,۰۰۰</p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="employees" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="employees" className="data-[state=active]:bg-background">کارکنان</TabsTrigger>
            <TabsTrigger value="structure" className="data-[state=active]:bg-background">ساختار حقوق</TabsTrigger>
            <TabsTrigger value="payslips" className="data-[state=active]:bg-background">فیش‌های حقوقی</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Calculator className="ml-2 h-4 w-4" />
              محاسبه خودکار
            </Button>
            <Button size="sm">
              <Plus className="ml-2 h-4 w-4" />
              ثبت حقوق
            </Button>
          </div>
        </div>

        <TabsContent value="employees">
          <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کارمند</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">سمت</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموزان</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">حقوق ثابت</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">حقوق متغیر</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">جمع کل</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {mockEmployees.map((employee) => (
                    <tr key={employee.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                            {employee.name.charAt(0)}
                          </div>
                          <span className="font-medium text-foreground">{employee.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{employee.role}</td>
                      <td className="p-4 text-foreground">{employee.students > 0 ? `${employee.students} نفر` : "-"}</td>
                      <td className="p-4 number-display text-foreground">{employee.baseSalary}</td>
                      <td className="p-4 number-display text-primary">{employee.variableSalary}</td>
                      <td className="p-4 font-bold number-display text-foreground">{employee.totalSalary}</td>
                      <td className="p-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            employee.status === "paid" ? "status-paid" : "status-pending"
                          )}
                        >
                          {employee.status === "paid" ? "پرداخت شده" : "در انتظار"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="فیش حقوقی">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="ارسال">
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="structure">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">ساختار حقوق ثابت</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">مشاور ارشد</span>
                  <span className="font-bold number-display">۱۵,۰۰۰,۰۰۰ تومان</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">مشاور</span>
                  <span className="font-bold number-display">۱۲,۰۰۰,۰۰۰ تومان</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">حسابدار</span>
                  <span className="font-bold number-display">۱۴,۰۰۰,۰۰۰ تومان</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">اپراتور</span>
                  <span className="font-bold number-display">۸,۰۰۰,۰۰۰ تومان</span>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4">
                <Settings className="ml-2 h-4 w-4" />
                ویرایش ساختار
              </Button>
            </div>

            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">ساختار حقوق متغیر</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">به ازای هر دانش‌آموز</span>
                  <span className="font-bold number-display">۵۰۰,۰۰۰ تومان</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">درصد از دریافتی</span>
                  <span className="font-bold number-display">۱۵٪</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">پاداش ماهانه</span>
                  <span className="font-bold number-display">۲,۰۰۰,۰۰۰ تومان</span>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4">
                <Settings className="ml-2 h-4 w-4" />
                ویرایش ساختار
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payslips">
          <div className="card-elevated p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-bold text-foreground mb-2">فیش‌های حقوقی</h3>
            <p className="text-muted-foreground mb-4">فیش‌های حقوقی صادر شده را اینجا مشاهده و مدیریت کنید.</p>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              صدور فیش حقوقی جدید
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Payroll;
