// AI 답 글에 가끔 섞여 나오는 내부 태그를 걸러 낸다.
// 운영에서 "<reasoning_effort>5</reasoning_effort>\n<answer>…</answer>"가 그대로 화면에 나온 적이 있다
// (거절 시 다른 모델로 넘기는 fallback이 답했을 때로 짐작한다).
// 내용째 버릴 태그(설정·생각)와 껍데기만 벗길 태그(답)를 나눈다. 태그가 없으면 글을 그대로 둔다.
const DROP = /<(reasoning_effort|thinking|reasoning)>[\s\S]*?<\/\1>/g;
const ANSWER = /<answer>([\s\S]*?)<\/answer>/g;
const STRAY = /<\/?(answer|reasoning_effort|thinking|reasoning)>/g;

export function cleanAnswerText(text: string) {
  const dropped = text.replace(DROP, "");
  const answers = [...dropped.matchAll(ANSWER)].map((match) => match[1].trim());
  const body = answers.length > 0 ? answers.join("\n\n") : dropped;
  return body.replace(STRAY, "").trim();
}
