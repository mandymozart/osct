import http.server
import ssl
from pathlib import Path

public_dir = Path("/public").resolve()

handler = http.server.SimpleHTTPRequestHandler
handler.directory = str(public_dir)

server_address = ('localhost', 8443)

httpd = http.server.HTTPServer(server_address, handler)

context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")

httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on {server_address[0]} port {server_address[1]} (https://{server_address[0]}:{server_address[1]}/)")
httpd.serve_forever()
