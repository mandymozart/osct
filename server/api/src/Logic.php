<?php
declare(strict_types=1);

/**
 * Rules without code as the API takes them (content schema 5.0, #334 – shared/types/behaviour.ts, logic.ts, address.ts):
 * a node's `behaviour` component, a scene's `logic` (`PUT …/scenes/{sid}`), the experience's `logic`
 * (`PUT …/logic`) and an imported configuration's. The checks are the **shapes**: a rule `{ on, when?, do }` with a text
 * `on` (empty is allowed – the editor leaves it empty while an author rewires; the Logic view lists it), a text `when`
 * (the object form of 2.19–4.x is refused: since 5.0 a condition is an expression – the expression's own syntax is the
 * TypeScript guard's and the editor's job), one known verb per action, a `goto` to `scene:<id>`, and in a scene's or the
 * experience's rules a node named by address (`target:<targetId>/<node name>`) and no node event. A `canvas` is
 * `{ groups?, notes?, folds?, exposed?, positions? }` – authoring data the draft and the export carry and a publish leaves out
 * (`ContentVersion::assemble`).
 */
final class Logic
{
    /** shared/types/behaviour.ts `BEHAVIOUR_ACTIONS` */
    public const ACTIONS = ['play', 'pause', 'stop', 'show', 'hide', 'set', 'emit', 'goto'];
    /** `BEHAVIOUR_NODE_ACTIONS`: the verbs that act on a node */
    public const NODE_ACTIONS = ['play', 'pause', 'stop', 'show', 'hide'];
    /** `BEHAVIOUR_NODE_EVENTS`: a node's own events – a node's rules only */
    public const NODE_EVENTS = ['found', 'lost', 'tap', 'unlocked'];
    /** `RULE_HOMES` */
    public const HOMES = ['entity', 'scene', 'experience'];
    /** shared/types/variables.ts `VARIABLE_TYPES` */
    public const VARIABLE_TYPES = ['number', 'integer', 'boolean', 'string'];
    /** shared/types/behaviour.ts `BEHAVIOUR_SCOPES` */
    public const SCOPES = ['scene', 'stage', 'session', 'experience'];
    /** shared/types/address.ts: a goto's address, a node's address */
    public const GOTO_ADDRESS = '^scene:[A-Za-z0-9_-]{1,64}$';
    public const NODE_ADDRESS = '^target:[A-Za-z0-9_-]{1,64}(/.*)?$';

