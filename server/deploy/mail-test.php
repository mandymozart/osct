<?php
/**
 * Sends one test mail through the API's mail settings (MAIL_TRANSPORT, MAIL_FROM, SMTP_*) – the check that the
 * mail account works after a deploy, before a reader tries to sign in. Same settings as the API: OSCT_*
 * environment variables, else api/config.local.php. Prints the transport and the settings (no password), then
 * the SMTP error word for word when sending fails.
 *
 *   php server/deploy/mail-test.php someone@example.com                       locally (config.local.php)
 *   kamal app exec -d production --reuse 'php /opt/osct/mail-test.php someone@example.com'   in the container
 *
 * OSCT_API_DIR points at the api folder when it is not next to this script's parent (the image).
 * Exit 1 when the address is missing or the mail could not be handed over.
 */
declare(strict_types=1);

$to = $argv[1] ?? '';
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "usage: php mail-test.php <recipient address>\n");
    exit(1);
}

$api = getenv('OSCT_API_DIR') ?: dirname(__DIR__) . '/api';
foreach (['Version', 'Config', 'Paths', 'Mailer', 'Smtp'] as $class) {
    require "$api/src/$class.php";
}

$transport = Config::get('MAIL_TRANSPORT');
echo "osct " . Version::APP . " mail test → $to\n";
echo "  MAIL_TRANSPORT=$transport  MAIL_FROM=" . Config::get('MAIL_FROM') . "\n";
if ($transport === 'smtp') {
    echo "  SMTP_HOST=" . Config::get('SMTP_HOST') . ':' . Config::get('SMTP_PORT') . ' (' . Config::get('SMTP_SECURE') . ")  SMTP_USER="
        . Config::get('SMTP_USER') . "  SMTP_PASS=" . (Config::get('SMTP_PASS') === '' ? 'missing' : 'set') . "\n";
} elseif ($transport === 'log') {
    echo "  MAIL_LOG_PATH=" . Paths::mailLog() . "\n";
}

$subject = 'Onion Skin & Crocodile Tears – mail test';
$text = "This is a test mail from the Onion Skin & Crocodile Tears server (version " . Version::APP . ", "
    . gmdate('Y-m-d H:i') . " UTC). The sign-in mails of the app use the same account.\n";
$html = '<p>' . htmlspecialchars(rtrim($text)) . '</p>';
try {
    Mailer::send($to, $subject, $text, $html);
    echo "sent – check the inbox of $to (and its spam folder)\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'osct: sending failed – ' . $error->getMessage() . "\n");
    exit(1);
}
