import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Users,
  Tag,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  type: "monthly" | "yearly" | "workshop" | "course";
  price: string;
  discount: string | null;
  students: number;
  features: string[];
  isActive: boolean;
}

const mockPlans: Plan[] = [
  {
    id: "1",
    name: "مشاوره ماهانه",
    type: "monthly",
    price: "۲,۵۰۰,۰۰۰",
    discount: null,
    students: 45,
    features: ["۴ جلسه مشاوره", "پشتیبانی تلگرام", "برنامه‌ریزی هفتگی"],
    isActive: true,
  },
  {
    id: "2",
    name: "دوره سالانه VIP",
    type: "yearly",
    price: "۲۵,۰۰۰,۰۰۰",
    discount: "۱۵٪",
    students: 28,
    features: ["۴۸ جلسه مشاوره", "پشتیبانی ۲۴ ساعته", "کارگاه‌های رایگان", "منابع آموزشی"],
    isActive: true,
  },
  {
    id: "3",
    name: "کارگاه مهارت‌های مطالعه",
    type: "workshop",
    price: "۱,۲۰۰,۰۰۰",
    discount: null,
    students: 15,
    features: ["۶ ساعت آموزش", "جزوه آموزشی", "گواهینامه"],
    isActive: true,
  },
  {
    id: "4",
    name: "دوره جامع کنکور",
    type: "course",
    price: "۱۸,۰۰۰,۰۰۰",
    discount: "۱۰٪",
    students: 32,
    features: ["آموزش کامل دروس", "آزمون‌های آزمایشی", "مشاوره تخصصی", "منابع کامل"],
    isActive: true,
  },
];

const typeLabels: Record<string, string> = {
  monthly: "ماهانه",
  yearly: "سالانه",
  workshop: "کارگاه",
  course: "دوره‌ای",
};

const typeColors: Record<string, string> = {
  monthly: "bg-chart-1/20 text-chart-1",
  yearly: "bg-chart-2/20 text-chart-2",
  workshop: "bg-chart-3/20 text-chart-3",
  course: "bg-chart-5/20 text-chart-5",
};

const Plans = () => {
  return (
    <MainLayout title="پلن‌ها و خدمات" subtitle="مدیریت پلن‌های مالی و خدمات مشاوره">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="جستجوی پلن..." className="pr-9" />
        </div>
        <Button size="sm">
          <Plus className="ml-2 h-4 w-4" />
          پلن جدید
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">کل پلن‌ها</p>
          <p className="text-2xl font-bold text-foreground">۸</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">پلن‌های فعال</p>
          <p className="text-2xl font-bold text-success">۶</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">ثبت‌نام فعال</p>
          <p className="text-2xl font-bold text-foreground">۱۲۰</p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">درآمد ماهانه</p>
          <p className="text-2xl font-bold number-display text-primary">۸۵M</p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockPlans.map((plan) => (
          <div key={plan.id} className="card-elevated p-5 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mb-2", typeColors[plan.type])}>
                  {typeLabels[plan.type]}
                </span>
                <h3 className="font-bold text-foreground text-lg">{plan.name}</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-bold number-display text-foreground">{plan.price}</span>
              <span className="text-sm text-muted-foreground">تومان</span>
              {plan.discount && (
                <Badge variant="secondary" className="bg-success/15 text-success mr-2">
                  <Tag className="ml-1 h-3 w-3" />
                  {plan.discount} تخفیف
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{plan.students} دانش‌آموز</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{typeLabels[plan.type]}</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">امکانات:</p>
              <ul className="space-y-1.5">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-success shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-4 border-t flex gap-2">
              <Button variant="outline" size="sm" className="flex-1">ویرایش</Button>
              <Button size="sm" className="flex-1">مشاهده</Button>
            </div>
          </div>
        ))}

        {/* Add New Plan Card */}
        <div className="card-elevated p-5 border-dashed flex flex-col items-center justify-center text-center min-h-[320px] cursor-pointer hover:border-primary/50 transition-colors">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground mb-1">پلن جدید</h3>
          <p className="text-sm text-muted-foreground">یک پلن مالی جدید تعریف کنید</p>
        </div>
      </div>
    </MainLayout>
  );
};

export default Plans;
