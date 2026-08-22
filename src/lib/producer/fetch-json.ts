export async function parseJsonResponse<T>(res: Response, friendlyMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      try {
        const json = (await res.json()) as { error?: string };
        if (typeof json?.error === "string" && json.error.length > 0) {
          throw new Error(friendlyMessage);
        }
      } catch (err) {
        if (err instanceof Error && err.message === friendlyMessage) throw err;
      }
    }
    throw new Error(friendlyMessage);
  }

  if (!isJson) {
    throw new Error(friendlyMessage);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(friendlyMessage);
  }
}
