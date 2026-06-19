import type { SelectGeneratorJob } from "~/backend/schema";

export async function getJobDetailsWithNeighbors(
  id: string,
  statusFilter = "COMPLETED",
): Promise<{ items: SelectGeneratorJob[] } | null> {
  if (!import.meta.env.VITE_BACKEND_URL) {
    console.error("VITE_BACKEND_URL is not set");
    // Return a structure that indicates no data but doesn't throw immediately
    return { items: [] };
  }
  try {
    const url = `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/gallery/${encodeURIComponent(
      id,
    )}?status=${statusFilter}`;
    console.log("Fetching:", url); // Log URL for debugging
    const response = await fetch(url, { credentials: "include" });

    return response.json();
  } catch (error) {
    console.error("Error fetching job details:", error);
    throw error;
  }
}
