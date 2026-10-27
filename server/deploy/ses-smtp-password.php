<?php
/**
 * Turns an AWS IAM secret access key into the SMTP password for Amazon SES (docs/deploy.md "Mail"). SES does not
 * accept the secret key itself: the SMTP password is a signature derived from it per region (AWS, "Obtaining
 * Amazon SES SMTP credentials by converting existing AWS credentials"). The SMTP user name is the access key ID.
 * Use it when the colleague hands over an IAM access key instead of ready SMTP credentials from the SES console.
 *
 *   php server/deploy/ses-smtp-password.php                 reads the secret key from the prompt (not in the shell history)
 *   php server/deploy/ses-smtp-password.php eu-west-1       the region, default eu-west-1 (the SES endpoint used)
 *   AWS_SECRET_ACCESS_KEY=… php server/deploy/ses-smtp-password.php
 *
 * Prints the SMTP password; it goes into the GitHub environment secret SMTP_PASS.
 */
declare(strict_types=1);

$region = $argv[1] ?? 'eu-west-1';
$secret = getenv('AWS_SECRET_ACCESS_KEY') ?: '';
if ($secret === '') {
    fwrite(STDERR, "IAM secret access key: ");
    $secret = trim((string) fgets(STDIN));
}
if ($secret === '') {
    fwrite(STDERR, "osct: no secret key given\n");
    exit(1);
}

// AWS signature version 4 key derivation with the fixed date 11111111 and the message SendRawEmail
$key = hash_hmac('sha256', '11111111', 'AWS4' . $secret, true);
$key = hash_hmac('sha256', $region, $key, true);
$key = hash_hmac('sha256', 'ses', $key, true);
$key = hash_hmac('sha256', 'aws4_request', $key, true);
$signature = hash_hmac('sha256', 'SendRawEmail', $key, true);
// Version byte 0x04 in front, base64 – the password SES expects
echo base64_encode("\x04" . $signature) . "\n";
