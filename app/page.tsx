"use client"

import { useState, useEffect, useRef, CSSProperties } from "react"
import { useIsMobile } from "@/hooks/use-mobile"

interface MediaFile { src: string; type: "image" | "video" }
interface Project {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
}
interface LightboxState {
  isOpen: boolean
  currentIndex: number
  media: MediaFile[]
  projectName: string
}

/* ====== Ajustá SOLO estas 3 variables (mobile) ====== */
const MOBILE_COLS = {
  num: "3.25rem", // ancho del "01."
  col1: "0.9fr",  // primera columna
  col2: "1.1fr",  // segunda columna
}

export default function Portfolio() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectIndex, setActiveProjectIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  const [lightbox, setLightbox] = useState<LightboxState>({
    isOpen: false,
    currentIndex: 0,
    media: [],
    projectName: "",
  })

  const [carouselIndex, setCarouselIndex] = useState<number[]>([])
  const carouselRefs = useRef<(HTMLDivElement | null)[]>([])
  const projectRefs = useRef<(HTMLDivElement | null)[]>([])
  const isMobile = useIsMobile()

  const mobileGridVars: CSSProperties = {
    ["--col-num" as any]: MOBILE_COLS.num,
    ["--col-1" as any]: MOBILE_COLS.col1,
    ["--col-2" as any]: MOBILE_COLS.col2,
  }

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        setProjects(data)
        setCarouselIndex(new Array(data.length).fill(0))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const splitCSV = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean)
  const splitTitleLines = (s: string) => splitCSV(s)

  const parseProjectInfo = (p: Project) => {
    const raw = (p.text || "").split(/\r?\n/).map((l) => l.trim())
    const lines = raw.filter((l, i) => !(i < 2 && l === ""))
    const titleLike = (s: string) => !!s && !s.includes(",") && s !== "-"

    let col1Title = p.title || ""
    let col2Title = p.subtitle || ""
    let col1Items: string[] = []
    let col2Items: string[] = []
    let paragraphs: string[] = []

    if (lines.length >= 4 && titleLike(lines[0]) && titleLike(lines[1])) {
      col1Title = lines[0] || col1Title
      col2Title = lines[1] || col2Title
      col1Items = splitCSV(lines[2] || "")
      col2Items = lines[3] === "-" || lines[3] === "" ? [] : splitCSV(lines[3] || "")
      const desc = lines.slice(4).join("\n")
      paragraphs = desc.trim() ? desc.split(/\n\s*\n/).map((p) => p.trim()) : []
    } else {
      col1Items = splitCSV(lines[0] || "")
      col2Items = lines[1] === "-" || lines[1] === "" ? [] : splitCSV(lines[1] || "")
      const desc = lines.slice(2).join("\n")
      paragraphs = desc.trim() ? desc.split(/\n\s*\n/).map((p) => p.trim()) : []
    }

    return { col1Title, col2Title, col1Items, col2Items, paragraphs }
  }

  useEffect(() => {
    if (projects.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute("data-project-index"))
            setActiveProjectIndex(idx)
          }
        })
      },
      { threshold: 0.3, rootMargin: "-20% 0px -20% 0px" },
    )
    projectRefs.current.forEach((ref) => ref && obs.observe(ref))
    return () => obs.disconnect()
  }, [projects])

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

  const scrollToProject = (i: number) => projectRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })
  const openLightbox = (p: Project, idx: number) => setLightbox({ isOpen: true, currentIndex: idx, media: p.media, projectName: p.name })
  const navigateLightbox = (dir: "prev" | "next") => setLightbox((p) => {
    const len = p.media.length || 1
    const next = dir === "next" ? (p.currentIndex + 1) % len : (p.currentIndex - 1 + len) % len
    return { ...p, currentIndex: next }
  })
  const handleCarouselScroll = (projIdx: number) => {
    const el = carouselRefs.current[projIdx]; if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setCarouselIndex((prev) => { const n = prev.slice(); n[projIdx] = idx; return n })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-gray-600">Loading portfolio...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* MOBILE: índice horizontal en el flujo (no fijo) */}
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
              <span className="text-sm text-gray-400 text-right select-none">
                {String(idx).padStart(2, "0")}.
              </span>
              <span
                className={`text-sm whitespace-nowrap ${
                  active ? "text-black" : "text-gray-600 hover:text-gray-800"
                }`}
              >
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
        {/* DESKTOP index y número central (igual que antes)… */}
        {!isMobile && (
          <>
            <div className="w-1/3 bg-white">
              <div className="fixed top-0 left-0 w-1/3 h-screen p-8 overflow-y-auto">
                <h1 className="text-sm font-normal mb-6 text-black">Index</h1>
                <nav>
                  <ul className="space-y-0">
                    {projects.map((proj, idx) => (
                      <li key={proj.name}>
                        <button
                          onClick={() => scrollToProject(idx)}
                          className={`w-full text-left py-0 text-sm transition-colors leading-[1.0] ${
                            activeProjectIndex === idx ? "text-black" : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          <span className="inline-block w-8 text-right mr-4">{String(idx).padStart(2, "0")}.</span>
                          {proj.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>

            <div className="w-1/3 bg-white">
              <div className="fixed top-6 left-[33.333%] w-1/3 pr-6 text-right text-sm text-gray-300 select-none pointer-events-none">
                {String(activeProjectIndex).padStart(2, "0")}.
              </div>
            </div>
          </>
        )}

        {/* DERECHA: contenido */}
        <div className={`${isMobile ? "w-full overflow-visible" : "w-1/3 overflow-y-auto bg-white"}`}>
          {projects.map((project, index) => {
            const { col1Title, col2Title, col1Items, col2Items, paragraphs } = parseProjectInfo(project)
            const current = carouselIndex[index] ?? 0
            const mediaCount = project.media.length

            return (
              <div
                key={project.name}
                ref={(el) => (projectRefs.current[index] = el)}
                data-project-index={index}
                className={`${isMobile ? "p-0" : "min-h-screen p-8"}`}
              >
                {/* DESKTOP info… (sin cambios) */}
                {!isMobile && (
                  <>
                    <div className="mb-3">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="text-lg font-normal text-black leading-[1.1] space-y-0">
                          {splitTitleLines(col1Title).map((t, i) => <div key={`t1-${i}`}>{t}</div>)}
                        </div>
                        <div className="text-lg font-normal text-black leading-[1.1] space-y-0">
                          {splitTitleLines(col2Title).map((t, i) => <div key={`t2-${i}`}>{t}</div>)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-3">
                      <div className="text-sm text-gray-400 leading-[1.1] space-y-0">
                        {col1Items.map((line, i) => <div key={`d-fc-${i}`}>{line}</div>)}
                      </div>
                      <div className="text-sm text-gray-400 leading-[1.1] space-y-0">
                        {col2Items.map((name, i) => <div key={`d-cb-${i}`}>{name}</div>)}
                      </div>
                    </div>

                    {paragraphs.length > 0 && (
                      <div className="text-sm text-black leading-[1.3] mb-6">
                        {paragraphs.map((p, i) => <p key={`d-desc-${i}`} className="mb-3">{p}</p>)}
                      </div>
                    )}
                  </>
                )}

                {/* ===== MOBILE (ALINEADO CORRECTO) ===== */}
                {isMobile ? (
                  <>
                    <div className="pl-6 pr-4 pt-6 pb-4" style={mobileGridVars}>
                      {/* Fila 1: número + títulos (grid 3 cols) */}
                      <div
                        className="grid items-baseline"
                        style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}
                      >
                        <div className="text-sm text-gray-300 leading-none text-left select-none">
                          {String(index).padStart(2, "0")}.
                        </div>
                        <div className="text-base font-normal text-black leading-[1.15] space-y-0">
                          {splitTitleLines(col1Title).map((t, i) => <div key={`mt1-${i}`}>{t}</div>)}
                        </div>
                        <div className="text-base font-normal text-black leading-[1.15] space-y-0">
                          {splitTitleLines(col2Title).map((t, i) => <div key={`mt2-${i}`}>{t}</div>)}
                        </div>
                      </div>

                      {/* Fila 2: ítems — MISMA grilla 3 columnas (cada lista en su columna) */}
                      <div
                        className="grid mt-2"
                        style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}
                      >
                        <div /> {/* hueco de la columna del número */}
                        <div className="text-sm text-gray-400 leading-[1.1] space-y-0">
                          {col1Items.map((line, i) => <div key={`fc-${i}`}>{line}</div>)}
                        </div>
                        <div className="text-sm text-gray-400 leading-[1.1] space-y-0">
                          {col2Items.map((name, i) => <div key={`cb-${i}`}>{name}</div>)}
                        </div>
                      </div>

                      {/* Fila 3: párrafo — ocupa columnas 2–3 */}
                      {paragraphs.length > 0 && (
                        <div
                          className="grid mt-3"
                          style={{ gridTemplateColumns: "var(--col-num) var(--col-1) var(--col-2)", columnGap: "1rem" }}
                        >
                          <div />
                          <div className="text-sm text-black leading-[1.35]" style={{ gridColumn: "2 / 4" }}>
                            {paragraphs.map((p, i) => <p key={`desc-${i}`} className="mb-3">{p}</p>)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Carrusel — fondo negro */}
                    {mediaCount > 0 && (
                      <>
                        <div
                          ref={(el) => (carouselRefs.current[index] = el)}
                          onScroll={() => handleCarouselScroll(index)}
                          className="no-scrollbar overflow-x-auto flex snap-x snap-mandatory bg-black"
                          style={{ scrollBehavior: "smooth" }}
                        >
                          {project.media.map((m, mIdx) => (
                            <div
                              key={`${project.name}-${mIdx}`}
                              className="min-w-full snap-center flex items-center justify-center py-4 bg-black"
                              style={{ height: "60vh" }}
                              onClick={() => openLightbox(project, mIdx)}
                            >
                              {m.type === "video" ? (
                                <video src={m.src} className="max-w-full max-h-full object-contain" controls preload="metadata" />
                              ) : (
                                <img src={m.src || "/placeholder.svg"} alt={`${col1Title} - ${mIdx + 1}`} className="max-w-full max-h-full object-contain" />
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="px-4 mt-3 text-xs text-gray-500">
                          {col1Title} — {current + 1}/{mediaCount}
                        </div>
                        <div className="flex justify-center gap-1.5 mt-2 mb-10">
                          {project.media.map((_, i) => (
                            <span key={`dot-${index}-${i}`} className={`h-1.5 w-1.5 rounded-full ${i === current ? "bg-gray-900" : "bg-gray-300"}`} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  mediaCount > 0 && (
                    <div className="bg-black p-8 min-h-96 flex items-center justify-center relative">
                      <div className="cursor-pointer max-w-full max-h-full flex items-center justify-center" onClick={() => openLightbox(project, 0)}>
                        {project.media[0].type === "video" ? (
                          <video src={project.media[0].src} className="max-w-full max-h-full object-contain hover:opacity-90 transition-opacity" style={{ maxHeight: "60vh" }} controls preload="metadata" />
                        ) : (
                          <img src={project.media[0].src || "/placeholder.svg"} alt={col1Title} className="max-w-full max-h-full object-contain hover:opacity-90 transition-opacity" style={{ maxHeight: "60vh" }} />
                        )}
                      </div>
                      <div className="absolute bottom-4 left-4 text-xs text-white">1/{mediaCount}</div>
                    </div>
                  )
                )}

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

            {lightbox.media[lightbox.currentIndex]?.type === "video" ? (
              <video src={lightbox.media[lightbox.currentIndex]?.src || "/placeholder.svg"} className="max-w-full max-h-full object-contain" controls autoPlay />
            ) : (
              <img src={lightbox.media[lightbox.currentIndex]?.src || "/placeholder.svg"} alt={`${lightbox.projectName} - ${lightbox.currentIndex + 1}`} className="max-w-full max-h-full object-contain" />
            )}

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
