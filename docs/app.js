const state = {
  data: null,
  division: 'ALL'
};

const number = new Intl.NumberFormat('ko-KR');

function formatNumber(value) {
  return number.format(Math.round(value));
}

function formatDecimal(value) {
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: value % 1 === 0 ? 0 : 1 });
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function getDivisionEntry(division) {
  return state.data.divisionCards.find((item) => item.name === division);
}

function buildView() {
  const data = state.data;
  if (!data) return null;

  if (state.division === 'ALL') {
    return {
      meta: data.meta,
      kpis: {
        totalCalls: data.kpis.totalCalls,
        avgCallsPerRep: data.kpis.avgCallsPerRep,
        avgCallsPerDay: data.kpis.avgCallsPerDay,
        uniqueBranches: data.meta.uniqueBranches,
        uniqueReps: data.meta.uniqueReps,
        unlabeledProductShare: data.kpis.unlabeledProductShare
      },
      dailySeries: data.dailySeries.map((item) => ({ label: item.label, calls: item.calls })),
      branchRows: data.branchRows,
      repRows: data.repRows,
      productRows: data.productRows,
      specialtyRows: data.specialtyRows,
      visitDepth: data.visitDepth,
      insights: data.insights,
      focusReps: data.focusReps,
      divisionCards: data.divisionCards
    };
  }

  const divisionEntry = getDivisionEntry(state.division);
  const branchRows = data.branchRows.filter((item) => item.division === state.division);
  const repRows = data.repRows.filter((item) => item.division === state.division);
  const productRows = data.productRows
    .map((item) => ({
      product: item.product,
      calls: item.divisionBreakdown[state.division] || 0,
      branches: item.branches,
      reps: item.reps
    }))
    .filter((item) => item.calls > 0)
    .sort((left, right) => right.calls - left.calls)
    .map((item) => ({ ...item, share: ((item.calls / divisionEntry.calls) * 100).toFixed(1) }));
  const dailySeries = data.dailySeries.map((item) => ({
    label: item.label,
    calls: item.divisions[state.division] || 0
  }));

  const uniqueSpecialties = new Map();
  for (const rep of repRows) {
    if (!uniqueSpecialties.has(rep.topSpecialty)) {
      uniqueSpecialties.set(rep.topSpecialty, { specialty: rep.topSpecialty, calls: 0 });
    }
    uniqueSpecialties.get(rep.topSpecialty).calls += rep.calls;
  }
  const specialtyRows = [...uniqueSpecialties.values()]
    .sort((left, right) => right.calls - left.calls)
    .slice(0, 8)
    .map((item) => ({
      specialty: item.specialty,
      calls: item.calls,
      share: ((item.calls / divisionEntry.calls) * 100).toFixed(1)
    }));

  return {
    meta: data.meta,
    kpis: {
      totalCalls: divisionEntry.calls,
      avgCallsPerRep: divisionEntry.avgCallsPerRep,
      avgCallsPerDay: divisionEntry.calls / data.meta.activeDays,
      uniqueBranches: divisionEntry.branches,
      uniqueReps: divisionEntry.reps,
      unlabeledProductShare: Number(productRows.find((item) => item.product === '미분류')?.share || 0)
    },
    dailySeries,
    branchRows,
    repRows,
    productRows,
    specialtyRows,
    visitDepth: data.visitDepth,
    insights: data.insights.filter((item) => !item.body.includes('전체의')),
    focusReps: data.focusReps.filter((item) => item.division === state.division),
    divisionCards: data.divisionCards
  };
}

