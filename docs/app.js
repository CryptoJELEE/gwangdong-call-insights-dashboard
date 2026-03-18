const state = {
  data: null,
  division: 'ALL',
  entityType: 'branch',
  selectedEntityId: null,
  searchTerm: ''
};

const number = new Intl.NumberFormat('ko-KR');

function formatNumber(value) {
  return number.format(Math.round(Number(value) || 0));
}

function formatDecimal(value) {
  const numeric = Number(value) || 0;
  return numeric.toLocaleString('ko-KR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1
  });
}

function maxValue(items, selector) {
  return Math.max(...items.map(selector), 1);
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
      insights: data.insights,
      actionQueue: data.actionQueue,
      dailySeries: data.dailySeries.map((item) => ({ label: item.label, calls: item.calls })),
      visitDepth: data.visitDepth,
      divisionCards: data.divisionCards,
      branchRows: data.branchRows,
      repRows: data.repRows,
      productRows: data.productRows,
      specialtyRows: data.specialtyRows,
      branchDetails: data.branchDetails,
      repDetails: data.repDetails,
      productDetails: data.productDetails,
      productBranchMatrix: data.productBranchMatrix,
      focusReps: data.focusReps
    };
  }

  const divisionEntry = data.divisionCards.find((item) => item.name === state.division);
  const branchRows = data.branchRows.filter((item) => item.division === state.division);
  const repRows = data.repRows.filter((item) => item.division === state.division);
  const productRows = data.productRows
    .map((item) => ({
      ...item,
      calls: item.divisionBreakdown[state.division] || 0
    }))
    .filter((item) => item.calls > 0)
    .sort((left, right) => right.calls - left.calls)
    .map((item) => ({
      ...item,
      share: Number(((item.calls / divisionEntry.calls) * 100).toFixed(1))
    }));
  const specialtyRows = data.specialtyRows
    .filter((item) => {
      const repMatches = repRows.filter((rep) => rep.topSpecialty === item.specialty);
      return repMatches.length > 0;
    })
    .map((item) => {
      const calls = repRows
        .filter((rep) => rep.topSpecialty === item.specialty)
        .reduce((total, rep) => total + rep.calls, 0);
      return {
        specialty: item.specialty,
        calls,
        share: Number(((calls / divisionEntry.calls) * 100).toFixed(1))
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const branchIds = new Set(branchRows.map((item) => item.branch));
  const repIds = new Set(repRows.map((item) => item.repId));
  const productIds = new Set(productRows.map((item) => item.product));

  return {
    meta: data.meta,
    kpis: {
      totalCalls: divisionEntry.calls,
      avgCallsPerRep: divisionEntry.avgCallsPerRep,
      avgCallsPerDay: divisionEntry.calls / data.meta.activeDays,
      uniqueBranches: divisionEntry.branches,
      uniqueReps: divisionEntry.reps,
      unlabeledProductShare: divisionEntry.unlabeledShare
    },
    insights: data.insights.filter((item) => !item.body.includes('반대로')),
    actionQueue: data.actionQueue.filter((item) => {
      if (item.ownerType === 'global') return false;
      if (item.ownerType === 'branch') return branchIds.has(item.ownerId);
      if (item.ownerType === 'rep') return repIds.has(item.ownerId);
      if (item.ownerType === 'product') return productIds.has(item.ownerId);
      return false;
    }),
    dailySeries: data.dailySeries.map((item) => ({
      label: item.label,
      calls: item.divisions[state.division] || 0
    })),
    visitDepth: data.visitDepth,
    divisionCards: data.divisionCards,
    branchRows,
    repRows,
    productRows,
    specialtyRows,
    branchDetails: data.branchDetails.filter((item) => item.division === state.division),
    repDetails: data.repDetails.filter((item) => item.division === state.division),
    productDetails: data.productDetails.filter((item) => productRows.some((row) => row.product === item.label)),
    productBranchMatrix: data.productBranchMatrix.filter((item) => productRows.some((row) => row.product === item.product)),
    focusReps: data.focusReps.filter((item) => item.division === state.division)
  };
}

function getEntityCollection(view) {
  if (state.entityType === 'rep') return view.repDetails;
  if (state.entityType === 'product') return view.productDetails;
  return view.branchDetails;
}

function ensureSelection(view) {
  const collection = getEntityCollection(view);
  if (collection.length === 0) {
    state.selectedEntityId = null;
    return;
  }

  const exists = collection.some((item) => item.id === state.selectedEntityId);
  if (!exists) {
    state.selectedEntityId = collection[0].id;
  }
}

function findSelectedDetail(view) {
  return getEntityCollection(view).find((item) => item.id === state.selectedEntityId) || null;
}

function renderMeta() {
  const meta = state.data.meta;
  document.querySelector('#meta-panel').innerHTML = `
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
  const items = [
    { key: 'ALL', label: '전체' },
    ...state.data.divisionCards.map((item) => ({
      key: item.name,
      label: item.name.replace('영업부문', '')
    }))
  ];

  container.innerHTML = items
    .map(
      (item) => `<button class="filter-button ${state.division === item.key ? 'active' : ''}" data-division="${item.key}">${item.label}</button>`
    )
    .join('');

  container.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.division = button.dataset.division;
      state.selectedEntityId = null;
      renderFilters();
      render();
    });
  });
}

function renderInsights(view) {
  document.querySelector('#insight-grid').innerHTML = view.insights
    .slice(0, 6)
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

function renderActionQueue(view) {
  document.querySelector('#action-grid').innerHTML = view.actionQueue
    .slice(0, 6)
    .map(
      (item) => `
        <article class="action-card" data-tone="${item.tone}" data-owner-type="${item.ownerType}" data-owner-id="${item.ownerId}">
          <div class="action-head">
            <div>
              <p class="kicker">${item.title}</p>
              <h3>${item.ownerLabel}</h3>
            </div>
            <span class="badge">${item.metric}</span>
          </div>
          <p>${item.body}</p>
        </article>
      `
    )
    .join('');

  document.querySelectorAll('.action-card').forEach((card) => {
    card.addEventListener('click', () => {
      const ownerType = card.dataset.ownerType;
      const ownerId = card.dataset.ownerId;
      if (ownerType === 'global') return;
      state.entityType = ownerType;
      state.selectedEntityId = ownerId;
      render();
      document.querySelector('#entity-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderKpis(view) {
  const cards = [
    { label: '총 CALL', value: formatNumber(view.kpis.totalCalls), help: '현재 선택 범위 기준 전체 영업 활동 수' },
    { label: '평균 CALL / 담당자', value: formatDecimal(view.kpis.avgCallsPerRep), help: '담당자 1인당 평균 활동량' },
    { label: '평균 CALL / 일', value: formatDecimal(view.kpis.avgCallsPerDay), help: '월 내 활동일 기준 평균 속도' },
    { label: '활성 지점', value: formatNumber(view.kpis.uniqueBranches), help: '현재 범위에 걸린 지점 수' },
    { label: '활성 담당자', value: formatNumber(view.kpis.uniqueReps), help: '현재 범위에 걸린 담당자 수' },
    { label: '미분류 품목 비중', value: `${formatDecimal(view.kpis.unlabeledProductShare)}%`, help: '품목 라벨 공백이 해석 정확도를 깎는 비율' }
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
  const max = maxValue(view.dailySeries, (item) => item.calls);
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
  const max = maxValue(view.visitDepth, (item) => item.count);
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
          <div class="tag-row">
            <span class="badge">비중 ${formatDecimal(item.share)}%</span>
            <span class="badge">평균 ${formatDecimal(item.avgCallsPerRep)}콜</span>
            <span class="badge">미분류 ${formatDecimal(item.unlabeledShare)}%</span>
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
          <th>미분류</th>
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
                <td>${formatDecimal(item.unlabeledShare)}%</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderBarList(selector, items, labelKey) {
  const container = document.querySelector(selector);
  const rows = items.slice(0, 10);
  const max = maxValue(rows, (item) => item.calls);
  container.innerHTML = rows
    .map(
      (item) => `
        <div class="bar-row">
          <strong>${item[labelKey]}</strong>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(item.calls / max) * 100}%"></div>
          </div>
          <span>${formatDecimal(item.share)}%</span>
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

function renderEntityTabs() {
  const tabs = [
    { key: 'branch', label: '지점' },
    { key: 'rep', label: '담당자' },
    { key: 'product', label: '품목' }
  ];

  document.querySelector('#entity-tabs').innerHTML = tabs
    .map(
      (tab) => `<button class="pill-tab ${state.entityType === tab.key ? 'active' : ''}" data-entity-type="${tab.key}">${tab.label}</button>`
    )
    .join('');

  document.querySelectorAll('.pill-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.entityType = button.dataset.entityType;
      state.selectedEntityId = null;
      render();
    });
  });
}

