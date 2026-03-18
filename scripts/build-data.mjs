import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const DEFAULT_INPUT = 'https://docs.google.com/spreadsheets/d/1foa_shUb1JJuDxkb_iFYY8qpXTOLZYhF/export?format=csv&gid=1471550893';
const DEFAULT_OUTPUT = path.join(projectRoot, 'docs', 'data', 'dashboard-data.json');

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') {
      options.input = argv[index + 1];
      index += 1;
    } else if (token === '--output') {
      options.output = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

async function readSource(input) {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  return readFile(path.resolve(input), 'utf8');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      if (row.some((cell) => cell !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function normaliseText(value, fallback = '') {
  const trimmed = String(value ?? '').trim();
  return trimmed || fallback;
}

function incrementCounter(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function ensureCounterEntry(map, key, factory) {
  if (!map.has(key)) {
    map.set(key, factory());
  }
  return map.get(key);
}

function sortedCounterEntries(map) {
  return [...map.entries()].sort((left, right) => right[1] - left[1]);
}

function toShare(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function toRatio(value, divisor, digits = 1) {
  if (!divisor) return 0;
  return Number((value / divisor).toFixed(digits));
}

function bucketLabel(count) {
  return count >= 10 ? '10+' : String(count);
}

function formatMonth(date) {
  return date ? date.slice(0, 7) : '';
}

function getTopPair(counter) {
  const top = sortedCounterEntries(counter)[0];
  if (!top) return ['미분류', 0];
  return top;
}

function takeTopRows(entries, limit, projector) {
  return entries.slice(0, limit).map(projector);
}

function buildInsights(input) {
  const {
    topBranch,
    topRep,
    topProduct,
    unlabeledProductCalls,
    totalCalls,
    weakestBranch,
    deepestBranch,
    concentrationRep,
    mostActiveDay,
    divisionCards
  } = input;

  const leadingDivision = divisionCards[0];
  const trailingDivision = divisionCards[divisionCards.length - 1];

  return [
    {
      tone: 'positive',
      title: '가장 큰 엔진',
      body: `${topBranch.branch}이(가) ${topBranch.calls.toLocaleString('ko-KR')}콜로 전체의 ${topBranch.share}%를 담당합니다. 현재 파이프라인의 가장 강한 추진 축입니다.`,
      metric: `${topBranch.share}%`
    },
    {
      tone: 'positive',
      title: '현장 톱 퍼포머',
      body: `${topRep.name}(${topRep.branch})가 ${topRep.calls.toLocaleString('ko-KR')}콜로 개인 실적 1위를 기록했습니다. 현장 실행 패턴을 확산하기 좋은 기준점입니다.`,
      metric: `${topRep.calls.toLocaleString('ko-KR')}콜`
    },
    {
      tone: 'focus',
      title: '제품 중심축',
      body: `${topProduct.product}이(가) ${topProduct.calls.toLocaleString('ko-KR')}콜, ${topProduct.share}% 비중으로 가장 큰 포트폴리오 축을 형성합니다.`,
      metric: `${topProduct.share}%`
    },
    {
      tone: 'warning',
      title: '라벨 누락 신호',
      body: `품목이 비어 있는 행이 ${unlabeledProductCalls.toLocaleString('ko-KR')}건입니다. 분석 화면에서는 '미분류'로 묶였고, 해석 신뢰도에 직접 영향을 줍니다.`,
      metric: `${toShare(unlabeledProductCalls, totalCalls)}%`
    },
    {
      tone: 'warning',
      title: '저활동 구간',
      body: `${weakestBranch.branch}은(는) 담당자 1인당 평균 ${weakestBranch.avgCallsPerRep}콜 수준입니다. 활동량 관점의 운영 점검 우선순위가 높습니다.`,
      metric: `${weakestBranch.avgCallsPerRep}콜`
    },
    {
      tone: 'focus',
      title: '재방문 강도',
      body: `${deepestBranch.branch}은(는) 계정당 평균 ${deepestBranch.avgCallsPerAccount}회로 가장 깊게 파고듭니다. 관계 심화와 신규 확장 사이의 균형을 볼 지점입니다.`,
      metric: `${deepestBranch.avgCallsPerAccount}회`
    },
    {
      tone: 'warning',
      title: '편중 리스크',
      body: `${concentrationRep.name}은(는) ${concentrationRep.topProduct} 비중이 ${concentrationRep.topProductShare}%입니다. 성과는 좋지만 포트폴리오 편중 리스크가 큽니다.`,
      metric: `${concentrationRep.topProductShare}%`
    },
    {
      tone: 'positive',
      title: '사업부 온도차',
      body: `${leadingDivision.name}은(는) ${leadingDivision.calls.toLocaleString('ko-KR')}콜로 ${leadingDivision.share}%를 차지합니다. 반대로 ${trailingDivision.name}은(는) ${trailingDivision.share}%에 머물러 확장 여지가 큽니다.`,
      metric: `${leadingDivision.share}%`
    },
    {
      tone: 'focus',
      title: '월간 피크 데이',
      body: `${mostActiveDay.date}에 ${mostActiveDay.calls.toLocaleString('ko-KR')}콜로 월중 최대치가 나왔습니다. 캠페인이나 현장 배치와 겹쳐보면 설명력이 커집니다.`,
      metric: `${mostActiveDay.calls.toLocaleString('ko-KR')}콜`
    }
  ];
}

function createActionQueue(input) {
  const {
    branchRows,
    repRows,
    productRows,
    totalCalls,
    unlabeledProductCalls
  } = input;

  const strongestBranch = branchRows[0];
  const underperformBranch = [...branchRows]
    .filter((item) => item.reps >= 4)
    .sort((left, right) => left.avgCallsPerRep - right.avgCallsPerRep)[0];
  const dataQualityBranch = [...branchRows]
    .filter((item) => item.calls >= 1000)
    .sort((left, right) => right.unlabeledShare - left.unlabeledShare)[0];
  const concentrationRep = [...repRows]
    .filter((item) => item.calls >= 120)
    .sort((left, right) => right.topProductShare - left.topProductShare)[0];
  const topNonBlankProduct = productRows.find((item) => item.product !== '미분류') || productRows[0];

  return [
    {
      tone: 'positive',
      title: '확산할 우수사례',
      ownerType: 'branch',
      ownerId: strongestBranch.branch,
      ownerLabel: strongestBranch.branch,
      body: `${strongestBranch.branch}은(는) ${strongestBranch.calls.toLocaleString('ko-KR')}콜, 담당자 1인당 평균 ${strongestBranch.avgCallsPerRep}콜로 가장 높은 생산성을 보입니다.`,
      metric: `${strongestBranch.avgCallsPerRep}콜/인`
    },
    {
      tone: 'warning',
      title: '운영 점검 우선',
      ownerType: 'branch',
      ownerId: underperformBranch.branch,
      ownerLabel: underperformBranch.branch,
      body: `${underperformBranch.branch}은(는) 활동량이 낮습니다. 팀 전체가 아닌 특정 인력 이슈인지, 지점 구조 이슈인지 drill-down이 필요합니다.`,
      metric: `${underperformBranch.avgCallsPerRep}콜/인`
    },
    {
      tone: 'warning',
      title: '데이터 품질 보강',
      ownerType: 'branch',
      ownerId: dataQualityBranch.branch,
      ownerLabel: dataQualityBranch.branch,
      body: `${dataQualityBranch.branch}은(는) 미분류 품목 비중이 가장 높습니다. 입력 룰만 정리해도 해석력이 바로 올라갑니다.`,
      metric: `${dataQualityBranch.unlabeledShare}%`
    },
    {
      tone: 'focus',
      title: '편중 관리 필요',
      ownerType: 'rep',
      ownerId: concentrationRep.repId,
      ownerLabel: concentrationRep.name,
      body: `${concentrationRep.name}은(는) ${concentrationRep.topProduct} 중심 실행 비중이 큽니다. 코칭 시 포트폴리오 다변화 포인트를 같이 봐야 합니다.`,
      metric: `${concentrationRep.topProductShare}%`
    },
    {
      tone: 'focus',
      title: '상품 전략 축',
      ownerType: 'product',
      ownerId: topNonBlankProduct.product,
      ownerLabel: topNonBlankProduct.product,
      body: `${topNonBlankProduct.product}은(는) 미분류를 제외하면 가장 큰 축입니다. 지점별 편차를 보면 확산과 보완 포인트가 같이 보입니다.`,
      metric: `${topNonBlankProduct.share}%`
    },
    {
      tone: 'warning',
      title: '공통 정비 과제',
      ownerType: 'global',
      ownerId: 'global',
      ownerLabel: '전체',
      body: `품목 공백 ${unlabeledProductCalls.toLocaleString('ko-KR')}건은 전체 ${toShare(unlabeledProductCalls, totalCalls)}%입니다. 이 한 항목만 정리해도 SOV 해석 정확도가 커집니다.`,
      metric: `${toShare(unlabeledProductCalls, totalCalls)}%`
    }
  ];
}

function createDataModel(rows) {
  const divisionStats = new Map();
  const branchStats = new Map();
  const repStats = new Map();
  const productStats = new Map();
  const specialtyStats = new Map();
  const dailyCounts = new Map();
  const dailyByDivision = new Map();
  const repAccountVisits = new Map();
  const allAccountKeys = new Set();
  const allRepIds = new Set();
  const allBranches = new Set();
  const allProducts = new Set();
  const months = new Set();

  for (const row of rows) {
    const date = normaliseText(row['등록일자']);
    const division = normaliseText(row['사업부'], '미분류 사업부');
    const department = normaliseText(row['지점'], '미분류 부문');
    const branch = normaliseText(row['사무소'], '미분류 지점');
    const repId = normaliseText(row['담당자'], '미지정');
    const repName = normaliseText(row['담당자명'], '이름없음');
    const product = normaliseText(row['품목'], '미분류');
    const specialty = normaliseText(row['진료과'], '미분류');
    const accountCode = normaliseText(row['거래처코드']);
    const hcpCode = normaliseText(row['HCP코드']);
    const accountName = normaliseText(row['거래처명'], '이름없음');

    const repKey = `${repId}:${repName}`;
    const accountKey = accountCode || `account:${accountName}`;
    const hcpKey = hcpCode || `hcp:${normaliseText(row['의료인'], '미분류')}`;
    const repAccountKey = `${repKey}|${accountKey}|${hcpKey}`;
    const accountLabel = `${accountName}${specialty !== '미분류' ? ` · ${specialty}` : ''}`;

    months.add(formatMonth(date));
    allRepIds.add(repKey);
    allBranches.add(branch);
    allProducts.add(product);
    allAccountKeys.add(`${accountKey}|${hcpKey}`);

    incrementCounter(dailyCounts, date);
    const divisionDaily = ensureCounterEntry(dailyByDivision, division, () => new Map());
    incrementCounter(divisionDaily, date);
    incrementCounter(repAccountVisits, repAccountKey);

    const divisionEntry = ensureCounterEntry(divisionStats, division, () => ({
      division,
      calls: 0,
      branches: new Set(),
      reps: new Set(),
      accounts: new Set(),
      products: new Map()
    }));
    divisionEntry.calls += 1;
    divisionEntry.branches.add(branch);
    divisionEntry.reps.add(repKey);
    divisionEntry.accounts.add(`${accountKey}|${hcpKey}`);
    incrementCounter(divisionEntry.products, product);

    const branchEntry = ensureCounterEntry(branchStats, branch, () => ({
      branch,
      division,
      department,
      calls: 0,
      reps: new Set(),
      accounts: new Set(),
      hcps: new Set(),
      products: new Map(),
      specialties: new Map(),
      repCounts: new Map()
    }));
    branchEntry.calls += 1;
    branchEntry.reps.add(repKey);
    branchEntry.accounts.add(accountKey);
    branchEntry.hcps.add(hcpKey);
    incrementCounter(branchEntry.products, product);
    incrementCounter(branchEntry.specialties, specialty);
    incrementCounter(branchEntry.repCounts, repKey);

    const repEntry = ensureCounterEntry(repStats, repKey, () => ({
      repId,
      name: repName,
      division,
      department,
      branch,
      calls: 0,
      accounts: new Set(),
      hcps: new Set(),
      products: new Map(),
      specialties: new Map(),
      days: new Set(),
      accountCounts: new Map()
    }));
    repEntry.calls += 1;
    repEntry.accounts.add(accountKey);
    repEntry.hcps.add(hcpKey);
    repEntry.days.add(date);
    incrementCounter(repEntry.products, product);
    incrementCounter(repEntry.specialties, specialty);
    incrementCounter(repEntry.accountCounts, accountLabel);

    const productEntry = ensureCounterEntry(productStats, product, () => ({
      product,
      calls: 0,
      branches: new Set(),
      reps: new Set(),
      divisions: new Map(),
      branchCounts: new Map(),
      repCounts: new Map()
    }));
    productEntry.calls += 1;
    productEntry.branches.add(branch);
    productEntry.reps.add(repKey);
    incrementCounter(productEntry.divisions, division);
    incrementCounter(productEntry.branchCounts, branch);
    incrementCounter(productEntry.repCounts, repKey);

    const specialtyEntry = ensureCounterEntry(specialtyStats, specialty, () => ({
      specialty,
      calls: 0,
      branches: new Set(),
      reps: new Set()
    }));
    specialtyEntry.calls += 1;
    specialtyEntry.branches.add(branch);
    specialtyEntry.reps.add(repKey);
  }

  const totalCalls = rows.length;
  const month = [...months][0] || '미상';
  const dailySeries = [...dailyCounts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, calls]) => {
      const divisions = {};
      for (const [division, counts] of dailyByDivision.entries()) {
        divisions[division] = counts.get(date) || 0;
      }
      return {
        date,
        label: date.slice(5),
        calls,
        divisions
      };
    });

  const divisionCards = [...divisionStats.values()]
    .map((entry) => {
      const [topProduct, topProductCalls] = getTopPair(entry.products);
      const unlabeledCalls = entry.products.get('미분류') || 0;
      return {
        name: entry.division,
        calls: entry.calls,
        share: toShare(entry.calls, totalCalls),
        branches: entry.branches.size,
        reps: entry.reps.size,
        accounts: entry.accounts.size,
        avgCallsPerRep: toRatio(entry.calls, entry.reps.size),
        topProduct,
        topProductShare: toShare(topProductCalls, entry.calls),
        unlabeledShare: toShare(unlabeledCalls, entry.calls)
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const repRows = [...repStats.values()]
    .map((entry) => {
      const [topProduct, topProductCalls] = getTopPair(entry.products);
      const [topSpecialty] = getTopPair(entry.specialties);
      const unlabeledCalls = entry.products.get('미분류') || 0;
      return {
        repId: entry.repId,
        name: entry.name,
        division: entry.division,
        department: entry.department,
        branch: entry.branch,
        calls: entry.calls,
        accounts: entry.accounts.size,
        hcps: entry.hcps.size,
        products: entry.products.size,
        activeDays: entry.days.size,
        avgCallsPerAccount: toRatio(entry.calls, entry.accounts.size, 2),
        avgCallsPerDay: toRatio(entry.calls, entry.days.size, 1),
        topProduct,
        topProductShare: toShare(topProductCalls, entry.calls),
        topSpecialty,
        unlabeledShare: toShare(unlabeledCalls, entry.calls),
        topProducts: takeTopRows(sortedCounterEntries(entry.products), 5, ([product, calls]) => ({
          product,
          calls,
          share: toShare(calls, entry.calls)
        })),
        topAccounts: takeTopRows(sortedCounterEntries(entry.accountCounts), 5, ([account, calls]) => ({
          account,
          calls,
          share: toShare(calls, entry.calls)
        }))
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const repByKey = new Map(repRows.map((item) => [`${item.repId}:${item.name}`, item]));

  const branchRows = [...branchStats.values()]
    .map((entry) => {
      const [topProduct, topProductCalls] = getTopPair(entry.products);
      const [topSpecialty] = getTopPair(entry.specialties);
      const unlabeledCalls = entry.products.get('미분류') || 0;
      return {
        division: entry.division,
        department: entry.department,
        branch: entry.branch,
        calls: entry.calls,
        share: toShare(entry.calls, totalCalls),
        reps: entry.reps.size,
        accounts: entry.accounts.size,
        hcps: entry.hcps.size,
        products: entry.products.size,
        avgCallsPerRep: toRatio(entry.calls, entry.reps.size),
        avgCallsPerAccount: toRatio(entry.calls, entry.accounts.size, 2),
        topProduct,
        topProductShare: toShare(topProductCalls, entry.calls),
        topSpecialty,
        unlabeledShare: toShare(unlabeledCalls, entry.calls),
        topProducts: takeTopRows(sortedCounterEntries(entry.products), 5, ([product, calls]) => ({
          product,
          calls,
          share: toShare(calls, entry.calls)
        })),
        topReps: takeTopRows(sortedCounterEntries(entry.repCounts), 5, ([repKey, calls]) => {
          const rep = repByKey.get(repKey);
          return {
            repId: rep?.repId || repKey,
            name: rep?.name || repKey,
            calls,
            share: toShare(calls, entry.calls)
          };
        })
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const productRows = [...productStats.values()]
    .map((entry) => {
      const divisionBreakdown = {};
      for (const [division, calls] of entry.divisions.entries()) {
        divisionBreakdown[division] = calls;
      }
      return {
        product: entry.product,
        calls: entry.calls,
        share: toShare(entry.calls, totalCalls),
        branches: entry.branches.size,
        reps: entry.reps.size,
        divisionBreakdown,
        topBranches: takeTopRows(sortedCounterEntries(entry.branchCounts), 5, ([branch, calls]) => ({
          branch,
          calls,
          share: toShare(calls, entry.calls)
        })),
        topReps: takeTopRows(sortedCounterEntries(entry.repCounts), 5, ([repKey, calls]) => {
          const rep = repByKey.get(repKey);
          return {
            repId: rep?.repId || repKey,
            name: rep?.name || repKey,
            branch: rep?.branch || '',
            calls,
            share: toShare(calls, entry.calls)
          };
        })
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const specialtyRows = [...specialtyStats.values()]
    .map((entry) => ({
      specialty: entry.specialty,
      calls: entry.calls,
      share: toShare(entry.calls, totalCalls),
      branches: entry.branches.size,
      reps: entry.reps.size
    }))
    .sort((left, right) => right.calls - left.calls);

  const visitDepthCounter = new Map();
  for (const count of repAccountVisits.values()) {
    incrementCounter(visitDepthCounter, bucketLabel(count));
  }
  const orderedBuckets = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
  const visitDepth = orderedBuckets.map((bucket) => {
    const count = visitDepthCounter.get(bucket) || 0;
    return {
      bucket,
      count,
      share: toShare(count, repAccountVisits.size)
    };
  });

  const branchDetails = branchRows.map((branch) => ({
    id: branch.branch,
    type: 'branch',
    label: branch.branch,
    division: branch.division,
    department: branch.department,
    summary: `${branch.department} · ${branch.division}`,
    metrics: [
      { label: 'CALL', value: branch.calls },
      { label: '담당자', value: branch.reps },
      { label: '계정당 콜', value: branch.avgCallsPerAccount },
      { label: '미분류', value: `${branch.unlabeledShare}%` }
    ],
    narrative: `${branch.branch}은(는) 담당자 ${branch.reps}명이 ${branch.calls.toLocaleString('ko-KR')}콜을 만들고 있습니다. 대표 품목은 ${branch.topProduct}이며 지점 내 편차와 미분류 비중을 함께 보는 게 좋습니다.`,
    topProducts: branch.topProducts,
    topReps: branch.topReps
  }));

  const repDetails = repRows.map((rep) => ({
    id: rep.repId,
    type: 'rep',
    label: rep.name,
    division: rep.division,
    department: rep.department,
    branch: rep.branch,
    summary: `${rep.branch} · ${rep.division}`,
    metrics: [
      { label: 'CALL', value: rep.calls },
      { label: '활동일', value: rep.activeDays },
      { label: '일평균', value: rep.avgCallsPerDay },
      { label: '편중', value: `${rep.topProductShare}%` }
    ],
    narrative: `${rep.name}은(는) ${rep.branch}에서 ${rep.calls.toLocaleString('ko-KR')}콜을 기록했습니다. ${rep.topProduct} 비중이 ${rep.topProductShare}%로 가장 크고, 주력 계정 몇 곳이 전체 실행을 많이 끌고 갑니다.`,
    topProducts: rep.topProducts,
    topAccounts: rep.topAccounts
  }));

  const productDetails = productRows.map((product) => ({
    id: product.product,
    type: 'product',
    label: product.product,
    summary: `${product.branches}개 지점 · ${product.reps}명 담당자`,
    metrics: [
      { label: 'CALL', value: product.calls },
      { label: 'SOV', value: `${product.share}%` },
      { label: '지점', value: product.branches },
      { label: '담당자', value: product.reps }
    ],
    narrative: `${product.product}은(는) 전체 ${product.calls.toLocaleString('ko-KR')}콜을 만들었습니다. 상위 지점 몇 곳과 상위 담당자 몇 명이 흐름을 강하게 만들고 있습니다.`,
    topBranches: product.topBranches,
    topReps: product.topReps
  }));

  const unlabeledProductCalls = productRows.find((item) => item.product === '미분류')?.calls || 0;
  const topBranch = branchRows[0];
  const topRep = repRows[0];
  const topProduct = productRows[0];
  const weakestBranch = [...branchRows]
    .filter((item) => item.reps >= 4)
    .sort((left, right) => left.avgCallsPerRep - right.avgCallsPerRep)[0] || branchRows[branchRows.length - 1];
  const deepestBranch = [...branchRows]
    .filter((item) => item.accounts >= 30)
    .sort((left, right) => right.avgCallsPerAccount - left.avgCallsPerAccount)[0] || topBranch;
  const concentrationRep = [...repRows]
    .filter((item) => item.calls >= 120)
    .sort((left, right) => right.topProductShare - left.topProductShare)[0] || topRep;
  const mostActiveDay = [...dailySeries].sort((left, right) => right.calls - left.calls)[0];
  const focusReps = repRows
    .filter((item) => item.calls >= 120 && item.topProductShare >= 45)
    .sort((left, right) => right.topProductShare - left.topProductShare)
    .slice(0, 10);
  const productBranchMatrix = productRows
    .filter((item) => item.product !== '미분류')
    .slice(0, 6)
    .map((item) => ({
      product: item.product,
      totalCalls: item.calls,
      rows: item.topBranches.map((branch) => ({
        branch: branch.branch,
        calls: branch.calls,
        share: branch.share
      }))
    }));

  return {
    meta: {
      title: 'CALL Insight Dashboard',
      month,
      snapshotAt: new Date().toISOString(),
      source: 'Google Sheets raw data (gid=1471550893)',
      sourceRows: totalCalls,
      uniqueReps: allRepIds.size,
      uniqueBranches: allBranches.size,
      uniqueProducts: allProducts.size,
      uniqueAccounts: allAccountKeys.size,
      activeDays: dailySeries.length
    },
    kpis: {
      totalCalls,
      avgCallsPerRep: toRatio(totalCalls, allRepIds.size),
      avgCallsPerDay: toRatio(totalCalls, dailySeries.length),
      unlabeledProductShare: toShare(unlabeledProductCalls, totalCalls),
      repeatAccountClusters: visitDepth.filter((item) => item.bucket !== '1').reduce((sum, item) => sum + item.count, 0)
    },
    divisionCards,
    dailySeries,
    branchRows,
    repRows,
    productRows,
    specialtyRows,
    visitDepth,
    branchDetails,
    repDetails,
    productDetails,
    productBranchMatrix,
    insights: buildInsights({
      topBranch,
      topRep,
      topProduct,
      unlabeledProductCalls,
      totalCalls,
      weakestBranch,
      deepestBranch,
      concentrationRep,
      mostActiveDay,
      divisionCards
    }),
    actionQueue: createActionQueue({
      branchRows,
      repRows,
      productRows,
      totalCalls,
      unlabeledProductCalls
    }),
    focusReps,
    mapping: {
      availableNow: [
        '사업부/부문/지점/담당자별 CALL',
        '품목별 CALL과 SOV',
        '거래처/HCP 기반 방문 깊이',
        '지점별 포트폴리오 편중',
        '반복 방문 강도와 재방문 분포',
        '진료과 기반 현장 믹스',
        '지점/담당자 drill-down'
      ],
      needsMasterData: [
        '월 목표와 달성률',
        '근무일 기준 Daily call',
        '타깃 거래처수와 Coverage rate',
        '본부 Total 목표 대비 성과',
        '제품별 타깃 모수'
      ]
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const text = await readSource(options.input);
  const rows = parseCsv(text);
  const [headers, ...bodyRows] = rows;

  const records = bodyRows
    .filter((row) => row.length > 1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));

  const data = createDataModel(records);
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote dashboard data to ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
