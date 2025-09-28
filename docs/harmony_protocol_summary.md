# OpenAI Harmony Protocol Summary

## Roles and Channels
- Harmony conversations use the roles `system`, `developer`, `user`, `assistant`, and `tool`, ordered by instruction priority (`system` > `developer` > `user` > `assistant` > `tool`).
- Assistant messages are tagged with channels: `analysis` for chain-of-thought, `commentary` for tool calls or preambles, and `final` for user-facing text. Chain-of-thought content in the `analysis` channel must never be shown to end users.

## Prompt Structure
- Messages are rendered with `<|start|>{role}` headers followed by optional channel, recipients, or constraints and terminated with `<|end|>`, `<|return|>`, or `<|call|>` tokens as appropriate.
- Chats should end with `<|start|>assistant` so the model knows to begin generating the next reply.
- Historical assistant messages should replace trailing `<|return|>` with `<|end|>` before being re-used in subsequent prompts.

## System Message Guidance
- Provide knowledge cutoff, current date, reasoning effort (typically `Reasoning: high`), and the list of valid channels in the system message.
- If tools are available, note that tool calls must use the `commentary` channel and list the tool namespace in the system message.

## Reasoning Output Handling
- The model streams chain-of-thought in the `analysis` channel and final answers in `final`. Keep chain-of-thought internal and drop it from future turns unless tool calls were issued, in which case the prior reasoning should be retained.

## Tool and Function Calls
- Tool definitions live in the developer message within a `# Tools` section using a TypeScript-like schema wrapped in the `functions` namespace.
- Tool invocations appear on the `commentary` channel with syntax such as `<|start|>assistant<|channel|>commentary to=functions.example <|constrain|>json<|message|>{...}<|call|>` and tool outputs use the tool name as the role, sending results back on `commentary` to the assistant.

## Streaming and Decoding
- Harmony-compatible models support streaming token output; the OpenAI Harmony library offers a `StreamableParser` to decode tokens incrementally, exposing the current role, channel, and content delta for live updates.

## Built-in Tools
- Harmony-aware system prompts can declare the built-in `browser` and `python` tools, specifying their request formats and channel usage (`analysis` for requests, `commentary` for some outputs). These entries document the exact function signatures and citation format expectations.

