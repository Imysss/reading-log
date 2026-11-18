// ===== 데이터·계산 (화면과 무관한 로직) =====
const KEY = 'reading-log-v1';
const DEFAULT_STATE = { version: 1, books: [], notes: [] };

// 책: { id, title, author, cover, start, summary, created }
//   cover: 이미지 주소(검색) 또는 data:URL(직접 찍은 사진), 없으면 ''
// 독후감: { id, bookId, date, minutes, range, text, quote, final, created }
//   final=true 인 독후감 날짜가 그 책의 "다 읽은 날"

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dot = s => s ? s.slice(2).replace(/-/g, '.') : '';          // 2026-11-18 → 26.11.18
const shortDot = (s, ref) => !s ? '' : (ref && s.slice(0, 4) === ref.slice(0, 4)) ? s.slice(5).replace('-', '.') : dot(s);
function fmtMin(m) {
  m = Math.round(m || 0);
  if (!m) return '0분';
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h}시간` : '', r ? `${r}분` : ''].filter(Boolean).join(' ');
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Store {
  constructor() { this.s = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
    } catch (e) { /* 비공개 모드 등 */ }
    return structuredClone(DEFAULT_STATE);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); return true; } catch (e) { return false; }
  }

  book(id) { return this.s.books.find(b => b.id === id); }
  notesOf(bookId) {
    return this.s.notes.filter(n => n.bookId === bookId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  }
  finalNote(bookId) { return this.s.notes.find(n => n.bookId === bookId && n.final); }
  endDate(bookId) { return this.finalNote(bookId)?.date || null; }
  totalMin(bookId) { return this.notesOf(bookId).reduce((s, n) => s + (n.minutes || 0), 0); }

  upsertBook(b) {
    const i = this.s.books.findIndex(x => x.id === b.id);
    if (i >= 0) this.s.books[i] = { ...this.s.books[i], ...b };
    else this.s.books.push({ id: uid(), created: Date.now(), summary: '', ...b });
    return this.save();
  }
  deleteBook(id) {
    this.s.books = this.s.books.filter(b => b.id !== id);
    this.s.notes = this.s.notes.filter(n => n.bookId !== id);
    return this.save();
  }
  upsertNote(n) {
    if (n.final) this.s.notes.forEach(x => { if (x.bookId === n.bookId && x.id !== n.id) x.final = false; }); // 마지막은 한 개만
    const i = this.s.notes.findIndex(x => x.id === n.id);
    if (i >= 0) this.s.notes[i] = { ...this.s.notes[i], ...n };
    else this.s.notes.push({ id: uid(), created: Date.now(), ...n });
    return this.save();
  }
  deleteNote(id) { this.s.notes = this.s.notes.filter(n => n.id !== id); return this.save(); }
}
const store = new Store();

// ----- 표지 검색 -----
// 순서: 카카오(키 있으면, 한국 책 제일 잘 나옴) → Google Books → Open Library
// 키는 이 폰에만 저장 (코드·백업 파일에 안 들어감)
const KEYS_KEY = 'reading-log-keys';
function getKeys() { try { return JSON.parse(localStorage.getItem(KEYS_KEY)) || {}; } catch (e) { return {}; } }
function setKeys(k) { try { localStorage.setItem(KEYS_KEY, JSON.stringify(k)); return true; } catch (e) { return false; } }

const COVER_SOURCES = {
  async kakao(title, author, key) {
    if (!key) return [];
    const r = await fetch(`https://dapi.kakao.com/v3/search/book?target=title&size=20&query=${encodeURIComponent(title)}`,
      { headers: { Authorization: `KakaoAK ${key}` } });
    if (!r.ok) throw new Error('kakao ' + r.status);
    let docs = (await r.json()).documents || [];
    if (author) { // 글쓴이가 맞는 책을 앞으로
      const a = author.replace(/\s/g, '');
      docs = docs.sort((x, y) => (y.authors.join('').replace(/\s/g, '').includes(a)) - (x.authors.join('').replace(/\s/g, '').includes(a)));
    }
    return docs.filter(d => d.thumbnail).map(d => {
      // 작은 썸네일 주소 안에 원본 이미지 주소(fname)가 들어 있음 → 더 선명한 걸로
      let url = d.thumbnail;
      try { const f = new URL(url).searchParams.get('fname'); if (f) url = f.replace(/^http:/, 'https:'); } catch (e) {}
      return { url, title: d.title, author: d.authors.join(', '), year: (d.datetime || '').slice(0, 4) };
    });
  },
  async google(title, author, key) {
    const get = async q => {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&printType=books${key ? '&key=' + encodeURIComponent(key) : ''}`);
      if (!r.ok) throw new Error('google ' + r.status);
      return (await r.json()).items || [];
    };
    let items = await get([title && `intitle:${title}`, author && `inauthor:${author}`].filter(Boolean).join(' '));
    if (!items.length) items = await get([title, author].filter(Boolean).join(' '));
    return items.map(it => {
      const v = it.volumeInfo || {}, img = v.imageLinks || {};
      const url = img.thumbnail || img.smallThumbnail;
      return url && { url: url.replace(/^http:/, 'https:').replace('&edge=curl', ''), title: v.title || '', author: (v.authors || []).join(', '), year: (v.publishedDate || '').slice(0, 4) };
    }).filter(Boolean);
  },
  async openlibrary(title, author) {
    const get = async q => {
      const r = await fetch(`https://openlibrary.org/search.json?limit=20&fields=title,author_name,cover_i,first_publish_year&q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('openlibrary ' + r.status);
      return (await r.json()).docs || [];
    };
    let docs = (await get([title, author].filter(Boolean).join(' '))).filter(d => d.cover_i);
    if (!docs.length && author) docs = (await get(title)).filter(d => d.cover_i);
    return docs.map(d => ({ url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, title: d.title, author: (d.author_name || []).join(', '), year: String(d.first_publish_year || '') }));
  },
};

