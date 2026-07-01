/* =========================================
   TRAVEL AGENT — Chat UI Controller
   ========================================= */

// ---- DOM refs ----
const chatMessages   = document.getElementById('chatMessages');
const inputField     = document.getElementById('inputField');
const sendBtn        = document.getElementById('sendBtn');
const resetBtn       = document.getElementById('resetBtn');
const changeKeyBtn   = document.getElementById('changeKeyBtn');
const sidebarToggle  = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar        = document.getElementById('sidebar');
const stageText      = document.getElementById('stageText');
const agentItems     = document.querySelectorAll('.agent-item');
const planningView   = document.getElementById('planningView');
const pvProgressBar  = document.getElementById('pvProgressBar');
const pvEditorPhase  = document.getElementById('pvEditorPhase');
const apikeyModal    = document.getElementById('apikeyModal');
const apikeyInput    = document.getElementById('apikeyInput');
const apikeyConfirm  = document.getElementById('apikeyConfirm');
const apikeyToggle   = document.getElementById('apikeyToggle');

// Set initial message timestamp
document.getElementById('initTime').textContent = formatTime(new Date());

// ---- API Key Modal ----
function getApiKey() {
  return localStorage.getItem('gemini_api_key') || null;
}
function saveApiKey(key) {
  localStorage.setItem('gemini_api_key', key);
}

function openApiKeyModal() {
  apikeyInput.value = getApiKey() || '';
  apikeyModal.classList.add('is-active');
  apikeyModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => apikeyInput.focus(), 100);
  lucide.createIcons();
}
function closeApiKeyModal() {
  apikeyModal.classList.remove('is-active');
  apikeyModal.setAttribute('aria-hidden', 'true');
}

// Show modal on load if no key
if (!getApiKey()) openApiKeyModal();

// Toggle password visibility
apikeyToggle.addEventListener('click', () => {
  const isHidden = apikeyInput.type === 'password';
  apikeyInput.type = isHidden ? 'text' : 'password';
  apikeyToggle.innerHTML = isHidden
    ? '<i data-lucide="eye-off"></i>'
    : '<i data-lucide="eye"></i>';
  lucide.createIcons();
});

// Confirm key
apikeyConfirm.addEventListener('click', handleApiKeyConfirm);
apikeyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleApiKeyConfirm();
});

function handleApiKeyConfirm() {
  const key = apikeyInput.value.trim();
  if (!key) {
    showModalError('API 키를 입력해주세요.');
    return;
  }
  saveApiKey(key);
  closeApiKeyModal();
}

function showModalError(msg) {
  let err = apikeyModal.querySelector('.apikey-modal__error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'apikey-modal__error';
    apikeyConfirm.before(err);
  }
  err.textContent = msg;
}

// Sidebar key change button
changeKeyBtn.addEventListener('click', openApiKeyModal);

// ---- State ----
let conversationHistory = [];
let isPlanning = false;

// ---- Map Picker (province → zoom-in → city) ----
const SVGNS = 'http://www.w3.org/2000/svg';
let fullVB = [0, 0, 100, 100];   // full-map viewBox, derived from data.fullBox
let provFont = 14;               // province label size, derived from map width

// Pad a [x0,y0,x1,y1] box and return a viewBox [x,y,w,h]
function padBox(box, ratio) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0;
  const p = Math.max(w, h) * ratio;
  return [x0 - p, y0 - p, w + 2 * p, h + 2 * p];
}

// Resize the SVG element to match a viewBox's aspect ratio, filling the card
// as much as possible. Keeps the zoomed province edge-to-edge (no letterbox),
// so a wide province like 경남 renders large instead of shrunk into a tall frame.
function sizeMapTo(svg, boxW, boxH) {
  const wrap = svg.parentElement;
  const maxW = wrap.clientWidth || 480;
  const maxH = Math.min(window.innerHeight * 0.74, 680);
  const ar = boxW / boxH;
  let W = maxW, H = maxW / ar;
  if (H > maxH) { H = maxH; W = maxH * ar; }
  svg.style.width = W + 'px';
  svg.style.height = H + 'px';
}

