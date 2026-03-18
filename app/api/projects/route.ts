import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

type MediaType = "image" // <-- solo imágenes
interface MediaFile { src: string; type: MediaType }
interface ProjectFull {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
  images: MediaFile[]
}
interface ProjectLite {
  name: string
  title: string
  subtitle: string
  text: string
  cover: MediaFile | null
  count: number
  types: { image: number; video: number } // mantenemos la forma, video=0
  media: MediaFile[] // compat: en lite solo [cover] si existe
}

const IMG_RE = /\.(jpe?g|png|gif|webp|svg)$/i
// const VID_RE = /\.(mp4|mov|avi|webm)$/i  // <- ignorado a propósito

const BUCKET = process.env.SUPABASE_BUCKET || "projects"
const RAW_PREFIX = (process.env.SUPABASE_PREFIX || "").replace(/^\/|\/$/g, "")

const prefixPath = (p: string) => {
  const right = (p || "").replace(/^\/+/, "")
  return RAW_PREFIX ? `${RAW_PREFIX}/${right}` : right
}
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

async function getContentTxt(supabase: ReturnType<typeof supabaseServer>, projectName: string): Promise<string> {
  const localPath = join(process.cwd(), "public", "projects", projectName, "content.txt")
  try {
    return readFileSync(localPath, "utf-8")
  } catch {
    const cf = await supabase.storage.from(BUCKET).download(prefixPath(`${projectName}/content.txt`))
    return cf.data ? await cf.data.text() : ""
  }
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseServer()
    const debug = req.nextUrl.searchParams.get("debug")
    const lite = req.nextUrl.searchParams.get("lite") === "1" || req.nextUrl.searchParams.get("lite") === "true"

    // 1) order.json
    const of = await supabase.storage.from(BUCKET).download(prefixPath("order.json"))
    if (!of.data) {
      console.error("STORAGE/DOWNLOAD ERROR: order.json data is null", {
        error: of.error
      })
      throw new Error(`Failed to download order.json: ${of.error?.message || 'data is null'}`)
    }
    const order: string[] = JSON.parse(await of.data.text())

    // DEBUG opcional
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
    if (lite) {
      const projectsLite: ProjectLite[] = []

      for (const projectName of order) {
        const content = await getContentTxt(supabase, projectName)
        const lines = content.split(/\r?\n/).map((l) => l.trim())
        const [title = "", subtitle = "", ...rest] = lines
        const text = rest.join("\n")

        // media listing (solo imágenes)
        let files = await restList(`${projectName}/images`)
        let inImages = true
        if (!files.length) { files = await restList(`${projectName}`); inImages = false }

        const mediaAll: MediaFile[] = []
        let imgCount = 0
        for (const f of files) {
          if (isFolder(f)) continue
          const name = f.name as string
          if (!IMG_RE.test(name)) continue // <-- filtra TODO lo que no sea imagen
          const rel = inImages ? `${projectName}/images/${name}` : `${projectName}/${name}`
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(withPrefixClean(rel))
          mediaAll.push({ src: data.publicUrl, type: "image" })
          imgCount++
        }

        const cover = mediaAll[0] ?? null
        projectsLite.push({
          name: projectName,
          title, subtitle, text,
          cover,
          count: imgCount,                 // solo imágenes
          types: { image: imgCount, video: 0 }, // video=0
          media: cover ? [cover] : [],
        })
      }

      return NextResponse.json(projectsLite, {
        headers: { "cache-control": "no-store, no-cache, must-revalidate" },
      })
    }

    // FULL (solo imágenes)
    const projectsFull: ProjectFull[] = []

    for (const projectName of order) {
      const content = await getContentTxt(supabase, projectName)
      const lines = content.split(/\r?\n/).map((l) => l.trim())
      const [title = "", subtitle = "", ...rest] = lines
      const text = rest.join("\n")

      // media (solo imágenes)
      let files = await restList(`${projectName}/images`)
      let inImages = true
      if (!files.length) { files = await restList(`${projectName}`); inImages = false }

      const mediaList: MediaFile[] = []
      for (const f of files) {
        if (isFolder(f)) continue
        const name = f.name as string
        if (!IMG_RE.test(name)) continue
        const rel = inImages ? `${projectName}/images/${name}` : `${projectName}/${name}`
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(withPrefixClean(rel))
        mediaList.push({ src: data.publicUrl, type: "image" })
      }

      projectsFull.push({ name: projectName, title, subtitle, text, images: mediaList, media: mediaList })
    }

    return NextResponse.json(projectsFull, {
      headers: { "cache-control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    console.error("api/projects supabase error:", err)
    return NextResponse.json([], { status: 200 })
  }
}
