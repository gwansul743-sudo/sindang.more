/* 인터뷰이 캐릭터 (7·9단계에서 사용). look에는 파츠 조합 결과만 담는다 — 그림은 content/characters 에 있다. */
export interface CharacterLook { style: 'short' | 'bob' | 'hat'; bun?: boolean; bag?: boolean; skin: string; hair: string; top: string; pant: string; shoe: string; hat?: string }
export interface Character { id: string; nickname: string; look: CharacterLook | null; interviewId: string; status: 'pending' | 'approved' | 'hidden'; createdAt: string }
