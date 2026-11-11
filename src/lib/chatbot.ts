// 자유 질문 챗봇. Claude가 질문을 이해해 조회 기능(도구)을 고르고, 숫자는 도구 결과만 쓴다.
import Anthropic from "@anthropic-ai/sdk";
import data from "@/data/fixed_question.json";
import { findCheapest, getStation, ULSAN_AREAS } from "@/lib/stations";

const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 5;
const FIXED_REGION = "ulsan_ulju";

const SYSTEM = `당신은 '기름알리미'의 주유 안내 챗봇입니다. 한국석유공사 오피넷 데이터로 울산 지역 주유소를 안내합니다.

지킬 것
- 가격, 순위, 날짜, 시각 같은 숫자는 도구 결과에 있는 값만 씁니다. 기억이나 추측으로 숫자를 만들지 않습니다.
- 주유소 가격을 말할 때는 오피넷에 보고된 가격이라 현장 가격과 다를 수 있다고 짧게 덧붙입니다. 상세 정보를 조회했다면 기준 시각도 함께 말합니다.
- 앞으로의 가격 예측이나 주유소의 의도 추정은 하지 않습니다.
- 지역을 말하지 않으면 울주군 기준으로 조회하고, 울주군 기준이라고 밝힙니다.
- 울산 밖 지역이나 도구로 답할 수 없는 질문이면, 지금은 울산 지역 최저가, 주유소 상세 정보, 지난 최고가격 고시 뒤 울주군 가격 변화를 안내할 수 있다고 알립니다.
- 존댓말로 5문장 안쪽으로 답합니다. 별표, 샵, 표 같은 마크다운 기호는 쓰지 않습니다. 여러 곳을 알려 줄 때는 줄을 바꿔 번호를 붙입니다.`;

const FUELS = ["휘발유", "고급휘발유", "경유", "실내등유", "자동차부탄"];

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_cheapest_stations",
    description:
      "울산 지역에서 지정한 유종이 가장 싼 주유소 최대 5곳을 가격순으로 돌려준다. 결과에는 주유소 ID, 이름, 상표, 가격(원/L), 주소가 있다. 기준 시각은 없으므로 필요하면 get_station_detail로 확인한다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fuel: { type: "string", enum: FUELS, description: "유종" },
        area: {
          type: "string",
          enum: Object.keys(ULSAN_AREAS),
          description: Object.entries(ULSAN_AREAS)
            .map(([code, name]) => `${code}=${name}`)
            .join(", "),
        },
      },
      required: ["fuel", "area"],
      additionalProperties: false,
    },
  },
  {
    name: "get_station_detail",
    description:
      "주유소 ID로 상세 정보를 돌려준다. 유종별 가격과 그 가격의 기준 시각, 상표, 주소, 전화, 품질인증 여부가 있다. ID는 find_cheapest_stations 결과에서 얻는다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { station_id: { type: "string", description: "오피넷 주유소 ID (예: A0028937)" } },
      required: ["station_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_last_notice_change",
    description:
      "지난 최고가격 고시(7차, 2026년 6월 27일, 리터당 150원 인하) 뒤 울산 울주군 주유소들이 가격을 언제 얼마나 내렸는지 요약한 과거 기록을 돌려준다. 현재 가격이 아니다. 울주군 외 지역은 지원하지 않는다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { fuel: { type: "string", enum: ["휘발유", "경유"] } },
      required: ["fuel"],
      additionalProperties: false,
    },
  },
];

async function runTool(name: string, input: Record<string, string>) {
  switch (name) {
    case "find_cheapest_stations":
      return findCheapest(input.fuel, input.area);
    case "get_station_detail":
      return (await getStation(input.station_id)) ?? { error: "주유소를 찾지 못했습니다." };
    case "get_last_notice_change": {
      const answer = data.answers.find(
        (item) =>
          item.region === FIXED_REGION && item.event === data.meta.default_event && item.fuel === input.fuel,
      );
      return answer ? { summary: answer.text, source: data.meta.source } : { error: "기록이 없습니다." };
    }
    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

const client = new Anthropic();

export async function answer(history: ChatTurn[]) {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) => ({ ...turn }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return "이 질문에는 답하기 어려워요. 울산 지역 주유소 가격을 물어봐 주세요.";
    }

    // 도구 사용 중 생긴 thinking 블록까지 그대로 다시 보내야 하므로 content 전체를 붙인다.
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
    );
    if (response.stop_reason === "pause_turn") {
      continue;
    }
    if (toolUses.length === 0) {
      return response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      try {
        const result = await runTool(toolUse.name, toolUse.input as Record<string, string>);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error instanceof Error ? error.message : "조회에 실패했습니다.",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return "조회가 길어져 답을 마치지 못했어요. 질문을 조금 더 짧게 해 주세요.";
}
