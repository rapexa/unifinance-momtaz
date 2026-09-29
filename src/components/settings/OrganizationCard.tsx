import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { getOrganization, updateOrganization } from "@/api/settingsApi";

/**
 * Organization details shown to students (payment page), in SMS texts ({مرکز}),
 * the sidebar and browser titles.
 */
export function OrganizationCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["organization"], queryFn: getOrganization });
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });

  useEffect(() => {
    if (data) setForm({ name: data.name ?? "", phone: data.phone ?? "", email: data.email ?? "", address: data.address ?? "" });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateOrganization({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization"] });
      queryClient.invalidateQueries({ queryKey: ["site-info"] });
      toast({ title: "مشخصات مجموعه ذخیره شد" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطا در ذخیره", description: e.message }),
  });

  const field = (key: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} {...props} />
    </label>
  );

  return (
    <div className="card-elevated space-y-4 p-4 sm:p-5" dir="rtl">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Building2 className="h-5 w-5 text-primary" />
          مشخصات مجموعه
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          نام مجموعه در صفحه پرداخت دانش‌آموزان، متن پیامک‌ها ({"{مرکز}"}) و منوی کناری نمایش داده می‌شود.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "نام مجموعه")}
        {field("phone", "تلفن", { dir: "ltr", className: "text-right" })}
        {field("email", "ایمیل", { dir: "ltr", className: "text-right", type: "email" })}
        {field("address", "آدرس")}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending}>
          {mutation.isPending ? "در حال ذخیره..." : "ذخیره مشخصات"}
        </Button>
      </div>
    </div>
  );
}
