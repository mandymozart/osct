import http.server
import ssl
import netifaces
import qrcode
from qrcode.image.svg import SvgImage
from pathlib import Path

# Define public directory
script_root = Path(__file__).parent.resolve()
public_dir = script_root / "public"
public_dir.mkdir(parents=True, exist_ok=True)

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
server_url = f"https://{network_ip}:{server_address[1]}/"
server_stage_url = "https://osct.netlify.app/"

# Generate and save QR code for each HTML file in the root directory
for html_file in script_root.glob("*.html"):
    file_url = f"{server_url}{html_file.name}"
    qr = qrcode.make(file_url, image_factory=SvgImage)
    qr_path = public_dir / f"{html_file.stem}_qr.svg"
    with open(qr_path, "wb") as f:
        qr.save(f)
    print(f"QR code saved to {qr_path} for {html_file.name}")

# for html_file in script_root.glob("*.html"):
#     file_url = f"{server_stage_url}{html_file.name}"
#     qr = qrcode.make(file_url, image_factory=SvgImage)
#     qr_path = public_dir / f"stage/{html_file.stem}_qr.svg"
#     with open(qr_path, "wb") as f:
#         qr.save(f)
#     print(f"QR code saved to {qr_path} for {html_file.name}")


# Log the server and IP address
frame_top_bottom = "+" + "-" * 50 + "+"
frame_content = "| {:<48} |"

print(frame_top_bottom)
print(frame_content.format("Development server running at"))
print(frame_top_bottom)
print(frame_content.format(f"Local:   https://localhost:{server_address[1]}/"))
print(frame_content.format(f"Network: {server_url}"))
print(frame_top_bottom)

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("Shutting down server ...")
