"use client";

// 내 기록 맨 위 '내 맞춤 요약': 다음 주유와 예상 비용, 유류세 일정, 단골 주유소, 이번 달 예상, 올해 아낀 돈, 실측 연비 추이.
// 숫자는 장부와 내 정보로 셈한다(usePersonal). 단골 점검과 나머지 달 셈하기는 누를 때만 오피넷을 부른다.
import Link from "next/link";
import { useState } from "react";
import { wonName } from "@/lib/fillAmount";
import { monthFingerprint, totals, vsAreaFinal, vsAreaKey } from "@/lib/fillTotals";
import type { LedgerEntry } from "@/lib/ledger";
import { costPhrase, monthDistance, nextMonthsToCount, planLiters, taxLine, yearSavings } from "@/lib/personal";
import type { Profile } from "@/lib/profile";
import { parseVsArea, vsAreaStore, type VsArea } from "@/lib/savedVsArea";
import { dayWithWeekday, won } from "./format";
import { checkFavorite, fetchVsArea, type FavoriteResult } from "./personalChecks";
import { usePersonal } from "./usePersonal";

const BUTTON = "rounded-full px-4 py-2 text-sm font-semibold shadow-raised-sm hover:bg-canvas disabled:opacity-50";
const MONTHS_PER_CLICK = 2;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium text-ink-soft sm:pt-1">{label}</dt>
      <dd className="min-w-0 text-[15px] leading-relaxed">{children}</dd>
    </div>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{children}</p>;

// 영수증 이름과 오피넷 이름이 다르면 어느 곳과 견줬는지 먼저 밝힌다.
function favoriteText(result: FavoriteResult, receiptName: string) {
  if ("error" in result) return result.error;
  const { name, areaName, diffWon, cheaper, monthlySaveWon } = result;
  const matched = name !== receiptName ? `오피넷 '${name}' 기준 · ` : "";
  const gap = diffWon === 0 ? `${areaName} 평균과 같아요` : `${areaName} 평균보다 리터당 ${won(Math.abs(diffWon))}원 ${diffWon > 0 ? "비싸요" : "싸요"}`;
  if (!cheaper) return `${matched}${gap} · 반경 5km 안에 이곳보다 덜 드는 곳이 없어요.`;
  const place = `근처 ${cheaper.name} 리터당 ${won(cheaper.paidPrice)}원${cheaper.discountWon ? "(할인 반영)" : ""}, 직선 ${cheaper.distanceKm}km`;
  return `${matched}${gap} · ${place}${monthlySaveWon ? ` · 바꾸면 한 달 약 ${wonName(monthlySaveWon)} 덜 들어요` : ""}`;
}

// 실측 연비 추이: 가득→가득 구간마다 작은 막대 하나. 가장 낮은 값도 보이게 바닥을 30%로 둔다.
function TrendBars({ trend }: { trend: { date: string; kmpl: number }[] }) {
  const values = trend.map((point) => point.kmpl);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return (
    <span aria-hidden="true" className="inline-flex h-6 items-end gap-1 align-middle">
      {trend.map((point) => (
        <span
          key={point.date}
          className="w-2 rounded-sm bg-accent/70 last:bg-accent"
          style={{ height: `${30 + (70 * (point.kmpl - min)) / span}%` }}
        />
      ))}
    </span>
  );
}

