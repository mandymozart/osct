<?php
declare(strict_types=1);

/**
 * Optional password for a user. The first sign-in is always by email (it confirms the address and creates the
 * user); afterwards the user may set a password and sign in with email + password, or keep using the email.
 *
 * Hashes: PHP `password_hash()` with bcrypt (cost 12, salted), upgraded on sign-in when the settings change.
 * bcrypt only reads 72 bytes, so longer passwords are refused instead of silently cut.
 * Failed sign-ins are limited per email address and per IP per hour; an unknown address, a user without a
 * password and a wrong password all get the same answer in about the same time.
 * Changing an existing password needs the current one – unless this device signed in by email in the last
 * PASSWORD_RESET_MINUTES (that is the "forgot password" path: sign in with the email, then set a new one).
 */
final class Passwords
{
    private const OPTIONS = ['cost' => 12];
    private const MAX_BYTES = 72;
    /** A bcrypt hash of a random string: compared against when there is no user, so the answer takes as long */
    private const DUMMY_HASH = '$2y$12$cwg0DnIOyfn8TYV31Lq5Q.PwQTubG4.zjw5IljDStIspGAWR/BQvu';

    /** POST /auth/password { email, password } → 200 { session, user, created: false }; 401 invalid-credentials */
    public static function signIn(array $body): never
    {
        $email = Auth::email($body['email'] ?? null);
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        $ipHash = hash_hmac('sha256', Http::clientIp(), Auth::secret());

        Db::run('DELETE FROM password_attempts WHERE created_at < :before', ['before' => Db::now(-86400)]);
        $hourAgo = Db::now(-3600);
        if ((int) Db::value('SELECT COUNT(*) FROM password_attempts WHERE email = :email AND created_at > :since', ['email' => $email, 'since' => $hourAgo]) >= Config::int('PASSWORD_MAX_FAILS_PER_EMAIL_HOUR')
            || (int) Db::value('SELECT COUNT(*) FROM password_attempts WHERE ip_hash = :ip AND created_at > :since', ['ip' => $ipHash, 'since' => $hourAgo]) >= Config::int('PASSWORD_MAX_FAILS_PER_IP_HOUR')) {
            throw new ApiError(429, 'too-many-password-attempts', 'Too many wrong passwords – try again later or sign in with the email.');
        }

        $user = Db::one('SELECT * FROM users WHERE email = :email', ['email' => $email]);
        $hash = $user['password_hash'] ?? null;
        $valid = password_verify($password, is_string($hash) ? $hash : self::DUMMY_HASH) && is_string($hash);
        if (!$valid) {
            Db::run('INSERT INTO password_attempts (id, email, ip_hash, created_at) VALUES (:id, :email, :ip, :now)',
                ['id' => Db::uuid(), 'email' => $email, 'ip' => $ipHash, 'now' => Db::now()]);
            throw new ApiError(401, 'invalid-credentials', 'Email or password is not right.');
        }

        if (password_needs_rehash($hash, PASSWORD_BCRYPT, self::OPTIONS)) {
            Db::run('UPDATE users SET password_hash = :hash WHERE id = :id', ['hash' => self::hash($password), 'id' => $user['id']]);
        }
        Db::run('DELETE FROM password_attempts WHERE email = :email', ['email' => $email]);
        $session = Auth::createSession($user['id'], 'password');
        Http::json(200, ['session' => $session, 'user' => Users::toJson($user), 'created' => false]);
    }

    /** PUT /user/password { password, currentPassword? } → { user } */
    public static function set(array $body): never
    {
        [$user, $session] = Auth::session();
        $password = $body['password'] ?? null;
        if (!is_string($password) || mb_strlen($password) < Config::int('PASSWORD_MIN_LENGTH')) {
            throw new ApiError(400, 'password-too-short', 'The password is too short.');
        }
        if (strlen($password) > self::MAX_BYTES) throw new ApiError(400, 'password-too-long', 'The password is too long.');

        if ($user['password_hash'] !== null && !self::signedInByEmailRecently($session)) {
            $current = $body['currentPassword'] ?? null;
            if (!is_string($current) || $current === '') {
                throw new ApiError(403, 'current-password-required', 'Enter the current password.');
            }
            if (!password_verify($current, $user['password_hash'])) {
                throw new ApiError(403, 'wrong-current-password', 'The current password is not right.');
            }
        }

        Db::run('UPDATE users SET password_hash = :hash, updated_at = :now WHERE id = :id',
            ['hash' => self::hash($password), 'now' => Db::now(), 'id' => $user['id']]);
        Http::json(200, ['user' => Users::toJson(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $user['id']]))]);
    }

    /** DELETE /user/password → { user } (sign-in by email only again) */
    public static function remove(): never
    {
        $user = Auth::user();
        Db::run('UPDATE users SET password_hash = NULL, updated_at = :now WHERE id = :id', ['now' => Db::now(), 'id' => $user['id']]);
        Http::json(200, ['user' => Users::toJson(Db::one('SELECT * FROM users WHERE id = :id', ['id' => $user['id']]))]);
    }

    /** @param array<string, mixed> $session */
    public static function signedInByEmailRecently(array $session): bool
    {
        return ($session['method'] ?? 'email') === 'email'
            && $session['created_at'] >= Db::now(-60 * Config::int('PASSWORD_RESET_MINUTES'));
    }

    private static function hash(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, self::OPTIONS);
    }
}
