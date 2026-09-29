import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listBankAccounts } from "@/api/bankAccountsApi";

const NONE = "none";

/** Optional bank account picker; value "" means no account. */
export function BankAccountSelect({
  value,
  onChange,
  label = "حساب بانکی",
  placeholder = "بدون حساب مشخص",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const { data } = useQuery({
    queryKey: ["bank-accounts", "active"],
    queryFn: () => listBankAccounts({ activeOnly: true }),
    staleTime: 60_000,
  });
  const accounts = data?.data ?? [];
  if (accounts.length === 0 && !value) return null;
  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.title}
              {a.bank_name && a.bank_name !== a.title ? ` — ${a.bank_name}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
