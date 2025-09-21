import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

type MediaType = "image" // <-- solo imágenes
interface MediaFile { src: string; type: MediaType }
interface ProjectDetail {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
  count: number
  types: { image: number; video: number } // video=0
}

const IMG_RE = /\.(jpe?g|png|gif|webp|svg)$/i
// const VID_RE = /\.(mp4|mov|avi|webm)$/i  // <- ignorado

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
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: "name", order: "asc" } }),
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

export async function GET(
  _req: Request,
  ctx: { params: { name: string } }
) {
  try {
    const supabase = supabaseServer()
    const projectName = decodeURIComponent(ctx.params.name)

    // content
    const cf = await supabase.storage.from(BUCKET).download(prefixPath(`${projectName}/content.txt`))
    const content = cf.data ? await cf.data.text() : ""
    const lines = content.split(/\r?\n/).map((l) => l.trim())
    const [title = "", subtitle = "", ...rest] = lines
    const text = rest.join("\n")

    // media (solo imágenes)
    let files = await restList(`${projectName}/images`)
    let inImages = true
    if (!files.length) { files = await restList(`${projectName}`); inImages = false }

    const media: MediaFile[] = []
    let imgCount = 0
    for (const f of files) {
      if (isFolder(f)) continue
      const name = f.name as string
      if (!IMG_RE.test(name)) continue
      const rel = inImages ? `${projectName}/images/${name}` : `${projectName}/${name}`
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(withPrefixClean(rel))
      media.push({ src: data.publicUrl, type: "image" })
      imgCount++
    }

    const payload: ProjectDetail = {
      name: projectName,
      title, subtitle, text,
      media,
      count: imgCount,
      types: { image: imgCount, video: 0 },
    }

    return NextResponse.json(payload, {
      headers: { "cache-control": "no-store, no-cache, must-revalidate" },
    })
  } catch (err) {
    console.error("api/projects/[name] error:", err)
    return NextResponse.json(
      { name: ctx.params.name, title: "", subtitle: "", text: "", media: [], count: 0, types: { image: 0, video: 0 } },
      { status: 200 }
    )
  }
}
