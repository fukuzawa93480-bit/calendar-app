'use strict';

/* ========== 状態管理 ========== */
let currentDate = new Date();
let miniDate = new Date();
let currentView = 'month';
let events = JSON.parse(localStorage.getItem('cal_events') || '[]');
let editingId = null;
let selectedColor = '#4285F4';
let activeCalendars = { personal: true, work: true, holiday: true, other: true };
let popupEventId = null;
let searchQuery = '';

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/* ========== ユーティリティ ========== */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => toDateStr(new Date());

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveEvents() {
  localStorage.setItem('cal_events', JSON.stringify(events));
}

function formatDatetime(event) {
  if (event.allDay) {
    if (event.startDate === event.endDate) return event.startDate.replace(/-/g, '/');
    return `${event.startDate.replace(/-/g, '/')} ～ ${event.endDate.replace(/-/g, '/')}`;
  }
  const s = `${event.startDate.replace(/-/g, '/')} ${event.startTime}`;
  const e = event.endDate === event.startDate
    ? event.endTime
    : `${event.endDate.replace(/-/g, '/')} ${event.endTime}`;
  return `${s} ～ ${e}`;
}

function getVisibleEvents() {
  return events.filter(e => activeCalendars[e.calendar] !== false);
}

function getEventsForDate(dateStr) {
  return getVisibleEvents().filter(e => {
    if (e.repeat === 'none' || !e.repeat) {
      return dateStr >= e.startDate && dateStr <= e.endDate;
    }
    return matchesRepeat(e, dateStr);
  });
}

function matchesRepeat(ev, dateStr) {
  const d = new Date(dateStr);
  const s = new Date(ev.startDate);
  if (d < s) return false;
  switch (ev.repeat) {
    case 'daily': return true;
    case 'weekly': return d.getDay() === s.getDay();
    case 'monthly': return d.getDate() === s.getDate();
    case 'yearly': return d.getMonth() === s.getMonth() && d.getDate() === s.getDate();
    default: return false;
  }
}

/* ========== 祝日データ（日本） ========== */
const HOLIDAYS_2025_2026 = {
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日', '2025-02-24': '振替休日', '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日', '2025-05-06': '振替休日', '2025-07-21': '海の日',
  '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日', '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日', '2026-01-01': '元日', '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
};

function seedHolidays() {
  const existing = events.filter(e => e.calendar === 'holiday' && e.isHoliday);
  const existingDates = new Set(existing.map(e => e.startDate));
  Object.entries(HOLIDAYS_2025_2026).forEach(([date, name]) => {
    if (!existingDates.has(date)) {
      events.push({
        id: generateId(), title: name, startDate: date, endDate: date,
        startTime: '', endTime: '', allDay: true, calendar: 'holiday',
        color: '#EA4335', location: '', description: '', repeat: 'none',
        reminder: 'none', isHoliday: true,
      });
    }
  });
  saveEvents();
}

/* ========== レンダリング ========== */
function render() {
  updateCalTitle();
  if (currentView === 'month') renderMonth();
  else if (currentView === 'week') renderWeek();
  else if (currentView === 'day') renderDay();
  renderMiniCal();
}

function updateCalTitle() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  if (currentView === 'month') $('calTitle').textContent = `${y}年 ${MONTHS_JA[m]}`;
  else if (currentView === 'week') {
    const mon = getWeekStart(currentDate);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    $('calTitle').textContent = `${mon.getFullYear()}年 ${MONTHS_JA[mon.getMonth()]} ${mon.getDate()}日 ～ ${sun.getDate()}日`;
  } else {
    $('calTitle').textContent = `${y}年 ${MONTHS_JA[m]} ${currentDate.getDate()}日 (${DAYS_JA[currentDate.getDay()]})`;
  }
}

