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
 * `{ groups?, notes?, folds? }` – authoring data the draft and the export carry and a publish leaves out
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

    /** A canvas `{ groups?, notes?, folds? }`; 400 `$code` */
    public static function canvas(mixed $canvas, string $path, string $code): void
    {
        $fail = static fn(string $message) => throw new ApiError(400, $code, $message);
        if (!$canvas instanceof stdClass) $fail("$path must be { groups?, notes?, folds? }.");
        foreach (get_object_vars($canvas) as $key => $list) {
            if (!in_array($key, ['groups', 'notes', 'folds'], true)) $fail("$path.$key: unknown field of a canvas (groups, notes, folds).");
            if (!is_array($list)) $fail("$path.$key must be a list.");
            foreach ($list as $i => $item) {
                $ok = match ($key) {
                    'groups' => $item instanceof stdClass && is_string($item->id ?? null) && $item->id !== '' && is_string($item->label ?? null)
                        && is_array($item->members ?? null) && array_filter($item->members, static fn($m) => !is_string($m)) === [],
                    'notes' => $item instanceof stdClass && is_string($item->id ?? null) && $item->id !== '' && is_string($item->text ?? null)
                        && (is_int($item->x ?? null) || is_float($item->x ?? null)) && (is_int($item->y ?? null) || is_float($item->y ?? null)),
                    default => is_string($item) && $item !== '',
                };
                if (!$ok) $fail("{$path}.{$key}[$i] must be " . ['groups' => '{ id, label, members }', 'notes' => '{ id, text, x, y }', 'folds' => 'a node id'][$key] . '.');
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
