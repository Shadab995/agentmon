# AgentMon (MVP)

Har Claude Code session ek chhota creature ban jaata hai jo Chrome ke har page ke bottom pe ghoomta hai.
Jab Claude ko permission chahiye, pet uchhalta hai. Click karo aur wahi se **Allow / Always / Deny** do.
Kaam karte karte pet XP kamata hai aur **evolve** hota hai (3 stages).

- 6 original creature families x 3 evolution stages (Fire, Water, Leaf, Volt, Stone, Shade)
- Status capsule: Thinking, "Editing Summary.tsx", "Allow Bash?", Your turn, Done
- Pet card: command/file preview, Allow / Always / Deny, last reply, XP bar, HP bar (context window kitna bacha)
- Desktop notification with Allow / Deny buttons, toolbar badge
- Roam ya Gather mode, rename, despawn, collection (dex) in the popup
- Sab kuch local: ek chhota helper `127.0.0.1` pe. Koi account nahi, koi cloud nahi

## Setup (2 minute)

Node.js 18+ chahiye.

```bash
# 1. zip unzip karo, folder me jao, installer chalao
cd agentmon
node bin/agentmon.js init
```

Ye kya karta hai:
- files `~/.agentmon` me copy karta hai
- ek random token ke saath `~/.agentmon/config.json` banata hai
- `~/.claude/settings.json` me hooks add karta hai (pehle `settings.json.agentmon-backup` banata hai, aapke existing hooks waise hi rehte hain)
- helper start karta hai (macOS pe login pe auto-start hota hai)

```text
# 2. Chrome me extension load karo (sirf ek baar)
chrome://extensions  ->  Developer mode ON  ->  Load unpacked  ->  ~/.agentmon/extension
```

3. Extension pin karo aur Claude Code start karo. Pehla prompt bhejte hi pehla pet hatch hoga.

### Bina Claude Code ke try karna hai?

```bash
node ~/.agentmon/bin/agentmon.js demo
```

Teen fake pets aate hain, do evolve hote hain, aur ek `npm run deploy` ki permission maangta hai. Chrome me pet pe click karke jawab do.

Browser me sirf UI dekhna ho to `demo/standalone.html` kholo (koi install nahi chahiye).

## Commands

```bash
node ~/.agentmon/bin/agentmon.js status      # helper + pets ki list
node ~/.agentmon/bin/agentmon.js start       # helper start (Linux/Windows pe reboot ke baad)
node ~/.agentmon/bin/agentmon.js stop
node ~/.agentmon/bin/agentmon.js restart
node ~/.agentmon/bin/agentmon.js demo [--keep] [--clear]
node ~/.agentmon/bin/agentmon.js uninstall [--purge]
node ~/.agentmon/bin/agentmon.js run         # foreground me (debugging ke liye)
```

Linux pe auto-start chahiye to: `node bin/agentmon.js init --autostart` (systemd user service).

## Kaise kaam karta hai

```text
Claude Code ──hooks──▶ daemon/hook.js ──HTTP──▶ AgentMon helper (127.0.0.1:47333) ◀──long-poll── Chrome extension
                                                                                                   ├─ background.js  (state, badge, notifications)
                                                                                                   └─ content script (pets on every tab)
```

| File | Kaam |
| --- | --- |
| `daemon/hook.js` | Claude Code har event pe ise chalata hai. Normal events fire-and-forget hain (`async: true`, agent slow nahi hota). `PermissionRequest` pe ye pet ke jawab ka wait karta hai aur Claude Code ko decision JSON deta hai. |
| `daemon/server.js` | Zero-dependency Node server. Sessions, XP, evolution, context HP, permission holds. |
| `extension/background.js` | Helper ko long-poll karta hai, state `chrome.storage` me daalta hai, notifications/badge. |
| `extension/ui.js` | Pets, capsules, card. Shadow DOM me render hota hai taaki page ka CSS na toote. |
| `extension/creatures.js` | Saare creatures SVG me, code se bante hain. Naye creatures yahin add karo. |
| `bin/agentmon.js` | Installer + CLI. |

**Permission flow:** Claude Code `PermissionRequest` hook chalata hai, helper request ko hold karta hai, pet uchhalta hai. Aap Allow dabao to hook `{"behavior":"allow"}` lautata hai. "Always" Claude Code ke apne `permission_suggestions` ko `updatedPermissions` me wapas bhejta hai, to rule save ho jaata hai. Terminal ka prompt bhi chalta rehta hai; terminal me jawab doge to pet ka request khud clear ho jaata hai. Chrome band ho to hook turant hat jaata hai aur sab normal terminal flow se chalta hai.

**XP:** har tool call +1, har complete turn +3. Stage 2 at 20 XP, stage 3 at 60 XP.
**HP:** transcript ke last usage se approx context window kitna bacha hai.

## Security

- Helper sirf `127.0.0.1` pe sunta hai aur har request pe `config.json` ka secret token maangta hai.
- Websites helper ko call nahi kar sakti (custom header + CORS preflight reject + Origin check + Host check against DNS rebinding).
- Pets closed shadow root me hain aur Allow/Deny sirf real (trusted) click maante hain, to koi page script approve nahi kar sakti.

## Config (`~/.agentmon/config.json`)

| Key | Default | Matlab |
| --- | --- | --- |
| `port` | `47333` | helper ka port (`init --port N` se badlo) |
| `permissionHoldSeconds` | `570` | pet kitni der tak jawab ka wait kare |
| `contextWindow` | `0` | `0` = auto (200k, ya usage 200k se upar ho to 1M). Fixed value bhi de sakte ho. |

Badalne ke baad `agentmon restart`.

## Apne creatures banana

`extension/creatures.js` me `FAMILIES` me ek entry aur `FEATURES` me ek painter function add karo.
Notification icons ke liye PNG dobara banao: `npm i -D sharp && npm run build:assets`.

> Note: official Pokémon characters, naam ya sprites mat daalna agar ye product bechna/publish karna hai. Ye creatures original hain isliye safe hain.

## Abhi kya nahi hai (next steps)

- Codex / OpenCode support (dono me hooks/plugins hain, `hook.js` jaisa adapter chahiye)
- Browser se Claude ko reply bhejna (Stop hook + `decision: "block"` se possible hai)
- Chrome Web Store listing, license key (Dodo Payments / Lemon Squeezy), landing page
- Windows auto-start

## Uninstall

```bash
node ~/.agentmon/bin/agentmon.js uninstall --purge
```

Sirf AgentMon ke hooks hat-te hain, aapke baaki settings aur hooks waise hi rehte hain. Phir `chrome://extensions` se extension remove karo.

## Troubleshooting

- **Pets nahi dikh rahe:** popup kholo. "Not running" dikhe to `agentmon start`. `chrome://` pages aur Web Store pe extensions nahi chalte.
- **"Token mismatch":** `init` dobara chalaya ho to `chrome://extensions` me AgentMon ko reload karo.
- **Hook errors Claude Code me:** `/hooks` command se check karo; Node path badla ho (nvm) to `init` dobara chalao.
- Logs: `~/.agentmon/daemon.log`
