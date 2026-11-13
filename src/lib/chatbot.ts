// 자유 질문 챗봇. Claude가 질문을 이해해 조회 기능(도구)을 고르고, 숫자는 도구 결과만 쓴다.
// 답을 보내기 전에 서버가 답변 속 숫자를 도구 결과와 대조하고, 맞지 않으면 한 번 다시 쓰게 한 뒤 그래도 틀리면 막는다.
import Anthropic from "@anthropic-ai/sdk";
import data from "@/data/fixed_question.json";
import { checkNumbers, collectAllowed } from "@/lib/numbers";
import { PLACES } from "@/lib/places";
import { FUEL_TAX_CUT, taxCutImpact } from "@/lib/policy";
import { findByTotalCost, findCheapest, getStation, ULSAN_AREAS } from "@/lib/stations";

const MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 6;
const FIXED_REGION = "ulsan_ulju";

const SYSTEM = `당신은 '기름알리미'의 주유 안내 챗봇입니다. 한국석유공사 오피넷 데이터와 정부가 발표한 연료 제도 값으로 울산 지역 주유소와 연료비를 안내합니다.

지킬 것
- 가격, 금액, 거리, 날짜, 시각 같은 숫자는 도구 결과에 있는 값을 그대로 옮겨 씁니다. 직접 더하거나 빼거나 반올림한 숫자, 기억이나 추측으로 만든 숫자는 쓰지 않습니다. 4,880원을 '약 5천 원'처럼 바꾸지 않습니다. 서버가 답변의 숫자를 도구 결과와 대조해 맞지 않으면 답을 보내지 않습니다.
- 시각은 도구 결과의 한국 시각(fetchedAtKst, updatedAt)을 씁니다.
- 주유소 가격을 말할 때는 오피넷에 보고된 가격이라 현장 가격과 다를 수 있다고 짧게 덧붙입니다. 상세 정보를 조회했다면 기준 시각도 함께 말합니다.
- 앞으로의 가격 예측이나 주유소의 의도 추정은 하지 않습니다. 다만 정부가 발표한 유류세 인하 종료일과 그때 내 주유량에서 더 드는 최대 금액은 예측이 아니라 발표된 값의 계산이므로 get_fuel_tax_change로 답하고, 금액 앞에 '최대'를 붙입니다.
- 거리까지 따진 추천을 원하거나 '근처', '가까운', 읍면 이름(예: 언양, 범서)이 나오면 find_by_total_cost를 씁니다. 주유량을 말하지 않으면 40리터, 연비를 말하지 않으면 12km/L로 계산하고 그 가정과 직선거리라는 점을 밝힙니다.
- '1,750원 밑이면 알려 줘'처럼 가격 알림을 원하면 propose_price_alert로 조건을 제안합니다. 알림은 이용자가 화면에서 저장을 눌러야 만들어지므로 저장했다고 말하지 말고, 아래 카드에서 확인해 달라고 합니다.
- 지역을 말하지 않으면 울주군 기준으로 조회하고, 울주군 기준이라고 밝힙니다.
- 대화 기록에는 화면 카드로 보여 준 답이 요약으로 들어 있습니다. 이미 답한 질문에 다시 답하지 말고 마지막 질문에만 답합니다.
- 울산 밖 지역이나 도구로 답할 수 없는 질문이면, 지금 안내할 수 있는 것(울산 최저가, 주유소 상세, 울주군 읍면 기준 거리까지 따진 추천, 유류세 인하 종료 시 최대 금액, 가격 알림 조건, 지난 최고가격 고시 뒤 울주군 가격 변화)을 알립니다.
- 존댓말로 5문장 안쪽으로 답합니다. 별표, 샵, 표 같은 마크다운 기호는 쓰지 않습니다. 여러 곳을 알려 줄 때는 줄을 바꿔 번호를 붙입니다.`;

