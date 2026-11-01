<?php
declare(strict_types=1);

/**
 * Sign-in by email: the reader enters the address, gets an email with a link and a 6-digit code, and
 * confirming either one signs in the device. The first confirmation creates the user with the options chosen
 * in the form (double opt-in). Tokens and codes are stored as hashes. A user may add a password later
 * (Passwords); the email sign-in keeps working either way.
 *
 * Where the session lives (docs/server.md "Sessions, cookies and CSRF", #207): a browser asks for it as a cookie
 * (`"session": "cookie"` in the sign-in's body) – an HttpOnly, SameSite=Strict cookie on the API's path that no
 * script on the page can read – and sends the CSRF token it was given in `X-CSRF-Token` with every write. Any other
 * client (the MCP server's sign-in pair, scripts) gets the token in the answer and sends `Authorization: Bearer`, as do
 * the AI connections' tokens (ApiTokens), which never come from a cookie.
 */
final class Auth
{
    /** The browser session's cookie – one for the whole site: the reader and the editor share the sign-in */
    public const COOKIE = 'osct_session';

    /** The header a cookie session's writes carry the CSRF token in */
    public const CSRF_HEADER = 'X-CSRF-Token';

    /** The session row of a request that signed in by cookie (its CSRF token is answered by GET /user) */
    private static ?array $cookieSession = null;

    /** The sign-up options (the progress is always kept – it can be reset in the app) */
    public const OPTIONS = ['bookUpdates' => 'book_updates', 'artistUpdates' => 'artist_updates', 'publisherUpdates' => 'publisher_updates'];

    /**
     * The hourly limit on emails per address / per IP: seconds until the next request is allowed, 0 = allowed now.
     * A limit of -1 means no limit (local testing – `config.local.php.example`).
     */
    private static function retryAfter(string $column, string $value, string $setting): int
    {
        $limit = Config::limit($setting);
        if ($limit === PHP_INT_MAX) return 0;
        $hourAgo = Db::now(-3600);
        $count = (int) Db::value("SELECT COUNT(*) FROM login_requests WHERE $column = :value AND created_at > :since", ['value' => $value, 'since' => $hourAgo]);
        if ($count < $limit) return 0;
        // The window opens again when the oldest request in it is an hour old
        $oldest = (string) Db::value("SELECT MIN(created_at) FROM login_requests WHERE $column = :value AND created_at > :since", ['value' => $value, 'since' => $hourAgo]);
        return max(1, (int) strtotime($oldest . ' UTC') + 3600 - time());
    }

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
        $retryAfter = max(self::retryAfter('email', $email, 'LOGIN_MAX_PER_EMAIL_HOUR'), self::retryAfter('ip_hash', $ipHash, 'LOGIN_MAX_PER_IP_HOUR'));
        if ($retryAfter > 0) {
            $minutes = (int) ceil($retryAfter / 60);
            header('Retry-After: ' . $retryAfter);
            throw new ApiError(429, 'too-many-requests', "Too many emails requested – try again in $minutes " . ($minutes === 1 ? 'minute' : 'minutes') . '.', ['retryAfter' => $retryAfter]);
        }

        $id = Db::uuid();
        $token = self::randomToken();
        $code = sprintf('%06d', random_int(0, 999999));
        $ttl = Config::int('LOGIN_TTL_MINUTES') * 60;
        Db::run(
            'INSERT INTO login_requests (id, email, token_hash, code_hash, language, book_updates, artist_updates, publisher_updates, ip_hash, created_at, expires_at)
             VALUES (:id, :email, :token, :code, :language, :bu, :au, :pu, :ip, :created, :expires)',
            ['id' => $id, 'email' => $email, 'token' => hash('sha256', $token), 'code' => self::codeHash($id, $code),
             'language' => $language, 'bu' => (int) $options['bookUpdates'],
             'au' => (int) $options['artistUpdates'], 'pu' => (int) $options['publisherUpdates'], 'ip' => $ipHash, 'created' => Db::now(), 'expires' => Db::now($ttl)]
        );

