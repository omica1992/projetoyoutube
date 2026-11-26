export const primaryChannelId = "UCClrO3uvc5-H6NPc6alEHDw"

export function chatChannelId(thread) {
  return thread?.messages?.find(message => message.channelId)?.channelId || primaryChannelId
}
