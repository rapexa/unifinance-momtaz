import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Link2,
  Download,
  Filter,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Payment {
  id: string;
  student: string;
  amount: string;
  date: string;
  dueDate: string;
  status: "paid" | "pending" | "overdue";
  method: string;
  description: string;
}

const mockPayments: Payment[] = [
  { id: "1", student: "علی احمدی", amount: "۲,۵۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۵", dueDate: "۱۴۰۳/۰۹/۱۵", status: "paid", method: "کارت به کارت", description: "شهریه آذر" },
  { id: "2", student: "مریم رضایی", amount: "۱,۸۰۰,۰۰۰", date: "-", dueDate: "۱۴۰۳/۰۹/۲۰", status: "pending", method: "-", description: "شهریه آذر" },
  { id: "3", student: "محمد حسینی", amount: "۳,۲۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۳", dueDate: "۱۴۰۳/۰۹/۱۵", status: "paid", method: "درگاه آنلاین", description: "دوره سالانه - قسط ۳" },
  { id: "4", student: "زهرا کریمی", amount: "۹۵۰,۰۰۰", date: "-", dueDate: "۱۴۰۳/۰۹/۰۱", status: "overdue", method: "-", description: "شهریه آبان" },
  { id: "5", student: "امیر محمدی", amount: "۲,۱۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۱", dueDate: "۱۴۰۳/۰۹/۱۰", status: "paid", method: "نقدی", description: "ثبت‌نام کارگاه" },
  { id: "6", student: "فاطمه علوی", amount: "۲,۸۰۰,۰۰۰", date: "-", dueDate: "۱۴۰۳/۰۸/۲۵", status: "overdue", method: "-", description: "شهریه آبان" },
];

const statusLabels = {
  paid: "پرداخت شده",
  pending: "در انتظار",
  overdue: "معوق",
};

const statusStyles = {
  paid: "status-paid",
  pending: "status-pending",
  overdue: "status-debt",
};

const Payments = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredPayments = mockPayments.filter((payment) => {
    if (activeTab === "all") return true;
    return payment.status === activeTab;
  });

  return (
    <MainLayout title="پرداخت‌ها" subtitle="مدیریت دریافت و ثبت پرداخت‌ها">
      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-3">
              <ArrowUpRight className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">دریافتی امروز</p>
              <p className="text-xl font-bold number-display text-foreground">۴,۶۰۰,۰۰۰</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-3">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">در انتظار پرداخت</p>
              <p className="text-xl font-bold number-display text-foreground">۱,۸۰۰,۰۰۰</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-destructive/10 p-3">
              <ArrowDownRight className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">معوقات</p>
              <p className="text-xl font-bold number-display text-destructive">۳,۷۵۰,۰۰۰</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <ArrowUpRight className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">دریافتی این ماه</p>
              <p className="text-xl font-bold number-display text-foreground">۴۵,۲۰۰,۰۰۰</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجو در پرداخت‌ها..."
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
          <Button variant="outline" size="sm">
            <Link2 className="ml-2 h-4 w-4" />
            لینک پرداخت
          </Button>
          <Button size="sm">
            <Plus className="ml-2 h-4 w-4" />
            ثبت پرداخت
          </Button>
        </div>
      </div>

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="all" className="data-[state=active]:bg-background">همه</TabsTrigger>
          <TabsTrigger value="paid" className="data-[state=active]:bg-background">پرداخت شده</TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-background">در انتظار</TabsTrigger>
          <TabsTrigger value="overdue" className="data-[state=active]:bg-background">معوق</TabsTrigger>
        </TabsList>

        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">شرح</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مبلغ (تومان)</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">سررسید</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">تاریخ پرداخت</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">روش</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {payment.student.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{payment.student}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{payment.description}</td>
                    <td className="p-4 font-bold number-display text-foreground">{payment.amount}</td>
                    <td className="p-4 text-muted-foreground">{payment.dueDate}</td>
                    <td className="p-4 text-muted-foreground">{payment.date}</td>
                    <td className="p-4 text-muted-foreground">{payment.method}</td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          statusStyles[payment.status]
                        )}
                      >
                        {statusLabels[payment.status]}
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
      </Tabs>
    </MainLayout>
  );
};

export default Payments;