        $isNew = Db::value('SELECT id FROM users WHERE email = :email', ['email' => $email]) === null;
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
     * POST /auth/verify { token } (the link) or { requestId, code }, `session: "cookie"` from a browser →
     * 200 { session, user, created } – a browser gets { csrfToken, user, created } and the cookie instead (sessionAnswer)
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
            if ((int) $request['attempts'] >= Config::limit('LOGIN_MAX_ATTEMPTS')) {
                throw new ApiError(429, 'too-many-attempts', 'Too many wrong codes – request a new email.');
            }
            if (!hash_equals($request['code_hash'], self::codeHash($request['id'], $code))) {
                Db::run('UPDATE login_requests SET attempts = attempts + 1 WHERE id = :id', ['id' => $request['id']]);
                throw new ApiError(400, 'invalid-code', 'This code is not valid.');
            }
        }

        [$user, $created, $session] = Db::transaction(function () use ($request) {
            // Only one confirmation per request, also when link and code race
            $used = Db::run('UPDATE login_requests SET used_at = :now WHERE id = :id AND used_at IS NULL', ['now' => Db::now(), 'id' => $request['id']]);
            if ($used->rowCount() !== 1) throw new ApiError(410, 'already-used', 'This link or code was used already.');

            $user = Db::one('SELECT * FROM users WHERE email = :email', ['email' => $request['email']]);
            $created = false;
            if (!$user) {
                // A new user takes the options of the form; an existing one keeps its own
                $id = Db::uuid();
                $now = Db::now();
                Db::run(
                    'INSERT INTO users (id, email, language, book_updates, artist_updates, publisher_updates, created_at, confirmed_at, updated_at)
                     VALUES (:id, :email, :language, :bu, :au, :pu, :now, :now2, :now3)',
                    ['id' => $id, 'email' => $request['email'], 'language' => $request['language'],
                     'bu' => $request['book_updates'], 'au' => $request['artist_updates'], 'pu' => $request['publisher_updates'], 'now' => $now, 'now2' => $now, 'now3' => $now]
                );
                Roles::grant($id, Roles::READER, 'signup');
                $user = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $id]);
                $created = true;
            }
            return [$user, $created, self::createSession($user['id'], 'email')];
        });

        Http::json(200, self::sessionAnswer($session, $body) + ['user' => Users::toJson(Roles::grantConfigured($user)), 'created' => $created]);
    }

    /**
     * POST /auth/logout → 204 (this device only). A Bearer session ends as before; the cookie session ends like any
     * write of it – with the CSRF token (403 `csrf` without) – and the cookie is cleared. A cookie whose session is gone
     * is cleared too.
     */
    public static function logout(): never
    {
        $token = Http::bearerToken();
        if ($token !== null) {
            Db::run('DELETE FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        } elseif (Http::cookie(self::COOKIE) !== null) {
            try {
                [, $session] = self::signedIn();
            } catch (ApiError $error) {
                if ($error->status !== 401) throw $error;
                $session = null; // already gone: signedIn cleared the cookie
            }
            if ($session !== null) {
                Db::run('DELETE FROM sessions WHERE id = :id', ['id' => $session['id']]);
                self::clearCookie();
            }
        }
        Http::json(204, null);
    }

    /**
     * POST /auth/cookie with `Authorization: Bearer <session token>` → 200 { user, csrfToken } and the session cookie.
     * TEMPORARY (#207, remove in a later release – MEMORY): the one-time move of a session token that a browser kept in
     * localStorage before the cookie into the cookie, so nobody signed in is thrown out by the update. The session row
     * stays (its sign-in method and time), its token is replaced: the stored one stops working at once. Bearer only (401
     * without one); an AI connection's token gets 403 `not-for-ai` – those never become a cookie.
     */
    public static function exchange(): never
    {
        if (Http::bearerToken() === null) throw new ApiError(401, 'unauthorized', 'Send the stored session token as Authorization: Bearer.');
        [$user, $session] = self::session();
        $token = self::randomToken();
        Db::run('UPDATE sessions SET token_hash = :hash, last_used_at = :now WHERE id = :id',
            ['hash' => hash('sha256', $token), 'now' => Db::now(), 'id' => $session['id']]);
        self::replaceCookie($token);
        Http::json(200, ['user' => Users::toJson($user), 'csrfToken' => self::csrfToken($session)]);
    }

    /**
     * How a sign-in hands out its new session (`$token`): a browser asks for the cookie with `"session": "cookie"` in
     * the body and gets `csrfToken` – the token itself is in no answer a script could read; any other client (the MCP
     * server's sign-in pair, scripts, readers' apps from before #207) gets `session`, the token for `Authorization: Bearer`.
     * @return array<string, string>
     */
    public static function sessionAnswer(string $token, array $body): array
    {
        if (($body['session'] ?? null) !== 'cookie') return ['session' => $token];
        $row = Db::one('SELECT * FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        if (!$row) throw new RuntimeException('The new session is missing');
        self::replaceCookie($token);
        return ['csrfToken' => self::csrfToken($row)];
    }

    /**
     * The CSRF token of a session: an HMAC of the session's id with SECRET – bound to the session, nothing stored. A
     * browser keeps it in memory and sends it in `X-CSRF-Token` with every write; another site can neither read it nor
     * forge it.
     * @param array<string, mixed> $session
     */
    public static function csrfToken(array $session): string
    {
        return rtrim(strtr(base64_encode(hash_hmac('sha256', 'csrf:' . $session['id'], self::secret(), true)), '+/', '-_'), '=');
    }

    /** This request's CSRF token when it signed in by cookie (after `user()`), else null – GET /user answers it */
    public static function csrf(): ?string
    {
        return self::$cookieSession === null ? null : self::csrfToken(self::$cookieSession);
    }

    /**
     * A write (anything but GET / HEAD / OPTIONS) of a cookie session needs the session's CSRF token in `X-CSRF-Token`,
     * else 403 `csrf`. Defence in depth: a browser that names the request's site (`Sec-Fetch-Site`) must name it
     * `same-origin` – the cookie is SameSite=Strict, but a sibling subdomain counts as the same site for that.
     * @param array<string, mixed> $session
     */
    private static function checkCsrf(array $session): void
    {
        if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $site = Http::header('Sec-Fetch-Site');
        if ($site !== '' && $site !== 'same-origin') throw new ApiError(403, 'csrf', 'This request came from another site.');
        $given = Http::header(self::CSRF_HEADER);
        if ($given === '' || !hash_equals(self::csrfToken($session), $given)) {
            throw new ApiError(403, 'csrf', 'The CSRF token is missing or wrong – reload the page.');
        }
    }

    /** Sets the session cookie; the session this browser's cookie held before ends (one cookie, one session) */
    private static function replaceCookie(string $token): void
    {
        $previous = Http::cookie(self::COOKIE);
        if ($previous !== null && $previous !== $token) Db::run('DELETE FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $previous)]);
        setcookie(self::COOKIE, $token, self::cookieOptions(86400 * Config::int('SESSION_TTL_DAYS')));
    }

    private static function clearCookie(): void
    {
        setcookie(self::COOKIE, '', self::cookieOptions(0));
    }

    /**
     * HttpOnly (no script reads it), SameSite=Strict (no other site's request carries it), Secure (on every instance
     * but a local one over plain http), on the API's path only (`/api` – the app's pages never send it), Max-Age = the
     * session's lifetime (renewed as the session is used). Strict suffices: every request that needs the session is a
     * `fetch` from the site's own pages – the email link opens the reader, which then confirms with a `fetch`.
     * @return array<string, mixed>
     */
    private static function cookieOptions(int $maxAge): array
    {
        $path = rtrim((string) ($GLOBALS['osctApiBase'] ?? '/api'), '/');
        return [
            'expires' => $maxAge > 0 ? time() + $maxAge : 1,
            'path' => $path === '' ? '/' : $path,
            'secure' => Config::env() !== 'local' || Http::isHttps(),
            'httponly' => true,
            'samesite' => 'Strict',
        ];
    }

    /**
     * A new session for this device; returns the token (only its hash is stored).
     * `$method`: how the device signed in – `email` (link or code) or `password`.
     */
    public static function createSession(string $userId, string $method): string
    {
        $session = self::randomToken();
        Db::run(
            'INSERT INTO sessions (id, user_id, token_hash, method, created_at, last_used_at) VALUES (:id, :user, :hash, :method, :now, :now2)',
            ['id' => Db::uuid(), 'user' => $userId, 'hash' => hash('sha256', $session), 'method' => $method, 'now' => Db::now(), 'now2' => Db::now()]
        );
        return $session;
    }

    /** The token of an AI connection this request came with (ApiTokens), null for a session */
    private static ?array $token = null;

    /**
     * The signed-in user (the session cookie, or a Bearer token: a session, or an AI connection's token – ApiTokens),
     * else 401; a cookie session's write without its CSRF token 403 `csrf`.
     * @return array<string, mixed>
     */
    public static function user(): array
    {
        return self::signedIn()[0];
    }

    /**
     * The signed-in user and this device's session row – the person's own sign-in only: an AI connection's token gets
     * 403 `not-for-ai` (its tokens, the password, deleting the account). Without a valid token 401.
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    public static function session(): array
    {
        [$user, $session] = self::signedIn();
        if ($session === null) {
            throw new ApiError(403, 'not-for-ai', 'Not with an AI connection\'s token – this needs the person\'s own sign-in in the editor.');
        }
        return [$user, $session];
    }

    /**
     * The token row of an AI connection when this request came with one (after `user()` / `session()`), else null –
     * for the change log, and for the routes a token may not use (`refuseToken`)
     * @return array<string, mixed>|null
     */
    public static function token(): ?array
    {
        return self::$token;
    }

    /** 403 `not-for-ai` when this request came with an AI connection's token (call after `Auth::user()`) */
    public static function refuseToken(string $what): void
    {
        if (self::$token !== null) {
            throw new ApiError(403, 'not-for-ai', "$what is not for an AI connection – the person does it in the editor.");
        }
    }

    /**
     * The user and the session row (null for an AI connection's token), else 401. Sessions end after SESSION_TTL_DAYS
     * without use. A Bearer token wins over the cookie and needs no CSRF token (no browser sends it by itself); the cookie
     * is looked up among the sessions only – an AI connection's token is never a cookie – and its writes need the CSRF
     * token (`checkCsrf`).
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    private static function signedIn(): array
    {
        $token = Http::bearerToken();
        if ($token !== null) {
            if (ApiTokens::isToken($token)) {
                [$user, self::$token] = ApiTokens::authenticate($token);
                return [$user, null];
            }
            return self::sessionOf($token, false);
        }
        $cookie = Http::cookie(self::COOKIE);
        if ($cookie === null) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        try {
            [$user, $session] = self::sessionOf($cookie, true);
        } catch (ApiError $error) {
            if ($error->status === 401) self::clearCookie(); // a cookie of a session that is gone: the browser forgets it
            throw $error;
        }
        self::$cookieSession = $session;
        self::checkCsrf($session);
        return [$user, $session];
    }

    /**
     * The user and the session row of a session token, else 401; `last_used_at` written at most once an hour – and then
     * a cookie's Max-Age renewed, so a session in use keeps its cookie
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private static function sessionOf(string $token, bool $cookie): array
    {
        $session = Db::one('SELECT * FROM sessions WHERE token_hash = :hash', ['hash' => hash('sha256', $token)]);
        if (!$session) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        if ($session['last_used_at'] < Db::now(-86400 * Config::int('SESSION_TTL_DAYS'))) {
            Db::run('DELETE FROM sessions WHERE id = :id', ['id' => $session['id']]);
            throw new ApiError(401, 'unauthorized', 'Session expired.');
        }
        if ($session['last_used_at'] < Db::now(-3600)) {
            Db::run('UPDATE sessions SET last_used_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $session['id']]);
            if ($cookie) setcookie(self::COOKIE, $token, self::cookieOptions(86400 * Config::int('SESSION_TTL_DAYS')));
        }
        $user = Db::one('SELECT * FROM users WHERE id = :id', ['id' => $session['user_id']]);
        if (!$user) throw new ApiError(401, 'unauthorized', 'Not signed in.');
        return [Roles::grantConfigured($user), $session];
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
                $options[$key] = false; // opt-in: off unless the reader turned it on
            }
        }
        return $options;
    }

    public static function email(mixed $value): string
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

    public static function secret(): string
    {
        $secret = Config::get('SECRET');
        if (strlen($secret) < 32) throw new RuntimeException('SECRET is missing or shorter than 32 characters');
        return $secret;
    }

    /** 32 random bytes, base64url – sessions, sign-in links, the AI connections' tokens */
    public static function randomToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
