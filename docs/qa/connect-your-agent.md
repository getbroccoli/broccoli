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
- [ ] On a self-hosted instance, a line under the address says agents work only at the address they connected to, with a link to set `SELF_HOSTED_PUBLIC_URL`.
- [ ] The Claude, ChatGPT and "Claude Code or Codex" tabs show their steps; each command's Copy copies it with this address.
- [ ] Following the Claude Code tab connects it; while the agent's Allow is chosen, Your agent (left open, not focused) turns to the agent, "Connected …· Last active …" and a dot on the menu item within a second.
- [ ] With Your agent open in two tabs, Disconnect in one turns the other to "You disconnected Claude Code." within a second.
- [ ] With Your agent open, a password reset in another browser turns it to "Claude Code was disconnected when your password was reset." within a second.
- [ ] After the network drops and comes back (DevTools offline, then online), a Disconnect made meanwhile shows without a reload.
- [ ] Within an hour of connecting, the card opens with "Claude Code is connected. Nice."; × hides it. Each "Try asking" chip copies its prompt, and pasting it into a new session of the agent gets an answer (Codex loads Broccoli's tools only in a session started after login).
- [ ] Connected with no call since the page opened, "What Claude Code is doing" shows "Nothing yet. Ask Claude Code something and watch it happen here." with the prompt chips inside a dashed box.
- [ ] With Your agent open and not focused, asking the agent "Who is my manager in Broccoli?" adds "Looked you up" at the top of the list within a second, sliding in with a brief green flash; a search adds "Searched people · N found", never the name searched for. Times tick ("12 seconds ago").
- [ ] A refused call (such as `find_people` with an invalid `after`) shows "Searched people" with a grey "Refused" badge.
- [ ] More calls than fit scroll inside the list, which stops at about 340 px; the page itself does not grow.
- [ ] Reloading the page starts the list empty again: only calls made while the page is open show.
- [ ] "Show history" adds, in the same box, a sticky "Earlier · last 30 days" divider and the calls from before the page opened: date and time, label, a "Refused" or "Didn’t work" badge when not answered, and the agent's name. Calls of an agent that was disconnected or replaced since show with its name.
- [ ] With more than 30 earlier calls, scrolling to the end of the box loads the next ones; "Hide history" removes the earlier lines and keeps the live ones.
- [ ] Under reduced motion (DevTools rendering, `prefers-reduced-motion: reduce`), new lines appear without sliding, flashing or the Live dot pulsing.
- [ ] "Disconnect", then "Disconnect" in the confirm, shows "You disconnected Claude Code."; the agent's next call is refused.
- [ ] After a password reset by email and signing in again, the page says the agent was disconnected when the password was reset.
- [ ] At phone width the tabs scroll sideways, and the address and Copy stay on one line.

## Other pages

- [ ] With People open and not focused, each call of the agent rises within a second as a small green bubble beside the dot on Your agent in the menu, with the same label as the list; each leaves after about 4 seconds.
- [ ] Several calls in a row stack upward, newest at the bottom and older ones fainter; at most three show.
- [ ] A refused call's bubble has dark text.
- [ ] The bubbles never block a click or take focus, and a screen reader does not read them.
- [ ] No bubble shows on Your agent, in Settings, at phone width or under reduced motion.

## Managed sign-in

On a managed workspace created through the website (with the QA mock providers):

- [ ] Signed out, connecting an agent as the owner leads to "Sign in with email"; signing in returns to the Allow page, not My tasks.
