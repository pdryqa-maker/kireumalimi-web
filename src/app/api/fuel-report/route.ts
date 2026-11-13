import { fuelReport } from "@/lib/fuelReport";
import { cleanLedger } from "@/lib/ledger";
import { OpinetError } from "@/lib/opinet";
import { cleanProfile } from "@/lib/profile";
import { limitByClient } from "@/lib/rateLimit";

// 내 주유 월간 리포트(AI 없이 계산). 장부와 내 차 정보는 브라우저가 보내므로 다시 검사해 쓴다.
// POST { ledger, profile, month? } → 이번 달(또는 month) 리포트
export async function POST(request: Request) {
  const limited = limitByClient(request, "data");
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const profile = cleanProfile(body?.profile);
  try {
    return Response.json(
      await fuelReport(cleanLedger(body?.ledger), {
        fuel: profile.fuel,
        kmpl: profile.kmpl,
        area: profile.area?.code ?? null,
        month: typeof body?.month === "string" ? body.month : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OpinetError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