function renderEntityList(view) {
  const search = state.searchTerm.trim().toLowerCase();
  const collection = getEntityCollection(view).filter((item) => {
    const text = `${item.label} ${item.summary || ''} ${item.branch || ''}`.toLowerCase();
    return text.includes(search);
  });
  ensureSelection({ ...view, [state.entityType + 'Details']: collection, branchDetails: state.entityType === 'branch' ? collection : view.branchDetails, repDetails: state.entityType === 'rep' ? collection : view.repDetails, productDetails: state.entityType === 'product' ? collection : view.productDetails });

  const html = collection.length
    ? collection
        .slice(0, 24)
        .map(
          (item) => `
            <button class="entity-item ${state.selectedEntityId === item.id ? 'active' : ''}" data-entity-id="${item.id}">
              <strong>${item.label}</strong>
              <span>${item.summary || item.branch || ''}</span>
            </button>
          `
        )
        .join('')
    : '<div class="empty-state">검색 결과가 없습니다.</div>';

  document.querySelector('#entity-list').innerHTML = html;

  document.querySelectorAll('.entity-item').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedEntityId = button.dataset.entityId;
      renderEntityList(view);
      renderEntityDetail(view);
    });
  });
}

function metricValue(metric) {
  return typeof metric.value === 'number' ? formatDecimal(metric.value) : metric.value;
}

