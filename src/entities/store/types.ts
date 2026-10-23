/* 가게. 지금 화면(임시 엔진)이 쓰는 모양 그대로다. Supabase stores 테이블과의 대응은 api.ts 참고. */
export interface Store {
  id: string;
  name: string;
  addr: string;
  lat: number;
  lng: number;
  ig: string;            // 인스타 게시물 URL  → stores.ig_url
  video?: string;        // 영상 주소(유튜브·구글 드라이브·mp4) → stores.video_url. 카드에서 재생 (10-21). 시드에는 없음
  category?: string;     // 업종 키(sewing·supermarket·coffee·restaurant·wine·etc) → stores.category. 전시 보드 단추·범례 (10-23)
  photoUrl?: string;     // 표지 사진 보여줄 URL (Storage 공개 URL 또는 /seed-photos/… 정적 파일)
  photoPath?: string;    // stores.photo_path 원본 값 (Storage 경로). 삭제·교체 때 씀
  interview: string;     // 인터뷰 전문        → stores.interview_md
  issue: string;         // '6호' 같은 표시    → stores.issue
  order: number;
  status: 'pub' | 'up';  // up = 다음 호(준비 중) → stores.published = false
  line?: string;         // 화면에서 뺀 옛 필드 (값만 보존)
  quote?: string;        // 화면에서 뺀 옛 필드 (값만 보존)
}
