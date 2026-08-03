import { Agent } from "@mastra/core/agent";

export const chatAgent = new Agent({
  id: "chat-agent",
  name: "Chat Agent",
  instructions: "あなたは親切なAIアシスタントです。ユーザーの質問に分かりやすく回答してください。",
  model: "anthropic/claude-sonnet-5",
});
