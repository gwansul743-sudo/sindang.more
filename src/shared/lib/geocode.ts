/* 주소 → 좌표 (6단계에서 연결).
   지금 관리 화면은 content/_legacy/geo.json(내장 주소표)을 쓰고 있다. 아래 함수로 바꾸고 그 파일을 지운다.
   카카오 지도 JS SDK의 geocoder는 브라우저에서 돌고, JS 키는 배포 도메인에 묶인다. REST 키는 쓰지 않는다. */
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

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  await loadSdk();
  return new Promise((resolve) => {
    new window.kakao.maps.services.Geocoder().addressSearch(address, (result: any[], status: string) => {
      resolve(status === window.kakao.maps.services.Status.OK && result[0] ? { lat: +result[0].y, lng: +result[0].x } : null);
    });
  });
}
