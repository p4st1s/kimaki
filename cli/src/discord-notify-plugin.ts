// OpenCode plugin that pings a Discord user when a session goes idle.
// Hooks into session.idle (event-driven, not polling) so the ping is
// immediate and fires exactly once per turn for every session type
// (Discord-driven and external CLI/TUI alike).
//
// Requires KIMAKI_NOTIFY_USER_ID env var. Skips sessions with no Discord
// thread (e.g. subagents — they're internal and never have a thread row).

import type { Plugin } from '@opencode-ai/plugin'
import { setDataDir } from './config.js'
import { createPluginLogger, setPluginLogFilePath } from './plugin-logger.js'
import { initSentry } from './sentry.js'

const logger = createPluginLogger('NOTIFY')

async function loadDatabaseModule() {
  return import('./database.js')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const discordNotifyPlugin: any = async (): Promise<ReturnType<Plugin>> => {
  initSentry()
  const dataDir = process.env.KIMAKI_DATA_DIR
  if (dataDir) {
    setDataDir(dataDir)
    setPluginLogFilePath(dataDir)
  }

  const notifyUserId = process.env.KIMAKI_NOTIFY_USER_ID
  if (!notifyUserId) {
    return {}
  }

  return {
    async event({ event }) {
      if (event.type !== 'session.idle') {
        return
      }

      const sessionId = event.properties.sessionID

      const db = await loadDatabaseModule()
      const threadId = await db.getThreadIdBySessionId(sessionId)
      if (!threadId) {
        return
      }

      await db.createIpcRequest({
        type: 'discord_notify',
        sessionId,
        threadId,
        payload: JSON.stringify({ userId: notifyUserId }),
      }).catch((err: unknown) => {
        logger.error('[NOTIFY] Failed to create IPC request:', err)
      })
    },
  }
}
