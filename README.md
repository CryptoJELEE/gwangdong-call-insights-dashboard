# Gwangdong CALL Insights Dashboard

로우데이터 기반으로 사업부, 지점, 담당자, 품목, 방문 깊이를 한 번에 읽는 정적 대시보드입니다. GitHub Pages 배포를 전제로 만든 구조라서 서버 없이도 바로 열 수 있습니다.

## 구성

- `docs/` — GitHub Pages에서 그대로 서빙할 정적 사이트
- `scripts/build-data.mjs` — 공개 Google Sheets CSV 또는 로컬 CSV를 읽어서 대시보드용 JSON 생성
- `.github/workflows/deploy.yml` — `docs/`를 GitHub Pages에 배포하는 워크플로

## 로컬 데이터 재생성

```bash
cd gwangdong-call-insights-dashboard
npm run build:data
```

특정 CSV로 다시 만들려면:

```bash
node scripts/build-data.mjs --input /path/to/raw.csv --output ./docs/data/dashboard-data.json
```

기본 입력값은 다음 공개 시트입니다.

- Raw data: `gid=1471550893`

## 로컬 미리보기

```bash
cd gwangdong-call-insights-dashboard/docs
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`를 열면 됩니다.

## GitHub Pages

1. 이 폴더를 별도 GitHub 저장소로 올리거나 기존 저장소 루트로 사용합니다.
2. 저장소의 Pages 소스를 `GitHub Actions`로 둡니다.
3. `main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 `docs/`를 배포합니다.

## 현재 데이터 해석 범위

바로 가능한 항목:

- 사업부/부문/지점/담당자별 CALL
- 품목별 CALL과 SOV
- 방문 깊이, 반복 방문 강도
- 진료과 기반 현장 믹스
- 지점/담당자 편중 리스크

추가 마스터가 있으면 붙는 항목:

- 월 목표 / 달성률
- Working day / Daily call
- Coverage rate
- 본부 Total 목표 대비 성과
