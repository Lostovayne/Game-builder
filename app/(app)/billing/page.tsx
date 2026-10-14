import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Billing",
}

export default async function BillingPage() {
  await auth.protect({
    unauthenticatedUrl: "/sign-in",
  })

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-11 items-center border-b px-4">
        <h1 className="text-sm font-medium">Billing</h1>
      </header>
      <main className="flex-1 px-6 pt-9">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-sm text-muted-foreground">Available credits</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight">$8.80</p>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Credits cover the models that build and revise your games. A scene
            already in progress can finish below zero; the next build waits for
            more credits.
          </p>

          <h2 className="mt-10 text-2xl font-semibold tracking-tight">
            Keep the studio running
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Builder adds $10.00 every month, and unused credits roll over.
          </p>

          <div className="mt-6">
            <PricingTable for="organization" />
          </div>
        </div>
      </main>
    </div>
  )
}
