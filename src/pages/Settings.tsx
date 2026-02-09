import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  User,
  Shield,
  Bell,
  CreditCard,
  Palette,
  Save,
} from "lucide-react";

const Settings = () => {
  return (
    <MainLayout title="تنظیمات" subtitle="تنظیمات سیستم و پروفایل">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="general" className="data-[state=active]:bg-background">
            <Building2 className="ml-2 h-4 w-4" />
            عمومی
          </TabsTrigger>
          <TabsTrigger value="profile" className="data-[state=active]:bg-background">
            <User className="ml-2 h-4 w-4" />
            پروفایل
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-background">
            <Shield className="ml-2 h-4 w-4" />
            امنیت
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-background">
            <Bell className="ml-2 h-4 w-4" />
            اعلان‌ها
          </TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:bg-background">
            <CreditCard className="ml-2 h-4 w-4" />
            پرداخت
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات عمومی</h3>
            <div className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">نام مجموعه</label>
                <Input defaultValue="گروه مشاوره تحصیلی و روانشناسی" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره تماس</label>
                <Input defaultValue="۰۲۱-۸۸۸۸۸۸۸۸" dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">آدرس</label>
                <Input defaultValue="تهران، خیابان ولیعصر، پلاک ۱۲۳" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ایمیل</label>
                <Input defaultValue="info@example.com" dir="ltr" className="text-right" />
              </div>
              <Button>
                <Save className="ml-2 h-4 w-4" />
                ذخیره تغییرات
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">اطلاعات پروفایل</h3>
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  م
                </div>
                <Button variant="outline">تغییر تصویر</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">نام</label>
                  <Input defaultValue="مدیر" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">نام خانوادگی</label>
                  <Input defaultValue="سیستم" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ایمیل</label>
                <Input defaultValue="admin@example.com" dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره موبایل</label>
                <Input defaultValue="۰۹۱۲۱۲۳۴۵۶۷" dir="ltr" className="text-right" />
              </div>
              <Button>
                <Save className="ml-2 h-4 w-4" />
                ذخیره تغییرات
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات امنیتی</h3>
            <div className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">رمز عبور فعلی</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">رمز عبور جدید</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">تکرار رمز عبور</label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">احراز هویت دو مرحله‌ای</p>
                  <p className="text-sm text-muted-foreground">افزایش امنیت حساب کاربری</p>
                </div>
                <Switch />
              </div>
              <Button>
                <Save className="ml-2 h-4 w-4" />
                ذخیره تغییرات
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات اعلان‌ها</h3>
            <div className="space-y-4 max-w-xl">
              {[
                { title: "پرداخت جدید", desc: "اعلان دریافت پرداخت جدید" },
                { title: "بدهی جدید", desc: "اعلان ثبت بدهی جدید" },
                { title: "یادآوری سررسید", desc: "اعلان نزدیک شدن سررسید" },
                { title: "گزارش روزانه", desc: "ارسال گزارش روزانه" },
                { title: "گزارش هفتگی", desc: "ارسال گزارش هفتگی" },
              ].map((item) => (
                <div key={item.title} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات پرداخت</h3>
            <div className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره کارت</label>
                <Input defaultValue="۶۲۱۹-۸۶۱۲-****-****" dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره شبا</label>
                <Input defaultValue="IR**************************" dir="ltr" className="text-right" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">درگاه پرداخت آنلاین</p>
                  <p className="text-sm text-muted-foreground">اتصال به درگاه زرین‌پال</p>
                </div>
                <Button variant="outline" size="sm">اتصال</Button>
              </div>
              <Button>
                <Save className="ml-2 h-4 w-4" />
                ذخیره تغییرات
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Settings;
