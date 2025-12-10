"use client"

import {
  useState,
  useMemo,
  useRef,
  type ChangeEvent,
  useEffect
} from "react"
import * as XLSX from "xlsx"
import dynamic from "next/dynamic"

// 브라우저에서만 ECharts 렌더링
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false
})

// ========= 타입 정의 =========

interface MonthlyChartData {
  months: string[]
  menu1: number[]
  menu2: number[]
  menu3: number[]
  menu4: number[]
  uniqueUsers: number[]
  totalHits: number[]
  menuLabels: {
    menu1: string
    menu2: string
    menu3: string
    menu4: string
  }
}

type DailyRow = {
  date: string
  users: number
}

type DailyDataset = {
  id: string
  fileName: string
  rows: DailyRow[]
}

type FileKind = "monthly" | "dailyUsers" | "unknown"

// ========= 유틸 함수들 =========

function normalizeMonth(value: any): string {
  if (value == null || value === "") return ""

  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }

  const raw = String(value).toLowerCase().trim()

  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
    return raw.slice(0, 7)
  }

  return raw
}

function normalizeDate(value: any): string {
  if (!value) return ""

  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  const raw = String(value).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const replaced = raw.replace(/[./]/g, "-")
  if (/^\d{4}-\d{2}-\d{2}$/.test(replaced)) return replaced

  return raw
}

function toNumber(value: any): number {
  if (value == null || value === "") return 0
  if (typeof value === "number") return value
  const cleaned = String(value).replace(/,/g, "").trim()
  const n = Number(cleaned)
  return isNaN(n) ? 0 : n
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ========= 파일 타입 판별 =========

function detectFileKind(rows: any[][]): FileKind {
  if (!rows || rows.length < 2) return "unknown"

  const header = rows[0] ?? []
  const first = header[0]
  const second = header[1]

  const h0 = typeof first === "string" ? first.toLowerCase() : ""
  const h1 = typeof second === "string" ? second.toLowerCase() : ""

  const row1 = rows[1] ?? []
  const nonEmptyCount = row1.filter(v => v !== null && v !== "").length

  // 1) 헤더 텍스트로 구분
  if (h0.includes("month") || h0.includes("월")) return "monthly"
  if (h0.includes("date") || h0.includes("일자")) return "dailyUsers"

  // 2) 컬럼 개수로 대략 구분
  if (nonEmptyCount >= 5) return "monthly"
  if (nonEmptyCount === 2) return "dailyUsers"

  return "unknown"
}

// ========= 월간 파서 =========

function parseMonthly(rows: any[][]): MonthlyChartData {
  const firstRow = rows[0]
  const firstCell = firstRow[0]
  const looksLikeHeader =
      typeof firstCell === "string" &&
      firstCell.toLowerCase().includes("month")

  const colMonth = 0
  const colMenu1 = 1
  const colMenu2 = 2
  const colMenu3 = 3
  const colMenu4 = 4
  const colUser = 5
  const colTotal = 6

  let menu1Label = "Menu1"
  let menu2Label = "Menu2"
  let menu3Label = "Menu3"
  let menu4Label = "Menu4"

  if (looksLikeHeader) {
    const h1 = firstRow[colMenu1]
    const h2 = firstRow[colMenu2]
    const h3 = firstRow[colMenu3]
    const h4 = firstRow[colMenu4]

    if (typeof h1 === "string" && h1.trim()) menu1Label = h1.trim()
    if (typeof h2 === "string" && h2.trim()) menu2Label = h2.trim()
    if (typeof h3 === "string" && h3.trim()) menu3Label = h3.trim()
    if (typeof h4 === "string" && h4.trim()) menu4Label = h4.trim()
  }

  const dataRows = looksLikeHeader ? rows.slice(1) : rows

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
    throw new Error("월 데이터가 하나도 파싱되지 않았습니다.")
  }

  return {
    months,
    menu1,
    menu2,
    menu3,
    menu4,
    uniqueUsers,
    totalHits,
    menuLabels: {
      menu1: menu1Label,
      menu2: menu2Label,
      menu3: menu3Label,
      menu4: menu4Label
    }
  }
}