const SHORT_LABEL = {
  '경기도': '경기', '강원도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주도': '제주',
};

let activeMapPicker = null;

function renderMapPicker() {
  const tpl = document.getElementById('mapPickerTemplate');
  if (!tpl) return;
  const node = tpl.content.firstElementChild.cloneNode(true);
  chatMessages.appendChild(node);
  activeMapPicker = node;
  buildProvinceMap(node);
  lucide.createIcons();
  scrollBottom();
}

// --- Build the initial provinces-only map ---
function buildProvinceMap(node) {
  const data = window.KOREA_MAP;
  const svg     = node.querySelector('svg.korea-map');
  const gProv   = node.querySelector('.layer-provinces');
  const gLabels = node.querySelector('.layer-labels');
  const backBtn = node.querySelector('.map-zoom-back');
  if (!data || !svg) return;

  fullVB = padBox(data.fullBox, 0.03);
  provFont = fullVB[2] / 30;
  svg.setAttribute('viewBox', fullVB.join(' '));
  sizeMapTo(svg, fullVB[2], fullVB[3]);

  data.provinces.forEach(p => {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('class', 'map-province');
    path.setAttribute('data-region', p.name);
    path.addEventListener('click', () => enterProvince(node, p));
    gProv.appendChild(path);
  });

  renderLabels(gLabels, data.provinces.map(p => ({
    name: SHORT_LABEL[p.name] || p.name, c: p.c,
  })), provFont, '');

  backBtn.addEventListener('click', () => exitProvince(node));
}

function renderLabels(gLabels, items, fontSize, extraClass) {
  gLabels.innerHTML = '';
  items.forEach(it => {
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', it.c[0]);
    t.setAttribute('y', it.c[1]);
    t.setAttribute('font-size', fontSize);
    t.setAttribute('class', 'map-label ' + (extraClass || ''));
    t.textContent = it.name;
    gLabels.appendChild(t);
  });
}

// --- Zoom into a province, reveal its cities ---
function enterProvince(node, p) {
  if (node.dataset.mode === 'city') return;
  node.dataset.mode = 'city';

  const svg     = node.querySelector('svg.korea-map');
  const gProv   = node.querySelector('.layer-provinces');
  const gCity   = node.querySelector('.layer-cities');
  const gLabels = node.querySelector('.layer-labels');
  const backBtn = node.querySelector('.map-zoom-back');
  const hint    = node.querySelector('.map-picker__hint-text');

  // Compute zoom target from the province's mainland box (islands excluded so
  // far-flung isles like 울릉도 don't shrink the framing), padded & aspect-matched
  const [minx, miny, maxx, maxy] = p.zbox || p.bbox;
  const bw = maxx - minx, bh = maxy - miny;
  const pad = Math.max(bw, bh) * 0.05;
  const target = [minx - pad, miny - pad, bw + 2 * pad, bh + 2 * pad];
  const cityFont = target[2] / 40;
  sizeMapTo(svg, target[2], target[3]);

  // Build city shapes
  gCity.innerHTML = '';
  p.cities.forEach(c => {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', c.d);
    path.setAttribute('class', 'map-city');
    path.setAttribute('data-region', c.name);
    path.addEventListener('click', () => selectDestination(c.name));
    gCity.appendChild(path);
  });

  renderLabels(gLabels, p.cities.map(c => ({ name: c.name, c: c.c })), cityFont, 'map-label--city');

  gProv.classList.add('is-dim');
  gCity.classList.add('is-active');
  backBtn.hidden = false;
  if (hint) hint.textContent = `${p.name} — 도시를 클릭하세요`;

  animateViewBox(svg, currentVB(svg), target, 650);
}

