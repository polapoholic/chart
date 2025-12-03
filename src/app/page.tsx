"use client"

import {useState, useMemo, useRef} from "react"
import * as XLSX from "xlsx"
import dynamic from "next/dynamic"
import type { ChangeEvent } from "react"

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

// ECharts 컴포넌트는 브라우저에서만 렌더링되게 dynamic import
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false
})

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

export default function HomePage() {
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name) // 🔹 이 줄 추가


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
          typeof firstCell === "string" &&
          firstCell.toLowerCase().includes("month")

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

      console.log("months:", months)
      console.log("menu1:", menu1)
      console.log("totalHits:", totalHits)

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

  // 간단 KPI 계산 (총합/최근월)
  const kpi = useMemo(() => {
    if (!chartData) return null

    const { months, totalHits, uniqueUsers } = chartData
    const totalHitSum = totalHits.reduce((a, b) => a + b, 0)
    const totalUserSum = uniqueUsers.reduce((a, b) => a + b, 0)
    const avgHits =
        totalHits.length > 0 ? Math.round(totalHitSum / totalHits.length) : 0
    const latestIndex = months.length - 1

    // 🔹 연도별 평균 계산
    const yearlyMap: Record<string, { sum: number; count: number }> = {}
    months.forEach((m, idx) => {
      const [year] = m.split("-") // "2024-01" → "2024"
      if (!yearlyMap[year]) {
        yearlyMap[year] = { sum: 0, count: 0 }
      }
      yearlyMap[year].sum += totalHits[idx] ?? 0
      yearlyMap[year].count += 1
    })

    const yearlyAvg = Object.entries(yearlyMap).map(([year, { sum, count }]) => ({
      year,
      avg: count > 0 ? Math.round(sum / count) : 0
    }))

    return {
      totalHitSum,
      totalUserSum,
      avgHits,
      latestMonth: months[latestIndex] ?? "-",
      yearlyAvg      // 🔹 추가
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
        backgroundColor: "rgba(15,23,42,0.9)",
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
        {
          name: "Menu1",
          type: "line",
          smooth: true,
          data: menu1
        },
        {
          name: "Menu2",
          type: "line",
          smooth: true,
          data: menu2
        },
        {
          name: "Menu3",
          type: "line",
          smooth: true,
          data: menu3
        },
        {
          name: "Menu4",
          type: "line",
          smooth: true,
          data: menu4
        }
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
        backgroundColor: "rgba(15,23,42,0.9)",
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
        {
          name: "Unique Users",
          type: "line",
          smooth: true,
          data: uniqueUsers
        },
        {
          name: "Total Hits",
          type: "line",
          smooth: true,
          data: totalHits
        }
      ]
    }
  }

  return (
      <main
          style={{
            minHeight: "100vh",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            gap: "2rem",
            background: "#020617",
            color: "#e5e7eb"
          }}
      >
        {/* 상단 헤더 영역 */}
        <header
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem"
            }}
        >
          <h1 style={{ fontSize: "2rem", fontWeight: 600 }}>
            월별 사용 통계 대시보드
          </h1>
          <p
              style={{
                fontSize: "0.95rem",
                opacity: 0.8
              }}
          >
            A열: Month, B~E열: Menu1~4 HIT, F열: UniqueUsers, G열: TotalHits 형태의
            엑셀 파일을 업로드하세요.
          </p>
        </header>

        {/* 업로드 카드 */}
        {/* 업로드 카드 */}
        <section
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              width: "100%",
              background: "#0f172a",
              padding: "1.5rem",
              borderRadius: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
              boxShadow: "0 20px 40px rgba(15,23,42,0.5)"
            }}
        >
          <div>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              데이터 업로드
            </h2>
            <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
              DRM 해제된 Excel(.xlsx) 파일을 선택하면 메뉴별·사용자별 통계를
              그래프로 시각화합니다.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* 예쁜 업로드 박스 */}
            <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  minWidth: "260px",
                  padding: "0.75rem 1rem",
                  borderRadius: "9999px",
                  border: "1px dashed #64748b",
                  background:
                      "linear-gradient(135deg, rgba(15,23,42,0.8), rgba(30,64,175,0.5))",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem"
                }}
            >
      <span style={{ fontSize: "0.9rem" }}>
        {fileName
            ? `선택된 파일: ${fileName}`
            : "엑셀 파일을 클릭하여 업로드 (.xlsx)"}
      </span>
              <span
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.3rem 0.7rem",
                    borderRadius: "9999px",
                    background: "#0f172a",
                    border: "1px solid #1d4ed8"
                  }}
              >
        파일 선택
      </span>
            </div>

            {/* 실제 input은 숨김 */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                style={{ display: "none" }}
            />

            {/* 재업로드 / 초기화 버튼 */}
            {fileName && (
                <button
                    type="button"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ""
                      }
                      setFileName(null)
                      setChartData(null) // 차트도 초기화하고 싶으면 유지, 아니면 이 줄 삭제
                    }}
                    style={{
                      alignSelf: "flex-end",
                      fontSize: "0.8rem",
                      color: "#f97373",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0
                    }}
                >
                  파일 다시 선택하기
                </button>
            )}
          </div>
        </section>


        {/* KPI 카드 */}
        {/* KPI 카드 */}
        {chartData && kpi && (
            <section
                style={{
                  maxWidth: "1400px",
                  margin: "0 auto",
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1rem"
                }}
            >
              {/* 기존 4개 카드 그대로 유지 ... */}

              {/* 🔹 연도별 평균 카드 */}
              {kpi.yearlyAvg && kpi.yearlyAvg.length > 0 && (
                  <div
                      style={{
                        gridColumn: "1 / -1",
                        background: "linear-gradient(135deg, #020617, #0f172a)",
                        padding: "1rem 1.2rem",
                        borderRadius: "0.9rem",
                        border: "1px solid #1e293b",
                        marginTop: "0.5rem"
                      }}
                  >
                    <div style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: "0.3rem" }}>
                      연도별 평균 Total Hits
                    </div>
                    <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.75rem",
                          fontSize: "0.9rem"
                        }}
                    >
                      {kpi.yearlyAvg.map((item) => (
                          <span
                              key={item.year}
                              style={{
                                padding: "0.35rem 0.7rem",
                                borderRadius: "9999px",
                                background: "#020617",
                                border: "1px solid #1e293b"
                              }}
                          >
              {item.year}년 :{" "}
                            <strong>{item.avg.toLocaleString()}</strong>
            </span>
                      ))}
                    </div>
                  </div>
              )}
            </section>
        )}


        {/* 차트 영역 */}
        {chartData && (
            <>
              <section
                  style={{
                    margin: "0 auto",
                    width: "100%",
                    background: "#020617",
                    padding: "1.5rem",
                    borderRadius: "1rem",
                    boxShadow: "0 20px 40px rgba(15,23,42,0.7)"
                  }}
              >
                <ReactECharts
                    option={getMenuChartOption()}
                    style={{ width: "100%", height: "70vh" }} // 🔥 크게!
                />
              </section>

              <section
                  style={{
                    margin: "0 auto",
                    width: "100%",
                    background: "#020617",
                    padding: "1.5rem",
                    borderRadius: "1rem",
                    boxShadow: "0 20px 40px rgba(15,23,42,0.7)"
                  }}
              >
                <ReactECharts
                    option={getHitChartOption()}
                    style={{ width: "100%", height: "60vh" }}
                />
              </section>
            </>
        )}
      </main>
  )
}