// ========= 일간 사용자 파서 =========

function parseDailyUsers(rows: any[][]): DailyRow[] {
  const firstRow = rows[0]
  const firstCell = firstRow?.[0]
  const looksLikeHeader =
      typeof firstCell === "string" &&
      firstCell.toLowerCase().includes("date")

  const colDate = 0
  const colUsers = 1

  const dataRows = looksLikeHeader ? rows.slice(1) : rows

  const parsed: DailyRow[] = []

  for (const row of dataRows) {
    if (!row) continue
    const dateStr = normalizeDate(row[colDate])
    if (!dateStr) continue
    const users = toNumber(row[colUsers])
    parsed.push({ date: dateStr, users })
  }

  if (!parsed.length) {
    throw new Error("일간 사용자 데이터가 없습니다.")
  }

  parsed.sort((a, b) => a.date.localeCompare(b.date))

  return parsed
}

// ========= 스타일 (기존 글래스 느낌 유지) =========

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

const headerGlass: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  borderRadius: "1.3rem",
  border: "1px solid rgba(255,255,255,0.35)",
  boxShadow: "0 25px 60px rgba(0,0,0,0.4)"
}

const chartCard: React.CSSProperties = {
  ...glassPanel,
  padding: "1.2rem 1.2rem",
  marginTop: "1.2rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem"
}

const chartHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap"
}

const pillButton: React.CSSProperties = {
  padding: "0.35rem 0.9rem",
  borderRadius: "999px",
  border: "1px solid rgba(148,163,184,0.7)",
  background: "rgba(15,23,42,0.95)",
  fontSize: "0.8rem",
  cursor: "pointer"
}

// ========= 메인 컴포넌트 =========

