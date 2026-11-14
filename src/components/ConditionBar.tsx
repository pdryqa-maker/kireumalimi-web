"use client";

// 조건 줄: 유종, 출발 위치, 한 번에 넣는 금액. 홈 입력창 위와 탐색 대시보드 맨 위에서 함께 쓴다.
// 바꾼 값은 그 화면에서만 쓰고 저장하지 않는다. 출발 위치를 아직 고르지 않았으면 '위치 고르기' 버튼이 창을 연다.
import { AMOUNT_CHOICES, amountShort, type Amount } from "@/lib/fillAmount";
import { initialPlace, MY, NO_PLACE, placeGroups } from "@/lib/places";
import { fuelName, PROFILE_FUELS } from "@/lib/profile";
import { LocateIcon } from "./icons";
import { openLocationPicker } from "./LocationPicker";
import { useProfile } from "./useStored";

const PICK = "__pick"; // 출발 위치 메뉴 끝 '다른 지역 고르기…'

// 내 정보 금액이 고르는 칸에 없으면(예: 4만 5천원) 그 값을 끼워 넣는다.
const amountOptions = (amount: Amount): Amount[] =>
  AMOUNT_CHOICES.includes(amount)
    ? AMOUNT_CHOICES
    : [...AMOUNT_CHOICES.slice(0, -1), amount, "full" as const].sort((a, b) => (a === "full" ? 1 : b === "full" ? -1 : a - b));

const SELECT =
  "appearance-none rounded-full bg-ground py-1.5 pr-8 pl-3.5 text-sm font-semibold shadow-inset-sm focus-visible:outline-offset-1";

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute right-2.5 size-4 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ConditionBar({
  fuel,
  place,
  amount,
  onFuel,
  onPlace,
  onAmount,
  className = "",
}: {
  fuel: string;
  place: string;
  amount: Amount;
  onFuel: (fuel: string) => void;
  onPlace: (place: string) => void;
  onAmount: (amount: Amount) => void;
  className?: string;
}) {
  const profile = useProfile();
  // 창에서 고르면 이 화면의 출발 위치도 새로 고른 곳의 처음 위치로 맞춘다.
  const pick = () => openLocationPicker((next) => onPlace(initialPlace(next)));
  return (
    <div className={`no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5 ${className}`}>
      <div role="radiogroup" aria-label="유종" className="flex shrink-0 rounded-full p-1 shadow-inset-sm">
        {PROFILE_FUELS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={fuel === item}
            onClick={() => onFuel(item)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${fuel === item ? "bg-accent text-on-accent" : "text-ink-soft"}`}
          >
            {fuelName(item)}
          </button>
        ))}
      </div>
      {place === NO_PLACE ? (
        <button
          type="button"
          onClick={pick}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ground py-1.5 pr-3.5 pl-3 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm"
        >
          <LocateIcon className="size-4 text-flame" />
          위치 고르기
        </button>
      ) : (
        <span className="relative flex shrink-0 items-center">
          <select
            aria-label="출발 위치"
            title="출발 위치"
            value={place}
            onChange={(event) => (event.target.value === PICK ? pick() : onPlace(event.target.value))}
            className={SELECT}
          >
            {profile.location && <option value={MY}>{profile.location.label}(내 위치)</option>}
            {placeGroups(profile.area).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.places.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={PICK}>다른 지역 고르기…</option>
          </select>
          <Chevron />
        </span>
      )}
      <span className="relative flex shrink-0 items-center">
        <select
          aria-label="주유 금액"
          title="한 번에 넣는 금액"
          value={String(amount)}
          onChange={(event) => onAmount(event.target.value === "full" ? "full" : Number(event.target.value))}
          className={SELECT}
        >
          {amountOptions(amount).map((option) => (
            <option key={option} value={String(option)}>
              {amountShort(option)}
            </option>
          ))}
        </select>
        <Chevron />
      </span>
    </div>
  );
}
