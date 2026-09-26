<?php
declare(strict_types=1);

/**
 * Sign-in by email, no password (Tilman 2026-09-27): the reader enters the address, gets an email with a
 * link and a 6-digit code, and confirming either one signs in the device. The first confirmation creates
 * the account with the options chosen in the form (double opt-in). Tokens and codes are stored as hashes.
 */
final class Auth
{
    /** The sign-up options (the progress is always kept – it can be reset in the app) */
    public const OPTIONS = ['bookUpdates' => 'book_updates', 'publisherUpdates' => 'publisher_updates'];

    /** POST /auth/request { email, language?, options? } → 202 { requestId, expiresAt } */
    public static function request(array $body): never
    {
        $email = self::email($body['email'] ?? null);
        $language = is_string($body['language'] ?? null) && LoginMail::isLanguage($body['language']) ? $body['language'] : 'en';
        $options = self::options($body['options'] ?? [], true);
        $secret = self::secret();
        $ipHash = hash_hmac('sha256', Http::clientIp(), $secret);

        // Housekeeping: requests are only needed while they can be confirmed (and for the hourly limits)
        Db::run('DELETE FROM login_requests WHERE created_at < :before', ['before' => Db::now(-86400)]);
        $hourAgo = Db::now(-3600);
        if ((int) Db::value('SELECT COUNT(*) FROM login_requests WHERE email = :email AND created_at > :since', ['email' => $email, 'since' => $hourAgo]) >= Config::int('LOGIN_MAX_PER_EMAIL_HOUR')
            || (int) Db::value('SELECT COUNT(*) FROM login_requests WHERE ip_hash = :ip AND created_at > :since', ['ip' => $ipHash, 'since' => $hourAgo]) >= Config::int('LOGIN_MAX_PER_IP_HOUR')) {
            throw new ApiError(429, 'too-many-requests', 'Too many emails requested – try again later.');
        }

        $id = Db::uuid();
        $token = self::randomToken();
        $code = sprintf('%06d', random_int(0, 999999));
        $ttl = Config::int('LOGIN_TTL_MINUTES') * 60;
        Db::run(
            'INSERT INTO login_requests (id, email, token_hash, code_hash, language, book_updates, publisher_updates, ip_hash, created_at, expires_at)
             VALUES (:id, :email, :token, :code, :language, :bu, :pu, :ip, :created, :expires)',
            ['id' => $id, 'email' => $email, 'token' => hash('sha256', $token), 'code' => self::codeHash($id, $code),
             'language' => $language, 'bu' => (int) $options['bookUpdates'],
             'pu' => (int) $options['publisherUpdates'], 'ip' => $ipHash, 'created' => Db::now(), 'expires' => Db::now($ttl)]
        );

        $isNew = Db::value('SELECT id FROM accounts WHERE email = :email', ['email' => $email]) === null;
        $link = Http::appUrl() . '/about?login=' . $token;
        $mail = LoginMail::compose($language, $link, $code, $isNew ? $options : null);
        try {
            Mailer::send($email, $mail['subject'], $mail['text'], $mail['html']);
        } catch (Throwable $error) {
            Db::run('DELETE FROM login_requests WHERE id = :id', ['id' => $id]);
            error_log('[osct] mail failed: ' . $error->getMessage());
            throw new ApiError(502, 'mail-failed', 'The email could not be sent.');
        }

        // The same answer for new and existing addresses
        Http::json(202, ['requestId' => $id, 'expiresAt' => gmdate('c', time() + $ttl)]);
    }