/* --- 月表示 --- */
function renderMonth() {
  const body = $('monthBody');
  body.innerHTML = '';
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const todayStr = today();
  const cells = [];
  let totalCells = 42;

  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrevMonth - firstDay + 1 + i;
    const dt = new Date(y, m - 1, d);
    cells.push({ date: dt, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(y, m, d), current: true });
  }
  while (cells.length < totalCells) {
    const d = cells.length - firstDay - daysInMonth + 1;
    cells.push({ date: new Date(y, m + 1, d), current: false });
  }

  cells.forEach(({ date, current }) => {
    const dateStr = toDateStr(date);
    const cell = document.createElement('div');
    cell.className = 'month-cell' + (!current ? ' other-month' : '') + (dateStr === todayStr ? ' today' : '');
    cell.dataset.date = dateStr;

    const dateEl = document.createElement('div');
    dateEl.className = 'cell-date';
    dateEl.textContent = date.getDate();
    cell.appendChild(dateEl);

    const dayEvents = getEventsForDate(dateStr);
    const maxShow = 3;
    dayEvents.slice(0, maxShow).forEach(ev => {
      const el = document.createElement('div');
      el.className = 'month-event' + (ev.allDay ? ' all-day' : ' timed');
      el.style.background = ev.color || '#4285F4';
      el.textContent = ev.title;
      el.title = ev.title;
      el.dataset.id = ev.id;
      el.addEventListener('click', e => { e.stopPropagation(); showEventPopup(ev.id, el); });
      cell.appendChild(el);
    });
    if (dayEvents.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'month-more';
      more.textContent = `他 ${dayEvents.length - maxShow} 件`;
      more.addEventListener('click', e => { e.stopPropagation(); switchView('day'); currentDate = new Date(date); render(); });
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => openNewEventModal(dateStr));
    body.appendChild(cell);
  });
}

/* --- 週表示 --- */
function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function renderWeek() {
  const weekStart = getWeekStart(currentDate);
  const todayStr = today();

  // ヘッダー
  const headerRow = $('weekHeaderRow');
  headerRow.innerHTML = '<div class="week-header-cell" style="background:transparent;border:none"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    const cell = document.createElement('div');
    cell.className = 'week-header-cell' + (ds === todayStr ? ' today' : '');
    cell.innerHTML = `<div class="wh-day">${DAYS_JA[d.getDay()]}</div><div class="wh-date">${d.getDate()}</div>`;
    cell.querySelector('.wh-date').addEventListener('click', () => { currentDate = new Date(d); switchView('day'); });
    headerRow.appendChild(cell);
  }

  // 時刻列
  const timeCol = $('timeCol');
  timeCol.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const el = document.createElement('div');
    el.className = 'time-slot-label';
    el.textContent = h === 0 ? '' : `${h}:00`;
    timeCol.appendChild(el);
  }

  // グリッド
  const grid = $('weekGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const ds = toDateStr(d);
    const col = document.createElement('div');
    col.className = 'week-col';
    for (let h = 0; h < 24; h++) {
      const cell = document.createElement('div');
      cell.className = 'hour-cell';
      cell.addEventListener('click', () => openNewEventModal(ds, pad(h) + ':00'));
      col.appendChild(cell);
    }
    // イベント配置
    getEventsForDate(ds).filter(e => !e.allDay).forEach(ev => {
      placeTimeEvent(col, ev, 'week-event');
    });
    grid.appendChild(col);
  }
  placeNowLine(grid, weekStart, 7);
}

function placeTimeEvent(container, ev, cls) {
  const [sh, sm] = ev.startTime.split(':').map(Number);
  const [eh, em] = ev.endTime.split(':').map(Number);
  const top = (sh * 60 + sm);
  const height = Math.max((eh * 60 + em) - top, 20);
  const el = document.createElement('div');
  el.className = cls;
  el.style.top = `${top}px`;
  el.style.height = `${height}px`;
  el.style.background = ev.color || '#4285F4';
  el.innerHTML = `<div>${ev.title}</div><div style="font-size:10px;opacity:.85">${ev.startTime}～${ev.endTime}</div>`;
  el.dataset.id = ev.id;
  el.title = `${ev.title} (${ev.startTime}～${ev.endTime})`;
  el.addEventListener('click', e => { e.stopPropagation(); showEventPopup(ev.id, el); });
  container.appendChild(el);
}

