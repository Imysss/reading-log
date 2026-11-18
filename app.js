// ===== 화면 =====
const $ = s => document.querySelector(s);
let current = null;     // 보고 있는 책 id (null이면 책장)
let editingBook = null; // 수정 중인 책 id
let editingNote = null; // 수정 중인 독후감 id
let pickedCover = '';   // 책 시트에서 고른 표지

function coverHtml(b) {
  const tag = store.endDate(b.id) ? '<span class="done-tag">완독</span>' : '';
  // 대신 표지를 깔고 그 위에 사진을 얹음 → 사진이 안 열리면(오프라인 등) 사진만 지워서 대신 표지가 보임
  const ph = `<div class="ph" style="background:${phColor(b.title)}"><span>${esc(b.title)}</span><small>${esc(b.author || '')}</small></div>`;
  const img = b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return ph + img + tag;
}
function periodText(b) {
  const end = store.endDate(b.id);
  return `${dot(b.start)} ~ ${end ? shortDot(end, b.start) : '읽는 중'}`;
}

function render() {
  const inBook = !!current && store.book(current);
  if (current && !inBook) current = null;
  $('#view-shelf').hidden = !!inBook;
  $('#view-book').hidden = !inBook;
  $('#backBtn').hidden = !inBook;
  $('#title').textContent = inBook ? '' : '내 책장';
  $('#addBtn').setAttribute('aria-label', inBook ? '독후감 쓰기' : '책 추가');
  inBook ? renderBook() : renderShelf();
}

// ----- 책장 -----
function renderShelf() {
  const books = store.s.books;
  const reading = books.filter(b => !store.endDate(b.id)).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const done = books.filter(b => store.endDate(b.id)).sort((a, b) => store.endDate(b.id).localeCompare(store.endDate(a.id)));
  const year = today().slice(0, 4);
  const doneThisYear = done.filter(b => store.endDate(b.id).startsWith(year)).length;
  const totalMin = store.s.notes.reduce((s, n) => s + (n.minutes || 0), 0);
  $('#stats').innerHTML = `
    <div><span class="label">읽는 중</span><b class="num">${reading.length}권</b></div>
    <div><span class="label">${year}년 완독</span><b class="num">${doneThisYear}권</b></div>
    <div><span class="label">읽은 시간</span><b class="num">${totalMin >= 600 ? Math.floor(totalMin / 60) + '시간' : fmtMin(totalMin)}</b></div>`;

  if (!books.length) {
    $('#shelves').innerHTML = `<div class="empty">아직 꽂힌 책이 없어요.<br>오른쪽 아래 <b>+</b> 를 눌러 읽기 시작한 책을 꽂아보세요 📚</div>`;
    return;
  }
  const shelf = (title, list) => !list.length ? '' : `
    <section><h2>${title} <small>${list.length}권</small></h2>
      <div class="shelf">${list.map((b, i) => `
        <button class="book" data-book="${b.id}">
          <div class="cover">${coverHtml(b)}</div>
          <b>${esc(b.title)}</b>
          <span class="num ${store.endDate(b.id) ? '' : 'reading'}">${periodText(b)}</span>
        </button>${(i % 3 === 2 || i === list.length - 1) ? '<div class="shelf-board"></div>' : ''}`).join('')}
      </div></section>`;
  $('#shelves').innerHTML = shelf('📖 읽는 중', reading) + shelf('✅ 다 읽은 책', done);
}

