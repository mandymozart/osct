# Basic nodes in the core: constants, math, conditions, strings, vectors, flow (#334)

Tilman, 2026-11-20: *"auch fehlt uns ein konzept von basic nodes, die werte setzen koennen zum beispiel – dazu brauchen
wir ein kleines concept um zu sehen was in der core als nodes constants, vectors, conditionals, strings etc. was so
haeufig verwendete node sein muessten."*

This note belongs with the logic concept (`2026-11-20-logic-nodes-shared-concept.md`). It relies on its §5.9 (ports come
from the specs; the typing follows the market leaders) and on L1 (documents are the truth). Status: a proposal. The
decisions B1–B6 at the end are Tilman's.

## 1 · What the established editors have as basic nodes

| Family | Blender (geometry / shader nodes) | Unreal Blueprints | TouchDesigner | Houdini VOPs | ComfyUI |
|---|---|---|---|---|---|
| Constants | Value, Integer, Boolean, String, Vector, Color | literals on pins, Make Literal | Constant CHOP | Constant | Primitive |
| Math | Math (add … power, min, max, clamp, round, abs, sin), Map Range | + − × ÷, Clamp, Lerp, Abs, Round, Min/Max | Math CHOP | Add, Multiply, Fit | – |
| Compare and logic | Compare, Boolean Math (and, or, not) | ==, <, AND, OR, NOT | Logic CHOP | Compare, And/Or | – |
| Choice | Switch, Mix | Select, **Branch** (flow) | Switch | Switch, Two Way Switch | – |
| Strings | String, Join Strings, Value to String, String Length | Append, Format Text, To String | Text DAT | – | String |
| Vectors | Combine XYZ, Separate XYZ, Vector Math | Make Vector, Break Vector | – | Vector to Float, Float to Vector | – |
| Random | Random Value | Random Float in Range | Noise, Random | Random | Seed |
| Flow and time | (none: evaluation is pure) | Sequence, Delay, Do Once, Gate, FlipFlop, For Each | Timer, Count, Trigger, LFO | – | – |

**Two kinds stand out in every editor:**
- **Pure value nodes:** constant, math, compare, logic, choice, string, vector, random. They have no state; their output
  is a function of their inputs. Unreal calls them *pure* (no exec pin).
- **Flow and time nodes:** sequence, delay, once, gate, flip-flop, counter, timer. They have state or timing; Unreal
  gives them an exec pin.

## 2 · How they land in OSCT's documents (L1)

