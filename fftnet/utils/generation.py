import torch


def generate(model, tokenizer, input_ids, max_tokens=1, mode="greedy", top_k=5):
    """Generate tokens autoregressively using greedy or top-k sampling."""
    device = next(model.parameters()).device
    input_ids = input_ids.to(device)

    for _ in range(max_tokens):
        with torch.no_grad():
            logits = model(input_ids).logits
        last_logits = logits[:, -1, :]

        if mode == "greedy":
            next_token = torch.argmax(last_logits, dim=-1, keepdim=True)
        elif mode == "top_k":
            values, indices = torch.topk(last_logits, top_k, dim=-1)
            probs = torch.softmax(values, dim=-1)
            choice = torch.multinomial(probs, num_samples=1)
            next_token = indices.gather(-1, choice)
        else:
            raise ValueError("mode must be 'greedy' or 'top_k'")

        input_ids = torch.cat((input_ids, next_token), dim=-1)

    return tokenizer.decode(input_ids[0], skip_special_tokens=True)

