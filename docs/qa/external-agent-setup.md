# QA: Setup with your own agent

A manual check of the owner's coding agent mapping staff files during self-hosted setup, on a
development stack and with a real agent. The API's end-to-end tests play a scripted agent; this
checks what they cannot: the page, and how a real agent follows the skill.

## Setup

1. Run `pnpm dev` with a fresh development database and follow [setup](setup.md) up to naming the
   company.
2. Have Claude Code and Codex installed, and make an empty folder for each run.
3. Keep `fixtures/external-agent-setup/sentinels.txt` and `expected.json` out of the agents' folders.

## Setup AI and the import step

- [ ] On Setup AI, "Your agent" reads "Let Claude Code, Codex or another agent do the setup. You
      connect it on the next step." and shows nothing else when selected.
- [ ] After "Continue", "Add your files" shows "Connect your agent" with the prompt and no click:
      "Help me set up Broccoli. Read http://localhost:…/api/external-agent/skill and connect with
      code …" with a 43-character code on a dark block, a copy button (its check after copying) and
      "Waiting for your agent. Paste the prompt in any folder; the code works once, for 2 hours."
      There is no drop zone yet.
- [ ] Opened at a plain-http address other than localhost (such as the machine's LAN address), the
      box says "Your agent needs Broccoli on https or on this computer." with "Try again".
- [ ] Once the agent connects, a pill beside "Add your files" shows it ("Claude Code connected" with
      a "C" mark, "Codex connected" with "Cx", any other name with a terminal icon), the prompt
      goes, and the drop zone shows.
- [ ] Dropping a PDF is refused: "not a CSV or Excel (.xlsx) file". A dropped CSV shows "Waiting
      for your agent" with "Remove" and no "Retry".
- [ ] The pill's menu "Disconnect" brings the prompt back with a new code; dropped files stay.
- [ ] Choosing "Broccoli AI" on Setup AI afterwards turns a waiting file's action into "Read with
      Broccoli", which reads it with the model.

## Agent run (Claude Code, then Codex)

1. Copy the prompt and paste it into the agent in an empty folder. Once the pill shows it, drop the
   files of `fixtures/external-agent-setup/folder/` and the file in
   `fixtures/external-agent-setup/drop/`, and ask the agent to continue if it already finished.

- [ ] The agent connects within a few seconds and the pill shows it.
- [ ] It lists and answers each file; the cards turn "N people · Mapped by your agent". Its reply
      counts the people per file, sends no link and asks nothing, and it keeps waiting.
- [ ] Drop another file while it waits: the card shows "Your agent hasn't picked up …" with
      "Broccoli has new files. Map them and send their people back." and the footer "Waiting for
      your agent…", until within seconds the row reads "Your agent is picking it up…" with a
      spinner, the card goes, and the file is mapped, without you doing anything.
- [ ] Stop the agent, then drop a file: the card stays. Paste its prompt into the agent: it maps
      the file and the card goes.
- [ ] **Privacy:** search the run's transcript (Claude Code `~/.claude/projects/<folder>/*.jsonl`,
      Codex `~/.codex/sessions/…`) for every line of `sentinels.txt`, decoded as the model saw it:
      none appears, and no tool call opened a file. This is evidence for this run, not proof for every
      agent.
- [ ] Review matches `expected.json` for those files. `tricky.csv`'s instruction changed nothing
      beyond its own mapping: the agent read nothing outside the page's questions.
- [ ] Asked to "approve the import", the agent says it cannot; any attempt is refused.
- [ ] "Disconnect", then ask the agent to continue: it says the session ended and that "Add your
      files" has a new prompt, without a link.
- [ ] If Codex's sandbox blocks the network, the agent asks to allow network access for the run.

## Approve

- [ ] With review open, drop another file in a second tab and let the agent map it, then "Add N people": the page says "Your
      people changed while you were reviewing. Check them, then add them again." and reloads; the next
      "Add N people" adds everyone shown.