function renderMeta() {
  const meta = state.data.meta;
  const panel = document.querySelector('#meta-panel');
  panel.innerHTML = `
    <div class="meta-stack">
      <div>
        <p class="eyebrow">Snapshot</p>
        <h2>${meta.month} 로우데이터</h2>
      </div>
      <div class="meta-row">
        <div class="meta-pill">
          <span class="meta-pill-label">행 수</span>
          <span class="meta-pill-value">${formatNumber(meta.sourceRows)}</span>
        </div>
        <div class="meta-pill">
          <span class="meta-pill-label">활성 담당자</span>
          <span class="meta-pill-value">${formatNumber(meta.uniqueReps)}</span>
        </div>
      </div>
      <div class="meta-row">
        <div class="meta-pill">
          <span class="meta-pill-label">지점 수</span>
          <span class="meta-pill-value">${formatNumber(meta.uniqueBranches)}</span>
        </div>
        <div class="meta-pill">
          <span class="meta-pill-label">스냅샷</span>
          <span class="meta-pill-value">${meta.snapshotAt.slice(0, 10)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderFilters() {
  const container = document.querySelector('#division-filter');
  const items = [{ key: 'ALL', label: '전체' }, ...state.data.divisionCards.map((item) => ({ key: item.name, label: item.name.replace('영업부문', '') }))];
  container.innerHTML = items
    .map((item) => `<button class="filter-button ${state.division === item.key ? 'active' : ''}" data-division="${item.key}">${item.label}</button>`)
    .join('');

  container.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.division = button.dataset.division;
      renderFilters();
      render();
    });
  });
}

function renderInsights(view) {
  const grid = document.querySelector('#insight-grid');
  const insights = view.insights.slice(0, 6);
  grid.innerHTML = insights
    .map(
      (item) => `
        <article class="insight-card" data-tone="${item.tone}">
          <p class="kicker">${item.title}</p>
          <p>${item.body}</p>
          <span class="insight-metric">${item.metric}</span>
        </article>
      `
    )
    .join('');
}

function renderKpis(view) {
  const cards = [
    {
      label: '총 CALL',
      value: formatNumber(view.kpis.totalCalls),
      help: '현재 선택 범위 기준 전체 영업 활동 수'
    },
    {
      label: '평균 CALL / 담당자',
      value: formatDecimal(view.kpis.avgCallsPerRep),
      help: '담당자 1인당 평균 활동량'
    },
    {
      label: '평균 CALL / 일',
      value: formatDecimal(view.kpis.avgCallsPerDay),
      help: '월 내 활동일 기준 평균 속도'
    },
    {
      label: '활성 지점',
      value: formatNumber(view.kpis.uniqueBranches),
      help: '현재 범위에 걸린 지점 수'
    },
    {
      label: '활성 담당자',
      value: formatNumber(view.kpis.uniqueReps),
      help: '현재 범위에 걸린 담당자 수'
    },
    {
      label: '미분류 품목 비중',
      value: `${formatDecimal(view.kpis.unlabeledProductShare)}%`,
      help: '품목 라벨 공백이 분석 정확도를 깎는 비율'
    }
  ];

  document.querySelector('#kpi-grid').innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <span class="kpi-label">${card.label}</span>
          <strong class="kpi-value">${card.value}</strong>
          <p class="kpi-help">${card.help}</p>
        </article>
      `
    )
    .join('');
}

function renderDailySeries(view) {
  const max = Math.max(...view.dailySeries.map((item) => item.calls), 1);
  document.querySelector('#daily-chart').innerHTML = view.dailySeries
    .map(
      (item, index) => `
        <div class="day-column" style="animation-delay:${index * 18}ms">
          <span class="day-value">${formatNumber(item.calls)}</span>
          <div class="day-bar-track">
            <div class="day-bar" style="height:${Math.max((item.calls / max) * 100, 4)}%"></div>
          </div>
          <span class="day-label">${item.label}</span>
        </div>
      `
    )
    .join('');
}

function renderVisitDepth(view) {
  const max = Math.max(...view.visitDepth.map((item) => item.count), 1);
  document.querySelector('#visit-depth').innerHTML = view.visitDepth
    .map(
      (item) => `
        <div class="depth-row">
          <strong>${item.bucket}</strong>
          <div class="depth-track">
            <div class="depth-fill" style="width:${(item.count / max) * 100}%"></div>
          </div>
          <span>${formatNumber(item.count)}</span>
        </div>
      `
    )
    .join('');
}

function renderDivisionCards(view) {
  document.querySelector('#division-cards').innerHTML = view.divisionCards
    .map(
      (item) => `
        <article class="division-card">
          <p class="small-label">${item.name}</p>
          <strong class="large-number">${formatNumber(item.calls)}</strong>
          <p>지점 ${formatNumber(item.branches)}개 · 담당자 ${formatNumber(item.reps)}명 · 대표 품목 ${item.topProduct}</p>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
            <span class="badge">비중 ${formatDecimal(item.share)}%</span>
            <span class="badge">평균 ${formatDecimal(item.avgCallsPerRep)}콜</span>
          </div>
        </article>
      `
    )
    .join('');
}