export default function HomePage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyChartData | null>(null)
  const [dailyDatasets, setDailyDatasets] = useState<DailyDataset[]>([])
  const [collapsedDaily, setCollapsedDaily] = useState<Record<string, boolean>>({})
  const [fileNameMonthly, setFileNameMonthly] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true
      })

      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]

      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null
      })

      if (!rows || rows.length < 2) {
        alert("데이터가 없습니다.")
        return
      }

      const kind = detectFileKind(rows)

      if (kind === "monthly") {
        const parsed = parseMonthly(rows)
        setMonthlyData(parsed)
        setFileNameMonthly(file.name)
        alert("월간 데이터로 인식되었습니다.")
      } else if (kind === "dailyUsers") {
        const parsed = parseDailyUsers(rows)
        const newDataset: DailyDataset = {
          id: genId(),
          fileName: file.name,
          rows: parsed
        }
        setDailyDatasets(prev => [...prev, newDataset])
        setCollapsedDaily(prev => ({ ...prev, [newDataset.id]: false }))
        alert("일간 사용자 데이터로 인식되었습니다.")
      } else {
        alert("이 엑셀 포맷이 월간/일간 어느 쪽인지 판단할 수 없습니다.")
      }
    } catch (err) {
      console.error(err)
      alert("엑셀 파일을 읽거나 파싱하는 중 오류가 발생했습니다.")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // 월간 KPI 계산 (기존 로직 거의 그대로)
  const monthlyKpi = useMemo(() => {
    if (!monthlyData) return null

    const { months, totalHits, uniqueUsers, menu1, menu2, menu3, menu4 } = monthlyData

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
      totalHitSum,
      totalUserSum,
      totalMenuAllSum,
      totalHitAvg,
      totalUserAvg,
      totalMenuAllAvg,
      latestMonth: months[latestIndex] ?? "-",
      latestYearStat
    }
  }, [monthlyData])

  // 월간 차트 옵션
  const getMenuChartOption = () => {
    if (!monthlyData) return {}

    const { months, menu1, menu2, menu3, menu4, menuLabels } = monthlyData

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
        data: [
          menuLabels.menu1,
          menuLabels.menu2,
          menuLabels.menu3,
          menuLabels.menu4
        ],
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
        {
          name: menuLabels.menu1,
          type: "line",
          smooth: true,
          data: menu1
        },
        {
          name: menuLabels.menu2,
          type: "line",
          smooth: true,
          data: menu2
        },
        {
          name: menuLabels.menu3,
          type: "line",
          smooth: true,
          data: menu3
        },
        {
          name: menuLabels.menu4,
          type: "line",
          smooth: true,
          data: menu4
        }
      ]
    }
  }

  const getHitChartOption = () => {
    if (!monthlyData) return {}

    const { months, uniqueUsers, totalHits } = monthlyData

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

  // 일간 데이터셋 통계
  const dailyStats = useMemo(() => {
    return dailyDatasets.map(ds => {
      const usersArr = ds.rows.map(r => r.users)
      const sum = usersArr.reduce((a, b) => a + b, 0)
      const avg = usersArr.length ? Math.round(sum / usersArr.length) : 0
      const max = usersArr.length ? Math.max(...usersArr) : 0
      const min = usersArr.length ? Math.min(...usersArr) : 0
      const startDate = ds.rows[0]?.date ?? "-"
      const endDate = ds.rows[ds.rows.length - 1]?.date ?? "-"
      return {
        id: ds.id,
        avg,
        max,
        min,
        startDate,
        endDate,
        days: ds.rows.length
      }
    })
  }, [dailyDatasets])

  const getDailyStatsById = (id: string) =>
      dailyStats.find(s => s.id === id)

  const makeDailyOption = (ds: DailyDataset) => {
    const labels = ds.rows.map(r => r.date)
    const values = ds.rows.map(r => r.users)
    const stats = getDailyStatsById(ds.id)

    return {
      textStyle: { color: "#e2e8f0" },
      color: ["#60a5fa"],
      title: {
        text: "일간 사용자 수",
        subtext: stats
            ? `일수: ${stats.days} / 평균: ${stats.avg.toLocaleString()} / 최대: ${stats.max.toLocaleString()}`
            : "",
        textStyle: { color: "#f1f5f9" },
        subtextStyle: { color: "#94a3b8", fontSize: 11 }
      },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,23,42,0.95)",
        borderColor: "#475569",
        textStyle: { color: "#e2e8f0" }
      },
      grid: {
        left: "5%",
        right: "5%",
        top: "20%",
        bottom: "10%",
        containLabel: true
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#cbd5f5", fontSize: 10, rotate: 45 },
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
        {
          name: "Users",
          type: "line",
          smooth: true,
          symbolSize: 5,
          areaStyle: { opacity: 0.12 },
          data: values
        }
      ]
    }
  }

  const toggleDailyCollapse = (id: string) => {
    setCollapsedDaily(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const removeDailyDataset = (id: string) => {
    if (!confirm("이 일간 사용자 데이터셋을 삭제하시겠습니까?")) return
    setDailyDatasets(prev => prev.filter(d => d.id !== id))
    setCollapsedDaily(prev => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  return (
      <main style={pageStyle}>
        {/* ===== 헤더 (공통 업로드 영역) ===== */}
        <header style={containerStyle}>
          <div
              style={{
                ...headerGlass,
                padding: "1.6rem 1.8rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem"
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
                  사용 통계 통합 대시보드
                </h1>
                <p
                    style={{
                      fontSize: "0.95rem",
                      opacity: 0.8,
                      marginTop: "0.25rem"
                    }}
                >
                  ▪ 월간 통계: A열 Month, B~E열 Menu1~4 HIT, F열 UniqueUsers, G열
                  TotalHits 구조의 엑셀<br />
                  ▪ 일간 사용자: A열 Date(yyyy-mm-dd), B열 Users 구조의 엑셀<br />
                  을 업로드하면 자동으로 유형을 인식해 각각의 차트를 생성합니다.
                </p>
                {fileNameMonthly && (
                    <p
                        style={{
                          fontSize: "0.8rem",
                          marginTop: "0.2rem",
                          opacity: 0.85,
                          color: "#a5b4fc"
                        }}
                    >
                      현재 월간 데이터: {fileNameMonthly}
                    </p>
                )}
              </div>

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
                  Excel(.xlsx / .csv) 파일 업로드
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

                {monthlyData && (
                    <button
                        type="button"
                        onClick={() => {
                          if (!confirm("월간 데이터를 초기화하시겠습니까?")) return
                          setMonthlyData(null)
                          setFileNameMonthly(null)
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
                      월간 데이터 초기화
                    </button>
                )}

                {dailyDatasets.length > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                          if (!confirm("모든 일간 사용자 데이터셋을 초기화하시겠습니까?"))
                            return
                          setDailyDatasets([])
                          setCollapsedDaily({})
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
                      모든 일간 데이터셋 초기화
                    </button>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ===== 월간 차트 영역 ===== */}
        {monthlyData && (
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

              {monthlyData && monthlyKpi && monthlyKpi.latestYearStat && (
                  <section style={containerStyle}>
                    {/* 여기 KPI 카드 영역은 네가 쓰던 것 그대로 붙여도 됨.
                  지금 답변이 길어지니까 필요하면 이 부분도 다시 풀로 정리해줄게 */}
                    <p style={{ marginTop: "1rem", opacity: 0.8, fontSize: "0.9rem" }}>
                      (KPI 카드 영역은 기존 코드 그대로 아래에 붙이면 됨)
                    </p>
                  </section>
              )}
            </>
        )}

        {/* ===== 일간 사용자 차트 카드들 ===== */}
        <section style={containerStyle}>
          {dailyDatasets.length === 0 && !monthlyData && (
              <p
                  style={{
                    marginTop: "2rem",
                    textAlign: "center",
                    opacity: 0.7,
                    fontSize: "0.9rem"
                  }}
              >
                월간 통계 또는 일간 사용자 엑셀을 업로드하면 이곳에 차트가 표시됩니다.
              </p>
          )}

          {dailyDatasets.map((ds, index) => {
            const stats = getDailyStatsById(ds.id)
            const isCollapsed = collapsedDaily[ds.id]

            return (
                <div key={ds.id} style={chartCard}>
                  <div style={chartHeaderRow}>
                    <div>
                      <div
                          style={{
                            fontSize: "0.85rem",
                            opacity: 0.8,
                            marginBottom: "0.2rem"
                          }}
                      >
                        일간 데이터셋 #{index + 1}
                      </div>
                      <div style={{ fontSize: "1rem", fontWeight: 600 }}>
                        {ds.fileName}
                      </div>
                      {stats && (
                          <div
                              style={{
                                fontSize: "0.78rem",
                                opacity: 0.75,
                                marginTop: "0.15rem"
                              }}
                          >
                            기간: {stats.startDate} ~ {stats.endDate} / 일수:{" "}
                            {stats.days} / 일평균:{" "}
                            {stats.avg.toLocaleString()} / 최대:{" "}
                            {stats.max.toLocaleString()}
                          </div>
                      )}
                    </div>

                    <div
                        style={{
                          display: "flex",
                          gap: "0.4rem",
                          alignItems: "center",
                          flexWrap: "wrap"
                        }}
                    >
                      <button
                          type="button"
                          onClick={() => toggleDailyCollapse(ds.id)}
                          style={{
                            ...pillButton,
                            borderColor: "rgba(129,140,248,0.9)"
                          }}
                      >
                        {isCollapsed ? "차트 펼치기" : "차트 접기"}
                      </button>
                      <button
                          type="button"
                          onClick={() => removeDailyDataset(ds.id)}
                          style={{
                            ...pillButton,
                            borderColor: "rgba(248,113,113,0.9)",
                            color: "#fecaca"
                          }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                      <div style={{ marginTop: "0.6rem" }}>
                        <ReactECharts
                            option={makeDailyOption(ds)}
                            style={{ width: "100%", height: "55vh" }}
                        />
                      </div>
                  )}
                </div>
            )
          })}
        </section>
      </main>
  )
}
