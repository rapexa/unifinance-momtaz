import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  User,
  Shield,
  Bell,
  CreditCard,
  Save,
  CalendarDays,
  Plus,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Download,
} from "lucide-react";
import {
  getOrganization,
  updateOrganization,
  getProfile,
  updateProfile,
  uploadProfileAvatar,
  getUploadsBase,
  changePassword,
  toggle2FA,
  getNotifications,
  updateNotifications,
  getPaymentSettings,
  updatePaymentSettings,
  listFiscalYears,
  getCurrentFiscalYear,
  createFiscalYear,
  closeFiscalYear,
  type OrganizationSettings,
  type Profile,
  type NotificationSettingItem,
  type PaymentSettings,
  type FiscalYear,
} from "@/api/settingsApi";
import { gregorianIsoToJalali, jalaliToGregorianIso } from "@/lib/jalaliDate";
import { SHAMSI_MONTH_NAMES } from "@/lib/shamsi";

const NOTIFICATION_LABELS: Record<string, { title: string; desc: string }> = {
  NEW_PAYMENT: { title: "پرداخت جدید", desc: "اعلان دریافت پرداخت جدید" },
  NEW_DEBT: { title: "بدهی جدید", desc: "اعلان ثبت بدهی جدید" },
  DUE_REMINDER: { title: "یادآوری سررسید", desc: "اعلان نزدیک شدن سررسید" },
  DAILY_REPORT: { title: "گزارش روزانه", desc: "ارسال گزارش روزانه" },
  WEEKLY_REPORT: { title: "گزارش هفتگی", desc: "ارسال گزارش هفتگی" },
};

