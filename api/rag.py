import json
import os
import vertexai
from vertexai.preview import reasoning_engines
from http.server import BaseHTTPRequestHandler

PROJECT_ID = "letudiant-data-prod"
REASONING_ENGINE_ID = "7428309353347678208"
LOCATION = "europe-west1"

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Parse request body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        data = json.loads(body)
        
        message = data.get("message", "")
        thread_id = data.get("thread_id", "default")
        
        if not message:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "message required"}).encode())
            return
        
        try:
            # Load credentials from env var
            credentials_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
            if credentials_json:
                import google.oauth2.service_account as sa
                credentials = sa.Credentials.from_service_account_info(
                    json.loads(credentials_json),
                    scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
                vertexai.init(
                    project=PROJECT_ID,
                    location=LOCATION,
                    credentials=credentials
                )
            else:
                vertexai.init(project=PROJECT_ID, location=LOCATION)
            
            engine = reasoning_engines.ReasoningEngine(REASONING_ENGINE_ID)
            response = engine.query(
                config={"thread_id": thread_id},
                message=message
            )
            
            # Extract text from response
            output = str(response)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"result": output}).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