    /**
     * POST /auth/verify { token } (the link) or { requestId, code } → 200 { session, account, created }
     */
    public static function verify(array $body): never
    {
        $token = $body['token'] ?? null;
        $byLink = is_string($token) && $token !== '';
        if ($byLink) {
            $request = Db::one('SELECT * FROM login_requests WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
            if (!$request) throw new ApiError(400, 'invalid-link', 'This link is not valid.');
        } else {
            $requestId = $body['requestId'] ?? null;
            $code = is_string($body['code'] ?? null) ? preg_replace('/\D/', '', $body['code']) : '';
            if (!is_string($requestId) || $code === '') throw new ApiError(400, 'invalid-code', 'Code missing.');
            $request = Db::one('SELECT * FROM login_requests WHERE id = :id', ['id' => $requestId]);
            if (!$request) throw new ApiError(400, 'invalid-code', 'This code is not valid.');
        }
        if ($request['used_at'] !== null) throw new ApiError(410, 'already-used', 'This link or code was used already.');
        if ($request['expires_at'] < Db::now()) throw new ApiError(410, 'expired', 'This link or code has expired.');
        if (!$byLink) {
            if ((int) $request['attempts'] >= Config::int('LOGIN_MAX_ATTEMPTS')) {
                throw new ApiError(429, 'too-many-attempts', 'Too many wrong codes – request a new email.');
            }
            if (!hash_equals($request['code_hash'], self::codeHash($request['id'], $code))) {
                Db::run('UPDATE login_requests SET attempts = attempts + 1 WHERE id = :id', ['id' => $request['id']]);
                throw new ApiError(400, 'invalid-code', 'This code is not valid.');
            }
        }

        [$account, $created, $session] = Db::transaction(function () use ($request) {
            // Only one confirmation per request, also when link and code race
            $used = Db::run('UPDATE login_requests SET used_at = :now WHERE id = :id AND used_at IS NULL', ['now' => Db::now(), 'id' => $request['id']]);
            if ($used->rowCount() !== 1) throw new ApiError(410, 'already-used', 'This link or code was used already.');

            $account = Db::one('SELECT * FROM accounts WHERE email = :email', ['email' => $request['email']]);
            $created = false;
            if (!$account) {
                // A new account takes the options of the form; an existing one keeps its own
                $id = Db::uuid();
                $now = Db::now();
                Db::run(
                    'INSERT INTO accounts (id, email, language, book_updates, publisher_updates, created_at, confirmed_at, updated_at)
                     VALUES (:id, :email, :language, :bu, :pu, :now, :now2, :now3)',
                    ['id' => $id, 'email' => $request['email'], 'language' => $request['language'],
                     'bu' => $request['book_updates'], 'pu' => $request['publisher_updates'], 'now' => $now, 'now2' => $now, 'now3' => $now]
                );
                $account = Db::one('SELECT * FROM accounts WHERE id = :id', ['id' => $id]);
                $created = true;
            }
            $session = self::randomToken();
            Db::run(
                'INSERT INTO sessions (id, account_id, token_hash, created_at, last_used_at) VALUES (:id, :account, :hash, :now, :now2)',
                ['id' => Db::uuid(), 'account' => $account['id'], 'hash' => hash('sha256', $session), 'now' => Db::now(), 'now2' => Db::now()]
            );
            return [$account, $created, $session];
        });

        Http::json(200, ['session' => $session, 'account' => Accounts::toJson($account), 'created' => $created]);
    }

    /** POST /auth/logout → 204 (this device only) */
    public static function logout(): never
    {
        $token = Http::bearerToken();
        if ($token !== null) Db::run('DELETE FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        Http::json(204, null);
    }

    /**
     * The signed-in account (Bearer token), else 401. Sessions end after SESSION_TTL_DAYS without use.
     * @return array<string, mixed>
     */
    public static function account(): array
    {
        $token = Http::bearerToken();
        if ($token === null) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        $session = Db::one('SELECT * FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        if (!$session) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        if ($session['last_used_at'] < Db::now(-86400 * Config::int('SESSION_TTL_DAYS'))) {
            Db::run('DELETE FROM sessions WHERE id = :id', ['id' => $session['id']]);
            throw new ApiError(401, 'unauthorized', 'Session expired.');
        }
        if ($session['last_used_at'] < Db::now(-3600)) {
            Db::run('UPDATE sessions SET last_used_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $session['id']]);
        }
        $account = Db::one('SELECT * FROM accounts WHERE id = :id', ['id' => $session['account_id']]);
        if (!$account) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        return $account;
    }

    /**
     * The options object from a request: known keys, booleans only
     * @return array<string, bool>
     */
    public static function options(mixed $value, bool $withDefaults): array
    {
        $options = [];
        foreach (array_keys(self::OPTIONS) as $key) {
            if (is_array($value) && array_key_exists($key, $value)) {
                if (!is_bool($value[$key])) throw new ApiError(400, 'invalid-options', "Option $key must be true or false.");
                $options[$key] = $value[$key];
            } elseif ($withDefaults) {
                $options[$key] = true; // all on by default (Tilman)
            }
        }
        return $options;
    }

    private static function email(mixed $value): string
    {
        $email = is_string($value) ? strtolower(trim($value)) : '';
        if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(400, 'invalid-email', 'This email address is not valid.');
        }
        return $email;
    }

    private static function codeHash(string $requestId, string $code): string
    {
        return hash_hmac('sha256', "$requestId:$code", self::secret());
    }

    private static function secret(): string
    {
        $secret = Config::get('SECRET');
        if (strlen($secret) < 32) throw new RuntimeException('SECRET is missing or shorter than 32 characters');
        return $secret;
    }

    private static function randomToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
