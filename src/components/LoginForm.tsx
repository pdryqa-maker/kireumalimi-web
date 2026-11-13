"use client";

// 간편 로그인: 부를 이름, 내 위치, 내 차를 받아 이 브라우저에 저장한다. 비밀번호는 받지 않는다.
// 위치는 휴대폰 위치(정확도를 100m 단위로 줄여 저장) 또는 오피넷 지역코드(시도·시군구)로 받는다.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inKorea, toKatec } from "@/lib/katec";
import { cleanText, fuelName, GUEST, LIMITS, PROFILE_FUELS, profileStore, saveProfile, signedIn, type Profile } from "@/lib/profile";
import { LocateIcon } from "./icons";
import { useMounted, useProfile } from "./useStored";

type Area = { code: string; name: string };

const FIELD =
  "w-full min-w-0 rounded-2xl bg-ground px-4 py-3 text-[15px] shadow-inset-sm placeholder:text-ink-soft focus-visible:outline-offset-1";
const BUTTON = "rounded-full px-4 py-2.5 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";
const SELECT = `${FIELD} appearance-none pr-10`;
const round100 = (value: number) => Math.round(value / 100) * 100;

async function loadAreas(sido = ""): Promise<Area[]> {
  const response = await fetch(`/api/areas${sido ? `?sido=${sido}` : ""}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.areas)) throw new Error(body?.error ?? "지역 목록을 불러오지 못했어요.");
  return body.areas;
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 first-of-type:mt-6">
      <legend className="text-base font-semibold">{title}</legend>
      {note && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{note}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const saved = useProfile();
  const mounted = useMounted();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [sidos, setSidos] = useState<Area[] | null>(null);
  const [sido, setSido] = useState("");
  const [siguns, setSiguns] = useState<Area[]>([]);
  const [areaNote, setAreaNote] = useState("");
  const [error, setError] = useState("");

  const form = draft ?? saved;
  const edit = (next: Partial<Profile>) => {
    setDraft({ ...form, ...next });
    setError("");
  };
  const wasSignedIn = mounted && signedIn(saved);

  function locate() {
    if (!("geolocation" in navigator)) {
      setLocationNote("이 브라우저는 위치를 알려 주지 않아요. 아래에서 지역을 골라 주세요.");
      return;
    }
    setLocating(true);
    setLocationNote("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (!inKorea(coords.latitude, coords.longitude)) {
          setLocationNote("우리나라 밖 위치라 주유소를 찾을 수 없어요. 아래에서 지역을 골라 주세요.");
          return;
        }
        const { x, y } = toKatec(coords.latitude, coords.longitude);
        // 찾는 동안 바꾼 입력을 덮지 않도록 지금 값에 위치만 더한다.
        setDraft((current) => {
          const base = current ?? saved;
          return { ...base, location: { label: base.location?.label ?? "현재 위치", x: round100(x), y: round100(y) } };
        });
        setLocationNote("위치를 찾았어요. 이 위치에 이름을 붙여 두면 '집 근처'처럼 물을 수 있어요.");
      },
      (problem) => {
        setLocating(false);
        setLocationNote(
          problem.code === problem.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 브라우저에서 위치를 허용하거나 아래에서 지역을 골라 주세요."
            : "위치를 찾지 못했어요. 잠시 뒤 다시 누르거나 아래에서 지역을 골라 주세요.",
        );
      },
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  async function openAreas() {
    setAreaNote("");
    try {
      setSidos(await loadAreas());
    } catch (problem) {
      setAreaNote(problem instanceof Error ? problem.message : "지역 목록을 불러오지 못했어요.");
    }
  }

  async function chooseSido(code: string) {
    setSido(code);
    setSiguns([]);
    const chosen = sidos?.find((area) => area.code === code);
    if (!chosen) return;
    edit({ area: { code: chosen.code, name: chosen.name } });
    try {
      setSiguns(await loadAreas(code));
    } catch (problem) {
      setAreaNote(problem instanceof Error ? problem.message : "시군구 목록을 불러오지 못했어요.");
    }
  }

  function chooseSigun(code: string) {
    const parent = sidos?.find((area) => area.code === sido);
    const chosen = siguns.find((area) => area.code === code);
    if (parent && chosen) edit({ area: { code: chosen.code, name: `${parent.name} ${chosen.name}` } });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = cleanText(form.name, LIMITS.name);
    if (!name) {
      setError("부를 이름을 넣어 주세요.");
      return;
    }
    if (!Number.isInteger(form.liters) || form.liters < LIMITS.minLiters || form.liters > LIMITS.maxLiters) {
      setError(`한 번에 넣는 양은 ${LIMITS.minLiters}~${LIMITS.maxLiters}L 사이 정수로 넣어 주세요.`);
      return;
    }
    if (!(form.kmpl >= LIMITS.minKmpl && form.kmpl <= LIMITS.maxKmpl)) {
      setError(`연비는 ${LIMITS.minKmpl}~${LIMITS.maxKmpl}km/L 사이로 넣어 주세요.`);
      return;
    }
    if (!saveProfile({ ...form, name })) {
      setError("이 브라우저에 저장하지 못했어요. 개인 정보 보호 모드인지 확인해 주세요.");
      return;
    }
    setDraft(null);
    router.push("/");
  }

  function signOut() {
    profileStore.write(GUEST);
    setDraft(null);
    router.push("/");
  }

  return (
    <section aria-labelledby="login-title" className="mx-auto w-full max-w-xl pt-4 pb-10">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="flame-orb size-12 shrink-0" />
        <div>
          <h1 id="login-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {wasSignedIn ? "내 정보" : "간편 로그인"}
          </h1>
          <p className="mt-1 text-ink-soft">
            {wasSignedIn ? "바꾼 내용은 다음 질문부터 반영돼요." : "내 위치와 내 차를 알려 주면 그 기준으로 답해 드려요."}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-2" aria-label="내 정보 입력">
        <Section title="부를 이름">
          <input
            required
            maxLength={LIMITS.name}
            autoComplete="nickname"
            value={form.name}
            onChange={(event) => edit({ name: event.target.value })}
            placeholder="예: 재원"
            aria-label="부를 이름"
            className={FIELD}
          />
        </Section>

        <Section title="내 위치" note="근처 주유소와 거리까지 따진 추천에 써요. 위치는 100m 단위로 줄여 이 브라우저에만 저장해요.">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={locate} disabled={locating} className={`${BUTTON} flex items-center gap-2 bg-accent text-on-accent`}>
              <LocateIcon className="size-4" />
              {locating ? "위치 찾는 중…" : form.location ? "현재 위치로 다시 찾기" : "현재 위치 쓰기"}
            </button>
            {mounted && form.location && (
              <button type="button" onClick={() => edit({ location: null })} className={`${BUTTON} text-ink-soft`}>
                위치 지우기
              </button>
            )}
          </div>
          {locationNote && (
            <p role="status" className="mt-2.5 text-sm text-ink-soft">
              {locationNote}
            </p>
          )}
          {mounted && form.location && (
            <label className="mt-3 block">
              <span className="text-sm text-ink-soft">이 위치 이름</span>
              <input
                maxLength={LIMITS.label}
                value={form.location.label}
                onChange={(event) => edit({ location: { ...form.location!, label: event.target.value } })}
                onBlur={() => edit({ location: { ...form.location!, label: cleanText(form.location!.label, LIMITS.label) || "현재 위치" } })}
                placeholder="예: 집, 회사"
                className={`${FIELD} mt-1.5`}
              />
            </label>
          )}

          <div className="mt-5 rounded-2xl bg-canvas px-4 py-3.5">
            <p className="text-sm">
              <span className="font-semibold">내 지역</span>{" "}
              <span className="text-ink-soft">{mounted && form.area ? form.area.name : "고르지 않음"}</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">지역을 고르면 그 지역 최저가를 먼저 보여 드려요.</p>
            {sidos === null ? (
              <button type="button" onClick={openAreas} className={`${BUTTON} mt-3 bg-ground`}>
                {mounted && form.area ? "지역 바꾸기" : "지역 고르기"}
              </button>
            ) : (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <select aria-label="시도" value={sido} onChange={(event) => chooseSido(event.target.value)} className={SELECT}>
                  <option value="">시도 고르기</option>
                  {sidos.map((area) => (
                    <option key={area.code} value={area.code}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="시군구"
                  disabled={siguns.length === 0}
                  value={form.area?.code.length === 4 ? form.area.code : ""}
                  onChange={(event) => chooseSigun(event.target.value)}
                  className={SELECT}
                >
                  <option value="">시군구 전체</option>
                  {siguns.map((area) => (
                    <option key={area.code} value={area.code}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {areaNote && (
              <p role="status" className="mt-2 text-sm text-ink-soft">
                {areaNote}
              </p>
            )}
          </div>
        </Section>

        <Section title="내 차" note="유종, 한 번에 넣는 양, 연비로 금액과 거리 비용을 셈해요.">
          <div role="radiogroup" aria-label="유종" className="flex flex-wrap gap-2">
            {PROFILE_FUELS.map((fuel) => (
              <button
                key={fuel}
                type="button"
                role="radio"
                aria-checked={form.fuel === fuel}
                onClick={() => edit({ fuel })}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  form.fuel === fuel ? "bg-accent text-on-accent" : "shadow-raised-sm"
                }`}
              >
                {fuelName(fuel)}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-ink-soft">한 번에 넣는 양(L)</span>
              <input
                type="number"
                inputMode="numeric"
                min={LIMITS.minLiters}
                max={LIMITS.maxLiters}
                required
                value={form.liters}
                onChange={(event) => edit({ liters: Number(event.target.value) })}
                className={`${FIELD} mt-1.5 tabular-nums`}
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-soft">연비(km/L)</span>
              <input
                type="number"
                inputMode="decimal"
                min={LIMITS.minKmpl}
                max={LIMITS.maxKmpl}
                step={0.1}
                required
                value={form.kmpl}
                onChange={(event) => edit({ kmpl: Number(event.target.value) })}
                className={`${FIELD} mt-1.5 tabular-nums`}
              />
            </label>
          </div>
        </Section>

        {error && (
          <p role="alert" className="mt-6 text-sm font-medium">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-raised-sm">
            {wasSignedIn ? "저장하고 돌아가기" : "이 정보로 시작하기"}
          </button>
          {wasSignedIn && (
            <button type="button" onClick={signOut} className={`${BUTTON} text-ink-soft`}>
              로그아웃
            </button>
          )}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          비밀번호 없이 이 브라우저에만 저장해요. 질문할 때 부를 이름, 위치 이름, 내 차 정보를 AI에 함께 보내고, 위치 좌표는
          주유소 조회에만 써요. 로그아웃하면 내 정보를 지워요(알림 조건과 주유 기록은 남아요).
        </p>
      </form>
    </section>
  );
}
