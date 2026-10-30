<?php
declare(strict_types=1);

/**
 * The second step of a request that replaces or removes content (docs/server.md "Confirmations"): the first call
 * writes nothing and answers 409 with what would happen and a confirmation id; the same call again with
 * `confirm: <id>` does it. One path for people and AI connections – the import over a book that exists
 * (`Books::import`) and the removal of a spread or an entry with everything on it (`Books::deleteSpread`,
 * `Books::deleteEntry`).
 *
 * An id is `<expires>.<hmac>`: stateless, signed with SECRET over the purpose (what and where), the person, the AI
 * connection (none for a session) and a digest of the state the first answer described. It lasts SECONDS. Anything
 * that changed meanwhile – the rows, another person or token, the time – makes the HMAC differ, so the id is void and
 * the answer is a new description with a new id. The work itself changes the state, so an id works once.
 */
final class Confirmation
{
    /** Seconds a confirmation id lasts */
    public const SECONDS = 600;

    /**
     * Passes when `$confirm` is an id for exactly this purpose, person and state; else 409 with `details()` and a new
     * `confirmation` { id, expiresAt } – `$ask` [code, message] when nothing was sent, `confirmation-void` with
     * `$voidMessage` when an id was sent that does not fit (expired, someone else's, the state changed, not an id).
     * @param array<string, mixed> $user
     * @param array{0: string, 1: string} $ask
     * @param callable(): array<string, mixed> $details what the answer shows (computed only when it is needed)
     */
    public static function require(string $purpose, array $user, string $state, mixed $confirm, array $ask, string $voidMessage, callable $details): void
    {
        $subject = self::subject($purpose, $user, $state);
        if (self::valid($subject, $confirm)) return;
        $answer = $details() + ['confirmation' => self::issue($subject)];
        if ($confirm === null) throw new ApiError(409, $ask[0], $ask[1], $answer);
        throw new ApiError(409, 'confirmation-void', $voidMessage, $answer);
    }

    /** A digest of whatever describes the state a confirmation is bound to */
    public static function digest(mixed $state): string
    {
        return hash('sha256', Editor::encode($state));
    }

    /** @param array<string, mixed> $user */
    private static function subject(string $purpose, array $user, string $state): string
    {
        return implode('|', [$purpose, $user['id'], Auth::token()['id'] ?? '', $state]);
    }

    private static function valid(string $subject, mixed $confirm): bool
    {
        return is_string($confirm) && preg_match('/^(\d{10})\.([0-9a-f]{32})$/', $confirm, $match) === 1 && (int) $match[1] >= time()
            && hash_equals(self::sign($subject, (int) $match[1]), $match[2]);
    }

    /** @return array{id: string, expiresAt: string} */
    private static function issue(string $subject): array
    {
        $expires = time() + self::SECONDS;
        return ['id' => $expires . '.' . self::sign($subject, $expires), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expires)];
    }

    private static function sign(string $subject, int $expires): string
    {
        return substr(hash_hmac('sha256', "$subject|$expires", Config::get('SECRET')), 0, 32);
    }
}
