export interface DecodedCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const value = typeof createdAt === "string" ? createdAt : createdAt.toISOString();
  return Buffer.from(JSON.stringify({ createdAt: value, id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as DecodedCursor).createdAt !== "string" ||
      typeof (parsed as DecodedCursor).id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return parsed as DecodedCursor;
  } catch {
    throw new Error("Cursor tidak valid");
  }
}