function renderSubList(title, rows, labelKey = 'product') {
  if (!rows || rows.length === 0) {
    return '';
  }

  const max = maxValue(rows, (item) => item.calls);
  return `
    <div class="detail-subsection">
      <h4>${title}</h4>
      <div class="mini-bars">
        ${rows
          .map(
            (item) => `
              <div class="mini-bar-row">
                <span>${item[labelKey] || item.name || item.account || item.branch}</span>
                <div class="mini-bar-track">
                  <div class="mini-bar-fill" style="width:${(item.calls / max) * 100}%"></div>
                </div>
                <strong>${formatNumber(item.calls)}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderEntityDetail(view) {
  const detail = findSelectedDetail(view);
  const container = document.querySelector('#entity-detail');
  if (!detail) {
    container.innerHTML = '<div class="empty-state">선택 가능한 상세 대상이 없습니다.</div>';
    return;
  }

  const metrics = detail.metrics
    .map(
      (metric) => `
        <div class="metric-chip">
          <span>${metric.label}</span>
          <strong>${metricValue(metric)}</strong>
        </div>
      `
    )
    .join('');

  let sections = '';
  if (detail.topProducts) sections += renderSubList('상위 품목', detail.topProducts, 'product');
  if (detail.topReps) sections += renderSubList('상위 담당자', detail.topReps, 'name');
  if (detail.topAccounts) sections += renderSubList('핵심 계정', detail.topAccounts, 'account');
  if (detail.topBranches) sections += renderSubList('상위 지점', detail.topBranches, 'branch');

  container.innerHTML = `
    <div class="detail-head">
      <div>
        <p class="kicker">${detail.type === 'branch' ? 'Branch Spotlight' : detail.type === 'rep' ? 'Rep Spotlight' : 'Product Spotlight'}</p>
        <h3>${detail.label}</h3>
        <p class="detail-summary">${detail.summary || ''}</p>
      </div>
    </div>
    <div class="metric-grid">${metrics}</div>
    <p class="detail-narrative">${detail.narrative}</p>
    ${sections}
  `;
}

function renderProductMatrix(view) {
  const cards = view.productBranchMatrix.slice(0, 6);
  document.querySelector('#product-matrix').innerHTML = cards
    .map(
      (item) => `
        <article class="matrix-card">
          <div class="matrix-head">
            <h3>${item.product}</h3>
            <span class="badge">${formatNumber(item.totalCalls)}콜</span>
          </div>
          <div class="mini-bars">
            ${item.rows
              .map(
                (row) => `
                  <div class="mini-bar-row">
                    <span>${row.branch}</span>
                    <div class="mini-bar-track">
                      <div class="mini-bar-fill" style="width:${row.share}%"></div>
                    </div>
                    <strong>${formatDecimal(row.share)}%</strong>
                  </div>
                `
              )
              .join('')}
          </div>
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
  ensureSelection(view);
  renderInsights(view);
  renderActionQueue(view);
  renderKpis(view);
  renderDailySeries(view);
  renderVisitDepth(view);
  renderEntityTabs();
  renderEntityList(view);
  renderEntityDetail(view);
  renderDivisionCards(view);
  renderBranchTable(view);
  renderBarList('#product-list', view.productRows, 'product');
  renderBarList('#specialty-list', view.specialtyRows, 'specialty');
  renderReps(view);
  renderFocus(view);
  renderProductMatrix(view);
}

async function init() {
  const response = await fetch('./data/dashboard-data.json');
  state.data = await response.json();
  renderMeta();
  renderFilters();
  renderMapping();
  render();

  const searchInput = document.querySelector('#entity-search');
  searchInput.addEventListener('input', (event) => {
    state.searchTerm = event.target.value;
    state.selectedEntityId = null;
    render();
  });
}

init().catch((error) => {
  document.querySelector('#app').innerHTML = `<section class="panel panel-wide"><div class="empty-state">대시보드를 불러오지 못했습니다. ${error.message}</div></section>`;
});
