import type { SelectGeneratorJob } from "~/backend/schema";

export async function getJobDetailsWithNeighbors(
  id: string,
  limits?: { limitBefore?: number; limitAfter?: number },
  statusFilter = "COMPLETED"
): Promise<{ items: SelectGeneratorJob[]; initialIndex: number } | null> {
  if (!import.meta.env.VITE_BACKEND_URL) {
    console.error("VITE_BACKEND_URL is not set");
    // Return a structure that indicates no data but doesn't throw immediately
    return { items: [], initialIndex: -1 };
  }
  try {
    const limitBefore = limits?.limitBefore ?? 20; // Use reasonable defaults if not provided
    const limitAfter = limits?.limitAfter ?? 20;

    const url = `${import.meta.env.VITE_BACKEND_URL}/api/v1/images/gallery/${encodeURIComponent(
      id
    )}?limitBefore=${limitBefore}&limitAfter=${limitAfter}&status=${statusFilter}`;
    console.log("Fetching:", url); // Log URL for debugging
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "API fetch error:",
        response.status,
        response.statusText,
        `for ID: ${id}`
      );
      // Include response body if available for better debugging
      try {
        const errorBody = await response.text();
        console.error("API Error Body:", errorBody);
      } catch (e) {
        console.error("Could not read error body", e);
      }
      throw new Error(
        `Failed to fetch job details: ${response.status} ${response.statusText}`
      );
    }

    const data: {
      status: string;
      message: string;
      items: SelectGeneratorJob[];
      initialIndex: number;
    } = await response.json();

    if (data.status === "error") {
      console.error("Backend error response:", data.message, `for ID: ${id}`);
      throw new Error(`Backend error: ${data.message}`);
    }

    // Filter for viewable items (those with an imageKey)
    const viewableItems = data.items.filter(
      (item) => item.imageKey != null && item.imageKey !== ""
    );

    // Find the index of the requested ID within the *original* list to check if it exists
    const originalIndex = data.items.findIndex((item) => item.id === id);

    if (originalIndex === -1) {
      // The requested ID was not found in the list returned by the backend
      console.warn(`Requested job ID ${id} not found in the list.`);
      return { items: [], initialIndex: -1 };
    }

    // Find the index of the requested ID within the *viewable* list
    const initialViewableIndex = viewableItems.findIndex(
      (item) => item.id === id
    );

    if (
      !Array.isArray(data.items) ||
      data.initialIndex === undefined ||
      data.initialIndex === null ||
      data.initialIndex < -1 ||
      (data.items.length > 0 && data.initialIndex >= data.items.length) ||
      initialViewableIndex === -1
    ) {
      console.error(
        "Invalid data format, initial index issue, or requested ID not viewable for ID",
        id,
        "Data:",
        data,
        "Original Index:",
        originalIndex,
        "Initial Viewable Index:",
        initialViewableIndex
      );

      if (originalIndex !== -1 && initialViewableIndex === -1) {
        console.warn(
          `Requested job ID ${id} found, but it has no imageKey and cannot be displayed.`
        );
        return { items: [], initialIndex: -1 };
      }

      throw new Error(
        "Invalid data format, initial index issue, or requested image not viewable."
      );
    }

    if (data.items.length === 0 || viewableItems.length === 0) {
      return { items: [], initialIndex: -1 };
    }

    return {
      items: viewableItems,
      initialIndex: initialViewableIndex,
    };
  } catch (error) {
    console.error("Error fetching job details:", error);
    throw error;
  }
}
