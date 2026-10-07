import seed from '../../../supabase/seed.stores.json';
import type { Store } from './types';

/* 가게 읽기.
   지금은 seed JSON을 그대로 돌려준다 (저장·수정은 임시 엔진의 목업이라 새로고침하면 사라진다).
   5단계: 여기를 Supabase로 바꾼다.
     const { data } = await supabase.from('stores').select('*').order('order');
     return data.map(rowToStore);
   그리고 임시 엔진 안의 connect()/mockDb/saveStore/deleteStore가 이 파일의 함수를 부르게 바꾼다. */
export async function listStores(): Promise<Store[]> {
  return seed as Store[];
}