const FUELS = ["휘발유", "고급휘발유", "경유", "실내등유", "자동차부탄"];
const TAX_FUELS = Object.keys(FUEL_TAX_CUT.fuels);
const describe = (entries: [string, string][]) => entries.map(([code, name]) => `${code}=${name}`).join(", ");

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_cheapest_stations",
    description:
      "울산 지역에서 지정한 유종이 가장 싼 주유소 최대 5곳을 가격순으로 돌려준다. 결과에는 주유소 ID, 이름, 상표, 가격(원/L), 주소, 조회 시각(fetchedAtKst)이 있다. 가격별 기준 시각은 없으므로 필요하면 get_station_detail로 확인한다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fuel: { type: "string", enum: FUELS, description: "유종" },
        area: {
          type: "string",
          enum: Object.keys(ULSAN_AREAS),
          description: describe(Object.entries(ULSAN_AREAS)),
        },
      },
      required: ["fuel", "area"],
      additionalProperties: false,
    },
  },
  {
    name: "get_station_detail",
    description:
      "주유소 ID로 상세 정보를 돌려준다. 유종별 가격과 그 가격의 기준 시각(updatedAt, 한국 시각), 상표, 주소, 전화, 품질인증 여부가 있다. ID는 다른 조회 결과에서 얻는다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { station_id: { type: "string", description: "오피넷 주유소 ID (예: A0028937)" } },
      required: ["station_id"],
      additionalProperties: false,
    },
  },
  {
    name: "find_by_total_cost",
    description:
      "울주군 읍면 행정복지센터에서 반경 5km 안의 주유소를 실질비용(가격 × 주유량 + 직선 왕복 거리의 연료비) 순으로 최대 5곳 돌려준다. 가장 싼 곳(cheapest), 가장 가까운 곳(nearest), 가장 싼 곳까지 가면 더 드는 돈(extraForCheapestWon), 1km 더 가려면 리터당 몇 원 싸야 하는지(breakEvenWonPerKm)도 있다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fuel: { type: "string", enum: FUELS, description: "유종" },
        place: {
          type: "string",
          enum: Object.keys(PLACES),
          description: `출발 위치. ${describe(Object.entries(PLACES).map(([key, place]) => [key, place.name]))}`,
        },
        liters: { type: "integer", description: "주유량(리터). 말하지 않으면 40" },
        km_per_liter: { type: "number", description: "연비(km/L). 말하지 않으면 12" },
      },
      required: ["fuel", "place", "liters", "km_per_liter"],
      additionalProperties: false,
    },
  },
  {
    name: "get_fuel_tax_change",
    description: `정부가 발표한 유류세 인하의 종료 예정일, 인하율, 리터당 인하액과, 인하가 끝날 때 지정한 주유량에서 더 드는 최대 금액(maxExtraWon)을 돌려준다. 대상 유종은 ${TAX_FUELS.join(", ")}이다.`,
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fuel: { type: "string", enum: TAX_FUELS, description: "유종" },
        liters: { type: "integer", description: "주유량(리터). 말하지 않으면 40" },
      },
      required: ["fuel", "liters"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_price_alert",
    description:
      "'○원 밑이면 알려 줘' 같은 요청을 가격 알림 조건으로 만들어 이용자에게 확인을 받는다. 저장은 이용자가 화면에서 한다. 지정한 지역의 해당 유종 최저가가 기준 가격 이하가 되면 알리는 조건이다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        fuel: { type: "string", enum: FUELS, description: "유종" },
        area: {
          type: "string",
          enum: Object.keys(ULSAN_AREAS),
          description: describe(Object.entries(ULSAN_AREAS)),
        },
        below_won: { type: "integer", description: "기준 가격(원/L). 이 가격 이하가 되면 알린다" },
      },
      required: ["fuel", "area", "below_won"],
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

export type AlertProposal = { fuel: string; area: string; areaName: string; belowWon: number };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatAnswer = {
  text: string;
  // verified: 근거와 맞춘 숫자 개수. blocked: 숫자가 맞지 않아 답을 막음.
  check: { verified: number; blocked: boolean } | null;
  alert: AlertProposal | null;
};

const BLOCKED_TEXT =
  "답변 속 숫자를 조회 결과와 맞추지 못해 답을 보내지 않았어요. 질문을 조금 바꾸거나 아래 버튼 질문을 이용해 주세요.";

async function runTool(name: string, input: Record<string, unknown>, proposals: AlertProposal[]) {
  switch (name) {
    case "find_cheapest_stations":
      return findCheapest(String(input.fuel), String(input.area));
    case "get_station_detail":
      return (await getStation(String(input.station_id))) ?? { error: "주유소를 찾지 못했습니다." };
    case "find_by_total_cost":
      return findByTotalCost(String(input.fuel), String(input.place), Number(input.liters), Number(input.km_per_liter));
    case "get_fuel_tax_change":
      return taxCutImpact(String(input.fuel), Number(input.liters));
    case "propose_price_alert": {
      const fuel = String(input.fuel);
      const area = String(input.area);
      const belowWon = Number(input.below_won);
      // 엄격한 스키마는 범위를 검사하지 않으므로 여기서 확인한다.
      if (!FUELS.includes(fuel) || !(area in ULSAN_AREAS) || !Number.isInteger(belowWon) || belowWon < 500 || belowWon > 3000) {
        throw new RangeError("기준 가격은 500~3,000원 사이여야 합니다.");
      }
      const proposal = { fuel, area, areaName: ULSAN_AREAS[area], belowWon };
      proposals.push(proposal);
      return { status: "이용자 확인 대기(아직 저장되지 않음)", ...proposal };
    }
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

const client = new Anthropic();

export async function answer(history: ChatTurn[]): Promise<ChatAnswer> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((turn) => ({ ...turn }));
  // 대화에 이미 나온 숫자(이용자가 말한 주유량, 앞선 카드의 가격)와 이번 도구 결과의 숫자가 답변의 근거다.
  const allowed = collectAllowed(history.map((turn) => turn.content));
  const proposals: AlertProposal[] = [];
  let retried = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
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
      return { text: "이 질문에는 답하기 어려워요. 울산 지역 주유소 가격을 물어봐 주세요.", check: null, alert: null };
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
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      const alert = proposals.at(-1) ?? null;
      const { unknown, verified } = checkNumbers(text, allowed);
      if (unknown.length === 0) {
        return { text, check: { verified, blocked: false }, alert };
      }
      console.warn("숫자 대조 실패", { unknown, retried });
      if (retried) {
        return { text: BLOCKED_TEXT, check: { verified: 0, blocked: true }, alert };
      }
      retried = true;
      messages.push({
        role: "user",
        content: `[서버 확인] 답변의 숫자 ${unknown.join(", ")}가 도구 결과에 없습니다. 도구 결과에 있는 숫자만 그대로 옮겨 써서 같은 질문에 다시 답해 주세요. 이 확인 메시지는 언급하지 마세요.`,
      });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      try {
        const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>, proposals);
        collectAllowed([result], allowed);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "조회에 실패했습니다.";
        // 오류 안내에 든 숫자(허용 범위 등)를 AI가 옮겨 말할 수 있으므로 근거에 넣는다.
        collectAllowed([message], allowed);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { text: "조회가 길어져 답을 마치지 못했어요. 질문을 조금 더 짧게 해 주세요.", check: null, alert: null };
}