// --- Zoom back out to the full province map ---
function exitProvince(node) {
  if (node.dataset.mode !== 'city') return;
  node.dataset.mode = 'province';

  const data    = window.KOREA_MAP;
  const svg     = node.querySelector('svg.korea-map');
  const gProv   = node.querySelector('.layer-provinces');
  const gCity   = node.querySelector('.layer-cities');
  const gLabels = node.querySelector('.layer-labels');
  const backBtn = node.querySelector('.map-zoom-back');
  const hint    = node.querySelector('.map-picker__hint-text');

  gProv.classList.remove('is-dim');
  gCity.classList.remove('is-active');
  backBtn.hidden = true;
  if (hint) hint.textContent = '지도에서 도를 클릭하면 세부 도시를 선택할 수 있어요';

  renderLabels(gLabels, data.provinces.map(p => ({
    name: SHORT_LABEL[p.name] || p.name, c: p.c,
  })), provFont, '');

  sizeMapTo(svg, fullVB[2], fullVB[3]);
  animateViewBox(svg, currentVB(svg), fullVB, 550, () => { gCity.innerHTML = ''; });
}

// --- viewBox helpers ---
function currentVB(svg) {
  return svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
}

function animateViewBox(svg, from, to, dur, onDone) {
  const t0 = performance.now();
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function frame(now) {
    const k = Math.min(1, (now - t0) / dur);
    const e = ease(k);
    const vb = from.map((f, i) => f + (to[i] - f) * e);
    svg.setAttribute('viewBox', vb.join(' '));
    if (k < 1) requestAnimationFrame(frame);
    else if (onDone) onDone();
  }
  requestAnimationFrame(frame);
}

function hideMapPicker() {
  if (!activeMapPicker) return;
  const el = activeMapPicker;
  activeMapPicker = null;
  el.classList.add('is-hidden');
  setTimeout(() => el.remove(), 350);
}

function selectDestination(name) {
  if (isPlanning) return;
  hideMapPicker();
  inputField.value = name;
  handleSend();
}

// ---- Sidebar mobile toggle ----
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('is-open');
  sidebarOverlay.classList.toggle('is-open');
});
sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-open');
});

// ---- Reset ----
resetBtn.addEventListener('click', () => {
  if (!confirm('새 여행 계획을 시작할까요? 현재 대화가 초기화됩니다.')) return;
  resetConversation();
});

function resetConversation() {
  conversationHistory = [];
  isPlanning = false;
  chatMessages.innerHTML = '';
  agentItems.forEach(item => {
    item.classList.remove('agent-item--active', 'agent-item--done');
    const dot = item.querySelector('.status-indicator');
    dot.classList.remove('status-indicator--active', 'status-indicator--done');
  });
  agentItems[0].classList.add('agent-item--active');
  agentItems[0].querySelector('.status-indicator').classList.add('status-indicator--active');
  stageText.textContent = '정보 수집 중';
  appendAiMessage(
    '안녕하세요! 저는 AI 여행 플래너입니다. ✈️\n' +
    '몇 가지 질문에 답해주시면, 맞춤형 여행 일정을 만들어 드릴게요.\n' +
    '어디로 여행을 떠나실 예정인가요?'
  );
  renderMapPicker();
}

// ---- Send ----
inputField.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
sendBtn.addEventListener('click', handleSend);

inputField.addEventListener('input', () => {
  inputField.style.height = 'auto';
  inputField.style.height = Math.min(inputField.scrollHeight, 120) + 'px';
});

