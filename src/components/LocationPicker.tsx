"use client";

// 위치 고르기 창. 로그인하지 않아도 출발 위치와 내 지역을 고른다(현재 위치 또는 시도·시군구).
// 고른 값은 내 정보 저장소(profile.area, profile.location)에 이름 없이 저장하므로 로그인 상태는 바뀌지 않는다.
// 화면 틀(AppShell)에 하나만 두고, 어디서든 openLocationPicker()로 연다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseProfile, profileStore, saveProfile, type Profile } from "@/lib/profile";
import { findMyPlace, loadAreas, type Area } from "./areaApi";
import { LocateIcon } from "./icons";
import { useProfile } from "./useStored";

const PICK_EVENT = "kireumalimi:pick-location";
type PickDetail = { onPicked?: (profile: Profile) => void };

// onPicked는 고르거나 지운 뒤 새 프로필로 불린다(닫기만 하면 부르지 않는다).
export function openLocationPicker(onPicked?: (profile: Profile) => void) {
  window.dispatchEvent(new CustomEvent<PickDetail>(PICK_EVENT, { detail: { onPicked } }));
}

const FIELD =
  "w-full min-w-0 appearance-none rounded-2xl bg-ground px-4 py-3 pr-10 text-[15px] shadow-inset-sm focus-visible:outline-offset-1 disabled:opacity-50";
const BUTTON = "rounded-full px-4 py-2.5 text-sm font-semibold shadow-raised-sm active:shadow-inset-sm disabled:opacity-50";

// 지역 목록은 창을 다시 열 때 또 받지 않는다.
let sidoCache: Area[] | null = null;
const sigunCache = new Map<string, Area[]>();
const sidosOnce = async () => (sidoCache ??= await loadAreas());
async function sigunsOf(sido: string) {
  const cached = sigunCache.get(sido);
  if (cached) return cached;
  const list = await loadAreas(sido);
  sigunCache.set(sido, list);
  return list;
}

const readProfile = () => parseProfile(profileStore.read());

export function LocationPicker() {
  const profile = useProfile();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pickedRef = useRef<PickDetail["onPicked"]>(undefined);
  const lookupRef = useRef(0); // 현재 위치 찾기가 늦게 끝나 그 뒤 고른 값을 덮지 않도록 순번을 센다
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [sidos, setSidos] = useState<Area[]>([]);
  const [sido, setSido] = useState("");
  const [siguns, setSiguns] = useState<Area[]>([]);
  const [sigun, setSigun] = useState("");

  async function showSiguns(code: string) {
    setSiguns([]);
    if (!code) return;
    try {
      setSiguns(await sigunsOf(code));
    } catch (problem) {
      setNote(problem instanceof Error ? problem.message : "시군구 목록을 불러오지 못했어요.");
    }
  }

  useEffect(() => {
    async function open(event: Event) {
      pickedRef.current = (event as CustomEvent<PickDetail>).detail?.onPicked;
      lookupRef.current++;
      setLocating(false);
      setNote("");
      // 지금 내 지역이 있으면 그 지역을 골라 둔 채로 연다.
      const area = readProfile().area;
      const current = area?.code.slice(0, 2) ?? "";
      setSido(current);
      setSigun(area?.code.length === 4 ? area.code : "");
      setSiguns([]);
      dialogRef.current?.showModal();
      try {
        setSidos(await sidosOnce());
        if (current) setSiguns(await sigunsOf(current));
      } catch (problem) {
        setNote(problem instanceof Error ? problem.message : "지역 목록을 불러오지 못했어요.");
      }
    }
    window.addEventListener(PICK_EVENT, open);
    return () => window.removeEventListener(PICK_EVENT, open);
  }, []);

  function save(next: Partial<Profile>) {
    if (!saveProfile({ ...readProfile(), ...next })) {
      setNote("이 브라우저에 저장하지 못했어요. 개인 정보 보호 모드인지 확인해 주세요.");
      return;
    }
    dialogRef.current?.close();
    pickedRef.current?.(readProfile());
  }

  async function locate() {
    const lookup = ++lookupRef.current;
    setLocating(true);
    setNote("");
    const found = await findMyPlace();
    if (lookup !== lookupRef.current) return; // 그사이 지역을 직접 골랐거나 창을 닫았다
    setLocating(false);
    if ("error" in found) {
      setNote(found.error);
      return;
    }
    // 붙여 둔 위치 이름(집, 회사)은 그대로 둔다.
    save({ location: { ...found.location, label: readProfile().location?.label ?? found.location.label }, area: found.area });
  }

  function chooseSido(code: string) {
    lookupRef.current++;
    setLocating(false);
    setSido(code);
    setSigun("");
    showSiguns(code);
  }

  // 직접 고른 지역은 찾아 둔 현재 위치를 대신한다(내 정보 화면과 같다).
  function chooseArea() {
    const parent = sidos.find((area) => area.code === sido);
    if (!parent) return;
    const child = siguns.find((area) => area.code === sigun);
    save({
      area: child ? { code: child.code, name: `${parent.name} ${child.name}` } : { code: parent.code, name: parent.name },
      location: null,
    });
  }

  function onClose() {
    lookupRef.current++;
    setLocating(false);
  }

  const chosen = profile.location ? `${profile.location.label}(내 위치)` : (profile.area?.name ?? "");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="location-picker-title"
      onClose={onClose}
      // 창 밖(배경)을 누르면 닫는다. 창 안은 안쪽 div가 덮고 있어 여기로 오지 않는다.
      onClick={(event) => event.target === event.currentTarget && dialogRef.current?.close()}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-ground text-ink shadow-raised backdrop:bg-ink/30 sm:m-auto sm:max-w-md sm:rounded-3xl"
    >
      <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <h2 id="location-picker-title" className="text-lg font-bold tracking-tight">
            출발 위치 고르기
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="닫기"
            className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-canvas"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          고른 곳 기준으로 근처 주유소와 지역 평균을 알려 드려요. 이 브라우저에만 저장해요.{" "}
          <Link href="/privacy" onClick={() => dialogRef.current?.close()} className="underline underline-offset-4">
            개인정보 처리방침
          </Link>
        </p>

        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className={`${BUTTON} mt-4 flex w-full items-center justify-center gap-2 bg-accent text-on-accent`}
        >
          <LocateIcon className="size-4 shrink-0" />
          {locating ? "찾는 중…" : "현재 위치로 찾기"}
        </button>

        <p className="mt-5 text-sm font-semibold">또는 지역 고르기</p>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          <select aria-label="시도" value={sido} onChange={(event) => chooseSido(event.target.value)} className={FIELD}>
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
            value={sigun}
            onChange={(event) => setSigun(event.target.value)}
            className={FIELD}
          >
            <option value="">시도 전체</option>
            {siguns.map((area) => (
              <option key={area.code} value={area.code}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={chooseArea} disabled={!sido} className={`${BUTTON} mt-3 w-full bg-ground`}>
          이 지역으로
        </button>

        {note && (
          <p role="status" className="mt-3 text-sm text-ink-soft">
            {note}
          </p>
        )}

        {chosen && (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-hairline pt-4 text-sm">
            <span>
              <span className="text-ink-soft">지금 </span>
              <span className="font-semibold">{chosen}</span>
            </span>
            <button type="button" onClick={() => save({ area: null, location: null })} className="shrink-0 text-ink-soft underline underline-offset-4">
              고른 위치 지우기
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
