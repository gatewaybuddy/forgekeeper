# Forgekeeper

Forgekeeper consists of a Python backend, a React frontend, and optional Python model utilities.
This guide explains how to install and run each component.

## 1. Backend (Flask + GraphQL)

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows use .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Copy the example environment file and adjust settings:
   ```bash
   cp .env.example .env
   ```
   Set `LLM_API_URL` to your language model endpoint and `MQTT_BROKER` if it is not `localhost`.
3. Ensure an MQTT broker (e.g. [Mosquitto](https://mosquitto.org/)) is running on the configured host.
4. Start the GraphQL server:
   ```bash
   python forgekeeper/app/graphql_app.py
   ```
5. In a separate terminal, start the MQTT listener that will forward tasks to your model or other services:
   ```bash
   python mqtt_forgekeeper_listener.py
   ```

## 2. Frontend (React + Vite)

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The Vite configuration proxies requests to `/graphql` to the backend on `localhost:5000`.

## 3. Python Model Utilities (optional)

To experiment with the example FFT-based model utilities:

1. Install the additional requirements:
   ```bash
   pip install -r requirements-model.txt
   ```
2. Run the simple inference script:
   ```bash
   python scripts/fftnet_infer.py --model <model-name> --prompt "Hello"
   ```

## Notes

- Environment variables can be set in the `.env` file or through your shell.
- The frontend expects the backend to be available at `http://localhost:5000/graphql` during development.
- The `MQTT_BROKER` host can be customised without modifying source code.
