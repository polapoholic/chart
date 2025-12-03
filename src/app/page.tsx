"use client"

import { useState, useMemo, useRef, type ChangeEvent } from "react"
import * as XLSX from "xlsx"
import dynamic from "next/dynamic"

// ECharts 컴포넌트는 브라우저에서만 렌더링되게 dynamic import
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false
})

// ========= 유틸 함수들 ==========
function normalizeMonth(value: any): string {
  if (value == null || value === "") return ""

  // 엑셀이 날짜형으로 저장한 경우(Date 객체로 들어옴)
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }

  const raw = String(value).toLowerCase().trim()

  // 이미 yyyy-mm 또는 yyyy-mm-dd 형태면 앞 7자리만 사용
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
    return raw.slice(0, 7)
  }

  // 못 알아먹으면 원본 반환 (최소한 라벨은 보이게)
  return raw
}

function toNumber(value: any): number {
  if (value == null || value === "") return 0
  if (typeof value === "number") return value
  const cleaned = String(value).replace(/,/g, "").trim()
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}

// 엑셀에서 뽑아낸 데이터 구조 타입
interface ChartData {
  months: string[]
  menu1: number[]
  menu2: number[]
  menu3: number[]
  menu4: number[]
  uniqueUsers: number[]
  totalHits: number[]
}

// ========= 공통 스타일 (글래스 대시보드) ==========
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "2.5rem 1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  background: "radial-gradient(circle at top, #020617 0, #020617 40%, #000000 100%)",
  color: "#e5e7eb"
}

const containerStyle: React.CSSProperties = {
  maxWidth: "1400px",
  margin: "0 auto",
  width: "100%"
}

const glassPanel: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.6)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
  borderRadius: "1.2rem",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)"
}

const glassCardBase: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.7)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "1rem",
  border: "1px solid rgba(148,163,184,0.45)",
  padding: "1.1rem 1.3rem",
  color: "#f8fafc",
  boxShadow: "0 18px 40px rgba(15,23,42,0.8)"
}

// 카드별 상단 색 포인트
const accentBlue: React.CSSProperties = {
  borderTop: "3px solid rgba(96,165,250,0.85)"
}
const accentGreen: React.CSSProperties = {
  borderTop: "3px solid rgba(52,211,153,0.85)"
}
const accentAmber: React.CSSProperties = {
  borderTop: "3px solid rgba(251,191,36,0.85)"
}
const accentSky: React.CSSProperties = {
  borderTop: "3px solid rgba(56,189,248,0.85)"
}
const accentViolet: React.CSSProperties = {
  borderTop: "3px solid rgba(129,140,248,0.9)"
}

