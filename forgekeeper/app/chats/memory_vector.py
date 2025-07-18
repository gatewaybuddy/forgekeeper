import os
import uuid
import datetime
from typing import List, Optional
import chromadb
import chromadb.utils.embedding_functions as embedding_functions

# Try to import local fallback
try:
    from sentence_transformers import SentenceTransformer
    local_embedder = SentenceTransformer("all-MiniLM-L6-v2")
except ImportError:
    local_embedder = None

CHROMA_DIR = os.getenv("VECTOR_DB_PATH", "./vector_store")
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)

def get_embedding_function():
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return "openai", embedding_functions.OpenAIEmbeddingFunction(
            api_key=openai_key,
            model_name="text-embedding-3-small"
        )
    elif local_embedder:
        return "local", lambda texts: local_embedder.encode(texts).tolist()
    else:
        raise RuntimeError("No embedding backend available")

EMBED_TYPE, embed = get_embedding_function()
COLLECTION_NAME = f"forgekeeper_memory_{EMBED_TYPE}"
collection = chroma_client.get_or_create_collection(COLLECTION_NAME)

def store_memory_entry(session_id: str, role: str, content: str, type: str = "dialogue", tags: Optional[List[str]] = None):
    doc_id = str(uuid.uuid4())
    metadata = {
        "session_id": session_id,
        "role": role,
        "type": type,
        # ChromaDB metadata fields must be simple types; store tags as comma separated string
        "tags": ",".join(tags) if tags else None,
        "timestamp": datetime.datetime.now().isoformat()
    }
    collection.add(
        documents=[content],
        embeddings=embed([content]),
        ids=[doc_id],
        metadatas=[metadata]
    )

# Use only one key in ChromaDB filter at a time, fallback to post-filtering if needed
def retrieve_similar_entries(session_id: str, query: str, top_k: int = 5, types: Optional[List[str]] = None, tags: Optional[List[str]] = None):
    # First query by session_id only (required to avoid multiple operators error)
    results = collection.query(
        query_texts=[query],
        n_results=top_k * 3,  # oversample and filter locally
        where={"session_id": session_id},
        include=["documents", "metadatas"]
    )

    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    items = list(zip(documents, metadatas))

    # Apply type and tag filters in Python
    if types:
        items = [item for item in items if item[1].get("type") in types]
    if tags:
        def tag_match(meta_tags: Optional[str]) -> bool:
            stored_tags = set(meta_tags.split(",")) if meta_tags else set()
            return bool(set(tags).intersection(stored_tags))

        items = [item for item in items if tag_match(item[1].get("tags"))]

    return items[:top_k]
