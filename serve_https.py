import http.server
import ssl
import netifaces
from pathlib import Path

public_dir = Path("/public").resolve()

handler = http.server.SimpleHTTPRequestHandler
handler.directory = str(public_dir)

server_address = ('0.0.0.0', 8443)

httpd = http.server.HTTPServer(server_address, handler)

context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")

httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

def get_network_ip():
    gateways = netifaces.gateways()
    gateway = gateways.get('default', {}).get(netifaces.AF_INET, None)
    
    if gateway:
        interface = gateway[1]
        ip_info = netifaces.ifaddresses(interface).get(netifaces.AF_INET, [{}])[0]
        return ip_info.get('addr', 'Not found')
    return 'Not found'

network_ip = get_network_ip()

# Log the server and IP address
frame_top_bottom = "+" + "-" * 50 + "+"
frame_content = "| {:<48} |"

# Print the ASCII framed output
print(frame_top_bottom)
print(frame_content.format("Development server running at"))
print(frame_top_bottom)
print(frame_content.format(f"Local:   https://localhost:{server_address[1]}/"))
print(frame_content.format(f"Network: https://{network_ip}:{server_address[1]}/"))
print(frame_top_bottom)

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print ("Shutting down server ...")