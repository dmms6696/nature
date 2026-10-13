import type { Item } from "../functions/src/types";
export const items: Record<
  Item,
  { name: string; title: string; hint: string; questions: [string, string] }
> = {
  potato: {
    name: "감자",
    title: "마음을 전하는 자연",
    hint: "먹거리이면서 마음과 관계를 이어 주는 자연물을 생각해 보세요.",
    questions: [
      "점순이가 '나'에게 감자를 건넨 의도는 무엇이며, 감자는 두 인물의 감정과 관계에 어떤 영향을 미쳤나요?",
      "현실에서 사람들은 자연물을 이용해 자신의 마음을 어떻게 표현하나요? 자연물은 인간에게 먹거리 외에 어떤 의미를 가질까요?",
    ],
  },
  branch: {
    name: "삭정이",
    title: "생활을 지탱하는 자연",
    hint: "삭정이는 살아 있는 나무에 붙은 말라 죽은 가지입니다.",
    questions: [
      "'나'가 삭정이를 모으는 장면에서 알 수 있는 생활 모습과 '나'의 감정은 무엇인가요?",
      "인간은 나무와 숲에서 어떤 도움을 받으며, 자연을 지속해서 이용하기 위해 어떤 태도를 가져야 할까요?",
    ],
  },
  flower: {
    name: "동백꽃",
    title: "감정과 경험을 만드는 자연",
    hint: "작품 속 동백꽃은 노란 꽃입니다. 꽃이 갈등을 직접 해결했는지와 장면의 분위기를 구분해 보세요.",
    questions: [
      "동백꽃의 모습과 향기는 '나'와 점순이의 감정 및 작품의 분위기를 어떻게 표현하나요?",
      "아름다운 자연경관이나 꽃은 인간의 감정과 경험에 어떤 영향을 주며, 우리는 이러한 자연을 어떻게 대해야 할까요?",
    ],
  },
  rooster: {
    name: "두 수탉",
    title: "인간의 목적과 생명의 가치",
    hint: "인물의 감정뿐 아니라 수탉들이 겪은 일에도 주목해 보세요.",
    questions: [
      "두 수탉은 '나'와 점순이의 감정과 갈등을 어떻게 드러내며, 사람들의 행동으로 어떤 일을 겪었나요?",
      "인간은 동물을 어떤 목적으로 이용하며, 동물과 함께 살아가기 위해 어떤 태도를 가져야 할까요?",
    ],
  },
};
export const groupQuestions: [string, string] = [
  "모둠원들이 제출한 네 자연물의 탐구 결과를 비교해 보자. 인간과 자연은 어떤 다양한 관계를 맺고 있는가?",
  "이러한 관계를 바탕으로 인간이 자연을 대할 때 가져야 할 태도는 무엇인가?",
];
export const questionLabels = [
  "작품 속 자연물의 역할",
  "실제 인간의 삶에서의 역할",
];
export const phases = {
  PREPARING: "준비 중",
  INDIVIDUAL_OPEN: "개인 탐구 진행",
  INDIVIDUAL_CLOSED: "개인 탐구 마감",
  GROUP_OPEN: "모둠 활동 진행",
  COMPLETED: "수업 종료",
};
