# Acceptance pass 2 «как игрок» — final build (mode/ui after main + plaza merge)

Same rules, setup and report format as the first pass: read
`.superpowers/sdd/2026-10-11-unified-ui/acceptance-brief.md` first, then `acceptance-report.md` (what the first pass found).
The first pass was cut short (phone never checked, several 1440 shots never viewed). This time do the WHOLE walk.

What changed since the first pass (all in `mode/ui`, worktree `/Users/tired/Desktop/game-opus-ui`):
- main merged in: **the new embankment** «Новая набережная» behind server flag `PLAZA3`, protocol 17, Fight Club removed.
  Start the server WITH it: `PORT=3138 DATA_DIR=$(mktemp -d) FISH2=1 ISLE=1 PLAZA3=1 node server/main.ts --dev`.
  The plaza HUD (badge, chat dock, voice, tiles, top-centre, signs/prompts) must sit well on the new plaza: nothing over the
  new buildings' prompts, no old-style leftovers. `docs/plaza3/README.md` says where things are on the new plaza.
- New kit windows: Примерочная (kiosk), Музыкальный автомат, gift code inside the wardrobe, lighthouse photo card + «3, 2, 1».
  Wardrobe item pictures are being added right now (files `client/assets/ui/icons/wd-*.webp`); if they appear mid-walk,
  reload once and shoot the wardrobe again.
- Fixes to re-verify: mode plates hidden while the Esc menu is open (fort break, paintball, hide, skill); fort shop shows all
  9 rows at 1440×900; farm chat dock in the corner; fishing drink tile only on the plaza; fishing journal marks are pictures;
  login card with a 16-char nick keeps «!» with the nick; catch card line «ещё N видов — и …»; «Выше облаков» altitude nick
  label inside the plate; farm tree prompt now says «доска фермы».

Walk: everything in the first brief's list, plus the new windows above, at 1440×900; then 2560×1440 for plaza, Esc menu,
fishing reel, fort wave, wardrobe, login card, one loading screen; then the phone smoke (375×812 touch) — boots, plaza HUD,
Esc menu, one mode in and out, wardrobe opens and closes. Interface sounds 20× click.

Port 3138 / Chrome debug 9138, one reused profile, own PIDs only, `~/.Trash` instead of `rm`, python3 broken — node,
no production login, never the nick «Проверка». Do not edit repo files. Do not call `mcp__hearthbot__` tools.

Report: `.superpowers/sdd/2026-10-11-unified-ui/acceptance2-report.md` — defects table (blocker / should-fix / polish,
where, what, shot, likely file), what you could not reach, and **the 6 best showcase shots** (plaza 1440 on the new
embankment, plaza 2560, Esc menu, fishing reel, fort wave, wardrobe) with paths — only defect-free ones, and look at each.
Return only: counts per severity, the report path, anything that blocked you.