function placeNowLine(grid, weekStart, cols) {
  const now = new Date();
  const nowDateStr = toDateStr(now);
  const weekStart2 = new Date(weekStart);
  for (let i = 0; i < cols; i++) {
    const d = new Date(weekStart2); d.setDate(d.getDate() + i);
    if (toDateStr(d) === nowDateStr) {
      const col = grid.children[i];
      if (!col) return;
      const mins = now.getHours() * 60 + now.getMinutes();
      const line = document.createElement('div');
      line.className = 'now-line';
      line.style.top = `${mins}px`;
      line.innerHTML = '<div class="now-dot"></div>';
      col.appendChild(line);
      break;
    }
  }
}

/* --- 日表示 --- */
function renderDay() {
  const ds = toDateStr(currentDate);
  const todayStr = today();

  // ヘッダー
  const bar = $('dayHeaderBar');
  bar.innerHTML = '<div></div>';
  const info = document.createElement('div');
  info.className = 'day-header-info' + (ds === todayStr ? ' today' : '');
  info.innerHTML = `<div class="dh-day">${DAYS_JA[currentDate.getDay()]}</div><div class="dh-date">${currentDate.getDate()}</div>`;
  bar.appendChild(info);

  // 時刻列
  const timeCol = $('dayTimeCol');
  timeCol.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const el = document.createElement('div');
    el.className = 'time-slot-label';
    el.textContent = h === 0 ? '' : `${h}:00`;
    timeCol.appendChild(el);
  }

  // グリッド
  const grid = $('dayGrid');
  grid.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement('div');
    cell.className = 'day-hour-cell';
    cell.addEventListener('click', () => openNewEventModal(ds, pad(h) + ':00'));
    grid.appendChild(cell);
  }
  getEventsForDate(ds).filter(e => !e.allDay).forEach(ev => {
    placeTimeEvent(grid, ev, 'day-event');
  });

  // 現在時刻ライン
  if (ds === todayStr) {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement('div');
    line.className = 'now-line';
    line.style.top = `${mins}px`;
    line.innerHTML = '<div class="now-dot"></div>';
    grid.appendChild(line);
  }
}

/* --- ミニカレンダー --- */
function renderMiniCal() {
  const y = miniDate.getFullYear();
  const m = miniDate.getMonth();
  $('miniCalTitle').textContent = `${y}年${MONTHS_JA[m]}`;
  const container = $('miniCalDays');
  container.innerHTML = '';
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrev = new Date(y, m, 0).getDate();
  const todayStr = today();
  const currentStr = toDateStr(currentDate);
  const allEventDates = new Set(getVisibleEvents().flatMap(e => {
    if (!e.allDay && !e.repeat) return [e.startDate];
    return [e.startDate];
  }));

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ d: daysInPrev - firstDay + 1 + i, cur: false, date: new Date(y, m-1, daysInPrev - firstDay + 1 + i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, cur: true, date: new Date(y, m, d) });
  while (cells.length < 42) { const d = cells.length - firstDay - daysInMonth + 1; cells.push({ d, cur: false, date: new Date(y, m+1, d) }); }

  cells.forEach(({ d, cur, date }) => {
    const ds = toDateStr(date);
    const el = document.createElement('div');
    el.className = 'mini-day' +
      (!cur ? ' other-month' : '') +
      (ds === todayStr ? ' today' : '') +
      (ds === currentStr && currentView !== 'month' ? ' selected' : '') +
      (allEventDates.has(ds) ? ' has-event' : '');
    el.textContent = d;
    el.addEventListener('click', () => {
      currentDate = new Date(date);
      miniDate = new Date(date);
      if (currentView === 'month') { currentDate = new Date(y, m, 1); }
      render();
    });
    container.appendChild(el);
  });
}

