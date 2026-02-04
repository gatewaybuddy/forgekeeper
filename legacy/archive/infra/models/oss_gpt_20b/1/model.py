import numpy as np
import triton_python_backend_utils as pb_utils


class TritonPythonModel:
    def initialize(self, args):
        # In a real model, load weights or connect to inference runtime here.
        self.ready = True

    def execute(self, requests):
        responses = []
        for request in requests:
            in_tensor = pb_utils.get_input_tensor_by_name(request, "PROMPT")
            if in_tensor is None:
                out_np = np.array([b"ERROR: missing PROMPT"], dtype=object)
            else:
                data = in_tensor.as_numpy()
                try:
                    # Support [B] or [B, N] string/bytes inputs; take first token
                    elem = data[0][0] if getattr(data, 'ndim', 1) >= 2 else data[0]
                    if isinstance(elem, (bytes, bytearray)):
                        prompt = elem.decode("utf-8", errors="ignore")
                    else:
                        prompt = str(elem)
                except Exception:
                    prompt = ""
                # Placeholder response: say hello if asked, else echo
                text = "hello" if "hello" in prompt.lower() else f"echo: {prompt}"
                out_np = np.array([text.encode("utf-8")], dtype=object)

            out_tensor = pb_utils.Tensor("TEXT", out_np)
            responses.append(pb_utils.InferenceResponse(output_tensors=[out_tensor]))

        return responses

    def finalize(self):
        pass
