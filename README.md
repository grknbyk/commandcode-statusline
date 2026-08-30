# commandcode-statusline

A one-line footer for [commandcode](https://commandcode.ai). It shows the model you are on,
how much context you have burned, what the session has cost, your cache hit rate, the git
branch, and how close you are to a usage limit.

```
Kimi K3 · 147k/1000k · $0.05 · R12 W3 CH98.9% · 5h $0.40/$3.00 (1h59m) · ⎇ main
```

When a limit stops you, the line says when you can work again:

```
Kimi K3 · 147k/1000k · $0.05 · R12 W3 CH98.9% · ⎇ main · 1w exceeded, renews 3d23h
```

When credit is going to expire unused, it says what to spend and by when:

```
Kimi K3 · 147k/1000k · $0.05 · R12 W3 CH98.9% · 1w $4.00/$6.00 (3d23h) · ⎇ main · under pace, spend $2.00 till Sep 3 19:45
```

## Install

```bash
commandcode mods add grknbyk/commandcode-statusline
```

Or copy the file yourself:

```bash
curl -o ~/.commandcode/mods/statusline.ts \
  https://raw.githubusercontent.com/grknbyk/commandcode-statusline/main/index.ts
```

Either way it loads on the next session, or immediately with `/reload`. You do not need a
build step. commandcode compiles the TypeScript at load time.

To try it without installing:

```bash
commandcode --mod ./index.ts
```

## What each segment shows

| Segment | Example | Meaning |
| --- | --- | --- |
| `model` | `Kimi K3` | The model in use. A free model gets a ` free` suffix. |
| `effort` | `[high]` | Reasoning effort. Only appears if the model supports one and it is not `default`. Rides on the model segment, so `model` off hides it too. |
| `context` | `147k/1000k` | Tokens in context against the model's window. |
| `cost` | `$0.05` | What this session has cost, priced from the built-in catalog. Hidden on free models. |
| `cache` | `R12 W3 CH98.9%` | Read tool calls, write tool calls, and the share of input tokens served from cache. |
| usage | `5h $0.40/$3.00 (1h59m)` | The window that runs out of money first. See [Usage windows](#usage-windows). Toggled by `mode`, not by a segment name. |
| block | `1w exceeded, renews 3d23h` | Replaces the usage figure when a limit has stopped you, and says when it lifts. |
| `branch` | `⎇ main` | Current git branch, or `@<sha>` when detached. |
| `pace` | `under pace, spend $2.00 till Sep 3 19:45` | Only when monthly credit is about to expire unused. |

Segments read in that order. A window you can still spend from sits next to the money
figures; anything stopping you reads last, after the branch, where the warnings cluster.

The context figure is the only coloured part of the line: yellow past 20%, orange past 40%,
red past 80%. Everything else stays in the terminal's own foreground.

## Usage windows

commandcode plans have three rolling limits: a 5-hour, a weekly and a monthly one. The
statusline reads them from the billing API every 5 minutes.

While nothing is blocking you, the line shows the window that runs out of money first:

```
5h $0.40/$3.00 (1h59m)
```

Money left decides which window is shown, rather than percentage used. A window at 95% of
$100 still buys more work than one at 40% of $3, and the second is the one that stops you
first.

Once a limit has stopped you, the line drops the money figure and shows the block. Only one
window appears, the one that lifts last:

```
1w exceeded, renews 3d23h
```

Two windows over at once are a single wait. The 5-hour window lifting first buys you nothing
while the weekly is still over. The plan refill caps every reset, since nothing stays barred
past it, so when the plan turns over first the line says that instead:

```
1m exceeded, plan renews 19d23h
```

| Windows over | Line |
| --- | --- |
| 5h | `5h exceeded, renews 1h59m` |
| 1w, or 5h + 1w | `1w exceeded, renews 3d23h` |
| anything including 1m | `1m exceeded, plan renews 19d23h` |
| plan refills before that reset | same label, `plan renews <time>` |

## The pace hint

Monthly credit does not roll over, so anything you leave unspent is gone at the refill and
nothing on the bill points at it. The hint appears only once some of the credit can no longer
be reached:

```
under pace, spend $2.00 till Sep 3 19:45
```

Each weekly window after the current one absorbs a full weekly cap. Whatever they cannot
take has to be spent before the current window resets:

```
need   = monthly credit left − (whole weekly windows left × weekly cap)
target = min(need, weekly cap − spent this week)
```

`need <= 0` means the remaining weeks can still absorb every dollar, and the line stays quiet.
Worked example, with $9.50 left, one whole weekly window to come and $4.00 already spent this
week:

```
need   = 9.50 − 6.00 = 3.50
target = min(3.50, 6.00 − 4.00) = 2.00   →   spend $2.00 till <this window's reset>
```

The hint never appears while you are blocked, because a blocked line already tells you to
stop.

## Commands

`/statusline` on its own prints a card of every setting. Each label on the card is also a word
the command accepts.

```
┌─────────────── DISPLAY ───────────────┐
│ model     ● on     ○ off              │
│ effort    ● on     ○ off              │
│ context   ● on     ○ off              │
│ cost      ● on     ○ off              │
│ cache     ● on     ○ off              │
│ branch    ● on     ○ off              │
│ pace      ● on     ○ off              │
├──────────────── USAGE ────────────────┤
│ mode      ○ hide  ● auto  ○ all       │
│           hide = nothing shown        │
│           auto = blocker or tightest  │
│           all  = every window below   │
│                                       │
│ windows   (needs mode=all)            │
│   5h      ● on     ○ off              │
│   1w      ● on     ○ off              │
│   1m      ● on     ○ off              │
│                                       │
│ type      (needs mode=auto or all)    │
│   ● price    $9.34 / $10.00           │
│   ○ percent  93%                      │
├──────────────── STATE ────────────────┤
│ broken    nothing                     │
└───────────────────────────────────────┘
```

| Command | Effect |
| --- | --- |
| `/statusline` | Print the card. |
| `/statusline model` (or any segment name) | Toggle that segment. |
| `/statusline hide` / `auto` / `all` | Set the usage mode. `mode` cycles through the three. |
| `/statusline 5h` / `1w` / `1m` | Toggle one window. Only visible in `all` mode. |
| `/statusline price` / `percent` | Money or percentage. `type` toggles. |
| `/statusline on` / `off` | Master switch. |
| `/statusline refresh` | Refetch usage and branch now. |

Every change is written to `~/.commandcode/statusline.state.json` and reloaded at startup, so
settings survive a restart. Launch flags (`--mod-option model=false`) are read first and the
state file overrides them.

## When something breaks

A broken segment does not disappear quietly. Whatever failed shows as `⚠ credits` at the end
of the line, and `/statusline` prints the full error text under `broken`. commandcode isolates
a throwing mod into a `mod_error` rather than a crash, so a silent statusline is the only
failure mode worth defending against.

The mod reads `~/.commandcode/auth.json` (or `COMMAND_CODE_API_KEY`) to call
`api.commandcode.ai` for usage. It makes read-only `GET` requests and sends the key nowhere
else.

## Model pricing

Prices live in a table at the top of `index.ts`, in dollars per million tokens. A model that
is not in the table still shows its id and context, but without a cost figure. Pull requests
adding or correcting a model are welcome.

The table is written out rather than fetched because there is nowhere to fetch it from:
`api.commandcode.ai` exposes no models route, the CLI keeps its own price list inside a
minified bundle with no package exports, and the ModApi has no catalog verb.

## Licence

MIT
