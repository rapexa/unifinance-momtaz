import { useQuery } from "@tanstack/react-query";
import { getSiteInfo } from "@/api/siteApi";

/** Public installation info (vendor mode, product and organization name). */
export function useSiteInfo() {
  return useQuery({
    queryKey: ["site-info"],
    queryFn: getSiteInfo,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
