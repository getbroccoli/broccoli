# QA: Connect your own agent

A manual check of connecting a person's own agent over MCP against a development stack. Claude and ChatGPT reach only a public HTTPS address; Claude Code and Codex work against `pnpm dev` on the same machine.

## Setup

1. Start the stack and create the owner as in [QA setup](setup.md).
2. Invite a second person with only the Employee profile and accept the invite in another browser profile.

## Connect

- [ ] `claude mcp add --transport http broccoli $URL/api/mcp`, then `/mcp` in Claude Code, opens the browser on sign-in when signed out; signing in leads to "Allow Claude Code to act as you in Broccoli?" with the person's name and email.
- [ ] The Allow page lists "It reads what you can read in Broccoli, as you.", "It never approves anything." and "You can disconnect it at any time on Your agent."
- [ ] "Allow" returns to Claude Code, which shows Broccoli connected; asking "Who am I in Broccoli?" answers with the signed-in person.
- [ ] Asking it to find people lists the same people the People page shows that person, and searching by name narrows the list.
- [ ] "Cancel" returns to Claude Code, which reports that access was denied; nothing is connected.
- [ ] Waiting more than ten minutes on the Allow page, then "Allow", shows "This link has expired".
- [ ] "Not you?" signs out and shows sign-in; signing in as the other person asks them to allow the agent.

## One agent per person

- [ ] With Claude Code connected, `codex mcp add broccoli --url $URL/api/mcp` and `codex mcp login broccoli` show "This replaces Claude Code, connected …" on the Allow page.
- [ ] After "Allow", Codex answers, and Claude Code's next call is refused and asks to sign in again.
- [ ] The second person connecting their agent does not end the first person's connection.

## Endings

- [ ] Resetting the person's password by email ends the connection: the agent's next call is refused.
- [ ] Signing out in the browser does not end the connection: the agent keeps answering.

## Your agent page

- [ ] "Your agent" is in the menu for every signed-in person, and its page shows the address the browser is on plus `/api/mcp`, with Copy.
- [ ] On a self-hosted instance, a note says to open Broccoli at the address the agent will use and names `SELF_HOSTED_PUBLIC_URL`.
- [ ] The Claude, ChatGPT and "Claude Code, Codex or another client" tabs show their steps; each command's Copy copies it with this address.
- [ ] Following the Claude Code tab connects it; coming back to the window shows the agent, "Connected …· Last active …" and a dot on the menu item.
- [ ] "Disconnect", then "Disconnect" in the confirm, shows "You disconnected Claude Code."; the agent's next call is refused.
- [ ] After a password reset by email and signing in again, the page says the agent was disconnected when the password was reset.
- [ ] At phone width the tabs scroll sideways, and the address and Copy stay on one line.

## Managed sign-in

On a managed workspace created through the website (with the QA mock providers):

- [ ] Signed out, connecting an agent as the owner leads to "Sign in with email"; signing in returns to the Allow page, not My tasks.
