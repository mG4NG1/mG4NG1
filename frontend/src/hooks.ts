import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Person, SmsStatus } from "@/src/api";

export function useTrades() {
  return useQuery({ queryKey: ["trades"], queryFn: () => api<string[]>("/trades"), staleTime: Infinity });
}

export function useSmsStatus() {
  return useQuery({ queryKey: ["sms-status"], queryFn: () => api<SmsStatus>("/sms/status"), staleTime: 5 * 60 * 1000 });
}

export function useIncomingRequests() {
  return useQuery({ queryKey: ["requests"], queryFn: () => api<Person[]>("/connections/requests"), refetchInterval: 15000 });
}

export function useAddPerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Person) =>
      p.connection === "received" && p.connection_id
        ? api(`/connections/${p.connection_id}/respond`, { method: "POST", body: { accept: true } })
        : api<Person>("/connections/request", { method: "POST", body: { user_id: p.user_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["search"] });
      qc.invalidateQueries({ queryKey: ["contacts-match"] });
      qc.invalidateQueries({ queryKey: ["nearby"] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["crew"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["person"] });
    },
  });
}
