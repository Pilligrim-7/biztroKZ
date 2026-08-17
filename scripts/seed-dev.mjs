// Dev-only helper: seed a demo user + organization + session so the
// authenticated dashboard can be exercised without real Google OAuth.
// Prints a signed better-auth session cookie for local testing.
import { PrismaClient } from "../src/generated/prisma-client/client.ts"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { makeSignature } from "better-auth/crypto"
import { randomBytes } from "node:crypto"

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
})
const prisma = new PrismaClient({ adapter })

const secret = process.env.BETTER_AUTH_SECRET
if (!secret) throw new Error("BETTER_AUTH_SECRET missing")

const email = "demo@biztro.local"
const now = new Date()

async function main() {
  await prisma.waitlist.upsert({
    where: { email },
    update: { enabled: true },
    create: { email, enabled: true }
  })

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Demo Owner",
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now
    }
  })

  const org = await prisma.organization.upsert({
    where: { slug: "demo-bistro" },
    update: {},
    create: {
      name: "Demo Bistro",
      slug: "demo-bistro",
      status: "ACTIVE",
      plan: "BASIC",
      createdAt: now,
      updatedAt: now
    }
  })

  const existingMember = await prisma.member.findFirst({
    where: { userId: user.id, organizationId: org.id }
  })
  if (!existingMember) {
    await prisma.member.create({
      data: {
        id: `mem_${randomBytes(12).toString("hex")}`,
        organizationId: org.id,
        userId: user.id,
        role: "owner",
        createdAt: now
      }
    })
  }

  const token = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires,
      createdAt: now,
      updatedAt: now,
      activeOrganizationId: org.id
    }
  })

  const signature = await makeSignature(token, secret)
  const cookieValue = `${token}.${signature}`

  console.log("USER_ID=" + user.id)
  console.log("ORG_ID=" + org.id)
  console.log("ORG_SLUG=" + org.slug)
  console.log("COOKIE_NAME=better-auth.session_token")
  console.log("COOKIE_VALUE=" + cookieValue)
  console.log("COOKIE_HEADER=better-auth.session_token=" + cookieValue)
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
