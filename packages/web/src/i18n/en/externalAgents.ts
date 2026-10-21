/** The owner's external agent connecting on the import step. */
export const externalAgentsEn = {
  "externalAgents.filesLine":
    "Staff lists and exports fill in what your tools don’t know. Connect your agent first; it maps the files for you.",
  "externalAgents.connectTitle": "Connect your agent",
  "externalAgents.connectHint":
    "Paste this into Claude Code, Codex or another agent. Then drop your files here. Your agent sees names, emails and other personal details only as placeholders.",
  "externalAgents.creating": "Making a code…",
  "externalAgents.sentence":
    "Help me set up Broccoli. Read {origin}/api/external-agent/skill and connect with code {code}.",
  "externalAgents.copy": "Copy prompt",
  "externalAgents.copied": "Copied",
  "externalAgents.waiting":
    "Waiting for your agent. Paste the prompt in any folder; the code works once, for 2 hours.",
  "externalAgents.failed": "Couldn’t reach Broccoli. Try again.",
  "externalAgents.unsafeOrigin": "Your agent needs Broccoli on https or on this computer.",
  "externalAgents.retry": "Try again",
  "externalAgents.connected": "{client} connected",
  "externalAgents.disconnect": "Disconnect",
  "externalAgents.disconnectFailed": "Couldn’t disconnect your agent. Try again.",
  "externalAgents.disclosure":
    "To read the columns, your agent sees the first rows of each file with names, emails and other personal details replaced by placeholders.",
  "externalAgents.askToContinue": "Dropped files after your agent finished? Ask it to continue.",
} as const;
