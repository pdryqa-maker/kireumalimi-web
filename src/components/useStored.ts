"use client";

// 브라우저 저장소 값을 화면에서 읽는다. 서버에서 그릴 때와 첫 그림은 빈 값이고, 그 뒤 저장한 값으로 바뀐다.
import { useMemo, useSyncExternalStore } from "react";
import { parseProfile, profileStore } from "@/lib/profile";

type Store = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => string; getServerSnapshot: () => string };

export function useStored<T>(store: Store, parse: (raw: string) => T) {
  const raw = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return useMemo(() => parse(raw), [raw, parse]);
}

const noSubscribe = () => () => {};

// 브라우저에서 그리는 중인지. 오늘 날짜처럼 서버와 브라우저가 다를 수 있는 값은 이것이 true일 때만 그린다.
export const useMounted = () => useSyncExternalStore(noSubscribe, () => true, () => false);

export const useProfile = () => useStored(profileStore, parseProfile);