const Settings = () => {
  const queryClient = useQueryClient();
  const [genName, setGenName] = useState("");
  const [genPhone, setGenPhone] = useState("");
  const [genAddress, setGenAddress] = useState("");
  const [genEmail, setGenEmail] = useState("");

  const [profFirstName, setProfFirstName] = useState("");
  const [profLastName, setProfLastName] = useState("");
  const [profEmail, setProfEmail] = useState("");
  const [profPhone, setProfPhone] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [twoFA, setTwoFA] = useState(false);

  const [notifItems, setNotifItems] = useState<NotificationSettingItem[]>([]);

  const [payCard, setPayCard] = useState("");
  const [payIban, setPayIban] = useState("");
  const [payGateway, setPayGateway] = useState("");
  const [payMerchantId, setPayMerchantId] = useState("");
  const [payCallback, setPayCallback] = useState("");
  const [payConnected, setPayConnected] = useState(false);

  // Fiscal year state
  const [newFYName, setNewFYName] = useState("");
  const [newFYStartJalali, setNewFYStartJalali] = useState("");
  const [showNewFYDialog, setShowNewFYDialog] = useState(false);
  const [showCloseFYDialog, setShowCloseFYDialog] = useState(false);
  const [closedFY, setClosedFY] = useState<FiscalYear | null>(null);
  const [fyError, setFyError] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["settings-profile"],
    queryFn: getProfile,
  });
  useEffect(() => {
    if (profile) {
      setProfFirstName(profile.first_name ?? "");
      setProfLastName(profile.last_name ?? "");
      setProfEmail(profile.email ?? "");
      setProfPhone(profile.phone ?? "");
      setTwoFA(profile.two_factor_enabled ?? false);
    }
  }, [profile]);

  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ["settings-organization"],
    queryFn: getOrganization,
    enabled: profile?.role === "ADMIN",
  });
  useEffect(() => {
    if (org) {
      setGenName(org.name ?? "");
      setGenPhone(org.phone ?? "");
      setGenAddress(org.address ?? "");
      setGenEmail(org.email ?? "");
    }
  }, [org]);

  const { data: notifs } = useQuery({
    queryKey: ["settings-notifications"],
    queryFn: getNotifications,
  });
  useEffect(() => {
    if (notifs && notifs.length) setNotifItems(notifs);
  }, [notifs]);

  const { data: paymentSettings } = useQuery({
    queryKey: ["settings-payments"],
    queryFn: getPaymentSettings,
    enabled: profile?.role === "ADMIN",
  });
  useEffect(() => {
    if (paymentSettings) {
      setPayCard(paymentSettings.card_number ?? "");
      setPayIban(paymentSettings.iban ?? "");
      setPayGateway(paymentSettings.gateway_provider ?? "");
      setPayMerchantId(paymentSettings.gateway_merchant_id ?? "");
      setPayCallback(paymentSettings.gateway_callback_url ?? "");
      setPayConnected(paymentSettings.is_gateway_connected ?? false);
    }
  }, [paymentSettings]);

  const orgMutation = useMutation({
    mutationFn: (p: Partial<OrganizationSettings>) => updateOrganization(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings-organization"] }),
  });
  const profileMutation = useMutation({
    mutationFn: (p: Partial<Profile>) => updateProfile(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadProfileAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
    },
  });
  const twoFAMutation = useMutation({
    mutationFn: (enabled: boolean) => toggle2FA(enabled),
    onSuccess: (_, enabled) => {
      setTwoFA(enabled);
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    },
  });
  const notifMutation = useMutation({
    mutationFn: (settings: NotificationSettingItem[]) => updateNotifications(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings-notifications"] }),
  });
  const paymentMutation = useMutation({
    mutationFn: (p: Partial<PaymentSettings>) => updatePaymentSettings(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings-payments"] }),
  });

  const { data: fiscalYears = [], isLoading: fyLoading } = useQuery({
    queryKey: ["fiscal-years"],
    queryFn: listFiscalYears,
  });
  const { data: currentFY } = useQuery({
    queryKey: ["fiscal-year-current"],
    queryFn: getCurrentFiscalYear,
  });

  const createFYMutation = useMutation({
    mutationFn: (p: { name: string; start_date: string }) => createFiscalYear(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setShowNewFYDialog(false);
      setNewFYName("");
      setNewFYStartJalali("");
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const closeFYMutation = useMutation({
    mutationFn: (id: number) => closeFiscalYear(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setShowCloseFYDialog(false);
      setClosedFY(data);
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const handleSaveGeneral = () => {
    orgMutation.mutate({ name: genName, phone: genPhone, address: genAddress, email: genEmail });
  };
  const handleSaveProfile = () => {
    profileMutation.mutate({
      first_name: profFirstName,
      last_name: profLastName,
      email: profEmail,
      phone: profPhone,
    });
  };
  const handleSavePassword = () => {
    if (newPassword !== repeatPassword) return;
    passwordMutation.mutate();
  };
  const handleToggleNotif = (type: string, enabled: boolean) => {
    const next = notifItems.map((s) => (s.type === type ? { ...s, enabled } : s));
    if (!next.find((s) => s.type === type)) next.push({ type, enabled });
    setNotifItems(next);
    notifMutation.mutate(next);
  };
  const handleSavePayments = () => {
    paymentMutation.mutate({
      card_number: payCard,
      iban: payIban,
      gateway_provider: payGateway,
      gateway_merchant_id: payMerchantId,
      gateway_callback_url: payCallback,
      is_gateway_connected: payConnected,
    });
  };

  const isEnabled = (type: string) => notifItems.find((s) => s.type === type)?.enabled ?? false;

  const handleCreateFY = () => {
    setFyError("");
    if (!newFYName.trim()) { setFyError("نام سال مالی الزامی است"); return; }
    if (!newFYStartJalali.trim()) { setFyError("تاریخ شروع الزامی است"); return; }
    const gregorianStart = jalaliToGregorianIso(newFYStartJalali);
    if (!gregorianStart) { setFyError("فرمت تاریخ اشتباه است. مثال: ۱۴۰۴/۰۱/۰۱"); return; }
    createFYMutation.mutate({ name: newFYName.trim(), start_date: gregorianStart });
  };

  const fyMonthName = (iso: string | null) => {
    if (!iso) return "—";
    const jalali = gregorianIsoToJalali(iso.slice(0, 10));
    if (!jalali) return "—";
    const [jy, jm] = jalali.split("/").map(Number);
    const monthName = SHAMSI_MONTH_NAMES[jm] ?? "";
    return `${monthName} ${jy}`;
  };

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
          <TabsTrigger value="fiscal-year" className="data-[state=active]:bg-background">
            <CalendarDays className="ml-2 h-4 w-4" />
            سال مالی
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات عمومی (اطلاعات سایت)</h3>
            {orgLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
            <div className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">نام مجموعه</label>
                <Input value={genName} onChange={(e) => setGenName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره تماس</label>
                <Input value={genPhone} onChange={(e) => setGenPhone(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">آدرس</label>
                <Input value={genAddress} onChange={(e) => setGenAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ایمیل</label>
                <Input value={genEmail} onChange={(e) => setGenEmail(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <Button onClick={handleSaveGeneral} disabled={orgMutation.isPending}>
                <Save className="ml-2 h-4 w-4" />
                {orgMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="profile">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">اطلاعات پروفایل</h3>
            {profileLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {profile?.avatar_url ? (
                    <img
                      src={`${getUploadsBase()}${profile.avatar_url}`}
                      alt="پروفایل"
                      className="h-20 w-20 rounded-full object-cover border-2 border-border"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                      {(profFirstName || profLastName || "م").charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">تصویر پروفایل</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="text-sm text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground file:cursor-pointer"
                    disabled={avatarMutation.isPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        avatarMutation.mutate(f);
                        e.target.value = "";
                      }
                    }}
                  />
                  {avatarMutation.isPending && <span className="text-xs text-muted-foreground">در حال بارگذاری...</span>}
                  {avatarMutation.isError && <span className="text-xs text-destructive">{(avatarMutation.error as Error).message}</span>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">نام</label>
                  <Input value={profFirstName} onChange={(e) => setProfFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">نام خانوادگی</label>
                  <Input value={profLastName} onChange={(e) => setProfLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">ایمیل</label>
                <Input value={profEmail} onChange={(e) => setProfEmail(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره موبایل</label>
                <Input value={profPhone} onChange={(e) => setProfPhone(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <Button onClick={handleSaveProfile} disabled={profileMutation.isPending}>
                <Save className="ml-2 h-4 w-4" />
                {profileMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
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
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">رمز عبور جدید</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">تکرار رمز عبور</label>
                <Input type="password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button onClick={handleSavePassword} disabled={passwordMutation.isPending || !currentPassword || !newPassword || newPassword !== repeatPassword}>
                <Save className="ml-2 h-4 w-4" />
                {passwordMutation.isPending ? "در حال ذخیره..." : "تغییر رمز عبور"}
              </Button>
              {passwordMutation.isError && <p className="text-sm text-destructive">{(passwordMutation.error as Error).message}</p>}

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">احراز هویت دو مرحله‌ای</p>
                  <p className="text-sm text-muted-foreground">افزایش امنیت حساب کاربری</p>
                </div>
                <Switch
                  checked={twoFA}
                  onCheckedChange={(checked) => twoFAMutation.mutate(checked)}
                  disabled={twoFAMutation.isPending}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">تنظیمات اعلان‌ها</h3>
            <div className="space-y-4 max-w-xl">
              {(Object.keys(NOTIFICATION_LABELS) as Array<keyof typeof NOTIFICATION_LABELS>).map((type) => (
                <div key={type} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{NOTIFICATION_LABELS[type].title}</p>
                    <p className="text-sm text-muted-foreground">{NOTIFICATION_LABELS[type].desc}</p>
                  </div>
                  <Switch
                    checked={isEnabled(type)}
                    onCheckedChange={(enabled) => handleToggleNotif(type, enabled)}
                    disabled={notifMutation.isPending}
                  />
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
                <Input value={payCard} onChange={(e) => setPayCard(e.target.value)} dir="ltr" className="text-right" placeholder="۶۲۱۹-۸۶۱۲-****-****" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">شماره شبا</label>
                <Input value={payIban} onChange={(e) => setPayIban(e.target.value)} dir="ltr" className="text-right" placeholder="IR..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">درگاه پرداخت (مثلاً ZARINPAL)</label>
                <Input value={payGateway} onChange={(e) => setPayGateway(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">مرچنت / کلید API</label>
                <Input value={payMerchantId} onChange={(e) => setPayMerchantId(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">آدرس بازگشت (Callback)</label>
                <Input value={payCallback} onChange={(e) => setPayCallback(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">درگاه متصل است</p>
                  <p className="text-sm text-muted-foreground">اتصال به درگاه زرین‌پال یا سایر درگاه‌ها</p>
                </div>
                <Switch checked={payConnected} onCheckedChange={setPayConnected} />
              </div>
              <Button onClick={handleSavePayments} disabled={paymentMutation.isPending}>
                <Save className="ml-2 h-4 w-4" />
                {paymentMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="fiscal-year">
          <div className="space-y-6">
            {/* Current fiscal year status */}
            <div className="card-elevated p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">سال مالی جاری</h3>
                {!currentFY && !fyLoading && (
                  <Button onClick={() => { setShowNewFYDialog(true); setFyError(""); }} size="sm">
                    <Plus className="ml-2 h-4 w-4" />
                    شروع سال مالی جدید
                  </Button>
                )}
              </div>

              {fyLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}

              {!fyLoading && !currentFY && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground font-medium">هیچ سال مالی فعالی وجود ندارد</p>
                  <p className="text-sm text-muted-foreground">برای شروع کار، یک سال مالی جدید تعریف کنید</p>
                  <Button className="mt-2" onClick={() => { setShowNewFYDialog(true); setFyError(""); }}>
                    <Plus className="ml-2 h-4 w-4" />
                    شروع سال مالی جدید
                  </Button>
                </div>
              )}

              {currentFY && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold text-foreground">{currentFY.name}</p>
                      <p className="text-sm text-muted-foreground">
                        از {fyMonthName(currentFY.start_date)} — هنوز باز است
                      </p>
                    </div>
                    <Badge variant="outline" className="text-green-700 border-green-500 bg-green-50 dark:bg-green-950">
                      باز
                    </Badge>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="p-4 rounded-lg bg-muted/40 text-center">
                      <p className="text-xs text-muted-foreground mb-1">تاریخ شروع</p>
                      <p className="font-bold text-foreground">{gregorianIsoToJalali(currentFY.start_date)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/40 text-center">
                      <p className="text-xs text-muted-foreground mb-1">وضعیت</p>
                      <p className="font-bold text-green-600">فعال و باز</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/40 text-center">
                      <p className="text-xs text-muted-foreground mb-1">شناسه</p>
                      <p className="font-bold text-foreground">#{currentFY.id}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-300">بستن سال مالی</p>
                        <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                          با بستن سال مالی، یک فایل اکسل از تمام داده‌های سال (دانش‌آموزان، پرداخت‌ها، حقوق) 
                          آماده می‌شود. پس از دانلود، می‌توانید سال مالی جدید شروع کنید.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      className="mt-3"
                      onClick={() => { setShowCloseFYDialog(true); setFyError(""); }}
                    >
                      <Lock className="ml-2 h-4 w-4" />
                      بستن سال مالی {currentFY.name}
                    </Button>
                  </div>
                </div>
              )}

              {/* Closed FY export notification */}
              {closedFY && (
                <div className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Download className="h-5 w-5 text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-800 dark:text-blue-300">سال مالی {closedFY.name} بسته شد</p>
                    {closedFY.export_url ? (
                      <a
                        href={closedFY.export_url}
                        download
                        className="text-sm text-blue-600 underline mt-1 inline-block"
                      >
                        دانلود فایل اکسل سال مالی
                      </a>
                    ) : (
                      <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">سال مالی با موفقیت بسته شد.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Fiscal year history */}
            {fiscalYears.length > 0 && (
              <div className="card-elevated p-6">
                <h3 className="text-lg font-bold text-foreground mb-4">تاریخچه سال‌های مالی</h3>
                <div className="space-y-3">
                  {fiscalYears.map((fy) => (
                    <div key={fy.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
                      <div className="flex items-center gap-3">
                        {fy.status === "OPEN" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{fy.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fyMonthName(fy.start_date)}
                            {fy.end_date ? ` تا ${fyMonthName(fy.end_date)}` : " — ادامه دارد"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {fy.export_url && (
                          <a href={fy.export_url} download className="text-xs text-blue-600 underline flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            دانلود اکسل
                          </a>
                        )}
                        <Badge variant={fy.status === "OPEN" ? "default" : "secondary"}>
                          {fy.status === "OPEN" ? "باز" : "بسته"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly info card */}
            <div className="card-elevated p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">دوره‌های ماهانه</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <p>حقوق کارمندان ماه به ماه از بخش <strong className="text-foreground">حقوق</strong> ثبت و پرداخت می‌شود.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <p>واریزی‌های دانش‌آموزان به صورت ماهانه در بخش <strong className="text-foreground">پرداخت‌ها</strong> رصد می‌شود.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <p>گزارش کامل ماهانه و سالانه از بخش <strong className="text-foreground">گزارش‌ها</strong> قابل مشاهده است.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">•</span>
                  <p>پس از بستن سال مالی، تمام داده‌ها در فایل اکسل ذخیره می‌شود و سیستم برای سال جدید آماده می‌شود.</p>
                </div>
              </div>
            </div>
          </div>

          {/* New Fiscal Year Dialog */}
          <AlertDialog open={showNewFYDialog} onOpenChange={setShowNewFYDialog}>
            <AlertDialogContent className="max-w-md" dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>شروع سال مالی جدید</AlertDialogTitle>
                <AlertDialogDescription>
                  نام و تاریخ شروع سال مالی را وارد کنید. تمام ثبت‌ها از این تاریخ به بعد در این سال مالی ذخیره می‌شوند.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">نام سال مالی</label>
                  <Input
                    value={newFYName}
                    onChange={(e) => setNewFYName(e.target.value)}
                    placeholder="مثال: سال مالی ۱۴۰۴"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">تاریخ شروع (شمسی)</label>
                  <Input
                    value={newFYStartJalali}
                    onChange={(e) => setNewFYStartJalali(e.target.value)}
                    placeholder="مثال: ۱۴۰۴/۰۲/۰۱"
                    dir="ltr"
                    className="text-right"
                  />
                  <p className="text-xs text-muted-foreground">فرمت: سال/ماه/روز — مثلاً ۱۴۰۴/۰۲/۰۱ = اول اردیبهشت ۱۴۰۴</p>
                </div>
                {fyError && <p className="text-sm text-destructive">{fyError}</p>}
              </div>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleCreateFY(); }}
                  disabled={createFYMutation.isPending}
                >
                  {createFYMutation.isPending ? "در حال ذخیره..." : "شروع سال مالی"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Close Fiscal Year Dialog */}
          <AlertDialog open={showCloseFYDialog} onOpenChange={setShowCloseFYDialog}>
            <AlertDialogContent className="max-w-md" dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  بستن سال مالی {currentFY?.name}
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2 text-right">
                  <span className="block">این عملیات <strong>برگشت‌پذیر نیست</strong>. با ادامه:</span>
                  <span className="block">✅ یک فایل اکسل کامل از تمام داده‌های سال آماده می‌شود</span>
                  <span className="block">✅ سال مالی {currentFY?.name} بسته و قفل می‌شود</span>
                  <span className="block">✅ می‌توانید سال مالی جدید شروع کنید</span>
                  <span className="block mt-2 text-amber-600 font-medium">آیا مطمئن هستید؟</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {fyError && <p className="text-sm text-destructive px-1">{fyError}</p>}
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>انصراف</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentFY) closeFYMutation.mutate(currentFY.id);
                  }}
                  disabled={closeFYMutation.isPending}
                >
                  {closeFYMutation.isPending ? "در حال پردازش..." : "بله، سال مالی را ببند"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Settings;
