import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export const revalidate = 300 // Cache for 5 minutes

interface MediaFile {
  src: string
  type: 'image' | 'video'
}

interface Project {
  name: string
  title: string
  subtitle: string
  text: string
  media: MediaFile[]
}

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), "public")
    const orderPath = path.join(publicDir, "order.json")
    const projectsDir = path.join(publicDir, "projects")

    // Read order.json
    const orderData = JSON.parse(fs.readFileSync(orderPath, "utf8"))

    const projects: Project[] = []

    for (const projectName of orderData) {
      const projectDir = path.join(projectsDir, projectName)
      const contentPath = path.join(projectDir, "content.txt")
      const imagesDir = path.join(projectDir, "images")

      if (!fs.existsSync(contentPath)) continue

      // Parse content.txt
      const content = fs.readFileSync(contentPath, "utf8")
      const lines = content.trim().split("\n")
      const [title, subtitle, ...textLines] = lines
      const text = textLines.join("\n")

      // List images and videos
      const media: MediaFile[] = []
      if (fs.existsSync(imagesDir)) {
        const mediaFiles = fs
          .readdirSync(imagesDir)
          .filter((file) => /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm)$/i.test(file))
          .sort((a, b) => {
            const aNum = Number.parseInt(a.match(/\d+/)?.[0] || "0")
            const bNum = Number.parseInt(b.match(/\d+/)?.[0] || "0")
            return aNum - bNum
          })

        for (const mediaFile of mediaFiles) {
          const extension = path.extname(mediaFile).toLowerCase()
          const isVideo = /\.(mp4|mov|avi|webm)$/i.test(extension)
          
          media.push({
            src: `/projects/${projectName}/images/${mediaFile}`,
            type: isVideo ? 'video' : 'image'
          })
        }
      }

      projects.push({
        name: projectName,
        title,
        subtitle,
        text,
        media,
      })
    }

    return NextResponse.json(projects)
  } catch (error) {
    console.error("Error reading projects:", error)
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 })
  }
}
