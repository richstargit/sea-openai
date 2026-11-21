export async function studioRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

export function studioPost<T>(path: string, body: unknown) {
  return studioRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function playOverlay(event: object) {
  return studioPost<{ delivered: number }>("/agent/overlay/events", event);
}
