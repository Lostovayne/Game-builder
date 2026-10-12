// Temporary route used to confirm that a production deploy symbolicates stack
// frames correctly. It is removed as soon as the event is verified in Sentry.
export async function GET() {
  throw new Error("Sentry production verification 20261012T0400")
}