// ----- 책 상세 -----
function renderBook() {
  const b = store.book(current), notes = store.notesOf(current), end = store.endDate(current);
  $('#bookHead').innerHTML = `
    <div class="cover">${coverHtml(b)}</div>
    <div class="info">
      <h2>${esc(b.title)}</h2>
      <div class="author">${esc(b.author || '')}</div>
      <div class="kvs num">
        <div class="kv"><span>기간</span><b>${periodText(b)}</b></div>
        <div class="kv"><span>읽은 시간</span><b>${fmtMin(store.totalMin(current))}</b></div>
        <div class="kv"><span>독후감</span><b>${notes.length}개</b></div>
      </div>
    </div>`;

  if (b.summary) {
    $('#summaryBox').innerHTML = `<div class="card summary">
      <h2 style="display:flex;justify-content:space-between;margin:0;font-size:15px">✨ 요약 독후감 <button class="chip" id="sumEdit">고치기</button></h2>
      <div class="text">${esc(b.summary)}</div></div>`;
    $('#sumEdit').onclick = openSum;
  } else if (end) {
    $('#summaryBox').innerHTML = `<div class="card summary cta">
      <b>🏁 다 읽었어요!</b>
      <p>지금까지 쓴 ${notes.length}개의 독후감을 Claude에게 보내서 한 편의 독후감으로 엮어볼까요?</p>
      <button class="primary" style="width:100%" id="sumStart">✨ 요약 독후감 만들기</button></div>`;
    $('#sumStart').onclick = openSum;
  } else $('#summaryBox').innerHTML = '';

  $('#noteCount').textContent = notes.length ? `총 ${fmtMin(store.totalMin(current))}` : '';
  $('#notes').innerHTML = !notes.length
    ? `<div class="empty">아직 독후감이 없어요.<br>한 번 읽을 때마다 <b>+</b> 를 눌러 적어두세요 ✍️</div>`
    : notes.slice().reverse().map(n => {
        const i = notes.indexOf(n) + 1;
        return `<button class="card note" data-note="${n.id}">
          <div class="top num"><b>${i}회차</b><span>${dot(n.date)}</span>${n.minutes ? `<span>· ${fmtMin(n.minutes)}</span>` : ''}${n.final ? '<span class="final">🏁 마지막</span>' : ''}</div>
          ${n.range ? `<div class="range">${esc(n.range)}</div>` : ''}
          ${n.text ? `<div class="body">${esc(n.text)}</div>` : ''}
          ${n.quote ? `<div class="quote">${esc(n.quote)}</div>` : ''}
        </button>`;
      }).join('');
}

// ----- 시트 공통 -----
// 시트가 열려 있는 동안 뒤 화면은 스크롤 안 되게 (아이폰에서 시트 안 스크롤이 뒤로 새는 것 방지)
function openSheet(el) { $('#dim').classList.add('on'); el.classList.add('on'); document.documentElement.classList.add('lock'); }
function closeSheets() {
  document.querySelectorAll('.sheet.on').forEach(s => s.classList.remove('on'));
  $('#dim').classList.remove('on');
  document.documentElement.classList.remove('lock');
  document.activeElement?.blur();
}
function persist(ok) { if (ok === false) toast('저장에 실패했어요 (저장 공간 부족?)'); }
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2000);
}

// ----- 책 추가/수정 -----
function openBookForm(id) {
  editingBook = id || null;
  const b = id ? store.book(id) : null;
  $('#bookSheetTitle').textContent = b ? '책 정보 고치기' : '새 책 꽂기';
  $('#bookSaveBtn').textContent = b ? '저장' : '책장에 꽂기';
  $('#bookDelBtn').hidden = !b;
  $('#bTitle').value = b?.title || '';
  $('#bAuthor').value = b?.author || '';
  $('#bStart').value = b?.start || today();
  $('#results').innerHTML = '';
  $('#searchMsg').hidden = true;
  setCover(b?.cover || '');
  openSheet($('#bookSheet'));
}
function setCover(url) {
  pickedCover = url;
  const t = $('#bTitle').value.trim() || '책 이름';
  $('#coverPreview').innerHTML = url ? `<img src="${esc(url)}" alt="">`
    : `<div class="ph" style="background:${phColor(t)};font-size:10px;padding:8px 6px 6px 10px">${esc(t)}</div>`;
  document.querySelectorAll('#results button').forEach(b => b.classList.toggle('on', b.dataset.url === url));
}
async function doSearch() {
  const title = $('#bTitle').value.trim(), author = $('#bAuthor').value.trim();
  if (!title) { toast('책 이름을 먼저 써주세요'); $('#bTitle').focus(); return; }
  document.activeElement?.blur();
  const msg = $('#searchMsg');
  msg.hidden = false; msg.textContent = '표지를 찾는 중…';
  $('#results').innerHTML = '';
  const { list, errors } = await searchCovers(title, author);
  const noKakao = !getKeys().kakao;
  if (!list.length) {
    msg.innerHTML = (errors.length && !navigator.onLine ? '인터넷 연결을 확인해주세요.' : '표지를 못 찾았어요.') +
      ' 📷 사진으로 넣거나 표지 없이 꽂아도 돼요.' +
      (noKakao ? '<br>한국 책은 <button class="chip" data-open-keys>카카오 키</button>를 넣으면 훨씬 잘 찾아요.' : '');
    return;
  }
  {
    msg.innerHTML = '맞는 표지를 골라주세요' + (noKakao ? ' · <button class="sub" data-open-keys style="text-decoration:underline">더 잘 찾으려면</button>' : '');
    $('#results').innerHTML = list.map(r => `
      <button data-url="${esc(r.url)}"><div class="cover"><img src="${esc(r.url)}" alt="" loading="lazy"></div>
      <small>${esc(r.author || r.title)}${r.year ? ' · ' + r.year : ''}</small></button>`).join('');
    if (!pickedCover) setCover(list[0].url); else setCover(pickedCover);
  }
}

