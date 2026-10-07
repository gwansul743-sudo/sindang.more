/* 가게. 지금 화면(임시 엔진)이 쓰는 모양 그대로다. Supabase stores 테이블과의 대응은 api.ts 참고. */
export interface Store {
  id: string;
  name: string;
  addr: string;
  lat: number;
  lng: number;
  ig: string;            // 인스타 게시물 URL  → stores.ig_url
  photoUrl?: string;     // 표지 사진          → stores.photo_path (Storage 공개 URL)
  interview: string;     // 인터뷰 전문        → stores.interview_md
  issue: string;         // '6호' 같은 표시    → stores.issue
  order: number;
  status: 'pub' | 'up';  // up = 다음 호(준비 중) → stores.published = false
  line?: string;         // 화면에서 뺀 옛 필드 (값만 보존)
  quote?: string;        // 화면에서 뺀 옛 필드 (값만 보존)
}
