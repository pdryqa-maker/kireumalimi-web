import Anthropic from "@anthropic-ai/sdk";
import { answer, type ChatTurn } from "@/lib/chatbot";
import { limitByClient, limitDaily } from "@/lib/rateLimit";

const MAX_TURNS = 20;
const MAX_LENGTH = 500;

function isValid(history: unknown): history is ChatTurn[] {
  return (
    Array.isArray(history) &&
    history.length > 0 &&
    history.length <= MAX_TURNS &&
    history.every(
      (turn) =>
        (turn?.role === "user" || turn?.role === "assistant") &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0 &&
        turn.content.length <= MAX_LENGTH,
    ) &&
    history[0].role === "user" &&
    history[history.length - 1].role === "user"
  );
}

export async function POST(request: Request) {
  const limited =
    limitByClient(request, "chat") ??
    limitDaily("chatDaily", "오늘 AI 답변 한도를 다 썼어요. 아래 버튼 질문은 계속 쓸 수 있어요.");
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!isValid(body?.messages)) {
    return Response.json({ error: "질문 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    return Response.json(await answer(body.messages));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Claude API 키를 확인해 주세요." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "요청이 많아요. 잠시 뒤 다시 시도해 주세요." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Claude API 오류 (${error.status})` }, { status: 502 });
    }
    throw error;
  }
}
