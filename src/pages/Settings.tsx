import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Save,
} from "lucide-react";
import {
  getOrganization,
  updateOrganization,
  getProfile,
  updateProfile,
  changePassword,
  toggle2FA,
  getNotifications,
  updateNotifications,
  getPaymentSettings,
  updatePaymentSettings,
  type OrganizationSettings,
  type Profile,
  type NotificationSettingItem,
  type PaymentSettings,
} from "@/api/settingsApi";

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
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {(profFirstName || profLastName || "م").charAt(0)}
                </div>
                <span className="text-sm text-muted-foreground">تغییر تصویر از طریق آدرس تصویر در آینده پشتیبانی می‌شود.</span>
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
      </Tabs>
    </MainLayout>
  );
};

export default Settings;
