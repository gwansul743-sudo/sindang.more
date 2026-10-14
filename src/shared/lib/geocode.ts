/* 주소 → 좌표. 임시 엔진의 geocode()가 부른다 (10-14 연결).
   카카오 지도 JS SDK의 geocoder는 브라우저에서 돌고, JS 키(VITE_KAKAO_JS_KEY)는 카카오 콘솔에 등록한 도메인에서만 먹는다. REST 키는 쓰지 않는다.
   콘솔(앱 ID 1607868): 앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인에 localhost:5173 · localhost:4199 · 배포 주소. 제품 설정 → 카카오맵 활성화 ON. */
declare global { interface Window { kakao?: any } }

let sdk: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) return Promise.reject(new Error('VITE_KAKAO_JS_KEY가 없습니다'));
  return (sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error('카카오 지도 SDK를 불러오지 못했습니다'));
    document.head.appendChild(s);
  }));
}

export async function geocode(address: string): Promise<{ lat: number; lng: number; address: string } | null> {
  await loadSdk();
  return new Promise((resolve) => {
    new window.kakao.maps.services.Geocoder().addressSearch(address, (result: any[], status: string) => {
      resolve(status === window.kakao.maps.services.Status.OK && result[0] ? { lat: +result[0].y, lng: +result[0].x, address: result[0].address_name as string } : null);
    });
  });
}
