from flask import Flask, request, jsonify
from forgekeeper.app.services.llm_service_llamacpp import ask_llm
from dotenv import load_dotenv
import os
os.environ['FLASK_RUN_FROM_CLI'] = 'false'

# Load environment variables
load_dotenv()
port = int(os.getenv("PORT", 5000))  # fallback to 5000 if not set

app = Flask(__name__)
app.run(debug=True, port=port, use_reloader=False)
@app.route('/api/llm', methods=['POST'])
def llm_query():
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')

        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400

        response = ask_llm(prompt)
        return jsonify({'response': response})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"ForgeKeeper (llama-cpp) running on http://localhost:{port}/api/llm")
    app.run(debug=True, port=port)
