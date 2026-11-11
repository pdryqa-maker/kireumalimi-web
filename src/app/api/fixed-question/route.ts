import type { NextRequest } from "next/server";
import data from "@/data/fixed_question.json";

const DAY = data.meta.default_day;

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const region = searchParams.get("region") ?? "";
  const fuel = searchParams.get("fuel") ?? "";
  const event = data.events.find((item) => item.id === data.meta.default_event);
  const answer = data.answers.find(
    (item) => item.event === data.meta.default_event && item.region === region && item.fuel === fuel,
  );
  const summary = (data.regions as Record<string, { name: string; events: Record<string, Record<string, {
    stations_analyzed: number;
    days: { day: number; date: string; unchanged: number; mean_moved_won: number; at_or_beyond_notice: number }[];
  }>> }>)[region]?.events[data.meta.default_event]?.[fuel];
  const day = summary?.days.find((item) => item.day === DAY);

  if (!answer || !event || !summary || !day) {
    return Response.json({ error: "해당 지역·유종의 답변이 없습니다." }, { status: 404 });
  }

  return Response.json({
    text: answer.text,
    // 화면에서 숫자를 크게 보여 주기 위한 값. 모두 집계 파일 그대로이며, 평균만 문장과 같은 방식(반올림)으로 정수로 맞춘다.
    figures: {
      event: event.id,
      effectiveDate: event.effective_date,
      changeWon: event.change_won,
      day: DAY,
      date: day.date,
      stations: summary.stations_analyzed,
      unchanged: day.unchanged,
      meanMovedWon: Math.floor(day.mean_moved_won + 0.5),
      atOrBeyondNotice: day.at_or_beyond_notice,
    },
    source: data.meta.source,
    label: data.meta.label,
  });
}
