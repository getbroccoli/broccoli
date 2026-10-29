import { escapeHtml } from "./escapeHtml";

/**
 * Broccoli's email look: the mark, one white card and a footer, in tables and inline styles that
 * mail clients keep, with a dark version for clients that support one. Broccoli's mail relay
 * accepts only emails matching its samples of this layout, so give it new samples first.
 */
export const emailLayout = {
  /** The whole email around `content`, built from the blocks below; `origin` serves the mark. */
  page: ({ origin, content, footer }: { origin: string; content: string; footer: string }) =>
    `<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    `<style>${DARK_STYLE}</style></head>` +
    `<body class="page" style="margin:0;padding:0;background-color:#F7F6F1;">` +
    `<table ${LAYOUT_TABLE} width="100%" class="page" style="background-color:#F7F6F1;"><tr>` +
    `<td align="center" style="padding:40px 16px;">` +
    `<table ${LAYOUT_TABLE} width="100%" style="max-width:560px;">` +
    `<tr><td style="padding:0 0 24px 0;${FONT}">` +
    `<img src="${escapeHtml(origin)}${MARK_PATH}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:7px;">` +
    `<span class="ink" style="vertical-align:middle;padding-left:8px;font-size:15px;font-weight:600;color:#2A2722;">Broccoli</span></td></tr>` +
    `<tr><td class="card" style="background-color:#FFFFFF;border:1px solid #E6E3DC;border-radius:20px;padding:40px 44px;color:#2A2722;${FONT}">${content}</td></tr>` +
    `<tr><td class="muted" style="padding:24px 0 0 0;text-align:center;font-size:12px;line-height:1.6;color:#8C877E;${FONT}">${escapeHtml(footer)}</td></tr>` +
    `</table></td></tr></table></body></html>`,

  /** The company's initial in a square, beside its name. */
  company: (name: string) =>
    `<table ${LAYOUT_TABLE} style="margin:0 0 24px 0;"><tr>` +
    `<td class="badge" width="44" height="44" align="center" style="width:44px;height:44px;border-radius:12px;background-color:#2A2722;color:#FFFFFF;font-size:18px;font-weight:700;">${escapeHtml(initial(name))}</td>` +
    `<td class="ink" style="padding-left:12px;font-size:16px;font-weight:600;color:#2A2722;">${escapeHtml(name)}</td>` +
    `</tr></table>`,

  heading: (text: string) =>
    `<h1 class="ink" style="margin:0 0 10px 0;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#2A2722;">${escapeHtml(text)}</h1>`,

  paragraph: (text: string) =>
    `<p class="soft" style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#5A554D;">${escapeHtml(text)}</p>`,

  /** A personal note in a green box, signed by its author when there is one. */
  note: (text: string, author: string | null) =>
    `<table ${LAYOUT_TABLE} width="100%" style="margin:0 0 24px 0;"><tr>` +
    `<td class="note" style="background-color:#EEF5EF;border-radius:14px;padding:18px 20px;">` +
    `<p class="ink" style="margin:0;font-size:16px;line-height:1.55;color:#2A2722;">“${escapeHtml(text)}”</p>` +
    (author
      ? `<p class="soft" style="margin:10px 0 0 0;font-size:13px;color:#5A554D;">` +
        `<span class="avatar" style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background-color:#5E8B68;color:#FFFFFF;font-size:10px;font-weight:700;text-align:center;vertical-align:middle;">${escapeHtml(initials(author))}</span>` +
        `<span style="vertical-align:middle;padding-left:8px;">${escapeHtml(author)}</span></p>`
      : "") +
    `</td></tr></table>`,

  /** The email's one action, followed by a short line about it. */
  button: (label: string, link: string, hint: string) =>
    `<table ${LAYOUT_TABLE} style="margin:0 0 12px 0;"><tr>` +
    `<td class="button" style="background-color:#2A2722;border-radius:12px;">` +
    `<a class="button-label" href="${escapeHtml(link)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>` +
    `<p class="muted" style="margin:0 0 24px 0;font-size:14px;line-height:1.5;color:#78736A;">${escapeHtml(hint)}</p>`,

  /** The button's link written out, for clients that don't show the button. */
  pasteLink: (link: string) =>
    `<p class="muted rule" style="margin:0;padding-top:24px;border-top:1px solid #E6E3DC;font-size:13px;line-height:1.6;color:#78736A;">Or paste this link:<br>` +
    `<a class="link" href="${escapeHtml(link)}" style="color:#4A7553;word-break:break-all;">${escapeHtml(link)}</a></p>`,
};

/** Where an instance serves the mark, a 56px PNG shown at 28px. */
export const MARK_PATH = "/email/broccoli-mark.png";

const LAYOUT_TABLE = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;
const FONT =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const DARK_STYLE =
  ":root{color-scheme:light dark;supported-color-schemes:light dark;}" +
  "@media (prefers-color-scheme:dark){" +
  ".page{background-color:#1C1B19!important;}" +
  ".card{background-color:#262522!important;border-color:#3A3833!important;}" +
  ".ink,.card{color:#F2F0EA!important;}" +
  ".soft{color:#C9C5BC!important;}" +
  ".muted{color:#A8A399!important;}" +
  ".rule{border-top-color:#3A3833!important;}" +
  ".note{background-color:#2C3A2F!important;}" +
  ".badge,.button{background-color:#F2F0EA!important;color:#1C1B19!important;}" +
  ".button-label{color:#1C1B19!important;}" +
  ".link{color:#A9CDB0!important;}" +
  "}";

function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? "")
    .join("");
}