**Pure value nodes are a view of an expression.** OSCT already has one expression language (`shared/text/expressions.ts`,
SCUTOONS'), and with L-T5 a rule's `when` becomes an expression string. A chain of value nodes is exactly that
expression's syntax tree: `Compare(Variable tries, >, Constant 2)` **is** `tries > 2`. So:

- **No storage of its own.** Wiring value nodes into a field (`when`, a `set` value, later a component param from §5.9)
  writes **one expression** into that field. The projection reads the expression and draws its tree as boxes. The parser
  already gives the tree (`Expr`: num, str, bool, name, call, unary, binary), with spans, so the round trip is exact.
- **Folding.** A whole expression can be shown folded as one box with its text (`tries > 2`), and unfolded into its nodes.
  This is Blender's node group / Houdini's subnet. Large conditions stay readable.
- **Typing in or wiring are the same edit.** You can type the expression in the Inspector or wire it on the canvas: the
  field holds the same text. This is the deck's text view (TOML) beside its graph.

**Flow and time nodes need runtime semantics**, and each one maps to a small piece of the rule grammar rather than to a
graph node of its own:

| Node (Unreal / TouchDesigner) | In OSCT's rules | Needs |
|---|---|---|
| Branch | a rule's `when` | exists |
| Sequence | the order of a rule's `do` | exists |
| Counter | `set tries = tries + 1` | **`set` with an expression value** (B2) |
| Do Once | a rule with `once: true`, or a variable test | a rule field (B5) |
| Delay | an action `wait` (ms) between actions, or `after` on an action | engine (B5) |
| Gate / FlipFlop | a variable plus two rules | nothing: a template (L-T16) |
| Timer | a core event (`tick`, `after:<ms>`) | engine, later |
| Random | `random(1, 6)` in an expression | functions (B3) |
| LFO / tween | animate a value over time | engine, later (tier 3) |

## 3 · The proposed core set

**Tier 1 – pure value nodes, all compiling to expressions** (with L-T5 or right after it):

| Node | Ports | Expression |
|---|---|---|
| Constant (number, boolean, string) | out: value | `2`, `true`, `"door"` |
| Variable | out: value (get); in: value (set, through a rule) | `hasKey` (exists) |
| Math | in a, b; out | `a + b`, `-`, `*`, `/`, `%` (exist); `min`, `max`, `clamp`, `round`, `floor`, `abs` (B3) |
| Compare | in a, b; out boolean | `==`, `!=`, `<`, `<=`, `>`, `>=` (exist) |
| Logic | in a, b; out boolean | `&&`, `||`, `!` (exist) |
| Switch (select) | in condition, a, b; out | `if(c, a, b)` (B3 – the language has no ternary today) |
| String | in parts; out string | `"Seite " + n` (exists, by `+`); `format` later |
| Random | in min, max; out number | `random(min, max)` (B3) |
| Map range | in value, from, to; out | `map(v, a, b, c, d)` (B3, Blender's Map Range) |

**Tier 1b – vectors, without a vector type** (B4): **Combine XYZ** and **Separate XYZ**, as in Blender. A vector param
(a node's position, rotation, scale) shows three number inlets, and a combine node wires one expression into each. The
expression language stays scalar (`ExprValue` = string, number, boolean), so there is no vector arithmetic for now.
Colour works the same way with RGB(A).

**Tier 2 – flow and time, in the rule grammar** (B5): `set` with an expression value (counter), `once` on a rule, a
`wait` action. Gate, flip-flop and toggle are templates (L-T16), not core nodes.

**Tier 3 – later:** timer events, LFO, tween / animate a value, curves (TouchDesigner's CHOP family). These are engine
work and get their own tickets when a scene needs them.

## 4 · Checks against the rest

- **SCUTOONS:** it is the same expression language (L5). New functions (`min`, `clamp`, `random`, `if` …) must be
  added in both of its engines (TS and PHP, kept in step by fixtures) or agreed in #702 first. Its VN events already use
  `if: {expr}` and `setVariable` (set / add), which match B2.
- **Texts:** entries already evaluate `{…}` expressions. Every new function works in texts too, which is a gain (one
  language).
- **Random in a reader:** it needs a defined seed per session for reproducible tests (ComfyUI's seed).
- **The guard:** an expression field is checked by parsing it and naming unknown variables or functions, as texts are
  today (`unknown-function`).

## 5 · Type purity: nodes refuse wrong values (Tilman, 2026-11-20)

Tilman: *"und wie wir in js die annotation nutzen um typen rein zu bleiben, dass heisst nodes muessen falsche werte
ablehnen."* The established editors are strict here. Blender colours sockets by type and refuses or converts a wire
visibly. Unreal refuses a wire between incompatible pins, or inserts a **visible conversion node**. Houdini's VOPs are
typed. OSCT follows them at four points:

1. **Every port has a type**, from the spec (§5.9 of the logic concept): `number`, `integer`, `boolean`, `string`,
   `file` / `media`, `colour`, `node`, `scene`, `event`, with ranges and choices where the spec has them (`min`, `max`,
   `options`). In a plugin's JavaScript the type comes from the spec object or from JSDoc (`@param {number} volume 0..1`,
   `@event ended`). The plugin-API typings (`.d.ts`) let the code editor check a plugin against it. The content build
   records it in `registered`, and the guard checks it.
2. **Connecting refuses a type mismatch.** Only the inlets that take the dragged type light up (as since L-T4), and the
   refusal says why (*"volume takes a number 0–1, not a string"*). There is no silent coercion: a conversion is a visible
   node (**To string**, **To number**, **To boolean**), Unreal's way.
3. **An expression is type-checked before it is saved.** The parser's tree gives each node a type: a compare gives a
   boolean, `&&` needs booleans, `-` needs numbers, `+` is numbers or strings but not mixed. A `when` must be a boolean;
   a `set` value must fit the variable's type; a param value must fit the param's type and range. A wrong expression is
   refused with the reason, in the Inspector as on the canvas. Texts (`{…}` in entries) keep their loose display rules.
4. **Variables get a type.** Today a variable is untyped: any rule may set any scalar. For purity, a variable is
   **declared** once (name, type, scope, default) or **inferred** from its first set. A set or a test of another type is
   a problem at that rule. The declarations live with the experience (`experience.variables`), next to the experience
   rules. This is a contract change, so it belongs in the MAJOR (B7).
5. **The engine checks too.** A value that reaches a node at reading time with the wrong type (from a plugin's
   `api.vars.set`, say) is refused there with a console warning instead of being used: the value stays as it was. The
   guard, the editor and the engine use the one type table from `shared/`.

## 6 · Decisions for Tilman

| # | Decision | Recommendation |
|---|---|---|
| B1 | Pure value nodes are a view of an expression in a field (no storage of their own), foldable into one box | yes |
| B2 | **`set` takes an expression value** (`set tries = tries + 1`), so counters need no special node. It changes the rule contract, so it belongs **in the running L-T5 MAJOR** | yes, now in L-T5 |
| B3 | Functions in the expression language: `min`, `max`, `clamp`, `round`, `floor`, `abs`, `random`, `if`, `map` – agreed with SCUTOONS (#702) | yes; a MINOR after L-T5 (adding functions skips nothing) |
| B4 | Vectors and colours as combine / separate nodes over scalar fields, no vector type in the language | yes, for now |
| B5 | Flow in the rule grammar: `once` on a rule, a `wait` action; gate and flip-flop as templates | `once` and `wait` in L-T5 if cheap, otherwise a MINOR after it |
| B6 | Tier 3 (timers, LFO, tween) only when a scene needs it | yes |
| B7 | **Typed variables:** declared in `experience.variables` (name, type, scope, default) or inferred from the first set; a set or a test of another type is a problem. A contract change, so **in the running L-T5 MAJOR** | yes, now in L-T5 |
| B8 | Strict types on ports and in logic expressions: connecting refuses a mismatch, conversion only through visible nodes, expressions are type-checked before saving, the engine refuses wrong values at runtime | yes |