/* ========== ビュー切り替え ========== */
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('monthView').classList.toggle('hidden', view !== 'month');
  $('weekView').classList.toggle('hidden', view !== 'week');
  $('dayView').classList.toggle('hidden', view !== 'day');
  $('searchResults').classList.add('hidden');
  render();
}

/* ========== ナビゲーション ========== */
function navigate(dir) {
  if (currentView === 'month') {
    currentDate.setMonth(currentDate.getMonth() + dir);
  } else if (currentView === 'week') {
    currentDate.setDate(currentDate.getDate() + dir * 7);
  } else {
    currentDate.setDate(currentDate.getDate() + dir);
  }
  miniDate = new Date(currentDate);
  render();
}

/* ========== モーダル ========== */
function openNewEventModal(dateStr, time) {
  editingId = null;
  $('modalTitle').textContent = '予定を追加';
  $('btnDelete').classList.add('hidden');
  $('eventTitle').value = '';
  $('eventLocation').value = '';
  $('eventDesc').value = '';
  $('eventCal').value = 'personal';
  $('eventRepeat').value = 'none';
  $('eventReminder').value = 'none';
  $('allDayCheck').checked = !time;
  $('startDate').value = dateStr || today();
  $('endDate').value = dateStr || today();
  if (time) {
    const [h, min] = time.split(':').map(Number);
    const endH = (h + 1) % 24;
    $('startTime').value = `${pad(h)}:${pad(min || 0)}`;
    $('endTime').value = `${pad(endH)}:00`;
  } else {
    $('startTime').value = '09:00';
    $('endTime').value = '10:00';
  }
  toggleAllDay();
  setSelectedColor('#4285F4');
  $('eventModal').classList.remove('hidden');
  setTimeout(() => $('eventTitle').focus(), 50);
}

function openEditEventModal(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  editingId = id;
  $('modalTitle').textContent = '予定を編集';
  $('btnDelete').classList.remove('hidden');
  $('eventTitle').value = ev.title;
  $('eventLocation').value = ev.location || '';
  $('eventDesc').value = ev.description || '';
  $('eventCal').value = ev.calendar || 'personal';
  $('eventRepeat').value = ev.repeat || 'none';
  $('eventReminder').value = ev.reminder || 'none';
  $('allDayCheck').checked = !!ev.allDay;
  $('startDate').value = ev.startDate;
  $('endDate').value = ev.endDate;
  $('startTime').value = ev.startTime || '09:00';
  $('endTime').value = ev.endTime || '10:00';
  toggleAllDay();
  setSelectedColor(ev.color || '#4285F4');
  $('eventModal').classList.remove('hidden');
  setTimeout(() => $('eventTitle').focus(), 50);
}

function closeModal() {
  $('eventModal').classList.add('hidden');
  editingId = null;
}

function toggleAllDay() {
  const allDay = $('allDayCheck').checked;
  const timeInputs = document.querySelectorAll('#startTime, #endTime');
  timeInputs.forEach(el => { el.style.display = allDay ? 'none' : ''; });
}

function setSelectedColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

function saveEvent() {
  const title = $('eventTitle').value.trim();
  if (!title) { $('eventTitle').focus(); $('eventTitle').style.borderBottomColor = '#EA4335'; return; }
  $('eventTitle').style.borderBottomColor = '';

  const ev = {
    id: editingId || generateId(),
    title,
    startDate: $('startDate').value,
    endDate: $('endDate').value || $('startDate').value,
    startTime: $('allDayCheck').checked ? '' : $('startTime').value,
    endTime: $('allDayCheck').checked ? '' : $('endTime').value,
    allDay: $('allDayCheck').checked,
    location: $('eventLocation').value.trim(),
    description: $('eventDesc').value.trim(),
    calendar: $('eventCal').value,
    color: selectedColor,
    repeat: $('eventRepeat').value,
    reminder: $('eventReminder').value,
  };

  if (editingId) {
    const idx = events.findIndex(e => e.id === editingId);
    if (idx !== -1) events[idx] = ev;
  } else {
    events.push(ev);
  }
  saveEvents();
  closeModal();
  render();
}