// ----- 표지 검색 키 -----
function openKeys() {
  closeSheets();
  const k = getKeys();
  $('#kKakao').value = k.kakao || '';
  $('#kGoogle').value = k.google || '';
  openSheet($('#keySheet'));
}
function saveKeys() {
  persist(setKeys({ kakao: $('#kKakao').value.trim(), google: $('#kGoogle').value.trim() }));
  closeSheets(); toast('저장했어요');
}
function saveBook() {
  const title = $('#bTitle').value.trim();
  if (!title) { toast('책 이름을 써주세요'); return; }
  const data = { title, author: $('#bAuthor').value.trim(), cover: pickedCover, start: $('#bStart').value || today() };
  if (editingBook) data.id = editingBook;
  persist(store.upsertBook(data));
  closeSheets();
  if (!editingBook) current = store.s.books[store.s.books.length - 1].id; // 새 책이면 바로 열기
  render(); toast(editingBook ? '저장했어요' : '책장에 꽂았어요 📚');
}
function deleteBook() {
  const b = store.book(editingBook);
  const n = store.notesOf(editingBook).length;
  if (!confirm(`「${b.title}」을(를) 지울까요?${n ? `\n독후감 ${n}개도 같이 지워져요.` : ''}`)) return;
  persist(store.deleteBook(editingBook));
  current = null; closeSheets(); render(); toast('지웠어요');
}

// ----- 독후감 쓰기 -----
// 독후감 전체 보기 (오른쪽 위 "수정하기" → 고치기 화면)
let viewing = null;
function viewNote(id) {
  const n = store.s.notes.find(x => x.id === id); if (!n) return;
  viewing = id;
  const i = store.notesOf(current).findIndex(x => x.id === id) + 1;
  $('#viewTitle').textContent = `${i}회차 독후감`;
  $('#viewBody').innerHTML = `
    <div class="view-meta num">${dot(n.date)}${n.minutes ? ` · ${fmtMin(n.minutes)}` : ''}${n.final ? ' <span class="final">🏁 마지막</span>' : ''}</div>
    ${n.range ? `<div class="range">${esc(n.range)}</div>` : ''}
    ${n.text ? `<div class="view-text">${esc(n.text)}</div>` : ''}
    ${n.quote ? `<div class="field-label">기억하고 싶은 문장</div><div class="view-quote">${esc(n.quote)}</div>` : ''}`;
  openSheet($('#viewSheet'));
  $('#viewBody').scrollTop = 0;
}

function openNote(id) {
  editingNote = id || null;
  const n = id ? store.s.notes.find(x => x.id === id) : null;
  const count = store.notesOf(current).length;
  $('#noteSheetTitle').textContent = n ? '독후감 고치기' : `${count + 1}회차 독후감`;
  $('#noteDelBtn').hidden = !n;
  $('#nDate').value = n?.date || today();
  $('#nRange').value = n?.range || '';
  setTime(n?.minutes || 0);
  $('#nText').value = n?.text || '';
  $('#nQuote').value = n?.quote || '';
  $('#nFinal').checked = !!n?.final;
  openSheet($('#noteSheet'));
}
const getTime = () => (parseInt($('#nHours').value) || 0) * 60 + (parseInt($('#nMins').value) || 0);
function setTime(m) {
  $('#nHours').value = Math.floor(m / 60) || '';
  $('#nMins').value = m % 60 || '';
}
function saveNote() {
  const text = $('#nText').value.trim();
  if (!text && !$('#nQuote').value.trim()) { toast('내용을 조금이라도 써주세요'); return; }
  const final = $('#nFinal').checked;
  const prevFinal = store.finalNote(current);
  if (final && prevFinal && prevFinal.id !== editingNote &&
      !confirm(`${dot(prevFinal.date)} 독후감이 이미 마지막으로 되어 있어요.\n이 독후감을 마지막으로 바꿀까요?`)) return;
  const data = { bookId: current, date: $('#nDate').value || today(), range: $('#nRange').value.trim(),
                 minutes: getTime(), text, quote: $('#nQuote').value.trim(), final };
  if (editingNote) data.id = editingNote;
  const becameFinal = final && (!prevFinal || prevFinal.id !== editingNote);
  persist(store.upsertNote(data));
  closeSheets(); render();
  if (becameFinal) {
    toast('다 읽었어요! 🎉');
    if (!store.book(current).summary) setTimeout(openSum, 450);
  } else toast('저장했어요');
}
function deleteNote() {
  if (!confirm('이 독후감을 지울까요?')) return;
  persist(store.deleteNote(editingNote));
  closeSheets(); render(); toast('지웠어요');
}

