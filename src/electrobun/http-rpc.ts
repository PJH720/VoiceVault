/**
 * HTTP + WebSocket RPC server for the Electrobun renderer bridge.
 *
 * Accepts POST /rpc with { channel, params } and dispatches to allRPCHandlers.
 * WebSocket at /events delivers main→renderer push events (onToken, onSegment, etc.).
 */
import type { ServerWebSocket } from 'bun'

type RPCHandlers = Record<string, ((...args: unknown[]) => unknown) | undefined>

let eventClients: Set<ServerWebSocket<unknown>> = new Set()

/**
 * Broadcast an event to all connected WebSocket clients.
 * Called by handlers that need to push events to the renderer.
 */
export function broadcastEvent(channel: string, payload: unknown): void {
  const message = JSON.stringify({ channel, payload })
  for (const ws of eventClients) {
    try {
      ws.send(message)
    } catch {
      eventClients.delete(ws)
    }
  }
}

/**
 * Start the HTTP RPC server. Returns the port it's listening on.
 */
export function startHttpRpcServer(
  handlers: RPCHandlers,
  port = 50100
): { port: number } {
  Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url)

      // WebSocket upgrade for push events
      if (url.pathname === '/events') {
        if (server.upgrade(req)) return undefined as unknown as Response
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // RPC endpoint
      if (req.method === 'POST' && url.pathname === '/rpc') {
        return handleRpc(req, handlers)
      }

      // Health check
      if (url.pathname === '/health') {
        return Response.json({ ok: true })
      }

      return new Response('Not found', { status: 404 })
    },
    websocket: {
      open(ws: ServerWebSocket<unknown>) {
        eventClients.add(ws)
      },
      close(ws: ServerWebSocket<unknown>) {
        eventClients.delete(ws)
      },
      message() {
        // Client→server messages not used; events are server-push only
      }
    }
  })

  console.log(`[VoiceVault] HTTP RPC server listening on port ${port}`)
  return { port }
}

async function handleRpc(req: Request, handlers: RPCHandlers): Promise<Response> {
  try {
    const body = (await req.json()) as { channel: string; params?: unknown }
    const { channel, params } = body

    const handler = handlers[channel]
    if (!handler) {
      return Response.json({ error: `Unknown channel: ${channel}` }, { status: 404 })
    }

    // Handlers accept a single params argument (object or undefined)
    const result = await handler(params)
    return Response.json({ result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[HTTP RPC] Error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
