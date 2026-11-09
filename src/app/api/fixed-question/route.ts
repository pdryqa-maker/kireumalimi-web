import type { NextRequest } from "next/server";
import data from "@/data/fixed_question.json";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const answer = data.answers.find(
    (item) =>
      item.event === data.meta.default_event &&
      item.region === searchParams.get("region") &&
      item.fuel === searchParams.get("fuel"),
  );

  if (!answer) {
    return Response.json({ error: "해당 지역·유종의 답변이 없습니다." }, { status: 404 });
  }

  return Response.json({
    text: answer.text,
    event: answer.event,
    day: answer.day,
    source: data.meta.source,
    label: data.meta.label,
  });
}
