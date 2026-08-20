import { handleSessionAction } from "@/lib/signaling";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ code: string; action: string }>;
};

export async function GET(request: Request, context: Context) {
  const { code, action } = await context.params;
  return handleSessionAction(request, code, action);
}

export async function POST(request: Request, context: Context) {
  const { code, action } = await context.params;
  return handleSessionAction(request, code, action);
}
