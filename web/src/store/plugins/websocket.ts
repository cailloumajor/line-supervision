import ReconnectingWebSocket from "reconnecting-websocket"
import { Plugin } from "vuex"

import { automation } from "../modules/automation"

// @ts-ignore: Unexpected any
export default function createVuexPlugin(url: string): Plugin<any> {
  return store => {
    const ctx = automation.context(store)
    const rws = new ReconnectingWebSocket(url)
    rws.addEventListener("open", () => {
      ctx.mutations.wsLinkUp()
    })
    rws.addEventListener("close", () => {
      if (ctx.state.wsLinkActive) {
        ctx.mutations.wsLinkDown()
      }
    })
    rws.addEventListener("message", event => {
      try {
        const wsMessage = JSON.parse(event.data)
        switch (wsMessage.type) {
          case "opc_data_change":
            ctx.mutations.setMetrics(wsMessage.data)
            break
          case undefined:
            console.error(`Unrecognized message from ${event.origin}`)
            break
          default:
            console.warn(`Message type unknown from ${event.origin}`)
        }
      } catch (error) {
        console.error(error)
      }
    })
  }
}