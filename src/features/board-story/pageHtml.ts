import type { StoryPage } from './story';

/* 이야기 장 하나의 글(제목 → 글쓴이 → 손글씨 질문 → 본문 → 출처 → '논문 원문 보기'). 이야기 상자와 논문 읽기 틀(reader.ts)이 같이 쓴다 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export interface Credit { license?: string; author?: string }
/* 장 그림(10-28): img 가 {file, cap} 이면 상자 너비 그림 + 캡션 + '사진: 저작자 · 이용 조건'(credits.json). 누르면 사진 크게 보기(story.ts) */
export const imgSrc = (p: StoryPage, base: string) => (p.img && typeof p.img === 'object' ? base + p.img.file : typeof p.img === 'string' ? p.img : '');
export function pageHtml(p: StoryPage, o: { pdfButton: boolean; imgBase?: string; credits?: Record<string, Credit> }) {
  const src = imgSrc(p, o.imgBase || ''), cap = p.img && typeof p.img === 'object' ? p.img.cap || '' : '';
  const cr = p.img && typeof p.img === 'object' ? o.credits?.[p.img.file.replace(/\.[a-z0-9]+$/i, '')] : undefined;
  return (src ? `<figure class="kb-story-fig"><button type="button" class="kb-story-figbtn" aria-label="사진 크게 보기"><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy" decoding="async"></button>`
      + (cap || cr ? `<figcaption>${esc(cap)}${cr ? `<small>사진: ${esc([cr.author, cr.license].filter(Boolean).join(' · '))}</small>` : ''}</figcaption>` : '') + '</figure>' : '')
    + `<h3>${esc(p.h)}</h3>` + (p.author ? `<div class="kb-story-author">${esc(p.author)}</div>` : '') + (p.q ? `<p class="kb-story-q">${esc(p.q)}</p>` : '')
    + `<p>${esc(p.body)}</p>` + (p.src ? `<small class="kb-story-src">${esc(p.src)}</small>` : '')
    + (o.pdfButton && p.pdf ? '<button type="button" class="kb-story-pdf">논문 원문 보기</button>' : '');
}
