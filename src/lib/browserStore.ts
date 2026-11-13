// 이 브라우저에만 값을 저장하는 작은 저장소. 시제품이라 서버에 저장하지 않는다.
// 개인 정보 보호 모드처럼 저장소를 못 쓰면 저장하지 못한 채로 동작한다.
// 화면은 useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)로 읽는다.
export function browserStore(key: string, empty: string) {
  const event = `${key}:change`;
  const read = () => {
    try {
      return localStorage.getItem(key) ?? empty;
    } catch {
      return empty;
    }
  };
  return {
    subscribe(onChange: () => void) {
      window.addEventListener("storage", onChange);
      window.addEventListener(event, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(event, onChange);
      };
    },
    getSnapshot: read,
    getServerSnapshot: () => empty,
    read,
    write(value: unknown) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      } finally {
        window.dispatchEvent(new Event(event));
      }
    },
  };
}

export function parseList<T>(raw: string, keep: (item: T) => boolean): T[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(keep) : [];
  } catch {
    return [];
  }
}
