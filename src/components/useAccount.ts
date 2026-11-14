"use client";

// 로그인 상태(계정 있음·아이디·안내 한 줄)를 화면에서 읽는다. 첫 그림은 'unknown'이고 계정을 받아 오면 정해진다.
// 처음 쓰는 화면이 동기화를 시작한다(여러 번 불러도 한 번만 시작).
import { useEffect, useSyncExternalStore } from "react";
import { accountStore, startAccountSync, type AccountState } from "@/lib/accountSync";

export function useAccount(): AccountState {
  useEffect(() => startAccountSync(), []);
  return useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot, accountStore.getServerSnapshot);
}
