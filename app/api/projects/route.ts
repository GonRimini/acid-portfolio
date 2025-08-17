// app/api/projects/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 300 // ISR 5 min

type MediaType = "image" | "video"
interface MediaFile { src: string; type: MediaType }
interface Project {
  name: string
  title: string
  subtitle: string
  text: string
  images: MediaFile[]
  media: MediaFile[] // alias para el front actual
}

const IMG_RE = /\.(jpe?g|png|gif|webp|svg)$/i
const VID_RE = /\.(mp4|mov|avi|webm)$/i

const BUCKET = process.env.SUPABASE_BUCKET || "projects"
const RAW_PREFIX = (process.env.SUPABASE_PREFIX || "").replace(/^\/|\/$/g, "")

// Une prefijo + ruta sin tocar la barra final del argumento (la REST API es sensible a eso)
const prefixPath = (p: string) => {
  const right = (p || "").replace(/^\/+/, "")
  return RAW_PREFIX ? `${RAW_PREFIX}/${right}` : right
}

// Para getPublicUrl (acá sí limpiamos barras sobrantes)
const withPrefixClean = (p: string) => {
  const clean = (p || "").replace(/^\/|\/$/g, "")
  return RAW_PREFIX ? `${RAW_PREFIX}/${clean}` : clean
}

function supabaseServer() {
  const url = process.env.SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
  return createClient(url, anon, { auth: { persistSession: false } })
}

async function restList(dir: string) {
  const urlBase = (process.env.SUPABASE_URL || "").replace(/\/+$/, "")
  const url = `${urlBase}/storage/v1/object/list/${BUCKET}`
  const anon = process.env.SUPABASE_ANON_KEY as string

  // intentamos con y sin barra final (la API a veces distingue)
  const tries = [prefixPath(dir.endsWith("/") ? dir : `${dir}/`), prefixPath(dir.replace(/\/+$/, ""))]
  for (const prefix of tries) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anon,
        authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      }),
      cache: "no-store",
    })
    if (!res.ok) continue
    const data = await res.json().catch(() => [])
    if (Array.isArray(data) && data.length) {
      return data as Array<{ name: string; metadata?: { size?: number } }>
    }
  }
  return [] as Array<{ name: string; metadata?: { size?: number } }>
}

const isFolder = (e: any) => !e || e.metadata == null || typeof e.metadata.size !== "number"

export async function GET(req: Request) {
  try {
    const supabase = supabaseServer()
    const url = new URL(req.url)
    const debug = url.searchParams.get("debug")

    // 1) order.json
    const of = await supabase.storage.from(BUCKET).download(prefixPath("order.json"))
    const order: string[] = JSON.parse(await of.data.text())

    // DEBUG opcional: muestra qué ve la REST API
    if (debug) {
      const diag: any[] = []
      for (const projectName of order) {
        const root = await restList(`${projectName}`)
        const imgs = await restList(`${projectName}/images`)
        diag.push({
          project: projectName,
          rootCount: root.length,
          rootNames: root.map((x) => x.name),
          imagesCount: imgs.length,
          imagesNames: imgs.map((x) => x.name),
        })
      }
      return NextResponse.json({ bucket: BUCKET, prefix: RAW_PREFIX, order, diag })
    }

    // 2) proyectos
    const projects: Project[] = []

    for (const projectName of order) {
      // content.txt
      const cf = await supabase.storage.from(BUCKET).download(prefixPath(`${projectName}/content.txt`))
      const content = cf.data ? await cf.data.text() : ""
      const lines = content.split(/\r?\n/).map((l) => l.trim())
      const [title = "", subtitle = "", ...rest] = lines
      const text = rest.join("\n")

      // 3) media: primero /images (REST), si no hay, raíz del proyecto
      let files = await restList(`${projectName}/images`)
      let inImages = true
      if (!files.length) {
        files = await restList(`${projectName}`)
        inImages = false
      }

      const mediaList: MediaFile[] = []
      for (const f of files) {
        if (isFolder(f)) continue
        const name = f.name as string
        if (!IMG_RE.test(name) && !VID_RE.test(name)) continue
        const rel = inImages ? `${projectName}/images/${name}` : `${projectName}/${name}`
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(withPrefixClean(rel))
        mediaList.push({ src: data.publicUrl, type: VID_RE.test(name) ? "video" : "image" })
      }

      projects.push({ name: projectName, title, subtitle, text, images: mediaList, media: mediaList })
    }

    return NextResponse.json(projects, {
      headers: { "cache-control": "s-maxage=300, stale-while-revalidate=60" },
    })
  } catch (err) {
    console.error("api/projects supabase error:", err)
    return NextResponse.json([], { status: 200 })
  }
}