function deleteEvent(id) {
  if (!confirm('この予定を削除しますか？')) return;
  events = events.filter(e => e.id !== id);
  saveEvents();
  closeModal();
  closePopup();
  render();
}

/* ========== イベントポップアップ ========== */
function showEventPopup(id, anchor) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  popupEventId = id;
  const popup = $('eventPopup');

  $('popupTitle').textContent = ev.title;
  $('popupColorBar').style.background = ev.color || '#4285F4';
  $('popupDateTime').textContent = '📅 ' + formatDatetime(ev);
  $('popupLocation').textContent = ev.location ? '📍 ' + ev.location : '';
  $('popupDesc').textContent = ev.description ? '📝 ' + ev.description : '';
  const calName = { personal: '個人', work: '仕事', holiday: '祝日', other: 'その他' };
  $('popupCal').textContent = '📋 ' + (calName[ev.calendar] || ev.calendar);

  popup.classList.remove('hidden');
  $('overlayBg').classList.remove('hidden');

  // 位置計算
  const rect = anchor.getBoundingClientRect();
  const pw = 320;
  let left = rect.right + 8;
  if (left + pw > window.innerWidth) left = rect.left - pw - 8;
  if (left < 8) left = 8;
  let top = rect.top;
  const ph = popup.offsetHeight || 200;
  if (top + ph > window.innerHeight) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function closePopup() {
  $('eventPopup').classList.add('hidden');
  $('overlayBg').classList.add('hidden');
  popupEventId = null;
}

/* ========== 検索 ========== */
function performSearch(query) {
  searchQuery = query.trim();
  if (!searchQuery) {
    $('searchResults').classList.add('hidden');
    $('monthView').classList.toggle('hidden', currentView !== 'month');
    $('weekView').classList.toggle('hidden', currentView !== 'week');
    $('dayView').classList.toggle('hidden', currentView !== 'day');
    $('searchClear').style.display = 'none';
    return;
  }
  $('searchClear').style.display = 'block';
  $('monthView').classList.add('hidden');
  $('weekView').classList.add('hidden');
  $('dayView').classList.add('hidden');
  $('searchResults').classList.remove('hidden');

  const q = searchQuery.toLowerCase();
  const results = events.filter(e =>
    e.title.toLowerCase().includes(q) ||
    (e.location || '').toLowerCase().includes(q) ||
    (e.description || '').toLowerCase().includes(q)
  ).sort((a, b) => a.startDate.localeCompare(b.startDate));

  const list = $('searchResultsList');
  list.innerHTML = '';
  if (results.length === 0) {
    list.innerHTML = `<div class="search-no-result">「${searchQuery}」に一致する予定はありません</div>`;
    return;
  }
  results.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.innerHTML = `
      <div class="search-result-dot" style="background:${ev.color || '#4285F4'}"></div>
      <div class="search-result-body">
        <div class="search-result-title">${highlight(ev.title, q)}</div>
        <div class="search-result-meta">${formatDatetime(ev)}${ev.location ? ' · ' + ev.location : ''}</div>
      </div>`;
    item.addEventListener('click', () => {
      $('searchInput').value = '';
      performSearch('');
      currentDate = new Date(ev.startDate);
      miniDate = new Date(ev.startDate);
      switchView('month');
      setTimeout(() => showEventPopup(ev.id, item), 100);
    });
    list.appendChild(item);
  });
}