function renderBranchTable(view) {
  const rows = view.branchRows.slice(0, 14);
  document.querySelector('#branch-table').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>지점</th>
          <th>부문</th>
          <th>CALL</th>
          <th>담당자</th>
          <th>계정</th>
          <th>계정당 콜</th>
          <th>대표 품목</th>
          <th>품목 비중</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (item) => `
              <tr>
                <td><strong>${item.branch}</strong></td>
                <td>${item.department}</td>
                <td>${formatNumber(item.calls)}</td>
                <td>${formatNumber(item.reps)}</td>
                <td>${formatNumber(item.accounts)}</td>
                <td>${formatDecimal(item.avgCallsPerAccount)}</td>
                <td>${item.topProduct}</td>
                <td>${formatDecimal(item.topProductShare)}%</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderBarList(selector, items, labelKey, valueKey = 'calls', shareKey = 'share') {
  const container = document.querySelector(selector);
  const max = Math.max(...items.map((item) => item[valueKey]), 1);
  container.innerHTML = items
    .slice(0, 10)
    .map(
      (item) => `
        <div class="bar-row">
          <strong>${item[labelKey]}</strong>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(item[valueKey] / max) * 100}%"></div>
          </div>
          <span>${formatDecimal(Number(item[shareKey]))}%</span>
        </div>
      `
    )
    .join('');
}

function renderReps(view) {
  document.querySelector('#rep-list').innerHTML = view.repRows
    .slice(0, 8)
    .map(
      (item, index) => `
        <article class="rep-card">
          <div class="rep-head">
            <h3>${index + 1}. ${item.name}</h3>
            <span class="badge">${formatNumber(item.calls)}콜</span>
          </div>
          <p>${item.branch} · 계정 ${formatNumber(item.accounts)}개 · 대표 품목 ${item.topProduct}</p>
        </article>
      `
    )
    .join('');
}

function renderFocus(view) {
  const list = view.focusReps.slice(0, 8);
  const container = document.querySelector('#focus-list');
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">현재 선택 범위에서는 편중 리스크 후보가 없습니다.</div>';
    return;
  }

  container.innerHTML = list
    .map(
      (item) => `
        <article class="focus-card">
          <div class="focus-head">
            <h3>${item.name}</h3>
            <span class="badge">${formatDecimal(item.topProductShare)}%</span>
          </div>
          <p>${item.branch} · ${item.topProduct} 집중도가 높은 편입니다. 전체 ${formatNumber(item.calls)}콜 중 대표 품목 비중이 큽니다.</p>
        </article>
      `
    )
    .join('');
}

function renderMapping() {
  const { availableNow, needsMasterData } = state.data.mapping;
  document.querySelector('#mapping-grid').innerHTML = `
    <article class="mapping-card">
      <p class="kicker">로우데이터만으로 바로 보이는 항목</p>
      <ul>${availableNow.map((item) => `<li>${item}</li>`).join('')}</ul>
    </article>
    <article class="mapping-card">
      <p class="kicker">추가 마스터가 있으면 붙는 항목</p>
      <ul>${needsMasterData.map((item) => `<li>${item}</li>`).join('')}</ul>
    </article>
  `;
}

function render() {
  const view = buildView();
  renderInsights(view);
  renderKpis(view);
  renderDailySeries(view);
  renderVisitDepth(view);
  renderDivisionCards(view);
  renderBranchTable(view);
  renderBarList('#product-list', view.productRows, 'product');
  renderBarList('#specialty-list', view.specialtyRows, 'specialty');
  renderReps(view);
  renderFocus(view);
}

async function init() {
  const response = await fetch('./data/dashboard-data.json');
  state.data = await response.json();
  renderMeta();
  renderFilters();
  renderMapping();
  render();
}

init().catch((error) => {
  document.querySelector('#app').innerHTML = `<section class="panel panel-wide"><div class="empty-state">대시보드를 불러오지 못했습니다. ${error.message}</div></section>`;
});
