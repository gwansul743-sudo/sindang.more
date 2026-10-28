import type { StoryPage } from './story';

/* 이야기 장 하나의 글(제목 → 글쓴이 → 손글씨 질문 → 본문 → 출처 → '논문 원문 보기'). 이야기 상자와 논문 읽기 틀(reader.ts)이 같이 쓴다 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function pageHtml(p: StoryPage, o: { pdfButton: boolean }) {
  return (typeof p.img === 'string' && p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : '')
    + `<h3>${esc(p.h)}</h3>` + (p.author ? `<div class="kb-story-author">${esc(p.author)}</div>` : '') + (p.q ? `<p class="kb-story-q">${esc(p.q)}</p>` : '')
    + `<p>${esc(p.body)}</p>` + (p.src ? `<small class="kb-story-src">${esc(p.src)}</small>` : '')
    + (o.pdfButton && p.pdf ? '<button type="button" class="kb-story-pdf">논문 원문 보기</button>' : '');
}
