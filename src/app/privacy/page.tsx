import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · 기름알리미",
  description: "기름알리미가 어떤 정보를 어디에 두고 어디로 보내는지, 지우는 방법과 문의처를 알려 드려요.",
};

// 팀이 정해 주는 값. 바꾸면 이 페이지만 고치면 된다.
const OPERATOR = "팀 유일무이";
const CONTACT = "yuilmuyi@gmail.com";
const EFFECTIVE = "2026년 11월 14일";

// 처리하는 정보. 내용은 코드에서 확인한 사실만 적는다(저장: src/lib/*Store, 계정: src/lib/account/*, src/lib/accountSync.ts,
// 보내는 곳: src/lib/chatbot.ts, opinet.ts, expressway.ts).
const ITEMS = [
  {
    name: "계정(로그인한 경우)",
    detail:
      "아이디, 비밀번호(되돌릴 수 없게 바꾼 값만 저장하고 원래 비밀번호는 저장하지 않아요), 가입 시각과 마지막 저장 시각, 로그인에 실패한 횟수(10분 동안만)",
    purpose: "로그인, 내 기록을 다른 사람 것과 나누기, 다른 기기에서도 같은 정보 보이기, 비밀번호를 여러 번 넣어 보는 것 막기",
  },
  {
    name: "부를 이름, 내 차",
    detail: "이름, 유종, 차종이나 차 크기, 연비, 한 번에 넣는 금액, 한 달 주행거리, 요소수가 필요한 차인지, 주유 할인과 뺀 상표",
    purpose: "답을 내 이름과 내 차 기준으로 맞추기, 다음 주유 계획과 예상 비용, 할인 반영 가격",
  },
  {
    name: "위치",
    detail: "현재 위치로 찾은 좌표(100m 단위로 줄임)와 위치 이름, 또는 고른 시도·시군구. 자주 가는 곳(집·회사)의 좌표와 이름",
    purpose: "근처 주유소, 거리까지 고려한 추천, 출퇴근 길 주유소, 내 지역 평균과 최저가",
  },
  {
    name: "주유 기록",
    detail: "영수증·계기판 사진에서 읽은 날짜, 금액, 단가, 넣은 양, 주유소 이름, 누적 주행거리, 연비",
    purpose: "월간 리포트, 다음 주유일 예보, 주유소 점검, 실측 연비",
  },
  {
    name: "알림 조건",
    detail: "지역, 유종, 기준 가격, 예보 설정",
    purpose: "조건에 맞을 때 받을 알림 미리 보기",
  },
  {
    name: "챗봇 질문",
    detail: "질문과 이어진 대화, 보낸 사진(영수증·계기판)",
    purpose: "AI 답변 만들기",
  },
  {
    name: "접속 정보",
    detail: "IP 주소, 요청한 주소, 시각",
    purpose: "호출 한도 지키기(한 사람이 너무 많이 부르지 않게), 서비스 운영",
  },
];