async function handleSend() {
  const rawText = inputField.value.trim();
  if (!rawText || isPlanning) return;

  hideMapPicker();
  removeQuickReplies();
  appendUserMessage(rawText);
  inputField.value = '';
  inputField.style.height = 'auto';
  conversationHistory.push({ role: 'user', parts: [{ text: rawText }] });

  sendBtn.disabled = true;
  const typingEl = showTyping();

  try {
    if (!getApiKey()) {
      removeTyping(typingEl);
      sendBtn.disabled = false;
      openApiKeyModal();
      return;
    }
    const reply = await callGemini(conversationHistory, COLLECTION_SYSTEM_PROMPT);
    removeTyping(typingEl);
    conversationHistory.push({ role: 'model', parts: [{ text: reply }] });

    if (reply.includes('PLANNING_START')) {
      // Show the announcement without the trigger token
      const announcement = reply.replace('PLANNING_START', '').trim();
      if (announcement) appendAiMessage(announcement);

      // Side bar: mark orchestrator done, parallel agents active
      setAgentsDone([0]);
      setAgentsActive([1, 2, 3]);
      stageText.textContent = '병렬 분석 중';

      // Run planning overlay + API call in parallel
      isPlanning = true;
      const [itinerary] = await Promise.all([
        generateItinerary(),
        runPlanningAnimation(),
      ]);

      await hidePlanningView();

      setAgentsDone([0, 1, 2, 3]);
      setAgentsActive([4]);
      stageText.textContent = '최종 일정표 작성 중';

      appendAiMessage(itinerary, 'file-text');
      conversationHistory.push({ role: 'model', parts: [{ text: itinerary }] });

      setAgentsDone([0, 1, 2, 3, 4]);
      setAgentsActive([]);
      stageText.textContent = '일정 완성!';
      isPlanning = false;

    } else {
      appendAiMessage(reply);
    }
  } catch (err) {
    removeTyping(typingEl);
    appendAiMessage('⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    console.error(err);
    isPlanning = false;
  } finally {
    sendBtn.disabled = false;
    inputField.focus();
  }
}

// ---- Gemini API ----
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

const COLLECTION_SYSTEM_PROMPT = `당신은 전국 여행 계획 전문 AI 오케스트레이터입니다.
사용자와 대화하며 아래 6가지 정보를 순서대로 수집하세요:
1. 여행지 (어느 지역?)
2. 여행 기간 (며칠?)
3. 여행 목적 (자연, 맛집, 역사, 힐링, 액티비티 등)
4. 이동 수단 (대중교통 / 자차)
5. 예산 수준 (저가 / 중간 / 고급)
6. 동행 인원 (혼자 / 커플 / 가족 / 친구 몇 명)

항상 한국어로 친절하게 대화하세요. 한 번에 한 가지 질문만 하세요.

6가지 정보를 모두 수집하면 반드시 다음 형식으로 응답하세요:
- 응답 첫 줄에 반드시 "PLANNING_START" 텍스트를 포함하세요
- 그 아래에 "코스 플래너, 숙소 플래너, 교통 플래너가 분석을 시작합니다!" 와 같이 안내 메시지를 작성하세요
- 일정표는 직접 생성하지 마세요`;

const ITINERARY_SYSTEM_PROMPT = `당신은 여행 일정 편집 전문가입니다.
대화 내역을 참고하여 사용자의 여행 조건에 맞는 완성형 여행 일정표를 한국어로 작성하세요.

반드시 아래 형식을 포함하세요:
1. **이동 교통편** — 출발지→목적지 이동 수단, 소요 시간, 예상 비용
2. **DAY별 일정 표** — 각 날짜별 시간 | 장소 | 소요 시간 | 이동 방법 형식의 표
3. **추천 숙소** — 1순위 + 대안 숙소 (가격대, 위치, 특징)
4. **총 예상 비용 표** — 교통비, 숙박비, 식비, 입장료 등 항목별
5. **여행 목적별 팁** — 해당 여행 목적에 맞는 현지 팁 3~5가지
6. 마지막에 "수정하고 싶은 부분이 있으신가요?" 로 마무리

장소 간 이동은 현실적인 시간을 고려하고, 하루 동선은 지리적으로 인접한 곳 위주로 구성하세요.
모든 내용은 한국어로 작성하세요.`;

async function callGemini(history, systemPrompt) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다. /apikey YOUR_KEY 를 입력해주세요.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(응답 없음)';
}

async function generateItinerary() {
  return callGemini(conversationHistory, ITINERARY_SYSTEM_PROMPT);
}


