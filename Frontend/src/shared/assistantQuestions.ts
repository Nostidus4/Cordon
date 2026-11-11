// The 4 fixed assistant questions of spec §9.5 (P0).
export interface AssistantQuestion { id: "huy_too" | "why_flag" | "how_fix" | "give_agent_huy"; screen: "simulate" | "requests"; text: string }

export const ASSISTANT_QUESTIONS: AssistantQuestion[] = [
  { id: "huy_too", screen: "simulate", text: "Nếu anh Huy cũng bị chiếm thì sao?" },
  { id: "why_flag", screen: "simulate", text: "Vì sao khu anh Minh có cờ vàng?" },
  { id: "how_fix", screen: "simulate", text: "Sửa thế nào?" },
  { id: "give_agent_huy", screen: "requests", text: "Có nên giao trợ lý Cân đối cho anh Huy?" },
];
export const questionsFor = (screen: "simulate" | "requests") => ASSISTANT_QUESTIONS.filter((q) => q.screen === screen);
