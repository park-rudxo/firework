import { deliverPending } from "@/features/mattermost/delivery";
import { sameSecret } from "@/features/mattermost/oauth";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !sameSecret(request.headers.get("authorization") ?? "", "Bearer " + secret))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await deliverPending());
}

