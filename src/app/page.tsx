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

const headerGlass = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  borderRadius: "1.3rem",
  border: "1px solid rgba(255,255,255,0.35)",
  boxShadow: "0 25px 60px rgba(0,0,0,0.4)"
}


// 기본 카드 베이스
const glassCardBase: React.CSSProperties = {
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "1rem",
  padding: "1.1rem 1.3rem",
  color: "#0f172a",
  boxShadow: "0 18px 40px rgba(15,23,42,0.7)",
}

// 화사한 배경을 입힌 카드들
const kpiCardBlue: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #dbeafe, #e0f2fe)", // 파란 계열
  border: "1px solid rgba(59,130,246,0.6)"
}

const kpiCardGreen: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #dcfce7, #ccfbf1)", // 초록/민트
  border: "1px solid rgba(34,197,94,0.6)"
}

const kpiCardAmber: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #fef9c3, #ffedd5)", // 노랑/오렌지
  border: "1px solid rgba(245,158,11,0.6)"
}

const kpiCardPink: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #ffe4e6, #fef2f2)", // 핑크
  border: "1px solid rgba(244,63,94,0.6)"
}

const kpiCardIndigo: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #e0e7ff, #eef2ff)", // 남색계열
  border: "1px solid rgba(79,70,229,0.6)"
}

const kpiCardCyan: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #cffafe, #e0f2fe)", // 청록
  border: "1px solid rgba(8,145,178,0.6)"
}

