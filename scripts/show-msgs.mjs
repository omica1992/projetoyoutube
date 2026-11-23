import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"

const endpoint = await Service.ensure()
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
const sid = process.argv[2]
const msgs = await client.session.context({ sessionID: sid })
console.log("total:", msgs.length)
for (const m of msgs) {
  console.log("TYPE:", m.type, "KEYS:", Object.keys(m).join(","))
  const json = JSON.stringify(m)
  console.log(json.slice(0, 1200))
  console.log("---")
}
