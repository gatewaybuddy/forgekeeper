FROM python:3.11-slim
WORKDIR /app
# System deps for GitPython and runtime tools
RUN apt-get update -y && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Copy python packages needed by the agent runtime
COPY forgekeeper ./forgekeeper
COPY goal_manager ./goal_manager
EXPOSE ${PYTHON_PORT}
CMD ["python", "-m", "forgekeeper.main"]
