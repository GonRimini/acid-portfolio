"use client"

import { useState, useEffect, useRef, CSSProperties } from "react"
import { useIsMobile } from "@/hooks/use-mobile"

/* ================== Tipos ================== */
interface MediaFile { src: string; type: "image" | "video" }
interface ProjectLite {
  name: string
  title: string
  subtitle: string
  text: string
  cover: MediaFile | null
  count: number
  types: { image: number; video: number }
  media: MediaFile[]
}
interface ProjectDetail {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
  count: number
  types: { image: number; video: number }
}
type ProjectLocal = {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
  count: number
  types: { image: number; video: number }
  loaded: boolean
}

/* ====== Grilla ====== */
const MOBILE_COLS = { num: "3.25rem", col1: "0.9fr", col2: "1.1fr" }
/* columnas desktop (tus valores) */
const DESK_COLS = { num: "159px", col1: "215px", col2: "271px", gap: "11px" }

/* Visor fijo */
const VIEWPORT = { mobileH: "60vh", desktopH: "636px", desktopHMax: "70vh" }

/* Auto-avance */
const AUTO_INTERVAL = 3500

export default function Portfolio() {
  const [projects, setProjects] = useState<ProjectLocal[]>([])
  const [activeProjectIndex, setActiveProjectIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  const [lightbox, setLightbox] = useState({
    isOpen: false,
    currentIndex: 0,
    media: [] as MediaFile[],
    projectName: "",
  })

  const [carouselIndex, setCarouselIndex] = useState<number[]>([])
  const carouselRefs = useRef<(HTMLDivElement | null)[]>([])
  const projectRefs  = useRef<(HTMLDivElement | null)[]>([])
  const isMobile = useIsMobile()

  /* ====== Variables CSS ====== */
  const mobileGridVars: CSSProperties = {
    ["--col-num" as any]: MOBILE_COLS.num,
    ["--col-1" as any]: MOBILE_COLS.col1,
    ["--col-2" as any]: MOBILE_COLS.col2,
  }
  const deskGridVars: CSSProperties = {
    ["--d-col-num" as any]: DESK_COLS.num,
    ["--d-col-1" as any]: DESK_COLS.col1,
    ["--d-col-2" as any]: DESK_COLS.col2,
    ["--d-gap" as any]: DESK_COLS.gap,
  }

  /* ================== Carga inicial (LITE) ================== */
  useEffect(() => {
    let cancelled = false
    const loadLite = async () => {
      try {
        const res = await fetch("/api/projects?lite=1", { cache: "no-store" })
        const lite: ProjectLite[] = await res.json()
        if (cancelled) return
        const mapped: ProjectLocal[] = lite.map(p => ({
          name: p.name,
          title: p.title,
          subtitle: p.subtitle,
          text: p.text,
          media: p.cover ? [p.cover] : [],
          count: p.count,
          types: p.types,
          loaded: false,
        }))
        setProjects(mapped)
        setCarouselIndex(new Array(mapped.length).fill(0))
      } catch {
        // noop
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadLite()
    return () => { cancelled = true }
  }, [])

  /* ================== Helpers ================== */
  const splitCSV = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
  const splitTitleLines = (s: string) => splitCSV(s)

  type Parsed = {
    col1Title: string
    col2Title: string
    col1Items: string[]
    col2Items: string[]
    paragraphs: string[]
  }

  // ❗ Sin modo especial: Information se parsea igual que los demás
  const parseProjectInfo = (p: { title: string; subtitle: string; text: string }): Parsed => {
    const rawLines = (p.text || "").split(/\r?\n/).map((l) => l.trim())
    const normLines = rawLines.filter((l, i) => !(i < 2 && l === ""))
    const titleLike = (s: string) => !!s && !s.includes(",") && s !== "-"

    let col1Title = p.title || ""
    let col2Title = p.subtitle || ""
    let col1Items: string[] = []
    let col2Items: string[] = []
    let paragraphs: string[] = []

    if (normLines.length >= 4 && titleLike(normLines[0]) && titleLike(normLines[1])) {
      col1Title = normLines[0] || col1Title
      col2Title = normLines[1] || col2Title
      col1Items = splitCSV(normLines[2] || "")
      col2Items = normLines[3] === "-" || normLines[3] === "" ? [] : splitCSV(normLines[3] || "")
      const desc = normLines.slice(4).join("\n")
      paragraphs = desc.trim() ? desc.split(/\n\s*\n/).map((pp) => pp.trim()) : []
    } else {
      col1Items = splitCSV(normLines[0] || "")
      col2Items = normLines[1] === "-" || normLines[1] === "" ? [] : splitCSV(normLines[1] || "")
      const desc = normLines.slice(2).join("\n")
      paragraphs = desc.trim() ? desc.split(/\n\s*\n/).map((pp) => pp.trim()) : []
    }

    return { col1Title, col2Title, col1Items, col2Items, paragraphs }
  }

  const prefetchImg = (src?: string) => { if (!src) return; const img = new Image(); img.src = src }

  /* ================== On-demand: detalle por proyecto ================== */
  const inFlight = useRef(0)
  const MAX_CONCURRENCY = 2
  const queue = useRef<number[]>([])
  const loadingMap = useRef<Map<string, Promise<void>>>(new Map())

  const enqueueLoad = (idx: number) => {
    if (!projects[idx]) return
    if (projects[idx].loaded) return
    if (loadingMap.current.has(projects[idx].name)) return
    queue.current.push(idx)
    runQueue()
  }

  const runQueue = () => {
    while (inFlight.current < MAX_CONCURRENCY && queue.current.length > 0) {
      const idx = queue.current.shift()!
      const name = projects[idx]?.name
      if (!name) continue
      if (projects[idx].loaded || loadingMap.current.has(name)) continue
      const p = loadProjectDetail(idx, name)
      loadingMap.current.set(name, p)
      inFlight.current++
      p.finally(() => {
        inFlight.current--
        loadingMap.current.delete(name)
        runQueue()
      })
    }
  }

  const loadProjectDetail = async (idx: number, name: string) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { cache: "no-store" })
      if (!res.ok) throw new Error("detail fetch failed")
      const detail: ProjectDetail = await res.json()
      setProjects(prev => {
        const arr = prev.slice()
        const existing = arr[idx]
        if (!existing || existing.name !== name) return prev
        arr[idx] = {
          ...existing,
          media: detail.media.length ? detail.media : existing.media, // si Information no tiene media, queda vacío
          loaded: true,
          count: detail.count ?? existing.count,
          types: detail.types ?? existing.types,
          title: detail.title ?? existing.title,
          subtitle: detail.subtitle ?? existing.subtitle,
          text: detail.text ?? existing.text,
        }
        return arr
      })
      detail.media.slice(0, 2).forEach(m => m.type === "image" && prefetchImg(m.src))
    } catch {
      setProjects(prev => {
        const arr = prev.slice()
        const existing = arr[idx]
        if (!existing || existing.name !== name) return prev
        arr[idx] = { ...existing, loaded: true }
        return arr
      })
    }
  }

  /* ================== Visible project ================== */
  useEffect(() => {
    if (projects.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const idx = Number(e.target.getAttribute("data-project-index"))
          if (e.isIntersecting) {
            setActiveProjectIndex(idx)
            enqueueLoad(idx)
            if (idx + 1 < projects.length) enqueueLoad(idx + 1)
          }
        })
      },
      { threshold: 0.3, rootMargin: "-20% 0px -20% 0px" },
    )
    projectRefs.current.forEach((ref) => ref && obs.observe(ref))
    return () => obs.disconnect()
  }, [projects])

  /* ================== Teclado ================== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox.isOpen) {
        if (e.key === "Escape") setLightbox((p) => ({ ...p, isOpen: false }))
        else if (e.key === "ArrowLeft") navigateLightbox("prev")
        else if (e.key === "ArrowRight") navigateLightbox("next")
      } else {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault()
          scrollToProject(Math.min(activeProjectIndex + 1, projects.length - 1))
        } else if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault()
          scrollToProject(Math.max(activeProjectIndex - 1, 0))
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightbox.isOpen, activeProjectIndex, projects.length])

  /* ================== Autoplay ================== */
  useEffect(() => {
    if (projects.length === 0 || lightbox.isOpen) return
    const t = setInterval(() => {
      const idx = activeProjectIndex
      const len = projects[idx]?.media.length || 0
      if (len <= 1) return
      setCarouselIndex((prev) => {
        const next = prev.slice()
        const cur = prev[idx] ?? 0
        const ni = (cur + 1) % len
        next[idx] = ni
        if (isMobile) {
          const el = carouselRefs.current[idx]
          if (el) el.scrollTo({ left: ni * el.clientWidth, behavior: "smooth" })
        }
        const media = projects[idx]?.media
        const nextMedia = media?.[ni]
        if (nextMedia?.type === "image") prefetchImg(nextMedia.src)
        return next
      })
    }, AUTO_INTERVAL)
    return () => clearInterval(t)
  }, [projects, activeProjectIndex, isMobile, lightbox.isOpen])

  /* ================== Acciones ================== */
  const scrollToProject = (i: number) => projectRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })
  const openLightbox = (p: ProjectLocal, idx: number) =>
    setLightbox({ isOpen: true, currentIndex: idx, media: p.media, projectName: p.name })
  const navigateLightbox = (dir: "prev" | "next") =>
    setLightbox((p) => {
      const len = p.media.length || 1
      const next = dir === "next" ? (p.currentIndex + 1) % len : (p.currentIndex - 1 + len) % len
      return { ...p, currentIndex: next }
    })
  const handleCarouselScroll = (projIdx: number) => {
    const el = carouselRefs.current[projIdx]; if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setCarouselIndex((prev) => { const n = prev.slice(); n[projIdx] = idx; return n })
  }
  const stepProjectMedia = (projIdx: number, dir: "prev" | "next") =>
    setCarouselIndex((prev) => {
      const len = projects[projIdx]?.media.length || 1
      if (len <= 1) return prev
      const cur = prev[projIdx] ?? 0
      const ni = dir === "next" ? (cur + 1) % len : (cur - 1 + len) % len
      const next = prev.slice()
      next[projIdx] = ni
      return next
    })

  /* ================== Render ================== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-600">ACID</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* MOBILE: índice horizontal */}
      {isMobile && (
        <div className="bg-white border-b" style={mobileGridVars}>
          <div className="px-4 py-2 overflow-x-auto no-scrollbar">
            <div className="flex gap-3 snap-x snap-mandatory">
              {projects.map((proj, idx) => {
                const active = activeProjectIndex === idx
                return (
                  <button
                    key={proj.name}
                    onClick={() => scrollToProject(idx)}
                    className="shrink-0 snap-start grid items-baseline"
                    style={{ gridTemplateColumns: "var(--col-num) 1fr", columnGap: "0.5rem" }}
                    title={proj.name}
                  >
                    <span className="text-[11.92px] leading-[13.7px] text-black text-right select-none">
                      {String(idx).padStart(2, "0")}.
                    </span>
                    <span className={`text-[11.92px] leading-[13.7px] whitespace-nowrap ${active ? "text-black" : "text-gray-700 hover:text-gray-900"}`}>
                      {proj.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className={`flex ${isMobile ? "flex-col min-h-screen" : "h-screen"}`}>
        {/* IZQUIERDA (58%) */}
        {!isMobile && (
          <div className="w-[58%] bg-white">
            <div className="fixed top-0 left-0 w-[58%] h-screen p-8 overflow-y-auto">
              <h1 className="text-sm font-normal mb-6 text-black">Index</h1>
              <nav>
                <ul className="space-y-0">
                  {projects.map((proj, idx) => (
                    <li key={proj.name}>
                      <button
                        onClick={() => scrollToProject(idx)}
                        className={`w-full text-left py-0 transition-colors text-[11.92px] leading-[13.7px] ${
                          activeProjectIndex === idx ? "text-black" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        <span className="inline-block w-8 text-right mr-4 leading-[13.7px] text-black">
                          {String(idx).padStart(2, "0")}.
                        </span>
                        {proj.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>
        )}

        {/* DERECHA (42%) scroll */}
        <div className={`${isMobile ? "w-full overflow-visible" : "w-[42%] overflow-y-auto bg-white"}`}>
          {projects.map((project, index) => {
            const { col1Title, col2Title, col1Items, col2Items, paragraphs } = parseProjectInfo(project)
            const media = project.media
            const mediaCount = media.length
            const current = carouselIndex[index] ?? 0

            // 👇 Si NO hay media (p.ej. Information), NO usamos min-h-screen → gap reducido
            const sectionCls = isMobile ? "p-0" : `${mediaCount > 0 ? "min-h-screen p-8" : "p-8"}`

            return (
              <div
                key={project.name}
                ref={(el) => (projectRefs.current[index] = el)}
                data-project-index={index}
                className={sectionCls}
              >
                {/* ===== DESKTOP ===== */}
                {!isMobile && (
                  <>
                    {/* títulos + número (siempre) */}
                    <div className="mb-3" style={deskGridVars}>
                      <div
                        className="grid items-baseline"
                        style={{ gridTemplateColumns: "var(--d-col-num) var(--d-col-1) var(--d-col-2)", columnGap: "var(--d-gap)" }}
                      >
                        <div className="text-[11.92px] leading-[13.7px] text-black select-none">
                          {String(index).padStart(2, "0")}.
                        </div>
                        <div className="text-[11.92px] leading-[13.7px] text-black font-[430]">
                          {splitTitleLines(col1Title).map((t, i) => <div key={`t1-${i}`}>{t}</div>)}
                        </div>
                        <div className="text-[11.92px] leading-[13.7px] text-black font-[430]">
                          {splitTitleLines(col2Title).map((t, i) => <div key={`t2-${i}`}>{t}</div>)}
                        </div>
                      </div>
                    </div>

                    {/* listas */}
                    <div className={`${mediaCount > 0 ? "mb-3" : "mb-2"}`} style={deskGridVars}>
                      <div
                        className="grid"
                        style={{ gridTemplateColumns: "var(--d-col-num) var(--d-col-1) var(--d-col-2)", columnGap: "var(--d-gap)" }}
                      >
                        <div />
                        <div className="text-[11.92px] leading-[13.7px] text-black/40 font-[410]">
                          {col1Items.map((line, i) => <div key={`d-fc-${i}`}>{line}</div>)}
                        </div>
                        <div className="text-[11.92px] leading-[13.7px] text-black/40 font-[410]">
                          {col2Items.map((name, i) => <div key={`d-cb-${i}`}>{name}</div>)}
                        </div>
                      </div>
                    </div>

                    {/* párrafos */}
                    {paragraphs.length > 0 && (
                      <div style={deskGridVars}>
                        <div className="grid" style={{ gridTemplateColumns: "var(--d-col-num) 1fr", columnGap: "var(--d-gap)" }}>
                          <div />
                          <div className={`text-[11.92px] leading-[13.7px] text-black ${mediaCount > 0 ? "mb-6" : "mb-3"}`}>
                            {paragraphs.map((p, i) => <p key={`d-desc-${i}`} className="mb-3">{p}</p>)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VISOR DESKTOP (solo si hay media) */}
                    {mediaCount > 0 && (
                      <div style={deskGridVars}>
                        <div className="grid" style={{ gridTemplateColumns: "var(--d-col-num) 1fr", columnGap: "var(--d-gap)" }}>
                          <div />
                          <div
                            className="relative group bg-black p-8 flex items-center justify-center w-full overflow-hidden"
                            style={{ height: VIEWPORT.desktopH, maxHeight: VIEWPORT.desktopHMax, minWidth: 0 }}
                          >
                            <div className="cursor-pointer w-full h-full flex items-center justify-center" onClick={() => openLightbox(project, current)}>
                              {media[current]?.type === "video" ? (
                                <video
                                  src={media[current]?.src}
                                  className="w-full h-full object-contain"
                                  preload={current === 0 ? "metadata" : "none"}
                                  controls
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={media[current]?.src || "/placeholder.svg"}
                                  alt={col1Title}
                                  className="w-full h-full object-contain"
                                  loading={current === 0 ? "eager" : "lazy"}
                                  decoding="async"
                                  fetchPriority={current === 0 ? "high" : "auto"}
                                />
                              )}
                            </div>

                            <button
                              aria-label="Anterior"
                              disabled={media.length <= 1}
                              className={`hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center text-white ${media.length <= 1 ? "bg-white/10 opacity-40 cursor-not-allowed" : "bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"}`}
                              onClick={() => stepProjectMedia(index, "prev")}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10.707 3.293a1 1 0 0 1 0 1.414L7.414 8l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z"/></svg>
                            </button>
                            <button
                              aria-label="Siguiente"
                              disabled={media.length <= 1}
                              className={`hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center text-white ${media.length <= 1 ? "bg-white/10 opacity-40 cursor-not-allowed" : "bg-white/10 hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"}`}
                              onClick={() => stepProjectMedia(index, "next")}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.293 12.707a1 1 0 0 1 0-1.414L8.586 8 5.293 4.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"/></svg>
                            </button>

                            <div className="absolute bottom-4 left-4 text-xs text-white">{Math.min(current + 1, Math.max(media.length, 1))}/{Math.max(media.length, 1)}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ===== MOBILE ===== */}
                {isMobile ? (
                  <>
                    <div className="px-6 pt-6 pb-4" style={mobileGridVars}>
                      <div className="grid items-baseline" style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}>
                        <div className="text-[11.92px] leading-[13.7px] text-black">{String(index).padStart(2, "0")}.</div>
                        <div className="text-[11.92px] leading-[13.7px] font-[430] text-black">{splitTitleLines(col1Title).map((t, i) => <div key={`mt1-${i}`}>{t}</div>)}</div>
                        <div className="text-[11.92px] leading-[13.7px] font-[430] text-black">{splitTitleLines(col2Title).map((t, i) => <div key={`mt2-${i}`}>{t}</div>)}</div>
                      </div>
                      <div className="grid mt-2" style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}>
                        <div />
                        <div className="text-[11.92px] leading-[13.7px] text-black/40 font-[410]">{col1Items.map((line, i) => <div key={`fc-${i}`}>{line}</div>)}</div>
                        <div className="text-[11.92px] leading-[13.7px] text-black/40 font-[410]">{col2Items.map((name, i) => <div key={`cb-${i}`}>{name}</div>)}</div>
                      </div>
                      {paragraphs.length > 0 && (
                        <div className="grid mt-3" style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}>
                          <div />
                          <div className="text-[11.92px] leading-[13.7px] text-black" style={{ gridColumn: "2 / 4" }}>
                            {paragraphs.map((p, i) => <p key={`desc-${i}`} className="mb-3">{p}</p>)}
                          </div>
                        </div>
                      )}
                    </div>

                    {mediaCount > 0 && (
                      <div className="px-6">
                        <div
                          ref={(el) => (carouselRefs.current[index] = el)}
                          onScroll={() => handleCarouselScroll(index)}
                          className="no-scrollbar overflow-x-auto flex snap-x snap-mandatory bg-black"
                          style={{ scrollBehavior: "smooth" }}
                        >
                          {media.map((m, mIdx) => (
                            <div
                              key={`${project.name}-${mIdx}`}
                              className="min-w-full snap-center flex items-center justify-center py-4 bg-black w-full overflow-hidden"
                              style={{ height: VIEWPORT.mobileH }}
                              onClick={() => openLightbox(project, mIdx)}
                            >
                              {m.type === "video"
                                ? <video src={m.src} className="w-full h-full object-contain" preload={mIdx === 0 ? "metadata" : "none"} controls={mIdx === (carouselIndex[index] ?? 0)} playsInline />
                                : <img src={m.src || "/placeholder.svg"} alt={`${col1Title} - ${mIdx + 1}`} className="w-full h-full object-contain" loading={mIdx === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={mIdx === 0 ? "high" : "auto"} />}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 text-xs text-gray-500">{col1Title} — {Math.min((carouselIndex[index] ?? 0) + 1, Math.max(media.length, 1))}/{Math.max(media.length, 1)}</div>
                        <div className="flex justify-center gap-1.5 mt-2 mb-10">
                          {media.map((_, i) => (<span key={`dot-${index}-${i}`} className={`h-1.5 w-1.5 rounded-full ${i === (carouselIndex[index] ?? 0) ? "bg-gray-900" : "bg-gray-300"}`} />))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}

                {isMobile && <div className="h-12" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
          <div className="relative max-w-5xl max-h-full p-4 w-full h-full flex items-center justify-center">
            <button
              onClick={() => setLightbox((p) => ({ ...p, isOpen: false }))}
              className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors z-20"
              title="Close (ESC)"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M11.354 1.646a.5.5 0 0 0-.708 0L6 6.293 1.354 1.646a.5.5 0 1 0-.708.708L5.293 7l-4.647 4.646a.5.5 0 0 0 .708.708L6 7.707l4.646 4.647a.5.5 0 0 0 .708-.708L6.707 7l4.647-4.646a.5.5 0 0 0 0-.708z" />
              </svg>
            </button>

            {lightbox.media.length > 1 && (
              <>
                <button onClick={() => navigateLightbox("prev")} className="absolute left-6 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 z-20" title="Previous (←)">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M10.707 3.293a1 1 0 0 1 0 1.414L7.414 8l3.293 3.293a1 1 0 1 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z"/></svg>
                </button>
                <button onClick={() => navigateLightbox("next")} className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 z-20" title="Next (→)">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.293 12.707a1 1 0 0 1 0-1.414L8.586 8 5.293 4.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z"/></svg>
                </button>
              </>
            )}

            {lightbox.media[lightbox.currentIndex]?.type === "video"
              ? <video src={lightbox.media[lightbox.currentIndex]?.src || "/placeholder.svg"} className="max-w-full max-h-full object-contain" controls autoPlay />
              : <img src={lightbox.media[lightbox.currentIndex]?.src || "/placeholder.svg"} alt={`${lightbox.projectName} - ${lightbox.currentIndex + 1}`} className="max-w-full max-h-full object-contain" />}

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-xs">
              {lightbox.currentIndex + 1} / {lightbox.media.length}
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