const SENDS = [
  {
    to: "Anthropic(미국)",
    what: "챗봇 질문과 대화, 보낸 사진, 그리고 내 정보 가운데 부를 이름·내 지역·위치 이름·내 차·주유 할인과 뺀 상표. 질문마다 이 브라우저의 주유 기록 수와 가장 최근 주유 날짜, 화면에서 고른 유종·주유 금액·출발 위치 이름도 함께 보내요. 리포트나 주유소 점검을 물으면 그에 필요한 주유 기록도 보내요. 위치 좌표는 보내지 않아요.",
    why: "AI 답변 만들기(질문할 때마다 인터넷으로 보냄)",
    link: { href: "https://www.anthropic.com/legal/privacy", label: "Anthropic 개인정보 처리방침" },
  },
  {
    to: "Upstash(미국 회사, 저장 위치는 일본 도쿄)",
    what: "로그인한 사람의 아이디, 비밀번호를 되돌릴 수 없게 바꾼 값, 가입·저장 시각, 로그인 실패 횟수, 내 정보(부를 이름·내 차·위치·자주 가는 곳·할인과 뺀 상표), 주유 기록과 주유 장부, 알림 조건, 예보 설정. 로그인하지 않으면 보내지 않아요.",
    why: "계정 저장(로그인하면 어느 기기에서나 같은 정보가 보이게). 탈퇴하면 바로, 1년 동안 쓰지 않으면 저절로 지워요.",
    link: { href: "https://upstash.com/trust/privacy.pdf", label: "Upstash 개인정보 처리방침" },
  },
  {
    to: "Vercel(미국)",
    what: "이 서비스로 오가는 모든 요청과 접속 정보(근처 주유소나 출퇴근 길을 찾을 때는 줄인 위치 좌표와 위치 이름이 요청 주소에 들어가요. 집·회사도 같아요)",
    why: "서비스 호스팅(서버 실행과 접속 기록)",
    link: { href: "https://vercel.com/legal/privacy-policy", label: "Vercel 개인정보 처리방침" },
  },
  {
    to: "한국석유공사 오피넷, 한국도로공사",
    what: "유종, 지역, 줄인 위치 좌표 같은 조회 조건. 이름이나 주유 기록은 보내지 않아요.",
    why: "주유소 가격과 고속도로 휴게소 가격 조회",
    link: null,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-2.5 space-y-2.5 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-xl pt-6 pb-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">개인정보 처리방침</h1>
      <p className="mt-2 text-ink-soft">
        기름알리미(운영: {OPERATOR})는 가입하지 않아도 모두 쓸 수 있어요. 로그인하지 않으면 내 정보와 기록을 지금 쓰는
        브라우저에만 저장해요. 아이디로 로그인하면 다른 기기에서도 같게 보이도록 계정 서버에도 저장해요. 무엇을 어디에 두고
        어디로 보내는지 아래에 적었어요.
      </p>

      <Section title="처리하는 정보와 쓰는 곳">
        <ul className="space-y-2.5">
          {ITEMS.map((item) => (
            <li key={item.name} className="rounded-2xl bg-canvas px-4 py-3">
              <p className="font-semibold">{item.name}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{item.detail}</p>
              <p className="mt-1.5 text-sm">쓰는 곳: {item.purpose}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft">
          계정, 이름, 위치, 차는 만들거나 넣지 않아도 돼요. 넣지 않으면 그 정보가 필요한 기능만 쓸 수 없어요.
        </p>
      </Section>

      <Section title="저장하는 곳과 기간">
        <p>
          부를 이름, 내 차, 위치, 주유 기록, 알림 조건은 이 브라우저의 저장소(localStorage)에 있어요. 로그인하지 않았으면
          여기에만 있고, 직접 지우거나 브라우저의 사이트 데이터를 지울 때까지 남아요.
        </p>
        <p>
          아이디로 로그인하면 같은 정보(내 정보와 위치·자주 가는 곳, 최근 주유 기록, 주유 장부, 알림 조건, 예보 설정)를 위의
          계정 정보와 함께 Upstash의 데이터베이스(일본 도쿄)에도 저장해요. 탈퇴하면 바로 지우고, 1년 동안 한 번도 쓰지 않으면
          저절로 지워요. 우리가 따로 두는 백업은 없어요. 로그인한 상태는 서명한 쿠키(kireumalimi_session)에 아이디와 가입
          시각만 담아 30일 동안 둬요.
        </p>
        <p className="text-sm text-ink-soft">
          저장 이름: kireumalimi.profile(내 정보·위치), kireumalimi.ledger와 kireumalimi.fills(주유 기록),
          kireumalimi.alerts와 kireumalimi.watch(알림 조건·예보 설정), kireumalimi.vsArea(지역 평균과 견준 결과),
          kireumalimi.areaPrice(오늘의 내 지역 평균가), kireumalimi.sync(로그인했을 때 어느 계정의 사본인지와 아직 계정에
          못 올린 칸)
        </p>
        <p>
          서버는 호출 한도를 지키려고 IP 주소별 요청 시각을 서버 메모리에 둬요. 하루가 지난 시각은 세지 않고, 쌓인 기록이
          많아지면 하루 지난 것을 지우며, 서버가 다시 시작되면 모두 사라져요. 오피넷·도로공사 조회 결과도 같은 조회를 다시
          부르지 않으려고 조회 조건(줄인 위치 좌표 포함)과 함께 서버 메모리에 10분에서 1시간 동안 둬요. 챗봇 질문과 사진은
          답을 만든 뒤 서버에 남기지 않아요. 다만 호스팅 회사(Vercel)가 접속 기록을 정해진 기간 동안 보관할 수 있어요.
        </p>
      </Section>

      <Section title="밖으로 보내는 정보(국외 이전 포함)">
        <ul className="space-y-2.5">
          {SENDS.map((send) => (
            <li key={send.to} className="rounded-2xl bg-canvas px-4 py-3">
              <p className="font-semibold">{send.to}</p>
              <p className="mt-0.5 text-sm">{send.what}</p>
              <p className="mt-1.5 text-sm text-ink-soft">목적: {send.why}</p>
              {send.link && (
                <a
                  href={send.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-sm underline underline-offset-4"
                >
                  {send.link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
        <p>이 밖의 다른 회사나 기관에 내 정보를 팔거나 넘기지 않아요.</p>
      </Section>

      <Section title="지우는 방법">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            위치: 출발 위치 메뉴의 &lsquo;위치 고르기&rsquo;(이미 골랐으면 메뉴 끝 &lsquo;다른 지역 고르기…&rsquo;)로 여는 창에서
            &lsquo;고른 위치 지우기&rsquo;
          </li>
          <li>
            부를 이름, 내 차, 위치(로그인하지 않았을 때):{" "}
            <Link href="/login" className="underline underline-offset-4">내 정보</Link>에서 &lsquo;이 브라우저의 내 정보 지우기&rsquo;
          </li>
          <li>
            알림 조건: <Link href="/alerts" className="underline underline-offset-4">알림</Link> 화면에서 하나씩 삭제
          </li>
          <li>
            이 브라우저에서 모두 지우기: 브라우저 설정에서 이 사이트의 데이터(쿠키 및 사이트 데이터) 삭제. 주유 기록도 이렇게
            지워요. 계정에 저장한 것은 남아요.
          </li>
          <li>
            로그인했을 때: 내 정보의 &lsquo;로그아웃&rsquo;은 이 브라우저에서 내 정보와 기록을 지워요(계정에는 남아요). 계정에
            저장한 것까지 모두 지우려면 내 정보 맨 아래 &lsquo;회원 탈퇴&rsquo;를 눌러요. 바로 지우고 되돌릴 수 없어요. 로그인해
            둔 다른 기기의 사본은 그 기기를 다음에 열 때 지워요.
          </li>
        </ul>
      </Section>

      <Section title="문의">
        <p>
          운영: {OPERATOR}
          <br />
          문의:{" "}
          <a href={`mailto:${CONTACT}`} className="underline underline-offset-4">
            {CONTACT}
          </a>
        </p>
      </Section>

      <p className="mt-8 text-sm text-ink-soft">
        시행일: {EFFECTIVE}. 이 방침을 바꾸면 이 페이지에 바뀐 내용과 날짜를 알려 드려요.
      </p>
    </article>
  );
}
