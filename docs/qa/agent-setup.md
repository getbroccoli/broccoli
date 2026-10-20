# QA: Setup with your own agent

A manual check of the owner's coding agent mapping staff files during self-hosted setup, on a
development stack and with a real agent. The API's end-to-end tests play a scripted agent; this
checks what they cannot: the page, and how a real agent follows the skill.

## Setup

1. Run `pnpm dev` with a fresh development database and follow [setup](setup.md) up to naming the
   company.
2. Have Claude Code and Codex installed. Copy `fixtures/agent-setup/folder/` to a new folder for
   each parsed run, and make an empty folder for each masked run.
3. Keep `fixtures/agent-setup/sentinels.txt` and `expected.json` out of the agents' folders.

## Setup AI and the import step

- [ ] Under "Your agent", Setup AI offers "Masked rows" (Recommended) and "Your agent reads them"
      with their hints, and "Show the prompt". It shows "Help me set up Broccoli. Read
      http://localhost:…/api/agent/skill and connect with code …" with a 43-character code, "Copy" (then
      "Copied") and "The code works once, for 2 hours." Changing the way hides the prompt; showing it
      again makes a new code. With an agent connected, it warns that a new prompt ends its session.
- [ ] Opened at a plain-http address other than localhost (such as the machine's LAN address),
      "Show the prompt" says "Your agent needs Broccoli on https or on this computer."
- [ ] After "Continue", the import step shows "Waiting for your agent… Its code works until …" and
      "Get a new prompt on Setup AI"; the drop zone shows for "Masked rows" and "To import files, go to
      your agent" for the other way.
- [ ] Dropping a PDF is refused: "not a CSV or Excel (.xlsx) file". A dropped CSV shows "Waiting
      for your agent" with "Remove" and no "Retry".
- [ ] Choosing "Broccoli AI" on Setup AI afterwards turns a waiting file's action into "Read with
      Broccoli", which reads it with the model.

## Masked run (Claude Code, then Codex)

1. On Setup AI choose "Masked rows", "Show the prompt", copy it and "Continue". Drop the CSV and
   Excel files of `fixtures/agent-setup/folder/` and the file in `fixtures/agent-setup/drop/`, then
   paste the prompt into the agent in an empty folder.

- [ ] The agent connects within a few seconds: the panel shows "<client> is connected · Maps files
      from masked rows · …" with "Disconnect".
- [ ] It lists and answers each file; the cards turn "N people · Mapped by your agent". Its reply
      counts the people per file and points to `/setup/import`.
- [ ] **Privacy:** search the run's transcript (Claude Code `~/.claude/projects/<folder>/*.jsonl`,
      Codex `~/.codex/sessions/…`) for every line of `sentinels.txt`, decoded as the model saw it:
      none appears, and no tool call opened a file. This is evidence for this run, not proof for every
      agent.
- [ ] Review matches `expected.json` for those files. `tricky.csv`'s instruction changed nothing
      beyond its own mapping: the agent read nothing outside the page's questions.
- [ ] Asked to "approve the import", the agent says it cannot; any attempt is refused.
- [ ] "Disconnect", then ask the agent to continue: it says the session ended and that the page
      offers a new prompt on Setup AI.

## Parsed run (Claude Code, then Codex)

1. "Get a new prompt on Setup AI", choose "Your agent reads them", "Show the prompt", "Continue",
   and paste it into the agent in a fresh copy of `fixtures/agent-setup/folder/`.

- [ ] The agent reads every file, `contractors.pdf` included, and the cards show "N people · Parsed
      by your agent". Review matches `expected.json`.
- [ ] The sentinel search now finds the names: the owner chose to let the agent read the files.
- [ ] If Codex's sandbox blocks the network, the agent asks to allow network access for the run.

## Approve

- [ ] With review open, let the agent add another file, then "Add N people": the page says "Your
      people changed while you were reviewing. Check them, then add them again." and reloads; the next
      "Add N people" adds everyone shown.
