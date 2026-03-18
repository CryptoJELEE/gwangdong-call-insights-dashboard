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
  if (!top) {
    return ['미분류', 0];
  }
  return top;
}

function buildInsights({
  totalCalls,
  topBranch,
  topRep,
  topProduct,
  unlabeledProductCalls,
  medianBranchCalls,
  weakestBranch,
  deepestBranch,
  specialistReps,
  mostActiveDay
}) {
  const insights = [];

  insights.push({
    tone: 'positive',
    title: '가장 큰 엔진',
    body: `${topBranch.branch}이(가) ${topBranch.calls.toLocaleString('ko-KR')}콜로 전체의 ${topBranch.share}%를 담당합니다. 한 달 내내 가장 강한 추진력을 보여줬습니다.`,
    metric: `${topBranch.share}%`
  });

  insights.push({
    tone: 'positive',
    title: '현장 톱 퍼포머',
    body: `${topRep.name}(${topRep.branch})가 ${topRep.calls.toLocaleString('ko-KR')}콜로 개인 실적 1위를 기록했습니다. 상위 인력 확산 포인트로 보기 좋습니다.`,
    metric: `${topRep.calls.toLocaleString('ko-KR')}콜`
  });

  insights.push({
    tone: 'focus',
    title: '제품 중심축',
    body: `${topProduct.product}이(가) ${topProduct.calls.toLocaleString('ko-KR')}콜로 가장 큰 비중을 차지합니다. 이번 스냅샷의 포트폴리오 중심축입니다.`,
    metric: `${topProduct.share}%`
  });

  insights.push({
    tone: 'warning',
    title: '라벨 누락 신호',
    body: `품목이 비어 있는 행이 ${unlabeledProductCalls.toLocaleString('ko-KR')}건입니다. 분석상 '미분류'로 묶였고, 전체 해석력에 직접 영향을 줍니다.`,
    metric: `${toShare(unlabeledProductCalls, totalCalls)}%`
  });

  insights.push({
    tone: 'warning',
    title: '저활동 구간',
    body: `${weakestBranch.branch}은(는) ${weakestBranch.calls.toLocaleString('ko-KR')}콜로 중앙값 ${medianBranchCalls.toLocaleString('ko-KR')}콜에 못 미칩니다. 운영 관점의 선제 점검 후보입니다.`,
    metric: `${weakestBranch.calls.toLocaleString('ko-KR')}콜`
  });

  insights.push({
    tone: 'focus',
    title: '재방문 강도',
    body: `${deepestBranch.branch}은(는) 계정당 평균 ${deepestBranch.avgCallsPerAccount}회로 가장 깊게 파고들고 있습니다. 반복 방문의 질을 따로 볼 필요가 있습니다.`,
    metric: `${deepestBranch.avgCallsPerAccount}회`
  });

  if (specialistReps.length > 0) {
    const lead = specialistReps[0];
    insights.push({
      tone: 'warning',
      title: '편중 리스크',
      body: `${lead.name}은(는) ${lead.topProduct} 비중이 ${lead.topProductShare}%입니다. 성과는 높아도 포트폴리오 편중 관리가 필요합니다.`,
      metric: `${lead.topProductShare}%`
    });
  }

  insights.push({
    tone: 'positive',
    title: '월간 피크 데이',
    body: `${mostActiveDay.date}에 ${mostActiveDay.calls.toLocaleString('ko-KR')}콜로 월중 최대치가 나왔습니다. 캠페인, 조직 운영, 현장 배치와 연결해서 해석할 수 있습니다.`,
    metric: `${mostActiveDay.calls.toLocaleString('ko-KR')}콜`
  });

  return insights;
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
    const hcpKey = hcpCode || `hcp:${row['의료인'] || '미분류'}`;
    const repAccountKey = `${repKey}|${accountKey}|${hcpKey}`;

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
      specialties: new Map()
    }));
    branchEntry.calls += 1;
    branchEntry.reps.add(repKey);
    branchEntry.accounts.add(accountKey);
    branchEntry.hcps.add(hcpKey);
    incrementCounter(branchEntry.products, product);
    incrementCounter(branchEntry.specialties, specialty);

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
      days: new Set()
    }));
    repEntry.calls += 1;
    repEntry.accounts.add(accountKey);
    repEntry.hcps.add(hcpKey);
    repEntry.days.add(date);
    incrementCounter(repEntry.products, product);
    incrementCounter(repEntry.specialties, specialty);

    const productEntry = ensureCounterEntry(productStats, product, () => ({
      product,
      calls: 0,
      branches: new Set(),
      reps: new Set(),
      divisions: new Map()
    }));
    productEntry.calls += 1;
    productEntry.branches.add(branch);
    productEntry.reps.add(repKey);
    incrementCounter(productEntry.divisions, division);

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
      return {
        name: entry.division,
        calls: entry.calls,
        share: toShare(entry.calls, totalCalls),
        branches: entry.branches.size,
        reps: entry.reps.size,
        accounts: entry.accounts.size,
        avgCallsPerRep: toRatio(entry.calls, entry.reps.size),
        topProduct,
        topProductShare: toShare(topProductCalls, entry.calls)
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const branchRows = [...branchStats.values()]
    .map((entry) => {
      const [topProduct, topProductCalls] = getTopPair(entry.products);
      const [topSpecialty] = getTopPair(entry.specialties);
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
        topSpecialty
      };
    })
    .sort((left, right) => right.calls - left.calls);

  const repRows = [...repStats.values()]
    .map((entry) => {
      const [topProduct, topProductCalls] = getTopPair(entry.products);
      const [topSpecialty] = getTopPair(entry.specialties);
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
        topProduct,
        topProductShare: toShare(topProductCalls, entry.calls),
        topSpecialty
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
        divisionBreakdown
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

  const unlabeledProductCalls = productRows.find((item) => item.product === '미분류')?.calls || 0;
  const topBranch = branchRows[0];
  const topRep = repRows[0];
  const topProduct = productRows[0];
  const medianBranchCalls = branchRows[Math.floor(branchRows.length / 2)]?.calls || 0;
  const weakestBranch = [...branchRows]
    .filter((item) => item.reps >= 3)
    .sort((left, right) => left.calls - right.calls)[0] || branchRows[branchRows.length - 1];
  const deepestBranch = [...branchRows]
    .filter((item) => item.accounts >= 30)
    .sort((left, right) => right.avgCallsPerAccount - left.avgCallsPerAccount)[0] || topBranch;
  const specialistReps = repRows
    .filter((item) => item.calls >= 80 && item.topProductShare >= 55)
    .sort((left, right) => right.topProductShare - left.topProductShare)
    .slice(0, 6);
  const mostActiveDay = [...dailySeries].sort((left, right) => right.calls - left.calls)[0];

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
    insights: buildInsights({
      totalCalls,
      topBranch,
      topRep,
      topProduct,
      unlabeledProductCalls,
      medianBranchCalls,
      weakestBranch,
      deepestBranch,
      specialistReps,
      mostActiveDay
    }),
    focusReps: specialistReps,
    mapping: {
      availableNow: [
        '사업부/부문/지점/담당자별 CALL',
        '품목별 CALL과 SOV',
        '거래처/HCP 기반 방문 깊이',
        '지점별 포트폴리오 편중',
        '반복 방문 강도와 재방문 분포',
        '진료과 기반 현장 믹스'
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
