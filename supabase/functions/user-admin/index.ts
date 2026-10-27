import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })

const allowedRoles = new Set(["admin", "viewer"])

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const url = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authorization = req.headers.get("Authorization") || ""

  if (!url || !anonKey || !serviceRoleKey) return json({ error: "Server configuration error" }, 500)
  if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401)

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401)

  const callerId = callerData.user.id
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("app_role")
    .eq("user_id", callerId)
    .single()

  if (profileError || profile?.app_role !== "admin") return json({ error: "Admin permission required" }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: "Invalid request body" }, 400)
  }

  const action = String(body.action || "")

  try {
    if (action === "list_users") {
      const { data: authData, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw error

      const { data: profiles, error: profilesError } = await adminClient
        .from("profiles")
        .select("user_id,display_name,app_role")
      if (profilesError) throw profilesError

      const profileMap = new Map((profiles || []).map((item) => [item.user_id, item]))
      const users = (authData.users || []).map((user) => {
        const appProfile = profileMap.get(user.id)
        return {
          id: user.id,
          email: user.email || "",
          display_name: appProfile?.display_name || user.user_metadata?.display_name || user.email || "مستخدم",
          app_role: appProfile?.app_role || null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at || null,
          email_confirmed_at: user.email_confirmed_at || null,
          is_current: user.id === callerId,
        }
      })

      return json({ users })
    }

    if (action === "create_user") {
      const email = String(body.email || "").trim().toLowerCase()
      const password = String(body.password || "")
      const displayName = String(body.display_name || "").trim() || email
      const role = String(body.app_role || "")

      if (!email || !email.includes("@")) return json({ error: "البريد الإلكتروني غير صالح" }, 400)
      if (password.length < 8) return json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400)
      if (!allowedRoles.has(role)) return json({ error: "الدور غير صالح" }, 400)

      const { data: created, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })
      if (error) throw error
      if (!created.user) throw new Error("تعذر إنشاء المستخدم")

      const { error: profileInsertError } = await adminClient
        .from("profiles")
        .insert({
          user_id: created.user.id,
          display_name: displayName,
          app_role: role,
        })

      if (profileInsertError) {
        await adminClient.auth.admin.deleteUser(created.user.id)
        throw profileInsertError
      }

      return json({
        ok: true,
        user: {
          id: created.user.id,
          email,
          display_name: displayName,
          app_role: role,
        },
      })
    }

    if (action === "update_role") {
      const userId = String(body.user_id || "")
      const role = String(body.app_role || "")
      if (!userId) return json({ error: "المستخدم مطلوب" }, 400)
      if (!allowedRoles.has(role)) return json({ error: "الدور غير صالح" }, 400)
      if (userId === callerId && role !== "admin") {
        return json({ error: "لا يمكنك إزالة صلاحية Admin من حسابك الحالي" }, 400)
      }

      const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId)
      if (authUserError || !authUser.user) return json({ error: "المستخدم غير موجود" }, 404)

      const displayName = authUser.user.user_metadata?.display_name || authUser.user.email || "مستخدم"
      const { error } = await adminClient.from("profiles").upsert({
        user_id: userId,
        display_name: displayName,
        app_role: role,
      }, { onConflict: "user_id" })
      if (error) throw error

      return json({ ok: true })
    }

    if (action === "update_password") {
      const userId = String(body.user_id || "")
      const password = String(body.password || "")
      if (!userId) return json({ error: "المستخدم مطلوب" }, 400)
      if (password.length < 8) return json({ error: "كلمة المرور يجب ألا تقل عن 8 أحرف" }, 400)

      const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === "delete_user") {
      const userId = String(body.user_id || "")
      if (!userId) return json({ error: "المستخدم مطلوب" }, 400)
      if (userId === callerId) {
        return json({ error: "لا يمكنك حذف حسابك الحالي" }, 400)
      }

      const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId)
      if (targetError || !targetData.user) return json({ error: "المستخدم غير موجود" }, 404)

      const { data: targetProfile, error: targetProfileError } = await adminClient
        .from("profiles")
        .select("app_role")
        .eq("user_id", userId)
        .maybeSingle()

      if (targetProfileError) throw targetProfileError

      if (targetProfile?.app_role === "admin") {
        const { count, error: countError } = await adminClient
          .from("profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("app_role", "admin")
        if (countError) throw countError
        if ((count || 0) <= 1) {
          return json({ error: "لا يمكن حذف آخر Admin في النظام" }, 400)
        }
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) throw error

      return json({ ok: true, id: userId })
    }

    return json({ error: "Unknown action" }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error"
    return json({ error: message }, 400)
  }
})