// 결과: { list, errors } — 앞 순서에서 찾으면 거기서 멈춤
async function searchCovers(title, author) {
  const keys = getKeys(), errors = [];
  for (const [name, fn] of Object.entries(COVER_SOURCES)) {
    try {
      const list = await fn(title, author, keys[name]);
      if (list.length) {
        const seen = new Set();
        return { list: list.filter(x => !seen.has(x.url) && seen.add(x.url)).slice(0, 12), errors };
      }
    } catch (e) { errors.push(e.message); }
  }
  return { list: [], errors };
}

// 사진을 작게 줄여서 data:URL로 (저장 공간 아끼기)
function shrinkImage(file, maxW = 360) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = fail;
    img.src = URL.createObjectURL(file);
  });
}

// ----- 요약 독후감 요청문 -----
function buildPrompt(bookId) {
  const b = store.book(bookId), notes = store.notesOf(bookId);
  const end = store.endDate(bookId);
  const lines = [
    `아래는 내가 책 한 권을 ${notes.length}번에 나눠 읽으면서 그때그때 쓴 독후감이야.`,
    `이걸 하나로 엮어서 완성된 독후감 한 편으로 정리해 줘.`,
    '',
    '[쓰는 방법]',
    '- 내가 쓴 말투와 생각을 최대한 살려 줘. 내가 쓰지 않은 감상이나 줄거리를 지어내지 마.',
    '- 회차별로 나열하지 말고, 처음부터 끝까지 자연스럽게 읽히는 한 편의 글로 써 줘.',
    '- 읽어가면서 생각이 어떻게 달라졌는지가 드러나면 좋겠어.',
    '- 기억하고 싶은 문장은 어울리는 곳에 인용해 줘.',
    '- 마지막에 이 책에 대한 한 줄 총평을 붙여 줘.',
    '- 제목 한 줄 + 본문만 써 줘. 다른 설명은 붙이지 마.',
    '',
    '[책 정보]',
    `- 제목: ${b.title}`,
    b.author ? `- 글쓴이: ${b.author}` : null,
    `- 읽은 기간: ${b.start || '?'} ~ ${end || '읽는 중'}`,
    `- 총 읽은 시간: ${fmtMin(store.totalMin(bookId))}`,
    '',
  ];
  notes.forEach((n, i) => {
    lines.push(`[${i + 1}회차${n.final ? ' · 마지막' : ''}] ${n.date}${n.range ? ` · ${n.range}` : ''}${n.minutes ? ` · ${fmtMin(n.minutes)}` : ''}`);
    lines.push(n.text?.trim() || '(내용 없음)');
    if (n.quote?.trim()) lines.push(`기억하고 싶은 문장: "${n.quote.trim()}"`);
    lines.push('');
  });
  return lines.filter(l => l !== null).join('\n').trim();
}

// 표지 없는 책의 대신 표지 색 (제목마다 고정)
const PH_COLORS = ['#3c7a5a', '#2f5fd0', '#7c4dcc', '#c2553a', '#8a6d00', '#2e8c8c', '#a63d6b', '#5a6b7a'];
function phColor(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return PH_COLORS[Math.abs(h) % PH_COLORS.length]; }