export default function PersonalSummary({
  profile,
  entries,
  today,
  areaCode,
  vsArea,
}: {
  profile: Profile;
  entries: LedgerEntry[];
  today: string;
  areaCode: string;
  vsArea: Record<string, VsArea>;
}) {
  const { fill, economy, plan, cost, tax, projection, favorite, monthly, trend } = usePersonal(profile, entries, today, areaCode);
  const [favoriteCheck, setFavoriteCheck] = useState<{ name: string; result: FavoriteResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const [counting, setCounting] = useState(false);
  const [countNote, setCountNote] = useState("");
  const [failedMonths, setFailedMonths] = useState<string[]>([]);

  const areaKey = profile.area?.code ?? "";
  const savings = yearSavings({ stored: vsArea, entries, fuel: profile.fuel, areaCode: areaKey, today });
  const thisMonth = today.slice(0, 7);
  const sum = totals(
    entries.filter((entry) => entry.date.startsWith(thisMonth)),
    economy.kmpl,
  );
  const shownFavorite = favorite && favoriteCheck?.name === favorite.name ? favoriteCheck.result : null;

  async function runFavorite() {
    if (!favorite) return;
    setChecking(true);
    const result = await checkFavorite(favorite.name, profile, monthly);
    setFavoriteCheck({ name: favorite.name, result });
    setChecking(false);
  }

  // 올해 아직 견주지 않은 지난 달을 앞에서부터 2달씩 받는다. 다 견준 달만 남긴다(vsAreaFinal).
  // 이번 화면에서 실패한 달은 뒤로 미뤄, 같은 두 달만 계속 부르지 않는다.
  async function countMore() {
    setCounting(true);
    setCountNote("");
    let missed = 0;
    const failedNow: string[] = [];
    for (const month of nextMonthsToCount(savings.uncheckedMonths, failedMonths, MONTHS_PER_CLICK)) {
      const fingerprint = vsAreaKey(profile.fuel, areaKey, entries, month);
      const priced = monthFingerprint(entries, month).split(",").length;
      try {
        const entry = await fetchVsArea(month, profile, fingerprint);
        if (vsAreaFinal(entry.comparedFills, priced, month, today)) {
          vsAreaStore.write({ ...parseVsArea(vsAreaStore.read()), [month]: entry });
        } else {
          missed++;
          failedNow.push(month);
        }
      } catch {
        missed++;
        failedNow.push(month);
      }
    }
    setFailedMonths((before) => [...before.filter((month) => !failedNow.includes(month)), ...failedNow]);
    if (missed > 0) setCountNote(`${missed}달은 오피넷 평균을 다 받지 못해 셈에서 뺐어요. 잠시 뒤 다시 눌러 주세요.`);
    setCounting(false);
  }

  // 이번 달 거리: 지금까지 넣은 양 + 남은 주유 × 한 번 넣는 양. 리터를 모르는 주유가 있으면 숨긴다(monthDistance).
  const distance = monthDistance({ sum, projection, perFillLiters: planLiters(profile.amount, fill, profile.fuel), kmpl: economy.kmpl });
  const latest = trend.at(-1);

  return (
    <section aria-labelledby="personal-title" className="mt-5 rounded-3xl bg-ground p-5 shadow-raised">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="personal-title" className="font-semibold">
          내 맞춤 요약
        </h2>
        <Link href="/login" className="text-xs text-ink-soft underline underline-offset-4">
          내 정보 고치기
        </Link>
      </div>
      {!plan && (
        <p className="mt-3 rounded-2xl bg-canvas px-4 py-3 text-sm leading-relaxed">
          주유 기록을 2번 남기거나 내 정보에 한 달 주행거리를 넣으면 다음 주유일을 알려 드려요.{" "}
          <Link href="/login" className="font-semibold underline underline-offset-4">
            내 정보 열기
          </Link>
        </p>
      )}
      <dl className="mt-1 divide-y divide-hairline">
        {plan && (
          <Row label="다음 주유">
            <p>
              <span className="font-semibold">{dayWithWeekday(plan.nextDate)}</span>
              {plan.due ? " · 지금 넣을 때예요" : ""}
            </p>
            {(cost || fill) && <Sub>{cost ? costPhrase(cost, profile.amount) : `${fill!.label}(평균가를 받으면 예상 금액도 보여요)`}</Sub>}
            <Sub>
              {plan.basis === "records"
                ? `최근 기록으로 평균 ${plan.gapDays}일마다 넣어요`
                : `기록이 모자라 한 달 ${(profile.monthlyKm ?? 0).toLocaleString("ko-KR")}km로 셈했어요 · ${plan.gapDays}일마다 넣는 셈`}
            </Sub>
          </Row>
        )}
        {tax && (
          <Row label="유류세 인하">
            <p>{taxLine(tax, fill?.label ?? null)}</p>
          </Row>
        )}
        <Row label="단골 주유소">
          {favorite ? (
            <>
              <p>
                <span className="font-semibold">{favorite.name}</span>
                <span className="text-ink-soft"> · {favorite.basis === "frequent" ? `최근 90일 ${favorite.visits}번` : "최근에 간 곳"}</span>
              </p>
              {shownFavorite && (
                <p role="status" className="mt-1 text-sm leading-relaxed">
                  {favoriteText(shownFavorite, favorite.name)}
                </p>
              )}
              {shownFavorite && !("error" in shownFavorite) && shownFavorite.monthlySaveWon && monthly?.basis === "monthlyKm" && (
                <Sub>한 달에 넣는 양은 한 달 주행거리 ÷ 연비로 셈했어요.</Sub>
              )}
              <button type="button" disabled={checking} onClick={runFavorite} className={`${BUTTON} mt-2`}>
                {checking ? "점검하는 중…" : "단골 주유소 점검"}
              </button>
            </>
          ) : (
            <p className="text-ink-soft">영수증에 주유소 이름이 남으면 단골을 찾아 동네 평균과 견줘 드려요.</p>
          )}
        </Row>
        <Row label="이번 달">
          {projection ? (
            <>
              <p>
                예상 <span className="font-semibold">{wonName(projection.projectedWon)}</span>
                {projection.lastMonthWon !== null ? `(지난달 ${wonName(projection.lastMonthWon)})` : ""}
                {distance.km !== null ? ` · 약 ${won(distance.km)}km` : ""}
                {distance.wonPerKm !== null ? ` · 1km당 ${won(distance.wonPerKm)}원` : ""}
              </p>
              <Sub>
                지금까지 {projection.spentWon > 0 ? wonName(projection.spentWon) : "0원"}
                {projection.remainingFills > 0 ? ` · 남은 주유 약 ${projection.remainingFills}번` : " · 이번 달 남은 주유 없음"}
              </Sub>
            </>
          ) : sum.fills > 0 ? (
            <p>
              지금까지 <span className="font-semibold">{won(sum.totalWon ?? 0)}원</span>
              {distance.km !== null ? ` · 약 ${won(distance.km)}km` : ""}
              {distance.wonPerKm !== null ? ` · 1km당 ${won(distance.wonPerKm)}원` : ""}
            </p>
          ) : (
            <p className="text-ink-soft">이번 달 주유 기록이 아직 없어요.</p>
          )}
        </Row>
        <Row label="올해 아낀 돈">
          {savings.checkedMonths > 0 ? (
            <p>
              시도 평균보다{" "}
              <span className="font-semibold">
                {won(Math.abs(savings.savedWon))}원 {savings.savedWon >= 0 ? "아꼈어요" : "더 썼어요"}
              </span>
              <span className="text-ink-soft">
                (확인한 {savings.checkedMonths}달{savings.includesThisMonth ? ", 이번 달은 오늘까지" : ""})
              </span>
            </p>
          ) : (
            <p className="text-ink-soft">
              {savings.uncheckedMonths.length > 0 ? "아직 견준 달이 없어요." : "단가가 있는 영수증을 남기면 시도 평균과 견줘 아낀 돈을 셈해요."}
            </p>
          )}
          {savings.uncheckedMonths.length > 0 && (
            <button type="button" disabled={counting} onClick={countMore} className={`${BUTTON} mt-2`}>
              {counting ? "셈하는 중…" : `나머지 달도 셈하기(${savings.uncheckedMonths.length}달 남음)`}
            </button>
          )}
          {countNote && (
            <p role="status" className="mt-1.5 text-sm text-ink-soft">
              {countNote}
            </p>
          )}
        </Row>
        <Row label="실측 연비 추이">
          {trend.length >= 2 && latest ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TrendBars trend={trend} />
              <span>
                <span className="font-semibold tabular-nums">{latest.kmpl}km/L</span>
                <span className="text-ink-soft">(최근)</span>
              </span>
              <span className="sr-only">구간별 연비: {trend.map((point) => `${point.kmpl}km/L`).join(", ")}</span>
            </p>
          ) : (
            <p className="text-ink-soft">가득 넣을 때 누적 주행거리를 남기면 연비 추이가 보여요.</p>
          )}
        </Row>
      </dl>
    </section>
  );
}
