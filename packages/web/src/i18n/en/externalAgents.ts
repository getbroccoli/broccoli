/** The owner's own coding agent connecting on the import step. */
export const externalAgentsEn = {
  "externalAgents.title": "Your agent",
  "externalAgents.codeOnce": "The code works once, for 2 hours.",
  "externalAgents.waitingShort": "Waiting for your agent…",
  "externalAgents.notConnected": "No agent is connected.",
  "externalAgents.codeExpires": "Its code works until {time}.",
  "externalAgents.newPrompt": "Get a new prompt on Setup AI",
  "externalAgents.replacesConnected": "A new prompt ends {client}'s session.",
  "externalAgents.ways": "How your agent gets the files",
  "externalAgents.masked": "Masked rows",
  "externalAgents.recommended": "Recommended",
  "externalAgents.maskedHint":
    "Drop the files on the next page; your agent maps them. It sees names, emails and other personal details only as placeholders.",
  "externalAgents.parsed": "Your agent reads them",
  "externalAgents.parsedHint":
    "For PDFs and unusual layouts. Your agent reads the original files, so their personal data goes to its model provider.",
  "externalAgents.showPrompt": "Show the prompt",
  "externalAgents.creating": "Making a code…",
  "externalAgents.sentence":
    "Help me set up Broccoli. Read {origin}/api/agent/skill and connect with code {code}.",
  "externalAgents.copy": "Copy",
  "externalAgents.copied": "Copied",
  "externalAgents.maskedFolder": "Paste it into your agent in any folder.",
  "externalAgents.parsedFolder": "Paste it into your agent in the folder with your staff files.",
  "externalAgents.connected": "{client} is connected",
  "externalAgents.connectedMasked": "Maps files from masked rows",
  "externalAgents.connectedParsed": "Reads your files itself",
  "externalAgents.lastCall": "Last call {time}",
  "externalAgents.noCallYet": "No call yet",
  "externalAgents.endsAt": "Session ends at {time}",
  "externalAgents.disconnect": "Disconnect",
  "externalAgents.disconnecting": "Disconnecting…",
  "externalAgents.failed": "Couldn’t reach Broccoli. Try again.",
  "externalAgents.unsafeOrigin": "Your agent needs Broccoli on https or on this computer.",
  "externalAgents.goToAgent": "To import files, go to your agent",
  "externalAgents.goToAgentHint":
    "It reads the staff files in its folder and sends their people here. Files dropped here can’t reach it.",
  "externalAgents.disclosure":
    "To read the columns, your agent sees the first rows of each file with names, emails and other personal details replaced by placeholders.",
  "externalAgents.askToContinue": "Dropped files after your agent finished? Ask it to continue.",
} as const;
