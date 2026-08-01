import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface SchoolContractApi {
  id: number;
  school_name: string;
  student_count: number;
  /** تعداد دانش‌آموزان ثبت‌شده زیر این قرارداد */
  registered_student_count?: number;
  unit_price_cents: number;
  total_amount_cents: number;
  paid_total_cents: number;
  remaining_balance_cents: number;
  status: string;
  notes?: string;
  start_date?: string | null;
  created_at: string;
}

export interface PaginatedSchoolContractsResponse {
  data: SchoolContractApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface ListSchoolContractsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  sort?: string;
}

export interface CreateSchoolContractPayload {
  school_name: string;
  student_count: number;
  unit_price_cents: number;
  notes?: string;
  start_date?: string;
  status?: string;
}

export type UpdateSchoolContractPayload = CreateSchoolContractPayload;

export async function listSchoolContracts(
  params: ListSchoolContractsParams = {},
): Promise<PaginatedSchoolContractsResponse> {
  const url = new URL(`${API_BASE}/school-contracts`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 20));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.sort) url.searchParams.set("sort", params.sort);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در دریافت قراردادهای مدرسه");
  }
  return data as PaginatedSchoolContractsResponse;
}

export async function listAllSchoolContracts(
  params: Omit<ListSchoolContractsParams, "page" | "page_size"> = {},
): Promise<SchoolContractApi[]> {
  const pageSize = 200;
  let page = 1;
  const all: SchoolContractApi[] = [];
  for (;;) {
    const res = await listSchoolContracts({ ...params, page, page_size: pageSize });
    all.push(...res.data);
    if (page >= (res.meta.total_pages || 1) || res.data.length === 0) break;
    page += 1;
  }
  return all;
}

export async function getSchoolContract(id: number): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "قرارداد مدرسه یافت نشد");
  }
  return data as SchoolContractApi;
}

export async function createSchoolContract(
  payload: CreateSchoolContractPayload,
): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در ثبت قرارداد مدرسه");
  }
  return data as SchoolContractApi;
}

export async function updateSchoolContract(
  id: number,
  payload: UpdateSchoolContractPayload,
): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در ویرایش قرارداد مدرسه");
  }
  return data as SchoolContractApi;
}

export async function deleteSchoolContract(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || "خطا در حذف قرارداد مدرسه");
  }
}
