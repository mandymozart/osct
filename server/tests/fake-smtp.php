<?php
// Test helper: a plain SMTP server for one connection (no TLS, accepts any AUTH), writes the received
// message to the file given as second argument. Usage: php fake-smtp.php <port> <out-file>
declare(strict_types=1);

[$_, $port, $out] = $argv;
$server = stream_socket_server("tcp://127.0.0.1:$port", $errno, $errstr);
if (!$server) { fwrite(STDERR, "$errstr\n"); exit(1); }
file_put_contents("$out.ready", '1');

$client = stream_socket_accept($server, 30);
if (!$client) exit(1);
$say = fn(string $line) => fwrite($client, "$line\r\n");
$say('220 fake ESMTP');
$log = [];
while (($line = fgets($client)) !== false) {
    $line = rtrim($line, "\r\n");
    $log[] = $line;
    $verb = strtoupper(explode(' ', $line)[0]);
    if ($verb === 'EHLO') { fwrite($client, "250-fake\r\n250 AUTH LOGIN\r\n"); }
    elseif ($verb === 'AUTH') { $say('334 VXNlcm5hbWU6'); $log[] = rtrim((string) fgets($client)); $say('334 UGFzc3dvcmQ6'); fgets($client); $say('235 ok'); }
    elseif ($verb === 'MAIL' || $verb === 'RCPT') { $say('250 ok'); }
    elseif ($verb === 'DATA') {
        $say('354 go on');
        $data = '';
        while (($row = fgets($client)) !== false && rtrim($row, "\r\n") !== '.') $data .= $row;
        $log[] = "--DATA--\n" . $data;
        $say('250 queued');
    }
    elseif ($verb === 'QUIT') { $say('221 bye'); break; }
    else { $say('502 unknown'); }
}
file_put_contents($out, implode("\n", $log));
