# Forgekeeper

Forgekeeper is a self-evolving agent framework that combines a Python backend with a React frontend.
This repository includes all components required to run the local development environment.

## Installation

### Backend (Python)
1. Create a virtual environment (optional):
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy the sample environment file and adjust values as needed:
   ```bash
   cp .env.example .env
   ```

### Frontend (React)
1. Install Node dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Running

### Start the backend
```bash
python -m forgekeeper.main
```

### Start the frontend
```bash
npm run dev --prefix frontend
```

## Testing
Run the Python test suite with:
```bash
pytest
```

---
This guide is intended to streamline installation and clarify component interactions.