function highlight(text, query) {
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark style="background:#fef08a">$1</mark>');
}

/* ========== 現在時刻ライン自動更新 ========== */
setInterval(() => {
  if (currentView === 'week' || currentView === 'day') render();
}, 60000);

/* ========== イベントリスナー ========== */
// ナビ
$('btnPrev').addEventListener('click', () => navigate(-1));
$('btnNext').addEventListener('click', () => navigate(1));
$('btnToday').addEventListener('click', () => { currentDate = new Date(); miniDate = new Date(); render(); });
$('miniPrev').addEventListener('click', () => { miniDate.setMonth(miniDate.getMonth() - 1); renderMiniCal(); });
$('miniNext').addEventListener('click', () => { miniDate.setMonth(miniDate.getMonth() + 1); renderMiniCal(); });

// ビュー切り替え
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// 新規予定
$('btnNewEvent').addEventListener('click', () => openNewEventModal(today()));
$('sidebarNewBtn').addEventListener('click', () => openNewEventModal(today()));

// サイドバートグル
$('sidebarToggle').addEventListener('click', () => {
  const sb = $('sidebar');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('mobile-open');
  } else {
    sb.classList.toggle('collapsed');
  }
});

// モーダル
$('modalClose').addEventListener('click', closeModal);
$('btnCancel').addEventListener('click', closeModal);
$('btnSave').addEventListener('click', saveEvent);
$('btnDelete').addEventListener('click', () => deleteEvent(editingId));
$('allDayCheck').addEventListener('change', toggleAllDay);
$('eventTitle').addEventListener('input', () => { $('eventTitle').style.borderBottomColor = ''; });

// 開始日変更で終了日を同期
$('startDate').addEventListener('change', () => {
  if ($('endDate').value < $('startDate').value) $('endDate').value = $('startDate').value;
});

// 色選択
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => setSelectedColor(btn.dataset.color));
});

// モーダルオーバーレイクリック
$('eventModal').addEventListener('click', e => { if (e.target === $('eventModal')) closeModal(); });

// ポップアップ
$('popupClose').addEventListener('click', closePopup);
$('popupEdit').addEventListener('click', () => { const id = popupEventId; closePopup(); openEditEventModal(id); });
$('popupDelete').addEventListener('click', () => deleteEvent(popupEventId));
$('overlayBg').addEventListener('click', closePopup);

// カレンダーフィルター
document.querySelectorAll('[data-cal]').forEach(cb => {
  cb.addEventListener('change', () => {
    activeCalendars[cb.dataset.cal] = cb.checked;
    render();
  });
});

// 検索
let searchTimer;
$('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => performSearch(e.target.value), 250);
});
$('searchClear').addEventListener('click', () => {
  $('searchInput').value = '';
  performSearch('');
  $('searchInput').focus();
});

// キーボードショートカット
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape') { closePopup(); closeModal(); }
  if (e.key === 'm') switchView('month');
  if (e.key === 'w') switchView('week');
  if (e.key === 'd') switchView('day');
  if (e.key === 't') { currentDate = new Date(); miniDate = new Date(); render(); }
  if (e.key === 'ArrowLeft') navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
  if (e.key === 'n') openNewEventModal(today());
});

// Escキー for モーダル内
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('eventModal').classList.contains('hidden')) closeModal(); }
  if (e.key === 'Enter' && !$('eventModal').classList.contains('hidden') && e.ctrlKey) saveEvent();
});

/* ========== 初期化 ========== */
seedHolidays();
switchView('month');
render();

// 週・日表示で現在時刻にスクロール
function scrollToNow() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const scrollTo = Math.max(0, mins - 60);
  const weekBody = document.querySelector('.week-body');
  const dayBody = document.querySelector('.day-body');
  if (weekBody) weekBody.scrollTop = scrollTo;
  if (dayBody) dayBody.scrollTop = scrollTo;
}
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(scrollToNow, 50));
});
