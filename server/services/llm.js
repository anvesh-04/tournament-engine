const Anthropic = require("@anthropic-ai/sdk");
const { ACTION_SCHEMA } = require("./adminCommands");

/**
 * NATURAL LANGUAGE -> STRUCTURED ACTION
 * -------------------------------------
 * The model's entire job is to pick ONE of the fixed actions in
 * services/adminCommands.js and fill in its arguments. It is given a read-only
 * snapshot of the schedule so it can resolve phrases like "the Ravens match at
 * 2pm" into a tournamentId and matchRefId.
 *
 * Two structural choices keep this honest:
 *
 *  - The actions are declared as STRICT tools, so the API itself guarantees
 *    the arguments match the declared JSON schema. The model cannot return a
 *    free-form blob for the server to interpret.
 *  - `tool_choice: {type: "any"}` forces a tool call, and one of the tools is
 *    `unsupported_command` — so "I cannot express this as an allowed action"
 *    is itself a structured answer rather than prose the server has to parse.
 *
 * Whatever comes back is still re-validated by validateAction() before use.
 * The API's schema enforcement is a convenience, not the security boundary.
 */

// Simple mapping work, so the cheapest effort setting is the right one here —
// the reasoning is shallow and the schema does the heavy lifting.
const MODEL = "claude-opus-5";
const MAX_TOKENS = 2000;
const EFFORT = "low";

/** Declared when the request cannot be expressed as one of the fixed actions. */
const UNSUPPORTED_TOOL = "unsupported_command";

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cachedClient = null;
function getClient() {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

/** JSON-schema type for one of our field types. */
function jsonSchemaForField(rule) {
  switch (rule.type) {
    case "id":
      return { type: "string", description: "A 24-character MongoDB ObjectId." };
    case "slot":
      return { type: "integer", minimum: 0 };
    default:
      return { type: "string" };
  }
}

/**
 * Renders ACTION_SCHEMA as strict Anthropic tool definitions, so the allowed
 * action set has exactly one definition in the codebase. Adding an action
 * there makes it available here automatically, and nowhere else.
 */
function buildTools() {
  const tools = Object.entries(ACTION_SCHEMA).map(([name, spec]) => {
    const properties = {};
    const required = [];

    for (const [field, rule] of Object.entries(spec.fields)) {
      properties[field] = jsonSchemaForField(rule);
      if (rule.required) required.push(field);
    }

    return {
      name,
      description: spec.description,
      strict: true,
      input_schema: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    };
  });

  tools.push({
    name: UNSUPPORTED_TOOL,
    description:
      "Use this when the request cannot be carried out with any of the other actions, or when it is too ambiguous to map to one safely.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "A short explanation for the admin, in plain English.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  });

  return tools;
}

const SYSTEM_PROMPT = `You translate a tournament administrator's plain-English instruction into exactly one structured action.

You are given a read-only snapshot of the schedule the administrator is allowed to change. Use it to resolve names, times and fixtures into the concrete ids the actions require.

Rules:
- Always call exactly one tool.
- Only use ids and match references that appear in the snapshot. Never invent one.
- Time slots are integers starting at 0. They are slot indices, not clock times. If the administrator names a clock time that the snapshot does not map to a slot, call ${UNSUPPORTED_TOOL} and say which slot you were unsure about.
- If the instruction is ambiguous, would affect matches you cannot identify with confidence, or asks for something outside the available actions (deleting data, changing results, adding teams), call ${UNSUPPORTED_TOOL} and explain why.
- You are only proposing an action. It will be validated for scheduling conflicts and shown to the administrator for confirmation before anything changes. Do not claim that a change has been made.`;

/**
 * Renders the in-scope schedule compactly. Only ids, fixtures and placements
 * are included — there is no reason to send player names or emails to the
 * model to answer a scheduling question.
 */
function buildScheduleSnapshot(tournaments) {
  if (tournaments.length === 0) return "No tournaments are in scope.";

  return tournaments
    .map((t) => {
      const header = `Tournament "${t.name}" id=${t._id} format=${t.format} courts=${t.numCourts} sportId=${t.sportId || "none"}`;
      const matches = t.matches.map(
        (m) =>
          `  ${m.matchRefId}: ${m.teamA || "TBD"} vs ${m.teamB || "TBD"} | timeSlot=${
            m.timeSlot ?? "unassigned"
          } court=${m.court ?? "unassigned"} status=${m.status}`
      );
      return [header, ...(matches.length ? matches : ["  (no matches generated yet)"])].join(
        "\n"
      );
    })
    .join("\n\n");
}

/**
 * Maps one instruction onto a structured action.
 *
 * @returns { ok: true, raw: { action, args } }
 *        | { ok: false, error, unsupported?: true }
 */
async function interpretCommand({ text, tournaments }) {
  if (!isConfigured()) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY is not set on the server, so natural-language commands are unavailable.",
    };
  }

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system: SYSTEM_PROMPT,
    tools: buildTools(),
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `Current schedule:\n\n${buildScheduleSnapshot(
          tournaments
        )}\n\nAdministrator's instruction:\n${text}`,
      },
    ],
  });

  // A refusal arrives as HTTP 200 with stop_reason "refusal", so check it
  // before reading content.
  if (response.stop_reason === "refusal") {
    return { ok: false, error: "The request was declined by the model's safety system." };
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse) {
    return { ok: false, error: "The model did not return a usable action." };
  }

  if (toolUse.name === UNSUPPORTED_TOOL) {
    return {
      ok: false,
      unsupported: true,
      error:
        toolUse.input?.reason ||
        "That instruction cannot be carried out with the available actions.",
    };
  }

  // Shaped, not trusted: validateAction() re-checks this from scratch.
  return { ok: true, raw: { action: toolUse.name, args: toolUse.input } };
}

module.exports = {
  MODEL,
  UNSUPPORTED_TOOL,
  isConfigured,
  buildTools,
  buildScheduleSnapshot,
  interpretCommand,
  SYSTEM_PROMPT,
};
