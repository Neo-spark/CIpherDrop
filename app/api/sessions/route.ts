import { createSession } from "@/lib/signaling";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return createSession(request);
}
