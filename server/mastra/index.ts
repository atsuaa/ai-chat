import { Mastra } from "@mastra/core/mastra";
import { chatAgent } from "./agent";

export const mastra = new Mastra({
  agents: { chatAgent },
});