const kpiCardSlate: React.CSSProperties = {
  ...glassCardBase,
  background: "linear-gradient(135deg, #e5e7eb, #f9fafb)", // 중립
  border: "1px solid rgba(148,163,184,0.6)"
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

  const kpi = useMemo(() => {
    if (!chartData) return null

    const { months, totalHits, uniqueUsers, menu1, menu2, menu3, menu4 } = chartData

    // 전체 구간 KPI (합계 + 전체 월평균)
    const totalHitSum = totalHits.reduce((a, b) => a + b, 0)
    const totalUserSum = uniqueUsers.reduce((a, b) => a + b, 0)
    const totalMenu1Sum = menu1.reduce((a, b) => a + b, 0)
    const totalMenu2Sum = menu2.reduce((a, b) => a + b, 0)
    const totalMenu3Sum = menu3.reduce((a, b) => a + b, 0)
    const totalMenu4Sum = menu4.reduce((a, b) => a + b, 0)
    const totalMenuAllSum = totalMenu1Sum + totalMenu2Sum + totalMenu3Sum + totalMenu4Sum

    const monthCount = months.length

    const totalHitAvg = monthCount ? Math.round(totalHitSum / monthCount) : 0
    const totalUserAvg = monthCount ? Math.round(totalUserSum / monthCount) : 0
    const totalMenuAllAvg = monthCount ? Math.round(totalMenuAllSum / monthCount) : 0

    const latestIndex = monthCount - 1

    // 🔹 연도별 집계 (합계 기준, 나중에 연평균으로 나눔)
    type YearAgg = {
      menu1Sum: number
      menu2Sum: number
      menu3Sum: number
      menu4Sum: number
      userSum: number
      hitSum: number
      count: number
    }

    const yearlyMap: Record<string, YearAgg> = {}

    months.forEach((m, idx) => {
      const [year] = m.split("-")
      if (!year) return

      if (!yearlyMap[year]) {
        yearlyMap[year] = {
          menu1Sum: 0,
          menu2Sum: 0,
          menu3Sum: 0,
          menu4Sum: 0,
          userSum: 0,
          hitSum: 0,
          count: 0
        }
      }

      yearlyMap[year].menu1Sum += menu1[idx] ?? 0
      yearlyMap[year].menu2Sum += menu2[idx] ?? 0
      yearlyMap[year].menu3Sum += menu3[idx] ?? 0
      yearlyMap[year].menu4Sum += menu4[idx] ?? 0
      yearlyMap[year].userSum += uniqueUsers[idx] ?? 0
      yearlyMap[year].hitSum += totalHits[idx] ?? 0
      yearlyMap[year].count += 1
    })

    const yearlyStats = Object.entries(yearlyMap).map(
        ([
           year,
           { menu1Sum, menu2Sum, menu3Sum, menu4Sum, userSum, hitSum, count }
         ]) => {
          const menuAllSum = menu1Sum + menu2Sum + menu3Sum + menu4Sum
          const safeDiv = (sum: number) => (count > 0 ? Math.round(sum / count) : 0)

          return {
            year,
            count,
            menu1Sum,
            menu2Sum,
            menu3Sum,
            menu4Sum,
            menuAllSum,
            userSum,
            hitSum,
            menu1Avg: safeDiv(menu1Sum),
            menu2Avg: safeDiv(menu2Sum),
            menu3Avg: safeDiv(menu3Sum),
            menu4Avg: safeDiv(menu4Sum),
            menuAllAvg: safeDiv(menuAllSum),
            userAvg: safeDiv(userSum),
            hitAvg: safeDiv(hitSum)
          }
        }
    )

    const latestYearStat =
        yearlyStats.length > 0
            ? [...yearlyStats]
                .sort((a, b) => a.year.localeCompare(b.year))
                .slice(-1)[0]
            : null

    return {
      // 전체 기간 값들
      totalHitSum,
      totalUserSum,
      totalMenuAllSum,
      totalHitAvg,
      totalUserAvg,
      totalMenuAllAvg,
      latestMonth: months[latestIndex] ?? "-",

      // 가장 최근 연도 연평균/합계
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
                ...headerGlass,
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
                      fontSize: "2rem",
                      fontWeight: 700,
                      letterSpacing: "-0.03em",
                      background: "linear-gradient(to right, #3b82f6, #9333ea)",
                      WebkitBackgroundClip: "text",
                      color: "transparent"
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
                  구조의 Excel(.xlsx, .csv)을 업로드하면 자동으로 통계가 시각화됩니다.
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
                    accept=".xlsx, .csv"
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

        {/* ===== KPI 카드 영역 (글래스 카드) ===== */}
        {chartData && kpi && (
            <section style={containerStyle}>
              <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                    gap: "1rem"
                  }}
              >
                {/* 1. 전체 기간 Total Hits (합계 / 월평균) */}
                <div style={kpiCardBlue}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>전체 기간 Total Hits</div>
                  <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        marginTop: "0.3rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.totalHitSum.toLocaleString()}
                  </div>
                  <div
                      style={{
                        fontSize: "0.85rem",
                        marginTop: "0.3rem",
                        opacity: 0.8
                      }}
                  >
                    월평균:{" "}
                    <strong>{kpi.totalHitAvg.toLocaleString()}</strong>
                  </div>
                </div>

                {/* 2. 전체 기간 Unique Users (합계 / 월평균) */}
                <div style={kpiCardGreen}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                    전체 기간 Unique Users
                  </div>
                  <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        marginTop: "0.3rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.totalUserSum.toLocaleString()}
                  </div>
                  <div
                      style={{
                        fontSize: "0.85rem",
                        marginTop: "0.3rem",
                        opacity: 0.8
                      }}
                  >
                    월평균:{" "}
                    <strong>{kpi.totalUserAvg.toLocaleString()}</strong>
                  </div>
                </div>

                {/* 3. 전체 기간 메뉴 HIT (1~4 합산 합계 / 월평균) */}
                <div style={kpiCardAmber}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                    전체 기간 메뉴 HIT (Menu1~4 합산)
                  </div>
                  <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        marginTop: "0.3rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.totalMenuAllSum.toLocaleString()}
                  </div>
                  <div
                      style={{
                        fontSize: "0.85rem",
                        marginTop: "0.3rem",
                        opacity: 0.8
                      }}
                  >
                    월평균:{" "}
                    <strong>{kpi.totalMenuAllAvg.toLocaleString()}</strong>
                  </div>
                </div>

                {/* 4. 가장 최근 월 */}
                <div style={kpiCardIndigo}>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>가장 최근 월</div>
                  <div
                      style={{
                        fontSize: "1.4rem",
                        fontWeight: 700,
                        marginTop: "0.3rem",
                        letterSpacing: "-0.03em"
                      }}
                  >
                    {kpi.latestMonth}
                  </div>
                  <div
                      style={{
                        fontSize: "0.8rem",
                        marginTop: "0.3rem",
                        opacity: 0.75
                      }}
                  >
                    업로드된 데이터 기준
                  </div>
                </div>

                {/* 🔹 5~? 최신 연도 기준 연평균 카드들 */}
                {kpi.latestYearStat && (
                    <>
                      {/* 5. 최신 연도 메뉴 전체 (1~4 합산) */}
                      <div style={kpiCardSlate}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 메뉴 HIT (전체)
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.menuAllSum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.menuAllAvg.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.75rem",
                              marginTop: "0.25rem",
                              opacity: 0.65
                            }}
                        >
                          (Menu1~4 합산 기준)
                        </div>
                      </div>

                      {/* 6. Menu1 연도별 */}
                      <div style={kpiCardBlue}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Menu1 HIT
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.menu1Sum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.menu1Avg.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* 7. Menu2 연도별 */}
                      <div style={kpiCardGreen}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Menu2 HIT
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.menu2Sum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.menu2Avg.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* 8. Menu3 연도별 */}
                      <div style={kpiCardAmber}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Menu3 HIT
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.menu3Sum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.menu3Avg.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* 9. Menu4 연도별 */}
                      <div style={kpiCardPink}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Menu4 HIT
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.menu4Sum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.menu4Avg.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* 10. 최신 연도 고유 접속자 */}
                      <div style={kpiCardCyan}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Unique Users
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.userSum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.userAvg.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* 11. 최신 연도 Total Hits */}
                      <div style={kpiCardIndigo}>
                        <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                          {kpi.latestYearStat.year}년 Total Hits
                        </div>
                        <div
                            style={{
                              fontSize: "1.05rem",
                              marginTop: "0.35rem",
                              fontWeight: 600
                            }}
                        >
                          전체:{" "}
                          <strong>{kpi.latestYearStat.hitSum.toLocaleString()}</strong>
                        </div>
                        <div
                            style={{
                              fontSize: "0.9rem",
                              marginTop: "0.25rem",
                              opacity: 0.85
                            }}
                        >
                          연평균:{" "}
                          <strong>{kpi.latestYearStat.hitAvg.toLocaleString()}</strong>
                        </div>
                      </div>
                    </>
                )}
              </div>
            </section>
        )}
      </main>
  )
}
