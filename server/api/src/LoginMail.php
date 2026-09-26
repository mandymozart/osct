<?php
declare(strict_types=1);

/**
 * The confirmation email: a link (opens the app, which signs in) and a 6-digit code (typed into the app –
 * needed where the link opens another browser than the app, e.g. the iOS home-screen app).
 * A new account also lists what the reader signed up for (double opt-in for the updates).
 * Informal in every language, like the app (RULES #20). Placeholder texts until the final wording.
 */
final class LoginMail
{
    private const TEXTS = [
        'en' => [
            'subject' => '{code} is your code for {book}',
            'intro' => 'Confirm your email address to sign in to the {book} app.',
            'button' => 'Confirm and sign in',
            'code' => 'Or enter this code in the app:',
            'chosen' => 'You signed up for:',
            'saveProgress' => 'Saving your progress',
            'bookUpdates' => 'Updates on {book}',
            'publisherUpdates' => 'Updates from Building Fictions',
            'changeLater' => 'You can change this at any time in the app (Info → Account).',
            'validity' => 'The link and the code work for {minutes} minutes.',
            'ignore' => 'You didn\'t ask for this? Just ignore this email – nothing happens without your confirmation.',
        ],
        'fr' => [
            'subject' => '{code} est ton code pour {book}',
            'intro' => 'Confirme ton adresse e-mail pour te connecter à l\'application {book}.',
            'button' => 'Confirmer et se connecter',
            'code' => 'Ou saisis ce code dans l\'application :',
            'chosen' => 'Tu t\'es inscrit·e pour :',
            'saveProgress' => 'Sauvegarder ta progression',
            'bookUpdates' => 'Des nouvelles de {book}',
            'publisherUpdates' => 'Des nouvelles de Building Fictions',
            'changeLater' => 'Tu peux modifier ces choix à tout moment dans l\'application (Info → Compte).',
            'validity' => 'Le lien et le code sont valables {minutes} minutes.',
            'ignore' => 'Tu n\'as rien demandé ? Ignore simplement cet e-mail – rien ne se passe sans ta confirmation.',
        ],
        'nl' => [
            'subject' => '{code} is je code voor {book}',
            'intro' => 'Bevestig je e-mailadres om in te loggen in de {book}-app.',
            'button' => 'Bevestigen en inloggen',
            'code' => 'Of vul deze code in de app in:',
            'chosen' => 'Je hebt je aangemeld voor:',
            'saveProgress' => 'Je voortgang opslaan',
            'bookUpdates' => 'Nieuws over {book}',
            'publisherUpdates' => 'Nieuws van Building Fictions',
            'changeLater' => 'Je kunt dit altijd aanpassen in de app (Info → Account).',
            'validity' => 'De link en de code zijn {minutes} minuten geldig.',
            'ignore' => 'Heb je hier niet om gevraagd? Negeer deze e-mail dan gewoon – zonder je bevestiging gebeurt er niets.',
        ],
        'de' => [
            'subject' => '{code} ist dein Code für {book}',
            'intro' => 'Bestätige deine E-Mail-Adresse, um dich in der {book}-App anzumelden.',
            'button' => 'Bestätigen und anmelden',
            'code' => 'Oder gib diesen Code in der App ein:',
            'chosen' => 'Du hast dich angemeldet für:',
            'saveProgress' => 'Deinen Fortschritt speichern',
            'bookUpdates' => 'Neuigkeiten zu {book}',
            'publisherUpdates' => 'Neuigkeiten von Building Fictions',
            'changeLater' => 'Du kannst das jederzeit in der App ändern (Info → Konto).',
            'validity' => 'Link und Code gelten {minutes} Minuten.',
            'ignore' => 'Du hast das nicht angefordert? Dann ignoriere diese E-Mail einfach – ohne deine Bestätigung passiert nichts.',
        ],
    ];

    public const BOOK = 'Onion Skin & Crocodile Tears';

    public static function isLanguage(string $language): bool
    {
        return isset(self::TEXTS[$language]);
    }

    /**
     * @param array<string, bool>|null $options the new account's choices; null = existing account
     * @return array{subject: string, text: string, html: string}
     */
    public static function compose(string $language, string $link, string $code, ?array $options): array
    {
        $texts = self::TEXTS[$language] ?? self::TEXTS['en'];
        $vars = ['{book}' => self::BOOK, '{code}' => $code, '{minutes}' => (string) Config::int('LOGIN_TTL_MINUTES')];
        $t = fn(string $key) => strtr($texts[$key], $vars);
        $e = fn(string $value) => htmlspecialchars($value, ENT_QUOTES, 'UTF-8');

        $chosen = [];
        foreach (['saveProgress', 'bookUpdates', 'publisherUpdates'] as $option) {
            if ($options[$option] ?? false) $chosen[] = $t($option);
        }

        $text = $t('intro') . "\n\n" . $link . "\n\n" . $t('code') . "\n\n    " . $code . "\n\n";
        if ($chosen) $text .= $t('chosen') . "\n- " . implode("\n- ", $chosen) . "\n" . $t('changeLater') . "\n\n";
        $text .= $t('validity') . "\n" . $t('ignore') . "\n\n– " . self::BOOK . "\n";

        $list = $chosen ? '<p style="margin:24px 0 4px">' . $e($t('chosen')) . '</p><ul style="margin:0 0 4px;padding-left:20px">'
            . implode('', array_map(fn($item) => '<li>' . $e($item) . '</li>', $chosen)) . '</ul>'
            . '<p style="margin:0;color:#8b8d8c;font-size:13px">' . $e($t('changeLater')) . '</p>' : '';
        $html = '<!doctype html><html lang="' . $e($language) . '"><body style="margin:0;padding:24px;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4">'
            . '<div style="max-width:480px;margin:0 auto">'
            . '<p style="margin:0 0 20px;color:#d2ae5a;font-size:18px">' . $e(self::BOOK) . '</p>'
            . '<p style="margin:0 0 20px">' . $e($t('intro')) . '</p>'
            . '<p style="margin:0 0 24px"><a href="' . $e($link) . '" style="display:inline-block;padding:10px 20px;border:1px solid #d2ae5a;border-radius:999px;color:#f3cc94;text-decoration:none">' . $e($t('button')) . '</a></p>'
            . '<p style="margin:0 0 8px">' . $e($t('code')) . '</p>'
            . '<p style="margin:0;font-size:28px;letter-spacing:6px;color:#f5e7c8;font-family:Menlo,Consolas,monospace">' . $e($code) . '</p>'
            . $list
            . '<p style="margin:24px 0 0;color:#8b8d8c;font-size:13px">' . $e($t('validity')) . '<br>' . $e($t('ignore')) . '</p>'
            . '</div></body></html>';

        return ['subject' => $t('subject'), 'text' => $text, 'html' => $html];
    }
}
