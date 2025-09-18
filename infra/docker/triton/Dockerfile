FROM nvcr.io/nvidia/tritonserver:24.05-py3

# Copy model repository (mounted in compose for dev; COPY for image builds)
ARG MODEL_DIR=/models
COPY ./models ${MODEL_DIR}

ENV TRITONSERVER_MODEL_REPOSITORY=${MODEL_DIR}
CMD ["tritonserver", "--model-repository=/models", "--exit-on-error=false", "--strict-readiness=false"]

