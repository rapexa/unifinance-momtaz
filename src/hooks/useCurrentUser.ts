import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, type Profile } from "@/api/settingsApi";

export function useCurrentUser() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ["current-user"],
    queryFn: getProfile,
    staleTime: 5 * 60 * 1000,
    retry: (_, error) => {
      const msg = (error as Error)?.message ?? "";
      if (msg.includes("401") || msg.includes("احراز")) return false;
      return true;
    },
  });

  const logout = () => {
    queryClient.removeQueries({ queryKey: ["current-user"] });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("accessToken");
      window.localStorage.removeItem("refreshToken");
    }
  };

  return {
    profile: profile as Profile | undefined,
    isLoading,
    isError,
    logout,
  };
}
