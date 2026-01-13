import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type InsertTopic } from "@shared/routes";

// Note: While the main logic provided in the prompt uses localStorage,
// I am generating these hooks to satisfy the requirement of interacting with the provided schema/backend.
// The actual implementation in Home.tsx will primarily follow the provided logic (localStorage + Direct API)
// to ensure the specific functionality requested works as intended, but these hooks are available for future server persistence.

export function useTopics() {
  return useQuery({
    queryKey: [api.topics.list.path],
    queryFn: async () => {
      const res = await fetch(api.topics.list.path);
      if (!res.ok) throw new Error("Failed to fetch topics");
      return api.topics.list.responses[200].parse(await res.json());
    },
    // Don't refetch automatically for this demo as we primarily use local state
    enabled: false 
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertTopic) => {
      const res = await fetch(api.topics.create.path, {
        method: api.topics.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create topic");
      return api.topics.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.topics.list.path] });
    },
  });
}