export default function HomePage() {
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true
      })

      // 시트 하나라고 가정하고 첫 번째 시트를 사용
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      // 2차원 배열: [ [헤더], [데이터], ... ]
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null
      })

      if (!rows || rows.length < 2) {
        alert("데이터가 없습니다.")
        return
      }

      const firstRow = rows[0]
      const firstCell = firstRow[0]
      const looksLikeHeader =
          typeof firstCell === "string" && firstCell.toLowerCase().includes("month")

      const dataRows = looksLikeHeader ? rows.slice(1) : rows

      // A~G 열 인덱스 고정
      const colMonth = 0
      const colMenu1 = 1
      const colMenu2 = 2
      const colMenu3 = 3
      const colMenu4 = 4
      const colUser = 5
      const colTotal = 6

      const months: string[] = []
      const menu1: number[] = []
      const menu2: number[] = []
      const menu3: number[] = []
      const menu4: number[] = []
      const uniqueUsers: number[] = []
      const totalHits: number[] = []

      for (const row of dataRows) {
        if (!row) continue

        const monthRaw = row[colMonth]
        const monthStr = normalizeMonth(monthRaw)
        if (!monthStr) continue

        months.push(monthStr)
        menu1.push(toNumber(row[colMenu1]))
        menu2.push(toNumber(row[colMenu2]))
        menu3.push(toNumber(row[colMenu3]))
        menu4.push(toNumber(row[colMenu4]))
        uniqueUsers.push(toNumber(row[colUser]))
        totalHits.push(toNumber(row[colTotal]))
      }

      if (!months.length) {
        alert("월 데이터가 하나도 파싱되지 않았습니다.")
        return
      }

      setChartData({
        months,
        menu1,
        menu2,
        menu3,
        menu4,
        uniqueUsers,
        totalHits
      })
    } catch (err) {
      console.error(err)
      alert("엑셀 파일을 읽는 중 오류가 발생했습니다.")
    }
  }

  // 간단 KPI + 연도별 평균 계산
  const kpi = useMemo(() => {
    if (!chartData) return null

    const { months, totalHits, uniqueUsers, menu1, menu2, menu3, menu4 } = chartData

    // 전체 구간 KPI
    const totalHitSum = totalHits.reduce((a, b) => a + b, 0)
    const totalUserSum = uniqueUsers.reduce((a, b) => a + b, 0)
    const avgHits =
        totalHits.length > 0 ? Math.round(totalHitSum / totalHits.length) : 0
    const latestIndex = months.length - 1

    // 연도별 집계
    type YearAgg = {
      menuSum: number
      userSum: number
      hitSum: number
      count: number
    }

    const yearlyMap: Record<string, YearAgg> = {}

    months.forEach((m, idx) => {
      const [year] = m.split("-")
      if (!year) return

      if (!yearlyMap[year]) {
        yearlyMap[year] = { menuSum: 0, userSum: 0, hitSum: 0, count: 0 }
      }

      const menuTotal =
          (menu1[idx] ?? 0) +
          (menu2[idx] ?? 0) +
          (menu3[idx] ?? 0) +
          (menu4[idx] ?? 0)

      yearlyMap[year].menuSum += menuTotal
      yearlyMap[year].userSum += uniqueUsers[idx] ?? 0
      yearlyMap[year].hitSum += totalHits[idx] ?? 0
      yearlyMap[year].count += 1
    })

    const yearlyStats = Object.entries(yearlyMap).map(
        ([year, { menuSum, userSum, hitSum, count }]) => ({
          year,
          menuAvg: count > 0 ? Math.round(menuSum / count) : 0,
          userAvg: count > 0 ? Math.round(userSum / count) : 0,
          hitAvg: count > 0 ? Math.round(hitSum / count) : 0
        })
    )

    const latestYearStat =
        yearlyStats.length > 0
            ? [...yearlyStats]
                .sort((a, b) => a.year.localeCompare(b.year))
                .slice(-1)[0]
            : null

    return {
      totalHitSum,
      totalUserSum,
      avgHits,
      latestMonth: months[latestIndex] ?? "-",
      latestYearStat
    }
  }, [chartData])

  const getMenuChartOption = () => {
    if (!chartData) return {}

    const { months, menu1, menu2, menu3, menu4 } = chartData

    return {
      textStyle: {
        color: "#e2e8f0"
      },
      color: ["#60a5fa", "#34d399", "#fbbf24", "#fb7185"],
      title: {
        text: "월별 메뉴별 HIT 수",
        textStyle: { color: "#f1f5f9" }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#475569",
        textStyle: { color: "#e2e8f0" }
      },
      legend: {
        data: ["Menu1", "Menu2", "Menu3", "Menu4"],
        textStyle: { color: "#e2e8f0" }
      },
      grid: {
        left: "5%",
        right: "5%",
        top: "15%",
        bottom: "10%",
        containLabel: true
      },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: { color: "#f8fafc" },
        axisLine: { lineStyle: { color: "#475569" } },
        axisTick: { lineStyle: { color: "#64748b" } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#f8fafc" },
        axisLine: { lineStyle: { color: "#475569" } },
        splitLine: { lineStyle: { color: "#334155" } }
      },
      series: [
        { name: "Menu1", type: "line", smooth: true, data: menu1 },
        { name: "Menu2", type: "line", smooth: true, data: menu2 },
        { name: "Menu3", type: "line", smooth: true, data: menu3 },
        { name: "Menu4", type: "line", smooth: true, data: menu4 }
      ]
    }
  }

  const getHitChartOption = () => {
    if (!chartData) return {}

    const { months, uniqueUsers, totalHits } = chartData

    return {
      textStyle: {
        color: "#e2e8f0"
      },
      color: ["#22c55e", "#38bdf8"],
      title: {
        text: "월별 고유 접속자 / 전체 HIT",
        textStyle: { color: "#f1f5f9" }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#475569",
        textStyle: { color: "#e2e8f0" }
      },
      legend: {
        data: ["Unique Users", "Total Hits"],
        textStyle: { color: "#e2e8f0" }
      },
      grid: {
        left: "5%",
        right: "5%",
        top: "15%",
        bottom: "10%",
        containLabel: true
      },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: { color: "#f8fafc" },
        axisLine: { lineStyle: { color: "#475569" } },
        axisTick: { lineStyle: { color: "#64748b" } }
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#f8fafc" },
        axisLine: { lineStyle: { color: "#475569" } },
        splitLine: { lineStyle: { color: "#334155" } }
      },
      series: [
        { name: "Unique Users", type: "line", smooth: true, data: uniqueUsers },
        { name: "Total Hits", type: "line", smooth: true, data: totalHits }
      ]
    }
  }

  return (
      <main style={pageStyle}>
        {/* ===== 헤더 (글래스) ===== */}
        <header style={{ ...containerStyle }}>
          <div
              style={{
                ...glassPanel,
                padding: "1.6rem 1.8rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem"
              }}
          >
            <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap"
                }}
            >
              <div>
                <h1
                    style={{
                      fontSize: "1.9rem",
                      fontWeight: 700,
                      letterSpacing: "-0.03em"
                    }}
                >
                  월별 사용 통계 대시보드
                </h1>
                <p
                    style={{
                      fontSize: "0.95rem",
                      opacity: 0.8,
                      marginTop: "0.25rem"
                    }}
                >
                  A열: Month, B~E열: Menu1~4 HIT, F열: UniqueUsers, G열: TotalHits
                  구조의 Excel(.xlsx)을 업로드하면 자동으로 통계가 시각화됩니다.
                </p>
              </div>

              {/* 업로드 영역 (글래스 pill) */}
              <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    alignItems: "flex-end",
                    minWidth: "260px"
                  }}
              >
                <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      padding: "0.7rem 1rem",
                      borderRadius: "999px",
                      background:
                          "linear-gradient(135deg, rgba(56,189,248,0.14), rgba(129,140,248,0.22))",
                      border: "1px solid rgba(148,163,184,0.7)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.7rem",
                      cursor: "pointer",
                      minWidth: "260px",
                      boxShadow: "0 14px 35px rgba(15,23,42,0.9)"
                    }}
                >
                <span style={{ fontSize: "0.85rem" }}>
                  {fileName
                      ? `선택된 파일: ${fileName}`
                      : "Excel(.xlsx) 파일을 업로드하세요"}
                </span>
                  <span
                      style={{
                        fontSize: "0.78rem",
                        padding: "0.3rem 0.8rem",
                        borderRadius: "999px",
                        background: "rgba(15,23,42,0.95)",
                        border: "1px solid rgba(129,140,248,0.9)"
                      }}
                  >
                  파일 선택
                </span>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                />

                {fileName && (
                    <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) fileInputRef.current.value = ""
                          setFileName(null)
                          setChartData(null)
                        }}
                        style={{
                          fontSize: "0.8rem",
                          color: "#fecaca",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: 0
                        }}
                    >
                      파일 다시 선택 / 초기화
                    </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ===== KPI 카드 영역 (글래스 카드) ===== */}
        {chartData && kpi && (
            <section style={containerStyle}>
              <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "1rem"
                  }}
              >
                {/* 1. 전체 기간 Total Hits */}
                <div style={{ ...glassCardBase, ...accentBlue }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                    전체 기간 Total Hits
                  </div>
                  <div
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: 700,
                        marginTop: "0.35rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.totalHitSum.toLocaleString()}
                  </div>
                </div>

                {/* 2. 전체 기간 Unique Users 합계 */}
                <div style={{ ...glassCardBase, ...accentGreen }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                    전체 기간 Unique Users 합계
                  </div>
                  <div
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: 700,
                        marginTop: "0.35rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.totalUserSum.toLocaleString()}
                  </div>
                </div>

                {/* 3. 전체 기간 월 평균 Total Hits */}
                <div style={{ ...glassCardBase, ...accentSky }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                    전체 기간 월 평균 Total Hits
                  </div>
                  <div
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: 700,
                        marginTop: "0.35rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.avgHits.toLocaleString()}
                  </div>
                  <div
                      style={{
                        fontSize: "0.8rem",
                        opacity: 0.7,
                        marginTop: "0.25rem"
                      }}
                  >
                    기준 월 수: {chartData.totalHits.length}
                  </div>
                </div>

                {/* 4. 가장 최근 월 */}
                <div style={{ ...glassCardBase, ...accentViolet }}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>가장 최근 월</div>
                  <div
                      style={{
                        fontSize: "1.6rem",
                        fontWeight: 700,
                        marginTop: "0.35rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.latestMonth}
                  </div>
                </div>

                {/* 5~7. 최신 연도 기준 연평균 카드 */}
                {kpi.latestYearStat && (
                    <>
                      {/* 최신 연도 메뉴 HIT 연평균 */}
                      <div style={{ ...glassCardBase, ...accentAmber }}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 메뉴 HIT 연평균
                        </div>
                        <div
                            style={{
                              fontSize: "1.6rem",
                              fontWeight: 700,
                              marginTop: "0.35rem",
                              letterSpacing: "-0.03em"
                            }}
                        >
                          {kpi.latestYearStat.menuAvg.toLocaleString()}
                        </div>
                        <div
                            style={{
                              fontSize: "0.78rem",
                              opacity: 0.7,
                              marginTop: "0.25rem"
                            }}
                        >
                          (Menu1~4 합산 기준)
                        </div>
                      </div>

                      {/* 최신 연도 고유 접속자 연평균 */}
                      <div style={{ ...glassCardBase, ...accentGreen }}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 고유 접속자 연평균
                        </div>
                        <div
                            style={{
                              fontSize: "1.6rem",
                              fontWeight: 700,
                              marginTop: "0.35rem",
                              letterSpacing: "-0.03em"
                            }}
                        >
                          {kpi.latestYearStat.userAvg.toLocaleString()}
                        </div>
                      </div>

                      {/* 최신 연도 Total Hits 연평균 */}
                      <div style={{ ...glassCardBase, ...accentBlue }}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Total Hits 연평균
                        </div>
                        <div
                            style={{
                              fontSize: "1.6rem",
                              fontWeight: 700,
                              marginTop: "0.35rem",
                              letterSpacing: "-0.03em"
                            }}
                        >
                          {kpi.latestYearStat.hitAvg.toLocaleString()}
                        </div>
                      </div>
                    </>
                )}
              </div>
            </section>
        )}

        {/* ===== 차트 영역 (글래스 패널) ===== */}
        {chartData && (
            <>
              <section style={containerStyle}>
                <div
                    style={{
                      ...glassPanel,
                      padding: "1.4rem 1.2rem",
                      marginTop: "0.5rem"
                    }}
                >
                  <ReactECharts
                      option={getMenuChartOption()}
                      style={{ width: "100%", height: "70vh" }}
                  />
                </div>
              </section>

              <section style={containerStyle}>
                <div
                    style={{
                      ...glassPanel,
                      padding: "1.4rem 1.2rem",
                      marginTop: "0.5rem"
                    }}
                >
                  <ReactECharts
                      option={getHitChartOption()}
                      style={{ width: "100%", height: "60vh" }}
                  />
                </div>
              </section>
            </>
        )}
      </main>
  )
}
