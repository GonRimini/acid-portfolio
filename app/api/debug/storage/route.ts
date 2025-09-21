import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = process.env.SUPABASE_BUCKET || "projects"
const RAW_PREFIX = (process.env.SUPABASE_PREFIX || "").replace(/^\/|\/$/g, "")

const prefixPath = (p: string) => {
  const right = (p || "").replace(/^\/+/, "")
  return RAW_PREFIX ? `${RAW_PREFIX}/${right}` : right
}

function supabaseServer() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY
  
  if (!url) throw new Error("Missing SUPABASE_URL")
  
  // Prefer service role key for storage operations
  const keyToUse = serviceRoleKey || anonKey
  const keyType = serviceRoleKey ? "service_role" : "anon"
  
  if (!keyToUse) throw new Error("Missing both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY")
  
  console.log(`STORAGE/CLIENT: using key type: ${keyType}`)
  
  return {
    client: createClient(url, keyToUse, { auth: { persistSession: false } }),
    keyType
  }
}

export async function GET() {
  const timestamp = new Date().toISOString()
  
  try {
    console.log("STORAGE/DEBUG: Starting diagnostic...")
    
    const { client: supabase, keyType } = supabaseServer()
    
    // Echo inputs
    const inputs = {
      bucket: BUCKET,
      prefixOrderJson: prefixPath("order.json"),
      prefixRoot: prefixPath("")
    }
    
    console.log("STORAGE/INPUTS:", JSON.stringify(inputs, null, 2))
    
    // Path checks
    const pathCheck = {
      hasLeadingSlash: prefixPath("order.json").startsWith("/"),
      hasDoubleSlash: prefixPath("order.json").includes("//"),
      caseMatches: true // Will be updated after list operation
    }
    
    // Runtime info
    const runtime = {
      env: process.env.NODE_ENV || "development",
      vercel: !!process.env.VERCEL,
      nextRuntime: process.env.NEXT_RUNTIME || "nodejs"
    }
    
    console.log("RUNTIME:", JSON.stringify(runtime, null, 2))
    
    // Next flags
    const nextFlags = {
      dynamic: "force-dynamic",
      revalidate: 0
    }
    
    console.log("NEXT-FLAGS:", JSON.stringify(nextFlags, null, 2))
    
    // 1. List operation
    console.log("STORAGE/LIST: Attempting to list files...")
    let listResult: any = { prefixUsed: prefixPath(""), files: [], error: null }
    
    try {
      const { data: listData, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(prefixPath(""), { limit: 1000 })
      
      if (listError) {
        listResult.error = {
          name: listError.name,
          message: listError.message
        }
        console.log("STORAGE/LIST ERROR:", listError)
      } else {
        listResult.files = (listData || []).map(file => ({
          name: file.name,
          size: file.metadata?.size || null,
          updatedAt: file.updated_at || null
        }))
        
        // Check if order.json exists and update case sensitivity
        const orderJsonFile = listResult.files.find((f: any) => f.name === "order.json")
        pathCheck.caseMatches = !!orderJsonFile
        
        console.log("STORAGE/LIST SUCCESS:", `Found ${listResult.files.length} files`)
        console.log("PATH-CHECK: order.json exists:", !!orderJsonFile)
      }
    } catch (err: any) {
      listResult.error = {
        name: err.name || "UnknownError",
        message: err.message || "Unknown error"
      }
      console.log("STORAGE/LIST EXCEPTION:", err)
    }
    
    // 2. Download operation
    console.log("STORAGE/DOWNLOAD: Attempting direct download...")
    let downloadResult: any = {
      ok: false,
      statusCode: null,
      errorName: null,
      errorMessage: null,
      byteLength: null,
      preview: null
    }
    
    try {
      const downloadResponse = await supabase.storage
        .from(BUCKET)
        .download(prefixPath("order.json"))
      
      if (downloadResponse.data) {
        const text = await downloadResponse.data.text()
        downloadResult.ok = true
        downloadResult.statusCode = 200
        downloadResult.byteLength = text.length
        downloadResult.preview = text.substring(0, 100)
        console.log("STORAGE/DOWNLOAD SUCCESS:", `Size: ${text.length} bytes`)
      } else {
        downloadResult.statusCode = downloadResponse.statusCode || 404
        downloadResult.errorMessage = "Data is null"
        console.log("STORAGE/DOWNLOAD FAILED: Data is null")
      }
    } catch (err: any) {
      downloadResult.errorName = err.name || "UnknownError"
      downloadResult.errorMessage = err.message || "Unknown error"
      console.log("STORAGE/DOWNLOAD ERROR:", err.name, err.message)
    }
    
    // 3. Signed URL operation
    console.log("STORAGE/SIGNED: Attempting signed URL...")
    let signedUrlResult: any = {
      created: false,
      error: null,
      fetchStatus: null,
      contentType: null,
      preview: null
    }
    
    try {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(prefixPath("order.json"), 60)
      
      if (signedError) {
        signedUrlResult.error = {
          name: signedError.name,
          message: signedError.message
        }
        console.log("STORAGE/SIGNED ERROR:", signedError)
      } else if (signedData?.signedUrl) {
        signedUrlResult.created = true
        
        // Fetch the signed URL
        const fetchResponse = await fetch(signedData.signedUrl)
        signedUrlResult.fetchStatus = fetchResponse.status
        signedUrlResult.contentType = fetchResponse.headers.get("content-type")
        
        if (fetchResponse.ok) {
          const text = await fetchResponse.text()
          signedUrlResult.preview = text.substring(0, 100)
          console.log("STORAGE/SIGNED SUCCESS:", `Status: ${fetchResponse.status}`)
        } else {
          console.log("STORAGE/SIGNED FETCH FAILED:", fetchResponse.status)
        }
      }
    } catch (err: any) {
      signedUrlResult.error = {
        name: err.name || "UnknownError",
        message: err.message || "Unknown error"
      }
      console.log("STORAGE/SIGNED EXCEPTION:", err)
    }
    
    const response = {
      inputs,
      pathCheck,
      list: listResult,
      download: downloadResult,
      signedUrl: signedUrlResult,
      runtime,
      nextFlags,
      supabaseClient: { keyType },
      timestamp
    }
    
    console.log("STORAGE/DEBUG: Diagnostic complete")
    
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
        "pragma": "no-cache"
      }
    })
    
  } catch (err: any) {
    console.error("STORAGE/DEBUG ERROR:", err)
    
    return NextResponse.json({
      error: {
        name: err.name || "UnknownError",
        message: err.message || "Unknown error"
      },
      timestamp
    }, { status: 200 })
  }
}