    /**
     * A scene's or the experience's `logic` → itself; 400 `$code` naming the first problem
     */
    public static function check(mixed $value, string $home, string $path = 'logic', string $code = 'invalid-logic'): stdClass
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!$value instanceof stdClass) $fail("$path must be { rules, canvas? }.");
        foreach (array_keys(get_object_vars($value)) as $key) {
            if (!in_array($key, ['rules', 'canvas'], true)) $fail("$path.$key: unknown field of logic (rules, canvas).");
        }
        self::rules($value->rules ?? null, $home, "$path.rules", $code);
        if (property_exists($value, 'canvas')) self::canvas($value->canvas, "$path.canvas", $code);
        return $value;
    }

    /** A list of rules of a home (`entity`, `scene`, `experience`); 400 `$code` naming the first problem */
    public static function rules(mixed $rules, string $home, string $path, string $code): void
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!is_array($rules)) $fail("$path must be a list of rules { on, when?, do }.");
        $own = $home === 'entity';
        foreach ($rules as $i => $rule) {
            $at = "{$path}[$i]";
            if (!$rule instanceof stdClass) $fail("$at must be a rule { on, when?, do }.");
            foreach (array_keys(get_object_vars($rule)) as $key) {
                if (!in_array($key, ['on', 'when', 'do'], true)) $fail("$at.$key: unknown field of a rule (on, when, do).");
            }
            if (!is_string($rule->on ?? null)) $fail("$at.on must be an event's name.");
            if (!$own && in_array($rule->on, self::NODE_EVENTS, true)) {
                $fail("$at.on: $rule->on is a node's own event – a $home's rule hears the bus (a scene event or a core event such as targetFound).");
            }
            if (property_exists($rule, 'when') && !is_string($rule->when)) {
                $fail("$at.when must be an expression (hasKey && tries > 2) – the object form is gone since content schema 5.0.");
            }
            if (!property_exists($rule, 'do')) $fail("$at.do: a rule needs an action or a list of actions.");
            $actions = is_array($rule->do) ? $rule->do : [$rule->do];
            foreach ($actions as $j => $action) self::action($action, $own, $home, is_array($rule->do) ? "$at.do[$j]" : "$at.do", $code);
        }
    }

    private static function action(mixed $action, bool $own, string $home, string $at, string $code): void
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (is_string($action)) {
            if (!in_array($action, self::NODE_ACTIONS, true)) $fail("$at: \"$action\" is no action (" . implode(', ', self::NODE_ACTIONS) . ' or { verb: … }).');
            if (!$own) $fail("$at: $action alone acts on the rule's own node – a $home's rule names one: { $action: target:<targetId>/<node name> }.");
            return;
        }
        if (!$action instanceof stdClass) $fail("$at must be an action { " . implode(' | ', self::ACTIONS) . ': … }.');
        $verbs = array_values(array_intersect(array_keys(get_object_vars($action)), self::ACTIONS));
        if (count($verbs) !== 1) $fail("$at: an action has one of " . implode(', ', self::ACTIONS) . '.');
        $verb = $verbs[0];
        $value = $action->$verb;
        if ($verb === 'set') {
            // A value is an expression (content schema 5.0, B2): its source as text, or a bare number or true / false; null deletes
            if (!$value instanceof stdClass || get_object_vars($value) === []) $fail("$at.set must be { variable: value, … }.");
            foreach (get_object_vars($value) as $name => $v) {
                if (!preg_match('/^[a-z][a-zA-Z0-9]{0,39}$/', (string) $name)) $fail("$at.set.$name: not a variable name (camelCase letters and digits).");
                if ($v !== null && !is_string($v) && !is_bool($v) && !is_int($v) && !is_float($v)) $fail("$at.set.$name must be an expression, a number, true / false or null.");
            }
            if (property_exists($action, 'scope') && !in_array($action->scope, self::SCOPES, true)) $fail("$at.scope must be one of " . implode(', ', self::SCOPES) . '.');
            return;
        }
        if ($verb === 'goto') {
            if (!is_string($value) || !preg_match('#' . self::GOTO_ADDRESS . '#', trim($value))) $fail("$at.goto must be an address scene:<id>.");
            return;
        }
        if (in_array($verb, self::NODE_ACTIONS, true)) {
            $node = $verb === 'play' ? ($action->node ?? null) : $value;
            if ($verb === 'play' && !is_string($value)) $fail("$at.play must be a clip's name (empty = the node's own clip).");
            if ($own) {
                if ($node !== null && $node !== true && !is_string($node)) $fail("$at: a node is named by its name in the subtree.");
            } elseif (!is_string($node) || !preg_match('#' . self::NODE_ADDRESS . '#s', trim($node))) {
                $fail("$at: a $home's rule names a node by address target:<targetId>/<node name>.");
            }
        }
    }

    /**
     * The experience's typed variables (content schema 5.0, B7, shared/types/variables.ts): name → `{ type, scope?, default? }`,
     * a default of the type (an integer where a number is asked is fine); 400 `$code`
     */
    public static function variables(mixed $value, string $path = 'variables', string $code = 'invalid-variables'): stdClass
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!$value instanceof stdClass) $fail("$path must be { name: { type, scope?, default? }, … }.");
        foreach (get_object_vars($value) as $name => $declaration) {
            $at = "$path.$name";
            if (!preg_match('/^[a-z][a-zA-Z0-9]{0,39}$/', (string) $name)) $fail("$at: not a variable name (camelCase letters and digits).");
            if (!$declaration instanceof stdClass) $fail("$at must be { type, scope?, default? }.");
            foreach (array_keys(get_object_vars($declaration)) as $key) {
                if (!in_array($key, ['type', 'scope', 'default'], true)) $fail("$at.$key: unknown field of a variable (type, scope, default).");
            }
            $type = $declaration->type ?? null;
            if (!in_array($type, self::VARIABLE_TYPES, true)) $fail("$at.type must be one of " . implode(', ', self::VARIABLE_TYPES) . '.');
            if (property_exists($declaration, 'scope') && !in_array($declaration->scope, self::SCOPES, true)) $fail("$at.scope must be one of " . implode(', ', self::SCOPES) . '.');
            if (property_exists($declaration, 'default')) {
                $d = $declaration->default;
                $fits = match ($type) {
                    'boolean' => is_bool($d), 'string' => is_string($d), 'integer' => is_int($d),
                    default => is_int($d) || (is_float($d) && is_finite($d)),
                };
                if (!$fits) $fail("$at.default must be a value of type $type.");
            }
        }
        return $value;
    }

    /**
     * A canvas `{ groups?, notes?, folds?, exposed?, positions? }` (`exposed`: box id → port ids, schema 5.1; `positions`: box
     * id → `{ x, y }`, a group's `colour` `#rrggbb` and `folded`, schema 5.2; a note's `author`, `box` and `view`, schema 5.3);
     * 400 `$code`
     */
    public static function canvas(mixed $canvas, string $path, string $code): void
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!$canvas instanceof stdClass) $fail("$path must be { groups?, notes?, folds?, exposed?, positions? }.");
        foreach (get_object_vars($canvas) as $key => $list) {
            if (!in_array($key, ['groups', 'notes', 'folds', 'exposed', 'positions'], true)) $fail("$path.$key: unknown field of a canvas (groups, notes, folds, exposed, positions).");
            if ($key === 'positions') {
                if (!$list instanceof stdClass) $fail("$path.positions must be { <box id>: { x, y } }.");
                $number = static fn($v) => is_int($v) || (is_float($v) && is_finite($v));
                foreach (get_object_vars($list) as $box => $point) {
                    $ok = (string) $box !== '' && $point instanceof stdClass && $number($point->x ?? null) && $number($point->y ?? null);
                    if (!$ok) $fail("$path.positions.$box must be { x, y }.");
                }
                continue;
            }
            if ($key === 'exposed') {
                if (!$list instanceof stdClass) $fail("$path.exposed must be { <box id>: [port ids] }.");
                foreach (get_object_vars($list) as $box => $ports) {
                    $ok = (string) $box !== '' && is_array($ports) && array_filter($ports, static fn($p) => !is_string($p) || $p === '') === [];
                    if (!$ok) $fail("$path.exposed.$box must be a list of port ids.");
                }
                continue;
            }
            if (!is_array($list)) $fail("$path.$key must be a list.");
            foreach ($list as $i => $item) {
                $ok = match ($key) {
                    'groups' => $item instanceof stdClass && is_string($item->id ?? null) && $item->id !== '' && is_string($item->label ?? null)
                        && is_array($item->members ?? null) && array_filter($item->members, static fn($m) => !is_string($m)) === []
                        && (!property_exists($item, 'colour') || (is_string($item->colour) && preg_match('/^#[0-9a-fA-F]{6}$/', $item->colour) === 1))
                        && (!property_exists($item, 'folded') || is_bool($item->folded)),
                    'notes' => $item instanceof stdClass && is_string($item->id ?? null) && $item->id !== '' && is_string($item->text ?? null)
                        && (is_int($item->x ?? null) || is_float($item->x ?? null)) && (is_int($item->y ?? null) || is_float($item->y ?? null))
                        && array_diff(array_keys(get_object_vars($item)), ['id', 'text', 'x', 'y', 'author', 'box', 'view']) === []
                        && array_filter(['author', 'box', 'view'], static fn($k) => property_exists($item, $k) && (!is_string($item->$k) || $item->$k === '')) === [],
                    default => is_string($item) && $item !== '',
                };
                if (!$ok) $fail("{$path}.{$key}[$i] must be " . ['groups' => '{ id, label, members, colour?: #rrggbb, folded?: true | false }', 'notes' => '{ id, text, x, y, author?, box?, view? }', 'folds' => 'a node id'][$key] . '.');
            }
        }
    }

    /** The behaviour components of a node tree checked (`Editor::entity` calls it per node); 400 `$code` */
    public static function components(mixed $components, string $path, string $code = 'invalid-entity'): void
    {
        if (!is_array($components)) return;
        foreach ($components as $i => $component) {
            if ($component instanceof stdClass && ($component->type ?? null) === 'behaviour' && property_exists($component, 'rules')) {
                self::rules($component->rules, 'entity', "{$path}[$i].rules", $code);
            }
        }
    }

    /** A scene's or the experience's object without its logic's canvas (in place) – a reader's configuration never carries it */
    public static function withoutCanvas(mixed $holder): void
    {
        if ($holder instanceof stdClass && ($holder->logic ?? null) instanceof stdClass) unset($holder->logic->canvas);
    }
}