// ----- 요약 독후감 -----
function openSum() {
  closeSheets();
  if (!store.notesOf(current).length) { toast('독후감을 먼저 써주세요'); return; }
  $('#sumText').value = store.book(current).summary || '';
  openSheet($('#sumSheet'));
}
async function copyPrompt() {
  const text = buildPrompt(current);
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) { // 오래된 브라우저 대비
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('복사했어요! Claude에 붙여넣어 주세요');
}
function saveSum() {
  persist(store.upsertBook({ id: current, summary: $('#sumText').value.trim() }));
  closeSheets(); render(); toast($('#sumText').value.trim() ? '요약 독후감을 저장했어요 ✨' : '저장했어요');
}

// ----- 백업 -----
async function exportData() {
  const name = `독후감_${today()}.json`;
  const file = new File([JSON.stringify(store.s, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (data.version !== 1 || !Array.isArray(data.books) || !Array.isArray(data.notes)) throw new SyntaxError('형식 오류');
      if (!confirm(`책 ${data.books.length}권, 독후감 ${data.notes.length}개를 불러올까요?\n지금 기록은 백업 내용으로 바뀌어요.`)) return;
      store.s = { ...structuredClone(DEFAULT_STATE), ...data };
      persist(store.save()); current = null; closeSheets(); render(); toast('불러왔어요');
    } catch (e) { toast('백업 파일을 읽지 못했어요'); }
  };
  r.readAsText(file);
}

// ----- 이벤트 -----
$('#shelves').onclick = e => { const b = e.target.closest('[data-book]'); if (b) { current = b.dataset.book; render(); scrollTo(0, 0); } };
$('#notes').onclick = e => { const n = e.target.closest('[data-note]'); if (n) viewNote(n.dataset.note); };
$('#viewEditBtn').onclick = () => { const id = viewing; closeSheets(); setTimeout(() => openNote(id), 200); };
$('#backBtn').onclick = () => { current = null; render(); };
$('#addBtn').onclick = () => current ? openNote() : openBookForm();
$('#dim').onclick = closeSheets;
$('#menuBtn').onclick = () => { $('#bookMenu').hidden = !current; openSheet($('#menuSheet')); };
$('#editBookBtn').onclick = () => { closeSheets(); openBookForm(current); };
$('#openSumBtn').onclick = openSum;

$('#searchBtn').onclick = doSearch;
$('#bAuthor').onkeydown = e => { if (e.key === 'Enter') doSearch(); };
$('#bTitle').oninput = () => { if (!pickedCover) setCover(''); };
$('#results').onclick = e => { const b = e.target.closest('[data-url]'); if (b) setCover(b.dataset.url); };
$('#noCoverBtn').onclick = () => setCover('');
$('#photoBtn').onclick = () => $('#photoInput').click();
$('#photoInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { setCover(await shrinkImage(f)); } catch (err) { toast('사진을 읽지 못했어요'); }
};
$('#bookSaveBtn').onclick = saveBook;
$('#bookDelBtn').onclick = deleteBook;

$('#timeQuick').onclick = e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const add = +b.dataset.add;
  setTime(add ? getTime() + add : 0);
};
$('#noteSaveBtn').onclick = saveNote;
$('#noteDelBtn').onclick = deleteNote;

$('#copyPromptBtn').onclick = copyPrompt;
$('#sumSaveBtn').onclick = saveSum;

$('#searchMsg').onclick = e => { if (e.target.closest('[data-open-keys]')) openKeys(); };
$('#keysBtn').onclick = openKeys;
$('#keySaveBtn').onclick = saveKeys;

$('#exportBtn').onclick = exportData;
$('#importBtn').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };

render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
