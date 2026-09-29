import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { deleteRolePermanently, getRoleDeleteCheck, type RoleApi } from "@/api/rolesApi";

/**
 * Permanently deletes a role that has no linked students. When users still hold the role,
 * a replacement role must be chosen for them.
 */
export function DeleteRoleDialog({
  role,
  roles,
  onClose,
}: {
  role: RoleApi | null;
  roles: RoleApi[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reassignId, setReassignId] = useState("");

  const { data: check, isLoading } = useQuery({
    queryKey: ["role-delete-check", role?.id],
    queryFn: () => getRoleDeleteCheck(role!.id),
    enabled: role != null,
  });

  const mutation = useMutation({
    mutationFn: () => deleteRolePermanently(role!.id, reassignId ? Number(reassignId) : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      toast({ title: "نقش به‌طور کامل حذف شد" });
      setReassignId("");
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "حذف نقش انجام نشد", description: err.message });
    },
  });

  const needsReassign = (check?.users_count ?? 0) > 0;
  const blocked = check != null && !check.can_delete;
  const otherRoles = roles.filter((r) => r.id !== role?.id);

  return (
    <AlertDialog
      open={role != null}
      onOpenChange={(open) => {
        if (!open) {
          setReassignId("");
          onClose();
        }
      }}
    >
      <AlertDialogContent dir="rtl" className="text-right">
        <AlertDialogHeader>
          <AlertDialogTitle>حذف کامل نقش «{role?.name}»</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {isLoading && <p>در حال بررسی...</p>}
              {check?.is_system && <p className="text-destructive">نقش سیستمی (مدیرکل) قابل حذف نیست.</p>}
              {check && !check.is_system && check.students_count > 0 && (
                <p className="text-destructive">
                  {check.students_count.toLocaleString("fa-IR")} دانش‌آموز به این نقش منتسب است؛ ابتدا
                  دانش‌آموزان را به مشاور/نقش دیگری منتقل کنید.
                </p>
              )}
              {check && !blocked && (
                <p>
                  این نقش دانش‌آموزی ندارد و به‌طور کامل از سیستم حذف می‌شود (قابل بازگشت نیست).
                  {needsReassign &&
                    ` ${check.users_count.toLocaleString("fa-IR")} کاربر این نقش را دارند و به نقش جایگزین منتقل می‌شوند.`}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {check && !blocked && needsReassign && (
          <div className="grid gap-2">
            <label className="text-sm font-medium">نقش جایگزین برای کاربران</label>
            <Select value={reassignId} onValueChange={setReassignId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب نقش" />
              </SelectTrigger>
              <SelectContent>
                {otherRoles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!check || blocked || (needsReassign && !reassignId) || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "در حال حذف..." : "حذف کامل"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