// ---- Planning View Animation ----
const AGENT_STEPS = {
  course: [
    '여행지 명소 데이터 검색 중...',
    '여행 목적에 맞는 장소 필터링 중...',
    '장소 간 이동 시간 계산 중...',
    '동선 최적화 알고리즘 실행 중...',
    '날짜별 일정 구성 완료 ✓',
  ],
  accommodation: [
    '숙소 데이터베이스 조회 중...',
    '예산 범위 필터 적용 중...',
    '동선 중심부 접근성 분석 중...',
    '리뷰 점수 & 편의시설 정렬 중...',
    '최적 숙소 선정 완료 ✓',
  ],
  transport: [
    '출발지→목적지 노선 탐색 중...',
    '대중교통 시간표 확인 중...',
    '현지 이동 경로 분석 중...',
    '구간별 요금 계산 중...',
    '교통 계획 수립 완료 ✓',
  ],
};

function showPlanningView() {
  planningView.setAttribute('aria-hidden', 'false');
  planningView.classList.add('is-active');

  // Reset cards
  ['course', 'accommodation', 'transport'].forEach(id => {
    document.getElementById(`pvCard-${id}`).className = 'pv-card';
    document.getElementById(`pvStatus-${id}`).textContent = '대기 중';
    document.getElementById(`pvLog-${id}`).innerHTML = '';
  });
  pvEditorPhase.classList.remove('is-visible');
  pvProgressBar.style.width = '0%';
  lucide.createIcons();
}

function runPlanningAnimation() {
  return new Promise(resolve => {
    showPlanningView();

    // Progress bar — fills to 88% over ~14s, then waits for API
    let progress = 0;
    const progInterval = setInterval(() => {
      progress = Math.min(progress + 1.2, 88);
      pvProgressBar.style.width = progress + '%';
      if (progress >= 88) clearInterval(progInterval);
    }, 200);

    const STEP_MS = 900;   // ms per step
    const STAGGER = 600;   // delay between agent starts

    let doneCount = 0;

    function animateCard(agentId, startDelay) {
      const card   = document.getElementById(`pvCard-${agentId}`);
      const status = document.getElementById(`pvStatus-${agentId}`);
      const log    = document.getElementById(`pvLog-${agentId}`);
      const steps  = AGENT_STEPS[agentId];

      setTimeout(() => {
        card.classList.add('is-active');
        status.textContent = '분석 중';

        steps.forEach((stepText, i) => {
          const isDone = i === steps.length - 1;
          setTimeout(() => {
            // Mark previous step done
            if (i > 0) {
              const prev = log.querySelectorAll('.pv-log-item')[i - 1];
              if (prev) {
                prev.classList.remove('is-current');
                prev.classList.add('is-done-step');
                const cursor = prev.querySelector('.pv-log-cursor');
                if (cursor) cursor.remove();
                prev.querySelector('.pv-log-item__prefix').textContent = '✓';
              }
            }

            // Add new step
            const li = document.createElement('li');
            li.className = `pv-log-item${isDone ? '' : ' is-current'}`;
            li.innerHTML = `<span class="pv-log-item__prefix">${isDone ? '✓' : '›'}</span>${escapeHtml(stepText)}${isDone ? '' : '<span class="pv-log-cursor"></span>'}`;
            log.appendChild(li);
            requestAnimationFrame(() => li.classList.add('is-visible'));

            // Last step: mark card done
            if (isDone) {
              setTimeout(() => {
                li.classList.add('is-done-step');
                card.classList.remove('is-active');
                card.classList.add('is-done');
                status.textContent = '완료 ✓';

                doneCount++;
                if (doneCount === 3) {
                  clearInterval(progInterval);
                  pvProgressBar.style.width = '95%';
                  pvEditorPhase.classList.add('is-visible');
                  resolve(); // unblock Promise.all — API might still be running
                }
              }, 400);
            }
          }, i * STEP_MS);
        });
      }, startDelay);
    }

    animateCard('course',        0);
    animateCard('accommodation', STAGGER);
    animateCard('transport',     STAGGER * 2);
  });
}

