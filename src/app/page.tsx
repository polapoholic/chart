"use client"

import { useState, useRef, useMemo, useEffect, type ChangeEvent } from "react"
import * as XLSX from "xlsx"
import dynamic from "next/dynamic"

// 브라우저에서만 ECharts 렌더링
const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false
})

type DailyRow = {
  date: string
  users: number
}

type Dataset = {
  id: string
  fileName: string
  rows: DailyRow[]
}

type ViewMode = "daily"

function normalizeDate(value: any): string {
  if (!value) return ""

  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  const raw = String(value).trim()

  // yyyy-mm-dd 형태면 그대로 사용
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // yyyy.mm.dd / yyyy/mm/dd 같은 것도 대충 맞춰줌
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

// ─── 스타일 공통 ─────────────────────────────────────────

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

const headerGlass: React.CSSProperties = {
  background: "linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06))",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  borderRadius: "1.3rem",
  border: "1px solid rgba(255,255,255,0.35)",
  boxShadow: "0 25px 60px rgba(0,0,0,0.4)"
}

const chartCard: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.7)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
  borderRadius: "1.2rem",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
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

// ─── 메인 컴포넌트 ────────────────────────────────────────

export default function HomePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<ViewMode>("daily")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 새로고침해도 유지하고 싶으면 여기서 localStorage 연동하면 됨 (지금은 생략)

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

      const headerRow = rows[0]
      const firstCell = headerRow?.[0]
      const looksLikeHeader =
          typeof firstCell === "string" &&
          firstCell.toLowerCase().includes("date")

      const colDate = 0
      const colUsers = 1

      const dataRows = looksLikeHeader ? rows.slice(1) : rows

      const parsed: DailyRow[] = []

      for (const row of dataRows) {
        if (!row) continue
        const dateRaw = row[colDate]
        const dateStr = normalizeDate(dateRaw)
        if (!dateStr) continue

        const users = toNumber(row[colUsers])
        parsed.push({ date: dateStr, users })
      }

      if (!parsed.length) {
        alert("유효한 일간 사용자 데이터가 없습니다.")
        return
      }

      // 날짜 오름차순 정렬
      parsed.sort((a, b) => a.date.localeCompare(b.date))

      const newDataset: Dataset = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        rows: parsed
      }

      setDatasets(prev => [...prev, newDataset])
      setCollapsed(prev => ({ ...prev, [newDataset.id]: false }))
    } catch (err) {
      console.error(err)
      alert("엑셀 파일을 읽는 중 오류가 발생했습니다.")
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const statsByDataset = useMemo(() => {
    return datasets.map(ds => {
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
  }, [datasets])

  const getDatasetStats = (id: string) =>
      statsByDataset.find(s => s.id === id)

  const makeDailyOption = (ds: Dataset) => {
    const labels = ds.rows.map(r => r.date)
    const values = ds.rows.map(r => r.users)

    const stats = getDatasetStats(ds.id)

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

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const removeDataset = (id: string) => {
    if (!confirm("이 데이터셋을 삭제하시겠습니까?")) return
    setDatasets(prev => prev.filter(d => d.id !== id))
    setCollapsed(prev => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  return (
      <main style={pageStyle}>
        {/* 헤더 영역 */}
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
                  일간 사용자 대시보드
                </h1>
                <p
                    style={{
                      fontSize: "0.95rem",
                      opacity: 0.8,
                      marginTop: "0.25rem"
                    }}
                >
                  A열: Date (yyyy-mm-dd), B열: Users 형식의 Excel(.xlsx, .csv)을
                  여러 개 업로드하면,
                  각 파일마다 별도의 일간 사용자 차트가 아래에 추가됩니다.
                </p>
              </div>

              {/* 업로드 영역 */}
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
                  새 Excel(.xlsx / .csv) 파일 추가
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

                {datasets.length > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                          if (!confirm("모든 데이터셋을 초기화하시겠습니까?")) return
                          setDatasets([])
                          setCollapsed({})
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
                      모든 차트 초기화
                    </button>
                )}
              </div>
            </div>

            {/* 뷰 모드 (지금은 일간만, 나중에 주간/월간/연간 추가 가능) */}
            <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.4rem",
                  flexWrap: "wrap"
                }}
            >
              <button
                  type="button"
                  onClick={() => setViewMode("daily")}
                  style={{
                    ...pillButton,
                    borderColor:
                        viewMode === "daily"
                            ? "rgba(96,165,250,0.9)"
                            : "rgba(148,163,184,0.7)",
                    background:
                        viewMode === "daily"
                            ? "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(129,140,248,0.3))"
                            : "rgba(15,23,42,0.9)"
                  }}
              >
                일간 사용자
              </button>
              {/* 주간/월간/연간은 나중에 붙일 자리 */}
            </div>
          </div>
        </header>

        {/* 데이터셋별 차트 카드들 */}
        <section style={containerStyle}>
          {datasets.length === 0 && (
              <p
                  style={{
                    marginTop: "2rem",
                    textAlign: "center",
                    opacity: 0.7,
                    fontSize: "0.9rem"
                  }}
              >
                아직 업로드된 데이터가 없습니다. 상단에서 Excel 파일을 추가해 보세요.
              </p>
          )}

          {datasets.map((ds, index) => {
            const stats = getDatasetStats(ds.id)
            const isCollapsed = collapsed[ds.id]

            return (
                <div key={ds.id} style={chartCard}>
                  {/* 카드 상단 헤더 (파일명 + 간단 요약 + 버튼들) */}
                  <div style={chartHeaderRow}>
                    <div>
                      <div
                          style={{
                            fontSize: "0.85rem",
                            opacity: 0.8,
                            marginBottom: "0.2rem"
                          }}
                      >
                        {index + 1}번째 데이터셋
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
                          onClick={() => toggleCollapse(ds.id)}
                          style={{
                            ...pillButton,
                            borderColor: "rgba(129,140,248,0.9)"
                          }}
                      >
                        {isCollapsed ? "차트 펼치기" : "차트 접기"}
                      </button>
                      <button
                          type="button"
                          onClick={() => removeDataset(ds.id)}
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

                  {/* 차트 본문 (접기 상태가 아니면 렌더링) */}
                  {!isCollapsed && (
                      <div style={{ marginTop: "0.6rem" }}>
                        {viewMode === "daily" && (
                            <ReactECharts
                                option={makeDailyOption(ds)}
                                style={{ width: "100%", height: "55vh" }}
                            />
                        )}
                      </div>
                  )}
                </div>
            )
          })}
        </section>
      </main>
  )
}
