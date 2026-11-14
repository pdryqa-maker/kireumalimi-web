"use client";

// 조건 줄: 유종, 출발 위치, 한 번에 넣는 금액. 홈 입력창 위와 탐색 대시보드 맨 위에서 함께 쓴다.
// 바꾼 값은 그 화면에서만 쓰고 저장하지 않는다.
import { AMOUNT_CHOICES, amountShort, type Amount } from "@/lib/fillAmount";
import { homePlace, inPlaceMenu, placeAt, placeGroups } from "@/lib/places";
import { fuelName, PROFILE_FUELS, type Profile } from "@/lib/profile";
import { useProfile } from "./useStored";

export const MY = "my";

// 처음 출발 위치: 내 위치가 있으면 내 위치, 없으면 내 지역의 시군구청(지역이 없거나 울주군이면 언양읍)
export const initialPlace = (profile: Profile) => (profile.location ? MY : homePlace(profile.area));

// 고른 출발 위치가 지금 메뉴에 있는 값인지 맞춘다(내 위치를 지우거나 지역을 바꾼 뒤 등).
export const usablePlace = (place: string, profile: Profile) =>
  place === MY
    ? profile.location
      ? MY
      : homePlace(profile.area)
    : inPlaceMenu(place, profile.area)
      ? place
      : homePlace(profile.area);

export const placeLabel = (place: string, profile: Profile) =>
  place === MY && profile.location ? profile.location.label : (placeAt(place) ?? placeAt(homePlace(profile.area)))!.name;

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
      <span className="relative flex shrink-0 items-center">
        <select aria-label="출발 위치" title="출발 위치" value={place} onChange={(event) => onPlace(event.target.value)} className={SELECT}>
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
        </select>
        <Chevron />
      </span>
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