function hidePlanningView() {
  return new Promise(resolve => {
    pvProgressBar.style.width = '100%';
    setTimeout(() => {
      planningView.classList.remove('is-active');
      planningView.setAttribute('aria-hidden', 'true');
      setTimeout(resolve, 500);
    }, 600);
  });
}

// ---- Sidebar state ----
function setAgentsDone(indices) {
  indices.forEach(i => {
    if (!agentItems[i]) return;
    agentItems[i].classList.remove('agent-item--active');
    agentItems[i].classList.add('agent-item--done');
    const dot = agentItems[i].querySelector('.status-indicator');
    dot.classList.remove('status-indicator--active');
    dot.classList.add('status-indicator--done');
  });
}

function setAgentsActive(indices) {
  agentItems.forEach((item, i) => {
    if (!indices.includes(i)) return;
    item.classList.remove('agent-item--done');
    item.classList.add('agent-item--active');
    const dot = item.querySelector('.status-indicator');
    dot.classList.remove('status-indicator--done');
    dot.classList.add('status-indicator--active');
  });
}

// ---- Quick Replies ----
const QUICK_REPLIES = {
  days:      ['1박 2일', '2박 3일', '3박 4일', '4박 5일', '5박 이상'],
  purpose:   ['자연·풍경', '맛집 탐방', '역사·문화', '힐링·휴양', '액티비티'],
  transport: ['대중교통', '자차'],
  budget:    ['저가', '중간', '고급'],
  group:     ['혼자', '커플 (2인)', '가족', '친구 2~3명', '친구 4명 이상'],
};

function detectQuestion(text) {
  if (/며칠|몇 박|기간|날짜/.test(text)) return 'days';
  if (/목적|테마|어떤 여행/.test(text)) return 'purpose';
  if (/이동 수단|교통 수단|대중교통|자차/.test(text)) return 'transport';
  if (/예산|비용/.test(text)) return 'budget';
  if (/동행|인원|함께|혼자/.test(text)) return 'group';
  return null;
}

function renderQuickReplies(options) {
  removeQuickReplies();
  const el = document.createElement('div');
  el.className = 'quick-replies';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quick-reply-btn';
    btn.type = 'button';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      removeQuickReplies();
      inputField.value = opt;
      handleSend();
    });
    el.appendChild(btn);
  });
  chatMessages.appendChild(el);
  scrollBottom();
}

function removeQuickReplies() {
  chatMessages.querySelectorAll('.quick-replies').forEach(el => el.remove());
}

// ---- Message helpers ----
function appendUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg msg--user';
  el.innerHTML = `
    <div class="msg__body">
      <div class="msg__bubble">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      <span class="msg__time">${formatTime(new Date())}</span>
    </div>`;
  chatMessages.appendChild(el);
  scrollBottom();
}

function appendAiMessage(text, lucideIcon = 'target') {
  const el = document.createElement('div');
  el.className = 'msg msg--ai';
  const rendered = marked.parse(text);
  el.innerHTML = `
    <div class="msg__avatar"><i data-lucide="${lucideIcon}"></i></div>
    <div class="msg__body">
      <div class="msg__bubble msg__bubble--md">${rendered}</div>
      <span class="msg__time">${formatTime(new Date())}</span>
    </div>`;
  chatMessages.appendChild(el);
  lucide.createIcons();
  scrollBottom();

  if (!isPlanning) {
    const qType = detectQuestion(text);
    if (qType) renderQuickReplies(QUICK_REPLIES[qType]);
  }
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg--ai msg--typing';
  el.innerHTML = `
    <div class="msg__avatar"><i data-lucide="target"></i></div>
    <div class="msg__body">
      <div class="msg__bubble">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  chatMessages.appendChild(el);
  lucide.createIcons();
  scrollBottom();
  return el;
}

function removeTyping(el) { el?.remove(); }

function scrollBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(date) {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Initial map picker (below the hardcoded greeting) ----
renderMapPicker();
